import https from 'node:https';
import http from 'node:http';
import httpProxy from 'http-proxy';
import { readFileSync, watch } from 'node:fs';

const EVENTS = {
  CONFIG_CHANGE: 'config-change',
  ROUTES_CHANGE: 'routes-change'
};

/**
 * @param {Object} options
 * @param {Object} options.ssl
 * @param {Object.<string, Object>} options.routes
 * @param {number} [options.port=443]
 * @param {number} [options.defaultPort=80]
 * @returns {{ start: Function, stop: Function, reload: Function, proxy: Object, isRunning: boolean }}
 */
export function createProxy(options = {}) {
  const { ssl = null, routes = {}, port = 443, defaultPort = 80 } = options;

  const proxy = httpProxy.createProxyServer({
    ssl: ssl ? { cert: ssl.cert, key: ssl.key } : undefined,
    ws: true
  });

  let httpsServer = null;
  let httpServer = null;
  let isRunning = false;
  let configWatcher = null;
  let eventListeners = new Map();

  const handleProxyError = (err, req, res, target) => {
    console.error(`[proxy] Error routing request to ${target}:`, err.message);
    
    if (!res.headersSent) {
      res.writeHead502 = () => {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
      };
    }
    
    if (res.headersSent) {
      res.end();
    } else {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Bad Gateway - Proxy error');
    }
  };

  const getRouteConfig = (host) => {
    if (!host) return null;
    
    const hostname = host.split(':')[0].toLowerCase();
    
    if (routes[hostname]) {
      return routes[hostname];
    }
    
    const parts = hostname.split('.');
    if (parts.length > 2) {
      const wildcardKey = `*.${parts.slice(-2).join('.')}`;
      if (routes[wildcardKey]) {
        return routes[wildcardKey];
      }
    }
    
    return null;
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
      const { renderDashboard } = require('./dashboard/index.js');
      const html = renderDashboard(routeConfig.dashboardConfig, routeConfig.dashboardHostnames);
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

    proxy.on('error', (err) => handleProxyError(err, req, res, target));

    proxy.on('econnreset', (err, req, res, socket) => {
      console.error(`[proxy] Connection reset for ${target}`);
    });

    proxy.web(req, res, proxyOptions, (err) => {
      if (err) {
        handleProxyError(err, req, res, target);
      }
    });
  };

  let start = () => {
    if (isRunning) {
      console.log('[proxy] Server already running');
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
          
          const httpsOptions = { key, cert };
          
          httpsServer = https.createServer(httpsOptions, requestHandler);
          
          httpsServer.on('error', (err) => {
            console.error('[proxy] HTTPS server error:', err.message);
            reject(err);
          });

          httpsServer.listen(port, () => {
            console.log(`[proxy] HTTPS proxy server listening on port ${port}`);
            isRunning = true;
            resolve();
          });
        } else {
          httpServer = http.createServer(requestHandler);
          
          httpServer.on('error', (err) => {
            console.error('[proxy] HTTP server error:', err.message);
            reject(err);
          });

          httpServer.listen(port, () => {
            console.log(`[proxy] HTTP proxy server listening on port ${port}`);
            isRunning = true;
            resolve();
          });
        }

        if (defaultPort && defaultPort !== port) {
          const redirectHandler = (req, res) => {
            const host = req.headers.host;
            const redirectPort = ssl ? port : defaultPort;
            res.writeHead(301, {
              'Location': `https://${host}:${redirectPort}${req.url}`
            });
            res.end();
          };

          httpServer = http.createServer(redirectHandler);
          httpServer.listen(defaultPort, () => {
            console.log(`[proxy] HTTP redirect server listening on port ${defaultPort}`);
          });
        }
      } catch (err) {
        reject(err);
      }
    });
  };

  const stop = () => {
    unwatchConfig();

    return new Promise((resolve) => {
      const serversToStop = [httpsServer, httpServer].filter(Boolean);
      
      if (serversToStop.length === 0) {
        isRunning = false;
        resolve();
        return;
      }

      let closed = 0;
      serversToStop.forEach((server) => {
        server.close(() => {
          closed++;
          if (closed === serversToStop.length) {
            console.log('[proxy] Proxy servers stopped');
            isRunning = false;
            httpsServer = null;
            httpServer = null;
            resolve();
          }
        });
      });
    });
  };

  const reload = (newRoutes) => {
    if (newRoutes) {
      Object.assign(routes, newRoutes);
      console.log('[proxy] Routes reloaded');
      emitEvent(EVENTS.ROUTES_CHANGE, routes);
    }
  };

  const reloadConfig = (newConfig) => {
    if (!newConfig || typeof newConfig !== 'object') {
      console.log('[proxy] Invalid config provided to reload');
      return;
    }

    let routesChanged = false;

    if (newConfig.routes) {
      const oldRouteKeys = new Set(Object.keys(routes));
      const newRouteKeys = new Set(newConfig.routes.map(r => r.alias));

      Object.keys(routes).forEach(key => {
        if (!newRouteKeys.has(key)) {
          delete routes[key];
          routesChanged = true;
        }
      });

      newConfig.routes.forEach(route => {
        const routeKey = route.alias;
        if (!routes[routeKey] || JSON.stringify(routes[routeKey]) !== JSON.stringify(route)) {
          routes[routeKey] = route;
          routesChanged = true;
        }
      });

      if (routesChanged) {
        console.log('[proxy] Routes updated via config reload');
        emitEvent(EVENTS.ROUTES_CHANGE, routes);
      }
    }

    emitEvent(EVENTS.CONFIG_CHANGE, newConfig);
  };

  let configWatchDebounceTimer = null;
  let lastConfigMtime = null;

  const watchConfig = (configPath, onConfigChange) => {
    if (configWatcher) {
      configWatcher.close();
    }

    if (!configPath) {
      return;
    }

    try {
      const stats = readFileSync(configPath, 'utf-8');
      lastConfigMtime = stats ? Date.now() : null;
    } catch (err) {
      console.log(`[proxy] Cannot read initial config for watching: ${err.message}`);
    }

    let debounceTimeout = null;

    configWatcher = watch(configPath, (eventType) => {
      if (eventType !== 'change') {
        return;
      }

      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }

      debounceTimeout = setTimeout(() => {
        console.log('[proxy] Config file changed, triggering reload...');
        if (onConfigChange) {
          onConfigChange(configPath);
        }
      }, 500);
    });

    console.log(`[proxy] Watching config file: ${configPath}`);
  };

  const unwatchConfig = () => {
    if (configWatcher) {
      configWatcher.close();
      configWatcher = null;
      console.log('[proxy] Stopped watching config file');
    }
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

  const emitEvent = (event, data) => {
    if (eventListeners.has(event)) {
      eventListeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (err) {
          console.error(`[proxy] Event callback error for ${event}:`, err.message);
        }
      });
    }
  };

  const onUpgrade = (req, socket, head) => {
    const host = req.headers.host;
    const routeConfig = getRouteConfig(host);

    if (!routeConfig || !routeConfig.target) {
      console.log(`[proxy] WebSocket upgrade denied - no route for host: ${host}`);
      socket.destroy();
      return;
    }

    const target = routeConfig.target;
    const wsProtocol = target.startsWith('https') ? 'wss' : 'ws';
    
    console.log(`[proxy] WebSocket upgrade: ${host} -> ${wsProtocol}://${target.replace(/^https?:\/\//, '')}`);

    // Log WebSocket headers for debugging
    const wsKey = req.headers['sec-websocket-key'];
    const wsVersion = req.headers['sec-websocket-version'];
    const wsProtocolHeader = req.headers['sec-websocket-protocol'];
    console.log(`[proxy] WebSocket headers: version=${wsVersion}, protocol=${wsProtocolHeader || 'none'}`);
    
    const wsProxy = httpProxy.createProxyServer({
      target,
      ws: true
    });

    wsProxy.on('error', (err) => {
      console.error(`[proxy] WebSocket proxy error for ${target}:`, err.message);
      socket.destroy();
    });

    // Handle WebSocket disconnect gracefully
    socket.on('close', () => {
      console.log(`[proxy] WebSocket disconnected: ${host}`);
    });

    socket.on('error', (err) => {
      console.error(`[proxy] WebSocket socket error for ${host}:`, err.message);
    });

    wsProxy.ws(req, socket, head);
  };

  const originalStart = start;
  start = () => {
    return originalStart().then(() => {
      if (httpsServer) {
        httpsServer.on('upgrade', onUpgrade);
      }
      if (httpServer) {
        httpServer.on('upgrade', onUpgrade);
      }
    });
  };

  return {
    start,
    stop,
    reload,
    reloadConfig,
    watchConfig,
    unwatchConfig,
    on,
    off,
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
