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
- `0`: `verify.start_ready=true` (environment is ready for immediate `devgate start`)
- `1`: `verify.start_ready=false` (blocking setup issue remains)

Normative rule:
- Warnings are allowed only when they do not affect `verify.start_ready`.
- Any blocking issue that prevents immediate `start` readiness must return exit `1`.

## 2.5 Flag Compatibility Matrix

| Flags | Behavior |
|---|---|
| default | Human-readable concise output |
| `--verbose` | Human-readable detailed output |
| `--json` | JSON-only output (no extra human log lines) |
| `--json --verbose` | JSON-only output with additional `details.logs` field |
| `--dry-run` | No mutations, output indicates planned actions |
| `--dry-run --json` | JSON-only planned actions, no mutations |
| `--dry-run --verbose` | Human-readable planned actions with detailed logs |
| `--dry-run --json --verbose` | JSON-only planned actions with `details.logs` |

Precedence rules:
- `--json` always suppresses human-readable log lines.
- `--verbose` only affects detail level (human output or JSON `details.logs`).

## 2.6 `--dry-run` Semantics

- `--dry-run` must evaluate projected state after planned actions, without mutating system state.
- Output fields:
  - `start_ready`: current readiness
  - `projected_start_ready`: expected readiness if planned actions are executed
- Exit code in `--dry-run` mode is based on `projected_start_ready`:
  - `0` if `projected_start_ready=true`
  - `1` otherwise

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
  "schema_version": "1",
  "step_id": "preflight|mkcert|domain|verify|summary",
  "status": "ok|warn|fail|not_applicable",
  "code": "stable_machine_code",
  "message": "human readable",
  "remediation": [
    {
      "command": "string",
      "reason": "string",
      "optional": false
    }
  ],
  "details": {},
  "duration_ms": 0
}
```

Required fields:
- `schema_version`, `step_id`, `status`, `code`, `message`, `remediation`, `details`, `duration_ms`

Rules:
- `status` enum: `ok|warn|fail|not_applicable`
- `duration_ms` is non-negative integer
- `remediation` can be empty on `ok|not_applicable`
- `remediation` must contain at least one non-optional action on `fail`

## 3.4 Top-Level Setup Result Contract

`devgate setup --json` must return:

```json
{
  "schema_version": "1",
  "command": "setup",
  "start_ready": false,
  "projected_start_ready": true,
  "exit_code": 0,
  "code": "setup_projected_ready",
  "summary": {
    "ok": 3,
    "warn": 1,
    "fail": 0,
    "not_applicable": 1
  },
  "steps": []
}
```

Required fields:
- `schema_version`, `command`, `start_ready`, `projected_start_ready`, `exit_code`, `code`, `summary`, `steps`

Rules:
- `steps` contains step objects from section 3.2 in execution order
- `exit_code` must be `0|1`
- `exit_code` mapping must match section 2.4 and 2.6 rules

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

Abort-class internal errors (immediate exit `1`):
- Unexpected orchestrator exception before step contract can be produced
- Internal serialization failure for required output mode (for example JSON output encoding failure)

Even on abort-class errors:
- top-level output must include machine-readable `code`
- include completed step results collected so far, if available

## 4. Platform Behavior

## 4.1 Windows
- Domain step returns `not_applicable` with clear reason.
- No penalty to final usability if other requirements pass.
- Effective runtime strategy remains `sslip`.

## 4.2 macOS/Linux
- Domain step attempts existing `domain setup` integration.
- Permission issues return explicit remediation:
  - `sudo devgate domain setup`
- If domain setup is unavailable, result can be `warn` (non-blocking) if runtime still usable via fallback.
- If domain setup is unavailable, runtime strategy must fall back to `sslip` and `verify` must assert fallback routing readiness.

## 4.3 mkcert behavior
- If missing, attempt auto-install by platform package manager flow.
- Then run trust/CA initialization.
- On failure, return actionable remediation commands.

Auto-install policy:
- Non-interactive mode only
- Platform installers:
  - Windows: `winget`, then `choco` fallback
  - macOS: `brew`
  - Linux: distro package manager path already implemented by devgate
- Per installer attempt timeout: 5 minutes
- Retry policy: one attempt per installer candidate, no infinite retries
- If all installer attempts fail, continue pipeline with `warn|fail` and explicit remediation list
- Offline/unreachable package source must be reported with dedicated stable code

Privilege and interactivity policy:
- `devgate setup` must not block on interactive elevation prompts.
- If elevated privileges are required and not available, step must return promptly with:
  - stable `permission_denied`-family code
  - explicit remediation command(s) (for example with `sudo`)

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

Drift repair scope (idempotence boundary):
- Allowed mutations:
  - create/update devgate-managed cert files in devgate cert directory
  - run mkcert trust initialization
  - create/update devgate-managed domain resolver config
- Never mutate:
  - arbitrary user files outside devgate-managed paths
  - non-devgate DNS configuration not required for `.devgate`

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
- deterministic mapping test: step result matrix -> exit code

## 6.3 Platform Matrix via Mocks
- Windows: domain step not applicable
- macOS/Linux: domain setup attempted
- mkcert missing: auto-install branch executed
- macOS/Linux domain failure: fallback strategy `sslip` verified as start-ready path

## 6.4 Regression Tests
- Existing commands remain compatible:
  - `start`
  - `doctor`
- `domain`

## 6.5 Contract and Stability Tests
- JSON schema contract tests for `--json` output
- Stable `code` value snapshot tests for known scenarios
- Step ordering contract test (`preflight -> mkcert -> domain -> verify -> summary`)
- Flag compatibility tests (`--json`, `--verbose`, `--dry-run`)

## 6.6 Machine Code Registry Tests
- Validate emitted codes against a canonical registry list.
- Enforce naming convention and reserved code prefixes.
- Prevent accidental code changes without explicit schema version policy update.

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
5. Merge to repository default branch after acceptance

## 9. Acceptance Criteria

- Fresh-user onboarding requires one obvious command (`devgate setup`).
- `devgate setup` is idempotent and safe to re-run.
- On failure, output includes concrete next command.
- `devgate start` works immediately after any setup run that returns `verify.start_ready=true`.
- Documentation fully matches delivered behavior.

## 10. Stable Code Registry (Phase 1)

Naming convention:
- `setup_*` for orchestrator-level codes
- `preflight_*`, `mkcert_*`, `domain_*`, `verify_*` for step-level codes

Reserved orchestrator codes:
- `setup_ready`
- `setup_not_ready`
- `setup_projected_ready`
- `setup_projected_not_ready`
- `setup_internal_error`

Core step codes (minimum set for phase 1):
- `preflight_ok`
- `preflight_permission_denied`
- `mkcert_available`
- `mkcert_install_succeeded`
- `mkcert_install_failed`
- `mkcert_trust_failed`
- `domain_ready`
- `domain_permission_denied`
- `domain_not_applicable`
- `verify_start_ready`
- `verify_start_not_ready`

Versioning policy:
- Existing codes are stable within `schema_version=1`.
- New codes can be added in minor releases.
- Renaming/removing existing codes requires schema version bump.
