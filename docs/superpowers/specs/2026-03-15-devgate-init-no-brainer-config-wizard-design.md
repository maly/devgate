# Devgate No-Brainer Onboarding Phase 2: `devgate init` Config Wizard

**Date:** 2026-03-15  
**Project:** devgate  
**Scope:** Add an interactive config wizard to create and maintain routes without manual JSON editing.

## 1. Goal and Non-Goals

### Goal
Make configuration seamless by introducing `devgate init` as a single interactive flow for creating, merging, and editing routes in `devgate.json`.

### In-scope
- New command: `devgate init`
- Interactive wizard for:
  - add route
  - edit route
  - remove route
  - list routes
  - save + exit / cancel
- Multi-route editing in one run
- Existing config merge/edit support
- Atomic config save
- CLI flags:
  - `--config <path>`
  - `--dry-run`
  - `--json`
  - `--non-interactive`
- Structured result contract
- Documentation updates for init-first onboarding

### Non-goals
- No route auto-discovery in this phase
- No GUI/editor plugin integration in this phase
- No proxy runtime architecture changes

## 2. UX and CLI Contract

## 2.1 Commands
- `devgate init`
- `devgate init --config <path>`
- `devgate init --dry-run`
- `devgate init --json`
- `devgate init --non-interactive`

Non-interactive action syntax:
- Add route:
  - `devgate init --non-interactive --add-alias <alias> --protocol <http|https> --host <host> --port <1-65535>`
- Edit route:
  - `devgate init --non-interactive --edit-alias <alias> [--protocol ...] [--host ...] [--port ...]`
- Remove route:
  - `devgate init --non-interactive --remove-alias <alias>`

Non-interactive validation rules:
- Exactly one action must be provided: `--add-alias` XOR `--edit-alias` XOR `--remove-alias`.
- `--add-alias` requires protocol/host/port.
- `--edit-alias` requires at least one editable field.
- Invalid combinations return exit `1` and status/code `error/init_invalid_args`.
- Non-interactive edit scope in this phase is limited to `protocol|host|port`.

## 2.2 Interaction Model
Wizard flow:
1. Load existing config if present (or create empty model)
2. If routes are empty, run first-route guided prompt first (alias + target fields)
3. Show action menu:
   - add alias
   - edit alias
   - remove alias
   - list current routes
   - save and exit
   - cancel
4. Validate changes immediately after each action
5. Validate whole config before save
6. Print summary + next commands (`devgate setup`, `devgate start`)

## 2.3 Exit Codes
- `0`:
  - successful save
  - or cancel/no-op without error
  - or `status=preview` (`--dry-run`) when command completes successfully
- `1`:
  - parse/read/write error
  - invalid use of `--non-interactive` arguments
  - command-terminating validation failure

Interactive validation behavior:
- Per-action validation errors in interactive mode do not terminate the wizard.
- Exit `1` is reserved for command-terminating failures (parse/read/write/final save/invalid CLI args).

## 2.4 Output Modes
- default: concise human-readable wizard output
- `--dry-run`: no file mutation; show planned diff/summary
- `--json`: machine-readable result only
- `--json --dry-run`: machine-readable planned result

Flag behavior rules:
- `--json` does not disable interactivity by itself; it only changes output format.
- `--non-interactive` disables prompts and requires valid action flags.
- `--json --non-interactive` is valid and returns JSON-only result.
- `--dry-run` can be combined with both interactive and non-interactive flows.
- In interactive mode with `--json`, prompts are shown only via TTY interaction, while stdout remains JSON-only.

## 3. Architecture

## 3.1 New Init Module
Add `init/` module with separation of responsibilities:

- `init/index.js`
  - orchestration entrypoint for init command
- `init/wizard.js`
  - menu loop and action routing
- `init/model.js`
  - in-memory config mutations (`add/edit/remove`)
- `init/io.js`
  - load and atomic save helpers
- `init/validate.js`
  - route-level immediate validation helpers

CLI (`cli/index.js`) should only parse args, invoke init orchestrator, and print results.

## 3.2 Result Contract
`--json` output should return:

```json
{
  "schema_version": "1",
  "command": "init",
  "changed": true,
  "added": 2,
  "updated": 1,
  "removed": 0,
  "savedPath": "./devgate.json | null",
  "dryRun": false,
  "status": "saved|cancelled|preview|error",
  "code": "init_saved|init_cancelled|init_preview|init_error|init_invalid_args",
  "message": "string",
  "details": {}
}
```

Required fields:
- `schema_version`, `command`, `changed`, `added`, `updated`, `removed`, `savedPath`, `dryRun`, `status`, `code`, `message`, `details`

Result rules:
- `schema_version` is string `"1"` for this phase.
- `savedPath` may be `null` for `status=cancelled|error`.
- For `status=preview`, `savedPath` is always resolved target config path (never `null`).
- Status/code mappings:
  - `saved` -> `init_saved`
  - `cancelled` -> `init_cancelled`
  - `preview` -> `init_preview`
  - `error` -> `init_error|init_invalid_args`
- Counter semantics are deterministic:
  - `added`: newly created aliases in session
  - `updated`: existing aliases modified
  - `removed`: aliases removed
  - add+remove same alias in one session yields `added=0`, `removed=0`, `changed=false` unless other net changes remain

## 3.3 Atomic Save Contract
- Save path uses temp file + rename in same directory.
- On write failure, original file must remain unchanged.

Atomic algorithm requirements:
- write temp file in target directory
- flush file content before rename
- replace target via rename semantics
- cleanup temp file on failure best-effort
- if target is locked (notably on Windows), return `init_error` with remediation and do not mutate original file

## 4. Merge/Edit/Remove Rules

## 4.1 Add
- `alias` must be unique.
- On collision, wizard offers switch to edit mode.
- Validate target fields before accepting action.

## 4.2 Edit
- User selects existing alias.
- Editable fields:
  - `target.protocol`
  - `target.host`
  - `target.port`
  - optional route metadata (healthcheck/headers/stripPrefix)

Merge/preservation rules:
- Unknown top-level keys in config must be preserved.
- Unknown route-level keys on untouched routes must be preserved.
- For edited routes, only explicitly changed fields are replaced.
- Route order remains stable unless user explicitly removes/adds routes.
- Route listing output and JSON route collections must preserve deterministic insertion order.

## 4.3 Remove
- Requires explicit confirmation.
- Removal reflected in summary counters.

## 4.4 Cancel and Unsaved Changes
- If there are unsaved changes, cancel requires explicit confirmation.

## 5. Error Handling

## 5.1 Existing Config Parse Failure
If existing config is invalid, wizard offers:
1. show parse/validation error details
2. start from clean template
3. exit without changes

Recovery safety rules:
- Choosing clean template requires explicit confirmation.
- Before first successful overwrite after parse failure, create backup:
  - `<config>.bak.<timestamp>`

## 5.2 Non-interactive Mode
- If required params are missing, return `1` with precise guidance.
- No prompt should appear in `--non-interactive`.

## 5.3 Remediation Principle
Any failure must include actionable next step text.

## 6. Testing Strategy

## 6.1 Unit
- model mutations: add/edit/remove/list
- alias uniqueness and conflict handling
- field validators for protocol/host/port
- result summary counters and changed flag

## 6.2 Integration
- `devgate init` new-file flow
- existing-file merge/edit/remove flow
- multiple route changes in single run
- cancel/no-op path
- `--dry-run`, `--json`, `--non-interactive` behavior
- flag-combination matrix for valid/invalid combinations

## 6.3 I/O Safety
- atomic write success path
- atomic write failure preserves original file
- invalid existing JSON handling path
- backup creation path after parse-failure recovery
- Windows locked-target behavior

## 6.4 Regression
- no regressions for:
  - `start`
  - `setup`
  - `doctor`
  - `validate`

## 7. Documentation Requirements

Update at phase completion:
- `README.md`: onboarding becomes `init -> setup -> start`
- `docs/user/quick-start.md`: init wizard walkthrough
- `docs/user/cli-commands.md`: `init` options and examples
- `docs/user/troubleshooting.md`: init-specific failure/remediation playbook

## 8. Delivery Workflow

1. Create branch `feat/init-no-brainer-config-wizard`
2. Implement init module + CLI wiring + tests
3. Update docs
4. Run full test suite
5. Publish beta
6. Merge to repository default branch

## 9. Acceptance Criteria

- User can create and maintain multiple routes without manual JSON editing.
- Existing config can be safely merged/edited/cleaned in one wizard run.
- Save operation is atomic and preserves original file on failure.
- `--dry-run`, `--json`, `--non-interactive` contracts are deterministic.
- status/code mapping is deterministic across `saved|cancelled|preview|error`.
- Documentation fully reflects the new init-first onboarding flow.
