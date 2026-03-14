import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HealthChecker } from '../../health/index.js';
import http from 'node:http';

describe('HealthChecker', () => {
  let healthServer;
  let healthPort;
  let healthChecker;

  beforeEach(async () => {
    healthPort = 19800 + Math.floor(Math.random() * 500);
    healthChecker = new HealthChecker({ interval: 1000, timeout: 500 });
  });

  afterEach(async () => {
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
});
