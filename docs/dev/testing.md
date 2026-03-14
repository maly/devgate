# Testing Guide

This guide covers testing practices and procedures for devgate.

## Test Stack

- **Vitest** - Test runner and framework
- **Node.js** - Runtime for tests

## Running Tests

### All Tests

```bash
npm run test:run
```

### Watch Mode

```bash
npm test
```

### Specific Test Files

```bash
# Unit tests
npm run test:run tests/unit/

# Integration tests
npm run test:run tests/integration/

# E2E tests
npm run test:run tests/e2e/

# Single file
npm run test:run tests/unit/ip-detection.test.js
```

### With Coverage

```bash
npm run test:run -- --coverage
```

## Test Structure

```
tests/
├── unit/                   # Unit tests
│   ├── config.test.js
│   ├── ip-detection.test.js
│   ├── hostname-builder.test.js
│   └── cert-manager.test.js
├── integration/            # Integration tests
│   ├── http-routing.test.js
│   ├── websocket-proxy.test.js
│   └── healthcheck.test.js
└── e2e/                   # End-to-end tests
    └── full-proxy.test.js
```

## Writing Tests

### Unit Test Example

```javascript
import { describe, it, expect } from 'vitest';
import { detectLocalIp } from '../../api/ip-detection.js';

describe('detectLocalIp', () => {
  it('should return an object with ip property', () => {
    const result = detectLocalIp();
    
    expect(result).toBeDefined();
    expect(result).toHaveProperty('ip');
    expect(result).toHaveProperty('interface');
    expect(result).toHaveProperty('reason');
  });

  it('should prefer user-specified IP', () => {
    const result = detectLocalIp({ preferredIp: '192.168.1.100' });
    
    expect(result.ip).toBe('192.168.1.100');
    expect(result.interface).toBe('user-specified');
  });

  it('should reject invalid IPs', () => {
    const result = detectLocalIp({ preferredIp: '999.999.999.999' });
    
    // Should fall back to auto-detection
    expect(result).toBeDefined();
  });
});
```

### Integration Test Example

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createProxy } from '../../proxy/index.js';

describe('HTTP Routing', () => {
  let proxy;
  let targetServer;

  beforeAll(() => {
    // Start target server
    targetServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Hello from target');
    });
    targetServer.listen(19999);

    // Create proxy
    proxy = createProxy({
      port: 19998,
      routes: {
        'test.local': {
          target: 'http://localhost:19999'
        }
      }
    });
    
    return proxy.start();
  });

  afterAll(async () => {
    await proxy.stop();
    targetServer.close();
  });

  it('should route to correct upstream', async () => {
    const response = await fetch('http://localhost:19998', {
      headers: { Host: 'test.local' }
    });
    
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('Hello from target');
  });
});
```

## Test Fixtures

The project includes test fixtures for integration testing:

### Starting Fixtures

```javascript
import { startFixtures, stopFixtures } from '../fixtures/index.js';

beforeAll(async () => {
  await startFixtures();
});

afterAll(async () => {
  await stopFixtures();
});
```

### Available Fixtures

| Service | Port | Endpoints |
|---------|------|-----------|
| app | 10001 | GET /, GET /ws (WebSocket) |
| api | 10002 | GET / (returns JSON) |
| admin | 10003 | GET / |

### Manual Testing

```bash
# Start fixtures in one terminal
node fixtures/index.js

# Test manually
curl http://localhost:10001/
curl http://localhost:10002/
curl http://localhost:10003/
```

## Mocking

### Mocking Modules

```javascript
import { vi } from 'vitest';

// Mock a module
vi.mock('../cert/index.js', () => ({
  CertManager: vi.fn().mockImplementation(() => ({
    checkMkcert: vi.fn().mockResolvedValue(true),
    ensureCertificates: vi.fn().mockResolvedValue({})
  }))
}));
```

### Mocking Time

```javascript
import { vi } from 'vitest';

// Mock Date
const mockDate = new Date('2024-01-01');
vi.setSystemTime(mockDate);

// Restore
vi.useRealTimers();
```

## Test Utilities

### Waiting for Server

```javascript
async function waitForServer(port, timeout = 5000) {
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(`http://localhost:${port}`);
      if (response.ok) return true;
    } catch {
      await new Promise(r => setTimeout(r, 100));
    }
  }
  return false;
}
```

### Generating Test Configs

```javascript
function createTestConfig(overrides = {}) {
  return {
    httpsPort: 18443,
    httpRedirectPort: 18080,
    dashboardAlias: 'dev',
    routes: [],
    ...overrides
  };
}
```

## CI Considerations

### Sequential Tests

On Windows, port conflicts may occur with parallel tests. Run tests sequentially:

```bash
npm run test:run -- --pool=forks --poolOptions.forks.singleFork
```

### Test Isolation

- Each test should be independent
- Clean up resources in `afterAll` or `afterEach`
- Use unique ports for each test
- Don't rely on test execution order

## Coverage Reports

Generate HTML coverage report:

```bash
npm run test:run -- --coverage
```

View coverage:
```bash
# Open in browser
npx playwright test --coverage-report="html"
# or
npx vitest --coverage --coverage.reporter=html
```

## Debugging Tests

### Verbose Output

```bash
npm run test:run -- --reporter=verbose
```

### Debug Specific Test

```javascript
it('should work', async () => {
  console.log('Debug info:', someVariable);
  // Add breakpoints
  debugger;
});
```

Run with Node debugger:
```bash
node --inspect-brk node_modules/vitest/vitest.mjs run
```

## Best Practices

1. **Test one thing per test** - Each test should verify a single behavior
2. **Use descriptive names** - Test names should describe what they verify
3. **AAA pattern** - Arrange, Act, Assert
4. **Avoid test interdependence** - Tests should run in any order
5. **Clean up** - Always clean up resources in `afterAll`
6. **Use meaningful assertions** - Don't just check truthiness
7. **Test edge cases** - Null, undefined, empty, invalid input

## Common Patterns

### Testing Async Operations

```javascript
it('should handle async errors', async () => {
  await expect(loadConfig('./invalid.json')).rejects.toThrow();
});
```

### Testing Event Emitters

```javascript
it('should emit config-change event', async () => {
  const eventPromise = new Promise(resolve => {
    proxy.on('config-change', resolve);
  });
  
  await proxy.reload(newConfig);
  
  const event = await eventPromise;
  expect(event).toBeDefined();
});
```

### Testing WebSocket

```javascript
import WebSocket from 'ws';

it('should proxy WebSocket connections', async () => {
  const ws = new WebSocket('ws://localhost:18443/ws', {
    headers: { Host: 'app.local' }
  });

  await new Promise(resolve => ws.on('open', resolve));
  ws.send('test');
  
  const message = await new Promise(resolve => ws.on('message', resolve));
  expect(message.toString()).toBe('response');
  
  ws.close();
});
```
