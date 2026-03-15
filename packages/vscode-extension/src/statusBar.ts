import * as vscode from 'vscode';
import { COMMANDS } from './constants.js';
import { RunnerState } from './types.js';

interface StatusBarController {
  update(state: RunnerState, cliDisplay: string): void;
  dispose(): void;
}

export function createStatusBarController(): StatusBarController {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 20);
  item.command = COMMANDS.statusQuickActions;
  item.text = 'Devgate: Stopped';
  item.tooltip = 'Devgate is not running.';
  item.show();

  const iconFor = (status: RunnerState['status']) => {
    if (status === 'running') return '$(play-circle)';
    if (status === 'starting') return '$(sync~spin)';
    if (status === 'error') return '$(error)';
    return '$(circle-slash)';
  };

  const labelFor = (status: RunnerState['status']) => {
    if (status === 'running') return 'Running';
    if (status === 'starting') return 'Starting';
    if (status === 'error') return 'Error';
    return 'Stopped';
  };

  return {
    update(state, cliDisplay) {
      item.text = `${iconFor(state.status)} Devgate: ${labelFor(state.status)}`;
      item.tooltip = [
        `CLI: ${cliDisplay}`,
        `Status: ${labelFor(state.status)}`,
        state.lastCommand ? `Last: ${state.lastCommand}` : 'Last: n/a',
        state.lastError ? `Error: ${state.lastError}` : null
      ].filter(Boolean).join('\n');
    },
    dispose() {
      item.dispose();
    }
  };
}

export default { createStatusBarController };
