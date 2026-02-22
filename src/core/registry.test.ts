import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Registry } from './registry.js';
import { RegistryData, RegistryEntry, SessionState } from '../types.js';
import { RegistryCorruptError, RegistryLockError } from '../utils/errors.js';
import { lock } from 'proper-lockfile';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

function tmpFile(): string {
  return path.join(
    os.tmpdir(),
    `registry-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
}

function makeEntry(name: string): RegistryEntry {
  return {
    name,
    pid: 1234,
    state: SessionState.Running,
    startedAt: new Date().toISOString(),
    workingDirectory: '/tmp/work',
  };
}

describe('Registry', () => {
  let filePath: string;
  let registry: Registry;

  beforeEach(() => {
    filePath = tmpFile();
    registry = new Registry(filePath);
  });

  it('can be instantiated with a file path', () => {
    expect(registry).toBeInstanceOf(Registry);
  });

  it('load() returns default data when file does not exist', async () => {
    const data = await registry.load();
    expect(data).toEqual({ version: 1, sessions: {} });
  });

  it('save() and load() round-trip', async () => {
    const data: RegistryData = {
      version: 1,
      sessions: {
        'sess-1': makeEntry('sess-1'),
      },
    };

    await registry.save(data);
    const loaded = await registry.load();
    expect(loaded).toEqual(data);

    // cleanup
    await fs.unlink(filePath).catch(() => {});
  });

  it('addEntry() persists an entry', async () => {
    const entry = makeEntry('new-entry');
    await registry.addEntry(entry);

    const data = await registry.load();
    expect(data.sessions['new-entry']).toEqual(entry);

    // cleanup
    await fs.unlink(filePath).catch(() => {});
  });

  it('removeEntry() removes an entry', async () => {
    const entry = makeEntry('to-remove');
    await registry.addEntry(entry);

    let data = await registry.load();
    expect(data.sessions['to-remove']).toBeDefined();

    await registry.removeEntry('to-remove');

    data = await registry.load();
    expect(data.sessions['to-remove']).toBeUndefined();

    // cleanup
    await fs.unlink(filePath).catch(() => {});
  });

  it('load() throws RegistryCorruptError on invalid JSON', async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, 'not valid json {{{', 'utf-8');

    await expect(registry.load()).rejects.toThrow(RegistryCorruptError);

    await fs.unlink(filePath).catch(() => {});
  });

  it('load() throws RegistryCorruptError on valid JSON with invalid structure', async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify({ foo: 'bar' }), 'utf-8');

    await expect(registry.load()).rejects.toThrow(RegistryCorruptError);

    await fs.unlink(filePath).catch(() => {});
  });

  it('getFilePath() should return the configured file path', () => {
    expect(registry.getFilePath()).toBe(filePath);
  });

  it('save() should write atomically via temp file and rename', async () => {
    const data: RegistryData = {
      version: 1,
      sessions: {
        'atomic-test': makeEntry('atomic-test'),
      },
    };

    await registry.save(data);

    // The final file should exist with correct content
    const loaded = await registry.load();
    expect(loaded).toEqual(data);

    // The temp file should not linger after save completes
    await expect(fs.access(`${filePath}.tmp`)).rejects.toThrow();

    await fs.unlink(filePath).catch(() => {});
  });

  describe('file locking', () => {
    afterEach(async () => {
      await fs.unlink(filePath).catch(() => {});
      // Clean up lockfile artifacts
      await fs.unlink(`${filePath}.lock`).catch(() => {});
    });

    it('should not corrupt data when concurrent addEntry() calls race', async () => {
      // Fire multiple addEntry() calls concurrently — keep count low enough
      // for the lock retry strategy (5 retries, exponential backoff) to handle
      const entries = Array.from({ length: 4 }, (_, i) => makeEntry(`concurrent-${i}`));
      await Promise.all(entries.map((entry) => registry.addEntry(entry)));

      const data = await registry.load();
      // All entries should be present and none lost
      for (let i = 0; i < 4; i++) {
        expect(data.sessions[`concurrent-${i}`]).toBeDefined();
        expect(data.sessions[`concurrent-${i}`].name).toBe(`concurrent-${i}`);
      }
      expect(Object.keys(data.sessions)).toHaveLength(4);
    });

    it('should throw RegistryLockError when lock cannot be acquired', async () => {
      // Create the file so proper-lockfile can lock it
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(
        filePath,
        JSON.stringify({ version: 1, sessions: {} }, null, 2),
        'utf-8',
      );

      // Hold the lock externally so withLock() cannot acquire it
      const release = await lock(filePath, {
        stale: 60_000, // Long stale time so it won't be cleaned up
        realpath: false,
      });

      // Create a registry with very short retry config to make the test fast
      // Since we can't override LOCK_OPTIONS, we rely on the fact that
      // proper-lockfile will eventually give up after its retries
      try {
        await expect(registry.addEntry(makeEntry('blocked'))).rejects.toThrow(RegistryLockError);
      } finally {
        await release();
      }
    });

    it('should recover from stale locks', async () => {
      // Create the file
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(
        filePath,
        JSON.stringify({ version: 1, sessions: {} }, null, 2),
        'utf-8',
      );

      // Create a stale lockfile manually (simulating a crashed process)
      const lockDir = `${filePath}.lock`;
      await fs.mkdir(lockDir, { recursive: true });

      // Backdate the lock so it appears stale (older than 10s stale threshold)
      const pastTime = new Date(Date.now() - 15_000);
      await fs.utimes(lockDir, pastTime, pastTime);

      // The registry should be able to acquire the lock despite the stale lockfile
      await registry.addEntry(makeEntry('after-stale'));

      const data = await registry.load();
      expect(data.sessions['after-stale']).toBeDefined();
      expect(data.sessions['after-stale'].name).toBe('after-stale');
    });

    it('should not corrupt data when addEntry() and removeEntry() interleave', async () => {
      // Pre-populate with some entries
      await registry.addEntry(makeEntry('keep-a'));
      await registry.addEntry(makeEntry('keep-b'));
      await registry.addEntry(makeEntry('remove-me'));

      // Interleave add and remove concurrently
      await Promise.all([
        registry.addEntry(makeEntry('new-c')),
        registry.removeEntry('remove-me'),
        registry.addEntry(makeEntry('new-d')),
      ]);

      const data = await registry.load();
      expect(data.sessions['keep-a']).toBeDefined();
      expect(data.sessions['keep-b']).toBeDefined();
      expect(data.sessions['new-c']).toBeDefined();
      expect(data.sessions['new-d']).toBeDefined();
      expect(data.sessions['remove-me']).toBeUndefined();
    });

    it('should propagate mutator errors without wrapping in RegistryLockError', async () => {
      // Create the file
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(
        filePath,
        JSON.stringify({ version: 1, sessions: {} }, null, 2),
        'utf-8',
      );

      class CustomError extends Error {
        constructor() {
          super('custom mutator failure');
          this.name = 'CustomError';
        }
      }

      // The custom error should propagate as-is, not wrapped in RegistryLockError
      await expect(
        registry.withLock(() => {
          throw new CustomError();
        }),
      ).rejects.toThrow(CustomError);

      await expect(
        registry.withLock(() => {
          throw new CustomError();
        }),
      ).rejects.not.toBeInstanceOf(RegistryLockError);
    });

    it('should release lock even when mutator throws', async () => {
      // Create the file
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(
        filePath,
        JSON.stringify({ version: 1, sessions: {} }, null, 2),
        'utf-8',
      );

      // withLock with a throwing mutator
      await expect(
        registry.withLock(() => {
          throw new Error('mutator exploded');
        }),
      ).rejects.toThrow('mutator exploded');

      // Lock should be released — subsequent operations should work
      await registry.addEntry(makeEntry('after-error'));
      const data = await registry.load();
      expect(data.sessions['after-error']).toBeDefined();
    });
  });
});
