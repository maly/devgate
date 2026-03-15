const ALIAS_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]*$/;

function fail(message) {
  return { ok: false, code: 'init_invalid_args', message };
}

export function validateRouteInput({ alias, protocol, host, port }) {
  const errors = [];

  if (typeof alias !== 'string' || alias.length === 0 || !ALIAS_RE.test(alias)) {
    errors.push('alias must be DNS-safe');
  }
  if (!['http', 'https'].includes(protocol)) {
    errors.push('protocol must be http or https');
  }
  if (typeof host !== 'string' || host.length === 0) {
    errors.push('host must be non-empty string');
  }
  const numericPort = Number(port);
  if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535) {
    errors.push('port must be integer in range 1..65535');
  }

  return { ok: errors.length === 0, errors };
}

export function validateNonInteractiveArgs(options = {}) {
  const hasAdd = typeof options.addAlias === 'string';
  const hasEdit = typeof options.editAlias === 'string';
  const hasRemove = typeof options.removeAlias === 'string';
  const actions = [hasAdd, hasEdit, hasRemove].filter(Boolean).length;

  if (actions !== 1) {
    return fail('Exactly one action is required: --add-alias XOR --edit-alias XOR --remove-alias');
  }

  const hasMetadata = options.healthcheck !== undefined || options.headers !== undefined || options.stripPrefix !== undefined;
  if (hasMetadata) {
    return fail('Non-interactive edit scope is limited to protocol|host|port in this phase');
  }

  if (hasAdd) {
    if (!options.protocol || !options.host || options.port === undefined) {
      return fail('add action requires --protocol, --host, --port');
    }
    return { ok: true };
  }

  if (hasEdit) {
    const hasEditableField = options.protocol !== undefined || options.host !== undefined || options.port !== undefined;
    if (!hasEditableField) {
      return fail('edit action requires at least one of --protocol, --host, --port');
    }
    return { ok: true };
  }

  const hasEditFields = options.protocol !== undefined || options.host !== undefined || options.port !== undefined || hasMetadata;
  if (hasEditFields) {
    return fail('remove action does not accept edit fields');
  }

  return { ok: true };
}

export default { validateRouteInput, validateNonInteractiveArgs };
