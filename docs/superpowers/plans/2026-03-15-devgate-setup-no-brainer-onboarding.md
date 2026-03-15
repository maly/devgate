# Devgate Setup No-Brainer Onboarding Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an idempotent `devgate setup` command that prepares cert + domain prerequisites and reports start-readiness with stable machine contracts.

**Architecture:** Introduce a dedicated `setup/` orchestration module with step-based execution (`preflight`, `mkcert`, `domain`, `verify`, `summary`) and deterministic result contracts. Integrate a new `setup` CLI command in `cli/index.js` with `--verbose`, `--dry-run`, and `--json`, using explicit precedence and exit semantics. Preserve existing `start`, `doctor`, and `domain` behavior while extending docs and tests to cover new onboarding flow.

**Tech Stack:** Node.js ESM, existing devgate modules (`cli`, `cert`, `domain`, `config`), Vitest.

---

## File Structure

- Create: `setup/index.js`
  - Orchestrator entry, step sequencing, top-level result contract.
- Create: `setup/steps/preflight.js`
  - Environment checks with non-interactive contract.
- Create: `setup/steps/mkcert.js`
  - mkcert available/install/trust flow integration and codes.
- Create: `setup/steps/domain.js`
  - Platform-aware domain setup integration.
- Create: `setup/steps/verify.js`
  - Start-readiness determination (`start_ready`, `projected_start_ready`).
- Create: `setup/summary.js`
  - Human-readable summary rendering.
- Modify: `cli/index.js`
  - New `setup` command + flags + output modes.
- Modify: `tests/integration/domain-cli.test.js`
  - Add setup command scenarios and contracts.
- Create: `tests/unit/setup-orchestrator.test.js`
  - Orchestrator order, mapping, and exit semantics.
- Create: `tests/unit/setup-steps.test.js`
  - Step-level code/status semantics and idempotence boundaries.
- Modify: `README.md`
  - onboarding flow to `setup -> start`.
- Modify: `docs/user/cli-commands.md`
  - setup command docs and flags.
- Modify: `docs/user/quick-start.md`
  - setup-first quickstart.
- Modify: `docs/user/troubleshooting.md`
  - setup remediation playbook.

---

## Chunk 1: Setup Contracts and Orchestrator Core

### Task 1: Add Setup Result Contracts and Step Runner

**Files:**
- Create: `setup/index.js`
- Create: `setup/codes.js`
- Create: `tests/unit/setup-orchestrator.test.js`
- Spec mapping: UX 2.4/2.6, Architecture 3.2/3.4, Error Model 5, Code registry 10

- [ ] **Step 1: Write failing tests for top-level setup result contract**

```js
import { runSetup } from '../../setup/index.js';

it('returns top-level schema contract', async () => {
  const result = await runSetup({ dryRun: false, verbose: false, json: true, deps: fakeDepsReady });
  expect(result).toMatchObject({
    schema_version: '1',
    command: 'setup',
    start_ready: expect.any(Boolean),
    projected_start_ready: expect.any(Boolean),
    exit_code: expect.any(Number),
    code: expect.any(String),
    summary: expect.any(Object),
    steps: expect.any(Array)
  });
  expect(result.command).toBe('setup');
  expect(result.schema_version).toBe('1');
  expect([0, 1]).toContain(result.exit_code);
});
```

- [ ] **Step 2: Run test to verify RED state**

Run: `npm run test:run -- tests/unit/setup-orchestrator.test.js`  
Expected: FAIL (missing module/function).

- [ ] **Step 3: Add failing tests for deterministic step order**

```js
it('executes steps in order preflight->mkcert->domain->verify->summary', async () => {
  const calls = [];
  await runSetup({ deps: fakeDeps(calls) });
  expect(calls).toEqual(['preflight', 'mkcert', 'domain', 'verify', 'summary']);
});
```

- [ ] **Step 4: Add failing tests for exit code mapping**

```js
it('maps projected_start_ready true to exit_code 0 in dry-run', async () => {
  const result = await runSetup({ dryRun: true, deps: fakeProjectedReadyDeps });
  expect(result.projected_start_ready).toBe(true);
  expect(result.exit_code).toBe(0);
});

it('maps projected_start_ready false to exit_code 1 in dry-run', async () => {
  const result = await runSetup({ dryRun: true, deps: fakeProjectedNotReadyDeps });
  expect(result.projected_start_ready).toBe(false);
  expect(result.exit_code).toBe(1);
});

it('maps start_ready true to exit_code 0 in non-dry-run', async () => {
  const result = await runSetup({ dryRun: false, deps: fakeStartReadyDeps });
  expect(result.start_ready).toBe(true);
  expect(result.exit_code).toBe(0);
});

it('maps start_ready false to exit_code 1 in non-dry-run', async () => {
  const result = await runSetup({ dryRun: false, deps: fakeStartNotReadyDeps });
  expect(result.start_ready).toBe(false);
  expect(result.exit_code).toBe(1);
});
```

- [ ] **Step 5: Run targeted RED test for exit mapping**

Run: `npm run test:run -- tests/unit/setup-orchestrator.test.js -t "exit_code"`  
Expected: FAIL.

- [ ] **Step 6: Add failing test for abort-class errors partial-results contract**

```js
it('returns setup_internal_error with partial steps on abort-class errors', async () => {
  const result = await runSetup({ deps: fakeAbortAfterPreflightDeps });
  expect(result.exit_code).toBe(1);
  expect(result.code).toBe('setup_internal_error');
  expect(result.steps.length).toBeGreaterThan(0);
});
```

- [ ] **Step 7: Implement minimal orchestrator and code registry usage**

```js
// setup/index.js
// export async function runSetup({ dryRun, verbose, json, deps }) { ... }
// returns top-level result and ordered step array
// setup/codes.js
// export const SETUP_CODES = [...]
```

- [ ] **Step 8: Re-run setup orchestrator tests to GREEN**

Run: `npm run test:run -- tests/unit/setup-orchestrator.test.js`  
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add setup/index.js setup/codes.js tests/unit/setup-orchestrator.test.js
git commit -m "feat(setup): add orchestrator and setup result contracts"
```

### Task 2: Add Step Result Shapes and Stable Code Registry Enforcement

**Files:**
- Create: `setup/steps/preflight.js`
- Create: `setup/steps/mkcert.js`
- Create: `setup/steps/domain.js`
- Create: `setup/steps/verify.js`
- Create: `setup/steps/summary.js`
- Create: `tests/unit/setup-steps.test.js`
- Spec mapping: 3.2, 4.*, 5, 10

- [ ] **Step 1: Write failing tests for step schema and required fields**

```js
import { runPreflightStep } from '../../setup/steps/preflight.js';

it('step result contains required fields', async () => {
  const step = await runPreflightStep({ dryRun: true, deps: fakeDeps });
  expect(step).toEqual(expect.objectContaining({
    schema_version: '1',
    step_id: 'preflight',
    status: expect.any(String),
    code: expect.any(String),
    message: expect.any(String),
    remediation: expect.any(Array),
    details: expect.any(Object),
    duration_ms: expect.any(Number)
  }));
});
```

- [ ] **Step 2: Add failing tests for stable code naming conventions**

```js
import { SETUP_CODES } from '../../setup/codes.js';

it('uses allowed code families', async () => {
  const step = await runPreflightStep({ dryRun: true, deps: fakeDeps });
  expect(SETUP_CODES).toContain(step.code);
});
```

- [ ] **Step 3: Run targeted RED tests for schema/code constraints**

Run: `npm run test:run -- tests/unit/setup-steps.test.js -t "required fields|allowed"`  
Expected: FAIL.

- [ ] **Step 4: Add failing tests for windows domain not_applicable path**

```js
import { runDomainStep } from '../../setup/steps/domain.js';

it('returns not_applicable on win32', async () => {
  const step = await runDomainStep({ platform: 'win32', dryRun: false, deps: fakeDeps });
  expect(step.status).toBe('not_applicable');
  expect(step.code).toBe('domain_not_applicable');
});
```

- [ ] **Step 5: Add failing tests for no-interactive privilege policy**

```js
it('returns permission code instead of blocking prompt', async () => {
  const step = await runDomainStep({ platform: 'linux', dryRun: false, deps: needsSudoDeps });
  expect(step.code).toBe('domain_permission_denied');
  expect(step.remediation[0].command).toContain('sudo');
});
```

- [ ] **Step 6: Add failing tests for contract rules and summary step**

```js
import { runSummaryStep } from '../../setup/steps/summary.js';

it('enforces status enum and duration constraints', async () => {
  const step = await runSummaryStep({ deps: fakeDeps });
  expect(['ok', 'warn', 'fail', 'not_applicable']).toContain(step.status);
  expect(Number.isInteger(step.duration_ms)).toBe(true);
  expect(step.duration_ms).toBeGreaterThanOrEqual(0);
});

it('requires non-optional remediation on fail status', async () => {
  const step = await runDomainStep({ platform: 'linux', dryRun: false, deps: needsSudoDeps });
  expect(step.status).toBe('fail');
  expect(step.remediation.some(r => r.optional === false)).toBe(true);
});
```

- [ ] **Step 7: Run targeted RED tests for domain + summary**

Run: `npm run test:run -- tests/unit/setup-steps.test.js -t "domain|summary|remediation"`  
Expected: FAIL.

- [ ] **Step 8: Implement step modules in micro-steps**

1. Implement `setup/steps/preflight.js` minimal return contract  
2. Implement `setup/steps/mkcert.js` minimal return contract  
3. Implement `setup/steps/domain.js` minimal return contract  
4. Implement `setup/steps/verify.js` minimal return contract  
5. Implement `setup/steps/summary.js` minimal return contract

```js
// use shared step-result helper and SETUP_CODES exact membership
```

- [ ] **Step 9: Re-run step unit tests to GREEN**

Run: `npm run test:run -- tests/unit/setup-steps.test.js`  
Expected: PASS.

- [ ] **Step 10: Run all setup unit tests**

Run: `npm run test:run -- "tests/unit/setup-*.test.js"`  
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add setup/steps/preflight.js setup/steps/mkcert.js setup/steps/domain.js setup/steps/verify.js setup/steps/summary.js setup/codes.js tests/unit/setup-steps.test.js
git commit -m "feat(setup): add step modules and stable status codes"
```

---

## Chunk 2: CLI Integration and Output Modes

### Task 3: Wire `devgate setup` Command into CLI

**Files:**
- Modify: `cli/index.js`
- Modify: `tests/integration/domain-cli.test.js`
- Spec mapping: 2.1/2.2/2.5/2.6, 3.4

- [ ] **Step 1: Write failing integration test for `devgate setup` basic command**

```js
it('runs setup and returns exit code based on start_ready in non-dry-run mode', async () => {
  const result = await cli.run(['setup']);
  if (result.start_ready) {
    expect(result.exitCode).toBe(0);
  } else {
    expect(result.exitCode).toBe(1);
  }
});
```

- [ ] **Step 2: Write failing integration test for `--json` output shape**

```js
it('setup --json prints top-level schema contract', async () => {
  await cli.run(['setup', '--json']);
  const output = collectedStdout();
  const parsed = JSON.parse(output);
  expect(parsed.schema_version).toBe('1');
  expect(parsed.command).toBe('setup');
  expect(typeof parsed.start_ready).toBe('boolean');
  expect(typeof parsed.projected_start_ready).toBe('boolean');
  expect([0, 1]).toContain(parsed.exit_code);
  expect(typeof parsed.code).toBe('string');
  expect(parsed.summary).toBeTruthy();
  expect(parsed.steps).toBeInstanceOf(Array);
});
```

- [ ] **Step 3: Write failing integration test for `--dry-run` projection semantics**

```js
it('setup --dry-run uses projected_start_ready for exit code', async () => {
  const result = await cli.run(['setup', '--dry-run', '--json']);
  expect(result.exitCode).toBe(0);
});
```

- [ ] **Step 4: Write failing integration test for flag precedence**

```js
it('setup --json --verbose emits json only', async () => {
  await cli.run(['setup', '--json', '--verbose']);
  const output = collectedStdout();
  expect(() => JSON.parse(output)).not.toThrow();
  expect(output).not.toContain('Running setup');
});
```

- [ ] **Step 5: Add failing integration tests for dry-run verbose combinations**

```js
it('setup --dry-run --verbose renders detailed human logs', async () => {
  await cli.run(['setup', '--dry-run', '--verbose']);
  expect(collectedStdout()).toContain('dry-run');
});

it('setup --dry-run --json --verbose emits JSON only with details.logs', async () => {
  await cli.run(['setup', '--dry-run', '--json', '--verbose']);
  const parsed = JSON.parse(collectedStdout());
  expect(parsed.details?.logs).toBeTruthy();
});
```

- [ ] **Step 6: Implement CLI command handler + parser flags**

```js
// cli/index.js
// add command help, parse flags, runSetup invocation, output routing
```

- [ ] **Step 7: Re-run integration setup tests to GREEN**

Run: `npm run test:run -- tests/integration/domain-cli.test.js -t setup`  
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add cli/index.js tests/integration/domain-cli.test.js
git commit -m "feat(cli): add devgate setup command and output modes"
```

### Task 4: Integrate Existing mkcert/domain modules in Setup Steps

**Files:**
- Modify: `setup/steps/mkcert.js`
- Modify: `setup/steps/domain.js`
- Modify: `tests/unit/setup-steps.test.js`
- Spec mapping: 4.2/4.3, 5

- [ ] **Step 1: Add failing tests for mkcert missing -> auto-install attempt**

```js
it('attempts mkcert install when missing', async () => {
  const step = await runMkcertStep({ dryRun: false, deps: mkcertMissingDeps });
  expect(mkcertMissingDeps.installCalled).toBe(true);
});
```

- [ ] **Step 2: Add failing tests for installer timeout and fallback codes**

```js
it('returns mkcert_install_failed with warn when fallback keeps readiness', async () => {
  const step = await runMkcertStep({ dryRun: false, deps: timeoutDeps });
  expect(step.code).toBe('mkcert_install_failed');
  expect(step.status).toBe('warn');
});

it('returns mkcert_install_failed with fail when readiness remains blocked', async () => {
  const step = await runMkcertStep({ dryRun: false, deps: blockingTimeoutDeps });
  expect(step.code).toBe('mkcert_install_failed');
  expect(step.status).toBe('fail');
  expect(step.remediation.some(r => r.optional === false)).toBe(true);
});
```

- [ ] **Step 3: Add failing tests for linux/mac domain setup integration**

```js
it('calls existing setupDomainResolver on linux', async () => {
  await runDomainStep({ platform: 'linux', dryRun: false, deps: domainDeps });
  expect(domainDeps.setupDomainResolverCalled).toBe(true);
});

it('calls existing setupDomainResolver on darwin', async () => {
  await runDomainStep({ platform: 'darwin', dryRun: false, deps: domainDeps });
  expect(domainDeps.setupDomainResolverCalled).toBe(true);
});
```

- [ ] **Step 4: Implement mkcert/domain step adapters**

```js
// setup/steps/mkcert.js uses CertManager.checkMkcert/installMkcert
// setup/steps/domain.js uses getDomainStatus/setupDomainResolver
```

- [ ] **Step 5: Re-run setup unit+integration tests**

Run: `npm run test:run -- "tests/unit/setup-*.test.js" "tests/integration/domain-cli.test.js" -t "setup"`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add setup/steps/mkcert.js setup/steps/domain.js tests/unit/setup-steps.test.js tests/integration/domain-cli.test.js
git commit -m "feat(setup): wire mkcert and domain integrations"
```

---

## Chunk 3: Verification, Docs, and Final Validation

### Task 5: Add Verify Step and Final Aggregation Semantics

**Files:**
- Modify: `setup/steps/verify.js`
- Modify: `setup/index.js`
- Modify: `tests/unit/setup-orchestrator.test.js`
- Modify: `tests/unit/setup-steps.test.js`
- Spec mapping: 2.4/2.6, 3.4, 9

- [ ] **Step 1: Add failing tests for `start_ready` vs `projected_start_ready`**

```js
it('verify computes both current and projected readiness', async () => {
  const result = await runSetup({ dryRun: true, deps: verifyDeps });
  expect(result).toMatchObject({
    start_ready: expect.any(Boolean),
    projected_start_ready: expect.any(Boolean)
  });
});
```

- [ ] **Step 2: Add failing tests for top-level code mapping**

```js
it('uses setup_projected_ready code when dry-run projection is ready', async () => {
  const result = await runSetup({ dryRun: true, deps: projectedReadyDeps });
  expect(result.code).toBe('setup_projected_ready');
});

it('uses setup_projected_not_ready code when dry-run projection is not ready', async () => {
  const result = await runSetup({ dryRun: true, deps: projectedNotReadyDeps });
  expect(result.code).toBe('setup_projected_not_ready');
});

it('uses setup_ready/setup_not_ready in non-dry-run based on start_ready', async () => {
  const ready = await runSetup({ dryRun: false, deps: startReadyDeps });
  const notReady = await runSetup({ dryRun: false, deps: startNotReadyDeps });
  expect(ready.code).toBe('setup_ready');
  expect(notReady.code).toBe('setup_not_ready');
});
```

- [ ] **Step 3: Add failing tests for final exit mapping matrix**

```js
it('maps readiness to exit code by mode', async () => {
  const a = await runSetup({ dryRun: false, deps: startReadyDeps });
  const b = await runSetup({ dryRun: false, deps: startNotReadyDeps });
  const c = await runSetup({ dryRun: true, deps: projectedReadyDeps });
  const d = await runSetup({ dryRun: true, deps: projectedNotReadyDeps });
  expect(a.exit_code).toBe(0);
  expect(b.exit_code).toBe(1);
  expect(c.exit_code).toBe(0);
  expect(d.exit_code).toBe(1);
});
```

- [ ] **Step 4: Add failing regression test for diverging current/projected readiness**

```js
it('uses start_ready for non-dry-run and projected_start_ready for dry-run', async () => {
  const deps = divergingReadinessDeps; // start_ready=false, projected_start_ready=true
  const nonDry = await runSetup({ dryRun: false, deps });
  const dry = await runSetup({ dryRun: true, deps });
  expect(nonDry.exit_code).toBe(1);
  expect(dry.exit_code).toBe(0);
});
```

- [ ] **Step 5: Implement verify and top-level mapping**

```js
// verify step derives readiness from step outcomes and fallback capability
// orchestrator derives code/exit_code from readiness rules
```

- [ ] **Step 6: Re-run all setup tests**

Run: `npm run test:run -- "tests/unit/setup-*.test.js" "tests/integration/domain-cli.test.js" -t "setup"`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add setup/steps/verify.js setup/index.js tests/unit/setup-orchestrator.test.js tests/unit/setup-steps.test.js
git commit -m "feat(setup): add readiness verification and final status mapping"
```

### Task 6: Documentation Updates for Setup-First Onboarding

**Files:**
- Modify: `README.md`
- Modify: `docs/user/cli-commands.md`
- Modify: `docs/user/quick-start.md`
- Modify: `docs/user/troubleshooting.md`

- [ ] **Step 1: Add docs tests/checklist markers in content**

Required content:
- setup-first onboarding (`devgate setup` then `devgate start`)
- setup flags and examples
- dry-run/json semantics summary
- common remediation examples

- [ ] **Step 2: Validate docs coverage**

Run: `rg -n "devgate setup|--dry-run|--json|projected_start_ready|setup-first" README.md docs/user/*.md`  
Expected: required sections present.

- [ ] **Step 3: Commit docs**

```bash
git add README.md docs/user/cli-commands.md docs/user/quick-start.md docs/user/troubleshooting.md
git commit -m "docs: add setup-first onboarding and setup command reference"
```

### Task 7: Final Verification

**Files:**
- Modify (if needed): any failing-test files

- [ ] **Step 1: Run full test suite**

Run: `npm run test:run`  
Expected: PASS all suites.

- [ ] **Step 2: CLI smoke checks**

Run:
- `node cli/bin/devgate.js setup --dry-run`
- `node cli/bin/devgate.js setup --json --dry-run`
- `node cli/bin/devgate.js doctor --config ./devgate.json`

Expected:
- setup commands complete with valid output contract
- no regressions in doctor output

- [ ] **Step 3: Validate working tree**

Run: `git status --short`  
Expected: clean working tree before handoff.

---

## Execution Notes

- Keep setup orchestration isolated from CLI formatting where possible.
- Prefer deterministic, mockable dependencies in tests; no real privileged operations in CI.
- Maintain existing command compatibility; no behavior regressions in `start`, `doctor`, `domain`.
- Keep code paths non-interactive to avoid hanging setup flows.

## Verification Checklist Before Declaring Done

- [ ] `devgate setup` exists and is idempotent.
- [ ] `--verbose`, `--dry-run`, `--json` behavior matches contract.
- [ ] `--dry-run` exit code follows projected readiness semantics.
- [ ] Windows returns domain `not_applicable`.
- [ ] macOS/Linux domain failure path preserves fallback viability.
- [ ] Stable code registry is enforced in tests.
- [ ] Docs reflect setup-first onboarding.
- [ ] `npm run test:run` passes.
