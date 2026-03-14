# API Reference

Complete reference for the devgate programmatic API.

## Importing

```javascript
// Import specific modules
import { detectLocalIp } from 'devgate/api';
import { buildHostnames } from 'devgate/api';
import { loadConfig, validateConfig, resolveRuntimeConfig } from 'devgate/config';
import { CertManager } from 'devgate/cert';
import { createProxy } from 'devgate/proxy';
import { renderDashboard } from 'devgate/dashboard';
import { HealthChecker } from 'devgate/health';

// Import all
import * as devgate from 'devgate';
```

## API Modules

### `devgate/api` - Core Utilities

#### detectLocalIp

Detects the local IPv4 address for hostname generation.

```javascript
import { detectLocalIp } from 'devgate/api';

const result = detectLocalIp(options);
```

**Parameters:**
- `options` (Object, optional)
  - `preferredIp` (string) - User-specified IP to use

**Returns:**
```javascript
{
  ip: "192.168.1.100",
  interface: "Wi-Fi",
  reason: "Active private network interface (Wi-Fi)"
}
```

Or `null` if no valid IP found.

**Example:**
```javascript
const result = detectLocalIp({ preferredIp: '192.168.1.50' });
console.log(result.ip); // "192.168.1.50"
```

#### buildHostnames

Generates sslip.io hostnames for routes and dashboard.

```javascript
import { buildHostnames } from 'devgate/api';

const hostnames = buildHostnames(config, runtimeInfo);
```

**Parameters:**
- `config` (Object) - Configuration object
  - `routes` (Array) - Array of route definitions
  - `dashboardAlias` (string, optional) - Dashboard alias (default: "dev")
- `runtimeInfo` (Object)
  - `ip` (string) - Local IP address

**Returns:**
```javascript
{
  routes: [
    {
      alias: "api",
      hostname: "api.192-168-1-100.sslip.io",
      target: { protocol: "http", host: "localhost", port: 3000 }
    }
  ],
  dashboard: {
    alias: "dev",
    hostname: "dev.192-168-1-100.sslip.io"
  }
}
```

**Example:**
```javascript
const hostnames = buildHostnames(
  {
    routes: [
      { alias: 'api', target: { protocol: 'http', host: 'localhost', port: 3000 } }
    ],
    dashboardAlias: 'dev'
  },
  { ip: '192.168.1.100' }
);
```

---

### `devgate/config` - Configuration

#### loadConfig

Loads configuration from a JSON or YAML file.

```javascript
import { loadConfig } from 'devgate/config';

const config = await loadConfig(pathOrObject);
```

**Parameters:**
- `pathOrObject` (string | Object)
  - If string: path to config file
  - If object: use directly

**Returns:**
```javascript
{
  httpsPort: 443,
  httpRedirectPort: 80,
  routes: [...]
}
```

**Example:**
```javascript
// From file
const config = await loadConfig('./devgate.json');

// From object
const config = await loadConfig({ routes: [...] });
```

#### validateConfig

Validates a configuration object.

```javascript
import { validateConfig } from 'devgate/config';

const result = validateConfig(config);
```

**Parameters:**
- `config` (Object) - Configuration to validate

**Returns:**
```javascript
{
  valid: true,
  errors: []
}
```

Or if invalid:
```javascript
{
  valid: false,
  errors: [
    "routes[0].alias must be DNS-safe",
    "routes[1].target.port is required"
  ]
}
```

#### resolveRuntimeConfig

Merges configuration with CLI options.

```javascript
import { resolveRuntimeConfig } from 'devgate/config';

const runtimeConfig = resolveRuntimeConfig(config, options);
```

**Parameters:**
- `config` (Object) - Base configuration
- `options` (Object) - CLI options to override

**Returns:** Merged configuration object

#### getDefaultConfig

Returns default configuration values.

```javascript
import { getDefaultConfig } from 'devgate/config';

const defaults = getDefaultConfig();
```

---

### `devgate/cert` - Certificate Management

#### CertManager

Class for managing TLS certificates.

```javascript
import { CertManager } from 'devgate/cert';

const certManager = new CertManager(options);
```

**Constructor Options:**
- `certDir` (string) - Certificate directory (default: `~/.devgate/certs`)
- `selfSignedFallback` (boolean) - Allow self-signed fallback (default: true)

##### Methods

###### checkMkcert

Checks if mkcert is available.

```javascript
const available = await certManager.checkMkcert();
```

**Returns:** `boolean`

###### ensureCertificates

Ensures certificates exist for given hostnames.

```javascript
await certManager.ensureCertificates(hostnames);
```

**Parameters:**
- `hostnames` (Array) - Array of hostname strings

**Returns:** `Promise<void>`

###### getCertificateInfo

Gets information about current certificates.

```javascript
const info = certManager.getCertificateInfo();
```

**Returns:**
```javascript
{
  path: "~/.devgate/certs/devgate.pem",
  mode: "mkcert",
  expiration: "2025-01-01T00:00:00.000Z"
}
```

---

### `devgate/proxy` - Reverse Proxy

#### createProxy

Creates a new proxy instance.

```javascript
import { createProxy } from 'devgate/proxy';

const proxy = createProxy(options);
```

**Parameters:**
- `options` (Object)
  - `ssl` (Object, optional) - TLS credentials
    - `cert` (string) - Certificate
    - `key` (string) - Private key
  - `routes` (Object) - Route definitions keyed by hostname
  - `port` (number) - HTTPS port (default: 443)
  - `defaultPort` (number) - HTTP redirect port (default: 80)

**Returns:**
```javascript
{
  start: async () => Promise<void>,
  stop: async () => Promise<void>,
  reload: (newRoutes) => void,
  proxy: httpProxy,
  isRunning: boolean,
  on: (event, callback) => void,
  emit: (event, data) => void
}
```

**Example:**
```javascript
const proxy = createProxy({
  port: 8443,
  routes: {
    'api.192-168-1-100.sslip.io': {
      target: 'http://localhost:3000',
      changeOrigin: true,
      headers: { 'X-Forwarded-Host': '${host}' }
    }
  }
});

await proxy.start();

// Listen for config changes
proxy.on('config-change', (newConfig) => {
  console.log('Config changed');
});

await proxy.stop();
```

##### Events

- `config-change` - Emitted when configuration is reloaded
- `routes-change` - Emitted when routes are updated

---

### `devgate/dashboard` - Dashboard UI

#### renderDashboard

Renders the HTML dashboard.

```javascript
import { renderDashboard } from 'devgate/dashboard';

const html = renderDashboard(config, runtimeInfo);
```

**Parameters:**
- `config` (Object) - Configuration object
  - `dashboardAlias` (string)
  - `routes` (Array)
- `runtimeInfo` (Object)
  - `ip` (string) - Local IP address
  - `hostnames` (Object) - Generated hostnames

**Returns:** HTML string

**Example:**
```javascript
const html = renderDashboard(
  {
    dashboardAlias: 'dev',
    routes: [
      { alias: 'api', target: { host: 'localhost', port: 3000 } }
    ]
  },
  {
    ip: '192.168.1.100',
    hostnames: {
      routes: [{ alias: 'api', hostname: 'api.192-168-1-100.sslip.io' }],
      dashboard: { alias: 'dev', hostname: 'dev.192-168-1-100.sslip.io' }
    }
  }
);
```

---

### `devgate/health` - Health Checks

#### HealthChecker

Class for monitoring upstream service health.

```javascript
import { HealthChecker } from 'devgate/health';

const healthChecker = new HealthChecker(routes, options);
```

**Parameters:**
- `routes` (Array) - Array of route objects with healthcheck property
- `options` (Object)
  - `interval` (number) - Check interval in ms (default: 30000)
  - `timeout` (number) - Request timeout in ms (default: 5000)

##### Methods

###### start

Starts periodic health checks.

```javascript
healthChecker.start();
```

###### stop

Stops health checks.

```javascript
healthChecker.stop();
```

###### getStatus

Gets current health status.

```javascript
const status = healthChecker.getStatus();
```

**Returns:**
```javascript
{
  api: {
    healthy: true,
    lastCheck: "2024-01-01T12:00:00.000Z",
    responseTime: 45
  },
  web: {
    healthy: false,
    lastCheck: "2024-01-01T12:00:00.000Z",
    error: "Connection refused"
  }
}
```

---

## Type Definitions

### Configuration Object

```typescript
interface Config {
  httpsPort: number;
  httpRedirectPort: number | null;
  dashboardAlias: string;
  hostnameStrategy: 'sslip' | 'nip' | 'custom';
  preferredIp: string | null;
  certDir: string | null;
  dashboardEnabled: boolean;
  autoOpenBrowser: boolean;
  routes: Route[];
}

interface Route {
  alias: string;
  target: {
    protocol: 'http' | 'https';
    host: string;
    port: number;
  };
  healthcheck?: string;
  stripPrefix?: string;
  headers?: Record<string, string>;
  showInDashboard?: boolean;
}
```

### Runtime Info

```typescript
interface RuntimeInfo {
  ip: string;
  hostnames: {
    routes: Array<{
      alias: string;
      hostname: string;
      target: Route['target'];
    }>;
    dashboard: {
      alias: string;
      hostname: string;
    };
  };
}
```

## Error Handling

All async functions may throw errors. Always wrap in try/catch:

```javascript
import { loadConfig, validateConfig } from 'devgate/config';

try {
  const config = await loadConfig('./devgate.json');
  const validation = validateConfig(config);
  
  if (!validation.valid) {
    console.error('Config errors:', validation.errors);
    process.exit(1);
  }
  
  // Use config...
} catch (error) {
  console.error('Failed to load config:', error.message);
  process.exit(1);
}
```
