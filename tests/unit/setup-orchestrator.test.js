import { describe, it, expect } from 'vitest';
import { runSetup } from '../../setup/index.js';

function createDeps(overrides = {}) {
  const calls = [];
  const deps = {
    platform: 'linux',
    calls,
    certManager: {
      async checkMkcert() { calls.push('mkcert-check'); return true; },
      async installMkcert() { calls.push('mkcert-install'); return { success: true, message: 'installed' }; }
    },
    async getDomainStatus() {
      calls.push('domain-status');
      return { status: 'ready', code: 'resolver_ready' };
    },
    async setupDomainResolver() {
      calls.push('domain-setup');
      return { status: 'ready', code: 'resolver_ready', message: 'ok' };
    },
    ...overrides
  };
  return deps;
}

describe('setup orchestrator', () => {
  it('returns top-level schema contract', async () => {
    const result = await runSetup({ dryRun: false, verbose: false, json: true, deps: createDeps() });
    expect(result).toMatchObject({
      schema_version: '1',
      command: 'setup',
      start_ready: expect.any(Boolean),
      projected_start_ready: expect.any(Boolean),
      exit_code: expect.any(Number),
      code: expect.any(String),
      summary: expect.any(Object),
      steps: expect.any(Array)
    });
    expect(result.command).toBe('setup');
    expect(result.schema_version).toBe('1');
    expect([0, 1]).toContain(result.exit_code);
  });

  it('executes steps in order preflight->mkcert->domain->verify->summary', async () => {
    const result = await runSetup({ deps: createDeps() });
    expect(result.steps.map((s) => s.step_id)).toEqual(['preflight', 'mkcert', 'domain', 'verify', 'summary']);
  });

  it('maps readiness to exit/code by mode', async () => {
    const ready = await runSetup({ dryRun: false, deps: createDeps() });
    expect(ready.start_ready).toBe(true);
    expect(ready.exit_code).toBe(0);
    expect(ready.code).toBe('setup_ready');

    const notReady = await runSetup({ dryRun: false, deps: createDeps({ forcePreflightPermissionDenied: true }) });
    expect(notReady.start_ready).toBe(false);
    expect(notReady.exit_code).toBe(1);
    expect(notReady.code).toBe('setup_not_ready');

    const projectedReady = await runSetup({ dryRun: true, deps: createDeps() });
    expect(projectedReady.projected_start_ready).toBe(true);
    expect(projectedReady.exit_code).toBe(0);
    expect(projectedReady.code).toBe('setup_projected_ready');

    const projectedNotReady = await runSetup({ dryRun: true, deps: createDeps({ forcePreflightPermissionDenied: true }) });
    expect(projectedNotReady.projected_start_ready).toBe(false);
    expect(projectedNotReady.exit_code).toBe(1);
    expect(projectedNotReady.code).toBe('setup_projected_not_ready');
  });

  it('uses projected_start_ready in dry-run but start_ready in non-dry-run', async () => {
    const deps = createDeps({ forceDivergingReadiness: true });
    const nonDry = await runSetup({ dryRun: false, deps });
    const dry = await runSetup({ dryRun: true, deps });
    expect(nonDry.exit_code).toBe(1);
    expect(dry.exit_code).toBe(0);
  });

  it('returns setup_internal_error with partial steps on abort-class errors', async () => {
    const deps = createDeps({
      certManager: {
        async checkMkcert() { throw new Error('boom'); },
        async installMkcert() { return { success: false, message: 'x' }; }
      }
    });
    const result = await runSetup({ deps });
    expect(result.exit_code).toBe(1);
    expect(result.code).toBe('setup_internal_error');
    expect(result.steps.length).toBeGreaterThan(0);
  });
});
