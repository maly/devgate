import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateConfig, loadConfig, resolveRuntimeConfig, getDefaultConfig, loadValidateResolveConfig } from '../../config/index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Config Validation', () => {
describe('validateConfig', () => {
  it('should return valid for empty config with routes array', () => {
    const result = validateConfig({ routes: [] });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

    it('should return invalid for non-object config', () => {
      const result = validateConfig('string');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Config must be an object');
    });

    it('should return invalid for array config', () => {
      const result = validateConfig([]);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Config must be an object');
    });

    it('should return invalid for null config', () => {
      const result = validateConfig(null);
      expect(result.valid).toBe(false);
    });

    describe('httpsPort validation', () => {
    it('should accept valid httpsPort', () => {
      const result = validateConfig({ httpsPort: 443, routes: [] });
      expect(result.valid).toBe(true);
    });

      it('should reject non-number httpsPort', () => {
        const result = validateConfig({ httpsPort: '443' });
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('httpsPort');
      });

      it('should reject out of range httpsPort', () => {
        const result = validateConfig({ httpsPort: 70000 });
        expect(result.valid).toBe(false);
      });

      it('should reject zero httpsPort', () => {
        const result = validateConfig({ httpsPort: 0 });
        expect(result.valid).toBe(false);
      });
    });

    describe('httpRedirectPort validation', () => {
    it('should accept valid httpRedirectPort', () => {
      const result = validateConfig({ httpRedirectPort: 80, routes: [] });
      expect(result.valid).toBe(true);
    });

    it('should accept null httpRedirectPort', () => {
      const result = validateConfig({ httpRedirectPort: null, routes: [] });
      expect(result.valid).toBe(true);
    });

      it('should reject invalid httpRedirectPort', () => {
        const result = validateConfig({ httpRedirectPort: 'abc' });
        expect(result.valid).toBe(false);
      });
    });

    describe('dashboardAlias validation', () => {
    it('should accept valid dashboardAlias', () => {
      const result = validateConfig({ dashboardAlias: 'dev', routes: [] });
      expect(result.valid).toBe(true);
    });

      it('should reject empty dashboardAlias', () => {
        const result = validateConfig({ dashboardAlias: '' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('dashboardAlias must be a non-empty string');
      });

      it('should reject non-string dashboardAlias', () => {
        const result = validateConfig({ dashboardAlias: 123 });
        expect(result.valid).toBe(false);
      });
    });

    describe('hostnameStrategy validation', () => {
    it('should accept sslip strategy', () => {
      const result = validateConfig({ hostnameStrategy: 'sslip', routes: [] });
      expect(result.valid).toBe(true);
    });

    describe('domainMode validation', () => {
      it('should accept auto mode', () => {
        const result = validateConfig({ domainMode: 'auto', routes: [] });
        expect(result.valid).toBe(true);
      });

      it('should accept sslip mode', () => {
        const result = validateConfig({ domainMode: 'sslip', routes: [] });
        expect(result.valid).toBe(true);
      });

      it('should accept devgate mode', () => {
        const result = validateConfig({ domainMode: 'devgate', routes: [] });
        expect(result.valid).toBe(true);
      });

      it('should reject invalid domain mode', () => {
        const result = validateConfig({ domainMode: 'bad-mode', routes: [] });
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('domainMode must be one of');
      });
    });

    it('should accept nip strategy', () => {
      const result = validateConfig({ hostnameStrategy: 'nip', routes: [] });
      expect(result.valid).toBe(true);
    });

    it('should accept custom strategy', () => {
      const result = validateConfig({ hostnameStrategy: 'custom', routes: [] });
      expect(result.valid).toBe(true);
    });

      it('should reject invalid strategy', () => {
        const result = validateConfig({ hostnameStrategy: 'invalid' });
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('hostnameStrategy must be one of');
      });
    });

    describe('routes validation', () => {
      it('should reject non-array routes', () => {
        const result = validateConfig({ routes: 'not-an-array' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('routes must be an array');
      });

      it('should accept valid routes', () => {
        const config = {
          routes: [{
            alias: 'myapp',
            target: {
              protocol: 'http',
              host: 'localhost',
              port: 3000
            }
          }]
        };
        const result = validateConfig(config);
        expect(result.valid).toBe(true);
      });

      it('should reject route without alias', () => {
        const config = {
          routes: [{
            target: {
              protocol: 'http',
              host: 'localhost',
              port: 3000
            }
          }]
        };
        const result = validateConfig(config);
        expect(result.valid).toBe(false);
      });

      it('should reject route with invalid alias', () => {
        const config = {
          routes: [{
            alias: '-invalid',
            target: {
              protocol: 'http',
              host: 'localhost',
              port: 3000
            }
          }]
        };
        const result = validateConfig(config);
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('alias must be DNS-safe');
      });

      it('should reject route without target', () => {
        const config = {
          routes: [{
            alias: 'myapp'
          }]
        };
        const result = validateConfig(config);
        expect(result.valid).toBe(false);
      });

      it('should reject route with invalid target protocol', () => {
        const config = {
          routes: [{
            alias: 'myapp',
            target: {
              protocol: 'ftp',
              host: 'localhost',
              port: 3000
            }
          }]
        };
        const result = validateConfig(config);
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('target.protocol');
      });

      it('should reject route with invalid port', () => {
        const config = {
          routes: [{
            alias: 'myapp',
            target: {
              protocol: 'http',
              host: 'localhost',
              port: 70000
            }
          }]
        };
        const result = validateConfig(config);
        expect(result.valid).toBe(false);
      });

      it('should accept route with optional fields', () => {
        const config = {
          routes: [{
            alias: 'myapp',
            target: {
              protocol: 'http',
              host: 'localhost',
              port: 3000
            },
            healthcheck: '/health',
            stripPrefix: '/api',
            headers: { 'X-Custom': 'value' },
            showInDashboard: true
          }]
        };
        const result = validateConfig(config);
        expect(result.valid).toBe(true);
      });

      it('should reject invalid headers', () => {
        const config = {
          routes: [{
            alias: 'myapp',
            target: {
              protocol: 'http',
              host: 'localhost',
              port: 3000
            },
            headers: 'not-an-object'
          }]
        };
        const result = validateConfig(config);
        expect(result.valid).toBe(false);
      });

      it('should reject invalid showInDashboard', () => {
        const config = {
          routes: [{
            alias: 'myapp',
            target: {
              protocol: 'http',
              host: 'localhost',
              port: 3000
            },
            showInDashboard: 'yes'
          }]
        };
        const result = validateConfig(config);
        expect(result.valid).toBe(false);
      });
    });

    describe('boolean fields', () => {
    it('should accept valid dashboardEnabled', () => {
      const result = validateConfig({ dashboardEnabled: true, routes: [] });
      expect(result.valid).toBe(true);
    });

      it('should reject non-boolean dashboardEnabled', () => {
        const result = validateConfig({ dashboardEnabled: 'true' });
        expect(result.valid).toBe(false);
      });

    it('should accept valid autoOpenBrowser', () => {
      const result = validateConfig({ autoOpenBrowser: false, routes: [] });
      expect(result.valid).toBe(true);
    });
    });
  });

  describe('loadConfig', () => {
    const testDir = path.join(os.tmpdir(), 'devgate-test-' + Date.now());
    let originalCwd;

    beforeEach(() => {
      fs.mkdirSync(testDir, { recursive: true });
      originalCwd = process.cwd();
    });

    it('should return object config as-is', async () => {
      const config = { routes: [] };
      const result = await loadConfig(config);
      expect(result).toEqual(config);
    });

    it('should throw for invalid input type', async () => {
      await expect(loadConfig(123)).rejects.toThrow('Config must be a file path');
    });

    it('should throw for non-existent file', async () => {
      await expect(loadConfig('/non/existent/path.yaml')).rejects.toThrow('Config file not found');
    });

    it('should load JSON config', async () => {
      const configPath = path.join(testDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify({ httpsPort: 8443 }));
      const result = await loadConfig(configPath);
      expect(result.httpsPort).toBe(8443);
    });

    it('should throw on invalid JSON', async () => {
      const configPath = path.join(testDir, 'invalid.json');
      fs.writeFileSync(configPath, '{ invalid json }');
      await expect(loadConfig(configPath)).rejects.toThrow('Failed to parse config file');
    });
  });

  describe('resolveRuntimeConfig', () => {
    it('should merge config with defaults', () => {
      const config = { httpsPort: 8443 };
      const result = resolveRuntimeConfig(config);
      expect(result.httpsPort).toBe(8443);
      expect(result.httpRedirectPort).toBe(80);
    });

    it('should override config with options', () => {
      const config = { httpsPort: 8443 };
      const options = { httpsPort: 9443 };
      const result = resolveRuntimeConfig(config, options);
      expect(result.httpsPort).toBe(9443);
    });

    it('should apply domainMode from options', () => {
      const config = { domainMode: 'auto', routes: [] };
      const options = { domainMode: 'devgate' };
      const result = resolveRuntimeConfig(config, options);
      expect(result.domainMode).toBe('devgate');
    });

    it('should merge routes from config and options', () => {
      const config = {
        routes: [{ alias: 'app1', target: { protocol: 'http', host: 'localhost', port: 3000 } }]
      };
      const options = {
        routes: [{ alias: 'app2', target: { protocol: 'http', host: 'localhost', port: 4000 } }]
      };
      const result = resolveRuntimeConfig(config, options);
      expect(result.routes).toHaveLength(2);
    });

    it('should override existing route with options', () => {
      const config = {
        routes: [{ alias: 'app', target: { protocol: 'http', host: 'localhost', port: 3000 } }]
      };
      const options = {
        routes: [{ alias: 'app', target: { protocol: 'http', host: 'localhost', port: 4000 } }]
      };
      const result = resolveRuntimeConfig(config, options);
      expect(result.routes[0].target.port).toBe(4000);
    });
  });

  describe('loadValidateResolveConfig', () => {
    const reloadTestDir = path.join(os.tmpdir(), 'devgate-reload-test-' + Date.now());

    beforeEach(() => {
      fs.mkdirSync(reloadTestDir, { recursive: true });
    });

    it('returns ok=true with resolved config for valid input', async () => {
      const configPath = path.join(reloadTestDir, 'reload-valid.json');
      fs.writeFileSync(configPath, JSON.stringify({
        routes: [{ alias: 'app', target: { protocol: 'http', host: 'localhost', port: 3000 } }]
      }));

      const result = await loadValidateResolveConfig(configPath, {});

      expect(result.ok).toBe(true);
      expect(result.loaded.routes).toHaveLength(1);
      expect(result.resolved.routes).toHaveLength(1);
    });

    it('returns ok=false and validation_error for invalid config', async () => {
      const configPath = path.join(reloadTestDir, 'reload-invalid.json');
      fs.writeFileSync(configPath, JSON.stringify({
        routes: [{ alias: '', target: { protocol: 'http', host: 'localhost', port: 3000 } }]
      }));

      const result = await loadValidateResolveConfig(configPath, {});

      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('validation_error');
    });

    it('returns parse_error for invalid JSON syntax', async () => {
      const configPath = path.join(reloadTestDir, 'reload-parse-invalid.json');
      fs.writeFileSync(configPath, '{ bad json');

      const result = await loadValidateResolveConfig(configPath, {});

      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('parse_error');
    });

    it('returns read_error when config path does not exist', async () => {
      const configPath = path.join(reloadTestDir, 'does-not-exist.json');

      const result = await loadValidateResolveConfig(configPath, {});

      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('read_error');
    });
  });

  describe('getDefaultConfig', () => {
    it('should return default config', () => {
      const defaults = getDefaultConfig();
      expect(defaults.httpsPort).toBe(443);
      expect(defaults.httpRedirectPort).toBe(80);
      expect(defaults.dashboardAlias).toBe('dev');
      expect(defaults.domainMode).toBe('auto');
      expect(defaults.hostnameStrategy).toBe('sslip');
      expect(defaults.routes).toEqual([]);
    });
  });
});
