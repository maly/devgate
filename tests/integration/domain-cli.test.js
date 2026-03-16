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

const runSetupMock = vi.fn(async (options = {}) => ({
  schema_version: '1',
  command: 'setup',
  start_ready: !options.dryRun,
  projected_start_ready: true,
  exit_code: 0,
  code: options.dryRun ? 'setup_projected_ready' : 'setup_ready',
  summary: { ok: 5, warn: 0, fail: 0, not_applicable: 0 },
  steps: []
}));

vi.mock('../../setup/index.js', () => ({
  runSetup: runSetupMock
}));

const acquireInstanceLockMock = vi.fn(async () => ({
  acquired: true,
  lockPath: '/tmp/devgate.lock',
  record: { pid: 123, instanceId: 'test-lock' },
  existing: null
}));
const releaseInstanceLockMock = vi.fn(async () => true);
const forceStopInstanceMock = vi.fn(async () => ({
  ok: true,
  code: 'instance_force_stopped',
  message: 'Previous instance force-stopped.'
}));

vi.mock('../../instance/index.js', () => ({
  acquireInstanceLock: acquireInstanceLockMock,
  releaseInstanceLock: releaseInstanceLockMock,
  forceStopInstance: forceStopInstanceMock
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

  it('start fails when another instance is running and --force is not set', async () => {
    setPlatform('linux');
    acquireInstanceLockMock.mockResolvedValueOnce({
      acquired: false,
      lockPath: '/tmp/devgate.lock',
      record: null,
      existing: { pid: 7777, workspace: '/tmp/other-workspace' }
    });

    const result = await cli.run(['start', '--config', configPath]);

    expect(result.exitCode).toBe(1);
    expect(errors.join('\n')).toContain('Use --force');
  });

  it('start with --force stops previous instance and continues startup', async () => {
    setPlatform('linux');
    process.env.DEVGATE_TEST_ONCE = '1';
    acquireInstanceLockMock
      .mockResolvedValueOnce({
        acquired: false,
        lockPath: '/tmp/devgate.lock',
        record: null,
        existing: { pid: 8888, workspace: '/tmp/other-workspace' }
      })
      .mockResolvedValueOnce({
        acquired: true,
        lockPath: '/tmp/devgate.lock',
        record: { pid: 123, instanceId: 'test-lock-force' },
        existing: null
      });

    const result = await cli.run(['start', '--config', configPath, '--force']);

    expect(result.exitCode).toBe(0);
    expect(forceStopInstanceMock).toHaveBeenCalledTimes(1);
    expect(logs.join('\n')).toContain('Previous instance stopped');
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

  it('setup runs and maps exit by start_ready in non-dry-run mode', async () => {
    runSetupMock.mockResolvedValueOnce({
      schema_version: '1',
      command: 'setup',
      start_ready: false,
      projected_start_ready: true,
      exit_code: 1,
      code: 'setup_not_ready',
      summary: { ok: 2, warn: 1, fail: 1, not_applicable: 1 },
      steps: []
    });

    const result = await cli.run(['setup']);

    expect(result.exitCode).toBe(1);
  });

  it('setup --json prints top-level schema contract', async () => {
    const result = await cli.run(['setup', '--json']);
    const output = logs.join('\n');
    const parsed = JSON.parse(output);

    expect(result.exitCode).toBe(0);
    expect(parsed.schema_version).toBe('1');
    expect(parsed.command).toBe('setup');
    expect(typeof parsed.start_ready).toBe('boolean');
    expect(typeof parsed.projected_start_ready).toBe('boolean');
    expect([0, 1]).toContain(parsed.exit_code);
    expect(typeof parsed.code).toBe('string');
    expect(parsed.summary).toBeTruthy();
    expect(parsed.steps).toBeInstanceOf(Array);
  });

  it('setup --dry-run uses projected_start_ready for exit code', async () => {
    runSetupMock.mockResolvedValueOnce({
      schema_version: '1',
      command: 'setup',
      start_ready: false,
      projected_start_ready: true,
      exit_code: 0,
      code: 'setup_projected_ready',
      summary: { ok: 5, warn: 0, fail: 0, not_applicable: 0 },
      steps: []
    });

    const result = await cli.run(['setup', '--dry-run', '--json']);
    expect(result.exitCode).toBe(0);
  });

  it('setup --json --verbose emits json only', async () => {
    runSetupMock.mockResolvedValueOnce({
      schema_version: '1',
      command: 'setup',
      start_ready: true,
      projected_start_ready: true,
      exit_code: 0,
      code: 'setup_ready',
      summary: { ok: 5, warn: 0, fail: 0, not_applicable: 0 },
      steps: [],
      details: { logs: ['a', 'b'] }
    });
    await cli.run(['setup', '--json', '--verbose']);
    const output = logs.join('\n');
    expect(() => JSON.parse(output)).not.toThrow();
    expect(output).not.toContain('Running setup');
  });

  it('setup --dry-run --verbose renders detailed human logs', async () => {
    runSetupMock.mockResolvedValueOnce({
      schema_version: '1',
      command: 'setup',
      start_ready: false,
      projected_start_ready: true,
      exit_code: 0,
      code: 'setup_projected_ready',
      summary: { ok: 3, warn: 1, fail: 0, not_applicable: 1 },
      steps: [{ step_id: 'mkcert', status: 'warn', code: 'mkcert_install_failed', message: 'dry-run hint', remediation: [], details: {}, duration_ms: 0 }]
    });
    await cli.run(['setup', '--dry-run', '--verbose']);
    expect(logs.join('\n')).toContain('Running setup');
  });

  it('setup --dry-run --json --verbose emits JSON only with details.logs', async () => {
    runSetupMock.mockResolvedValueOnce({
      schema_version: '1',
      command: 'setup',
      start_ready: false,
      projected_start_ready: true,
      exit_code: 0,
      code: 'setup_projected_ready',
      summary: { ok: 3, warn: 1, fail: 0, not_applicable: 1 },
      steps: [],
      details: { logs: ['l1'] }
    });
    await cli.run(['setup', '--dry-run', '--json', '--verbose']);
    const parsed = JSON.parse(logs.join('\n'));
    expect(parsed.details.logs).toBeTruthy();
  });

  it('help command prints global command list', async () => {
    const result = await cli.run(['help']);
    const output = logs.join('\n');

    expect(result.exitCode).toBe(0);
    expect(output).toContain('Commands:');
    expect(output).toContain('start');
    expect(output).toContain('init');
    expect(output).toContain('setup');
    expect(output).toContain('install-mkcert');
    expect(output).toContain('domain');
  });

  it('help command supports specific target command', async () => {
    const result = await cli.run(['help', 'start']);
    const output = logs.join('\n');

    expect(result.exitCode).toBe(0);
    expect(output).toContain('devgate start --config <path> [options]');
    expect(output).toContain('--force');
  });
});
