import { runPreflightStep } from './steps/preflight.js';
import { runMkcertStep } from './steps/mkcert.js';
import { runDomainStep } from './steps/domain.js';
import { runVerifyStep } from './steps/verify.js';
import { runSummaryStep } from './steps/summary.js';

function getTopLevelCode({ dryRun, startReady, projectedStartReady }) {
  if (dryRun) {
    return projectedStartReady ? 'setup_projected_ready' : 'setup_projected_not_ready';
  }
  return startReady ? 'setup_ready' : 'setup_not_ready';
}

function toSummary(steps) {
  return steps.reduce((acc, step) => {
    acc[step.status] = (acc[step.status] || 0) + 1;
    return acc;
  }, { ok: 0, warn: 0, fail: 0, not_applicable: 0 });
}

export async function runSetup({ dryRun = false, verbose = false, json = false, deps = {} } = {}) {
  const steps = [];
  const logs = [];
  const platform = deps.platform || process.platform;

  try {
    const preflight = await runPreflightStep({ dryRun, deps });
    steps.push(preflight);
    if (verbose) logs.push(`[preflight] ${preflight.status} ${preflight.code}`);

    const mkcert = await runMkcertStep({ dryRun, deps });
    steps.push(mkcert);
    if (verbose) logs.push(`[mkcert] ${mkcert.status} ${mkcert.code}`);

    const domain = await runDomainStep({ platform, dryRun, deps });
    steps.push(domain);
    if (verbose) logs.push(`[domain] ${domain.status} ${domain.code}`);

    const verify = await runVerifyStep({ steps, dryRun, deps });
    steps.push(verify);
    if (verbose) logs.push(`[verify] ${verify.status} ${verify.code}`);

    const summaryStep = await runSummaryStep({ steps, dryRun, deps });
    steps.push(summaryStep);

    const startReady = Boolean(verify.details.start_ready);
    const projectedStartReady = Boolean(verify.details.projected_start_ready);
    const exitCode = dryRun
      ? (projectedStartReady ? 0 : 1)
      : (startReady ? 0 : 1);

    const result = {
      schema_version: '1',
      command: 'setup',
      start_ready: startReady,
      projected_start_ready: projectedStartReady,
      exit_code: exitCode,
      code: getTopLevelCode({ dryRun, startReady, projectedStartReady }),
      summary: toSummary(steps),
      steps
    };

    if (json && verbose) {
      result.details = { logs };
    }

    return result;
  } catch (err) {
    return {
      schema_version: '1',
      command: 'setup',
      start_ready: false,
      projected_start_ready: false,
      exit_code: 1,
      code: 'setup_internal_error',
      summary: toSummary(steps),
      steps,
      details: {
        error: err?.message || String(err),
        logs: verbose ? logs : undefined
      }
    };
  }
}

export default { runSetup };
