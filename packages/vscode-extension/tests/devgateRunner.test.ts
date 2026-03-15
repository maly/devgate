import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { createRunner } from '../src/devgateRunner';

class FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  killed = false;

  constructor() {
    super();
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
  }

  kill(_signal?: string) {
    this.killed = true;
    this.emit('exit', 0, null);
    return true;
  }
}

describe('devgateRunner', () => {
  it('runs one-shot command and returns exit code', async () => {
    const outputLines: string[] = [];
    const spawnImpl = () => {
      const child = new FakeChild();
      process.nextTick(() => child.emit('exit', 0, null));
      return child as any;
    };

    const runner = createRunner({
      cli: { kind: 'global', cmd: 'devgate', baseArgs: [], workspacePath: null, display: 'global:devgate' },
      output: { appendLine: (line) => outputLines.push(line), show: () => undefined },
      spawnImpl: spawnImpl as any
    });

    const result = await runner.runOneShot(['doctor']);
    expect(result.exitCode).toBe(0);
    expect(result.ok).toBe(true);
  });

  it('tracks start process and stops it on stop()', async () => {
    const child = new FakeChild();
    const spawnImpl = () => {
      process.nextTick(() => child.emit('spawn'));
      return child as any;
    };

    const runner = createRunner({
      cli: { kind: 'global', cmd: 'devgate', baseArgs: [], workspacePath: null, display: 'global:devgate' },
      output: { appendLine: () => undefined, show: () => undefined },
      spawnImpl: spawnImpl as any
    });

    await runner.start(['start']);
    expect(runner.getState().status).toBe('starting');

    await new Promise((resolve) => setImmediate(resolve));
    expect(runner.getState().status).toBe('running');

    await runner.stop();
    expect(runner.getState().status).toBe('stopped');
    expect(child.killed).toBe(true);
  });
});
