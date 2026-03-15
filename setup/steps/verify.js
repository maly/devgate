import { createStepResult, duration, nowMs } from './shared.js';

function hasBlocking(steps, key) {
  return steps.some((step) => Boolean(step?.details?.[key]));
}

export async function runVerifyStep({ steps = [], dryRun = false, deps = {} } = {}) {
  const started = nowMs(deps);
  let startReady = !hasBlocking(steps, 'blockingCurrent');
  let projectedStartReady = !hasBlocking(steps, 'blockingProjected');

  if (deps.forceDivergingReadiness) {
    startReady = false;
    projectedStartReady = true;
  }
  const effectiveReady = dryRun ? projectedStartReady : startReady;

  return createStepResult({
    step_id: 'verify',
    status: effectiveReady ? 'ok' : 'fail',
    code: effectiveReady ? 'verify_start_ready' : 'verify_start_not_ready',
    message: effectiveReady ? 'Setup verification indicates start-ready environment.' : 'Setup verification indicates environment is not start-ready.',
    remediation: effectiveReady
      ? []
      : [{ command: 'devgate setup --verbose', reason: 'inspect failing setup steps', optional: false }],
    details: {
      dryRun,
      start_ready: startReady,
      projected_start_ready: projectedStartReady,
      blockingCurrent: !startReady,
      blockingProjected: !projectedStartReady
    },
    duration_ms: duration(started, deps)
  });
}

export default { runVerifyStep };
