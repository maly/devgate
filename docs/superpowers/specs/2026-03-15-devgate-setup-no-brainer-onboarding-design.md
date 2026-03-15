# Devgate No-Brainer Onboarding Phase 1: `devgate setup`

**Date:** 2026-03-15  
**Project:** devgate  
**Scope:** Introduce a single idempotent onboarding command that prepares local environment for immediate use.

## 1. Goal and Non-Goals

### Goal
Make devgate a no-brainer local testing choice by reducing first-run friction to one command:

```bash
devgate setup
```

### In-scope
- New command: `devgate setup`
- Setup orchestration pipeline:
  - preflight
  - mkcert install/trust
  - domain setup (macOS/Linux)
  - verify
  - summary
- Idempotent behavior (safe repeated runs)
- CLI flags:
  - `--verbose`
  - `--dry-run`
  - `--json`
- Structured step statuses and stable exit behavior
- Documentation updates for onboarding flow

### Non-goals
- No VS Code extension work in this phase
- No auto-discovery of routes/apps in this phase
- No refactor of existing proxy routing model

## 2. UX and CLI Contract

## 2.1 Commands
- `devgate setup`
- `devgate setup --verbose`
- `devgate setup --dry-run`
- `devgate setup --json`

## 2.2 Output Modes
- Default: concise, human-readable
- `--verbose`: detailed operational logs
- `--dry-run`: no system mutation, action preview only
- `--json`: machine-readable stable structure

## 2.3 Idempotence
- Re-running `devgate setup` must not break existing state.
- Re-running should confirm healthy state and repair drift where safe.

## 2.4 Exit Codes
- `0`: environment usable for normal `devgate start` flow (warnings allowed)
- `1`: blocking setup issue remains

## 3. Architecture

## 3.1 Setup Orchestrator
Add a new setup orchestration layer (CLI-owned orchestration, module-owned execution).

Proposed modules:
- `setup/index.js` (orchestrator entry)
- `setup/steps/preflight.js`
- `setup/steps/mkcert.js`
- `setup/steps/domain.js`
- `setup/steps/verify.js`
- `setup/summary.js`

Responsibilities:
- Execute steps in deterministic order
- Collect per-step statuses
- Avoid fail-fast by default
- Compute final usability verdict and exit code

## 3.2 Step Result Contract
Each step returns:

```json
{
  "status": "ok|warn|fail|skipped|not_applicable",
  "code": "stable_machine_code",
  "message": "human readable",
  "remediation": "explicit next command",
  "details": {}
}
```

## 3.3 Pipeline
Execution order:
1. `preflight`
2. `mkcert`
3. `domain`
4. `verify`
5. `summary`

Design rule:
- Orchestrator should complete full pipeline and present aggregated result.
- Only unrecoverable internal runtime issues can abort immediately.

## 4. Platform Behavior

## 4.1 Windows
- Domain step returns `not_applicable` (or `skipped`) with clear reason.
- No penalty to final usability if other requirements pass.
- Effective runtime strategy remains `sslip`.

## 4.2 macOS/Linux
- Domain step attempts existing `domain setup` integration.
- Permission issues return explicit remediation:
  - `sudo devgate domain setup`
- If domain setup is unavailable, result can be `warn` (non-blocking) if runtime still usable via fallback.

## 4.3 mkcert behavior
- If missing, attempt auto-install by platform package manager flow.
- Then run trust/CA initialization.
- On failure, return actionable remediation commands.

## 5. Error Handling and Fallback Semantics

- Do not fail on first operational error.
- Track each step status and proceed when safe.
- Final result must explicitly report:
  - what works now
  - what remains to do
  - exact command(s) to run next

Severity model:
- `ok`: step completed successfully
- `warn`: degraded but usable state remains
- `fail`: blocking issue for expected onboarding outcome
- `not_applicable`: intentionally skipped for platform

## 6. Testing Strategy

## 6.1 Unit Tests
- Orchestrator step ordering
- Status aggregation logic
- Idempotence: repeated run does not introduce destructive changes

## 6.2 Integration Tests
- `devgate setup` happy path
- warning path
- blocking failure path
- `--dry-run`, `--verbose`, `--json` behavior
- exit code contract (`0`/`1`)

## 6.3 Platform Matrix via Mocks
- Windows: domain step not applicable
- macOS/Linux: domain setup attempted
- mkcert missing: auto-install branch executed

## 6.4 Regression Tests
- Existing commands remain compatible:
  - `start`
  - `doctor`
  - `domain`

## 7. Documentation Updates (Mandatory)

At phase completion, update:
- `README.md` (onboarding: `setup -> start`)
- `docs/user/cli-commands.md` (`setup` options/examples)
- `docs/user/quick-start.md` (new default flow)
- `docs/user/troubleshooting.md` (setup-specific remediation)

## 8. Delivery Workflow

1. Create feature branch:
   - `feat/setup-no-brainer-onboarding`
2. Implement command + orchestration + tests
3. Update docs to reflect behavior changes
4. Publish beta for validation
5. Merge to `master` after acceptance

## 9. Acceptance Criteria

- Fresh-user onboarding requires one obvious command (`devgate setup`).
- `devgate setup` is idempotent and safe to re-run.
- On failure, output includes concrete next command.
- `devgate start` works immediately after successful setup path.
- Documentation fully matches delivered behavior.
