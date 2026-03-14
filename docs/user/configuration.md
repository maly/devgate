# Configuration Reference

Complete reference for devgate configuration options.

## Configuration File

devgate looks for configuration in this order:

1. Path specified via `--config` or `-c` flag
2. `devgate.json` in current directory
3. `devgate.yaml` / `devgate.yml` in current directory
4. Default values

## File Format

Configuration files can be JSON or YAML:

```json
// devgate.json
{
  "httpsPort": 443,
  "routes": [...]
}
```

```yaml
# devgate.yaml
httpsPort: 443
routes:
  - alias: api
    target:
      protocol: http
      host: localhost
      port: 3000
```

## Top-Level Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `httpsPort` | number | 443 | HTTPS port for the proxy server |
| `httpRedirectPort` | number | 80 | HTTP port for redirecting to HTTPS. Set to `null` to disable |
| `dashboardAlias` | string | "dev" | Alias for the dashboard endpoint |
| `hostnameStrategy` | string | "sslip" | DNS strategy: "sslip", "nip", or "custom" |
| `preferredIp` | string | null | Override auto-detected local IP |
| `certDir` | string | null | Custom certificate directory (default: `~/.devgate/certs`) |
| `dashboardEnabled` | boolean | true | Enable or disable the dashboard |
| `autoOpenBrowser` | boolean | false | Automatically open browser on start |
| `routes` | array | [] | Array of route definitions |

## Route Options

Each route in the `routes` array supports the following options:

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `alias` | string | yes | DNS-safe name for the route (lowercase letters, numbers, dashes) |
| `target.protocol` | string | yes | "http" or "https" |
| `target.host` | string | yes | Target server hostname |
| `target.port` | number | yes | Target server port (1-65535) |
| `healthcheck` | string | no | Health check endpoint path (e.g., "/health") |
| `stripPrefix` | string | no | Prefix to strip from request URL before forwarding |
| `headers` | object | no | Additional headers to add to proxied requests |
| `showInDashboard` | boolean | no | Whether to show in dashboard (default: true) |

## Route Examples

### Basic Route

```json
{
  "alias": "api",
  "target": {
    "protocol": "http",
    "host": "localhost",
    "port": 3000
  }
}
```

### External HTTPS Service

```json
{
  "alias": "external",
  "target": {
    "protocol": "https",
    "host": "api.example.com",
    "port": 443
  }
}
```

### With Health Check

```json
{
  "alias": "api",
  "target": {
    "protocol": "http",
    "host": "localhost",
    "port": 3000
  },
  "healthcheck": "/health"
}
```

### With Prefix Stripping

```json
{
  "alias": "api",
  "target": {
    "protocol": "http",
    "host": "localhost",
    "port": 3000
  },
  "stripPrefix": "/api"
}
```

When accessing `https://api.<IP>.sslip.io/users`, the request is proxied to `http://localhost:3000/users`.

### With Custom Headers

```json
{
  "alias": "api",
  "target": {
    "protocol": "http",
    "host": "localhost",
    "port": 3000
  },
  "headers": {
    "X-Forwarded-Host": "${host}",
    "X-Forwarded-Proto": "https",
    "X-Custom-Header": "devgate"
  }
}
```

Available template variables:
- `${host}` - The hostname from the request
- `${alias}` - The route alias

### Hidden Route

```json
{
  "alias": "internal",
  "target": {
    "protocol": "http",
    "host": "localhost",
    "port": 9000
  },
  "showInDashboard": false
}
```

## Complete Example

```json
{
  "httpsPort": 8443,
  "httpRedirectPort": 8080,
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
      },
      "healthcheck": "/health",
      "stripPrefix": "/api",
      "headers": {
        "X-Forwarded-Host": "${host}"
      },
      "showInDashboard": true
    },
    {
      "alias": "web",
      "target": {
        "protocol": "http",
        "host": "localhost",
        "port": 5173
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

## Environment Variables

Currently, devgate does not support environment variables in configuration. Use CLI flags or a configuration file instead.

## Validation

Validate your configuration with:

```bash
devgate validate
devgate validate --config ./my-config.json
```

This checks:
- Port ranges (1-65535)
- DNS-safe alias names
- Required fields
- Protocol values

## Hot Reload Lifecycle

When started with `devgate start`, the active config file is watched and reloaded automatically.

- `never`: startup state before any successful reload pass.
- `success`: latest change passed parse + validation + apply.
- `failed`: latest change failed in parse/validation/apply.

Reload failures do not replace active routes. Devgate keeps the last-known-good configuration until a new valid change is detected.

## Dashboard Fields

Dashboard displays the following runtime semantics:

- Runtime: `ready`, `isRunning`, ports, IP, hostname strategy.
- Reload: `lastReloadStatus`, `lastReloadAt`, `lastReloadError`, `activeConfigVersion`.
- Certificate: `mode`, `certPath`, `keyPath`, `expiresAt`.
- Health: summary (`healthy|degraded|unknown`) and `updatedAt`.
- Routes: alias, target, generated URL, per-route health status.
