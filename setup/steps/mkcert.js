import { CertManager } from '../../cert/index.js';
import { createStepResult, duration, nowMs } from './shared.js';

function baseDetails(dryRun) {
  return {
    dryRun,
    blockingCurrent: false,
    blockingProjected: false
  };
}

export async function runMkcertStep({ dryRun = false, deps = {} } = {}) {
  const started = nowMs(deps);
  const details = baseDetails(dryRun);
  const certManager = deps.certManager || new CertManager();

  if (deps.forceMkcertTimeoutWarn) {
    return createStepResult({
      step_id: 'mkcert',
      status: 'warn',
      code: 'mkcert_install_failed',
      message: 'mkcert installer timed out, fallback remains available.',
      remediation: [{ command: 'devgate install-mkcert', reason: 'install mkcert manually', optional: true }],
      details,
      duration_ms: duration(started, deps)
    });
  }

  if (deps.forceMkcertTimeoutFail) {
    details.blockingCurrent = true;
    details.blockingProjected = true;
    return createStepResult({
      step_id: 'mkcert',
      status: 'fail',
      code: 'mkcert_install_failed',
      message: 'mkcert installer timed out and readiness is blocked.',
      remediation: [{ command: 'devgate install-mkcert', reason: 'install mkcert manually', optional: false }],
      details,
      duration_ms: duration(started, deps)
    });
  }

  const available = await certManager.checkMkcert();
  if (available) {
    return createStepResult({
      step_id: 'mkcert',
      status: 'ok',
      code: 'mkcert_available',
      message: 'mkcert is available.',
      remediation: [],
      details,
      duration_ms: duration(started, deps)
    });
  }

  if (dryRun) {
    return createStepResult({
      step_id: 'mkcert',
      status: 'warn',
      code: 'mkcert_install_succeeded',
      message: 'mkcert missing, would attempt auto-install in non-dry-run mode.',
      remediation: [{ command: 'devgate setup', reason: 'execute planned setup actions', optional: false }],
      details,
      duration_ms: duration(started, deps)
    });
  }

  const installResult = await certManager.installMkcert();
  if (!installResult.success) {
    return createStepResult({
      step_id: 'mkcert',
      status: 'warn',
      code: 'mkcert_install_failed',
      message: installResult.message || 'mkcert installation failed.',
      remediation: [{ command: 'devgate install-mkcert', reason: 'install mkcert manually', optional: true }],
      details,
      duration_ms: duration(started, deps)
    });
  }

  return createStepResult({
    step_id: 'mkcert',
    status: 'ok',
    code: 'mkcert_install_succeeded',
    message: installResult.message || 'mkcert installed successfully.',
    remediation: [],
    details,
    duration_ms: duration(started, deps)
  });
}

export default { runMkcertStep };
