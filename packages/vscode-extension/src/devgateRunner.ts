import { ChildProcess, spawn } from 'node:child_process';
import { CliCommand, OutputLike, RunnerState } from './types.js';

interface RunnerOptions {
  cli: CliCommand;
  output: OutputLike;
  spawnImpl?: typeof spawn;
  onStateChange?: (state: RunnerState) => void;
}

interface OneShotResult {
  ok: boolean;
  exitCode: number;
}

function nowIso() {
  return new Date().toISOString();
}

function mergeState(base: RunnerState, patch: Partial<RunnerState>): RunnerState {
  return { ...base, ...patch };
}

export function createRunner(options: RunnerOptions) {
  const spawnImpl = options.spawnImpl || spawn;
  const output = options.output;
  const onStateChange = options.onStateChange || (() => undefined);

  let activeStart: ChildProcess | null = null;
  let state: RunnerState = {
    status: 'stopped',
    lastCommand: null,
    lastExitCode: null,
    lastError: null
  };

  const setState = (patch: Partial<RunnerState>) => {
    state = mergeState(state, patch);
    onStateChange(state);
  };

  const buildArgs = (subcommandArgs: string[]) => [...options.cli.baseArgs, ...subcommandArgs];

  const renderCommand = (subcommandArgs: string[]) => `${options.cli.cmd} ${buildArgs(subcommandArgs).join(' ')}`;

  const logHeader = (subcommandArgs: string[]) => {
    output.appendLine('');
    output.appendLine(`[${nowIso()}] $ ${renderCommand(subcommandArgs)}`);
    output.show(true);
  };

  const attachOutput = (child: ChildProcess) => {
    child.stdout?.on('data', (buf) => {
      output.appendLine(String(buf).replace(/\s+$/, ''));
    });
    child.stderr?.on('data', (buf) => {
      output.appendLine(String(buf).replace(/\s+$/, ''));
    });
  };

  const runOneShot = (subcommandArgs: string[]): Promise<OneShotResult> => {
    logHeader(subcommandArgs);
    const args = buildArgs(subcommandArgs);
    setState({ lastCommand: subcommandArgs.join(' ') });

    return new Promise((resolve) => {
      const child = spawnImpl(options.cli.cmd, args, {
        cwd: options.cli.workspacePath || process.cwd(),
        shell: false
      });

      attachOutput(child);

      child.on('error', (err) => {
        setState({ status: 'error', lastError: err.message, lastExitCode: 1 });
        resolve({ ok: false, exitCode: 1 });
      });

      child.on('exit', (code) => {
        const exitCode = code ?? 1;
        if (exitCode !== 0) {
          setState({ lastExitCode: exitCode, lastError: `Exit ${exitCode}` });
          resolve({ ok: false, exitCode });
          return;
        }
        setState({ lastExitCode: 0, lastError: null });
        resolve({ ok: true, exitCode: 0 });
      });
    });
  };

  const start = async (subcommandArgs: string[]) => {
    if (activeStart) {
      throw new Error('Devgate is already running from extension.');
    }

    logHeader(subcommandArgs);
    const args = buildArgs(subcommandArgs);
    setState({ status: 'starting', lastCommand: subcommandArgs.join(' '), lastError: null });

    const child = spawnImpl(options.cli.cmd, args, {
      cwd: options.cli.workspacePath || process.cwd(),
      shell: false
    });
    activeStart = child;
    attachOutput(child);

    child.on('error', (err) => {
      setState({ status: 'error', lastError: err.message, lastExitCode: 1 });
      activeStart = null;
    });

    child.on('spawn', () => {
      setState({ status: 'running', lastError: null, lastExitCode: 0 });
    });

    child.on('exit', (code, signal) => {
      const exitCode = code ?? (signal ? 1 : 0);
      if (state.status !== 'stopped') {
        setState({
          status: exitCode === 0 ? 'stopped' : 'error',
          lastExitCode: exitCode,
          lastError: exitCode === 0 ? null : `Process exited (${exitCode}${signal ? `, ${signal}` : ''})`
        });
      }
      activeStart = null;
    });
  };

  const stop = async () => {
    if (!activeStart) {
      setState({ status: 'stopped' });
      return;
    }

    const child = activeStart;
    await new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      child.kill('SIGTERM');
      setState({ status: 'stopped' });
    });
    activeStart = null;
  };

  return {
    runOneShot,
    start,
    stop,
    getState: () => ({ ...state })
  };
}

export default { createRunner };
