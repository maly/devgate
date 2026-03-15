import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { atomicSaveConfig, loadConfigWithRecovery } from '../../init/io.js';

function tmpPath(name) {
  return path.join(os.tmpdir(), `devgate-init-io-${Date.now()}-${Math.random().toString(16).slice(2)}-${name}`);
}

async function safeRm(filePath) {
  try {
    await fs.promises.rm(filePath, { force: true });
  } catch {}
}

describe('init io', () => {
  const cleanupPaths = new Set();

  afterEach(async () => {
    for (const p of cleanupPaths) {
      await safeRm(p);
    }
    cleanupPaths.clear();
  });

  it('creates backup before overwrite after parse failure recovery', async () => {
    const configPath = tmpPath('devgate.json');
    cleanupPaths.add(configPath);
    await fs.promises.writeFile(configPath, '{ invalid json', 'utf8');

    const result = await loadConfigWithRecovery({
      configPath,
      chooseCleanTemplate: true,
      confirmRecovery: true
    });

    expect(result.ok).toBe(true);
    expect(result.backupPath).toMatch(/\.bak\./);
    cleanupPaths.add(result.backupPath);
    expect(fs.existsSync(result.backupPath)).toBe(true);
  });

  it('requires explicit confirmation before clean-template recovery and backup', async () => {
    const configPath = tmpPath('devgate.json');
    cleanupPaths.add(configPath);
    await fs.promises.writeFile(configPath, '{ invalid json', 'utf8');

    const result = await loadConfigWithRecovery({
      configPath,
      chooseCleanTemplate: true,
      confirmRecovery: false
    });

    expect(result.ok).toBe(false);
    expect(result.backupPath).toBeNull();
  });

  it('preserves original file when rename fails', async () => {
    const configPath = tmpPath('devgate.json');
    cleanupPaths.add(configPath);
    const original = JSON.stringify({ routes: [{ alias: 'api', target: { protocol: 'http', host: 'localhost', port: 3000 } }] }, null, 2);
    await fs.promises.writeFile(configPath, `${original}\n`, 'utf8');

    const result = await atomicSaveConfig({
      configPath,
      content: '{\n  "routes": []\n}\n',
      deps: {
        rename: async () => {
          throw new Error('rename blocked');
        }
      }
    });

    const current = await fs.promises.readFile(configPath, 'utf8');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('init_error');
    expect(result.originalUnchanged).toBe(true);
    expect(current).toBe(`${original}\n`);
  });
});
