# Native .devgate Domains Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native `.devgate` hostname support on macOS/Linux with automatic `sslip` fallback, while keeping Windows behavior unchanged.

**Architecture:** Introduce a new `domain/` module with provider abstraction and a single strategy decision point. Wire CLI `start` and new `domain` commands to this module, update hostname/certificate flows, and preserve startup reliability through structured status and fallback semantics.

**Tech Stack:** Node.js ESM, built-in OS/process/fs tools, Vitest.

---

## Chunk 1: Domain Core Contracts and Strategy Resolution

### Task 1: Create Domain Status Contract and Strategy Resolver

**Files:**
- Create: `domain/strategy-resolver.js`
- Create: `domain/index.js`
- Create: `tests/unit/domain-strategy-resolver.test.js`
- Create: `tests/unit/domain-index.test.js`
**Spec mapping:** Spec 2.2 (precedence + single decision point), Spec 3 (`domain/index.js` contract), Spec 5 (structured error/fallback model)

Resolver decision table (must be encoded as tests):

| Platform | Mode | Status | Strategy | Fallback | warningCode |
|---|---|---|---|---|---|
| `win32` | any | any | `sslip` | `false` | `windows_forced_sslip` |
| `darwin|linux` | `sslip` | any | `sslip` | `false` | `null` |
| `darwin|linux` | `devgate` | `ready` | `devgate` | `false` | `null` |
| `darwin|linux` | `devgate` | `missing|unsupported|error` | `sslip` | `true` | status `code` |
| `darwin|linux` | `auto` | `ready` | `devgate` | `false` | `null` |
| `darwin|linux` | `auto` | `missing|unsupported|error` | `sslip` | `true` | status `code` |

- [ ] **Step 1: Write failing tests for strategy resolution matrix**

```js
import { resolveDomainStrategy } from '../../domain/strategy-resolver.js';

it.each([
  { platform: 'win32', mode: 'auto', status: { status: 'ready', code: 'resolver_ready' }, expected: { strategy: 'sslip', fallback: false, warningCode: 'windows_forced_sslip' } },
  { platform: 'linux', mode: 'sslip', status: { status: 'ready', code: 'resolver_ready' }, expected: { strategy: 'sslip', fallback: false, warningCode: null } },
  { platform: 'linux', mode: 'devgate', status: { status: 'ready', code: 'resolver_ready' }, expected: { strategy: 'devgate', fallback: false, warningCode: null } },
  { platform: 'linux', mode: 'devgate', status: { status: 'missing', code: 'resolver_missing' }, expected: { strategy: 'sslip', fallback: true, warningCode: 'resolver_missing' } },
  { platform: 'darwin', mode: 'auto', status: { status: 'ready', code: 'resolver_ready' }, expected: { strategy: 'devgate', fallback: false, warningCode: null } },
  { platform: 'darwin', mode: 'auto', status: { status: 'unsupported', code: 'provider_unsupported' }, expected: { strategy: 'sslip', fallback: true, warningCode: 'provider_unsupported' } },
  { platform: 'darwin', mode: 'auto', status: { status: 'error', code: 'provider_error' }, expected: { strategy: 'sslip', fallback: true, warningCode: 'provider_error' } }
])('resolves strategy matrix %#', ({ platform, mode, status, expected }) => {
  const result = resolveDomainStrategy({ platform, mode, status });
  expect(result).toEqual(expected);
});
```

- [ ] **Step 2: Run tests to verify RED state**

Run: `npm run test:run -- tests/unit/domain-strategy-resolver.test.js`
Expected: FAIL with missing module/function.

- [ ] **Step 3: Write failing tests for status normalization contract**

```js
import { normalizeDomainStatus } from '../../domain/index.js';

it('normalizes partial input to strict shape', () => {
  const status = normalizeDomainStatus({ status: 'missing', code: 'resolver_missing' });
  expect(status).toEqual({
    status: 'missing',
    code: 'resolver_missing',
    message: '',
    remediation: '',
    platform: 'unknown',
    provider: 'unknown',
    details: {}
  });
});

it('maps unknown status to error/provider_error', () => {
  const status = normalizeDomainStatus({ status: 'weird' });
  expect(status.status).toBe('error');
  expect(status.code).toBe('provider_error');
});
```

- [ ] **Step 4: Run status normalization tests to verify RED state**

Run: `npm run test:run -- tests/unit/domain-index.test.js`
Expected: FAIL with missing module/function.

- [ ] **Step 5: Implement strategy resolver and normalization**

```js
export function resolveDomainStrategy({ platform, mode, status }) {
  // implement exact decision table above
  // returns { strategy, fallback, warningCode }
}

export function normalizeDomainStatus(input = {}) {
  // strict shape:
  // { status, code, message, remediation, platform, provider, details }
  // unknown/invalid values map to { status:'error', code:'provider_error' }
}
```

- [ ] **Step 6: Re-run resolver + status tests to verify GREEN state**

Run: `npm run test:run -- tests/unit/domain-strategy-resolver.test.js tests/unit/domain-index.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add domain/strategy-resolver.js domain/index.js tests/unit/domain-strategy-resolver.test.js tests/unit/domain-index.test.js
git commit -m "feat(domain): add strategy decision table and status normalization contract"
```

### Task 2: Add Provider Interface and OS Dispatch

**Files:**
- Create: `domain/providers/macos-resolver.js`
- Create: `domain/providers/linux-resolved.js`
- Modify: `domain/index.js`
- Create: `tests/unit/domain-providers.test.js`
**Spec mapping:** Spec 2.1 provider layer, Spec 4.4 linux matrix, Spec 5 idempotency rules

- [ ] **Step 1: Write failing tests for provider dispatch and Linux matrix codes**

```js
it('returns unsupported with resolvectl_missing when linux lacks resolvectl', async () => {
  const status = await getDomainStatus({ platform: 'linux', deps: mockedDepsNoResolvectl });
  expect(status.status).toBe('unsupported');
  expect(status.code).toBe('resolvectl_missing');
});

it('routes darwin to macos provider', async () => {
  const status = await getDomainStatus({ platform: 'darwin', deps: mockedDeps });
  expect(status.provider).toBe('macos-resolver');
});

it('returns unsupported/resolved_not_running when systemd-resolved is inactive', async () => {
  const status = await getDomainStatus({ platform: 'linux', deps: mockedResolvedInactive });
  expect(status).toMatchObject({ status: 'unsupported', code: 'resolved_not_running', provider: 'linux-resolved' });
});

it('returns unsupported/provider_unsupported on non-systemd linux', async () => {
  const status = await getDomainStatus({ platform: 'linux', deps: mockedNonSystemd });
  expect(status).toMatchObject({ status: 'unsupported', code: 'provider_unsupported', provider: 'linux-resolved' });
});

it('returns unsupported/provider_unsupported on win32 in domain manager', async () => {
  const status = await getDomainStatus({ platform: 'win32', deps: mockedDeps });
  expect(status).toMatchObject({ status: 'unsupported', code: 'provider_unsupported' });
});
```

- [ ] **Step 2: Run provider tests (expect fail)**

Run: `npm run test:run -- tests/unit/domain-providers.test.js`
Expected: FAIL on missing dispatch/provider methods.

- [ ] **Step 3: Add failing idempotency tests for setup/teardown**

```js
it('setup is idempotent when called twice', async () => {
  await setupDomainResolver(ctx);
  const firstWrites = ctx.writeCount;
  await setupDomainResolver(ctx);
  expect(ctx.writeCount).toBe(firstWrites);
});

it('teardown is idempotent when called twice', async () => {
  await teardownDomainResolver(ctx);
  const firstRemovals = ctx.removeCount;
  await teardownDomainResolver(ctx);
  expect(ctx.removeCount).toBe(firstRemovals);
});

it('setup->teardown->setup recovers from partial state', async () => {
  await setupDomainResolver(ctx);
  await teardownDomainResolver(ctx);
  await setupDomainResolver(ctx);
  expect(ctx.isConfigured()).toBe(true);
});
```

- [ ] **Step 4: Run provider + idempotency tests (expect fail)**

Run: `npm run test:run -- tests/unit/domain-providers.test.js`
Expected: FAIL on missing idempotency/provider implementations.

- [ ] **Step 5: Implement provider interface and dispatch in small steps**

```js
// 1) Implement provider modules with consistent IDs:
//    macos provider => provider:'macos-resolver'
//    linux provider => provider:'linux-resolved'
// 2) Implement getDomainStatus dispatch in domain/index.js
// 3) Implement setupDomainResolver / teardownDomainResolver with idempotent semantics
```

- [ ] **Step 6: Re-run provider tests**

Run: `npm run test:run -- tests/unit/domain-providers.test.js`
Expected: PASS.

- [ ] **Step 7: Run full domain unit suite as regression guard**

Run: `npm run test:run -- tests/unit/domain-*.test.js`
Expected: PASS (no regressions across resolver/normalization/provider contracts).

- [ ] **Step 8: Commit**

```bash
git add domain/providers/macos-resolver.js domain/providers/linux-resolved.js domain/index.js tests/unit/domain-providers.test.js
git commit -m "feat(domain): add platform providers and linux status matrix"
```

---

## Chunk 2: Runtime Integration (Config, Hostnames, Certificates, CLI)

### Task 3: Add domainMode Config and Hostname Builder Support

**Files:**
- Modify: `config/index.js`
- Modify: `api/hostname-builder.js`
- Modify: `tests/unit/config.test.js`
- Modify: `tests/unit/hostname-builder.test.js`
- Modify: `tests/integration/domain-cli.test.js`

- [ ] **Step 1: Add failing tests for `domainMode`, source precedence, and `devgate` hostnames**

```js
it('accepts domainMode auto|sslip|devgate', () => { /* validateConfig */ });
it('builds app.devgate and dev.devgate when strategy devgate', () => { /* buildHostnames */ });
it('prefers --domain-mode over config domainMode and default auto', async () => {
  // CLI integration: explicit flag wins over config/default
});
```

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npm run test:run -- tests/unit/config.test.js tests/unit/hostname-builder.test.js tests/integration/domain-cli.test.js -t domain-mode`
Expected: FAIL on unknown config option/strategy.

- [ ] **Step 3: Implement config + hostname strategy changes**

```js
// config defaults include domainMode: 'auto'
// validate domainMode enum
// hostname-builder strategy branch for devgate
// wire CLI --domain-mode override with precedence over config/default
```

- [ ] **Step 4: Re-run focused tests**

Run: `npm run test:run -- tests/unit/config.test.js tests/unit/hostname-builder.test.js tests/integration/domain-cli.test.js -t domain-mode`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add config/index.js api/hostname-builder.js tests/unit/config.test.js tests/unit/hostname-builder.test.js tests/integration/domain-cli.test.js
git commit -m "feat(config): add domainMode and .devgate hostname strategy"
```

### Task 4: Ensure Certificate SAN Coverage for `.devgate`

**Files:**
- Modify: `cert/index.js`
- Modify: `tests/unit/cert-manager.test.js`

- [ ] **Step 1: Add failing cert tests for `.devgate` SAN behavior**

```js
it('includes .devgate hostnames in certificate generation host list', async () => {
  // assert ensureCertificates receives generated app.devgate/dev.devgate names
});
```

- [ ] **Step 2: Run cert tests (expect fail if behavior absent)**

Run: `npm run test:run -- tests/unit/cert-manager.test.js`
Expected: FAIL for missing/new assertion.

- [ ] **Step 3: Implement minimal SAN handling updates**

```js
// ensure no filtering rejects .devgate hostnames
// keep existing localhost/loopback SAN behavior
```

- [ ] **Step 4: Re-run cert tests**

Run: `npm run test:run -- tests/unit/cert-manager.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cert/index.js tests/unit/cert-manager.test.js
git commit -m "feat(cert): include .devgate hostnames in cert SAN flow"
```

### Task 5: Add CLI Domain Commands + Start Fallback Logic

**Files:**
- Modify: `cli/index.js`
- Create: `tests/integration/domain-cli.test.js`
- Modify: `tests/integration/http-routing.test.js`

- [ ] **Step 1: Add failing integration tests for command and fallback behavior**

```js
it('domain status prints structured resolver state on linux/macos', async () => { /* mock domain status */ });
it('start on linux with missing resolver logs warning with sudo setup instruction and uses sslip hostnames', async () => {
  // assert output includes "sudo devgate domain setup" and warning code
});
it('start on linux with ready resolver uses .devgate hostnames', async () => { /* assert hostnames */ });
it('start on windows forces sslip even when mode devgate', async () => { /* assert strategy */ });
it('start on linux with explicit mode devgate and missing resolver still falls back to sslip without non-zero exit', async () => {
  // assert fallback + warning, process keeps running
});
```

- [ ] **Step 2: Run CLI integration tests to verify RED state**

Run: `npm run test:run -- tests/integration/domain-cli.test.js`
Expected: FAIL on missing command paths/logic.

- [ ] **Step 3: Implement CLI command group and strategy application**

```js
// add command handlers:
// - domain status
// - domain setup
// - domain teardown
// in start:
// - check domain status on macOS/Linux
// - resolve strategy via domain/strategy-resolver
// - warning + auto fallback to sslip on missing/error
// - keep process exit code success for fallback path
```

- [ ] **Step 4: Re-run CLI integration tests**

Run: `npm run test:run -- tests/integration/domain-cli.test.js tests/integration/http-routing.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/index.js tests/integration/domain-cli.test.js tests/integration/http-routing.test.js
git commit -m "feat(cli): add domain commands and automatic sslip fallback"
```

---

## Chunk 3: Doctor, Docs, and Final Verification

### Task 6: Extend doctor Output with Resolver/Fallback Visibility

**Files:**
- Modify: `cli/index.js`
- Modify: `tests/integration/domain-cli.test.js`

- [ ] **Step 1: Add failing tests for doctor resolver/fallback output**

```js
it('doctor reports resolver status code and active strategy', async () => {
  // mock resolver status -> assert output includes code + selected strategy
});
it('doctor reports fallback=true when strategy resolved to sslip due to missing resolver', async () => {
  // ensure fallback visibility is explicit
});
```

- [ ] **Step 2: Run doctor-focused tests (expect fail)**

Run: `npm run test:run -- tests/integration/domain-cli.test.js -t doctor`
Expected: FAIL until doctor output is extended.

- [ ] **Step 3: Implement doctor reporting fields**

```js
// include: platform provider, status code, effective strategy, fallback active
```

- [ ] **Step 4: Re-run doctor-focused tests**

Run: `npm run test:run -- tests/integration/domain-cli.test.js -t doctor`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/index.js tests/integration/domain-cli.test.js
git commit -m "feat(doctor): report domain resolver status and fallback strategy"
```

### Task 7: Update Documentation and Decision Table

**Files:**
- Modify: `README.md`
- Modify: `docs/user/configuration.md`
- Modify: `docs/user/cli-commands.md`
- Modify: `docs/user/troubleshooting.md`

- [ ] **Step 1: Add docs content for domain commands, prerequisites, and matrix**

Content requirements:
- macOS/Linux resolver prerequisites and sudo requirement
- `devgate domain setup|status|teardown` command usage
- fallback semantics and warning behavior
- platform/mode/status decision table
- explicit Windows behavior (sslip only)

- [ ] **Step 2: Validate docs coverage with grep checks**

Run:
- `rg -n "domain setup|domain status|domain teardown|platform|fallback|sslip|devgate" README.md docs/user/*.md`

Expected: all required sections present.

- [ ] **Step 3: Commit docs**

```bash
git add README.md docs/user/configuration.md docs/user/cli-commands.md docs/user/troubleshooting.md
git commit -m "docs: add .devgate resolver workflow and fallback matrix"
```

### Task 8: Final Verification

**Files:**
- Modify (if needed): `package.json` (only if scripts/docs need adjustment)

- [ ] **Step 1: Run full test suite**

Run: `npm run test:run`
Expected: PASS all Vitest suites.

- [ ] **Step 2: Run focused CLI smoke**

Run:
- `node cli/bin/devgate.js domain status`
- `node cli/bin/devgate.js validate --config ./devgate.json`
- `node cli/bin/devgate.js doctor --config ./devgate.json`

Expected:
- commands complete with expected output and no unhandled exceptions.

- [ ] **Step 3: Check working tree and summarize behavior evidence**

Run: `git status --short`
Expected: clean working tree before final handoff.

---

## Execution Notes

- Keep provider logic free of direct CLI formatting; return structured contract and format in CLI layer only.
- Do not let domain resolver failures abort `start` on macOS/Linux.
- Preserve backwards compatibility for existing sslip users.
- Keep unit tests deterministic with provider/process mocks (no real privileged operations in CI).

## Verification Checklist Before Declaring Done

- [ ] Windows still forced to `sslip`.
- [ ] macOS/Linux with ready resolver uses `.devgate` hostnames.
- [ ] macOS/Linux missing/error resolver logs warning and auto-falls back to `sslip`.
- [ ] `domain setup` / `domain teardown` are idempotent.
- [ ] doctor reports resolver status and fallback visibility.
- [ ] docs include decision table and new command workflow.
- [ ] `npm run test:run` passes.
