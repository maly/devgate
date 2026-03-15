import fs from 'node:fs';
import { CliCommand } from './types.js';
import { localCliPath } from './constants.js';

interface ResolveCliOptions {
  workspacePath: string | null;
  existsSync?: (path: string) => boolean;
}

export function resolveCli(options: ResolveCliOptions): CliCommand {
  const exists = options.existsSync || fs.existsSync;
  const workspacePath = options.workspacePath;

  if (workspacePath) {
    const localPath = localCliPath(workspacePath);
    if (exists(localPath)) {
      return {
        kind: 'local',
        cmd: 'node',
        baseArgs: [localPath],
        workspacePath,
        display: `local:${localPath}`
      };
    }
  }

  return {
    kind: 'global',
    cmd: 'devgate',
    baseArgs: [],
    workspacePath,
    display: 'global:devgate'
  };
}

export default { resolveCli };
