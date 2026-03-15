import { SETUP_CODE_SET } from '../codes.js';

const VALID_STATUS = new Set(['ok', 'warn', 'fail', 'not_applicable']);

export function createStepResult({
  step_id,
  status = 'ok',
  code,
  message = '',
  remediation = [],
  details = {},
  duration_ms = 0
}) {
  if (!VALID_STATUS.has(status)) {
    throw new Error(`Invalid setup step status: ${status}`);
  }
  if (!SETUP_CODE_SET.has(code)) {
    throw new Error(`Unknown setup code: ${code}`);
  }
  if (!Number.isInteger(duration_ms) || duration_ms < 0) {
    throw new Error('duration_ms must be a non-negative integer');
  }
  if (!Array.isArray(remediation)) {
    throw new Error('remediation must be an array');
  }
  if (status === 'fail' && !remediation.some((item) => item && item.optional === false)) {
    throw new Error('fail step requires at least one non-optional remediation');
  }

  return {
    schema_version: '1',
    step_id,
    status,
    code,
    message,
    remediation,
    details,
    duration_ms
  };
}

export function nowMs(deps) {
  if (deps && typeof deps.nowMs === 'function') {
    return deps.nowMs();
  }
  return Date.now();
}

export function duration(start, deps) {
  const value = nowMs(deps) - start;
  return Number.isInteger(value) && value >= 0 ? value : 0;
}
