import { describe, it, expect } from 'vitest';
import { buildHostnames, ipToDashes } from '../../api/hostname-builder.js';

describe('Hostname Builder', () => {
  describe('ipToDashes', () => {
    it('should convert IP to dashes format', () => {
      expect(ipToDashes('192.168.1.1')).toBe('192-168-1-1');
    });

    it('should handle single digit octets', () => {
      expect(ipToDashes('10.0.0.1')).toBe('10-0-0-1');
    });

    it('should handle multi-digit octets', () => {
      expect(ipToDashes('192.168.100.250')).toBe('192-168-100-250');
    });

    it('should throw for non-string', () => {
      expect(() => ipToDashes(123)).toThrow('Invalid IP address');
    });

    it('should handle any string input without throwing', () => {
      expect(ipToDashes('invalid')).toBe('invalid');
    });

    it('should throw for empty string', () => {
      expect(() => ipToDashes('')).toThrow('Invalid IP address');
    });

    it('should throw for null', () => {
      expect(() => ipToDashes(null)).toThrow('Invalid IP address');
    });

    it('should throw for undefined', () => {
      expect(() => ipToDashes(undefined)).toThrow('Invalid IP address');
    });

    it('should throw for non-string', () => {
      expect(() => ipToDashes(123)).toThrow('Invalid IP address');
    });
  });

  describe('buildHostnames', () => {
    it('should throw for invalid config', () => {
      expect(() => buildHostnames(null, { ip: '192.168.1.1' })).toThrow('Config must be an object');
    });

    it('should throw for invalid runtimeInfo', () => {
      expect(() => buildHostnames({}, null)).toThrow('runtimeInfo with ip is required');
    });

    it('should throw for missing ip in runtimeInfo', () => {
      expect(() => buildHostnames({}, {})).toThrow('runtimeInfo with ip is required');
    });

    it('should build hostnames with default dashboard alias', () => {
      const config = {
        routes: [
          { alias: 'app', target: { protocol: 'http', host: 'localhost', port: 3000 } }
        ]
      };
      const runtimeInfo = { ip: '192.168.1.1' };

      const result = buildHostnames(config, runtimeInfo);

      expect(result.routes).toHaveLength(1);
      expect(result.routes[0].hostname).toBe('app.192-168-1-1.sslip.io');
      expect(result.dashboard.hostname).toBe('dev.192-168-1-1.sslip.io');
    });

    it('should use custom dashboard alias', () => {
      const config = {
        routes: [],
        dashboardAlias: 'admin'
      };
      const runtimeInfo = { ip: '192.168.1.1' };

      const result = buildHostnames(config, runtimeInfo);

      expect(result.dashboard.hostname).toBe('admin.192-168-1-1.sslip.io');
    });

    it('should build hostnames for multiple routes', () => {
      const config = {
        routes: [
          { alias: 'app', target: { protocol: 'http', host: 'localhost', port: 3000 } },
          { alias: 'api', target: { protocol: 'http', host: 'localhost', port: 4000 } },
          { alias: 'admin', target: { protocol: 'http', host: 'localhost', port: 5000 } }
        ]
      };
      const runtimeInfo = { ip: '192.168.1.1' };

      const result = buildHostnames(config, runtimeInfo);

      expect(result.routes).toHaveLength(3);
      expect(result.routes[0].hostname).toBe('app.192-168-1-1.sslip.io');
      expect(result.routes[1].hostname).toBe('api.192-168-1-1.sslip.io');
      expect(result.routes[2].hostname).toBe('admin.192-168-1-1.sslip.io');
    });

    it('should preserve route target in result', () => {
      const config = {
        routes: [
          { alias: 'app', target: { protocol: 'https', host: 'myapp.local', port: 3000 } }
        ]
      };
      const runtimeInfo = { ip: '192.168.1.1' };

      const result = buildHostnames(config, runtimeInfo);

      expect(result.routes[0].target).toEqual({ protocol: 'https', host: 'myapp.local', port: 3000 });
    });

    it('should handle empty routes array', () => {
      const config = { routes: [] };
      const runtimeInfo = { ip: '192.168.1.1' };

      const result = buildHostnames(config, runtimeInfo);

      expect(result.routes).toHaveLength(0);
      expect(result.dashboard.hostname).toBe('dev.192-168-1-1.sslip.io');
    });

    it('should use default dashboard alias when not specified', () => {
      const config = { routes: [] };
      const runtimeInfo = { ip: '192.168.1.1' };

      const result = buildHostnames(config, runtimeInfo);

      expect(result.dashboard.alias).toBe('dev');
    });
  });
});
