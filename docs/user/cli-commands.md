# CLI Commands

Complete reference for all devgate CLI commands.

## VS Code Integration (MVP)

The first-party extension in `packages/vscode-extension` wraps these CLI commands in VS Code.

Highlights:
- Command Palette entries for `Init|Setup|Start|Start (Force)|Stop|Doctor|Domain`.
- Local-first CLI execution:
  - use workspace `node cli/bin/devgate.js` when present
  - otherwise fallback to global `devgate`.
- Status bar reflects runtime state.
- Output channel `Devgate` captures command stdout/stderr.

## Commands Overview

| Command | Description |
|---------|-------------|
| `start` | Start the proxy server |
| `validate` | Validate configuration file |
| `print-config` | Print effective configuration |
| `print-hosts` | Print generated hostnames |
| `doctor` | Run diagnostics |
| `init` | Configure routes (wizard/non-interactive) |
| `domain` | Manage `.devgate` resolver setup |
| `setup` | Prepare local environment for first use |

## start

Start the devgate proxy server.

```bash
devgate start [options]
```

### Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--config <path>` | `-c` | Path to config file | `devgate.json` |
| `--configure <path>` | | Alias for --config | |
| `--ip <ipv4>` | `-i` | Override auto-detected IP | Auto-detect |
| `--https-port <port>` | `--https` | HTTPS port | 443 |
| `--http-port <port>` | `--http` | HTTP redirect port | 80 |
| `--cert-dir <path>` | | Custom certificate directory | `~/.devgate/certs` |
| `--verbose` | `-v` | Enable verbose output | false |
| `--no-dashboard` | | Disable dashboard | enabled |
| `--self-signed-fallback` | | Allow self-signed certificates | false |
| `--domain-mode <mode>` | | Domain mode override (`auto`, `sslip`, `devgate`) | from config (`auto`) |
| `--force` | | Stop previous running devgate instance and take over | false |

### Examples

```bash
# Start with default config
devgate start

# Start with custom config
devgate start --config ./my-config.json

# Start on custom ports
devgate start --https-port 8443 --http-port 8080

# Override IP detection
devgate start --ip 192.168.1.100

# Disable dashboard
devgate start --no-dashboard

# Allow self-signed certificates
devgate start --self-signed-fallback

# Combine options
devgate start -c ./devgate.json -i 192.168.1.50 -v

# Take over previous running instance
devgate start --force

# npm script shortcut (Windows-friendly)
npm run start:force
```

## validate

Validate a configuration file.

```bash
devgate validate [options]
```

### Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--config <path>` | `-c` | Path to config file | `devgate.json` |

### Examples

```bash
# Validate default config
devgate validate

# Validate custom config
devgate validate --config ./my-config.json
```

### Output

Valid configuration:
```
Configuration file './devgate.json' is valid.
```

Invalid configuration:
```
Configuration errors:
- routes[0].alias must be DNS-safe
- routes[1].target.port is required
```

## print-config

Print the effective configuration including defaults.

```bash
devgate print-config [options]
```

### Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--config <path>` | `-c` | Path to config file | `devgate.json` |
| `--verbose` | `-v` | Include all defaults | false |

### Examples

```bash
# Print config
devgate print-config

# Print full config with defaults
devgate print-config --verbose
```

### Output

```json
{
  "httpsPort": 443,
  "httpRedirectPort": 80,
  "dashboardAlias": "dev",
  "hostnameStrategy": "sslip",
  "preferredIp": null,
  "certDir": null,
  "dashboardEnabled": true,
  "autoOpenBrowser": false,
  "routes": [
    {
      "alias": "api",
      "target": {
        "protocol": "http",
        "host": "localhost",
        "port": 3000
      }
    }
  ]
}
```

## print-hosts

Print the generated hostnames for all routes.

```bash
devgate print-hosts [options]
```

### Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--config <path>` | `-c` | Path to config file | `devgate.json` |
| `--domain-mode <mode>` | | Domain mode override (`auto`, `sslip`, `devgate`) | from config (`auto`) |

### Examples

```bash
# Print hostnames
devgate print-hosts

# Print from custom config
devgate print-hosts --config ./my-config.json
```

### Output

```
Generated hostnames:

  Dashboard: https://dev.192-168-1-100.sslip.io
  api: https://api.192-168-1-100.sslip.io
  web: https://web.192-168-1-100.sslip.io
  admin: https://admin.192-168-1-100.sslip.io
```

## doctor

Run diagnostics to check your setup.

```bash
devgate doctor [options]
```

### Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--config <path>` | `-c` | Path to config file | `devgate.json` |
| `--domain-mode <mode>` | | Domain mode override (`auto`, `sslip`, `devgate`) | from config (`auto`) |
| `--verbose` | `-v` | Include detailed output | false |

### Examples

```bash
# Run diagnostics
devgate doctor

# Detailed diagnostics
devgate doctor --verbose
```

### Checks Performed

The doctor command checks:

1. **System**: Platform, OS, Node.js version, architecture
2. **mkcert**: Availability and installation status
3. **Configuration**: File validity and parsing
4. **Network**: Local IP detection, interface selection
5. **Port binding**: Available ports for proxy
6. **Routes**: Configured route definitions
7. **Certificate cache**: Cached certificates status
8. **Hostnames**: Generated hostname list
9. **Domain resolver**: Provider, status code, effective strategy, fallback indicator

## setup

Prepare local environment for no-brainer onboarding.

```bash
devgate setup [options]
```

### Options

| Option | Alias | Description | Default |
|---|---|---|---|
| `--verbose` | `-v` | Show detailed setup logs | false |
| `--dry-run` |  | Show planned actions without mutating system state | false |
| `--json` |  | Print machine-readable JSON output only | false |

### Examples

```bash
devgate setup
devgate setup --dry-run
devgate setup --json
devgate setup --json --verbose
```

### Output Contract Highlights

- `start_ready`: current readiness for immediate `devgate start`.
- `projected_start_ready`: expected readiness after planned setup actions.
- `exit_code`:
  - non-dry-run -> based on `start_ready`
  - dry-run -> based on `projected_start_ready`

## init

Configure routes interactively, or in non-interactive mode for scripts/CI.

```bash
devgate init [options]
```

### Options

| Option | Alias | Description | Default |
|---|---|---|---|
| `--config <path>` | `-c` | Path to config file | `devgate.json` |
| `--dry-run` |  | Preview without writing files | false |
| `--json` |  | Print JSON output only | false |
| `--non-interactive` |  | Disable prompts; requires one action | false |
| `--add-alias <alias>` |  | Add action alias |  |
| `--edit-alias <alias>` |  | Edit action alias |  |
| `--remove-alias <alias>` |  | Remove action alias |  |
| `--protocol <http|https>` |  | Protocol for add/edit |  |
| `--host <host>` |  | Host for add/edit |  |
| `--port <port>` |  | Port for add/edit |  |
| `--choose-clean-template` |  | Use clean template after parse failure | false |
| `--confirm-recovery` | `--yes` | Confirm parse-failure recovery overwrite | false |

### Non-Interactive Rules

- Exactly one action is required: `--add-alias` XOR `--edit-alias` XOR `--remove-alias`.
- Add requires `--protocol`, `--host`, `--port`.
- Edit requires at least one of `--protocol|--host|--port`.
- Remove does not accept edit fields.
- Edit scope is intentionally limited to `protocol|host|port` in this phase.

### Examples

```bash
devgate init
devgate init --dry-run --json
devgate init --non-interactive --add-alias api --protocol http --host localhost --port 3000
devgate init --non-interactive --edit-alias api --port 3001
devgate init --non-interactive --remove-alias api
```

### Output Contract Highlights

- `status/code` mapping:
  - `saved` -> `init_saved`
  - `cancelled` -> `init_cancelled`
  - `preview` -> `init_preview`
  - `error` -> `init_error|init_invalid_args`
- `--dry-run` success returns `status=preview`, exit code `0`.
- Parse-failure recovery can create backup file before first overwrite:
  - `<config>.bak.<timestamp>`

## domain

Manage native `.devgate` resolver integration on macOS/Linux.

```bash
devgate domain <status|setup|teardown>
```

### Subcommands

| Subcommand | Description |
|---|---|
| `status` | Prints resolver provider, status and code |
| `setup` | Configures resolver for `.devgate` (typically requires `sudo`) |
| `teardown` | Removes resolver setup (typically requires `sudo`) |

### Examples

```bash
devgate domain status
sudo devgate domain setup
sudo devgate domain teardown
```

### Strategy Resolution

| Platform | Mode | Resolver status | Strategy | Fallback |
|---|---|---|---|---|
| Windows | any | any | `sslip` | no |
| macOS/Linux | `sslip` | any | `sslip` | no |
| macOS/Linux | `devgate`/`auto` | `ready` | `devgate` | no |
| macOS/Linux | `devgate`/`auto` | `missing`/`unsupported`/`error` | `sslip` | yes |

### Output

```
Running diagnostics...

System:
  Platform: win32
  OS: Windows_NT 10.0.22000
  Node.js version: v20.10.0
  Architecture: x64
  OK

mkcert:
  Status: Installed (v1.4.4)
  OK

Configuration:
  Config file: ./devgate.json
  OK

Network:
  Local IP: 192.168.1.100
  Interface: Wi-Fi
  OK

Port binding:
  Port 80: Available
  Port 443: Available
  OK

Routes:
  - api -> http://localhost:3000
  - web -> http://localhost:5173
  OK

Certificate cache:
  Certificate directory: C:\Users\you\.devgate\certs
  Cached certificates: Yes
  OK

Hostnames:
  Dashboard: https://dev.192-168-1-100.sslip.io
  api: https://api.192-168-1-100.sslip.io
  web: https://web.192-168-1-100.sslip.io
  OK

Diagnostics completed successfully.
```
