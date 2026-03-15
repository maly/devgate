import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { default: cli } = await import('../../cli/index.js');

function tmpConfigPath() {
  return path.join(os.tmpdir(), `devgate-init-cli-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
}

describe('init CLI integration', () => {
  let configPath;
  let logs = [];
  let errors = [];
  let logSpy;
  let errSpy;

  beforeEach(async () => {
    logs = [];
    errors = [];
    configPath = tmpConfigPath();
    await fs.promises.writeFile(configPath, JSON.stringify({ routes: [] }, null, 2), 'utf8');
    logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')));
    errSpy = vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args.join(' ')));
  });

  afterEach(async () => {
    if (logSpy) logSpy.mockRestore();
    if (errSpy) errSpy.mockRestore();
    try {
      await fs.promises.rm(configPath, { force: true });
    } catch {}
  });

  it('runs init --json --dry-run and returns deterministic contract', async () => {
    const result = await cli.run([
      'init',
      '--config',
      configPath,
      '--json',
      '--dry-run',
      '--non-interactive',
      '--add-alias',
      'api',
      '--protocol',
      'http',
      '--host',
      'localhost',
      '--port',
      '3000'
    ]);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(logs.join('\n'));
    expect(parsed.schema_version).toBe('1');
    expect(parsed.command).toBe('init');
    expect(parsed.status).toBe('preview');
    expect(parsed.code).toBe('init_preview');
    expect(parsed.dryRun).toBe(true);
    expect(typeof parsed.savedPath).toBe('string');
  });

  it('supports non-interactive add, edit and remove actions', async () => {
    expect((await cli.run([
      'init', '--config', configPath, '--non-interactive',
      '--add-alias', 'api', '--protocol', 'http', '--host', 'localhost', '--port', '3000'
    ])).exitCode).toBe(0);

    expect((await cli.run([
      'init', '--config', configPath, '--non-interactive',
      '--edit-alias', 'api', '--port', '3001'
    ])).exitCode).toBe(0);

    expect((await cli.run([
      'init', '--config', configPath, '--non-interactive',
      '--remove-alias', 'api'
    ])).exitCode).toBe(0);
  });

  it('returns exitCode 1 and init_invalid_args for invalid action combinations', async () => {
    const res = await cli.run([
      'init', '--config', configPath, '--json', '--non-interactive',
      '--add-alias', 'api', '--edit-alias', 'web'
    ]);
    expect(res.exitCode).toBe(1);
    const parsed = JSON.parse(logs.join('\n'));
    expect(parsed.code).toBe('init_invalid_args');
  });

  it('keeps stdout JSON-only when --json is used', async () => {
    await cli.run([
      'init',
      '--config',
      configPath,
      '--json',
      '--dry-run',
      '--non-interactive',
      '--add-alias',
      'api',
      '--protocol',
      'http',
      '--host',
      'localhost',
      '--port',
      '3000'
    ]);
    expect(() => JSON.parse(logs.join('\n'))).not.toThrow();
    expect(logs.join('\n')).not.toContain('Choose action');
  });
});
