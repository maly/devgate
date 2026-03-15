import { getDomainStatus, setupDomainResolver } from '../../domain/index.js';
import { createStepResult, duration, nowMs } from './shared.js';

export async function runDomainStep({ platform = process.platform, dryRun = false, deps = {} } = {}) {
  const started = nowMs(deps);
  const details = {
    dryRun,
    platform,
    blockingCurrent: false,
    blockingProjected: false
  };

  if (platform === 'win32') {
    return createStepResult({
      step_id: 'domain',
      status: 'not_applicable',
      code: 'domain_not_applicable',
      message: 'Native domain setup is not applicable on Windows.',
      remediation: [],
      details,
      duration_ms: duration(started, deps)
    });
  }

  if (deps.forceDomainPermissionDenied) {
    return createStepResult({
      step_id: 'domain',
      status: 'fail',
      code: 'domain_permission_denied',
      message: 'Domain setup requires elevated privileges.',
      remediation: [{ command: 'sudo devgate domain setup', reason: 'configure domain resolver', optional: false }],
      details,
      duration_ms: duration(started, deps)
    });
  }

  if (dryRun) {
    const status = await (deps.getDomainStatus ? deps.getDomainStatus({ platform }) : getDomainStatus({ platform }));
    return createStepResult({
      step_id: 'domain',
      status: status.status === 'ready' ? 'ok' : 'warn',
      code: status.status === 'ready' ? 'domain_ready' : 'domain_permission_denied',
      message: status.status === 'ready'
        ? 'Domain resolver is ready.'
        : 'Domain resolver is not ready, setup would be attempted in non-dry-run mode.',
      remediation: status.status === 'ready'
        ? []
        : [{ command: 'sudo devgate domain setup', reason: 'configure domain resolver', optional: false }],
      details,
      duration_ms: duration(started, deps)
    });
  }

  const setup = await (deps.setupDomainResolver ? deps.setupDomainResolver({ platform }) : setupDomainResolver({ platform }));

  if (setup.status === 'ready') {
    return createStepResult({
      step_id: 'domain',
      status: 'ok',
      code: 'domain_ready',
      message: setup.message || 'Domain resolver configured.',
      remediation: [],
      details,
      duration_ms: duration(started, deps)
    });
  }

  if (setup.code === 'permission_denied') {
    return createStepResult({
      step_id: 'domain',
      status: 'fail',
      code: 'domain_permission_denied',
      message: setup.message || 'Domain setup requires elevated privileges.',
      remediation: [{ command: 'sudo devgate domain setup', reason: 'configure domain resolver', optional: false }],
      details,
      duration_ms: duration(started, deps)
    });
  }

  return createStepResult({
    step_id: 'domain',
    status: 'warn',
    code: 'domain_permission_denied',
    message: setup.message || 'Domain setup was not completed, fallback remains available.',
    remediation: [{ command: 'sudo devgate domain setup', reason: 'enable native .devgate resolution', optional: true }],
    details,
    duration_ms: duration(started, deps)
  });
}

export default { runDomainStep };
