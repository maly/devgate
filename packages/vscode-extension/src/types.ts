export type CliKind = 'local' | 'global';

export interface CliCommand {
  kind: CliKind;
  cmd: string;
  baseArgs: string[];
  workspacePath: string | null;
  display: string;
}

export type RunnerStatus = 'stopped' | 'starting' | 'running' | 'error';

export interface RunnerState {
  status: RunnerStatus;
  lastCommand: string | null;
  lastExitCode: number | null;
  lastError: string | null;
}

export interface OutputLike {
  appendLine(line: string): void;
  show(preserveFocus?: boolean): void;
}

export interface CommandDefinition {
  id: string;
  title: string;
  args: string[];
  mode: 'oneshot' | 'start' | 'stop';
}
