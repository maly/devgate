import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createProxy } from '../../proxy/index.js';
import http from 'node:http';

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
});
