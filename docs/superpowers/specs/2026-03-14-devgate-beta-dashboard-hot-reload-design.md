# Devgate Beta: Dashboard and Hot-Reload Design

**Date:** 2026-03-14  
**Project:** devgate  
**Scope:** Prepare public npm beta focused on production-ready hot-reload and read-only dashboard.

## 1. Goal and Non-Goals

### Goal
Deliver npm beta readiness by adding:
- robust hot-reload of configuration without process restart,
- read-only dashboard exposing runtime, routes, health, cert, and reload status.

### Confirmed in-scope
- Existing `start`, certificate flow, and `doctor` are already functional and remain release gates.
- Hot-reload is required before beta publish.
- Dashboard is required before beta publish.

### Non-goals for beta
- No dashboard mutating actions (no "reload now", no "run checks" button).
- No new hostname strategies or unrelated refactors.
- No major UX redesign; keep scope operational and stable.

## 2. Architecture

Two additions integrate into existing modules while preserving boundaries.

### 2.1 Config Watcher in proxy lifecycle
Location: `proxy/config-watcher.js` (owned by proxy, started/stopped only by `proxy/index.js`)

Responsibilities:
- watch active config file (`devgate.json|yaml|yml`),
- debounce rapid file change bursts (default 350 ms, configurable 250-500 ms),
- run safe reload pipeline: load -> validate -> resolve,
- atomically swap active route table only on successful pipeline,
- emit success/failure events for observability.

### 2.2 Runtime State Store
Location: new small module (recommended `proxy/runtime-state.js`)

Responsibilities:
- hold read-only dashboard state snapshot,
- receive updates from proxy, health, and cert modules,
- store reload metadata:
  - `lastReloadAt`
  - `lastReloadStatus` (`success|failed|never`)
  - `lastReloadError` (nullable, human readable)
- expose a simple getter for dashboard rendering.

This avoids tight coupling of dashboard with core proxy internals.

State schema (beta contract):
- `runtime`:
  - `ready` (boolean, false until first complete snapshot is available)
  - `isRunning` (boolean)
  - `httpsPort` (number)
  - `httpRedirectPort` (number)
  - `ip` (string)
  - `hostnameStrategy` (string)
  - `configPath` (string)
- `reload`:
  - `lastReloadAt` (ISO string or null)
  - `lastReloadStatus` (`never|success|failed`)
  - `lastReloadError` (string or null)
  - `activeConfigVersion` (number, starts at 1 for initial boot success)
- `cert`:
  - `mode` (`mkcert|self-signed|unknown`)
  - `certPath` (string or null)
  - `keyPath` (string or null)
  - `expiresAt` (ISO string or null)
- `routes` (array):
  - `alias` (string)
  - `target` (`protocol://host:port` string)
  - `url` (string)
  - `health` (`healthy|unhealthy|unknown`)
- `health`:
  - `updatedAt` (ISO string or null)
  - `summary` (`healthy|degraded|unknown`)

## 3. Component Responsibilities

### `proxy/index.js`
- Own watcher start/stop lifecycle.
- Guard against concurrent reloads (single-flight).
- Keep `last-known-good` runtime config + route map.
- Emit `config:reloaded` and `config:reload_failed` events.
- Feed runtime state via explicit updater API:
  - `updateRuntime(partial)`
  - `updateReload(partial)`
  - `updateRoutes(routes)`
  - `updateHealth(partial)`
  - `updateCert(partial)`

### `config/index.js`
- Reuse existing `loadConfig`, `validateConfig`, and `resolveRuntimeConfig`.
- Add/keep a reload helper that returns either valid resolved config or structured error.

### `health/index.js`
- Continue periodic checks.
- Publish latest snapshot into runtime state for dashboard consumption.

### `cert/index.js`
- Expose certificate metadata needed by dashboard (source type, path, expiry).
- Dashboard does not trigger certificate creation/rotation.

### `dashboard/index.js`
Render read-only sections:
- runtime summary (ports, IP, strategy, process state),
- routes table (alias, target, URL, health),
- hot-reload status (last reload time, last result, last error),
- certificate status summary.

Event payload contract:
- `config:reloaded`:
  - `timestamp` (ISO string)
  - `configPath` (string)
  - `activeConfigVersion` (number)
  - `routeCount` (number)
- `config:reload_failed`:
  - `timestamp` (ISO string)
  - `configPath` (string)
  - `errorCode` (`parse_error|validation_error|resolve_error|watch_error|read_error`)
  - `errorMessage` (string)
  - `activeConfigVersion` (number, unchanged)

## 4. Data Flows

### 4.1 Hot-reload success flow
1. File watcher receives change event.
2. Debounce window completes.
3. Reload pipeline validates new config.
4. Proxy swaps routing atomically.
5. Runtime state updates to `success` with timestamp.
6. Dashboard reflects new routes/state.

### 4.2 Hot-reload failure flow
1. File watcher receives change event.
2. Reload pipeline fails (parse/validation/resolve).
3. Active routing is unchanged (`last-known-good` remains active).
4. Runtime state updates to `failed` with error details.
5. Dashboard and logs show failure while proxy keeps serving previous config.

### 4.3 Startup and initial state flow
1. Process starts and loads initial config through normal startup pipeline.
2. If startup load succeeds:
   - `activeConfigVersion` is set to `1`,
   - `lastReloadStatus` remains `never`,
   - `lastReloadAt` and `lastReloadError` are `null`,
   - dashboard is marked ready after first runtime/cert/routes snapshot write.
3. If startup load fails, process exits as it does today (no watcher loop with invalid boot state).

## 5. Error Handling and Safety Model

- Atomic apply only after full validation.
- Last-known-good fallback is mandatory.
- At most one reload running at a time.
- Debounce to avoid editor write storms.
- Verbose logs include file path + concise failure reason.
- Dashboard remains read-only in beta for reduced risk.
- Watcher failure modes:
  - config file deleted/renamed: keep last-known-good active, set reload status `failed`, surface `read_error`.
  - permission denied/read failure: keep serving current config, surface `read_error`.
  - partial writes/transient parse errors: treat as normal reload failure (`parse_error`), keep current config.
  - watcher backend errors: emit `watch_error`, keep current config, keep watcher alive where possible.
- Recovery rule: next valid config change after any failure must reload normally and clear `lastReloadError`.

## 6. Testing Strategy (Vitest)

Primary gate is existing `npm test` (Vitest).

### Unit
- reload helper: valid/invalid config outcomes.
- runtime state store transitions (`never -> success|failed`).
- dashboard rendering includes success/failure reload semantics.

### Integration
- running proxy reloads valid config without restart.
- invalid config does not alter active routes.
- subsequent valid config recovers from previous failed reload.
- file delete/rename and permission error scenarios keep proxy serving last-known-good config.

### E2E smoke
- `devgate start` boots,
- certificate flow remains functional,
- `doctor` remains functional,
- dashboard endpoint responds with expected status sections,
- http/ws routing still works after at least one hot-reload.

### Concurrency and debounce tests
- burst edits trigger at most one effective reload per debounce window.
- while reload is in-flight, additional file events do not run concurrent reloads.
- queued change after in-flight completion triggers one subsequent reload pass.

## 7. Beta Release Criteria

Before publish (`npm publish --tag beta`):
- `npm test` passes in CI and locally.
- No blockers in: start, cert flow, doctor, dashboard, hot-reload.
- Docs include hot-reload behavior and dashboard status semantics.
- Manual smoke: install beta and run basic route + reload scenario.

## 8. Delivery Milestones

1. Milestone A: hot-reload core (watcher, debounce, single-flight, fallback).
2. Milestone B: dashboard v1 read-only status view.
3. Milestone C: Vitest coverage and stabilization for reload + dashboard.
4. Milestone D: npm beta publish with `beta` dist-tag.

## 9. Open Questions (Non-blocking)

- Whether to include per-route latency/error-rate counters in beta dashboard (currently excluded by YAGNI).
- Whether config watcher should support explicit polling fallback on network filesystems (defer unless needed).

