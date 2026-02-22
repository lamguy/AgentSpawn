import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkspaceManager } from './workspace.js';
import { WorkspaceData } from '../types.js';
import {
  WorkspaceAlreadyExistsError,
  WorkspaceCorruptError,
  WorkspaceLockError,
  WorkspaceNotFoundError,
} from '../utils/errors.js';
import { lock } from 'proper-lockfile';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

function tmpFile(): string {
  return path.join(
    os.tmpdir(),
    `workspace-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
}

describe('WorkspaceManager', () => {
  let filePath: string;
  let manager: WorkspaceManager;

  beforeEach(() => {
    filePath = tmpFile();
    manager = new WorkspaceManager(filePath);
  });

  afterEach(async () => {
    await fs.unlink(filePath).catch(() => {});
    await fs.unlink(`${filePath}.tmp`).catch(() => {});
    await fs.unlink(`${filePath}.lock`).catch(() => {});
    // proper-lockfile creates a .lock directory
    await fs.rm(`${filePath}.lock`, { recursive: true, force: true }).catch(() => {});
  });

  it('can be instantiated with a file path', () => {
    expect(manager).toBeInstanceOf(WorkspaceManager);
  });

  it('getFilePath() should return the configured file path', () => {
    expect(manager.getFilePath()).toBe(filePath);
  });

  describe('load()', () => {
    it('should return default data when file does not exist', async () => {
      const data = await manager.load();
      expect(data).toEqual({ version: 1, workspaces: {} });
    });

    it('should throw WorkspaceCorruptError on invalid JSON', async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, 'not valid json {{{', 'utf-8');

      await expect(manager.load()).rejects.toThrow(WorkspaceCorruptError);
    });

    it('should throw WorkspaceCorruptError on valid JSON with invalid structure', async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify({ foo: 'bar' }), 'utf-8');

      await expect(manager.load()).rejects.toThrow(WorkspaceCorruptError);
    });

    it('should throw WorkspaceCorruptError when workspaces field is null', async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(
        filePath,
        JSON.stringify({ version: 1, workspaces: null }),
        'utf-8',
      );

      await expect(manager.load()).rejects.toThrow(WorkspaceCorruptError);
    });

    it('should throw WorkspaceCorruptError when version is missing', async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(
        filePath,
        JSON.stringify({ workspaces: {} }),
        'utf-8',
      );

      await expect(manager.load()).rejects.toThrow(WorkspaceCorruptError);
    });
  });

  describe('save() and load()', () => {
    it('should round-trip data correctly', async () => {
      const data: WorkspaceData = {
        version: 1,
        workspaces: {
          'my-workspace': {
            name: 'my-workspace',
            sessionNames: ['sess-a', 'sess-b'],
            createdAt: '2025-01-01T00:00:00.000Z',
          },
        },
      };

      await manager.save(data);
      const loaded = await manager.load();
      expect(loaded).toEqual(data);
    });

    it('should write atomically via temp file and rename', async () => {
      const data: WorkspaceData = {
        version: 1,
        workspaces: {
          'atomic-test': {
            name: 'atomic-test',
            sessionNames: [],
            createdAt: '2025-01-01T00:00:00.000Z',
          },
        },
      };

      await manager.save(data);

      // The final file should exist with correct content
      const loaded = await manager.load();
      expect(loaded).toEqual(data);

      // The temp file should not linger after save completes
      await expect(fs.access(`${filePath}.tmp`)).rejects.toThrow();
    });
  });

  describe('create()', () => {
    it('should create a workspace and persist it to disk', async () => {
      await manager.create('project-a');

      const data = await manager.load();
      expect(data.workspaces['project-a']).toBeDefined();
      expect(data.workspaces['project-a'].name).toBe('project-a');
      expect(data.workspaces['project-a'].sessionNames).toEqual([]);
      expect(data.workspaces['project-a'].createdAt).toBeDefined();
    });

    it('should throw WorkspaceAlreadyExistsError for duplicate name', async () => {
      await manager.create('duplicate');

      await expect(manager.create('duplicate')).rejects.toThrow(
        WorkspaceAlreadyExistsError,
      );
    });

    it('should create multiple workspaces independently', async () => {
      await manager.create('ws-1');
      await manager.create('ws-2');
      await manager.create('ws-3');

      const data = await manager.load();
      expect(Object.keys(data.workspaces)).toHaveLength(3);
      expect(data.workspaces['ws-1']).toBeDefined();
      expect(data.workspaces['ws-2']).toBeDefined();
      expect(data.workspaces['ws-3']).toBeDefined();
    });
  });

  describe('delete()', () => {
    it('should remove a workspace from disk', async () => {
      await manager.create('to-delete');

      let data = await manager.load();
      expect(data.workspaces['to-delete']).toBeDefined();

      await manager.delete('to-delete');

      data = await manager.load();
      expect(data.workspaces['to-delete']).toBeUndefined();
    });

    it('should throw WorkspaceNotFoundError for missing workspace', async () => {
      await expect(manager.delete('nonexistent')).rejects.toThrow(
        WorkspaceNotFoundError,
      );
    });

    it('should not affect other workspaces when deleting one', async () => {
      await manager.create('keep-me');
      await manager.create('delete-me');

      await manager.delete('delete-me');

      const data = await manager.load();
      expect(data.workspaces['keep-me']).toBeDefined();
      expect(data.workspaces['delete-me']).toBeUndefined();
    });
  });

  describe('addSessions()', () => {
    it('should add sessions and return actually added names', async () => {
      await manager.create('ws');

      const added = await manager.addSessions('ws', ['s1', 's2', 's3']);
      expect(added).toEqual(['s1', 's2', 's3']);

      const data = await manager.load();
      expect(data.workspaces['ws'].sessionNames).toEqual(['s1', 's2', 's3']);
    });

    it('should deduplicate -- adding existing session returns empty array', async () => {
      await manager.create('ws');
      await manager.addSessions('ws', ['s1', 's2']);

      const added = await manager.addSessions('ws', ['s1', 's2']);
      expect(added).toEqual([]);

      // Data should remain unchanged
      const data = await manager.load();
      expect(data.workspaces['ws'].sessionNames).toEqual(['s1', 's2']);
    });

    it('should return only newly added sessions when some already exist', async () => {
      await manager.create('ws');
      await manager.addSessions('ws', ['s1']);

      const added = await manager.addSessions('ws', ['s1', 's2', 's3']);
      expect(added).toEqual(['s2', 's3']);

      const data = await manager.load();
      expect(data.workspaces['ws'].sessionNames).toEqual(['s1', 's2', 's3']);
    });

    it('should throw WorkspaceNotFoundError for missing workspace', async () => {
      await expect(
        manager.addSessions('nonexistent', ['s1']),
      ).rejects.toThrow(WorkspaceNotFoundError);
    });
  });

  describe('removeSessions()', () => {
    it('should remove sessions and return actually removed names', async () => {
      await manager.create('ws');
      await manager.addSessions('ws', ['s1', 's2', 's3']);

      const removed = await manager.removeSessions('ws', ['s1', 's3']);
      expect(removed).toEqual(['s1', 's3']);

      const data = await manager.load();
      expect(data.workspaces['ws'].sessionNames).toEqual(['s2']);
    });

    it('should handle removing non-existent sessions gracefully', async () => {
      await manager.create('ws');
      await manager.addSessions('ws', ['s1']);

      const removed = await manager.removeSessions('ws', ['s999', 's888']);
      expect(removed).toEqual([]);

      // Data should remain unchanged
      const data = await manager.load();
      expect(data.workspaces['ws'].sessionNames).toEqual(['s1']);
    });

    it('should return only actually removed sessions when some do not exist', async () => {
      await manager.create('ws');
      await manager.addSessions('ws', ['s1', 's2']);

      const removed = await manager.removeSessions('ws', ['s1', 's999']);
      expect(removed).toEqual(['s1']);

      const data = await manager.load();
      expect(data.workspaces['ws'].sessionNames).toEqual(['s2']);
    });

    it('should throw WorkspaceNotFoundError for missing workspace', async () => {
      await expect(
        manager.removeSessions('nonexistent', ['s1']),
      ).rejects.toThrow(WorkspaceNotFoundError);
    });
  });

  describe('list()', () => {
    it('should return all workspaces', async () => {
      await manager.create('alpha');
      await manager.create('beta');

      const workspaces = await manager.list();
      expect(workspaces).toHaveLength(2);

      const names = workspaces.map((w) => w.name);
      expect(names).toContain('alpha');
      expect(names).toContain('beta');
    });

    it('should return empty array when no workspaces exist', async () => {
      const workspaces = await manager.list();
      expect(workspaces).toEqual([]);
    });
  });

  describe('get()', () => {
    it('should return a single workspace', async () => {
      await manager.create('my-ws');
      await manager.addSessions('my-ws', ['sess-1']);

      const workspace = await manager.get('my-ws');
      expect(workspace.name).toBe('my-ws');
      expect(workspace.sessionNames).toEqual(['sess-1']);
      expect(workspace.createdAt).toBeDefined();
    });

    it('should throw WorkspaceNotFoundError for missing workspace', async () => {
      await expect(manager.get('nonexistent')).rejects.toThrow(
        WorkspaceNotFoundError,
      );
    });
  });

  describe('getSessionNames()', () => {
    it('should return session names array', async () => {
      await manager.create('ws');
      await manager.addSessions('ws', ['a', 'b', 'c']);

      const names = await manager.getSessionNames('ws');
      expect(names).toEqual(['a', 'b', 'c']);
    });

    it('should return empty array for workspace with no sessions', async () => {
      await manager.create('empty-ws');

      const names = await manager.getSessionNames('empty-ws');
      expect(names).toEqual([]);
    });

    it('should throw WorkspaceNotFoundError for missing workspace', async () => {
      await expect(manager.getSessionNames('nonexistent')).rejects.toThrow(
        WorkspaceNotFoundError,
      );
    });
  });

  describe('persistence', () => {
    it('should survive re-instantiation on the same file', async () => {
      await manager.create('persistent-ws');
      await manager.addSessions('persistent-ws', ['s1', 's2']);

      // Create a new WorkspaceManager instance pointing at the same file
      const manager2 = new WorkspaceManager(filePath);
      const workspace = await manager2.get('persistent-ws');

      expect(workspace.name).toBe('persistent-ws');
      expect(workspace.sessionNames).toEqual(['s1', 's2']);
    });
  });

  describe('file locking', () => {
    it('should not corrupt data when concurrent addSessions() calls race', async () => {
      await manager.create('ws');

      // Fire multiple addSessions() calls concurrently
      await Promise.all([
        manager.addSessions('ws', ['s1']),
        manager.addSessions('ws', ['s2']),
        manager.addSessions('ws', ['s3']),
        manager.addSessions('ws', ['s4']),
      ]);

      const data = await manager.load();
      const names = data.workspaces['ws'].sessionNames;
      expect(names).toContain('s1');
      expect(names).toContain('s2');
      expect(names).toContain('s3');
      expect(names).toContain('s4');
      expect(names).toHaveLength(4);
    });

    it('should not corrupt data when concurrent create() calls race', async () => {
      await Promise.all([
        manager.create('ws-a'),
        manager.create('ws-b'),
        manager.create('ws-c'),
      ]);

      const data = await manager.load();
      expect(Object.keys(data.workspaces)).toHaveLength(3);
      expect(data.workspaces['ws-a']).toBeDefined();
      expect(data.workspaces['ws-b']).toBeDefined();
      expect(data.workspaces['ws-c']).toBeDefined();
    });

    it('should throw WorkspaceLockError when lock cannot be acquired', async () => {
      // Create the file so proper-lockfile can lock it
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(
        filePath,
        JSON.stringify({ version: 1, workspaces: {} }, null, 2),
        'utf-8',
      );

      // Hold the lock externally so withLock() cannot acquire it
      const release = await lock(filePath, {
        stale: 60_000,
        realpath: false,
      });

      try {
        await expect(manager.create('blocked')).rejects.toThrow(
          WorkspaceLockError,
        );
      } finally {
        await release();
      }
    });

    it('should release lock even when mutator throws', async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(
        filePath,
        JSON.stringify({ version: 1, workspaces: {} }, null, 2),
        'utf-8',
      );

      // withLock with a throwing mutator
      await expect(
        manager.withLock(() => {
          throw new Error('mutator exploded');
        }),
      ).rejects.toThrow('mutator exploded');

      // Lock should be released -- subsequent operations should work
      await manager.create('after-error');
      const data = await manager.load();
      expect(data.workspaces['after-error']).toBeDefined();
    });

    it('should propagate mutator errors without wrapping in WorkspaceLockError', async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(
        filePath,
        JSON.stringify({ version: 1, workspaces: {} }, null, 2),
        'utf-8',
      );

      class CustomError extends Error {
        constructor() {
          super('custom mutator failure');
          this.name = 'CustomError';
        }
      }

      await expect(
        manager.withLock(() => {
          throw new CustomError();
        }),
      ).rejects.toThrow(CustomError);

      await expect(
        manager.withLock(() => {
          throw new CustomError();
        }),
      ).rejects.not.toBeInstanceOf(WorkspaceLockError);
    });

    it('should recover from stale locks', async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(
        filePath,
        JSON.stringify({ version: 1, workspaces: {} }, null, 2),
        'utf-8',
      );

      // Create a stale lockfile manually (simulating a crashed process)
      const lockDir = `${filePath}.lock`;
      await fs.mkdir(lockDir, { recursive: true });

      // Backdate the lock so it appears stale (older than 10s stale threshold)
      const pastTime = new Date(Date.now() - 15_000);
      await fs.utimes(lockDir, pastTime, pastTime);

      // The manager should be able to acquire the lock despite the stale lockfile
      await manager.create('after-stale');

      const data = await manager.load();
      expect(data.workspaces['after-stale']).toBeDefined();
      expect(data.workspaces['after-stale'].name).toBe('after-stale');
    });
  });
});
