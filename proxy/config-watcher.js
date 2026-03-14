import { watch } from 'node:fs';

export function createConfigWatcher({ configPath, debounceMs = 350, onChange = async () => {} } = {}) {
  const effectiveDebounce = Math.min(500, Math.max(250, debounceMs));

  let started = false;
  let watcherHandle = null;
  let debounceTimer = null;
  let inFlight = false;
  let rerunQueued = false;
  let lastWatchError = null;

  const execute = async () => {
    if (inFlight) {
      rerunQueued = true;
      return;
    }

    inFlight = true;
    try {
      await onChange(configPath);
    } catch (error) {
      lastWatchError = error;
    } finally {
      inFlight = false;
      if (rerunQueued) {
        rerunQueued = false;
        void execute();
      }
    }
  };

  const schedule = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void execute();
    }, effectiveDebounce);
  };

  const start = () => {
    if (started || !configPath) {
      return;
    }

    started = true;
    watcherHandle = watch(configPath, (eventType) => {
      if (eventType !== 'change') {
        return;
      }
      schedule();
    });
  };

  const stop = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    if (watcherHandle) {
      watcherHandle.close();
      watcherHandle = null;
    }

    started = false;
  };

  return {
    start,
    stop,
    getLastWatchError: () => lastWatchError
  };
}

export default { createConfigWatcher };
