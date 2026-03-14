import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createProxy } from '../../proxy/index.js';
import { startApp, stopApp, createApp } from '../../fixtures/app.js';
import { startApi, stopApi, createApi } from '../../fixtures/api.js';
import { startAdmin, stopAdmin, createAdmin } from '../../fixtures/admin.js';
import { findFreePort, ensurePortFree } from '../utils/port-utils.js';
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

describe('E2E Full Proxy', () => {
  let proxy;
  let app, api, admin;
  let proxyPort;

  beforeEach(async () => {
    proxyPort = await findFreePort(18300, 500);
    app = await startApp();
    api = await startApi();
    admin = await startAdmin();
  });

  afterEach(async () => {
    if (proxy) {
      await proxy.stop();
    }
    if (app) {
      await stopApp(app.server, app.wss);
    }
    if (api) {
      await stopApi(api.server, api.wss);
    }
    if (admin) {
      await stopAdmin(admin.server, admin.wss);
    }
  });

  it('should proxy to app fixture returning text', async () => {
    proxy = createProxy({
      routes: {
        'app.192-168-1-1.sslip.io': {
          target: 'http://localhost:10001'
        }
      },
      port: proxyPort,
      defaultPort: null
    });

    await proxy.start();

    const response = await makeRequest(proxyPort, '/', 'app.192-168-1-1.sslip.io');

    expect(response.status).toBe(200);
    expect(response.body).toBe('Hello from app');
  });

  it('should proxy to api fixture returning JSON', async () => {
    proxy = createProxy({
      routes: {
        'api.192-168-1-1.sslip.io': {
          target: 'http://localhost:10002'
        }
      },
      port: proxyPort,
      defaultPort: null
    });

    await proxy.start();

    const response = await makeRequest(proxyPort, '/', 'api.192-168-1-1.sslip.io');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(JSON.parse(response.body)).toEqual({ service: 'api', ok: true });
  });

  it('should proxy to admin fixture returning HTML', async () => {
    proxy = createProxy({
      routes: {
        'admin.192-168-1-1.sslip.io': {
          target: 'http://localhost:10003'
        }
      },
      port: proxyPort,
      defaultPort: null
    });

    await proxy.start();

    const response = await makeRequest(proxyPort, '/', 'admin.192-168-1-1.sslip.io');

    expect(response.status).toBe(200);
    expect(response.body).toBe('Hello from admin');
  });

  it('should handle multiple routes simultaneously', async () => {
    proxy = createProxy({
      routes: {
        'app.192-168-1-1.sslip.io': {
          target: 'http://localhost:10001'
        },
        'api.192-168-1-1.sslip.io': {
          target: 'http://localhost:10002'
        },
        'admin.192-168-1-1.sslip.io': {
          target: 'http://localhost:10003'
        }
      },
      port: proxyPort,
      defaultPort: null
    });

    await proxy.start();

    const appResponse = await makeRequest(proxyPort, '/', 'app.192-168-1-1.sslip.io');
    expect(appResponse.status).toBe(200);
    expect(appResponse.body).toBe('Hello from app');

    const apiResponse = await makeRequest(proxyPort, '/', 'api.192-168-1-1.sslip.io');
    expect(apiResponse.status).toBe(200);
    expect(JSON.parse(apiResponse.body)).toEqual({ service: 'api', ok: true });

    const adminResponse = await makeRequest(proxyPort, '/', 'admin.192-168-1-1.sslip.io');
    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body).toBe('Hello from admin');
  });

  it('should proxy WebSocket to app fixture', async () => {
    const { WebSocket } = await import('ws');

    proxy = createProxy({
      routes: {
        'app.192-168-1-1.sslip.io': {
          target: 'http://localhost:10001'
        }
      },
      port: proxyPort,
      defaultPort: null
    });

    await proxy.start();

    const ws = new WebSocket(`ws://localhost:${proxyPort}/ws`, {
      headers: { Host: 'app.192-168-1-1.sslip.io' }
    });

    const message = await new Promise((resolve) => {
      ws.on('open', () => {
        ws.send('test');
      });
      ws.on('message', (data) => {
        resolve(data.toString());
      });
    });

    expect(message).toBe('hello-from-app-ws');
    ws.close();
  });

  it('should proxy WebSocket to api fixture', async () => {
    const { WebSocket } = await import('ws');

    proxy = createProxy({
      routes: {
        'api.192-168-1-1.sslip.io': {
          target: 'http://localhost:10002'
        }
      },
      port: proxyPort,
      defaultPort: null
    });

    await proxy.start();

    const ws = new WebSocket(`ws://localhost:${proxyPort}/ws`, {
      headers: { Host: 'api.192-168-1-1.sslip.io' }
    });

    const message = await new Promise((resolve) => {
      ws.on('open', () => {
        ws.send('test');
      });
      ws.on('message', (data) => {
        resolve(data.toString());
      });
    });

    expect(message).toBe('hello-from-api-ws');
    ws.close();
  });

  it('should proxy WebSocket to admin fixture', async () => {
    const { WebSocket } = await import('ws');

    proxy = createProxy({
      routes: {
        'admin.192-168-1-1.sslip.io': {
          target: 'http://localhost:10003'
        }
      },
      port: proxyPort,
      defaultPort: null
    });

    await proxy.start();

    const ws = new WebSocket(`ws://localhost:${proxyPort}/ws`, {
      headers: { Host: 'admin.192-168-1-1.sslip.io' }
    });

    const message = await new Promise((resolve) => {
      ws.on('open', () => {
        ws.send('test');
      });
      ws.on('message', (data) => {
        resolve(data.toString());
      });
    });

    expect(message).toBe('hello-from-admin-ws');
    ws.close();
  });
});
