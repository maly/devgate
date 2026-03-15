function createStatus(overrides = {}) {
  return {
    status: 'error',
    code: 'provider_error',
    message: '',
    remediation: '',
    platform: 'linux',
    provider: 'linux-resolved',
    details: {},
    ...overrides
  };
}

function commandOutputContains(stdout, value) {
  return String(stdout || '').toLowerCase().includes(String(value || '').toLowerCase());
}

async function getLinuxCapabilities(deps) {
  const hasSystemd = await deps.pathExists('/run/systemd/system');
  if (!hasSystemd) {
    return { supported: false, code: 'provider_unsupported', message: 'systemd is not available' };
  }

  const hasResolvectl = await deps.commandExists('resolvectl');
  if (!hasResolvectl) {
    return { supported: false, code: 'resolvectl_missing', message: 'resolvectl is not installed' };
  }

  const active = await deps.commandResult('systemctl is-active systemd-resolved');
  if (!active.ok || !commandOutputContains(active.stdout, 'active')) {
    return { supported: false, code: 'resolved_not_running', message: 'systemd-resolved is not active' };
  }

  return { supported: true };
}

export async function getStatus({ deps }) {
  try {
    const capabilities = await getLinuxCapabilities(deps);
    if (!capabilities.supported) {
      return createStatus({
        status: 'unsupported',
        code: capabilities.code,
        message: capabilities.message,
        remediation: 'Run: sudo devgate domain setup'
      });
    }

    const domainResult = await deps.commandResult('resolvectl domain');
    if (!domainResult.ok) {
      return createStatus({
        status: 'error',
        code: 'provider_error',
        message: domainResult.stderr || 'Unable to query resolvectl domains',
        remediation: 'Run: sudo devgate domain setup'
      });
    }

    const hasDomain = /(^|\s)~?devgate(\s|$)/i.test(domainResult.stdout || '');
    if (!hasDomain) {
      return createStatus({
        status: 'missing',
        code: 'resolver_missing',
        message: '.devgate domain is not configured in resolved',
        remediation: 'Run: sudo devgate domain setup'
      });
    }

    return createStatus({
      status: 'ready',
      code: 'resolver_ready',
      message: 'systemd-resolved is configured for .devgate'
    });
  } catch (err) {
    return createStatus({
      status: 'error',
      code: 'provider_error',
      message: err?.message || 'Failed to query resolved state',
      remediation: 'Run: sudo devgate domain setup',
      details: { error: err?.message || String(err) }
    });
  }
}

export async function setup({ deps }) {
  const current = await getStatus({ deps });
  if (current.status === 'ready') {
    return current;
  }
  if (current.status === 'unsupported') {
    return current;
  }

  const setDns = await deps.commandResult('resolvectl dns lo 127.0.0.1');
  if (!setDns.ok) {
    return createStatus({
      status: 'error',
      code: 'permission_denied',
      message: setDns.stderr || 'Unable to set DNS for loopback',
      remediation: 'Run: sudo devgate domain setup'
    });
  }

  const setDomain = await deps.commandResult('resolvectl domain lo ~devgate');
  if (!setDomain.ok) {
    return createStatus({
      status: 'error',
      code: 'permission_denied',
      message: setDomain.stderr || 'Unable to set .devgate domain on loopback',
      remediation: 'Run: sudo devgate domain setup'
    });
  }

  return getStatus({ deps });
}

export async function teardown({ deps }) {
  const current = await getStatus({ deps });
  if (current.status === 'missing') {
    return current;
  }
  if (current.status === 'unsupported') {
    return current;
  }

  const revert = await deps.commandResult('resolvectl revert lo');
  if (!revert.ok) {
    return createStatus({
      status: 'error',
      code: 'permission_denied',
      message: revert.stderr || 'Unable to revert resolver settings',
      remediation: 'Run: sudo devgate domain teardown'
    });
  }

  return createStatus({
    status: 'missing',
    code: 'resolver_missing',
    message: 'resolved domain mapping reverted'
  });
}

export default { getStatus, setup, teardown };
