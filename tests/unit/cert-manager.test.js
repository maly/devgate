import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CertManager } from '../../cert/index.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

describe('CertManager', () => {
  let testDir;
  let manager;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), 'devgate-cert-test-' + Date.now());
    manager = new CertManager({
      certDir: testDir,
      selfSignedFallback: true
    });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (e) {}
  });

  describe('constructor', () => {
    it('should use default cert dir when not provided', () => {
      const defaultManager = new CertManager();
      expect(defaultManager.certDir).toContain('.devgate');
    });

    it('should use custom cert dir when provided', () => {
      const customManager = new CertManager({ certDir: '/custom/path' });
      expect(customManager.certDir).toBe('/custom/path');
    });

    it('should set default certificate paths', () => {
      expect(manager.certPath).toBe(path.join(testDir, 'devgate.pem'));
      expect(manager.keyPath).toBe(path.join(testDir, 'devgate.key'));
    });

    it('should enable self-signed fallback by default', () => {
      const defaultManager = new CertManager();
      expect(defaultManager.selfSignedFallback).toBe(true);
    });

    it('should allow disabling self-signed fallback', () => {
      const managerNoFallback = new CertManager({ selfSignedFallback: false });
      expect(managerNoFallback.selfSignedFallback).toBe(false);
    });
  });

  describe('getCertificateInfo', () => {
    it('should return certificate info with null values initially', () => {
      const info = manager.getCertificateInfo();
      
      expect(info.certDir).toBe(testDir);
      expect(info.certPath).toBe(path.join(testDir, 'devgate.pem'));
      expect(info.keyPath).toBe(path.join(testDir, 'devgate.key'));
      expect(info.mode).toBeNull();
      expect(info.expiration).toBeNull();
    });
  });

  describe('ensureCertificates', () => {
    it('should create certificate directory if not exists', async () => {
      await manager.ensureCertificates(['test.local']);
      
      const dirExists = await fs.access(testDir).then(() => true).catch(() => false);
      expect(dirExists).toBe(true);
    });

    it('includes .devgate hostnames in certificate generation host list', async () => {
      const generateSpy = vi.spyOn(manager, '_generateSelfSigned').mockResolvedValue(true);
      vi.spyOn(manager, '_areCertificatesValid').mockResolvedValue(false);
      vi.spyOn(manager, 'checkMkcert').mockResolvedValue(false);

      await manager.ensureCertificates(['app.devgate', 'dev.devgate']);

      expect(generateSpy).toHaveBeenCalledWith(expect.arrayContaining(['app.devgate', 'dev.devgate']));
    });
  });

  describe('regenerate', () => {
    it('should handle regenerating certificates', async () => {
      await manager.regenerate(['test.local']);
      
      const certExists = await fs.access(manager.certPath).then(() => true).catch(() => false);
      expect(certExists).toBe(true);
    });
  });
});
