import path from 'node:path';

export const OUTPUT_CHANNEL_NAME = 'Devgate';

export const COMMANDS = Object.freeze({
  init: 'devgate.init',
  setup: 'devgate.setup',
  start: 'devgate.start',
  startForce: 'devgate.startForce',
  stop: 'devgate.stop',
  doctor: 'devgate.doctor',
  domainStatus: 'devgate.domainStatus',
  domainSetup: 'devgate.domainSetup',
  domainTeardown: 'devgate.domainTeardown',
  statusQuickActions: 'devgate.statusQuickActions'
});

export function localCliPath(workspacePath: string) {
  return path.join(workspacePath, 'cli', 'bin', 'devgate.js');
}
