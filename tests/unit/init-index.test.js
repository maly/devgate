import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runInit } from '../../init/index.js';

function tmpConfigPath() {
  return path.join(os.tmpdir(), `devgate-init-index-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
}

function createUiScript({ promptRouteQueue = [], actionQueue = [], confirmQueue = [] } = {}) {
  return {
    _route: [...promptRouteQueue],
    _action: [...actionQueue],
    _confirm: [...confirmQueue],
    async promptRoute() {
      return this._route.shift() || { alias: '', protocol: 'http', host: 'localhost', port: 3000 };
    },
    async chooseAction() {
      return this._action.shift() || 'cancel';
    },
    async promptAlias() {
      return 'api';
    },
    async confirm() {
      return this._confirm.length > 0 ? this._confirm.shift() : true;
    },
    async close() {}
  };
}

describe('init index', () => {
  let configPath;

  beforeEach(async () => {
    configPath = tmpConfigPath();
    await fs.promises.writeFile(
      configPath,
      JSON.stringify({
        routes: [{ alias: 'api', target: { protocol: 'http', host: 'localhost', port: 3000 } }]
      }, null, 2),
      'utf8'
    );
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(configPath, { force: true });
    } catch {}
  });

  it('returns required init contract fields', async () => {
    const result = await runInit({
      configPath,
      dryRun: true,
      nonInteractive: true,
      editAlias: 'api',
      port: 3001
    });

    expect(result).toMatchObject({
      schema_version: '1',
      command: 'init',
      changed: expect.any(Boolean),
      added: expect.any(Number),
      updated: expect.any(Number),
      removed: expect.any(Number),
      savedPath: expect.any(String),
      dryRun: true,
      status: expect.any(String),
      code: expect.any(String),
      message: expect.any(String),
      details: expect.any(Object),
      exitCode: expect.any(Number)
    });
  });

  it('maps saved/cancelled/preview/error to stable codes', async () => {
    expect((await runInit({ mode: 'saved' })).code).toBe('init_saved');
    expect((await runInit({ mode: 'cancelled' })).code).toBe('init_cancelled');
    expect((await runInit({ mode: 'preview', dryRun: true })).code).toBe('init_preview');
    expect((await runInit({ mode: 'error' })).code).toBe('init_error');
    expect((await runInit({ mode: 'invalid_args' })).code).toBe('init_invalid_args');
  });

  it('returns exitCode 0 for successful preview dry-run and resolved savedPath', async () => {
    const result = await runInit({
      configPath,
      dryRun: true,
      nonInteractive: true,
      editAlias: 'api',
      port: 3001
    });

    expect(result.status).toBe('preview');
    expect(result.exitCode).toBe(0);
    expect(result.savedPath).toBe(path.resolve(configPath));
  });

  it('rejects non-interactive metadata edit flags with init_invalid_args', async () => {
    const result = await runInit({
      configPath,
      nonInteractive: true,
      editAlias: 'api',
      healthcheck: '/health'
    });

    expect(result.status).toBe('error');
    expect(result.code).toBe('init_invalid_args');
    expect(result.exitCode).toBe(1);
  });

  it('does not terminate interactive session on action-level validation error', async () => {
    const result = await runInit({
      configPath: tmpConfigPath(),
      deps: {
        ui: createUiScript({
          promptRouteQueue: [{ alias: '', protocol: 'http', host: 'localhost', port: 3000 }],
          actionQueue: ['cancel']
        })
      }
    });

    expect(['cancelled', 'saved']).toContain(result.status);
    expect(result.details.validationErrors).toBeGreaterThan(0);
  });
});
