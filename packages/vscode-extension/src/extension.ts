import * as vscode from 'vscode';
import { OUTPUT_CHANNEL_NAME } from './constants.js';
import { resolveCli } from './cliResolver.js';
import { createRunner } from './devgateRunner.js';
import { createStatusBarController } from './statusBar.js';
import { registerCommands } from './commands.js';

function getWorkspacePath() {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return null;
  }
  return folders[0].uri.fsPath;
}

export async function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  context.subscriptions.push(output);

  const cli = resolveCli({ workspacePath: getWorkspacePath() });
  output.appendLine(`[${new Date().toISOString()}] Devgate CLI resolved: ${cli.display}`);

  const status = createStatusBarController();
  context.subscriptions.push(status);

  const runner = createRunner({
    cli,
    output,
    onStateChange: (state) => status.update(state, cli.display)
  });

  status.update(runner.getState(), cli.display);

  registerCommands({
    registerCommand: (id, handler) => vscode.commands.registerCommand(id, handler),
    showQuickPick: (items, options) => vscode.window.showQuickPick(items, options),
    showError: (message) => { void vscode.window.showErrorMessage(message); },
    showInfo: (message) => { void vscode.window.showInformationMessage(message); },
    runOneShot: runner.runOneShot,
    start: runner.start,
    stop: runner.stop,
    output,
    subscriptions: context.subscriptions
  });

  context.subscriptions.push({
    dispose: () => {
      void runner.stop();
    }
  });
}

export async function deactivate() {
  return;
}
