export const SETUP_CODES = Object.freeze([
  'setup_ready',
  'setup_not_ready',
  'setup_projected_ready',
  'setup_projected_not_ready',
  'setup_internal_error',
  'preflight_ok',
  'preflight_permission_denied',
  'mkcert_available',
  'mkcert_install_succeeded',
  'mkcert_install_failed',
  'mkcert_trust_failed',
  'domain_ready',
  'domain_permission_denied',
  'domain_not_applicable',
  'verify_start_ready',
  'verify_start_not_ready',
  'summary_ok'
]);

export const SETUP_CODE_SET = new Set(SETUP_CODES);

export default { SETUP_CODES, SETUP_CODE_SET };
