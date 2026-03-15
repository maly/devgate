import { describe, expect, it } from 'vitest';
import { getDomainStatus, setupDomainResolver, teardownDomainResolver } from '../../domain/index.js';

function createLinuxDeps({
  hasSystemd = true,
  hasResolvectl = true,
  resolvedActive = true,
  hasDomain = false
} = {}) {
  const state = {
    hasDomain,
    writeCount: 0,
    removeCount: 0
  };

  return {
    state,
    async fileExists() { return false; },
    async pathExists(path) { return path === '/run/systemd/system' ? hasSystemd : false; },
    async readFile() { return ''; },
    async readFileOrNull() { return null; },
    async writeFile() { state.writeCount += 1; },
    async removeFile() { state.removeCount += 1; },
    async mkdir() {},
    async commandExists(command) {
      if (command === 'resolvectl') return hasResolvectl;
      return false;
    },
    async commandResult(command) {
      if (command === 'systemctl is-active systemd-resolved') {
        return resolvedActive ? { ok: true, stdout: 'active\n', stderr: '' } : { ok: false, stdout: 'inactive\n', stderr: 'inactive' };
      }
      if (command === 'resolvectl domain') {
        return { ok: true, stdout: state.hasDomain ? 'Link 2 (lo): ~devgate\n' : 'Link 2 (lo):\n', stderr: '' };
      }
      if (command === 'resolvectl dns lo 127.0.0.1') {
        state.writeCount += 1;
        return { ok: true, stdout: '', stderr: '' };
      }
      if (command === 'resolvectl domain lo ~devgate') {
        state.writeCount += 1;
        state.hasDomain = true;
        return { ok: true, stdout: '', stderr: '' };
      }
      if (command === 'resolvectl revert lo') {
        state.removeCount += 1;
        state.hasDomain = false;
        return { ok: true, stdout: '', stderr: '' };
      }
      return { ok: false, stdout: '', stderr: 'unknown command' };
    }
  };
}

describe('domain providers', () => {
  it('returns unsupported with resolvectl_missing when linux lacks resolvectl', async () => {
    const status = await getDomainStatus({ platform: 'linux', deps: createLinuxDeps({ hasResolvectl: false }) });
    expect(status.status).toBe('unsupported');
    expect(status.code).toBe('resolvectl_missing');
  });

  it('routes darwin to macos provider', async () => {
    const deps = {
      async fileExists() { return true; },
      async readFile() { return 'nameserver 127.0.0.1\n'; }
    };
    const status = await getDomainStatus({ platform: 'darwin', deps });
    expect(status.provider).toBe('macos-resolver');
    expect(status.status).toBe('ready');
  });

  it('returns unsupported/resolved_not_running when systemd-resolved is inactive', async () => {
    const status = await getDomainStatus({ platform: 'linux', deps: createLinuxDeps({ resolvedActive: false }) });
    expect(status).toMatchObject({ status: 'unsupported', code: 'resolved_not_running', provider: 'linux-resolved' });
  });

  it('returns unsupported/provider_unsupported on non-systemd linux', async () => {
    const status = await getDomainStatus({ platform: 'linux', deps: createLinuxDeps({ hasSystemd: false }) });
    expect(status).toMatchObject({ status: 'unsupported', code: 'provider_unsupported', provider: 'linux-resolved' });
  });

  it('returns unsupported/provider_unsupported on win32 in domain manager', async () => {
    const status = await getDomainStatus({ platform: 'win32', deps: createLinuxDeps() });
    expect(status).toMatchObject({ status: 'unsupported', code: 'provider_unsupported' });
  });

  it('setup is idempotent when called twice', async () => {
    const deps = createLinuxDeps();
    await setupDomainResolver({ platform: 'linux', deps });
    const firstWrites = deps.state.writeCount;
    await setupDomainResolver({ platform: 'linux', deps });
    expect(deps.state.writeCount).toBe(firstWrites);
  });

  it('teardown is idempotent when called twice', async () => {
    const deps = createLinuxDeps({ hasDomain: true });
    await teardownDomainResolver({ platform: 'linux', deps });
    const firstRemovals = deps.state.removeCount;
    await teardownDomainResolver({ platform: 'linux', deps });
    expect(deps.state.removeCount).toBe(firstRemovals);
  });

  it('setup->teardown->setup recovers from partial state', async () => {
    const deps = createLinuxDeps();
    await setupDomainResolver({ platform: 'linux', deps });
    await teardownDomainResolver({ platform: 'linux', deps });
    const status = await setupDomainResolver({ platform: 'linux', deps });
    expect(status.status).toBe('ready');
  });
});
