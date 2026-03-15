function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function routeMapByAlias(routes = []) {
  return new Map(routes.map((route) => [route.alias, route]));
}

function routeFingerprint(route) {
  return JSON.stringify(route);
}

export function createInitModel(config = {}) {
  const baseline = deepClone(config);
  if (!Array.isArray(baseline.routes)) {
    baseline.routes = [];
  }

  const state = deepClone(baseline);
  const originalByAlias = routeMapByAlias(baseline.routes);

  function findIndex(alias) {
    return state.routes.findIndex((route) => route.alias === alias);
  }

  function addRoute(route) {
    if (findIndex(route.alias) >= 0) {
      return { ok: false, code: 'alias_exists', message: `Alias '${route.alias}' already exists.` };
    }
    state.routes.push(deepClone(route));
    return { ok: true };
  }

  function editRoute(alias, patch) {
    const index = findIndex(alias);
    if (index < 0) {
      return { ok: false, code: 'alias_not_found', message: `Alias '${alias}' not found.` };
    }
    const current = state.routes[index];
    const next = { ...current };

    if (patch.alias !== undefined) {
      next.alias = patch.alias;
    }
    if (patch.target !== undefined) {
      next.target = { ...(current.target || {}), ...patch.target };
    }

    const passthroughKeys = ['healthcheck', 'stripPrefix', 'headers', 'showInDashboard'];
    for (const key of passthroughKeys) {
      if (patch[key] !== undefined) {
        next[key] = patch[key];
      }
    }

    state.routes[index] = next;
    return { ok: true };
  }

  function removeRoute(alias) {
    const index = findIndex(alias);
    if (index < 0) {
      return { ok: false, code: 'alias_not_found', message: `Alias '${alias}' not found.` };
    }
    state.routes.splice(index, 1);
    return { ok: true };
  }

  function listRoutes() {
    return deepClone(state.routes);
  }

  function getSummary() {
    const currentByAlias = routeMapByAlias(state.routes);
    let added = 0;
    let removed = 0;
    let updated = 0;

    for (const alias of currentByAlias.keys()) {
      if (!originalByAlias.has(alias)) {
        added += 1;
      }
    }
    for (const alias of originalByAlias.keys()) {
      if (!currentByAlias.has(alias)) {
        removed += 1;
      }
    }
    for (const [alias, currentRoute] of currentByAlias.entries()) {
      if (originalByAlias.has(alias)) {
        const originalRoute = originalByAlias.get(alias);
        if (routeFingerprint(originalRoute) !== routeFingerprint(currentRoute)) {
          updated += 1;
        }
      }
    }

    return {
      added,
      updated,
      removed,
      changed: added > 0 || updated > 0 || removed > 0
    };
  }

  function toConfig() {
    const out = deepClone(state);
    if (!Array.isArray(out.routes)) {
      out.routes = [];
    }
    return out;
  }

  return {
    addRoute,
    editRoute,
    removeRoute,
    listRoutes,
    getSummary,
    toConfig
  };
}

export default { createInitModel };
