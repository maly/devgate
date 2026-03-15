import { COMMANDS } from './constants.js';
import { CommandDefinition } from './types.js';

export function buildCommandMap(): Record<string, CommandDefinition> {
  return {
    [COMMANDS.init]: { id: COMMANDS.init, title: 'Devgate: Init', args: ['init'], mode: 'oneshot' },
    [COMMANDS.setup]: { id: COMMANDS.setup, title: 'Devgate: Setup', args: ['setup'], mode: 'oneshot' },
    [COMMANDS.start]: { id: COMMANDS.start, title: 'Devgate: Start', args: ['start'], mode: 'start' },
    [COMMANDS.startForce]: { id: COMMANDS.startForce, title: 'Devgate: Start (Force)', args: ['start', '--force'], mode: 'start' },
    [COMMANDS.stop]: { id: COMMANDS.stop, title: 'Devgate: Stop', args: [], mode: 'stop' },
    [COMMANDS.doctor]: { id: COMMANDS.doctor, title: 'Devgate: Doctor', args: ['doctor'], mode: 'oneshot' },
    [COMMANDS.domainStatus]: { id: COMMANDS.domainStatus, title: 'Devgate: Domain Status', args: ['domain', 'status'], mode: 'oneshot' },
    [COMMANDS.domainSetup]: { id: COMMANDS.domainSetup, title: 'Devgate: Domain Setup', args: ['domain', 'setup'], mode: 'oneshot' },
    [COMMANDS.domainTeardown]: { id: COMMANDS.domainTeardown, title: 'Devgate: Domain Teardown', args: ['domain', 'teardown'], mode: 'oneshot' }
  };
}

export default { buildCommandMap };
