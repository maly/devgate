import https from 'node:https';
import http from 'node:http';
import httpProxy from 'http-proxy';
import { readFileSync } from 'node:fs';
import { renderDashboard } from '../dashboard/index.js';
import { createRuntimeState } from './runtime-state.js';
import { createConfigWatcher } from './config-watcher.js';
import { createReloadCoordinator } from './reload-coordinator.js';

const EVENTS = {
  CONFIG_CHANGE: 'config-change',
  ROUTES_CHANGE: 'routes-change',
  CONFIG_RELOADED: 'config:reloaded',
  CONFIG_RELOAD_FAILED: 'config:reload_failed'
};

function normalizeRouteTarget(route) {
  if (!route || !route.target) {
    return null;
  }

  if (typeof route.target === 'string') {
    return route.target;
  }

  if (typeof route.target === 'object') {
    const { protocol = 'http', host, port } = route.target;
    if (host && port) {
      return `${protocol}://${host}:${port}`;
    }
  }

  return null;
}

function buildRoutesMapFromConfig(resolvedConfig, loadedConfig) {
  const sourceRoutes = (resolvedConfig && Array.isArray(resolvedConfig.routes))
    ? resolvedConfig.routes
    : ((loadedConfig && Array.isArray(loadedConfig.routes)) ? loadedConfig.routes : []);

  const map = {};
  for (const route of sourceRoutes) {
    const key = route.hostname || route.alias;
    const target = normalizeRouteTarget(route);

    if (!key || !target) {
      continue;
    }

    map[key] = {
      target,
      changeOrigin: route.changeOrigin !== false,
      preserveHost: route.preserveHost === true,
      headers: route.headers || {},
      stripPrefix: route.stripPrefix || '',
      timeout: route.timeout || 0,
      secure: route.secure !== false
    };
  }

  return map;
}

function toRoutesSnapshot(routes) {
  return Object.entries(routes).map(([alias, config]) => ({
    alias,
    target: config?.target || null,
    url: config?.url || null,
    health: config?.health || 'unknown'
  }));
}

/**
 * @param {Object} options
 * @returns {{ start: Function, stop: Function, reload: Function, proxy: Object, isRunning: boolean }}
 */
export function createProxy(options = {}) {
  const {
    ssl = null,
    routes = {},
    port = 443,
    defaultPort = 80,
    configPath = null,
    runtimeOptions = {},
    reloadRouteBuilder = null,
    initialRuntimeState = {}
  } = options;

  const proxy = httpProxy.createProxyServer({
    ssl: ssl ? { cert: ssl.cert, key: ssl.key } : undefined,
    ws: true
  });

  let activeRoutes = { ...routes };
  let httpsServer = null;
  let redirectServer = null;
  let isRunning = false;
  let eventListeners = new Map();

  const runtimeState = createRuntimeState({ configPath });
  runtimeState.updateRuntime({
    httpsPort: port,
    httpRedirectPort: defaultPort,
    ...initialRuntimeState
  });
  runtimeState.updateRoutes(toRoutesSnapshot(activeRoutes));

  const emitEvent = (event, data) => {
    if (!eventListeners.has(event)) {
      return;
    }

    eventListeners.get(event).forEach((callback) => {
      try {
        callback(data);
      } catch (err) {
        console.error(`[proxy] Event callback error for ${event}:`, err.message);
      }
    });
  };

  const applyResolvedConfig = (resolvedConfig, loadedConfig) => {
    const nextRoutes = reloadRouteBuilder
      ? reloadRouteBuilder(resolvedConfig, loadedConfig)
      : buildRoutesMapFromConfig(resolvedConfig, loadedConfig);

    activeRoutes = { ...nextRoutes };
    runtimeState.updateRoutes(toRoutesSnapshot(activeRoutes));
    emitEvent(EVENTS.ROUTES_CHANGE, activeRoutes);
    return Object.keys(activeRoutes).length;
  };

  const reloadCoordinator = createReloadCoordinator({
    configPath,
    runtimeOptions,
    applyResolvedConfig,
    runtimeState,
    emit: emitEvent
  });

  const configWatcher = createConfigWatcher({
    configPath,
    debounceMs: 350,
    onChange: async () => {
      const outcome = await reloadCoordinator.executeReload();
      if (!outcome.ok && outcome.payload) {
        console.error(`[proxy] Config reload failed: ${outcome.payload.errorMessage}`);
      }
    }
  });

  const getRouteConfig = (host) => {
    if (!host) return null;

    const hostname = host.split(':')[0].toLowerCase();

    if (activeRoutes[hostname]) {
      return activeRoutes[hostname];
    }

    const parts = hostname.split('.');
    if (parts.length > 2) {
      const wildcardKey = `*.${parts.slice(-2).join('.')}`;
      if (activeRoutes[wildcardKey]) {
        return activeRoutes[wildcardKey];
      }
    }

    return null;
  };

  const handleProxyError = (err, req, res, target) => {
    console.error(`[proxy] Error routing request to ${target}:`, err.message);

    if (res && !res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Bad Gateway - Proxy error');
      return;
    }

    if (res) {
      res.end();
    }
  };

  const requestHandler = (req, res) => {
    const host = req.headers.host;
    const routeConfig = getRouteConfig(host);

    if (!routeConfig) {
      console.error(`[proxy] No route found for host: ${host}`);
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found - No route configured for this host');
      return;
    }

    if (routeConfig.isDashboard) {
      const html = routeConfig.getDashboardData
        ? renderDashboard(routeConfig.getDashboardData())
        : renderDashboard({
            routes: routeConfig.dashboardConfig?.routes || {},
            health: routeConfig.dashboardHealth || {},
            hostname: routeConfig.dashboardHostnames?.dashboard?.hostname || host
          });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    const {
      target,
      changeOrigin = true,
      preserveHost = false,
      headers = {},
      stripPrefix = '',
      timeout = 0,
      secure = true
    } = routeConfig;

    if (!target) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Bad Gateway - Invalid target');
      return;
    }

    const proxyOptions = {
      target,
      changeOrigin,
      preserveHost,
      secure
    };

    if (headers && Object.keys(headers).length > 0) {
      proxyOptions.headers = headers;
    }

    if (stripPrefix && req.url.startsWith(stripPrefix)) {
      req.url = req.url.slice(stripPrefix.length);
      if (req.url === '') req.url = '/';
    }

    if (timeout > 0) {
      proxyOptions.timeout = timeout;
    }

    proxy.web(req, res, proxyOptions, (err) => {
      if (err) {
        handleProxyError(err, req, res, target);
      }
    });
  };

  proxy.on('error', (err, req, res, target) => handleProxyError(err, req, res, target));

  const onUpgrade = (req, socket, head) => {
    const host = req.headers.host;
    const routeConfig = getRouteConfig(host);

    if (!routeConfig || !routeConfig.target) {
      socket.destroy();
      return;
    }

    const wsProxy = httpProxy.createProxyServer({
      target: routeConfig.target,
      ws: true
    });

    wsProxy.on('error', () => {
      wsProxy.close();
      socket.destroy();
    });

    wsProxy.ws(req, socket, head, () => {
      wsProxy.close();
    });
  };

  const start = () => {
    if (isRunning) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      try {
        if (ssl && ssl.key && ssl.cert) {
          let key = ssl.key;
          let cert = ssl.cert;

          if (typeof key === 'string' && !key.includes('-----BEGIN')) {
            key = readFileSync(key);
          }

          if (typeof cert === 'string' && !cert.includes('-----BEGIN')) {
            cert = readFileSync(cert);
          }

          httpsServer = https.createServer({ key, cert }, requestHandler);
        } else {
          httpsServer = http.createServer(requestHandler);
        }

        httpsServer.on('upgrade', onUpgrade);
        httpsServer.on('error', reject);

        const onHttpsListening = () => {
          isRunning = true;
          runtimeState.updateRuntime({ isRunning: true });

          if (configPath) {
            configWatcher.start();
          }

          if (defaultPort && defaultPort !== port) {
            redirectServer = http.createServer((req, res) => {
              const host = req.headers.host;
              const redirectPort = ssl ? port : 443;
              res.writeHead(301, {
                Location: `https://${host}:${redirectPort}${req.url}`
              });
              res.end();
            });

            redirectServer.on('error', (err) => {
              console.error(`[devgate] redirect server failed to bind on port ${defaultPort}:`, err.message);
            });
            redirectServer.listen(defaultPort, () => {
              resolve();
            });
          } else {
            resolve();
          }
        };

        httpsServer.listen(port, onHttpsListening);
      } catch (err) {
        reject(err);
      }
    });
  };

  const stop = () => {
    configWatcher.stop();

    return new Promise((resolve) => {
      const servers = [httpsServer, redirectServer].filter(Boolean);

      if (servers.length === 0) {
        isRunning = false;
        runtimeState.updateRuntime({ isRunning: false });
        resolve();
        return;
      }

      let closed = 0;
      servers.forEach((server) => {
        server.close(() => {
          closed++;
          if (closed === servers.length) {
            isRunning = false;
            runtimeState.updateRuntime({ isRunning: false });
            httpsServer = null;
            redirectServer = null;
            resolve();
          }
        });
      });
    });
  };

  const reload = (newRoutes) => {
    if (!newRoutes || typeof newRoutes !== 'object') {
      return;
    }

    activeRoutes = { ...activeRoutes, ...newRoutes };
    runtimeState.updateRoutes(toRoutesSnapshot(activeRoutes));
    emitEvent(EVENTS.ROUTES_CHANGE, activeRoutes);
  };

  const reloadConfig = (newConfig) => {
    const loadedConfig = { routes: [] };
    if (Array.isArray(newConfig?.routes)) {
      loadedConfig.routes = newConfig.routes;
    }

    applyResolvedConfig(newConfig || {}, loadedConfig);
    emitEvent(EVENTS.CONFIG_CHANGE, newConfig);
  };

  const on = (event, callback) => {
    if (!eventListeners.has(event)) {
      eventListeners.set(event, new Set());
    }
    eventListeners.get(event).add(callback);
  };

  const off = (event, callback) => {
    if (eventListeners.has(event)) {
      eventListeners.get(event).delete(callback);
    }
  };

  return {
    start,
    stop,
    reload,
    reloadConfig,
    watchConfig: () => configWatcher.start(),
    unwatchConfig: () => configWatcher.stop(),
    on,
    off,
    setRuntimeState: (partial) => runtimeState.updateRuntime(partial),
    setHealthState: (partial) => runtimeState.updateHealth(partial),
    setCertState: (partial) => runtimeState.updateCert(partial),
    setRoutesState: (routesSnapshot) => runtimeState.updateRoutes(routesSnapshot),
    getRuntimeState: () => runtimeState.getSnapshot(),
    get proxy() {
      return proxy;
    },
    get isRunning() {
      return isRunning;
    }
  };
}

export { EVENTS };
export default { createProxy };
