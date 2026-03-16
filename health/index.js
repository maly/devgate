import http from 'node:http';
import https from 'node:https';

/**
 * HealthChecker - Periodically checks upstream health endpoints
 * Does not block main proxy traffic
 */
export class HealthChecker {
  constructor(options = {}) {
    this.interval = options.interval || 30000; // Default 30 seconds
    this.timeout = options.timeout || 5000; // Default 5 second timeout
    this.routes = new Map(); // route alias -> health status
    this._intervals = new Map(); // route alias -> interval ID
  }

  /**
   * Start health checking for a route
   * @param {string} alias - Route alias
   * @param {Object} routeConfig - Route configuration
   */
  startRouteHealthCheck(alias, routeConfig) {
    if (!routeConfig.healthcheck) {
      return;
    }

    // Initialize health status
    this.routes.set(alias, {
      status: 'unknown',
      httpStatus: null,
      lastSuccess: null,
      lastError: null,
      errorMessage: null,
      responseTime: null,
      consecutiveFailures: 0
    });

    // Clear any existing interval
    if (this._intervals.has(alias)) {
      clearInterval(this._intervals.get(alias));
    }

    const checkHealth = () => {
      this._checkHealth(alias, routeConfig);
    };

    // Run immediately
    checkHealth();

    // Then run periodically
    const intervalId = setInterval(checkHealth, this.interval);
    this._intervals.set(alias, intervalId);
  }

  /**
   * Stop health checking for a route
   * @param {string} alias - Route alias
   */
  stopRouteHealthCheck(alias) {
    const intervalId = this._intervals.get(alias);
    if (intervalId) {
      clearInterval(intervalId);
      this._intervals.delete(alias);
    }
    this.routes.delete(alias);
  }

  /**
   * Stop all health checks
   */
  stopAll() {
    for (const [alias] of this._intervals) {
      this.stopRouteHealthCheck(alias);
    }
  }

  /**
   * Perform health check for a single route
   * @param {string} alias - Route alias
   * @param {Object} routeConfig - Route configuration
   */
  _checkHealth(alias, routeConfig) {
    const healthUrl = routeConfig.healthcheck;
    const target = routeConfig.target;

    // Determine URL to check
    let urlToCheck;
    if (healthUrl.startsWith('http://') || healthUrl.startsWith('https://')) {
      urlToCheck = healthUrl;
    } else {
      // Relative to target
      const protocol = target.protocol === 'https' ? 'https:' : 'http:';
      const host = target.host;
      const port = target.port;
      const path = healthUrl.startsWith('/') ? healthUrl : `/${healthUrl}`;
      urlToCheck = `${protocol}//${host}:${port}${path}`;
    }

    const isHttps = urlToCheck.startsWith('https');
    const client = isHttps ? https : http;

    const startTime = Date.now();

    const req = client.get(urlToCheck, { timeout: this.timeout }, (res) => {
      const responseTime = Date.now() - startTime;
      const status = res.statusCode;
      const success = status >= 200 && status < 400;

      const currentStatus = this.routes.get(alias) || {};

      if (success) {
        this.routes.set(alias, {
          ...currentStatus,
          status: 'healthy',
          httpStatus: status,
          lastSuccess: new Date().toISOString(),
          lastError: null,
          errorMessage: null,
          responseTime,
          consecutiveFailures: 0
        });
      } else {
        this.routes.set(alias, {
          ...currentStatus,
          status: 'unhealthy',
          httpStatus: status,
          lastError: new Date().toISOString(),
          errorMessage: `HTTP ${status}`,
          consecutiveFailures: (currentStatus.consecutiveFailures || 0) + 1
        });
      }
    });

    req.on('error', (err) => {
      const currentStatus = this.routes.get(alias) || {};

      this.routes.set(alias, {
        ...currentStatus,
        status: 'unhealthy',
        httpStatus: null,
        lastError: new Date().toISOString(),
        errorMessage: err.message,
        consecutiveFailures: (currentStatus.consecutiveFailures || 0) + 1
      });
    });

    req.on('timeout', () => {
      req.destroy();
      const currentStatus = this.routes.get(alias) || {};

      this.routes.set(alias, {
        ...currentStatus,
        status: 'unhealthy',
        httpStatus: null,
        lastError: new Date().toISOString(),
        errorMessage: 'Request timeout',
        consecutiveFailures: (currentStatus.consecutiveFailures || 0) + 1
      });
    });
  }

  /**
   * Get health status for all routes
   * @returns {Map<string, Object>} Map of route alias to health status
   */
  getAllHealthStatus() {
    return new Map(this.routes);
  }

  /**
   * Get health status for a specific route
   * @param {string} alias - Route alias
   * @returns {Object|null} Health status or null if not tracked
   */
  getHealthStatus(alias) {
    return this.routes.get(alias) || null;
  }

  /**
   * Update routes - stop removed routes, start new ones
   * @param {Array} routes - Array of route configurations
   */
  updateRoutes(routes) {
    const currentAliases = new Set(this.routes.keys());
    const newAliases = new Set(routes.filter(r => r.healthcheck).map(r => r.alias));

    // Stop health checks for removed routes
    for (const alias of currentAliases) {
      if (!newAliases.has(alias)) {
        this.stopRouteHealthCheck(alias);
      }
    }

    // Start health checks for new routes
    for (const route of routes) {
      if (route.healthcheck && !currentAliases.has(route.alias)) {
        this.startRouteHealthCheck(route.alias, route);
      }
    }
  }
}

export default HealthChecker;
