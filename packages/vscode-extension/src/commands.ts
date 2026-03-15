import { COMMANDS } from './constants.js';
import { buildCommandMap } from './commandMap.js';
import { CommandDefinition } from './types.js';

interface RegisterCommandsOptions {
  registerCommand: (id: string, handler: () => Promise<void>) => { dispose(): void };
  showQuickPick: (items: Array<{ label: string; id: string }>, options: { title: string }) => Promise<{ label: string; id: string } | undefined>;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
  runOneShot: (args: string[]) => Promise<{ ok: boolean; exitCode: number }>;
  start: (args: string[]) => Promise<void>;
  stop: () => Promise<void>;
  output: { show(preserveFocus?: boolean): void };
  subscriptions: Array<{ dispose(): void }>;
}

export function registerCommands(options: RegisterCommandsOptions) {
  const commandMap = buildCommandMap();

  const executeDefinition = async (definition: CommandDefinition) => {
    try {
      if (definition.mode === 'oneshot') {
        const result = await options.runOneShot(definition.args);
        if (!result.ok) {
          options.showError(`${definition.title} failed (exit ${result.exitCode}).`);
        }
        return;
      }

      if (definition.mode === 'start') {
        await options.start(definition.args);
        options.showInfo(`${definition.title} started.`);
        return;
      }

      await options.stop();
      options.showInfo('Devgate stopped.');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      options.showError(message);
    }
  };

  for (const definition of Object.values(commandMap)) {
    const disposable = options.registerCommand(definition.id, async () => {
      await executeDefinition(definition);
    });
    options.subscriptions.push(disposable);
  }

  const quickActions = options.registerCommand(COMMANDS.statusQuickActions, async () => {
    const pick = await options.showQuickPick([
      { label: 'Start', id: COMMANDS.start },
      { label: 'Start (Force)', id: COMMANDS.startForce },
      { label: 'Stop', id: COMMANDS.stop },
      { label: 'Open Output', id: 'output' }
    ], { title: 'Devgate Actions' });

    if (!pick) return;
    if (pick.id === 'output') {
      options.output.show(false);
      return;
    }

    const def = commandMap[pick.id];
    if (def) {
      await executeDefinition(def);
    }
  });

  options.subscriptions.push(quickActions);
}

export default { registerCommands };
