import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config/index.js';

function nowTs(deps) {
  if (deps && typeof deps.timestamp === 'function') {
    return deps.timestamp();
  }
  return Date.now();
}

function getFs(deps = {}) {
  return {
    existsSync: deps.existsSync || fs.existsSync,
    readFile: deps.readFile || ((p) => fsp.readFile(p, 'utf8')),
    writeFile: deps.writeFile || ((p, c) => fsp.writeFile(p, c, 'utf8')),
    rename: deps.rename || fsp.rename,
    copyFile: deps.copyFile || fsp.copyFile,
    unlink: deps.unlink || fsp.unlink,
    open: deps.open || fsp.open
  };
}

export function resolveConfigPath(configPath = './devgate.json') {
  return path.resolve(configPath);
}

export async function loadConfigWithRecovery({
  configPath = './devgate.json',
  chooseCleanTemplate = false,
  confirmRecovery = false,
  deps = {}
} = {}) {
  const filePath = resolveConfigPath(configPath);
  const io = getFs(deps);
  const exists = io.existsSync(filePath);

  if (!exists) {
    return {
      ok: true,
      configPath: filePath,
      exists: false,
      config: { routes: [] },
      backupPath: null
    };
  }

  try {
    const loaded = await loadConfig(filePath);
    return {
      ok: true,
      configPath: filePath,
      exists: true,
      config: loaded,
      backupPath: null
    };
  } catch (err) {
    if (!chooseCleanTemplate) {
      return {
        ok: false,
        code: 'init_error',
        message: `Failed to parse existing config: ${err.message}`,
        configPath: filePath,
        backupPath: null
      };
    }
    if (!confirmRecovery) {
      return {
        ok: false,
        code: 'init_error',
        message: 'Recovery confirmation required before replacing invalid config.',
        configPath: filePath,
        backupPath: null
      };
    }

    const backupPath = `${filePath}.bak.${nowTs(deps)}`;
    await io.copyFile(filePath, backupPath);

    return {
      ok: true,
      configPath: filePath,
      exists: true,
      config: { routes: [] },
      recoveredFromParseFailure: true,
      backupPath
    };
  }
}

export async function atomicSaveConfig({ configPath = './devgate.json', content, deps = {} } = {}) {
  const filePath = resolveConfigPath(configPath);
  const io = getFs(deps);
  const tempPath = `${filePath}.tmp.${process.pid}.${nowTs(deps)}`;
  const originalExists = io.existsSync(filePath);
  const originalContent = originalExists ? await io.readFile(filePath) : null;

  try {
    await io.writeFile(tempPath, content);

    const handle = await io.open(tempPath, 'r+');
    try {
      await handle.sync();
    } catch (err) {
      const code = err?.code || '';
      if (code !== 'EPERM' && code !== 'EINVAL') {
        throw err;
      }
    } finally {
      await handle.close();
    }

    await io.rename(tempPath, filePath);

    return {
      ok: true,
      code: 'init_saved',
      path: filePath,
      originalUnchanged: true
    };
  } catch (err) {
    try {
      await io.unlink(tempPath);
    } catch {
      // best effort cleanup
    }

    let originalUnchanged = true;
    if (originalExists) {
      try {
        const current = await io.readFile(filePath);
        originalUnchanged = current === originalContent;
      } catch {
        originalUnchanged = false;
      }
    }

    return {
      ok: false,
      code: 'init_error',
      message: err?.message || String(err),
      path: filePath,
      originalUnchanged
    };
  }
}

export default { resolveConfigPath, loadConfigWithRecovery, atomicSaveConfig };
