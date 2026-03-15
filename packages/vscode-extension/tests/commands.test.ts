import { describe, expect, it } from 'vitest';
import { buildCommandMap } from '../src/commandMap';

describe('commandMap', () => {
  it('maps Start (Force) to start --force', () => {
    const map = buildCommandMap();
    expect(map['devgate.startForce'].args).toEqual(['start', '--force']);
    expect(map['devgate.startForce'].mode).toBe('start');
  });

  it('contains expected MVP commands', () => {
    const map = buildCommandMap();
    expect(Object.keys(map)).toEqual(expect.arrayContaining([
      'devgate.init',
      'devgate.setup',
      'devgate.start',
      'devgate.startForce',
      'devgate.stop',
      'devgate.doctor'
    ]));
  });
});
