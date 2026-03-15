import { describe, it, expect } from 'vitest';
import { SETUP_CODES } from '../../setup/codes.js';
import { runPreflightStep } from '../../setup/steps/preflight.js';
import { runMkcertStep } from '../../setup/steps/mkcert.js';
import { runDomainStep } from '../../setup/steps/domain.js';
import { runSummaryStep } from '../../setup/steps/summary.js';

function mkcertAvailableDeps() {
  return {
    certManager: {
      async checkMkcert() { return true; },
      async installMkcert() { return { success: true, message: 'installed' }; }
    }
  };
}

describe('setup steps', () => {
  it('step result contains required fields', async () => {
    const step = await runPreflightStep({ dryRun: true, deps: {} });
    expect(step).toEqual(expect.objectContaining({
      schema_version: '1',
      step_id: 'preflight',
      status: expect.any(String),
      code: expect.any(String),
      message: expect.any(String),
      remediation: expect.any(Array),
      details: expect.any(Object),
      duration_ms: expect.any(Number)
    }));
  });

  it('uses registered setup codes', async () => {
    const step = await runPreflightStep({ dryRun: true, deps: {} });
    expect(SETUP_CODES).toContain(step.code);
  });

  it('returns not_applicable on win32 domain step', async () => {
    const step = await runDomainStep({ platform: 'win32', dryRun: false, deps: {} });
    expect(step.status).toBe('not_applicable');
    expect(step.code).toBe('domain_not_applicable');
  });

  it('returns permission code instead of blocking prompt', async () => {
    const step = await runDomainStep({ platform: 'linux', dryRun: false, deps: { forceDomainPermissionDenied: true } });
    expect(step.code).toBe('domain_permission_denied');
    expect(step.remediation[0].command).toContain('sudo');
  });

  it('enforces status enum and duration constraints in summary', async () => {
    const step = await runSummaryStep({ deps: {} });
    expect(['ok', 'warn', 'fail', 'not_applicable']).toContain(step.status);
    expect(Number.isInteger(step.duration_ms)).toBe(true);
    expect(step.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('requires non-optional remediation on fail status', async () => {
    const step = await runDomainStep({ platform: 'linux', dryRun: false, deps: { forceDomainPermissionDenied: true } });
    expect(step.status).toBe('fail');
    expect(step.remediation.some((r) => r.optional === false)).toBe(true);
  });

  it('attempts mkcert install when missing', async () => {
    const state = { installCalled: false };
    const step = await runMkcertStep({
      dryRun: false,
      deps: {
        certManager: {
          async checkMkcert() { return false; },
          async installMkcert() { state.installCalled = true; return { success: true, message: 'ok' }; }
        }
      }
    });
    expect(state.installCalled).toBe(true);
    expect(step.code).toBe('mkcert_install_succeeded');
  });

  it('returns mkcert_install_failed with warn/fail for timeout variants', async () => {
    const warnStep = await runMkcertStep({ dryRun: false, deps: { forceMkcertTimeoutWarn: true, ...mkcertAvailableDeps() } });
    expect(warnStep.code).toBe('mkcert_install_failed');
    expect(warnStep.status).toBe('warn');

    const failStep = await runMkcertStep({ dryRun: false, deps: { forceMkcertTimeoutFail: true, ...mkcertAvailableDeps() } });
    expect(failStep.code).toBe('mkcert_install_failed');
    expect(failStep.status).toBe('fail');
    expect(failStep.remediation.some((r) => r.optional === false)).toBe(true);
  });

  it('calls existing setupDomainResolver on linux and darwin', async () => {
    const state = { count: 0 };
    const deps = {
      async setupDomainResolver() {
        state.count += 1;
        return { status: 'ready', code: 'resolver_ready', message: 'ok' };
      },
      async getDomainStatus() {
        return { status: 'missing', code: 'resolver_missing' };
      }
    };
    await runDomainStep({ platform: 'linux', dryRun: false, deps });
    await runDomainStep({ platform: 'darwin', dryRun: false, deps });
    expect(state.count).toBe(2);
  });
});
