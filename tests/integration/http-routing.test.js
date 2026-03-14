import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createProxy } from '../../proxy/index.js';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const makeRequest = (port, path, hostHeader) => {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port,
      path,
      method: 'GET',
      headers: hostHeader ? { Host: hostHeader } : {}
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, body, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.end();
  });
};

const waitForEvent = (proxy, eventName, timeoutMs = 3000) => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      proxy.off(eventName, handler);
      reject(new Error(`Timeout waiting for ${eventName}`));
    }, timeoutMs);

    const handler = (payload) => {
      clearTimeout(timer);
      proxy.off(eventName, handler);
      resolve(payload);
    };

    proxy.on(eventName, handler);
  });
};

describe('Proxy HTTP Routing', () => {
  let proxy;
  let upstreamServer;
  let upstreamPort;
  let proxyPort;

  beforeEach(async () => {
    upstreamPort = 19500 + Math.floor(Math.random() * 500);
    proxyPort = 18500 + Math.floor(Math.random() * 500);
    
    upstreamServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Upstream response');
    });

    await new Promise((resolve) => {
      upstreamServer.listen(upstreamPort, resolve);
    });
  });

  afterEach(async () => {
    if (proxy) {
      await proxy.stop();
    }
    if (upstreamServer) {
      await new Promise((resolve) => upstreamServer.close(resolve));
    }
  });

  it('should route request to correct upstream based on host header', async () => {
    proxy = createProxy({
      routes: {
        'app.192-168-1-1.sslip.io': {
          target: `http://localhost:${upstreamPort}`
        }
      },
      port: proxyPort,
      defaultPort: null
    });

    await proxy.start();

    const response = await makeRequest(proxyPort, '/', 'app.192-168-1-1.sslip.io');

    expect(response.status).toBe(200);
    expect(response.body).toBe('Upstream response');
  });

  it('should return 404 for unknown host', async () => {
    proxy = createProxy({
      routes: {
        'app.192-168-1-1.sslip.io': {
          target: `http://localhost:${upstreamPort}`
        }
      },
      port: proxyPort,
      defaultPort: null
    });

    await proxy.start();

    const response = await makeRequest(proxyPort, '/', 'unknown.192-168-1-1.sslip.io');

    expect(response.status).toBe(404);
  });

  it('should support wildcard matching', async () => {
    proxy = createProxy({
      routes: {
        '*.sslip.io': {
          target: `http://localhost:${upstreamPort}`
        }
      },
      port: proxyPort,
      defaultPort: null
    });

    await proxy.start();

    const response = await makeRequest(proxyPort, '/', 'any.sslip.io');

    expect(response.status).toBe(200);
  });

  it('should add custom headers to proxied requests', async () => {
    let receivedHeaders = null;
    
    const testPort = 19500 + Math.floor(Math.random() * 500);
    const testServer = http.createServer((req, res) => {
      receivedHeaders = req.headers;
      res.writeHead(200);
      res.end('OK');
    });

    await new Promise((resolve) => testServer.listen(testPort, resolve));

    try {
      proxy = createProxy({
        routes: {
          'app.192-168-1-1.sslip.io': {
            target: `http://localhost:${testPort}`,
            headers: { 'X-Custom-Header': 'custom-value' }
          }
        },
        port: proxyPort,
        defaultPort: null
      });

      await proxy.start();

      await makeRequest(proxyPort, '/', 'app.192-168-1-1.sslip.io');

      expect(receivedHeaders['x-custom-header']).toBe('custom-value');
    } finally {
      await new Promise((resolve) => testServer.close(resolve));
    }
  });

  it('should strip prefix from request URL', async () => {
    let receivedUrl = null;
    
    const testPort = 19500 + Math.floor(Math.random() * 500);
    const testServer = http.createServer((req, res) => {
      receivedUrl = req.url;
      res.writeHead(200);
      res.end('OK');
    });

    await new Promise((resolve) => testServer.listen(testPort, resolve));

    try {
      proxy = createProxy({
        routes: {
          'app.192-168-1-1.sslip.io': {
            target: `http://localhost:${testPort}`,
            stripPrefix: '/api'
          }
        },
        port: proxyPort,
        defaultPort: null
      });

      await proxy.start();

      await makeRequest(proxyPort, '/api/users', 'app.192-168-1-1.sslip.io');

      expect(receivedUrl).toBe('/users');
    } finally {
      await new Promise((resolve) => testServer.close(resolve));
    }
  });

  it('should emit config change events', async () => {
    let eventData = null;
    
    proxy = createProxy({
      routes: {
        'app.192-168-1-1.sslip.io': {
          target: `http://localhost:${upstreamPort}`
        }
      },
      port: proxyPort,
      defaultPort: null
    });

    proxy.on('config-change', (data) => {
      eventData = data;
    });

    await proxy.start();

    proxy.reloadConfig({ routes: [] });

    expect(eventData).not.toBeNull();
  });

  it('applies valid route changes without restart', async () => {
    const configPath = path.join(os.tmpdir(), `devgate-reload-${Date.now()}.json`);
    fs.writeFileSync(configPath, JSON.stringify({ routes: [] }));

    proxy = createProxy({
      routes: {
        'a.192-168-1-1.sslip.io': {
          target: `http://localhost:${upstreamPort}`
        }
      },
      configPath,
      reloadRouteBuilder: (resolved) => {
        const next = {};
        for (const route of resolved.routes || []) {
          next[route.hostname] = {
            target: `${route.target.protocol}://${route.target.host}:${route.target.port}`
          };
        }
        return next;
      },
      port: proxyPort,
      defaultPort: null
    });

    await proxy.start();

    const before = await makeRequest(proxyPort, '/', 'a.192-168-1-1.sslip.io');
    expect(before.status).toBe(200);

    const updated = {
      routes: [
        {
          alias: 'a',
          hostname: 'a.192-168-1-1.sslip.io',
          target: { protocol: 'http', host: 'localhost', port: upstreamPort }
        },
        {
          alias: 'b',
          hostname: 'b.192-168-1-1.sslip.io',
          target: { protocol: 'http', host: 'localhost', port: upstreamPort }
        }
      ]
    };

    const reloadedPromise = waitForEvent(proxy, 'config:reloaded');
    fs.writeFileSync(configPath, JSON.stringify(updated));
    const event = await reloadedPromise;

    expect(event.routeCount).toBe(2);
    expect(event.activeConfigVersion).toBe(1);

    const after = await makeRequest(proxyPort, '/', 'b.192-168-1-1.sslip.io');
    expect(after.status).toBe(200);
  });

  it('keeps last-known-good routes when reload fails', async () => {
    const configPath = path.join(os.tmpdir(), `devgate-reload-fail-${Date.now()}.json`);
    fs.writeFileSync(configPath, JSON.stringify({ routes: [] }));

    proxy = createProxy({
      routes: {
        'a.192-168-1-1.sslip.io': {
          target: `http://localhost:${upstreamPort}`
        }
      },
      configPath,
      reloadRouteBuilder: (resolved) => {
        const next = {};
        for (const route of resolved.routes || []) {
          next[route.hostname] = {
            target: `${route.target.protocol}://${route.target.host}:${route.target.port}`
          };
        }
        return next;
      },
      port: proxyPort,
      defaultPort: null
    });

    await proxy.start();

    const failedPromise = waitForEvent(proxy, 'config:reload_failed');
    fs.writeFileSync(configPath, '{ bad json');
    const event = await failedPromise;

    expect(['parse_error', 'validation_error']).toContain(event.errorCode);

    const stillRoutes = await makeRequest(proxyPort, '/', 'a.192-168-1-1.sslip.io');
    expect(stillRoutes.status).toBe(200);
  });

  it('emits payload contract fields for reload events', async () => {
    const configPath = path.join(os.tmpdir(), `devgate-reload-payload-${Date.now()}.json`);
    fs.writeFileSync(configPath, JSON.stringify({ routes: [] }));

    proxy = createProxy({
      routes: {
        'a.192-168-1-1.sslip.io': {
          target: `http://localhost:${upstreamPort}`
        }
      },
      configPath,
      reloadRouteBuilder: (resolved) => {
        const next = {};
        for (const route of resolved.routes || []) {
          next[route.hostname] = {
            target: `${route.target.protocol}://${route.target.host}:${route.target.port}`
          };
        }
        return next;
      },
      port: proxyPort,
      defaultPort: null
    });

    await proxy.start();

    const reloadedWait = waitForEvent(proxy, 'config:reloaded');
    fs.writeFileSync(configPath, JSON.stringify({
      routes: [{
        alias: 'a',
        hostname: 'a.192-168-1-1.sslip.io',
        target: { protocol: 'http', host: 'localhost', port: upstreamPort }
      }]
    }));
    const ok = await reloadedWait;

    expect(ok).toMatchObject({
      configPath,
      activeConfigVersion: expect.any(Number),
      routeCount: expect.any(Number),
      timestamp: expect.any(String)
    });

    const failedWait = waitForEvent(proxy, 'config:reload_failed');
    fs.writeFileSync(configPath, '{ invalid json');
    const bad = await failedWait;

    expect(bad).toMatchObject({
      configPath,
      errorCode: expect.any(String),
      errorMessage: expect.any(String),
      activeConfigVersion: expect.any(Number),
      timestamp: expect.any(String)
    });
  });
});
