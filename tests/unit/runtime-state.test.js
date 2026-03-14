import { describe, it, expect } from 'vitest';
import { createRuntimeState } from '../../proxy/runtime-state.js';

describe('runtime-state', () => {
  it('starts with ready=false and reload status never', () => {
    const state = createRuntimeState({ configPath: './devgate.json' });
    const snap = state.getSnapshot();

    expect(snap.runtime.ready).toBe(false);
    expect(snap.reload.lastReloadStatus).toBe('never');
    expect(snap.runtime.configPath).toBe('./devgate.json');
  });

  it('updates nested sections through explicit update APIs', () => {
    const state = createRuntimeState({ configPath: './devgate.json' });

    state.updateRuntime({ ready: true, httpsPort: 8443 });
    state.updateReload({ lastReloadStatus: 'success', activeConfigVersion: 2 });
    state.updateRoutes([{ alias: 'api', health: 'healthy' }]);
    state.updateHealth({ summary: 'healthy' });
    state.updateCert({ mode: 'mkcert' });

    const snap = state.getSnapshot();
    expect(snap.runtime.ready).toBe(true);
    expect(snap.runtime.httpsPort).toBe(8443);
    expect(snap.reload.lastReloadStatus).toBe('success');
    expect(snap.reload.activeConfigVersion).toBe(2);
    expect(snap.routes).toHaveLength(1);
    expect(snap.health.summary).toBe('healthy');
    expect(snap.cert.mode).toBe('mkcert');
  });

  it('returns immutable snapshots', () => {
    const state = createRuntimeState({ configPath: './devgate.json' });
    const snap = state.getSnapshot();

    snap.runtime.ready = true;

    expect(state.getSnapshot().runtime.ready).toBe(false);
  });
});
