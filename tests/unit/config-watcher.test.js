import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { createConfigWatcher } from '../../proxy/config-watcher.js';

vi.mock('node:fs', () => ({ watch: vi.fn() }));

describe('config-watcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces multiple change events into one callback', async () => {
    let callback;
    fs.watch.mockImplementation((_path, handler) => {
      callback = handler;
      return { close: vi.fn() };
    });

    const onChange = vi.fn().mockResolvedValue(undefined);
    const watcher = createConfigWatcher({ configPath: './devgate.json', debounceMs: 350, onChange });
    watcher.start();

    callback('change');
    callback('change');
    callback('change');

    await new Promise((resolve) => setTimeout(resolve, 420));
    expect(onChange).toHaveBeenCalledTimes(1);

    watcher.stop();
  });

  it('does not execute concurrent reloads while in-flight and reruns once', async () => {
    let callback;
    fs.watch.mockImplementation((_path, handler) => {
      callback = handler;
      return { close: vi.fn() };
    });

    let release;
    const lock = new Promise((resolve) => {
      release = resolve;
    });

    const onChange = vi.fn().mockImplementation(async () => lock);
    const watcher = createConfigWatcher({ configPath: './devgate.json', debounceMs: 250, onChange });
    watcher.start();

    callback('change');
    await new Promise((resolve) => setTimeout(resolve, 280));

    callback('change');
    await new Promise((resolve) => setTimeout(resolve, 280));

    expect(onChange).toHaveBeenCalledTimes(1);

    release();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onChange).toHaveBeenCalledTimes(2);

    watcher.stop();
  });

  it('stop closes watcher and clears pending timer', () => {
    vi.useFakeTimers();

    let callback;
    const close = vi.fn();
    fs.watch.mockImplementation((_path, handler) => {
      callback = handler;
      return { close };
    });

    const onChange = vi.fn().mockResolvedValue(undefined);
    const watcher = createConfigWatcher({ configPath: './devgate.json', debounceMs: 350, onChange });
    watcher.start();

    callback('change');
    watcher.stop();

    vi.advanceTimersByTime(500);
    expect(onChange).toHaveBeenCalledTimes(0);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('clamps debounce outside bounds (250..500)', () => {
    vi.useFakeTimers();

    let callback;
    fs.watch.mockImplementation((_path, handler) => {
      callback = handler;
      return { close: vi.fn() };
    });

    const onLow = vi.fn().mockResolvedValue(undefined);
    const low = createConfigWatcher({ configPath: './devgate.json', debounceMs: 5, onChange: onLow });
    low.start();

    callback('change');
    vi.advanceTimersByTime(249);
    expect(onLow).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(1);
    expect(onLow).toHaveBeenCalledTimes(1);
    low.stop();

    const onHigh = vi.fn().mockResolvedValue(undefined);
    const high = createConfigWatcher({ configPath: './devgate.json', debounceMs: 2000, onChange: onHigh });
    high.start();

    callback('change');
    vi.advanceTimersByTime(499);
    expect(onHigh).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(1);
    expect(onHigh).toHaveBeenCalledTimes(1);
    high.stop();
  });

  it('start is idempotent and does not leak watchers', () => {
    const close = vi.fn();
    fs.watch.mockReturnValue({ close });

    const watcher = createConfigWatcher({ configPath: './devgate.json', onChange: vi.fn() });
    watcher.start();
    watcher.start();
    watcher.stop();

    expect(fs.watch).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
