import { promises as fs } from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as macosProvider from './providers/macos-resolver.js';
import * as linuxProvider from './providers/linux-resolved.js';

const execAsync = promisify(exec);
const VALID_STATUSES = new Set(['ready', 'missing', 'unsupported', 'error']);

function getDefaultProvider(platform) {
  if (platform === 'darwin') return 'macos-resolver';
  if (platform === 'linux') return 'linux-resolved';
  if (platform === 'win32') return 'windows';
  return 'unknown';
}

function getDefaultDeps() {
  return {
    async fileExists(filePath) {
      try {
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    },
    async pathExists(filePath) {
      try {
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    },
    async readFile(filePath) {
      return fs.readFile(filePath, 'utf8');
    },
    async readFileOrNull(filePath) {
      try {
        return await fs.readFile(filePath, 'utf8');
      } catch (err) {
        if (err && err.code === 'ENOENT') {
          return null;
        }
        throw err;
      }
    },
    async writeFile(filePath, content) {
      await fs.writeFile(filePath, content, 'utf8');
    },
    async removeFile(filePath) {
      await fs.unlink(filePath);
    },
    async mkdir(dirPath) {
      await fs.mkdir(dirPath, { recursive: true });
    },
    async commandExists(command) {
      const result = await this.commandResult(`command -v ${command}`);
      return result.ok;
    },
    async commandResult(command) {
      try {
        const { stdout, stderr } = await execAsync(command);
        return { ok: true, stdout, stderr };
      } catch (err) {
        return {
          ok: false,
          stdout: err?.stdout || '',
          stderr: err?.stderr || err?.message || String(err)
        };
      }
    }
  };
}

function getProvider(platform) {
  if (platform === 'darwin') {
    return macosProvider;
  }
  if (platform === 'linux') {
    return linuxProvider;
  }
  return null;
}

export function normalizeDomainStatus(input = {}) {
  const platform = input.platform || 'unknown';
  const provider = input.provider || getDefaultProvider(platform);
  const status = VALID_STATUSES.has(input.status) ? input.status : 'error';

  const fallbackCode = status === 'error' ? 'provider_error' : status === 'unsupported' ? 'provider_unsupported' : status === 'missing' ? 'resolver_missing' : 'resolver_ready';
  const code = typeof input.code === 'string' && input.code.length > 0 ? input.code : fallbackCode;

  return {
    status,
    code,
    message: typeof input.message === 'string' ? input.message : '',
    remediation: typeof input.remediation === 'string' ? input.remediation : '',
    platform,
    provider,
    details: input.details && typeof input.details === 'object' ? input.details : {}
  };
}

export async function getDomainStatus({ platform = process.platform, deps } = {}) {
  const provider = getProvider(platform);
  if (!provider) {
    return normalizeDomainStatus({
      status: 'unsupported',
      code: 'provider_unsupported',
      message: `No domain provider for platform ${platform}`,
      remediation: 'Use sslip mode on this platform',
      platform
    });
  }

  const status = await provider.getStatus({ deps: deps || getDefaultDeps() });
  return normalizeDomainStatus({ ...status, platform });
}

export async function setupDomainResolver({ platform = process.platform, deps } = {}) {
  const provider = getProvider(platform);
  if (!provider) {
    return normalizeDomainStatus({
      status: 'unsupported',
      code: 'provider_unsupported',
      message: `No domain provider for platform ${platform}`,
      remediation: 'Setup is not supported on this platform',
      platform
    });
  }

  const result = await provider.setup({ deps: deps || getDefaultDeps() });
  return normalizeDomainStatus({ ...result, platform });
}

export async function teardownDomainResolver({ platform = process.platform, deps } = {}) {
  const provider = getProvider(platform);
  if (!provider) {
    return normalizeDomainStatus({
      status: 'unsupported',
      code: 'provider_unsupported',
      message: `No domain provider for platform ${platform}`,
      remediation: 'Teardown is not supported on this platform',
      platform
    });
  }

  const result = await provider.teardown({ deps: deps || getDefaultDeps() });
  return normalizeDomainStatus({ ...result, platform });
}

export default {
  normalizeDomainStatus,
  getDomainStatus,
  setupDomainResolver,
  teardownDomainResolver
};
