# Devgate Native .devgate Domains on macOS/Linux with sslip Fallback Design

**Date:** 2026-03-14
**Project:** devgate
**Scope:** Prefer `.devgate` hostnames on macOS/Linux using local resolver setup, keep Windows on `sslip`, and auto-fallback to `sslip` when resolver is missing/error.

## 1. Goal and Non-Goals

### Goal
Add first-class `.devgate` hostname support for macOS/Linux while preserving reliability through automatic fallback.

### In-scope
- macOS/Linux: use `.devgate` hostnames when resolver status is `ready`.
- macOS/Linux: when resolver is `missing` or `error`, print strong warning and instructions (`sudo devgate domain setup`) and automatically continue with `sslip`.
- Windows: always keep `sslip` behavior unchanged.
- Add CLI domain lifecycle commands: `devgate domain setup|status|teardown`.
- Extend diagnostics (`doctor`) with resolver/fallback visibility.

### Non-goals
- No change to proxy routing model itself.
- No attempt to make Windows use `.devgate`.
- No interactive prompt in `start` path; fallback is automatic.

## 2. Architecture

### 2.1 New Domain Manager Module
New module: `domain/`

- `domain/index.js`
  - platform dispatch (`darwin|linux|win32`)
  - unified API: `getDomainStatus`, `setupDomainResolver`, `teardownDomainResolver`
  - normalized status contract:
    - `ready`
    - `missing`
    - `unsupported`
    - `error`

- `domain/providers/macos-resolver.js`
  - `/etc/resolver/devgate` management (create/check/remove)

- `domain/providers/linux-resolved.js`
  - `systemd-resolved`/`resolvectl` based checks/setup/teardown

### 2.2 Config + Runtime Selection
Add/extend runtime domain strategy selection:
- `auto` (default)
- `sslip`
- `devgate`

Resolution behavior:
- `win32`: force `sslip`.
- `darwin|linux` + `auto`:
  - if domain status `ready`: use `devgate` strategy
  - else: use `sslip` strategy and emit warning
- explicit `sslip`: always `sslip`.
- explicit `devgate` on unsupported/invalid state: warning + fallback to `sslip`.

## 3. Component Responsibilities

### `domain/index.js`
- Owns domain resolver lifecycle abstraction.
- Returns deterministic machine-readable status object:
  - `{ status, platform, provider, details }`

### `cli/index.js`
- Add command group:
  - `devgate domain status`
  - `devgate domain setup`
  - `devgate domain teardown`
- In `start`:
  - run status check (macOS/Linux)
  - decide strategy (`devgate` or `sslip`)
  - print actionable warning when fallback is used

### `api/hostname-builder.js`
- Add strategy `devgate`:
  - route hostnames: `<alias>.devgate`
  - dashboard hostname: `<dashboardAlias>.devgate`

### `doctor` diagnostics (in `cli/index.js`)
- Report resolver state and whether fallback is active.

## 4. Data Flows

### 4.1 Start on macOS/Linux, resolver ready
1. `start` loads config.
2. Domain manager reports `ready`.
3. Runtime strategy resolved to `devgate`.
4. Hostname builder emits `.devgate` hostnames.
5. Proxy boots normally.

### 4.2 Start on macOS/Linux, resolver missing/error
1. `start` loads config.
2. Domain manager reports `missing` or `error`.
3. CLI prints warning + `sudo devgate domain setup` instruction.
4. Runtime strategy resolved to `sslip` fallback.
5. Proxy boots with `sslip` hostnames (no hard failure).

### 4.3 Start on Windows
1. `start` resolves platform `win32`.
2. Strategy forced to `sslip`.
3. Existing behavior preserved.

## 5. Error Handling and Safety Model

- Domain manager must never crash `start`; it returns structured `error` status.
- `start` must not exit non-zero due to missing resolver on macOS/Linux.
- Privileged operations (`domain setup|teardown`) return clear failure messages when not run with `sudo`.
- Fallback activation must be explicit in logs to avoid silent misconfiguration.
- Domain provider failures are isolated from proxy serving path.

## 6. Testing Strategy

### Unit
- platform dispatch and status normalization in `domain/index.js`
- `hostname-builder` with `devgate` strategy
- `start` domain decision logic (`ready` -> `.devgate`, `missing/error` -> `sslip`)

### Integration
- CLI `domain status/setup/teardown` with mocked providers
- startup flow with mocked domain status:
  - ready path uses `.devgate`
  - missing/error path warns and falls back to `sslip`

### Regression
- windows path keeps `sslip`
- existing HTTP/WS proxy tests remain green

## 7. Docs and UX Requirements

Update docs to include:
- domain resolver prerequisites for macOS/Linux
- command examples for `devgate domain setup|status|teardown`
- fallback semantics and warning behavior
- explicit note that Windows remains `sslip`

## 8. Delivery Milestones

1. Milestone A: `domain/` module + provider contracts
2. Milestone B: CLI domain commands
3. Milestone C: startup decision + fallback behavior
4. Milestone D: tests, docs, doctor updates

## 9. Open Questions (Non-blocking)

- Linux provider specifics across distros lacking `systemd-resolved` (initially report `unsupported` and fallback).
- Whether to add a future strict mode that fails startup when `.devgate` is unavailable (out of current scope).
