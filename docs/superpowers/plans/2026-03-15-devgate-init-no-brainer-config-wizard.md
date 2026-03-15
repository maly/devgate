# Devgate Init No-Brainer Config Wizard Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `devgate init` as an interactive multi-route wizard with safe merge/edit/remove, deterministic JSON contracts, and atomic save behavior.

**Architecture:** Introduce a dedicated `init/` module split into orchestration, wizard interaction, model mutations, validation, and I/O helpers. Keep `cli/index.js` as thin command plumbing that delegates to `init/index.js`. Enforce deterministic output and stable status/code semantics for `saved|cancelled|preview|error`, including non-interactive action contracts and atomic write guarantees.

**Tech Stack:** Node.js ESM, existing config validator (`config/index.js`), CLI module (`cli/index.js`), Vitest.

---

## File Structure

- Create: `init/index.js`
  - Command orchestration, mode routing, top-level result object.
- Create: `init/model.js`
  - Route add/edit/remove/list operations and deterministic counters.
- Create: `init/validate.js`
  - Alias/target field validation helpers and action argument checks.
- Create: `init/io.js`
  - Config load, parse recovery helpers, atomic save + backup handling.
- Create: `init/wizard.js`
  - Interactive menu loop and first-route guided flow.
- Create: `init/codes.js`
  - Stable code registry for init command outcomes.
- Modify: `cli/index.js`
  - Add `init` command, flags, help text, output plumbing.
- Create: `tests/unit/init-model.test.js`
  - Mutation logic and net-change semantics.
- Create: `tests/unit/init-validate.test.js`
  - Field validation and non-interactive argument matrix.
- Create: `tests/unit/init-io.test.js`
  - Atomic save, backup, Windows lock behavior via mocks.
- Create: `tests/unit/init-index.test.js`
  - Top-level status/code/exit mapping and deterministic contract.
- Create: `tests/integration/init-cli.test.js`
  - CLI flow tests for interactive/non-interactive/dry-run/json.
- Modify: `README.md`
- Modify: `docs/user/quick-start.md`
- Modify: `docs/user/cli-commands.md`
- Modify: `docs/user/troubleshooting.md`

---

## Chunk 1: Init Core Contracts and Mutation Engine

### Task 1: Add Stable Init Code Registry and Top-Level Contract Mapping

**Files:**
- Create: `init/codes.js`
- Create: `init/index.js`
- Create: `tests/unit/init-index.test.js`
- Spec mapping: 2.3, 2.4, 3.2

- [ ] **Step 1: Write failing tests for init top-level JSON contract**

```js
import { runInit } from '../../init/index.js';

it('returns required init contract fields', async () => {
  const result = await runInit({ dryRun: true, json: true, deps: fakeDeps });
  expect(result).toMatchObject({
    schema_version: '1',
    command: 'init',
    changed: expect.any(Boolean),
    added: expect.any(Number),
    updated: expect.any(Number),
    removed: expect.any(Number),
    savedPath: expect.anything(),
    dryRun: true,
    status: expect.any(String),
    code: expect.any(String),
    message: expect.any(String),
    details: expect.any(Object)
  });
  expect(result.schema_version).toBe('1');
  expect(result.command).toBe('init');
});
```

- [ ] **Step 2: Run test to verify RED state**

Run: `npm run test:run -- tests/unit/init-index.test.js`  
Expected: FAIL on missing module/function.

- [ ] **Step 3: Add failing tests for status/code deterministic mapping**

```js
it('maps saved/cancelled/preview/error to stable codes', async () => {
  expect((await runInit({ mode: 'saved', deps: fakeDeps })).code).toBe('init_saved');
  expect((await runInit({ mode: 'cancelled', deps: fakeDeps })).code).toBe('init_cancelled');
  expect((await runInit({ mode: 'preview', dryRun: true, deps: fakeDeps })).code).toBe('init_preview');
  expect((await runInit({ mode: 'error', deps: fakeDeps })).code).toBe('init_error');
  expect((await runInit({ mode: 'invalid_args', deps: fakeDeps })).code).toBe('init_invalid_args');
});
```

- [ ] **Step 4: Add failing tests for preview exit-code semantics**

```js
it('returns exitCode 0 for successful preview dry-run', async () => {
  const result = await runInit({ dryRun: true, deps: fakeDeps });
  expect(result.status).toBe('preview');
  expect(result.exitCode).toBe(0);
});

it('sets preview savedPath to resolved target config path', async () => {
  const result = await runInit({ dryRun: true, configPath: './devgate.json', deps: fakeDeps });
  const expected = path.resolve('./devgate.json');
  expect(result.status).toBe('preview');
  expect(result.savedPath).toBe(expected);
});

it('uses status-dependent savedPath nullability', async () => {
  const cancelled = await runInit({ mode: 'cancelled', deps: fakeDeps });
  const errored = await runInit({ mode: 'error', deps: fakeDeps });
  const saved = await runInit({ mode: 'saved', deps: fakeDeps });
  expect(cancelled.savedPath === null || typeof cancelled.savedPath === 'string').toBe(true);
  expect(errored.savedPath === null || typeof errored.savedPath === 'string').toBe(true);
  expect(typeof saved.savedPath).toBe('string');
});

it('rejects non-interactive metadata edit flags with init_invalid_args', async () => {
  const result = await runInit({
    nonInteractive: true,
    editAlias: 'api',
    healthcheck: '/health',
    deps: fakeDeps
  });
  expect(result.status).toBe('error');
  expect(result.code).toBe('init_invalid_args');
  expect(result.exitCode).toBe(1);
});

it('does not terminate interactive session on action-level validation error', async () => {
  const result = await runInit({ interactive: true, deps: interactiveValidationErrorThenCancelDeps });
  expect(result.status === 'cancelled' || result.status === 'saved').toBe(true);
});
```

- [ ] **Step 5: Implement minimal `init/codes.js` and `init/index.js`**

```js
import path from 'node:path';
// init/codes.js exports stable code list
// init/index.js exports runInit with deterministic status/code/exit mapping
```

- [ ] **Step 6: Re-run init-index tests to GREEN**

Run: `npm run test:run -- tests/unit/init-index.test.js`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add init/codes.js init/index.js tests/unit/init-index.test.js
git commit -m "feat(init): add init result contract and stable code mapping"
```

### Task 2: Build Route Mutation Model with Net-Change Semantics

**Files:**
- Create: `init/model.js`
- Create: `tests/unit/init-model.test.js`
- Spec mapping: 4.*, 3.2 counter semantics

- [ ] **Step 1: Write failing tests for add/edit/remove behavior**

```js
import { createInitModel } from '../../init/model.js';

it('adds, edits, removes aliases with deterministic counters', () => {
  const model = createInitModel({ routes: [] });
  model.addRoute({ alias: 'api', target: { protocol: 'http', host: 'localhost', port: 3000 } });
  model.editRoute('api', { target: { port: 3001 } });
  model.removeRoute('api');
  const summary = model.getSummary();
  expect(summary.added).toBe(0);
  expect(summary.removed).toBe(0);
  expect(summary.changed).toBe(false);
});
```

- [ ] **Step 2: Run test to verify RED state**

Run: `npm run test:run -- tests/unit/init-model.test.js`  
Expected: FAIL on missing module.

- [ ] **Step 3: Add failing tests for unknown key preservation**

```js
it('preserves unknown top-level and untouched route keys', () => {
  const model = createInitModel({
    foo: 'bar',
    routes: [{ alias: 'web', target: { protocol: 'http', host: 'localhost', port: 5173 }, custom: 1 }]
  });
  model.addRoute({ alias: 'api', target: { protocol: 'http', host: 'localhost', port: 3000 } });
  const out = model.toConfig();
  expect(out.foo).toBe('bar');
  expect(out.routes.find(r => r.alias === 'web').custom).toBe(1);
});

it('preserves unknown keys on edited route when changing explicit fields only', () => {
  const model = createInitModel({
    routes: [{ alias: 'api', target: { protocol: 'http', host: 'localhost', port: 3000 }, custom: 42 }]
  });
  model.editRoute('api', { target: { port: 3001 } });
  const api = model.toConfig().routes.find(r => r.alias === 'api');
  expect(api.custom).toBe(42);
  expect(api.target.port).toBe(3001);
});

it('rejects duplicate alias and returns collision signal', () => {
  const model = createInitModel({
    routes: [{ alias: 'api', target: { protocol: 'http', host: 'localhost', port: 3000 } }]
  });
  const result = model.addRoute({ alias: 'api', target: { protocol: 'http', host: 'localhost', port: 3001 } });
  expect(result.ok).toBe(false);
  expect(result.code).toBe('alias_exists');
});
```

- [ ] **Step 4: Implement minimal mutation engine**

```js
// createInitModel with addRoute/editRoute/removeRoute/listRoutes/getSummary/toConfig
```

- [ ] **Step 5: Re-run init-model tests to GREEN**

Run: `npm run test:run -- tests/unit/init-model.test.js`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add init/model.js tests/unit/init-model.test.js
git commit -m "feat(init): add route mutation model with deterministic summary counters"
```

---

## Chunk 2: Validation, I/O Safety, and Wizard Control Flow

### Task 3: Add Validation Layer for Interactive and Non-Interactive Modes

**Files:**
- Create: `init/validate.js`
- Create: `tests/unit/init-validate.test.js`
- Spec mapping: 2.1 non-interactive matrix, 5.2

- [ ] **Step 1: Write failing tests for alias/target field validation**

```js
import { validateRouteInput } from '../../init/validate.js';

it('validates alias, protocol, host, port', () => {
  expect(validateRouteInput({ alias: 'api', protocol: 'http', host: 'localhost', port: 3000 }).ok).toBe(true);
  expect(validateRouteInput({ alias: '', protocol: 'http', host: 'localhost', port: 3000 }).ok).toBe(false);
});
```

- [ ] **Step 2: Write failing tests for non-interactive action matrix**

```js
import { validateNonInteractiveArgs } from '../../init/validate.js';

it('rejects invalid action combinations', () => {
  const res = validateNonInteractiveArgs({ addAlias: 'api', editAlias: 'web' });
  expect(res.ok).toBe(false);
  expect(res.code).toBe('init_invalid_args');
});

it('enforces add/edit/remove field requirements and rejects metadata flags', () => {
  expect(validateNonInteractiveArgs({ addAlias: 'api' }).ok).toBe(false);
  expect(validateNonInteractiveArgs({ editAlias: 'api' }).ok).toBe(false);
  expect(validateNonInteractiveArgs({ removeAlias: 'api', port: 3000 }).ok).toBe(false);
  const meta = validateNonInteractiveArgs({ editAlias: 'api', healthcheck: '/health' });
  expect(meta.ok).toBe(false);
  expect(meta.code).toBe('init_invalid_args');
});
```

- [ ] **Step 3: Run validation tests to verify RED**

Run: `npm run test:run -- tests/unit/init-validate.test.js`  
Expected: FAIL.

- [ ] **Step 4: Implement validators**

```js
// validateRouteInput, validateNonInteractiveArgs
```

- [ ] **Step 5: Re-run validation tests to GREEN**

Run: `npm run test:run -- tests/unit/init-validate.test.js`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add init/validate.js tests/unit/init-validate.test.js
git commit -m "feat(init): add route and non-interactive argument validation"
```

### Task 4: Implement Load/Atomic Save/Backup I/O Helpers

**Files:**
- Create: `init/io.js`
- Create: `tests/unit/init-io.test.js`
- Spec mapping: 3.3, 5.1 recovery

- [ ] **Step 1: Write failing tests for atomic save success/failure**

```js
import { atomicSaveConfig } from '../../init/io.js';

it('preserves original file when rename fails', async () => {
  const res = await atomicSaveConfig({ path: 'x', content: '{}', deps: failingRenameDeps });
  expect(res.ok).toBe(false);
  expect(res.originalUnchanged).toBe(true);
});
```

- [ ] **Step 2: Write failing tests for parse-failure recovery backup**

```js
import { loadConfigWithRecovery } from '../../init/io.js';

it('creates backup before overwrite after parse failure recovery', async () => {
  const res = await loadConfigWithRecovery({ path: 'devgate.json', chooseCleanTemplate: true, deps: parseFailureDeps });
  expect(res.backupPath).toMatch(/\.bak\./);
});

it('requires explicit confirmation before clean-template recovery and backup', async () => {
  const denied = await loadConfigWithRecovery({ path: 'devgate.json', chooseCleanTemplate: true, confirmRecovery: false, deps: parseFailureDeps });
  expect(denied.ok).toBe(false);
  expect(denied.backupPath).toBeNull();
});
```

- [ ] **Step 3: Write failing tests for Windows locked target path**

```js
it('returns init_error on locked target without mutating original', async () => {
  const res = await atomicSaveConfig({ path: 'devgate.json', content: '{}', deps: windowsLockDeps });
  expect(res.code).toBe('init_error');
  expect(res.originalUnchanged).toBe(true);
});
```

- [ ] **Step 4: Run I/O tests to verify RED**

Run: `npm run test:run -- tests/unit/init-io.test.js`  
Expected: FAIL.

- [ ] **Step 5: Implement I/O helpers**

```js
// loadConfigWithRecovery, atomicSaveConfig with temp write + flush + rename + cleanup
```

- [ ] **Step 6: Re-run I/O tests to GREEN**

Run: `npm run test:run -- tests/unit/init-io.test.js`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add init/io.js tests/unit/init-io.test.js
git commit -m "feat(init): add atomic save and parse recovery helpers"
```

### Task 5: Implement Interactive Wizard Loop

**Files:**
- Create: `init/wizard.js`
- Modify: `init/index.js`
- Modify: `tests/unit/init-index.test.js`
- Spec mapping: 2.2, 4.*, 5.3

- [ ] **Step 1: Add failing tests for first-route guided flow**

```js
it('starts with guided first route when config is empty', async () => {
  const result = await runInit({ interactive: true, deps: guidedFlowDeps });
  expect(result.details.guidedFirstRoute).toBe(true);
});
```

- [ ] **Step 2: Add failing tests for interactive validation non-terminating behavior**

```js
it('keeps wizard running on action-level validation errors', async () => {
  const result = await runInit({ interactive: true, deps: validationErrorThenSaveDeps });
  expect(result.status).toBe('saved');
});

it('requires explicit confirmation for remove and cancel with unsaved changes', async () => {
  const result = await runInit({ interactive: true, deps: removeThenCancelConfirmationDeps });
  expect(result.details.removeConfirmed).toBe(true);
  expect(result.status).toBe('cancelled');
  expect(result.code).toBe('init_cancelled');
});

it('includes actionable remediation text on command-terminating failures', async () => {
  const result = await runInit({ interactive: true, deps: terminatingFailureDeps });
  expect(result.status).toBe('error');
  expect(result.message.length > 0).toBe(true);
});
```

- [ ] **Step 3: Run wizard-focused tests to verify RED**

Run: `npm run test:run -- tests/unit/init-index.test.js -t wizard`  
Expected: FAIL.

- [ ] **Step 4: Implement wizard loop and orchestration integration**

```js
// init/wizard.js action menu loop + confirmations
// init/index.js uses wizard output to produce final contract
```

- [ ] **Step 5: Re-run init-index tests to GREEN**

Run: `npm run test:run -- tests/unit/init-index.test.js`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add init/wizard.js init/index.js tests/unit/init-index.test.js
git commit -m "feat(init): add interactive wizard flow and non-terminating action validation"
```

---

## Chunk 3: CLI Integration, Docs, and Final Verification

### Task 6: Wire `devgate init` into CLI and Add Integration Tests

**Files:**
- Modify: `cli/index.js`
- Create: `tests/integration/init-cli.test.js`
- Spec mapping: 2.*, 3.2

- [ ] **Step 1: Write failing integration tests for CLI init command**

```js
import cli from '../../cli/index.js';

it('runs init --json and returns deterministic contract', async () => {
  const res = await cli.run(['init', '--json', '--dry-run']);
  expect(res.exitCode).toBe(0);
  const parsed = JSON.parse(stdoutText());
  expect(parsed.schema_version).toBe('1');
  expect(parsed.command).toBe('init');
  expect(parsed.status).toBe('preview');
  expect(parsed.code).toBe('init_preview');
  expect(parsed.dryRun).toBe(true);
  expect(typeof parsed.savedPath).toBe('string');
});
```

- [ ] **Step 2: Add failing tests for non-interactive action variants**

```js
it('supports non-interactive add variant', async () => {
  expect((await cli.run(['init', '--non-interactive', '--add-alias', 'api', '--protocol', 'http', '--host', 'localhost', '--port', '3000'])).exitCode).toBe(0);
});

it('supports non-interactive edit variant for protocol|host|port only', async () => {
  expect((await cli.run(['init', '--non-interactive', '--edit-alias', 'api', '--port', '3001'])).exitCode).toBe(0);
});

it('supports non-interactive remove variant', async () => {
  expect((await cli.run(['init', '--non-interactive', '--remove-alias', 'api'])).exitCode).toBe(0);
});

it('rejects metadata edit flags in non-interactive mode', async () => {
  const res = await cli.run(['init', '--non-interactive', '--edit-alias', 'api', '--healthcheck', '/health']);
  expect(res.exitCode).toBe(1);
});
```

- [ ] **Step 3: Add failing tests for invalid non-interactive combinations**

```js
it('returns exitCode 1 and init_invalid_args for invalid action combinations', async () => {
  const res = await cli.run(['init', '--non-interactive', '--add-alias', 'api', '--edit-alias', 'web']);
  expect(res.exitCode).toBe(1);
});

it('returns exitCode 1 for missing required fields per action', async () => {
  expect((await cli.run(['init', '--non-interactive', '--add-alias', 'api'])).exitCode).toBe(1);
  expect((await cli.run(['init', '--non-interactive', '--edit-alias', 'api'])).exitCode).toBe(1);
});

it('supports --json --non-interactive combo with JSON-only output', async () => {
  await cli.run(['init', '--json', '--non-interactive', '--add-alias', 'api', '--protocol', 'http', '--host', 'localhost', '--port', '3000']);
  expect(() => JSON.parse(stdoutText())).not.toThrow();
});

it('keeps stdout JSON-only when --json is used', async () => {
  await cli.run(['init', '--json', '--dry-run']);
  expect(() => JSON.parse(stdoutText())).not.toThrow();
  expect(stdoutText()).not.toContain('Select an action');
});
```

- [ ] **Step 4: Run init CLI integration tests to RED**

Run: `npm run test:run -- tests/integration/init-cli.test.js`  
Expected: FAIL.

- [ ] **Step 5: Implement CLI plumbing for init**

```js
// parse args for init flags/actions
// add help block and command handler
```

- [ ] **Step 6: Re-run init CLI integration tests to GREEN**

Run: `npm run test:run -- tests/integration/init-cli.test.js`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add cli/index.js tests/integration/init-cli.test.js
git commit -m "feat(cli): add init command with interactive and non-interactive flows"
```

### Task 7: Update Documentation for Init-First Onboarding

**Files:**
- Modify: `README.md`
- Modify: `docs/user/quick-start.md`
- Modify: `docs/user/cli-commands.md`
- Modify: `docs/user/troubleshooting.md`

- [ ] **Step 1: Add docs content for `init -> setup -> start` flow**

Required coverage:
- init wizard examples
- non-interactive examples
- dry-run/json behavior
- parse-recovery + backup behavior
- preview exit code semantics
- status/code mapping examples
- non-interactive edit scope limitation (`protocol|host|port`)

- [ ] **Step 2: Validate docs coverage with grep**

Run: `rg -n "devgate init|--non-interactive|--dry-run|--json|backup|init-first|init -> setup -> start" README.md docs/user/*.md`  
Expected: all required sections present.

- [ ] **Step 3: Add explicit docs checklist assertions**

Checklist must be verifiably present in docs:
- preview exit semantics (`status=preview` -> exit code `0`)
- status/code mapping (`saved|cancelled|preview|error`)
- backup format (`<config>.bak.<timestamp>`)
- non-interactive edit scope limitation

- [ ] **Step 4: Commit docs**

```bash
git add README.md docs/user/quick-start.md docs/user/cli-commands.md docs/user/troubleshooting.md
git commit -m "docs: add init-first onboarding and init command references"
```

### Task 8: Final Verification

**Files:**
- Modify (if needed): any failing files

- [ ] **Step 1: Run focused init tests**

Run: `npm run test:run -- "tests/unit/init-*.test.js" "tests/integration/init-cli.test.js"`  
Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run: `npm run test:run`  
Expected: PASS all suites.

- [ ] **Step 3: CLI smoke checks**

Run:
- `node cli/bin/devgate.js init --dry-run --json`
- `node cli/bin/devgate.js init --non-interactive --add-alias demo --protocol http --host localhost --port 3000 --dry-run --json`
- `node cli/bin/devgate.js validate --config ./devgate.json`

Expected:
- deterministic JSON output for dry-run
- non-interactive action path works
- no regressions in validate

- [ ] **Step 4: Add concrete smoke assertions**

Assertions:
- parse JSON from dry-run output and check:
  - `schema_version === "1"`
  - `status === "preview"`
  - `code === "init_preview"`
  - `dryRun === true`
  - `savedPath` is non-null string
- parse JSON from non-interactive dry-run output and assert same contract shape

- [ ] **Step 5: Verify clean working tree before handoff**

Run: `git status --short`  
Expected: clean tree.

---

## Execution Notes

- Keep `init/` logic isolated from terminal formatting concerns.
- Avoid interactive prompts in `--non-interactive`.
- Preserve unknown keys and deterministic route ordering.
- Use dependency injection in unit tests for I/O and prompt flows.

## Verification Checklist Before Declaring Done

- [ ] `devgate init` wizard supports add/edit/remove/list/save/cancel.
- [ ] Multi-route operations work in a single run.
- [ ] Non-interactive action matrix is enforced deterministically.
- [ ] `saved|cancelled|preview|error` status/code mapping is stable.
- [ ] Atomic save + backup recovery behavior is covered and passing.
- [ ] Docs reflect `init -> setup -> start` onboarding flow.
- [ ] `npm run test:run` passes.
