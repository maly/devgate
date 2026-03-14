# Architecture Overview

This document describes the internal architecture of devgate.

## System Design

devgate follows a modular architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────┐
│                      CLI Layer                          │
│  cli/index.js - Command parsing and execution          │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│                   Core Modules                          │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────────────┐  │
│  │   config/   │ │ api/        │ │    proxy/       │  │
│  │  - load     │ │ - ip-detect │ │  - http-proxy  │  │
│  │  - validate │ │ - hostnames │ │  - WebSocket   │  │
│  └──────────────┘ └──────────────┘ └─────────────────┘  │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│                Support Modules                          │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────────────┐  │
│  │    cert/    │ │  dashboard/  │ │    health/      │  │
│  │  - mkcert   │ │  - HTML UI   │ │  - healthcheck │  │
│  │  - fallback │ │  - routing   │ │  - monitoring  │  │
│  └──────────────┘ └──────────────┘ └─────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Module Descriptions

### CLI Layer (`cli/`)

Entry point for all user interactions. Uses `cac` for argument parsing.

**Files:**
- `cli/index.js` - Main CLI module, exports all commands
- `cli/bin/devgate.js` - Executable entry point

**Commands:**
- `start` - Start the proxy server
- `validate` - Validate configuration
- `print-config` - Print effective configuration
- `print-hosts` - Print generated hostnames
- `doctor` - Run diagnostics

### Configuration (`config/`)

Handles loading and validating configuration from JSON/YAML files.

**Functions:**
- `loadConfig(path)` - Load config from file
- `validateConfig(config)` - Validate configuration object
- `resolveRuntimeConfig(config, options)` - Merge config with CLI options
- `getDefaultConfig()` - Get default configuration

### API Modules (`api/`)

Core utility modules.

**ip-detection.js:**
- `detectLocalIp(options)` - Detect local IPv4 address
- Returns object with: `{ ip, interface, reason }`
- Ignores loopback (127.x.x.x)
- Prefers active private network interfaces

**hostname-builder.js:**
- `buildHostnames(config, runtimeInfo)` - Generate sslip.io hostnames
- `ipToDashes(ip)` - Convert IP to dashes format
- Returns: `{ routes: [...], dashboard: {...} }`

### Proxy (`proxy/`)

The core reverse proxy implementation.

**Features:**
- HTTPS server with TLS termination
- HTTP to HTTPS redirect
- WebSocket proxying via http-proxy
- Host-based routing
- Dynamic route updates
- Config file watching for hot reload

**Key Functions:**
- `createProxy(options)` - Create proxy instance
- Returns: `{ start, stop, reload, proxy, isRunning, on, emit }`

### Certificate Management (`cert/`)

Handles TLS certificate generation and caching.

**Features:**
- mkcert integration (preferred)
- Self-signed certificate fallback
- Certificate caching
- Wildcard certificate support

**Class:**
- `CertManager` - Manages certificate lifecycle

**Methods:**
- `checkMkcert()` - Check if mkcert is available
- `ensureCertificates(hostnames)` - Generate/load certificates
- `getCertificateInfo()` - Get certificate details

### Dashboard (`dashboard/`)

HTML fallback page showing routes and health status.

**Function:**
- `renderDashboard(config, runtimeInfo)` - Generate HTML dashboard

### Health Checks (`health/`)

Periodic health monitoring of upstream services.

**Class:**
- `HealthChecker` - Manages health checks

**Methods:**
- `start()` - Start periodic health checks
- `stop()` - Stop health checks
- `getStatus()` - Get current health status

## Data Flow

### Starting the Proxy

```
1. User runs: devgate start
       │
       ▼
2. CLI loads config file
       │
       ▼
3. Config validates and merges with CLI options
       │
       ▼
4. Detect local IP address
       │
       ▼
5. Build hostnames using sslip.io format
       │
       ▼
6. Ensure TLS certificates exist
       │
       ▼
7. Create HTTPS proxy server
       │
       ▼
8. Start listening on configured ports
       │
       ▼
9. Print URLs to console
```

### Request Handling

```
1. Client requests: https://api.192-168-1-100.sslip.io
       │
       ▼
2. DNS resolves to devgate server
       │
       ▼
3. HTTPS server receives request
       │
       ▼
4. Extract Host header
       │
       ▼
5. Match hostname to route (alias lookup)
       │
       ▼
6. Apply route config (headers, stripPrefix)
       │
       ▼
7. Proxy request to target (http/https)
       │
       ▼
8. Return response to client
```

### Hot Reload

```
1. User edits devgate.json
       │
       ▼
2. File watcher detects change
       │
       ▼
3. Reload and validate config
       │
       ▼
4. Emit config-change event
       │
       ▼
5. Proxy updates routes
       │
       ▼
6. Continue with new configuration
```

## Configuration Files

devgate looks for configuration in this order:

1. CLI `--config` option
2. `devgate.json` in current directory
3. `devgate.yaml` / `devgate.yml` in current directory
4. Built-in defaults

## Security Considerations

- Certificates stored in `~/.devgate/certs/`
- No telemetry or analytics
- Local-only by default (binds to all interfaces)
- mkcert creates locally-trusted CAs

## Performance

- Minimal memory footprint (~50MB)
- Efficient routing via hash lookup
- Debounced config reload (300ms)
- Health checks run every 30 seconds

## Extension Points

The modular design allows for customization:

- **Custom hostname strategies** - Implement "nip" or "custom" in hostname-builder
- **Additional route options** - Extend route config validation
- **Metrics integration** - Add to proxy request handler
- **Custom health checks** - Extend health checker
