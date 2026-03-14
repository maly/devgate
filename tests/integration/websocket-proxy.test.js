import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createProxy } from '../../proxy/index.js';
import http from 'node:http';
import { WebSocketServer } from 'ws';

describe('Proxy WebSocket', () => {
  let proxy;
  let wsServer;
  let wsPort;
  let proxyPort;

  beforeEach(async () => {
    wsPort = 19700 + Math.floor(Math.random() * 500);
    proxyPort = 18400 + Math.floor(Math.random() * 500);

    wsServer = http.createServer();
    const wss = new WebSocketServer({ server: wsServer, path: '/ws' });

    wss.on('connection', (ws) => {
      ws.send('hello-from-ws');
    });

    await new Promise((resolve) => {
      wsServer.listen(wsPort, resolve);
    });
  }, 20000);

  afterEach(async () => {
    if (proxy) {
      await proxy.stop();
    }
    if (wsServer) {
      await new Promise((resolve) => wsServer.close(resolve));
    }
  }, 20000);

  it('should create proxy with websocket support', () => {
    proxy = createProxy({
      routes: {
        'app.test.local': {
          target: `http://localhost:${wsPort}`
        }
      },
      port: proxyPort,
      defaultPort: null
    });

    expect(proxy).toBeDefined();
  });
});
