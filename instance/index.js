import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';

const LOCK_DIRNAME = '.devgate';
const LOCK_FILENAME = 'instance.lock.json';
const FORCE_TIMEOUT_MS = 4000;
const FORCE_POLL_MS = 100;

function getDeps(deps = {}) {
  return {
    fs: deps.fs || fsp,
    homedir: deps.homedir || os.homedir,
    kill: deps.kill || process.kill.bind(process),
    sleep: deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    pid: deps.pid || process.pid,
    cwd: deps.cwd || process.cwd,
    uuid: deps.uuid || randomUUID
  };
}

export function resolveInstanceLockPath(deps = {}) {
  const d = getDeps(deps);
  return path.join(d.homedir(), LOCK_DIRNAME, LOCK_FILENAME);
}

function isAlive(pid, deps = {}) {
  const d = getDeps(deps);
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    d.kill(pid, 0);
    return true;
  } catch (err) {
    if (err && err.code === 'ESRCH') {
      return false;
    }
    return true;
  }
}

async function readJson(filePath, deps = {}) {
  const d = getDeps(deps);
  const raw = await d.fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function safeUnlink(filePath, deps = {}) {
  const d = getDeps(deps);
  try {
    await d.fs.unlink(filePath);
  } catch {
    // best effort
  }
}

function buildRecord(metadata = {}, deps = {}) {
  const d = getDeps(deps);
  return {
    kind: 'devgate-instance-lock',
    version: 1,
    pid: d.pid,
    instanceId: d.uuid(),
    startedAt: new Date().toISOString(),
    workspace: path.resolve(d.cwd()),
    ...metadata
  };
}

async function tryAcquire({ lockPath, record, deps = {} }) {
  const d = getDeps(deps);
  await d.fs.mkdir(path.dirname(lockPath), { recursive: true });
  await d.fs.writeFile(lockPath, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}

async function readExistingLock(lockPath, deps = {}) {
  try {
    return await readJson(lockPath, deps);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return null;
    }
    return { parseError: true, rawError: err };
  }
}

export async function acquireInstanceLock({ metadata = {}, deps = {} } = {}) {
  const lockPath = resolveInstanceLockPath(deps);
  const record = buildRecord(metadata, deps);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await tryAcquire({ lockPath, record, deps });
      return { acquired: true, lockPath, record, existing: null };
    } catch (err) {
      if (!err || err.code !== 'EEXIST') {
        throw err;
      }
    }

    const existing = await readExistingLock(lockPath, deps);
    if (!existing) {
      continue;
    }

    if (existing.parseError) {
      await safeUnlink(lockPath, deps);
      continue;
    }

    if (!isAlive(existing.pid, deps)) {
      await safeUnlink(lockPath, deps);
      continue;
    }

    return { acquired: false, lockPath, record: null, existing };
  }

  return { acquired: false, lockPath, record: null, existing: null };
}

export async function releaseInstanceLock({ lockPath = null, record = null, deps = {} } = {}) {
  const resolved = lockPath || resolveInstanceLockPath(deps);
  const current = await readExistingLock(resolved, deps);
  if (!current || current.parseError || !record) {
    return false;
  }

  if (current.instanceId !== record.instanceId || current.pid !== record.pid) {
    return false;
  }

  await safeUnlink(resolved, deps);
  return true;
}

async function waitUntilDead(pid, timeoutMs, deps = {}) {
  const d = getDeps(deps);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid, deps)) {
      return true;
    }
    await d.sleep(FORCE_POLL_MS);
  }
  return !isAlive(pid, deps);
}

export async function forceStopInstance({ existing = null, timeoutMs = FORCE_TIMEOUT_MS, deps = {} } = {}) {
  const d = getDeps(deps);
  const pid = existing?.pid;

  if (!Number.isInteger(pid) || pid <= 0) {
    return { ok: false, code: 'instance_invalid_pid', message: 'Running instance metadata is missing valid pid.' };
  }

  if (!isAlive(pid, deps)) {
    return { ok: true, code: 'instance_already_stopped', message: 'Previous instance is no longer running.' };
  }

  try {
    d.kill(pid, 'SIGTERM');
  } catch (err) {
    return { ok: false, code: 'instance_stop_failed', message: err?.message || String(err) };
  }

  const graceful = await waitUntilDead(pid, Math.floor(timeoutMs / 2), deps);
  if (graceful) {
    return { ok: true, code: 'instance_stopped', message: 'Previous instance stopped.' };
  }

  try {
    d.kill(pid, 'SIGKILL');
  } catch {
    try {
      d.kill(pid);
    } catch (err) {
      return { ok: false, code: 'instance_force_kill_failed', message: err?.message || String(err) };
    }
  }

  const hard = await waitUntilDead(pid, Math.floor(timeoutMs / 2), deps);
  if (!hard) {
    return { ok: false, code: 'instance_force_timeout', message: `Could not stop previous instance pid ${pid}.` };
  }

  return { ok: true, code: 'instance_force_stopped', message: 'Previous instance force-stopped.' };
}

export default {
  resolveInstanceLockPath,
  acquireInstanceLock,
  releaseInstanceLock,
  forceStopInstance
};
