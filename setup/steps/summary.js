import { createStepResult, duration, nowMs } from './shared.js';

function countByStatus(steps) {
  return steps.reduce((acc, step) => {
    acc[step.status] = (acc[step.status] || 0) + 1;
    return acc;
  }, { ok: 0, warn: 0, fail: 0, not_applicable: 0 });
}

export async function runSummaryStep({ steps = [], dryRun = false, deps = {} } = {}) {
  const started = nowMs(deps);
  const summary = countByStatus(steps);

  return createStepResult({
    step_id: 'summary',
    status: 'ok',
    code: 'summary_ok',
    message: 'Setup summary generated.',
    remediation: [],
    details: {
      dryRun,
      ...summary,
      blockingCurrent: false,
      blockingProjected: false
    },
    duration_ms: duration(started, deps)
  });
}

export default { runSummaryStep };
