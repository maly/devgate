import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HealthChecker } from '../../health/index.js';
import { createProxy } from '../../proxy/index.js';
import { syncHealthToProxy } from '../../cli/index.js';
import http from 'node:http';

describe('HealthChecker', () => {
  let healthServer;
  let healthPort;
  let healthChecker;
  let proxy;
  let proxyPort;

  const makeRequest = (port, requestPath, hostHeader) => {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost',
        port,
        path: requestPath,
        method: 'GET',
        headers: hostHeader ? { Host: hostHeader } : {}
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      req.on('error', reject);
      req.end();
    });
  };

  beforeEach(async () => {
    healthPort = 19800 + Math.floor(Math.random() * 500);
    proxyPort = 18800 + Math.floor(Math.random() * 500);
    healthChecker = new HealthChecker({ interval: 1000, timeout: 500 });
  });

  afterEach(async () => {
    if (proxy) {
      await proxy.stop();
      proxy = null;
    }
    if (healthChecker) {
      healthChecker.stopAll();
    }
    if (healthServer) {
      await new Promise((resolve) => healthServer.close(resolve));
    }
  });

  it('should report healthy status for successful healthcheck', async () => {
    healthServer = http.createServer((req, res) => {
      res.writeHead(200);
      res.end('OK');
    });

    await new Promise((resolve) => healthServer.listen(healthPort, resolve));

    const routeConfig = {
      alias: 'test-app',
      target: { protocol: 'http', host: 'localhost', port: healthPort },
      healthcheck: '/health'
    };

    healthChecker.startRouteHealthCheck('test-app', routeConfig);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const status = healthChecker.getHealthStatus('test-app');
    expect(status.status).toBe('healthy');
    expect(status.httpStatus).toBe(200);
  });

  it('should report unhealthy status for failed healthcheck', async () => {
    healthServer = http.createServer((req, res) => {
      res.writeHead(500);
      res.end('Error');
    });

    await new Promise((resolve) => healthServer.listen(healthPort, resolve));

    const routeConfig = {
      alias: 'test-app',
      target: { protocol: 'http', host: 'localhost', port: healthPort },
      healthcheck: '/health'
    };

    healthChecker.startRouteHealthCheck('test-app', routeConfig);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const status = healthChecker.getHealthStatus('test-app');
    expect(status.status).toBe('unhealthy');
    expect(status.httpStatus).toBe(500);
  });

  it('should report unhealthy for unreachable server', async () => {
    const routeConfig = {
      alias: 'test-app',
      target: { protocol: 'http', host: 'localhost', port: 59999 },
      healthcheck: '/health'
    };

    healthChecker.startRouteHealthCheck('test-app', routeConfig);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const status = healthChecker.getHealthStatus('test-app');
    expect(status.status).toBe('unhealthy');
    expect(status.errorMessage).toBeDefined();
  });

  it('should not start healthcheck when healthcheck is not configured', () => {
    const routeConfig = {
      alias: 'test-app',
      target: { protocol: 'http', host: 'localhost', port: 3000 }
    };

    healthChecker.startRouteHealthCheck('test-app', routeConfig);

    const status = healthChecker.getHealthStatus('test-app');
    expect(status).toBeNull();
  });

  it('should stop healthcheck when route is removed', async () => {
    healthServer = http.createServer((req, res) => {
      res.writeHead(200);
      res.end('OK');
    });

    await new Promise((resolve) => healthServer.listen(healthPort, resolve));

    const routeConfig = {
      alias: 'test-app',
      target: { protocol: 'http', host: 'localhost', port: healthPort },
      healthcheck: '/health'
    };

    healthChecker.startRouteHealthCheck('test-app', routeConfig);
    await new Promise((resolve) => setTimeout(resolve, 100));
    
    expect(healthChecker.getHealthStatus('test-app')).not.toBeNull();

    healthChecker.stopRouteHealthCheck('test-app');
    
    expect(healthChecker.getHealthStatus('test-app')).toBeNull();
  });

  it('should get all health statuses', async () => {
    healthServer = http.createServer((req, res) => {
      res.writeHead(200);
      res.end('OK');
    });

    await new Promise((resolve) => healthServer.listen(healthPort, resolve));

    const route1 = {
      alias: 'app1',
      target: { protocol: 'http', host: 'localhost', port: healthPort },
      healthcheck: '/health'
    };

    healthChecker.startRouteHealthCheck('app1', route1);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const allStatuses = healthChecker.getAllHealthStatus();
    expect(allStatuses.size).toBe(1);
    expect(allStatuses.get('app1')).toBeDefined();
  });

  it('should update routes and manage healthchecks', async () => {
    healthServer = http.createServer((req, res) => {
      res.writeHead(200);
      res.end('OK');
    });

    await new Promise((resolve) => healthServer.listen(healthPort, resolve));

    const routes = [
      {
        alias: 'app1',
        target: { protocol: 'http', host: 'localhost', port: healthPort },
        healthcheck: '/health'
      }
    ];

    healthChecker.updateRoutes(routes);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const status = healthChecker.getHealthStatus('app1');
    expect(status.status).toBe('healthy');
  });

  it('should support absolute healthcheck URLs', async () => {
    const otherPort = 19900 + Math.floor(Math.random() * 500);
    healthServer = http.createServer((req, res) => {
      res.writeHead(200);
      res.end('OK');
    });

    await new Promise((resolve) => healthServer.listen(otherPort, resolve));

    const routeConfig = {
      alias: 'test-app',
      target: { protocol: 'http', host: 'localhost', port: healthPort },
      healthcheck: `http://localhost:${otherPort}/health`
    };

    healthChecker.startRouteHealthCheck('test-app', routeConfig);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const status = healthChecker.getHealthStatus('test-app');
    expect(status.status).toBe('healthy');

    await new Promise((resolve) => healthServer.close(resolve));
  });

  it('updates dashboard health snapshot when health status changes', async () => {
    healthServer = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200);
        res.end('OK');
        return;
      }
      res.writeHead(200);
      res.end('service');
    });

    await new Promise((resolve) => healthServer.listen(healthPort, resolve));

    const runtimeConfig = {
      routes: [
        {
          alias: 'api',
          target: { protocol: 'http', host: 'localhost', port: healthPort },
          healthcheck: '/health'
        }
      ]
    };
    const hostnames = {
      dashboard: { hostname: 'dev.192-168-1-1.sslip.io' },
      routes: [{ alias: 'api', hostname: 'api.192-168-1-1.sslip.io' }]
    };

    proxy = createProxy({
      routes: {
        [hostnames.dashboard.hostname]: {
          isDashboard: true,
          getDashboardData: () => ({ runtimeState: proxy.getRuntimeState() })
        }
      },
      port: proxyPort,
      defaultPort: null
    });
    proxy.setRuntimeState({ ready: false });
    proxy.setRoutesState([
      {
        alias: 'api',
        target: `http://localhost:${healthPort}`,
        url: `https://${hostnames.routes[0].hostname}`,
        health: 'unknown'
      }
    ]);

    await proxy.start();

    const response1 = await makeRequest(proxyPort, '/', hostnames.dashboard.hostname);
    expect(response1.body).toContain('unknown');
    expect(response1.body).toContain('Ready');
    expect(response1.body).toContain('false');

    healthChecker.updateRoutes(runtimeConfig.routes);
    await new Promise((resolve) => setTimeout(resolve, 150));
    syncHealthToProxy(proxy, healthChecker, runtimeConfig, hostnames);
    proxy.setRuntimeState({ ready: true });

    const response2 = await makeRequest(proxyPort, '/', hostnames.dashboard.hostname);
    expect(response2.body).toContain('healthy');
    expect(response2.body).toContain('Ready');
    expect(response2.body).toContain('true');
  });
});
