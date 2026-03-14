import { loadValidateResolveConfig } from '../config/index.js';

export function createReloadCoordinator({
  configPath,
  runtimeOptions = {},
  applyResolvedConfig,
  runtimeState,
  emit
} = {}) {
  if (!configPath) {
    return {
      executeReload: async () => ({ ok: false, skipped: true })
    };
  }

  const executeReload = async () => {
    const result = await loadValidateResolveConfig(configPath, runtimeOptions);
    const timestamp = new Date().toISOString();

    if (!result.ok) {
      const current = runtimeState.getSnapshot();
      const payload = {
        timestamp,
        configPath,
        errorCode: result.error.code,
        errorMessage: result.error.message,
        activeConfigVersion: current.reload.activeConfigVersion
      };

      runtimeState.updateReload({
        lastReloadAt: timestamp,
        lastReloadStatus: 'failed',
        lastReloadError: `${result.error.code}: ${result.error.message}`
      });

      emit('config:reload_failed', payload);
      return { ok: false, payload };
    }

    const routeCount = applyResolvedConfig ? applyResolvedConfig(result.resolved, result.loaded) : 0;
    const current = runtimeState.getSnapshot();
    const nextVersion = (current.reload.activeConfigVersion || 0) + 1;

    runtimeState.updateReload({
      lastReloadAt: timestamp,
      lastReloadStatus: 'success',
      lastReloadError: null,
      activeConfigVersion: nextVersion
    });

    const payload = {
      timestamp,
      configPath,
      activeConfigVersion: nextVersion,
      routeCount
    };

    emit('config:reloaded', payload);
    emit('config-change', result.resolved);

    return { ok: true, payload, resolved: result.resolved, loaded: result.loaded };
  };

  return { executeReload };
}

export default { createReloadCoordinator };
