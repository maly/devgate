export function createRuntimeState({ configPath } = {}) {
  const state = {
    runtime: {
      ready: false,
      isRunning: false,
      httpsPort: null,
      httpRedirectPort: null,
      ip: null,
      hostnameStrategy: null,
      configPath: configPath || null
    },
    reload: {
      lastReloadAt: null,
      lastReloadStatus: 'never',
      lastReloadError: null,
      activeConfigVersion: 0
    },
    cert: {
      mode: 'unknown',
      certPath: null,
      keyPath: null,
      expiresAt: null
    },
    routes: [],
    health: {
      updatedAt: null,
      summary: 'unknown'
    }
  };

  return {
    getSnapshot: () => structuredClone(state),
    updateRuntime: (partial = {}) => Object.assign(state.runtime, partial),
    updateReload: (partial = {}) => Object.assign(state.reload, partial),
    updateRoutes: (routes) => {
      state.routes = Array.isArray(routes) ? structuredClone(routes) : [];
    },
    updateHealth: (partial = {}) => Object.assign(state.health, partial),
    updateCert: (partial = {}) => Object.assign(state.cert, partial)
  };
}

export default { createRuntimeState };
