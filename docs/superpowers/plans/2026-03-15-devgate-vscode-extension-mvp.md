# Devgate VS Code Extension MVP Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an in-repo VS Code extension that runs core devgate commands from UI, shows runtime status, and streams logs.

**Architecture:** Build a thin VS Code extension wrapper over existing CLI behavior. Resolve CLI as workspace-local first (`node cli/bin/devgate.js`), fallback to global `devgate`. Centralize process spawning/state in a runner module, then bind commands + status bar + output channel on top.

**Tech Stack:** VS Code Extension API, Node.js child_process, TypeScript, Vitest.

---

## File Structure

- Create: `packages/vscode-extension/package.json`
  - Extension metadata, command contributions, activation events.
- Create: `packages/vscode-extension/tsconfig.json`
  - TypeScript compiler config.
- Create: `packages/vscode-extension/src/extension.ts`
  - Activation/deactivation wiring.
- Create: `packages/vscode-extension/src/cliResolver.ts`
  - Local-vs-global CLI resolution.
- Create: `packages/vscode-extension/src/devgateRunner.ts`
  - Spawn/track commands, manage long-running start process.
- Create: `packages/vscode-extension/src/statusBar.ts`
  - Status bar state + quick-pick actions.
- Create: `packages/vscode-extension/src/commands.ts`
  - Command registration and mapping to runner.
- Create: `packages/vscode-extension/src/types.ts`
  - Shared state/result types for extension modules.
- Create: `packages/vscode-extension/src/constants.ts`
  - Command IDs, labels, output channel name.
- Create: `packages/vscode-extension/vitest.config.ts`
  - Unit test config for package-local tests.
- Create: `packages/vscode-extension/tests/cliResolver.test.ts`
- Create: `packages/vscode-extension/tests/devgateRunner.test.ts`
- Create: `packages/vscode-extension/tests/commands.test.ts`
- Modify: `README.md`
  - Add VS Code extension section and usage.
- Modify: `docs/user/cli-commands.md`
  - Mention VS Code integration entrypoints.

---

## Chunk 1: Extension Scaffold and CLI Resolution

### Task 1: Scaffold Extension Package

**Files:**
- Create: `packages/vscode-extension/package.json`
- Create: `packages/vscode-extension/tsconfig.json`
- Create: `packages/vscode-extension/src/constants.ts`
- Create: `packages/vscode-extension/src/types.ts`

- [ ] **Step 1: Add failing smoke test for package shape**

```ts
import { describe, expect, it } from 'vitest';
import pkg from '../package.json';

describe('extension package', () => {
  it('declares main entry and commands', () => {
    expect(pkg.main).toBe('./dist/extension.js');
    expect(Array.isArray(pkg.contributes?.commands)).toBe(true);
  });
});
```

- [ ] **Step 2: Run smoke test to verify RED**

Run: `npm run test:run -- packages/vscode-extension/tests/package-shape.test.ts`  
Expected: FAIL (missing files).

- [ ] **Step 3: Create minimal package metadata and TS config**

- [ ] **Step 4: Re-run smoke test to verify GREEN**

Run: `npm run test:run -- packages/vscode-extension/tests/package-shape.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit scaffold**

```bash
git add packages/vscode-extension/package.json packages/vscode-extension/tsconfig.json packages/vscode-extension/src/constants.ts packages/vscode-extension/src/types.ts packages/vscode-extension/tests/package-shape.test.ts
git commit -m "feat(vscode): scaffold extension package and shared contracts"
```

### Task 2: Implement CLI Resolver (Local First, Global Fallback)

**Files:**
- Create: `packages/vscode-extension/src/cliResolver.ts`
- Create: `packages/vscode-extension/tests/cliResolver.test.ts`

- [ ] **Step 1: Write failing tests for resolution order**

```ts
import { describe, expect, it } from 'vitest';
import { resolveCli } from '../src/cliResolver';

describe('resolveCli', () => {
  it('uses workspace local cli when available', async () => {
    const cli = await resolveCli({ workspacePath: '/repo', exists: (p) => p.endsWith('cli/bin/devgate.js') });
    expect(cli.kind).toBe('local');
    expect(cli.cmd).toBe('node');
  });

  it('falls back to global devgate when local cli is absent', async () => {
    const cli = await resolveCli({ workspacePath: '/repo', exists: () => false });
    expect(cli.kind).toBe('global');
    expect(cli.cmd).toBe('devgate');
  });
});
```

- [ ] **Step 2: Run resolver tests to verify RED**

Run: `npm run test:run -- packages/vscode-extension/tests/cliResolver.test.ts`  
Expected: FAIL (missing module/function).

- [ ] **Step 3: Implement minimal resolver**

- [ ] **Step 4: Re-run resolver tests to verify GREEN**

Run: `npm run test:run -- packages/vscode-extension/tests/cliResolver.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit resolver**

```bash
git add packages/vscode-extension/src/cliResolver.ts packages/vscode-extension/tests/cliResolver.test.ts
git commit -m "feat(vscode): add local-first cli resolution"
```

---

## Chunk 2: Runner, Status Bar, and Commands

### Task 3: Implement Runner for One-Shot and Long-Running Start

**Files:**
- Create: `packages/vscode-extension/src/devgateRunner.ts`
- Create: `packages/vscode-extension/tests/devgateRunner.test.ts`

- [ ] **Step 1: Write failing tests for process orchestration**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createRunner } from '../src/devgateRunner';

describe('runner', () => {
  it('runs one-shot command and returns exit code', async () => {
    const runner = createRunner({ spawnImpl: fakeSpawnExit0 });
    const result = await runner.runOneShot(['doctor']);
    expect(result.exitCode).toBe(0);
  });

  it('tracks start process and stops it on stop()', async () => {
    const runner = createRunner({ spawnImpl: fakeLongRunningSpawn });
    await runner.start(['start']);
    expect(runner.getState().status).toBe('running');
    await runner.stop();
    expect(runner.getState().status).toBe('stopped');
  });
});
```

- [ ] **Step 2: Run runner tests to verify RED**

Run: `npm run test:run -- packages/vscode-extension/tests/devgateRunner.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement minimal runner**

- [ ] **Step 4: Re-run runner tests to verify GREEN**

Run: `npm run test:run -- packages/vscode-extension/tests/devgateRunner.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit runner**

```bash
git add packages/vscode-extension/src/devgateRunner.ts packages/vscode-extension/tests/devgateRunner.test.ts
git commit -m "feat(vscode): add process runner for commands and start/stop lifecycle"
```

### Task 4: Status Bar + Command Registration

**Files:**
- Create: `packages/vscode-extension/src/statusBar.ts`
- Create: `packages/vscode-extension/src/commands.ts`
- Create: `packages/vscode-extension/tests/commands.test.ts`

- [ ] **Step 1: Write failing tests for command mapping**

```ts
import { describe, expect, it } from 'vitest';
import { buildCommandMap } from '../src/commands';

describe('commands', () => {
  it('maps Start (Force) to start --force', () => {
    const map = buildCommandMap();
    expect(map['devgate.startForce'].args).toEqual(['start', '--force']);
  });
});
```

- [ ] **Step 2: Run command tests to verify RED**

Run: `npm run test:run -- packages/vscode-extension/tests/commands.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement status bar and command registration modules**

- [ ] **Step 4: Re-run command tests to verify GREEN**

Run: `npm run test:run -- packages/vscode-extension/tests/commands.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit commands/status**

```bash
git add packages/vscode-extension/src/statusBar.ts packages/vscode-extension/src/commands.ts packages/vscode-extension/tests/commands.test.ts
git commit -m "feat(vscode): register palette commands and status bar actions"
```

---

## Chunk 3: Activation Wiring, Docs, and Final Verification

### Task 5: Activation/Deactivation Wiring

**Files:**
- Create: `packages/vscode-extension/src/extension.ts`
- Modify: `packages/vscode-extension/package.json`

- [ ] **Step 1: Write failing integration smoke test for activation contract**

```ts
import { describe, expect, it } from 'vitest';
import { activate } from '../src/extension';

describe('extension activate', () => {
  it('registers commands and initializes output channel', async () => {
    const ctx = createFakeExtensionContext();
    await activate(ctx);
    expect(ctx.subscriptions.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run activation smoke test to verify RED**

Run: `npm run test:run -- packages/vscode-extension/tests/activation.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement activation and deactivation flow**

- [ ] **Step 4: Re-run activation smoke test to verify GREEN**

Run: `npm run test:run -- packages/vscode-extension/tests/activation.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit activation wiring**

```bash
git add packages/vscode-extension/src/extension.ts packages/vscode-extension/package.json packages/vscode-extension/tests/activation.test.ts
git commit -m "feat(vscode): wire extension activation with runner, commands, and output"
```

### Task 6: Documentation Updates

**Files:**
- Modify: `README.md`
- Modify: `docs/user/cli-commands.md`

- [ ] **Step 1: Add docs for VS Code workflow**

Required content:
- extension location (`packages/vscode-extension`)
- command list
- local-first CLI resolution behavior
- status bar and output channel behavior

- [ ] **Step 2: Validate docs coverage**

Run: `rg -n "VS Code|Devgate: Start|Start \\(Force\\)|local-first|Output channel|status bar" README.md docs/user/cli-commands.md`  
Expected: all required topics present.

- [ ] **Step 3: Commit docs**

```bash
git add README.md docs/user/cli-commands.md
git commit -m "docs: add VS Code extension MVP usage and command mapping"
```

### Task 7: Final Verification

**Files:**
- Modify: any failing files if needed

- [ ] **Step 1: Run extension package tests**

Run: `npm run test:run -- packages/vscode-extension/tests/*.test.ts`  
Expected: PASS.

- [ ] **Step 2: Run full repository tests**

Run: `npm run test:run`  
Expected: PASS.

- [ ] **Step 3: Quick manual smoke in VS Code**

Checklist:
- `Devgate: Setup` writes to output channel
- `Devgate: Start` transitions status to Running
- `Devgate: Stop` transitions status to Stopped
- `Devgate: Start (Force)` executes `start --force`

- [ ] **Step 4: Verify git tree**

Run: `git status --short`  
Expected: clean before release handoff.

## Verification Checklist Before Declaring Done

- [ ] Extension resolves CLI as local-first, global fallback.
- [ ] Command palette includes MVP command set.
- [ ] Status bar reflects runtime states.
- [ ] Output channel captures stdout/stderr for every command.
- [ ] `Start (Force)` uses `start --force`.
- [ ] Docs updated for VS Code workflow.
- [ ] All tests pass.
