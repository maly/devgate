# Devgate VS Code Extension MVP Design

**Date:** 2026-03-15  
**Project:** devgate  
**Scope:** Add first-party VS Code integration in-repo at `packages/vscode-extension` so users can run the core `init -> setup -> start` flow without using terminal commands directly.

## 1. Goal and Non-Goals

### Goal
Provide a frictionless VS Code-native workflow for local devgate operations with visible runtime status and logs.

### In-scope (MVP)
- New extension package at `packages/vscode-extension`
- Command Palette commands:
  - `Devgate: Init`
  - `Devgate: Setup`
  - `Devgate: Start`
  - `Devgate: Start (Force)`
  - `Devgate: Stop`
  - `Devgate: Doctor`
  - `Devgate: Domain Status`
  - `Devgate: Domain Setup`
  - `Devgate: Domain Teardown`
- CLI binary resolution strategy:
  - Prefer workspace-local `node cli/bin/devgate.js`
  - Fallback to global `devgate` in PATH
- Status bar item with runtime state
- Output channel (`Devgate`) with command streams and separators

### Non-goals (deferred)
- Auto-start suggestion on workspace open
- Sidebar/tree view
- Full GUI form editor for routes (will use `devgate init` command invocation in MVP)
- Background daemon beyond current CLI process model

## 2. UX Contract

## 2.1 Command Experience
- Commands are available via Command Palette.
- Each command appends a heading to output channel with timestamp and executed command.
- Errors surface in both output channel and a concise VS Code notification.

## 2.2 Status Bar Experience
- Single status item, e.g. `Devgate: Stopped|Starting|Running|Error`.
- Click action opens quick pick:
  - Start
  - Start (Force)
  - Stop
  - Open Output
- Tooltip includes:
  - resolved CLI mode (`local` or `global`)
  - last command result summary

## 2.3 Process and Stop Semantics
- `Start` launches a long-running process and tracks PID handle in extension state.
- `Stop` only targets process started by extension instance.
- `Start (Force)` invokes `start --force`, relying on core singleton behavior already implemented in CLI.

## 3. Architecture

## 3.1 Package Layout
- `packages/vscode-extension/package.json`
- `packages/vscode-extension/tsconfig.json`
- `packages/vscode-extension/src/extension.ts`
- `packages/vscode-extension/src/cliResolver.ts`
- `packages/vscode-extension/src/devgateRunner.ts`
- `packages/vscode-extension/src/statusBar.ts`
- `packages/vscode-extension/src/commands.ts`

## 3.2 Core Modules

### `cliResolver.ts`
Responsibility:
- Detect and build executable command tuple.

Contract:
- Input: active workspace folder path
- Output:
  - `{ kind: "local", cmd: "node", args: ["<workspace>/cli/bin/devgate.js"] }` when local CLI exists
  - `{ kind: "global", cmd: "devgate", args: [] }` otherwise

### `devgateRunner.ts`
Responsibility:
- Execute command processes with streaming output.
- Manage one active `start` process handle.

Contract:
- `runOneShot(subcommandArgs): Promise<{ ok, exitCode }>`
- `start(subcommandArgs): Promise<void>`
- `stop(): Promise<void>`
- Emits state updates for status bar.

### `statusBar.ts`
Responsibility:
- Render current state and handle click action.

States:
- `stopped`
- `starting`
- `running`
- `error`

### `commands.ts`
Responsibility:
- Register VS Code commands and map to runner operations.

## 3.3 Integration Flow
1. Extension activates.
2. Resolve CLI mode (local/global).
3. Register commands.
4. Initialize output channel and status bar.
5. Commands run through shared runner.

## 4. Error Handling

## 4.1 CLI Resolution Failures
- If neither local nor global executable can run:
  - status -> `error`
  - notification: install/build guidance
  - output channel includes exact attempted command(s)

## 4.2 Command Failures
- Non-zero exits:
  - show warning/error notification
  - keep detailed stderr/stdout in output
  - status bar transitions to `error` for failed `start`; remains unchanged for one-shot command failures

## 4.3 Process Lifecycle Edge Cases
- If start process exits unexpectedly:
  - transition `running -> error`
  - append termination code/signal to output
- On extension deactivate:
  - stop tracked process best-effort

## 5. Testing Strategy

## 5.1 Unit Tests
- `cliResolver`:
  - local path exists -> local mode
  - local path missing -> global mode
- `command builder`:
  - ensures correct argument concatenation (`start --force`, etc.)
- `status transitions`:
  - stopped -> starting -> running
  - running -> stopped
  - running -> error on unexpected exit

## 5.2 Manual Smoke (MVP gate)
- In workspace containing devgate sources:
  - run `Devgate: Start` (uses local mode)
  - run `Devgate: Stop`
  - run `Devgate: Setup`
- In unrelated workspace with global install:
  - run `Devgate: Doctor` (uses global mode)

## 6. Acceptance Criteria
- User can perform `init -> setup -> start -> stop` from VS Code without terminal usage.
- Extension prefers local CLI when available, else global CLI.
- Status bar reflects runtime lifecycle.
- Output channel reliably captures stdout/stderr for all commands.
- `Start (Force)` is available and maps to CLI `start --force`.

## 7. Future Iterations
- Auto-start prompt on workspace open (deferred by request)
- Sidebar with route cards and quick actions
- Guided init form UX (instead of invoking textual init flow)
- Multi-root workspace semantics and per-folder selection
