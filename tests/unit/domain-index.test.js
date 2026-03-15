import { describe, expect, it } from 'vitest';
import { normalizeDomainStatus } from '../../domain/index.js';

describe('normalizeDomainStatus', () => {
  it('normalizes partial input to strict shape', () => {
    const status = normalizeDomainStatus({ status: 'missing', code: 'resolver_missing' });
    expect(status).toEqual({
      status: 'missing',
      code: 'resolver_missing',
      message: '',
      remediation: '',
      platform: 'unknown',
      provider: 'unknown',
      details: {}
    });
  });

  it('maps unknown status to error/provider_error', () => {
    const status = normalizeDomainStatus({ status: 'weird' });
    expect(status.status).toBe('error');
    expect(status.code).toBe('provider_error');
  });
});
