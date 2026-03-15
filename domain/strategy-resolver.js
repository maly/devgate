function isFallbackStatus(status) {
  return status === 'missing' || status === 'unsupported' || status === 'error';
}

export function resolveDomainStrategy({ platform, mode, status } = {}) {
  const normalizedMode = mode || 'auto';
  const normalizedStatus = status || { status: 'error', code: 'provider_error' };

  if (platform === 'win32') {
    return {
      strategy: 'sslip',
      fallback: false,
      warningCode: 'windows_forced_sslip'
    };
  }

  if (normalizedMode === 'sslip') {
    return {
      strategy: 'sslip',
      fallback: false,
      warningCode: null
    };
  }

  if (normalizedStatus.status === 'ready') {
    return {
      strategy: 'devgate',
      fallback: false,
      warningCode: null
    };
  }

  if (isFallbackStatus(normalizedStatus.status)) {
    return {
      strategy: 'sslip',
      fallback: true,
      warningCode: normalizedStatus.code || 'provider_error'
    };
  }

  return {
    strategy: 'sslip',
    fallback: true,
    warningCode: 'provider_error'
  };
}

export default { resolveDomainStrategy };
