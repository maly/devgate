import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('../../api/ip-detection.js', () => ({
  detectLocalIp: vi.fn(() => ({ ip: '192.168.1.50', interface: 'eth0', reason: 'test' }))
}));

const createProxyMock = vi.fn(() => ({
  start: vi.fn(async () => undefined),
  stop: vi.fn(async () => undefined),
  on: vi.fn(),
  setRuntimeState: vi.fn(),
  setCertState: vi.fn(),
  setRoutesState: vi.fn(),
  setHealthState: vi.fn()
}));

vi.mock('../../proxy/index.js', () => ({
  createProxy: createProxyMock
}));

vi.mock('../../cert/index.js', () => ({
  CertManager: vi.fn().mockImplementation(() => ({
    checkMkcert: vi.fn(async () => false),
    ensureCertificates: vi.fn(async () => true),
    getCertificateInfo: vi.fn(() => ({
      mode: 'self-signed',
      certPath: '/tmp/devgate.pem',
      keyPath: '/tmp/devgate.key',
      expiration: null,
      cert: 'cert',
      key: 'key'
    }))
  }))
}));

const getDomainStatusMock = vi.fn(async () => ({
  status: 'missing',
  code: 'resolver_missing',
  message: 'resolver missing',
  remediation: 'Run: sudo devgate domain setup',
  platform: 'linux',
  provider: 'linux-resolved',
  details: {}
}));
const setupDomainResolverMock = vi.fn(async () => ({ status: 'ready', code: 'resolver_ready' }));
const teardownDomainResolverMock = vi.fn(async () => ({ status: 'missing', code: 'resolver_missing' }));

vi.mock('../../domain/index.js', () => ({
  getDomainStatus: getDomainStatusMock,
  setupDomainResolver: setupDomainResolverMock,
  teardownDomainResolver: teardownDomainResolverMock
}));

const { default: cli } = await import('../../cli/index.js');

function setPlatform(value) {
  Object.defineProperty(process, 'platform', { value });
}

describe('domain CLI integration', () => {
  const originalPlatform = process.platform;
  const originalEnv = process.env.DEVGATE_TEST_ONCE;
  let configPath;
  let logs = [];
  let errors = [];
  let logSpy;
  let errorSpy;

  beforeEach(() => {
    logs = [];
    errors = [];
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')));
    errorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args.join(' ')));

    configPath = path.join(os.tmpdir(), `devgate-domain-test-${Date.now()}.json`);
    fs.writeFileSync(configPath, JSON.stringify({
      domainMode: 'auto',
      routes: [
        { alias: 'app', target: { protocol: 'http', host: 'localhost', port: 3000 } }
      ]
    }));
  });

  afterEach(() => {
    if (logSpy) logSpy.mockRestore();
    if (errorSpy) errorSpy.mockRestore();
    setPlatform(originalPlatform);
    process.env.DEVGATE_TEST_ONCE = originalEnv;
    try {
      fs.unlinkSync(configPath);
    } catch {}
  });

  it('domain status prints structured resolver state on linux/macos', async () => {
    setPlatform('linux');
    getDomainStatusMock.mockResolvedValueOnce({
      status: 'ready',
      code: 'resolver_ready',
      message: 'ok',
      remediation: '',
      platform: 'linux',
      provider: 'linux-resolved',
      details: {}
    });

    const result = await cli.run(['domain', 'status']);

    expect(result.exitCode).toBe(0);
    expect(logs.join('\n')).toContain('Code: resolver_ready');
    expect(logs.join('\n')).toContain('Provider: linux-resolved');
  });

  it('start on linux with missing resolver logs warning and uses sslip hostnames', async () => {
    setPlatform('linux');
    process.env.DEVGATE_TEST_ONCE = '1';
    getDomainStatusMock.mockResolvedValueOnce({
      status: 'missing',
      code: 'resolver_missing',
      message: 'resolver missing',
      remediation: 'Run: sudo devgate domain setup',
      platform: 'linux',
      provider: 'linux-resolved',
      details: {}
    });

    const result = await cli.run(['start', '--config', configPath]);

    expect(result.exitCode).toBe(0);
    expect(result.strategy).toBe('sslip');
    expect(result.fallback).toBe(true);
    expect(logs.join('\n')).toContain('sudo devgate domain setup');
    expect(logs.join('\n')).toContain('app.192-168-1-50.sslip.io');
  });

  it('start on linux with ready resolver uses .devgate hostnames', async () => {
    setPlatform('linux');
    process.env.DEVGATE_TEST_ONCE = '1';
    getDomainStatusMock.mockResolvedValueOnce({
      status: 'ready',
      code: 'resolver_ready',
      message: 'ready',
      remediation: '',
      platform: 'linux',
      provider: 'linux-resolved',
      details: {}
    });

    const result = await cli.run(['start', '--config', configPath]);

    expect(result.exitCode).toBe(0);
    expect(result.strategy).toBe('devgate');
    expect(logs.join('\n')).toContain('app.devgate');
  });

  it('start on windows forces sslip even when mode devgate', async () => {
    setPlatform('win32');
    process.env.DEVGATE_TEST_ONCE = '1';

    const result = await cli.run(['start', '--config', configPath, '--domain-mode', 'devgate']);

    expect(result.exitCode).toBe(0);
    expect(result.strategy).toBe('sslip');
    expect(result.fallback).toBe(false);
    expect(logs.join('\n')).toContain('Strategy: sslip');
  });

  it('start with explicit devgate mode and missing resolver falls back without error', async () => {
    setPlatform('linux');
    process.env.DEVGATE_TEST_ONCE = '1';
    getDomainStatusMock.mockResolvedValueOnce({
      status: 'missing',
      code: 'resolver_missing',
      message: 'resolver missing',
      remediation: 'Run: sudo devgate domain setup',
      platform: 'linux',
      provider: 'linux-resolved',
      details: {}
    });

    const result = await cli.run(['start', '--config', configPath, '--domain-mode', 'devgate']);

    expect(result.exitCode).toBe(0);
    expect(result.strategy).toBe('sslip');
    expect(result.fallback).toBe(true);
  });

  it('domain-mode CLI flag overrides config mode in print-hosts', async () => {
    setPlatform('linux');
    getDomainStatusMock.mockResolvedValueOnce({
      status: 'ready',
      code: 'resolver_ready',
      message: 'ready',
      remediation: '',
      platform: 'linux',
      provider: 'linux-resolved',
      details: {}
    });

    const result = await cli.run(['print-hosts', '--config', configPath, '--domain-mode', 'devgate']);

    expect(result.exitCode).toBe(0);
    expect(logs.join('\n')).toContain('Strategy: devgate');
    expect(logs.join('\n')).toContain('app.devgate');
  });

  it('doctor reports resolver status code and active strategy', async () => {
    setPlatform('linux');
    getDomainStatusMock.mockResolvedValueOnce({
      status: 'missing',
      code: 'resolver_missing',
      message: 'resolver missing',
      remediation: 'Run: sudo devgate domain setup',
      platform: 'linux',
      provider: 'linux-resolved',
      details: {}
    });
    getDomainStatusMock.mockResolvedValueOnce({
      status: 'missing',
      code: 'resolver_missing',
      message: 'resolver missing',
      remediation: 'Run: sudo devgate domain setup',
      platform: 'linux',
      provider: 'linux-resolved',
      details: {}
    });

    const result = await cli.run(['doctor', '--config', configPath]);

    expect(result.exitCode).toBe(0);
    expect(logs.join('\n')).toContain('Code: resolver_missing');
    expect(logs.join('\n')).toContain('Effective strategy: sslip');
    expect(logs.join('\n')).toContain('Fallback active: yes');
  });
});
