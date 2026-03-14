import fs from 'fs';
import path from 'path';

let yaml = null;

try {
  yaml = require('yaml');
} catch (e) {
  // yaml will remain null if not installed
}

const DEFAULT_CONFIG = {
  httpsPort: 443,
  httpRedirectPort: 80,
  dashboardAlias: 'dev',
  hostnameStrategy: 'sslip',
  preferredIp: null,
  certDir: null,
  dashboardEnabled: true,
  autoOpenBrowser: false,
  routes: []
};

export async function loadConfig(pathOrObject) {
  if (pathOrObject !== null && typeof pathOrObject === 'object') {
    return pathOrObject;
  }

  if (typeof pathOrObject !== 'string') {
    throw new Error('Config must be a file path (string) or an object');
  }

  const filePath = path.resolve(pathOrObject);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Config file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath).toLowerCase();

  try {
    if (ext === '.json') {
      return JSON.parse(content);
    } else if (ext === '.yaml' || ext === '.yml') {
      if (!yaml) {
        throw new Error('YAML support requires the "yaml" package');
      }
      return yaml.parse(content);
    } else {
      try {
        return JSON.parse(content);
      } catch {
        if (!yaml) {
          throw new Error('YAML support requires the "yaml" package');
        }
        return yaml.parse(content);
      }
    }
  } catch (err) {
    if (err.message.includes('YAML support requires')) {
      throw err;
    }
    throw new Error(`Failed to parse config file: ${err.message}`);
  }
}

export function validateConfig(config) {
  const errors = [];

  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return { valid: false, errors: ['Config must be an object'] };
  }

  if (config.httpsPort !== undefined) {
    if (typeof config.httpsPort !== 'number' || config.httpsPort < 1 || config.httpsPort > 65535) {
      errors.push('httpsPort must be a number between 1 and 65535');
    }
  }

  if (config.httpRedirectPort !== undefined) {
    if (config.httpRedirectPort !== null && (typeof config.httpRedirectPort !== 'number' || config.httpRedirectPort < 1 || config.httpRedirectPort > 65535)) {
      errors.push('httpRedirectPort must be a number between 1 and 65535, or null');
    }
  }

  if (config.dashboardAlias !== undefined) {
    if (typeof config.dashboardAlias !== 'string' || config.dashboardAlias.length === 0) {
      errors.push('dashboardAlias must be a non-empty string');
    }
  }

  if (config.hostnameStrategy !== undefined) {
    const validStrategies = ['sslip', 'nip', 'custom'];
    if (!validStrategies.includes(config.hostnameStrategy)) {
      errors.push(`hostnameStrategy must be one of: ${validStrategies.join(', ')}`);
    }
  }

  if (config.preferredIp !== undefined && config.preferredIp !== null) {
    if (typeof config.preferredIp !== 'string') {
      errors.push('preferredIp must be a string or null');
    }
  }

  if (config.certDir !== undefined && config.certDir !== null) {
    if (typeof config.certDir !== 'string') {
      errors.push('certDir must be a string or null');
    }
  }

  if (config.dashboardEnabled !== undefined) {
    if (typeof config.dashboardEnabled !== 'boolean') {
      errors.push('dashboardEnabled must be a boolean');
    }
  }

  if (config.autoOpenBrowser !== undefined) {
    if (typeof config.autoOpenBrowser !== 'boolean') {
      errors.push('autoOpenBrowser must be a boolean');
    }
  }

  if (!Array.isArray(config.routes)) {
    errors.push('routes must be an array');
  } else {
    config.routes.forEach((route, index) => {
      const routePrefix = `routes[${index}]`;

      if (!route.alias || typeof route.alias !== 'string') {
        errors.push(`${routePrefix}.alias is required and must be a string`);
      } else if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(route.alias)) {
        errors.push(`${routePrefix}.alias must be DNS-safe`);
      }

      if (!route.target || typeof route.target !== 'object') {
        errors.push(`${routePrefix}.target is required and must be an object`);
      } else {
        const target = route.target;
        if (!target.protocol || !['http', 'https'].includes(target.protocol)) {
          errors.push(`${routePrefix}.target.protocol must be "http" or "https"`);
        }
        if (!target.host || typeof target.host !== 'string') {
          errors.push(`${routePrefix}.target.host is required and must be a string`);
        }
        if (target.port === undefined || typeof target.port !== 'number' || target.port < 1 || target.port > 65535) {
          errors.push(`${routePrefix}.target.port is required and must be a number between 1 and 65535`);
        }
      }

      if (route.healthcheck !== undefined && route.healthcheck !== null) {
        if (typeof route.healthcheck !== 'string') {
          errors.push(`${routePrefix}.healthcheck must be a string or null`);
        }
      }

      if (route.stripPrefix !== undefined && route.stripPrefix !== null) {
        if (typeof route.stripPrefix !== 'string') {
          errors.push(`${routePrefix}.stripPrefix must be a string or null`);
        }
      }

      if (route.headers !== undefined) {
        if (typeof route.headers !== 'object' || route.headers === null || Array.isArray(route.headers)) {
          errors.push(`${routePrefix}.headers must be an object`);
        }
      }

      if (route.showInDashboard !== undefined) {
        if (typeof route.showInDashboard !== 'boolean') {
          errors.push(`${routePrefix}.showInDashboard must be a boolean`);
        }
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

export function resolveRuntimeConfig(config, options = {}) {
  const runtimeConfig = { ...DEFAULT_CONFIG };

  if (config) {
    Object.keys(DEFAULT_CONFIG).forEach(key => {
      if (key === 'routes') {
        runtimeConfig.routes = config.routes || DEFAULT_CONFIG.routes;
      } else if (config[key] !== undefined) {
        runtimeConfig[key] = config[key];
      }
    });
  }

  if (options.httpsPort !== undefined) runtimeConfig.httpsPort = options.httpsPort;
  if (options.httpRedirectPort !== undefined) runtimeConfig.httpRedirectPort = options.httpRedirectPort;
  if (options.dashboardAlias !== undefined) runtimeConfig.dashboardAlias = options.dashboardAlias;
  if (options.hostnameStrategy !== undefined) runtimeConfig.hostnameStrategy = options.hostnameStrategy;
  if (options.preferredIp !== undefined) runtimeConfig.preferredIp = options.preferredIp;
  if (options.certDir !== undefined) runtimeConfig.certDir = options.certDir;
  if (options.dashboardEnabled !== undefined) runtimeConfig.dashboardEnabled = options.dashboardEnabled;
  if (options.autoOpenBrowser !== undefined) runtimeConfig.autoOpenBrowser = options.autoOpenBrowser;

  if (options.routes) {
    const configRoutesMap = new Map((runtimeConfig.routes || []).map(r => [r.alias, r]));
    options.routes.forEach(cliRoute => {
      const existingRoute = configRoutesMap.get(cliRoute.alias);
      if (existingRoute) {
        configRoutesMap.set(cliRoute.alias, { ...existingRoute, ...cliRoute });
      } else {
        configRoutesMap.set(cliRoute.alias, cliRoute);
      }
    });
    runtimeConfig.routes = Array.from(configRoutesMap.values());
  }

  return runtimeConfig;
}

export function getDefaultConfig() {
  return { ...DEFAULT_CONFIG };
}

export default { loadConfig, validateConfig, resolveRuntimeConfig, getDefaultConfig };
