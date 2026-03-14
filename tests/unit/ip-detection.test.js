import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectLocalIp } from '../../api/ip-detection.js';
import os from 'os';

describe('IP Detection', () => {
  describe('detectLocalIp', () => {
    beforeEach(() => {
      vi.resetModules();
    });

    it('should return null when no network interfaces found', () => {
      vi.spyOn(os, 'networkInterfaces').mockReturnValue({});
      const result = detectLocalIp();
      expect(result).toBeNull();
    });

    it('should use preferred IP when provided', () => {
      vi.spyOn(os, 'networkInterfaces').mockReturnValue({
        'eth0': [{
          address: '192.168.1.100',
          family: 'IPv4',
          internal: false
        }]
      });

      const result = detectLocalIp({ preferredIp: '10.0.0.1' });
      expect(result.ip).toBe('10.0.0.1');
      expect(result.interface).toBe('user-specified');
      expect(result.reason).toBe('User specified preferred IP');
    });

    it('should prefer active interfaces over inactive', () => {
      vi.spyOn(os, 'networkInterfaces').mockReturnValue({
        'eth0': [{
          address: '192.168.1.100',
          family: 'IPv4',
          internal: false
        }],
        'eth1': [{
          address: '192.168.2.100',
          family: 'IPv4',
          internal: true
        }]
      });

      const result = detectLocalIp();
      expect(result.ip).toBe('192.168.1.100');
    });

    it('should prefer private IPs when available', () => {
      vi.spyOn(os, 'networkInterfaces').mockReturnValue({
        'eth0': [{
          address: '8.8.8.8',
          family: 'IPv4',
          internal: false
        }],
        'eth1': [{
          address: '192.168.1.100',
          family: 'IPv4',
          internal: false
        }]
      });

      const result = detectLocalIp();
      expect(result.ip).toBe('192.168.1.100');
    });

    it('should detect 10.x.x.x private IPs', () => {
      vi.spyOn(os, 'networkInterfaces').mockReturnValue({
        'eth0': [{
          address: '10.0.0.1',
          family: 'IPv4',
          internal: false
        }]
      });

      const result = detectLocalIp();
      expect(result.ip).toBe('10.0.0.1');
    });

    it('should detect 172.16-31.x.x private IPs', () => {
      vi.spyOn(os, 'networkInterfaces').mockReturnValue({
        'eth0': [{
          address: '172.16.0.1',
          family: 'IPv4',
          internal: false
        }]
      });

      const result = detectLocalIp();
      expect(result.ip).toBe('172.16.0.1');
    });

    it('should detect 192.168.x.x private IPs', () => {
      vi.spyOn(os, 'networkInterfaces').mockReturnValue({
        'eth0': [{
          address: '192.168.1.1',
          family: 'IPv4',
          internal: false
        }]
      });

      const result = detectLocalIp();
      expect(result.ip).toBe('192.168.1.1');
    });

    it('should exclude loopback addresses', () => {
      vi.spyOn(os, 'networkInterfaces').mockReturnValue({
        'lo': [{
          address: '127.0.0.1',
          family: 'IPv4',
          internal: true
        }],
        'eth0': [{
          address: '192.168.1.100',
          family: 'IPv4',
          internal: false
        }]
      });

      const result = detectLocalIp();
      expect(result.ip).toBe('192.168.1.100');
    });

    it('should exclude IPv6 addresses', () => {
      vi.spyOn(os, 'networkInterfaces').mockReturnValue({
        'eth0': [{
          address: '::1',
          family: 'IPv6',
          internal: true
        }],
        'eth1': [{
          address: 'fe80::1',
          family: 'IPv6',
          internal: false
        }]
      });

      const result = detectLocalIp();
      expect(result).toBeNull();
    });

    it('should return appropriate reason based on interface status', () => {
      vi.spyOn(os, 'networkInterfaces').mockReturnValue({
        'eth0': [{
          address: '192.168.1.100',
          family: 'IPv4',
          internal: false
        }]
      });

      const result = detectLocalIp();
      expect(result.reason).toContain('Active private network interface');
    });
  });

  describe('IP validation', () => {
    it('should handle network with no valid interfaces', () => {
      vi.spyOn(os, 'networkInterfaces').mockReturnValue({});
      const result = detectLocalIp();
      expect(result).toBeNull();
    });
  });
});
