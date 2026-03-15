# devgate

A local HTTPS reverse proxy tool for development. On macOS/Linux it can use native `.devgate` hostnames via local resolver setup, with automatic fallback to `sslip` when resolver setup is missing.

## Installation

```bash
npm install -g devgate
```

Or clone and install locally:

```bash
git clone https://github.com/yourusername/devgate.git
cd devgate
npm install
```

## Quick Start

1. Create a `devgate.json` configuration file:

```json
{
  "routes": [
    {
      "alias": "api",
      "target": {
        "protocol": "http",
        "host": "localhost",
        "port": 3000
      }
    },
    {
      "alias": "web",
      "target": {
        "protocol": "http",
        "host": "localhost",
        "port": 5173
      }
    }
  ]
}
```

2. Start the proxy:

```bash
devgate start
```

3. Access your services through the generated URLs:

```
https://api.192-168-1-100.sslip.io
https://web.192-168-1-100.sslip.io
https://dev.192-168-1-100.sslip.io  (dashboard)
```

Optional on macOS/Linux:

```bash
sudo devgate domain setup
```

When resolver setup is ready, hostnames become:

```
https://api.devgate
https://web.devgate
https://dev.devgate
```

## How sslip.io Works

devgate uses [sslip.io](https://sslip.io), a DNS service that resolves hostnames containing IP addresses. When you access a URL like `https://api.192-168-1-100.sslip.io`, sslip.io extracts the IP address from the hostname and resolves to that IP directly.

For example, if your local IP is `192.168.1.100`:

| Alias | Generated Hostname | Resolves To |
|-------|-------------------|--------------|
| api | `api.192-168-1-100.sslip.io` | 192.168.1.100 |
| web | `web.192-168-1-100.sslip.io` | 192.168.1.100 |
| dev | `dev.192-168-1-100.sslip.io` | 192.168.1.100 |

This means you don't need to modify your system's hosts file. The DNS resolution happens remotely at sslip.io, and your browser connects directly to your local machine.

## Configuration File

Create a `devgate.json` file in your project root. Here's a complete example:

```json
{
  "httpsPort": 443,
  "httpRedirectPort": 80,
  "dashboardAlias": "dev",
  "domainMode": "auto",
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
      },
      "healthcheck": "/health",
      "stripPrefix": "/api",
      "headers": {
        "X-Forwarded-Host": "${host}"
      },
      "showInDashboard": true
    },
    {
      "alias": "admin",
      "target": {
        "protocol": "https",
        "host": "internal.server",
        "port": 8443
      },
      "showInDashboard": false
    }
  ]
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `httpsPort` | number | 443 | HTTPS port for the proxy |
| `httpRedirectPort` | number | 80 | HTTP port for redirecting to HTTPS |
| `dashboardAlias` | string | "dev" | Alias for the dashboard |
| `domainMode` | string | "auto" | Domain mode: `auto`, `sslip`, `devgate` |
| `hostnameStrategy` | string | "sslip" | DNS strategy: "sslip", "nip", or "custom" |
| `preferredIp` | string | null | Override auto-detected IP |
| `certDir` | string | null | Custom certificate directory |
| `dashboardEnabled` | boolean | true | Enable the dashboard |
| `autoOpenBrowser` | boolean | false | Open browser on start |
| `routes` | array | [] | Array of route definitions |

### Route Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `alias` | string | yes | DNS-safe name for the route |
| `target.protocol` | string | yes | "http" or "https" |
| `target.host` | string | yes | Target server hostname |
| `target.port` | number | yes | Target server port |
| `healthcheck` | string | no | Health check endpoint path |
| `stripPrefix` | string | no | Prefix to strip from requests |
| `headers` | object | no | Headers to add to requests |
| `showInDashboard` | boolean | default: true | Show in dashboard |

## CLI Commands

### start

Start the proxy server:

```bash
devgate start
devgate start --config ./my-config.json
devgate start --ip 192.168.1.50
devgate start --https-port 8443 --http-port 8080
```

Options:
- `--config, -c <path>` - Path to config file
- `--configure <path>` - Alias for --config
- `--ip, -i <ipv4>` - Override IP detection
- `--https-port, --https <port>` - HTTPS port (default: 443)
- `--http-port, --http <port>` - HTTP redirect port (default: 80)
- `--cert-dir <path>` - Certificate directory
- `--verbose, -v` - Enable verbose output
- `--no-dashboard` - Disable dashboard
- `--self-signed-fallback` - Allow self-signed certificates
- `--domain-mode <mode>` - Domain mode override (`auto`, `sslip`, `devgate`)

### validate

Validate your configuration file:

```bash
devgate validate
devgate validate --config ./my-config.json
```

### print-config

Print the effective configuration:

```bash
devgate print-config
devgate print-config --config ./my-config.json --verbose
```

### print-hosts

Print the generated hostnames:

```bash
devgate print-hosts
devgate print-hosts --config ./my-config.json
```

Example output:

```
Generated hostnames:

  Dashboard: https://dev.192-168-1-100.sslip.io
  api: https://api.192-168-1-100.sslip.io
  web: https://web.192-168-1-100.sslip.io
```

### doctor

Run diagnostics to check your setup:

```bash
devgate doctor
devgate doctor --config ./my-config.json --verbose
```

This checks:
- Node.js version
- mkcert availability
- Configuration validity
- Local IP detection
- Port availability
- Certificate cache
- Generated hostnames
- Domain resolver status and fallback strategy

### domain

Manage `.devgate` resolver integration:

```bash
devgate domain status
sudo devgate domain setup
sudo devgate domain teardown
```

`start` behavior:
- macOS/Linux: checks resolver status first.
- If resolver is missing/unsupported/error, prints a strong warning with `sudo devgate domain setup` and automatically uses `sslip`.
- Windows: always uses `sslip`.

Decision table:

| Platform | Mode | Resolver status | Effective strategy | Fallback |
|---|---|---|---|---|
| Windows | any | any | `sslip` | no |
| macOS/Linux | `sslip` | any | `sslip` | no |
| macOS/Linux | `devgate` or `auto` | `ready` | `devgate` | no |
| macOS/Linux | `devgate` or `auto` | `missing`/`unsupported`/`error` | `sslip` | yes |

## Hot Reload Lifecycle

When `devgate start` runs with a config file, devgate watches that file and applies changes without restart.

- `never`: no successful reload was executed yet after process start.
- `success`: the latest config change was parsed, validated, and applied.
- `failed`: the latest config change failed parse/validation/apply checks.

If reload fails, devgate keeps the last-known-good routing active. This means traffic keeps flowing with the previous valid configuration until the next valid save is detected.

## Dashboard Status Semantics

The dashboard is read-only in beta and shows:

- Runtime: `ready`, running status, ports, IP, strategy.
- Last reload: status (`never|success|failed`), timestamp, error text, active config version.
- Certificate: mode (`mkcert` or `self-signed`), paths, expiration.
- Health: summary and last update time.
- Routes: alias, upstream target, public URL, route health.

## ESM API Usage

You can also use devgate programmatically:

```javascript
import { loadConfig, validateConfig, resolveRuntimeConfig } from 'devgate/config';
import { detectLocalIp } from 'devgate/ip-detection';
import { buildHostnames } from 'devgate/hostname-builder';
import { CertManager } from 'devgate/cert';

// Load and validate configuration
const config = await loadConfig('./devgate.json');
const validation = validateConfig(config);

if (!validation.valid) {
  console.error('Config errors:', validation.errors);
  process.exit(1);
}

// Resolve runtime configuration
const runtimeConfig = resolveRuntimeConfig(config);

// Detect local IP
const ipResult = detectLocalIp({ preferredIp: runtimeConfig.preferredIp });
console.log('Local IP:', ipResult.ip);

// Build hostnames
const hostnames = buildHostnames(runtimeConfig, { ip: ipResult.ip });
console.log('Hostnames:', hostnames);

// Manage certificates
const certManager = new CertManager({ certDir: runtimeConfig.certDir });
await certManager.ensureCertificates([
  hostnames.dashboard.hostname,
  ...hostnames.routes.map(r => r.hostname)
]);

const certInfo = certManager.getCertificateInfo();
console.log('Certificate:', certInfo);
```

## mkcert Dependency

devgate uses [mkcert](https://github.com/FiloSottile/mkcert) to generate locally-trusted development certificates. This allows browsers to trust the SSL certificates without security warnings.

### Installation

**Windows (with Chocolatey):**
```bash
choco install mkcert
```

**Windows (manual):**
1. Download the latest release from https://github.com/FiloSottile/mkcert/releases
2. Extract and add to PATH, or run from the same directory

**macOS:**
```bash
brew install mkcert
```

**Linux:**
```bash
sudo apt install libnss3-tools  # Debian/Ubuntu
brew install mkcert              # or via brew
```

### Without mkcert

If mkcert is not installed, devgate will automatically fall back to self-signed certificates. Your browser will show a security warning, but you can proceed by clicking "Advanced" -> "Proceed to localhost".

To explicitly enable this fallback:

```bash
devgate start --self-signed-fallback
```

## Example Output URLs

When you run `devgate start` with the quick start configuration, you'll see:

```
Starting devgate proxy server...
  HTTPS port: 443
  HTTP redirect port: 80
  Dashboard: enabled
  Local IP: 192.168.1.100

Proxy server functionality not yet implemented.
```

And with `devgate print-hosts`:

```
Generated hostnames:

  Dashboard: https://dev.192-168-1-100.sslip.io
  api: https://api.192-168-1-100.sslip.io
  web: https://web.192-168-1-100.sslip.io
```

## Windows Troubleshooting

### "command not found" after installation

Make sure npm's global bin directory is in your PATH. Run:

```cmd
npm config get prefix
```

Add the output path to your system PATH environment variable.

### Port 443 requires administrator privileges

On Windows, binding to port 443 typically requires administrator rights. Either:
- Run your terminal as Administrator
- Use a higher port: `devgate start --https-port 8443`

### mkcert not recognized

After installing mkcert, you may need to restart your terminal or computer for the PATH changes to take effect.

### Certificate trust issues

If you see certificate errors even with mkcert:
1. Run `devgate doctor` to check mkcert status
2. Try reinstalling mkcert root CA: `mkcert -install`

### Firewall blocking connections

Windows Firewall may prompt you to allow Node.js. Click "Allow" when prompted, or manually add an exception for Node.js.

### IP detection issues

If devgate detects the wrong IP:
```bash
devgate start --ip 192.168.1.100
```

### Hosts file not being read

Unlike traditional proxies, devgate doesn't require hosts file entries because it uses sslip.io DNS resolution. Make sure your browser isn't using a VPN that bypasses normal DNS.

## License

MIT
