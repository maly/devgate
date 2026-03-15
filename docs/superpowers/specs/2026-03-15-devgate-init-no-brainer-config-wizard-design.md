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

## 2.2 Interaction Model
Wizard flow:
1. Load existing config if present (or create empty model)
2. Show action menu:
   - add alias
   - edit alias
   - remove alias
   - list current routes
   - save and exit
   - cancel
3. Validate changes immediately after each action
4. Validate whole config before save
5. Print summary + next commands (`devgate setup`, `devgate start`)

## 2.3 Exit Codes
- `0`:
  - successful save
  - or cancel/no-op without error
- `1`:
  - validation failure that blocks requested action
  - parse/read/write error
  - invalid use of `--non-interactive` arguments

## 2.4 Output Modes
- default: concise human-readable wizard output
- `--dry-run`: no file mutation; show planned diff/summary
- `--json`: machine-readable result only
- `--json --dry-run`: machine-readable planned result

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
  "savedPath": "./devgate.json",
  "dryRun": false,
  "status": "saved|cancelled|preview|error",
  "code": "init_saved",
  "message": "string",
  "details": {}
}
```

Required fields:
- `schema_version`, `command`, `changed`, `added`, `updated`, `removed`, `savedPath`, `dryRun`, `status`, `code`, `message`, `details`

## 3.3 Atomic Save Contract
- Save path uses temp file + rename in same directory.
- On write failure, original file must remain unchanged.

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

## 6.3 I/O Safety
- atomic write success path
- atomic write failure preserves original file
- invalid existing JSON handling path

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
- Documentation fully reflects the new init-first onboarding flow.
