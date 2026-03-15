const RESOLVER_DIR = '/etc/resolver';
const RESOLVER_FILE = `${RESOLVER_DIR}/devgate`;
const RESOLVER_CONTENT = 'nameserver 127.0.0.1\n';

function createStatus(overrides = {}) {
  return {
    status: 'error',
    code: 'provider_error',
    message: '',
    remediation: '',
    platform: 'darwin',
    provider: 'macos-resolver',
    details: {},
    ...overrides
  };
}

function isPermissionError(err) {
  return err && (err.code === 'EACCES' || err.code === 'EPERM');
}

export async function getStatus({ deps }) {
  try {
    const exists = await deps.fileExists(RESOLVER_FILE);
    if (!exists) {
      return createStatus({
        status: 'missing',
        code: 'resolver_missing',
        message: `Resolver file is missing: ${RESOLVER_FILE}`,
        remediation: 'Run: sudo devgate domain setup'
      });
    }

    const content = await deps.readFile(RESOLVER_FILE);
    if (!content.includes('nameserver 127.0.0.1')) {
      return createStatus({
        status: 'missing',
        code: 'resolver_missing',
        message: `Resolver file is incomplete: ${RESOLVER_FILE}`,
        remediation: 'Run: sudo devgate domain setup'
      });
    }

    return createStatus({
      status: 'ready',
      code: 'resolver_ready',
      message: 'macOS resolver is configured for .devgate'
    });
  } catch (err) {
    return createStatus({
      status: 'error',
      code: isPermissionError(err) ? 'permission_denied' : 'provider_error',
      message: err?.message || 'Failed to read resolver state',
      remediation: isPermissionError(err) ? 'Run with sudo privileges' : 'Check resolver file permissions',
      details: { error: err?.message || String(err) }
    });
  }
}

export async function setup({ deps }) {
  try {
    const current = await getStatus({ deps });
    if (current.status === 'ready') {
      return current;
    }

    await deps.mkdir(RESOLVER_DIR);
    const existingContent = await deps.readFileOrNull(RESOLVER_FILE);
    if (existingContent !== RESOLVER_CONTENT) {
      await deps.writeFile(RESOLVER_FILE, RESOLVER_CONTENT);
    }

    return getStatus({ deps });
  } catch (err) {
    return createStatus({
      status: 'error',
      code: isPermissionError(err) ? 'permission_denied' : 'provider_error',
      message: err?.message || 'Failed to configure resolver',
      remediation: 'Run: sudo devgate domain setup',
      details: { error: err?.message || String(err) }
    });
  }
}

export async function teardown({ deps }) {
  try {
    const exists = await deps.fileExists(RESOLVER_FILE);
    if (!exists) {
      return createStatus({
        status: 'missing',
        code: 'resolver_missing',
        message: 'Resolver file already absent'
      });
    }

    await deps.removeFile(RESOLVER_FILE);

    return createStatus({
      status: 'missing',
      code: 'resolver_missing',
      message: 'Resolver removed'
    });
  } catch (err) {
    return createStatus({
      status: 'error',
      code: isPermissionError(err) ? 'permission_denied' : 'provider_error',
      message: err?.message || 'Failed to remove resolver',
      remediation: 'Run: sudo devgate domain teardown',
      details: { error: err?.message || String(err) }
    });
  }
}

export default { getStatus, setup, teardown };
