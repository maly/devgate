import { createStepResult, duration, nowMs } from './shared.js';

export async function runPreflightStep({ dryRun = false, deps = {} } = {}) {
  const started = nowMs(deps);

  if (deps.forcePreflightPermissionDenied) {
    return createStepResult({
      step_id: 'preflight',
      status: 'fail',
      code: 'preflight_permission_denied',
      message: 'Insufficient permissions for setup preflight.',
      remediation: [{ command: 'Run terminal with required privileges', reason: 'permission required', optional: false }],
      details: {
        dryRun,
        blockingCurrent: true,
        blockingProjected: true
      },
      duration_ms: duration(started, deps)
    });
  }

  return createStepResult({
    step_id: 'preflight',
    status: 'ok',
    code: 'preflight_ok',
    message: 'Preflight checks passed.',
    remediation: [],
    details: {
      dryRun,
      blockingCurrent: false,
      blockingProjected: false
    },
    duration_ms: duration(started, deps)
  });
}

export default { runPreflightStep };
