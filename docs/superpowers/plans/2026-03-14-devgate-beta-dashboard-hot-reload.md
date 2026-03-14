# Devgate Beta Dashboard + Hot Reload Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver npm beta readiness by implementing safe config hot-reload and a read-only dashboard status surface without regressing `start`, cert flow, or `doctor`.

**Architecture:** Introduce a focused config-watcher + runtime-state pair inside proxy ownership, then wire dashboard rendering from runtime snapshots instead of ad-hoc route objects. Keep hot-reload fail-safe with last-known-good routing and explicit reload status/error metadata.

**Tech Stack:** Node.js ESM, `http-proxy`, built-in `fs.watch`, Vitest.

---

## Chunk 1: Hot Reload Core and Runtime State

### Task 1: Add Runtime State Store Module

**Files:**
- Create: `proxy/runtime-state.js`
- Test: `tests/unit/runtime-state.test.js`
**Spec mapping:** Spec 2.2 (state schema), Spec 4.3 (startup state), Spec 5 (safety visibility)

- [ ] **Step 1: Write failing unit tests for runtime snapshot contract**

```js
import { describe, it, expect } from 'vitest';
import { createRuntimeState } from '../../proxy/runtime-state.js';

describe('runtime-state', () => {
  it('starts with ready=false and reload status never', () => {
    const state = createRuntimeState({ configPath: './devgate.json' });
    const snap = state.getSnapshot();
    expect(snap.runtime.ready).toBe(false);
    expect(snap.reload.lastReloadStatus).toBe('never');
  });

  it('updates nested sections through explicit update APIs', () => {
    const state = createRuntimeState({ configPath: './devgate.json' });
    state.updateRuntime({ ready: true, httpsPort: 8443 });
    state.updateReload({ lastReloadStatus: 'success' });
    expect(state.getSnapshot().runtime.ready).toBe(true);
    expect(state.getSnapshot().reload.lastReloadStatus).toBe('success');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/runtime-state.test.js`
Expected: FAIL with missing module/function.

- [ ] **Step 3: Implement minimal runtime-state module**

```js
export function createRuntimeState({ configPath }) {
  const state = {
    runtime: { ready: false, isRunning: false, httpsPort: null, httpRedirectPort: null, ip: null, hostnameStrategy: null, configPath },
    reload: { lastReloadAt: null, lastReloadStatus: 'never', lastReloadError: null, activeConfigVersion: 0 },
    cert: { mode: 'unknown', certPath: null, keyPath: null, expiresAt: null },
    routes: [],
    health: { updatedAt: null, summary: 'unknown' }
  };
  return {
    getSnapshot: () => structuredClone(state),
    updateRuntime: (partial) => Object.assign(state.runtime, partial),
    updateReload: (partial) => Object.assign(state.reload, partial),
    updateRoutes: (routes) => { state.routes = Array.isArray(routes) ? routes : []; },
    updateHealth: (partial) => Object.assign(state.health, partial),
    updateCert: (partial) => Object.assign(state.cert, partial)
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/runtime-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add proxy/runtime-state.js tests/unit/runtime-state.test.js
git commit -m "feat(proxy): add runtime state store for dashboard and reload status"
```

### Task 2: Add Config Reload Pipeline Helper

**Files:**
- Modify: `config/index.js`
- Modify: `tests/unit/config.test.js`
**Spec mapping:** Spec 2.1 (safe reload pipeline), Spec 5 (error categories), Spec 6 Unit

- [ ] **Step 1: Add failing tests for safe reload pipeline**

```js
import { loadValidateResolveConfig } from '../../config/index.js';

it('returns ok=true with resolved config for valid input', async () => {
  const result = await loadValidateResolveConfig(configPath, {});
  expect(result.ok).toBe(true);
  expect(result.resolved.routes).toBeDefined();
});

it('returns ok=false and structured error for invalid config', async () => {
  const result = await loadValidateResolveConfig(invalidPath, {});
  expect(result.ok).toBe(false);
  expect(result.error.code).toBe('validation_error');
});

it('returns parse_error for invalid JSON syntax', async () => {
  const result = await loadValidateResolveConfig(parseBrokenPath, {});
  expect(result.ok).toBe(false);
  expect(result.error.code).toBe('parse_error');
});

it('returns read_error when config path does not exist', async () => {
  const result = await loadValidateResolveConfig(missingPath, {});
  expect(result.ok).toBe(false);
  expect(result.error.code).toBe('read_error');
});
```

- [ ] **Step 2: Run targeted config tests**

Run: `npm test -- tests/unit/config.test.js`
Expected: FAIL for missing `loadValidateResolveConfig`.

- [ ] **Step 3: Implement helper in config module**

```js
export async function loadValidateResolveConfig(configPath, runtimeOptions = {}) {
  try {
    const loaded = await loadConfig(configPath);
    const validation = validateConfig(loaded);
    if (!validation.valid) {
      return { ok: false, error: { code: 'validation_error', message: validation.errors.join('; ') } };
    }
    return { ok: true, loaded, resolved: resolveRuntimeConfig(loaded, runtimeOptions) };
  } catch (err) {
    const code = err.message.includes('parse') ? 'parse_error' : 'read_error';
    return { ok: false, error: { code, message: err.message } };
  }
}
```

- [ ] **Step 4: Re-run config tests**

Run: `npm test -- tests/unit/config.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add config/index.js tests/unit/config.test.js
git commit -m "feat(config): add safe load/validate/resolve pipeline helper"
```

### Task 3: Add Dedicated Config Watcher with Debounce and Single-Flight

**Files:**
- Create: `proxy/config-watcher.js`
- Test: `tests/unit/config-watcher.test.js`
**Spec mapping:** Spec 2.1 (watch+debounce), Spec 5 (single-flight), Spec 6 Concurrency/debounce tests

- [ ] **Step 1: Write failing tests for debounce and no concurrent reloads**

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createConfigWatcher } from '../../proxy/config-watcher.js';
import fs from 'node:fs';

vi.mock('node:fs', () => ({ watch: vi.fn() }));

it('debounces multiple change events into one callback', async () => {
  let cb;
  fs.watch.mockImplementation((_p, handler) => {
    cb = handler;
    return { close: vi.fn() };
  });
  const onChange = vi.fn().mockResolvedValue(undefined);
  const watcher = createConfigWatcher({ configPath: './devgate.json', debounceMs: 350, onChange });
  watcher.start();
  cb('change'); cb('change'); cb('change');
  await new Promise(r => setTimeout(r, 420));
  expect(onChange).toHaveBeenCalledTimes(1);
  watcher.stop();
});

it('does not execute concurrent reloads while in-flight', async () => {
  let cb;
  let release;
  const lock = new Promise(r => { release = r; });
  fs.watch.mockImplementation((_p, handler) => {
    cb = handler;
    return { close: vi.fn() };
  });
  const onChange = vi.fn().mockImplementation(async () => lock);
  const watcher = createConfigWatcher({ configPath: './devgate.json', debounceMs: 50, onChange });
  watcher.start();
  cb('change');
  await new Promise(r => setTimeout(r, 80));
  cb('change');
  await new Promise(r => setTimeout(r, 80));
  expect(onChange).toHaveBeenCalledTimes(1);
  release();
  await new Promise(r => setTimeout(r, 80));
  expect(onChange).toHaveBeenCalledTimes(2);
  watcher.stop();
});

it('stop closes watcher and clears pending timer', () => {
  const close = vi.fn();
  fs.watch.mockReturnValue({ close });
  const watcher = createConfigWatcher({ configPath: './devgate.json', debounceMs: 350, onChange: vi.fn() });
  watcher.start();
  watcher.stop();
  expect(close).toHaveBeenCalledTimes(1);
});

it('clamps debounce outside bounds (250..500)', () => {
  vi.useFakeTimers();
  let cb;
  fs.watch.mockImplementation((_p, handler) => {
    cb = handler;
    return { close: vi.fn() };
  });
  const onLow = vi.fn().mockResolvedValue(undefined);
  const low = createConfigWatcher({ configPath: './devgate.json', debounceMs: 5, onChange: onLow });
  low.start();
  cb('change');
  vi.advanceTimersByTime(249);
  expect(onLow).toHaveBeenCalledTimes(0);
  vi.advanceTimersByTime(1);
  expect(onLow).toHaveBeenCalledTimes(1);
  low.stop();

  const onHigh = vi.fn().mockResolvedValue(undefined);
  const high = createConfigWatcher({ configPath: './devgate.json', debounceMs: 2000, onChange: onHigh });
  high.start();
  cb('change');
  vi.advanceTimersByTime(499);
  expect(onHigh).toHaveBeenCalledTimes(0);
  vi.advanceTimersByTime(1);
  expect(onHigh).toHaveBeenCalledTimes(1);
  high.stop();
  vi.useRealTimers();
});

it('start is idempotent and does not leak watchers', () => {
  const close = vi.fn();
  fs.watch.mockReturnValue({ close });
  const watcher = createConfigWatcher({ configPath: './devgate.json', onChange: vi.fn() });
  watcher.start();
  watcher.start();
  watcher.stop();
  expect(close).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run watcher unit tests to verify failure**

Run: `npm test -- tests/unit/config-watcher.test.js`
Expected: FAIL with missing module.

- [ ] **Step 3: Implement watcher module**

```js
export function createConfigWatcher({ configPath, debounceMs = 350, onChange }) {
  const effectiveDebounce = Math.min(500, Math.max(250, debounceMs));
  let started = false;
  let handle = null;
  let timer = null;
  let inFlight = false;
  let rerunQueued = false;
  let lastWatchError = null;
  const execute = async () => {
    if (inFlight) { rerunQueued = true; return; }
    inFlight = true;
    try { await onChange(configPath); }
    catch (error) { lastWatchError = error; /* do not invoke onChange twice */ }
    finally {
      inFlight = false;
      if (rerunQueued) { rerunQueued = false; void execute(); }
    }
  };
  const start = () => {
    if (started) return;
    started = true;
    handle = watch(configPath, (eventType) => {
      if (eventType !== 'change') return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void execute(); }, effectiveDebounce);
    });
  };
  const stop = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (handle) handle.close();
    handle = null;
    started = false;
  };
  return { start, stop };
}
```

- [ ] **Step 4: Re-run watcher tests**

Run: `npm test -- tests/unit/config-watcher.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add proxy/config-watcher.js tests/unit/config-watcher.test.js
git commit -m "feat(proxy): add debounced config watcher with single-flight reload"
```

### Task 4: Integrate Runtime State + Watcher into Proxy Lifecycle

**Files:**
- Modify: `proxy/index.js`
- Create: `proxy/reload-coordinator.js`
- Modify: `tests/integration/http-routing.test.js`
- Modify: `tests/e2e/full-proxy.test.js`
- Create: `tests/unit/proxy-runtime-api.test.js`
**Spec mapping:** Spec 2.1, 3(proxy responsibilities), 4.1/4.2 flows, 5 safety model, 6 integration/e2e

- [ ] **Step 1: Add failing integration tests for hot reload success/fail/recovery**

```js
it('applies valid route changes without restart', async () => {
  expect((await makeRequest(proxyPort, '/', 'a.192-168-1-1.sslip.io')).status).toBe(200);
  const reloaded = once(proxy, 'config:reloaded');
  writeFileSync(configPath, JSON.stringify(configB));
  const event = await reloaded;
  expect(event.routeCount).toBe(2);
  expect((await makeRequest(proxyPort, '/', 'b.192-168-1-1.sslip.io')).status).toBe(200);
});

it('keeps last-known-good routes when reload fails', async () => {
  const failed = once(proxy, 'config:reload_failed');
  writeFileSync(configPath, '{ invalid json');
  const event = await failed;
  expect(['parse_error', 'validation_error']).toContain(event.errorCode);
  expect((await makeRequest(proxyPort, '/', 'a.192-168-1-1.sslip.io')).status).toBe(200);
});

it('emits payload contract fields for reload events', async () => {
  const okWait = once(proxy, 'config:reloaded');
  writeFileSync(configPath, JSON.stringify(configB));
  const ok = await okWait;
  expect(ok).toMatchObject({
    configPath,
    activeConfigVersion: expect.any(Number),
    routeCount: expect.any(Number),
    timestamp: expect.any(String)
  });
  const badWait = once(proxy, 'config:reload_failed');
  writeFileSync(configPath, '{ invalid json');
  const bad = await badWait;
  expect(bad).toMatchObject({
    configPath,
    errorCode: expect.any(String),
    errorMessage: expect.any(String),
    activeConfigVersion: expect.any(Number),
    timestamp: expect.any(String)
  });
});
```

- [ ] **Step 2: Run integration scope and confirm failures**

Run: `npm test -- tests/integration/http-routing.test.js tests/e2e/full-proxy.test.js`
Expected: FAIL for missing watcher/reload behavior.

- [ ] **Step 3: Implement reload coordinator and integrate with proxy**

```js
// create proxy/reload-coordinator.js:
// - receives {configPath, runtimeOptions, applyResolvedConfig, runtimeState, emit}
// - executeReload() runs loadValidateResolveConfig
// - success path: applyResolvedConfig(resolved), increment activeConfigVersion,
//   set reload success fields, emit config:reloaded payload
// - failure path: keep current routes, set reload failed fields, emit config:reload_failed payload
// - strict payload schema source-of-truth:
//   config:reloaded => { timestamp: string, configPath: string, activeConfigVersion: number, routeCount: number }
//   config:reload_failed => { timestamp: string, configPath: string, errorCode: string, errorMessage: string, activeConfigVersion: number }
//
// in proxy/index.js:
// - create runtimeState instance
// - wire config-watcher on start with onChange => coordinator.executeReload
// - expose getRuntimeState()
```

- [ ] **Step 4: Add public read API and verify with dedicated unit test**

Test snippet:
```js
it('returns immutable runtime snapshot via getRuntimeState', () => {
  const proxy = createProxy({ routes: {}, port: 18080, defaultPort: null });
  const snap = proxy.getRuntimeState();
  expect(snap.runtime).toBeDefined();
  const originalPort = proxy.getRuntimeState().runtime.httpsPort;
  snap.runtime.httpsPort = 9999;
  expect(proxy.getRuntimeState().runtime.httpsPort).toBe(originalPort);
});
```
Run:
- `npm test -- tests/unit/proxy-runtime-api.test.js`
- `npm test -- tests/integration/http-routing.test.js -t \"reload\"`
Expected: PASS and event payload + API assertions succeed.

- [ ] **Step 5: Re-run integration/e2e scope**

Run: `npm test -- tests/integration/http-routing.test.js tests/e2e/full-proxy.test.js`
Expected: PASS for new reload semantics + existing routing behaviors.

- [ ] **Step 6: Commit**

```bash
git add proxy/index.js proxy/reload-coordinator.js tests/unit/proxy-runtime-api.test.js tests/integration/http-routing.test.js tests/e2e/full-proxy.test.js
git commit -m "feat(proxy): implement safe hot-reload with last-known-good fallback"
```

---

## Chunk 2: Dashboard and Runtime Wiring (Code + Tests Only)

### Task 5: Extend Dashboard Renderer to Show Runtime/Reload/Cert/Health Sections

**Files:**
- Modify: `dashboard/index.js`
- Create: `tests/unit/dashboard.test.js`
**Spec mapping:** Spec 3(`dashboard/index.js`), Spec 4.3 readiness visibility, Spec 6 Unit

- [ ] **Step 1: Add failing tests for dashboard status sections**

```js
import { renderDashboard } from '../../dashboard/index.js';
const mockState = {
  runtime: { ready: true, isRunning: true, httpsPort: 443, httpRedirectPort: 80, ip: '192.168.1.10', hostnameStrategy: 'sslip', configPath: './devgate.json' },
  reload: { lastReloadAt: '2026-03-14T10:00:00.000Z', lastReloadStatus: 'failed', lastReloadError: 'parse_error', activeConfigVersion: 2 },
  cert: { mode: 'mkcert', certPath: '/tmp/cert.pem', keyPath: '/tmp/key.pem', expiresAt: '2027-03-14T10:00:00.000Z' },
  routes: [{ alias: 'api', target: 'http://localhost:3000', url: 'https://api.192-168-1-1.sslip.io', health: 'healthy' }],
  health: { updatedAt: '2026-03-14T10:00:05.000Z', summary: 'healthy' }
};

it('renders reload status and last error details', () => {
  const html = renderDashboard({ runtimeState: mockState });
  expect(html).toContain('Last reload');
  expect(html).toContain('failed'); // from reload.lastReloadStatus
  expect(html).toContain('parse_error'); // from reload.lastReloadError
});

it('renders cert mode and expiration', () => {
  const html = renderDashboard({ runtimeState: mockState });
  expect(html).toContain('mkcert');
  expect(html).toContain('2027');
});

it('renders explicit never/success/failed reload states', () => {
  expect(renderDashboard({ runtimeState: { ...mockState, reload: { ...mockState.reload, lastReloadStatus: 'never' } } })).toContain('never');
  expect(renderDashboard({ runtimeState: { ...mockState, reload: { ...mockState.reload, lastReloadStatus: 'success' } } })).toContain('success');
  expect(renderDashboard({ runtimeState: { ...mockState, reload: { ...mockState.reload, lastReloadStatus: 'failed' } } })).toContain('failed');
});

it('escapes user-controlled fields to prevent HTML injection', () => {
  const html = renderDashboard({
    runtimeState: {
      ...mockState,
      routes: [{ alias: '<script>x</script>', target: 'http://localhost:3000', url: 'https://x', health: 'unknown' }]
    }
  });
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
});
```

- [ ] **Step 2: Run dashboard tests to verify failure**

Run: `npm test -- tests/unit/dashboard.test.js`
Expected: FAIL (sections not rendered yet).

- [ ] **Step 3: Implement read-only status dashboard view**

```js
export function renderDashboard(options = {}) {
  const { runtimeState } = options;
  // render Runtime section: ready/isRunning/ports/ip/hostnameStrategy
  // render Routes section from runtimeState.routes with health badges
  // render Reload section from runtimeState.reload fields
  // render Certificate section from runtimeState.cert
  // preserve HTML escaping for user-controlled fields
}
```

- [ ] **Step 4: Re-run dashboard tests**

Run: `npm test -- tests/unit/dashboard.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/index.js tests/unit/dashboard.test.js
git commit -m "feat(dashboard): render runtime, reload, health, and certificate status"
```

### Task 6: Wire CLI Start Command to New Runtime State + Health Snapshot Publishing

**Files:**
- Modify: `cli/index.js`
- Modify: `tests/integration/healthcheck.test.js`
**Spec mapping:** Spec 3(`health/index.js`,`cert/index.js` integration), Spec 4 flows, Spec 6 Integration

- [ ] **Step 1: Add failing integration tests for dashboard runtime snapshot wiring**

```js
it('updates dashboard health snapshot when HealthChecker changes', async () => {
  // setup:
  // - start upstream health endpoint returning 200
  // - start proxy with dashboard route host `dev.192-168-1-1.sslip.io`
  // - configure one route with healthcheck '/health'
  const response1 = await makeRequest(proxyPort, '/', dashboardHost);
  expect(response1.body).toContain('Unknown');
  expect(response1.body).toContain('Ready');
  expect(response1.body).toContain('false');

  await waitFor(async () => {
    const r = await makeRequest(proxyPort, '/', dashboardHost);
    return r.body.includes('Healthy');
  }, { timeoutMs: 3000, intervalMs: 100 });

  const response2 = await makeRequest(proxyPort, '/', dashboardHost);
  expect(response2.body).toContain('Healthy');
  expect(response2.body).toContain('Ready');
  expect(response2.body).toContain('true');
});
```

- [ ] **Step 2: Run integration tests and verify failures**

Run: `npm test -- tests/integration/healthcheck.test.js`
Expected: FAIL (no runtime-state wiring yet).

- [ ] **Step 3: Implement CLI->proxy wiring**

```js
// in startCommand:
// - pass configPath/runtimeConfig/ip metadata into createProxy({ ... })
// - after ensureCertificates: push cert mode/path/expiration into proxy runtime state
// - after health checker tick: push summarized health + per-route states into runtime state
// - keep current CLI output and exit behavior unchanged
// acceptance checks:
// - dashboard initially shows Unknown then transitions to Healthy
// - runtime.ready true only after first full snapshot write
```

- [ ] **Step 4: Re-run integration tests**

Run: `npm test -- tests/integration/healthcheck.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/index.js tests/integration/healthcheck.test.js
git commit -m "feat(cli): publish health and cert runtime data for dashboard"
```

---

## Chunk 3: Docs and Beta Release Execution

### Task 7: Add/Update Docs for Dashboard Semantics and Hot Reload Behavior

**Files:**
- Modify: `README.md`
- Modify: `docs/user/configuration.md`
- Modify: `docs/user/troubleshooting.md`
**Spec mapping:** Spec 7 release criteria (docs semantics)

- [ ] **Step 1: Write doc acceptance checklist (required in PR description or commit body)**

```md
- dashboard shows last reload status and error
- invalid config keeps last valid routes active
- next valid save recovers automatically
```

- [ ] **Step 2: Update user docs with explicit semantics**

Add sections:
- Hot reload lifecycle (`never|success|failed`, fallback behavior)
- Dashboard fields and meaning
- Common reload failure causes + fixes.

- [ ] **Step 3: Validate docs render and quick consistency check**

Run:
- `rg -n "Hot reload lifecycle|never\\|success\\|failed|last reload|last-known-good|dashboard" README.md docs/user/configuration.md docs/user/troubleshooting.md`
- `npm test -- tests/integration/http-routing.test.js -t \"reload\"`
Expected:
- all required semantic phrases present in docs,
- reload behavior tests still PASS after docs updates.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/user/configuration.md docs/user/troubleshooting.md
git commit -m "docs: describe dashboard status fields and hot-reload fail-safe behavior"
```

### Task 8: Final Verification and npm Beta Release Execution

**Files:**
- Modify (if needed): `package.json` (version bump only if release policy requires)
**Spec mapping:** Spec 7 beta release criteria, Spec 8 milestone D

- [ ] **Step 1: Run full test suite (release gate)**

Run: `npm test`
Expected: PASS all Vitest suites.

- [ ] **Step 2: Pre-publish safety guards**

Run:
- `git status --porcelain`
- `npm whoami`
- `npm config get registry`
Expected:
- working tree is clean before versioning/publish,
- npm auth is valid for target registry account,
- registry matches expected publish target (typically `https://registry.npmjs.org/`).

- [ ] **Step 3: Run focused smoke commands**

Run:
- `node cli/bin/devgate.js validate --config ./devgate.json`
- `node cli/bin/devgate.js doctor --config ./devgate.json`

Expected:
- validate returns exit code 0 for valid config,
- doctor completes with success or explicit warnings only for environment prerequisites.

- [ ] **Step 4: Prepare beta version metadata without implicit git side effects**

Run:
```powershell
npm version prerelease --preid beta --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore(release): prepare npm beta version"
$v = node -p "require('./package.json').version"
git tag -a "v$v" -m "beta release"
```
Expected:
- version bumped to `-beta.N`,
- commit and tag created explicitly and reproducibly.

- [ ] **Step 5: Publish beta dist-tag**

Run:
```bash
npm publish --tag beta
```
Expected: package published with `beta` dist-tag (not `latest`).

- [ ] **Step 6: Post-publish smoke check**

Run:
```bash
npm view devgate dist-tags
npm view devgate@beta version
```
Expected: `beta` tag points to newly published prerelease.

- [ ] **Step 7: Verify local git state after publish**
Run: `git status --short`
Expected: no unexpected working-tree changes after publish.

---

## Execution Notes

- Keep each task isolated; avoid mixing watcher, proxy, dashboard, and docs changes in one commit.
- Prefer preserving current public APIs; add new methods in backward-compatible way.
- If existing tests are flaky due to random ports, stabilize with `findFreePort` helper usage from `tests/utils/port-utils.js`.
- Any deviation from this plan must be reflected back into the plan doc before implementation continues.

## Verification Checklist Before Declaring Done

- [ ] `npm test` green.
- [ ] Reload failure leaves routing unchanged (verified by integration test).
- [ ] Reload recovery on next valid save works.
- [ ] Dashboard displays runtime/reload/cert/health sections.
- [ ] Docs updated for dashboard and hot-reload semantics.
- [ ] npm package published with `beta` dist-tag.
