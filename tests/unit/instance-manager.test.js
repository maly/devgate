import { describe, expect, it } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import {
  acquireInstanceLock,
  releaseInstanceLock,
  forceStopInstance,
  resolveInstanceLockPath
} from '../../instance/index.js';

function createTmpHome() {
  return path.join(os.tmpdir(), `devgate-instance-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

describe('instance manager', () => {
  it('acquires and releases lock for current process', async () => {
    const home = createTmpHome();
    const deps = {
      homedir: () => home,
      pid: 4242,
      cwd: () => home
    };

    const acquired = await acquireInstanceLock({ deps });
    expect(acquired.acquired).toBe(true);
    expect(fs.existsSync(resolveInstanceLockPath(deps))).toBe(true);

    const released = await releaseInstanceLock({
      lockPath: acquired.lockPath,
      record: acquired.record,
      deps
    });
    expect(released).toBe(true);
    expect(fs.existsSync(resolveInstanceLockPath(deps))).toBe(false);
  });

  it('returns acquired=false when another live pid holds lock', async () => {
    const home = createTmpHome();
    const lockPath = resolveInstanceLockPath({ homedir: () => home });
    await fs.promises.mkdir(path.dirname(lockPath), { recursive: true });
    await fs.promises.writeFile(lockPath, JSON.stringify({ pid: 999, instanceId: 'x', workspace: 'w' }), 'utf8');

    const fakeKill = () => undefined;
    const result = await acquireInstanceLock({
      deps: { homedir: () => home, kill: fakeKill, pid: 1000, cwd: () => home }
    });
    expect(result.acquired).toBe(false);
    expect(result.existing.pid).toBe(999);
  });

  it('forceStopInstance uses SIGTERM and resolves when process exits', async () => {
    const calls = [];
    const fakeKill = (pid, signal = 0) => {
      calls.push({ pid, signal });
      if (signal === 0 && calls.filter((c) => c.signal !== 0).length > 0) {
        const err = new Error('not found');
        err.code = 'ESRCH';
        throw err;
      }
    };

    const result = await forceStopInstance({
      existing: { pid: 321 },
      timeoutMs: 200,
      deps: { kill: fakeKill, sleep: async () => undefined }
    });

    expect(result.ok).toBe(true);
    expect(calls.some((c) => c.signal === 'SIGTERM')).toBe(true);
  });
});
