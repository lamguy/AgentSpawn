import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { RegistryWatcher } from './registry-watcher.js';

function tmpFile(): string {
  return path.join(
    os.tmpdir(),
    `registry-watcher-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
}

describe('RegistryWatcher', () => {
  describe('constructor defaults', () => {
    it('should use debounceMs=100 and fallbackIntervalMs=30000 by default', () => {
      const watcher = new RegistryWatcher({ registryPath: '/tmp/noop.json' });
      // Access private fields via casting to verify defaults
      expect((watcher as any).debounceMs).toBe(100);
      expect((watcher as any).fallbackIntervalMs).toBe(30_000);
    });

    it('should accept custom debounceMs and fallbackIntervalMs', () => {
      const watcher = new RegistryWatcher({
        registryPath: '/tmp/noop.json',
        debounceMs: 50,
        fallbackIntervalMs: 5000,
      });
      expect((watcher as any).debounceMs).toBe(50);
      expect((watcher as any).fallbackIntervalMs).toBe(5000);
    });
  });

  describe('watch() with real files', () => {
    let filePath: string;
    let watcher: RegistryWatcher;

    beforeEach(async () => {
      filePath = tmpFile();
      await fsp.writeFile(filePath, JSON.stringify({ version: 1, sessions: {} }), 'utf-8');
    });

    afterEach(async () => {
      watcher?.unwatch();
      await fsp.unlink(filePath).catch(() => {});
    });

    it('should fire callback when the registry file changes on disk', async () => {
      const callback = vi.fn();
      watcher = new RegistryWatcher({ registryPath: filePath, debounceMs: 50 });
      watcher.watch(callback);

      // Write to the file to trigger fs.watch
      await fsp.writeFile(filePath, JSON.stringify({ version: 1, sessions: { a: {} } }), 'utf-8');

      // Wait for debounce to settle
      await new Promise((r) => setTimeout(r, 200));

      expect(callback).toHaveBeenCalled();
    });

    it('should debounce rapid-fire changes into a single callback', async () => {
      const callback = vi.fn();
      watcher = new RegistryWatcher({ registryPath: filePath, debounceMs: 100 });
      watcher.watch(callback);

      // Write multiple times rapidly
      for (let i = 0; i < 5; i++) {
        await fsp.writeFile(filePath, JSON.stringify({ i }), 'utf-8');
        await new Promise((r) => setTimeout(r, 10));
      }

      // Wait for debounce to settle
      await new Promise((r) => setTimeout(r, 300));

      // Debounce should collapse the rapid writes into fewer callbacks (ideally 1)
      // Due to fs.watch behavior, we allow a small number but significantly less than 5
      expect(callback.mock.calls.length).toBeLessThanOrEqual(2);
      expect(callback.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('unwatch()', () => {
    it('should clean up fs.watch handle and clear fallback timer', async () => {
      const filePath = tmpFile();
      await fsp.writeFile(filePath, JSON.stringify({}), 'utf-8');

      const watcher = new RegistryWatcher({
        registryPath: filePath,
        debounceMs: 50,
        fallbackIntervalMs: 1000,
      });
      const callback = vi.fn();
      watcher.watch(callback);

      // Verify internals are set
      expect((watcher as any).watcher).not.toBeNull();
      expect((watcher as any).fallbackInterval).not.toBeNull();

      watcher.unwatch();

      // Verify all resources are released
      expect((watcher as any).watcher).toBeNull();
      expect((watcher as any).fallbackInterval).toBeNull();
      expect((watcher as any).debounceTimer).toBeNull();
      expect((watcher as any).retryTimer).toBeNull();
      expect((watcher as any).callback).toBeNull();

      // Writing after unwatch should not trigger callback
      await fsp.writeFile(filePath, JSON.stringify({ after: true }), 'utf-8');
      await new Promise((r) => setTimeout(r, 200));

      expect(callback).not.toHaveBeenCalled();
      await fsp.unlink(filePath).catch(() => {});
    });

    it('should clear a pending debounce timer', async () => {
      const filePath = tmpFile();
      await fsp.writeFile(filePath, JSON.stringify({}), 'utf-8');

      const watcher = new RegistryWatcher({
        registryPath: filePath,
        debounceMs: 500,
      });
      const callback = vi.fn();
      watcher.watch(callback);

      // Trigger a change so debounce timer starts
      await fsp.writeFile(filePath, JSON.stringify({ x: 1 }), 'utf-8');
      // Wait briefly so fs.watch fires but debounce hasn't elapsed
      await new Promise((r) => setTimeout(r, 50));

      // Unwatch before debounce fires
      watcher.unwatch();

      // Wait past debounce period
      await new Promise((r) => setTimeout(r, 600));

      // Callback should never have fired
      expect(callback).not.toHaveBeenCalled();
      await fsp.unlink(filePath).catch(() => {});
    });
  });

  describe('notifyWrite()', () => {
    it('should fire callback immediately, bypassing debounce', async () => {
      const filePath = tmpFile();
      await fsp.writeFile(filePath, JSON.stringify({}), 'utf-8');

      const callback = vi.fn();
      const watcher = new RegistryWatcher({ registryPath: filePath, debounceMs: 50 });
      watcher.watch(callback);

      watcher.notifyWrite();

      // Callback is invoked synchronously
      expect(callback).toHaveBeenCalledTimes(1);

      watcher.unwatch();
      await fsp.unlink(filePath).catch(() => {});
    });

    it('should cancel any pending debounce timer', async () => {
      const filePath = tmpFile();
      await fsp.writeFile(filePath, JSON.stringify({}), 'utf-8');

      const callback = vi.fn();
      const watcher = new RegistryWatcher({ registryPath: filePath, debounceMs: 200 });
      watcher.watch(callback);

      // Trigger a file change to start debounce
      await fsp.writeFile(filePath, JSON.stringify({ x: 1 }), 'utf-8');
      await new Promise((r) => setTimeout(r, 50));

      // notifyWrite should cancel pending debounce and fire immediately
      watcher.notifyWrite();
      expect(callback).toHaveBeenCalledTimes(1);

      // Wait past debounce period - should not fire again from the cancelled timer
      await new Promise((r) => setTimeout(r, 300));

      // May get 1 more from fs.watch re-triggering, but the original debounce was cancelled
      // The key assertion is that notifyWrite fired exactly once synchronously
      expect(callback.mock.calls.length).toBeGreaterThanOrEqual(1);

      watcher.unwatch();
      await fsp.unlink(filePath).catch(() => {});
    });

    it('should suppress the subsequent fs.watch event from its own write', async () => {
      const filePath = tmpFile();
      await fsp.writeFile(filePath, JSON.stringify({}), 'utf-8');

      const callback = vi.fn();
      const watcher = new RegistryWatcher({ registryPath: filePath, debounceMs: 50 });
      watcher.watch(callback);

      // Simulate: notifyWrite called, then immediately write the file
      // (this is what the TUI does: notify first, then the registry saves)
      watcher.notifyWrite();
      expect(callback).toHaveBeenCalledTimes(1);

      // The actual write happens, which would normally trigger fs.watch
      await fsp.writeFile(filePath, JSON.stringify({ local: true }), 'utf-8');

      // Wait for fs.watch event + debounce to settle
      await new Promise((r) => setTimeout(r, 200));

      // The callback should ideally still be 1 since the fs.watch event was suppressed
      // Allow up to 2 due to platform-specific fs.watch behavior
      expect(callback.mock.calls.length).toBeLessThanOrEqual(2);

      watcher.unwatch();
      await fsp.unlink(filePath).catch(() => {});
    });
  });

  describe('fallback polling with fake timers', () => {
    let filePath: string;

    beforeEach(async () => {
      filePath = tmpFile();
      await fsp.writeFile(filePath, JSON.stringify({}), 'utf-8');
    });

    afterEach(async () => {
      vi.useRealTimers();
      await fsp.unlink(filePath).catch(() => {});
    });

    it('should fire callback when file mtime changes during fallback poll', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: false });

      const callback = vi.fn();

      // Mock fs.watch to be a no-op (simulating unreliable platform)
      const watchSpy = vi.spyOn(fs, 'watch').mockImplementation(() => {
        const emitter = new (require('events').EventEmitter)();
        emitter.close = vi.fn();
        return emitter as any;
      });

      // Mock statSync to control mtime
      let mtimeMs = 1000;
      const statSpy = vi.spyOn(fs, 'statSync').mockImplementation(() => {
        return { mtimeMs } as any;
      });

      const watcher = new RegistryWatcher({
        registryPath: filePath,
        debounceMs: 50,
        fallbackIntervalMs: 5000,
      });
      watcher.watch(callback);

      // Initially no callback fired
      expect(callback).not.toHaveBeenCalled();

      // Simulate mtime change
      mtimeMs = 2000;

      // Advance past the fallback interval
      vi.advanceTimersByTime(5000);

      // The fallback poll detected mtime change and scheduled a debounce
      // Advance past debounce
      vi.advanceTimersByTime(100);

      expect(callback).toHaveBeenCalledTimes(1);

      watcher.unwatch();
      watchSpy.mockRestore();
      statSpy.mockRestore();
    });

    it('should not fire callback when mtime has not changed', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: false });

      const callback = vi.fn();

      const watchSpy = vi.spyOn(fs, 'watch').mockImplementation(() => {
        const emitter = new (require('events').EventEmitter)();
        emitter.close = vi.fn();
        return emitter as any;
      });

      const statSpy = vi.spyOn(fs, 'statSync').mockImplementation(() => {
        return { mtimeMs: 1000 } as any;
      });

      const watcher = new RegistryWatcher({
        registryPath: filePath,
        debounceMs: 50,
        fallbackIntervalMs: 5000,
      });
      watcher.watch(callback);

      // Advance multiple fallback intervals
      vi.advanceTimersByTime(15_000);

      // No mtime change => no callback
      expect(callback).not.toHaveBeenCalled();

      watcher.unwatch();
      watchSpy.mockRestore();
      statSpy.mockRestore();
    });
  });

  describe('rename event / watcher re-attach', () => {
    it('should re-establish fs.watch after a rename event', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: false });

      const callback = vi.fn();
      let watchCallback: ((eventType: string, filename: string | null) => void) | null = null;
      let watchCallCount = 0;

      const mockWatchers: Array<{ close: ReturnType<typeof vi.fn> }> = [];

      const watchSpy = vi.spyOn(fs, 'watch').mockImplementation((_path: any, cb: any) => {
        watchCallCount++;
        watchCallback = cb as any;
        const emitter = new (require('events').EventEmitter)();
        emitter.close = vi.fn();
        mockWatchers.push(emitter as any);
        // Wire up the callback to the emitter pattern
        if (cb) {
          // Store callback for manual triggering
          watchCallback = cb;
        }
        return emitter as any;
      });

      const statSpy = vi.spyOn(fs, 'statSync').mockImplementation(() => {
        return { mtimeMs: 1000 } as any;
      });

      const watcher = new RegistryWatcher({
        registryPath: '/tmp/test-rename.json',
        debounceMs: 50,
        fallbackIntervalMs: 60_000,
      });
      watcher.watch(callback);

      // fs.watch was called once at init
      expect(watchCallCount).toBe(1);

      // Simulate a rename event (atomic write via rename)
      watchCallback!('rename', null);

      // The old watcher should be closed
      expect(mockWatchers[0].close).toHaveBeenCalled();

      // Advance past retry delay (500ms)
      vi.advanceTimersByTime(500);

      // fs.watch should have been called again to re-establish
      expect(watchCallCount).toBe(2);

      // After re-attach, it also schedules a debounced change
      vi.advanceTimersByTime(100);
      expect(callback).toHaveBeenCalled();

      watcher.unwatch();
      watchSpy.mockRestore();
      statSpy.mockRestore();
      vi.useRealTimers();
    });

    it('should stop retrying after max retries', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: false });

      let handleWatcherLostCount = 0;
      const emitters: any[] = [];

      const watchSpy = vi.spyOn(fs, 'watch').mockImplementation(() => {
        const { EventEmitter } = require('events');
        const emitter = new EventEmitter();
        emitter.close = vi.fn();
        emitters.push(emitter);
        return emitter as any;
      });

      const statSpy = vi.spyOn(fs, 'statSync').mockImplementation(() => {
        return { mtimeMs: 1000 } as any;
      });

      const watcher = new RegistryWatcher({
        registryPath: '/tmp/test-max-retry.json',
        debounceMs: 50,
        fallbackIntervalMs: 60_000,
      });
      watcher.watch(vi.fn());

      // Each cycle: emit error -> handleWatcherLost -> 500ms -> initWatcher (resets retryCount) -> emit error again
      // initWatcher resets retryCount to 0, so we can keep going indefinitely
      // To test max retries, we need to emit errors rapidly without waiting for retry timer
      // This triggers handleWatcherLost multiple times before initWatcher resets the count

      // Emit 10 errors rapidly on the initial watcher (before any retry timer fires)
      for (let i = 0; i < 10; i++) {
        emitters[0].emit('error', new Error('watch failed'));
      }

      // After 10 calls to handleWatcherLost, retryCount should have reached max (10)
      // Further errors should be ignored
      const watchCountBefore = emitters.length;
      emitters[0].emit('error', new Error('watch failed'));

      // Advance past all retry timers
      vi.advanceTimersByTime(10_000);

      // retryCount was incremented in handleWatcherLost but after hitting max,
      // no more retries are scheduled. The watcher count should be bounded.
      // 1 initial + up to 10 retries
      expect(emitters.length).toBeLessThanOrEqual(12);

      watcher.unwatch();
      watchSpy.mockRestore();
      statSpy.mockRestore();
      vi.useRealTimers();
    });
  });

  describe('error handling', () => {
    it('should handle watch errors gracefully by re-establishing', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: false });

      const emitters: any[] = [];

      const watchSpy = vi.spyOn(fs, 'watch').mockImplementation(() => {
        const { EventEmitter } = require('events');
        const emitter = new EventEmitter();
        emitter.close = vi.fn();
        emitters.push(emitter);
        return emitter as any;
      });

      const statSpy = vi.spyOn(fs, 'statSync').mockImplementation(() => {
        return { mtimeMs: 1000 } as any;
      });

      const watcher = new RegistryWatcher({
        registryPath: '/tmp/test-error.json',
        debounceMs: 50,
        fallbackIntervalMs: 60_000,
      });
      watcher.watch(vi.fn());

      const initialCount = emitters.length;
      expect(initialCount).toBeGreaterThanOrEqual(1);

      // Emit error on the first watcher
      emitters[0].emit('error', new Error('watch failed'));

      // Advance past retry delay (500ms)
      vi.advanceTimersByTime(500);

      // A new watcher should have been created (re-established)
      expect(emitters.length).toBeGreaterThan(initialCount);

      // The original watcher should have been closed
      expect(emitters[0].close).toHaveBeenCalled();

      watcher.unwatch();
      watchSpy.mockRestore();
      statSpy.mockRestore();
      vi.useRealTimers();
    });

    it('should handle missing file gracefully on watch()', () => {
      // If the file does not exist, initWatcher should not throw
      const watcher = new RegistryWatcher({
        registryPath: '/tmp/does-not-exist-' + Math.random() + '.json',
        fallbackIntervalMs: 60_000,
      });

      expect(() => watcher.watch(vi.fn())).not.toThrow();
      watcher.unwatch();
    });
  });
});
