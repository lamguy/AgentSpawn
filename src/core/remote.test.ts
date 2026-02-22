import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RemoteManager } from './remote.js';
import { RemoteData, RemoteEntry } from '../types.js';
import { RemoteAlreadyExistsError, RemoteNotFoundError } from '../utils/errors.js';
import { lock } from 'proper-lockfile';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

function tmpFile(): string {
  return path.join(
    os.tmpdir(),
    `remote-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
}

function makeEntry(alias: string, overrides: Partial<RemoteEntry> = {}): RemoteEntry {
  return {
    alias,
    sshHost: 'example.com',
    sshUser: 'deploy',
    sshPort: 22,
    remotePort: 7821,
    localPort: 19000,
    addedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('RemoteManager', () => {
  let filePath: string;
  let manager: RemoteManager;

  beforeEach(() => {
    filePath = tmpFile();
    manager = new RemoteManager(filePath);
  });

  afterEach(async () => {
    await fs.unlink(filePath).catch(() => {});
    await fs.unlink(`${filePath}.tmp`).catch(() => {});
    await fs.rm(`${filePath}.lock`, { recursive: true, force: true }).catch(() => {});
  });

  it('can be instantiated with a file path', () => {
    expect(manager).toBeInstanceOf(RemoteManager);
  });

  it('getFilePath() should return the configured file path', () => {
    expect(manager.getFilePath()).toBe(filePath);
  });

  // -------------------------------------------------------------------------
  // load()
  // -------------------------------------------------------------------------

  describe('load()', () => {
    it('should return empty data when file does not exist', async () => {
      const data = await manager.load();
      expect(data).toEqual({ version: 1, remotes: {} });
    });

    it('should throw on invalid JSON', async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, 'not valid json {{{', 'utf-8');

      await expect(manager.load()).rejects.toThrow('corrupt');
    });

    it('should throw on valid JSON with invalid structure (missing version)', async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify({ remotes: {} }), 'utf-8');

      await expect(manager.load()).rejects.toThrow();
    });

    it('should throw on valid JSON with invalid structure (remotes is null)', async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(
        filePath,
        JSON.stringify({ version: 1, remotes: null }),
        'utf-8',
      );

      await expect(manager.load()).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // save() and load() round-trip
  // -------------------------------------------------------------------------

  describe('save() and load()', () => {
    it('should round-trip data correctly', async () => {
      const data: RemoteData = {
        version: 1,
        remotes: {
          'my-server': makeEntry('my-server'),
        },
      };

      await manager.save(data);
      const loaded = await manager.load();
      expect(loaded).toEqual(data);
    });

    it('should write atomically via temp file and rename', async () => {
      const data: RemoteData = {
        version: 1,
        remotes: {
          'atomic-test': makeEntry('atomic-test'),
        },
      };

      await manager.save(data);

      const loaded = await manager.load();
      expect(loaded).toEqual(data);

      // The temp file should not linger after save completes
      await expect(fs.access(`${filePath}.tmp`)).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // addRemote()
  // -------------------------------------------------------------------------

  describe('addRemote()', () => {
    it('should persist a new entry to disk', async () => {
      const entry = makeEntry('server-1');
      await manager.addRemote(entry);

      const data = await manager.load();
      expect(data.remotes['server-1']).toEqual(entry);
    });

    it('should persist multiple entries independently', async () => {
      await manager.addRemote(makeEntry('server-a'));
      await manager.addRemote(makeEntry('server-b', { sshHost: 'other.example.com' }));

      const data = await manager.load();
      expect(Object.keys(data.remotes)).toHaveLength(2);
      expect(data.remotes['server-a']).toBeDefined();
      expect(data.remotes['server-b']).toBeDefined();
    });

    it('should throw RemoteAlreadyExistsError on duplicate alias', async () => {
      await manager.addRemote(makeEntry('dup'));

      await expect(manager.addRemote(makeEntry('dup'))).rejects.toThrow(
        RemoteAlreadyExistsError,
      );
    });

    it('should throw RemoteAlreadyExistsError with alias in message', async () => {
      await manager.addRemote(makeEntry('unique-alias'));

      await expect(
        manager.addRemote(makeEntry('unique-alias')),
      ).rejects.toThrow('unique-alias');
    });

    it('should not modify existing entries when duplicate is rejected', async () => {
      const original = makeEntry('my-remote', { sshHost: 'original.host' });
      await manager.addRemote(original);

      await expect(
        manager.addRemote(makeEntry('my-remote', { sshHost: 'new.host' })),
      ).rejects.toThrow(RemoteAlreadyExistsError);

      const data = await manager.load();
      expect(data.remotes['my-remote'].sshHost).toBe('original.host');
    });
  });

  // -------------------------------------------------------------------------
  // removeRemote()
  // -------------------------------------------------------------------------

  describe('removeRemote()', () => {
    it('should remove an existing entry from disk', async () => {
      await manager.addRemote(makeEntry('to-delete'));

      let data = await manager.load();
      expect(data.remotes['to-delete']).toBeDefined();

      await manager.removeRemote('to-delete');

      data = await manager.load();
      expect(data.remotes['to-delete']).toBeUndefined();
    });

    it('should throw RemoteNotFoundError for unknown alias', async () => {
      await expect(manager.removeRemote('nonexistent')).rejects.toThrow(
        RemoteNotFoundError,
      );
    });

    it('should throw RemoteNotFoundError with alias in message', async () => {
      await expect(manager.removeRemote('ghost-alias')).rejects.toThrow(
        'ghost-alias',
      );
    });

    it('should not affect other entries when removing one', async () => {
      await manager.addRemote(makeEntry('keep-me'));
      await manager.addRemote(makeEntry('delete-me'));

      await manager.removeRemote('delete-me');

      const data = await manager.load();
      expect(data.remotes['keep-me']).toBeDefined();
      expect(data.remotes['delete-me']).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // getRemote()
  // -------------------------------------------------------------------------

  describe('getRemote()', () => {
    it('should return the entry for a known alias', async () => {
      const entry = makeEntry('known-server');
      await manager.addRemote(entry);

      const result = await manager.getRemote('known-server');
      expect(result).toEqual(entry);
    });

    it('should return undefined for an unknown alias', async () => {
      const result = await manager.getRemote('unknown');
      expect(result).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // listRemotes()
  // -------------------------------------------------------------------------

  describe('listRemotes()', () => {
    it('should return all entries', async () => {
      await manager.addRemote(makeEntry('alpha'));
      await manager.addRemote(makeEntry('beta'));

      const remotes = await manager.listRemotes();
      expect(remotes).toHaveLength(2);

      const aliases = remotes.map((r) => r.alias);
      expect(aliases).toContain('alpha');
      expect(aliases).toContain('beta');
    });

    it('should return empty array when no remotes exist', async () => {
      const remotes = await manager.listRemotes();
      expect(remotes).toEqual([]);
    });

    it('should return RemoteEntry objects with all fields', async () => {
      const entry = makeEntry('full-entry', {
        sshHost: 'prod.example.com',
        sshUser: 'admin',
        sshPort: 2222,
        remotePort: 8080,
        localPort: 15000,
      });
      await manager.addRemote(entry);

      const [result] = await manager.listRemotes();
      expect(result.alias).toBe('full-entry');
      expect(result.sshHost).toBe('prod.example.com');
      expect(result.sshUser).toBe('admin');
      expect(result.sshPort).toBe(2222);
      expect(result.remotePort).toBe(8080);
      expect(result.localPort).toBe(15000);
    });
  });

  // -------------------------------------------------------------------------
  // Persistence across instances
  // -------------------------------------------------------------------------

  describe('persistence', () => {
    it('should survive re-instantiation on the same file', async () => {
      await manager.addRemote(makeEntry('persistent-remote'));

      const manager2 = new RemoteManager(filePath);
      const result = await manager2.getRemote('persistent-remote');

      expect(result).toBeDefined();
      expect(result!.alias).toBe('persistent-remote');
    });
  });

  // -------------------------------------------------------------------------
  // File locking
  // -------------------------------------------------------------------------

  describe('file locking', () => {
    it('should not corrupt data when concurrent addRemote() calls race', async () => {
      await Promise.all([
        manager.addRemote(makeEntry('r1')),
        manager.addRemote(makeEntry('r2')),
        manager.addRemote(makeEntry('r3')),
        manager.addRemote(makeEntry('r4')),
      ]);

      const data = await manager.load();
      expect(Object.keys(data.remotes)).toHaveLength(4);
      expect(data.remotes['r1']).toBeDefined();
      expect(data.remotes['r2']).toBeDefined();
      expect(data.remotes['r3']).toBeDefined();
      expect(data.remotes['r4']).toBeDefined();
    });

    it('should throw when lock cannot be acquired', async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(
        filePath,
        JSON.stringify({ version: 1, remotes: {} }, null, 2),
        'utf-8',
      );

      // Hold the lock externally so withLock() cannot acquire it
      const release = await lock(filePath, {
        stale: 60_000,
        realpath: false,
      });

      try {
        await expect(
          manager.addRemote(makeEntry('blocked')),
        ).rejects.toThrow();
      } finally {
        await release();
      }
    });

    it('should release lock even when mutator throws', async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(
        filePath,
        JSON.stringify({ version: 1, remotes: {} }, null, 2),
        'utf-8',
      );

      await expect(
        manager.withLock(() => {
          throw new Error('mutator exploded');
        }),
      ).rejects.toThrow('mutator exploded');

      // Lock should be released -- subsequent operations should succeed
      await manager.addRemote(makeEntry('after-error'));
      const data = await manager.load();
      expect(data.remotes['after-error']).toBeDefined();
    });

    it('should recover from stale locks', async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(
        filePath,
        JSON.stringify({ version: 1, remotes: {} }, null, 2),
        'utf-8',
      );

      // Create a stale lockfile manually (simulating a crashed process)
      const lockDir = `${filePath}.lock`;
      await fs.mkdir(lockDir, { recursive: true });

      // Backdate the lock so it appears stale (older than 10s stale threshold)
      const pastTime = new Date(Date.now() - 15_000);
      await fs.utimes(lockDir, pastTime, pastTime);

      // The manager should be able to acquire the lock despite the stale lockfile
      await manager.addRemote(makeEntry('after-stale'));

      const data = await manager.load();
      expect(data.remotes['after-stale']).toBeDefined();
      expect(data.remotes['after-stale'].alias).toBe('after-stale');
    });
  });
});
