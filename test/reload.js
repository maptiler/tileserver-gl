import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { server } from '../src/server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Returns listeners added after a previous snapshot.
 * @param {string} eventName Process event name.
 * @param {Array<(...args: unknown[]) => void>} previousListeners Previously registered listeners.
 * @returns {Array<(...args: unknown[]) => void>} Newly registered listeners.
 */
function getAddedListeners(eventName, previousListeners) {
  return process
    .listeners(eventName)
    .filter((listener) => !previousListeners.includes(listener));
}

/**
 * Waits until a condition becomes true.
 * @param {() => boolean} condition Predicate to check.
 * @param {number} [timeoutMs] Maximum wait time.
 * @returns {Promise<void>}
 */
async function waitFor(condition, timeoutMs = 5000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (condition()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error('Timed out waiting for condition');
}

describe('SIGHUP reload', function () {
  it('runs runtime cleanup before replacing the server generation', async function () {
    const previousListeners = [
      { eventName: 'SIGHUP', listeners: process.listeners('SIGHUP') },
      { eventName: 'SIGINT', listeners: process.listeners('SIGINT') },
      { eventName: 'SIGTERM', listeners: process.listeners('SIGTERM') },
    ];
    let running;

    try {
      running = await server({
        configPath: path.join(__dirname, 'fixtures/reload-config.json'),
        port: 0,
        publicUrl: '/test/',
      });
      await running.startupPromise;

      const reloadListeners = getAddedListeners(
        'SIGHUP',
        previousListeners[0].listeners,
      );
      expect(reloadListeners).to.have.lengthOf(1);

      let cleanupCalls = 0;
      const cleanup = running.cleanup;
      running.cleanup = async () => {
        cleanupCalls += 1;
        await cleanup();
      };

      const startupPromise = running.startupPromise;
      reloadListeners[0]('SIGHUP');

      await waitFor(() => running.startupPromise !== startupPromise);
      await running.startupPromise;

      expect(cleanupCalls).to.equal(1);
    } finally {
      if (running) {
        await running.cleanup();
        if (running.server.listening) {
          await new Promise((resolve) => running.server.close(resolve));
        }
      }

      for (const { eventName, listeners } of previousListeners) {
        for (const listener of getAddedListeners(eventName, listeners)) {
          process.removeListener(eventName, listener);
        }
      }
    }
  });
});
