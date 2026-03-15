export const INIT_CODES = Object.freeze([
  'init_saved',
  'init_cancelled',
  'init_preview',
  'init_error',
  'init_invalid_args'
]);

export const INIT_CODE_SET = new Set(INIT_CODES);

export default { INIT_CODES, INIT_CODE_SET };
