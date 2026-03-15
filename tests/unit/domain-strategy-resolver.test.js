import { describe, expect, it } from 'vitest';
import { resolveDomainStrategy } from '../../domain/strategy-resolver.js';

describe('resolveDomainStrategy', () => {
  it.each([
    { platform: 'win32', mode: 'auto', status: { status: 'ready', code: 'resolver_ready' }, expected: { strategy: 'sslip', fallback: false, warningCode: 'windows_forced_sslip' } },
    { platform: 'linux', mode: 'sslip', status: { status: 'ready', code: 'resolver_ready' }, expected: { strategy: 'sslip', fallback: false, warningCode: null } },
    { platform: 'linux', mode: 'devgate', status: { status: 'ready', code: 'resolver_ready' }, expected: { strategy: 'devgate', fallback: false, warningCode: null } },
    { platform: 'linux', mode: 'devgate', status: { status: 'missing', code: 'resolver_missing' }, expected: { strategy: 'sslip', fallback: true, warningCode: 'resolver_missing' } },
    { platform: 'darwin', mode: 'auto', status: { status: 'ready', code: 'resolver_ready' }, expected: { strategy: 'devgate', fallback: false, warningCode: null } },
    { platform: 'darwin', mode: 'auto', status: { status: 'unsupported', code: 'provider_unsupported' }, expected: { strategy: 'sslip', fallback: true, warningCode: 'provider_unsupported' } },
    { platform: 'darwin', mode: 'auto', status: { status: 'error', code: 'provider_error' }, expected: { strategy: 'sslip', fallback: true, warningCode: 'provider_error' } }
  ])('resolves matrix %#', ({ platform, mode, status, expected }) => {
    const result = resolveDomainStrategy({ platform, mode, status });
    expect(result).toEqual(expected);
  });
});
