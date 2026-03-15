import { describe, expect, it } from 'vitest';
import { validateRouteInput, validateNonInteractiveArgs } from '../../init/validate.js';

describe('init validate', () => {
  it('validates alias, protocol, host, port', () => {
    expect(validateRouteInput({ alias: 'api', protocol: 'http', host: 'localhost', port: 3000 }).ok).toBe(true);
    expect(validateRouteInput({ alias: '', protocol: 'http', host: 'localhost', port: 3000 }).ok).toBe(false);
    expect(validateRouteInput({ alias: 'api', protocol: 'tcp', host: 'localhost', port: 3000 }).ok).toBe(false);
    expect(validateRouteInput({ alias: 'api', protocol: 'http', host: '', port: 3000 }).ok).toBe(false);
    expect(validateRouteInput({ alias: 'api', protocol: 'http', host: 'localhost', port: 70000 }).ok).toBe(false);
  });

  it('rejects invalid action combinations', () => {
    const res = validateNonInteractiveArgs({ addAlias: 'api', editAlias: 'web' });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('init_invalid_args');
  });

  it('enforces add/edit/remove field requirements and rejects metadata flags', () => {
    expect(validateNonInteractiveArgs({ addAlias: 'api' }).ok).toBe(false);
    expect(validateNonInteractiveArgs({ editAlias: 'api' }).ok).toBe(false);
    expect(validateNonInteractiveArgs({ removeAlias: 'api', port: 3000 }).ok).toBe(false);
    const meta = validateNonInteractiveArgs({ editAlias: 'api', healthcheck: '/health' });
    expect(meta.ok).toBe(false);
    expect(meta.code).toBe('init_invalid_args');
  });
});
