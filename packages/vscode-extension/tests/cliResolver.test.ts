import { describe, expect, it } from 'vitest';
import { resolveCli } from '../src/cliResolver';

describe('resolveCli', () => {
  it('uses workspace local cli when available', () => {
    const cli = resolveCli({
      workspacePath: '/repo',
      existsSync: (p) => p.includes('cli') && p.includes('devgate.js')
    });

    expect(cli.kind).toBe('local');
    expect(cli.cmd).toBe('node');
    expect(cli.baseArgs[0]).toContain('cli');
  });

  it('falls back to global devgate when local cli is absent', () => {
    const cli = resolveCli({ workspacePath: '/repo', existsSync: () => false });
    expect(cli.kind).toBe('global');
    expect(cli.cmd).toBe('devgate');
    expect(cli.baseArgs).toEqual([]);
  });
});
