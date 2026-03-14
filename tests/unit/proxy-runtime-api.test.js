import { describe, it, expect } from 'vitest';
import { createProxy } from '../../proxy/index.js';

describe('proxy runtime API', () => {
  it('returns immutable runtime snapshot via getRuntimeState', () => {
    const proxy = createProxy({ routes: {}, port: 18080, defaultPort: null });

    const snap = proxy.getRuntimeState();
    expect(snap.runtime).toBeDefined();

    const originalPort = proxy.getRuntimeState().runtime.httpsPort;
    snap.runtime.httpsPort = 9999;

    expect(proxy.getRuntimeState().runtime.httpsPort).toBe(originalPort);
  });
});
