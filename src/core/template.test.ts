import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TemplateManager } from './template.js';
import { TemplateData } from '../types.js';
import {
  TemplateAlreadyExistsError,
  TemplateCorruptError,
  TemplateLockError,
  TemplateNotFoundError,
} from '../utils/errors.js';
import { lock } from 'proper-lockfile';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

function tmpFile(): string {
  return path.join(
    os.tmpdir(),
    `template-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
}

describe('TemplateManager', () => {
  let filePath: string;
  let manager: TemplateManager;

  beforeEach(() => {
    filePath = tmpFile();
    manager = new TemplateManager(filePath);
  });

  afterEach(async () => {
    await fs.unlink(filePath).catch(() => {});
    await fs.unlink(`${filePath}.tmp`).catch(() => {});
    await fs.rm(`${filePath}.lock`, { recursive: true, force: true }).catch(() => {});
  });

  it('can be instantiated with a file path', () => {
    expect(manager).toBeInstanceOf(TemplateManager);
  });

  it('getFilePath() should return the configured file path', () => {
    expect(manager.getFilePath()).toBe(filePath);
  });

  describe('load()', () => {
    it('should return default data when file does not exist', async () => {
      const data = await manager.load();
      expect(data).toEqual({ version: 1, templates: {} });
    });

    it('should throw TemplateCorruptError on invalid JSON', async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, 'not valid json {{{', 'utf-8');

      await expect(manager.load()).rejects.toThrow(TemplateCorruptError);
    });

    it('should throw TemplateCorruptError on valid JSON with invalid structure', async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify({ foo: 'bar' }), 'utf-8');

      await expect(manager.load()).rejects.toThrow(TemplateCorruptError);
    });

    it('should throw TemplateCorruptError when templates field is null', async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(
        filePath,
        JSON.stringify({ version: 1, templates: null }),
        'utf-8',
      );

      await expect(manager.load()).rejects.toThrow(TemplateCorruptError);
    });

    it('should throw TemplateCorruptError when version is missing', async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(
        filePath,
        JSON.stringify({ templates: {} }),
        'utf-8',
      );

      await expect(manager.load()).rejects.toThrow(TemplateCorruptError);
    });

    it('should throw TemplateCorruptError when parsed value is null', async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, 'null', 'utf-8');

      await expect(manager.load()).rejects.toThrow(TemplateCorruptError);
    });
  });

  describe('save() and load()', () => {
    it('should round-trip data correctly', async () => {
      const data: TemplateData = {
        version: 1,
        templates: {
          'my-template': {
            name: 'my-template',
            workingDirectory: '/tmp/project',
            permissionMode: 'bypassPermissions',
            systemPrompt: 'You are a helpful assistant',
            env: { NODE_ENV: 'development' },
            createdAt: '2025-01-01T00:00:00.000Z',
          },
        },
      };

      await manager.save(data);
      const loaded = await manager.load();
      expect(loaded).toEqual(data);
    });

    it('should write atomically via temp file and rename', async () => {
      const data: TemplateData = {
        version: 1,
        templates: {
          'atomic-test': {
            name: 'atomic-test',
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
    it('should create a template and persist it to disk', async () => {
      await manager.create('backend', {
        workingDirectory: '/projects/backend',
        permissionMode: 'bypassPermissions',
        systemPrompt: 'You are a backend engineer',
        env: { NODE_ENV: 'production' },
      });

      const data = await manager.load();
      expect(data.templates['backend']).toBeDefined();
      expect(data.templates['backend'].name).toBe('backend');
      expect(data.templates['backend'].workingDirectory).toBe('/projects/backend');
      expect(data.templates['backend'].permissionMode).toBe('bypassPermissions');
      expect(data.templates['backend'].systemPrompt).toBe('You are a backend engineer');
      expect(data.templates['backend'].env).toEqual({ NODE_ENV: 'production' });
      expect(data.templates['backend'].createdAt).toBeDefined();
    });

    it('should create a template with no optional fields', async () => {
      await manager.create('minimal', {});

      const data = await manager.load();
      const entry = data.templates['minimal'];
      expect(entry).toBeDefined();
      expect(entry.name).toBe('minimal');
      expect(entry.workingDirectory).toBeUndefined();
      expect(entry.permissionMode).toBeUndefined();
      expect(entry.systemPrompt).toBeUndefined();
      expect(entry.env).toBeUndefined();
      expect(entry.createdAt).toBeDefined();
    });

    it('should throw TemplateAlreadyExistsError for duplicate name', async () => {
      await manager.create('duplicate', {});

      await expect(manager.create('duplicate', {})).rejects.toThrow(
        TemplateAlreadyExistsError,
      );
    });

    it('should create multiple templates independently', async () => {
      await manager.create('tpl-1', { workingDirectory: '/a' });
      await manager.create('tpl-2', { permissionMode: 'default' });
      await manager.create('tpl-3', { systemPrompt: 'hello' });

      const data = await manager.load();
      expect(Object.keys(data.templates)).toHaveLength(3);
      expect(data.templates['tpl-1']).toBeDefined();
      expect(data.templates['tpl-2']).toBeDefined();
      expect(data.templates['tpl-3']).toBeDefined();
    });
  });

  describe('delete()', () => {
    it('should remove a template from disk', async () => {
      await manager.create('to-delete', {});

      let data = await manager.load();
      expect(data.templates['to-delete']).toBeDefined();

      await manager.delete('to-delete');

      data = await manager.load();
      expect(data.templates['to-delete']).toBeUndefined();
    });

    it('should throw TemplateNotFoundError for missing template', async () => {
      await expect(manager.delete('nonexistent')).rejects.toThrow(
        TemplateNotFoundError,
      );
    });

    it('should not affect other templates when deleting one', async () => {
      await manager.create('keep-me', { workingDirectory: '/keep' });
      await manager.create('delete-me', {});

      await manager.delete('delete-me');

      const data = await manager.load();
      expect(data.templates['keep-me']).toBeDefined();
      expect(data.templates['keep-me'].workingDirectory).toBe('/keep');
      expect(data.templates['delete-me']).toBeUndefined();
    });
  });

  describe('list()', () => {
    it('should return all templates', async () => {
      await manager.create('alpha', {});
      await manager.create('beta', {});

      const templates = await manager.list();
      expect(templates).toHaveLength(2);

      const names = templates.map((t) => t.name);
      expect(names).toContain('alpha');
      expect(names).toContain('beta');
    });

    it('should return empty array when no templates exist', async () => {
      const templates = await manager.list();
      expect(templates).toEqual([]);
    });
  });

  describe('get()', () => {
    it('should return a single template with all fields', async () => {
      await manager.create('my-tpl', {
        workingDirectory: '/projects/mine',
        permissionMode: 'acceptEdits',
        systemPrompt: 'Be concise',
        env: { DEBUG: '1' },
      });

      const template = await manager.get('my-tpl');
      expect(template.name).toBe('my-tpl');
      expect(template.workingDirectory).toBe('/projects/mine');
      expect(template.permissionMode).toBe('acceptEdits');
      expect(template.systemPrompt).toBe('Be concise');
      expect(template.env).toEqual({ DEBUG: '1' });
      expect(template.createdAt).toBeDefined();
    });

    it('should throw TemplateNotFoundError for missing template', async () => {
      await expect(manager.get('nonexistent')).rejects.toThrow(
        TemplateNotFoundError,
      );
    });
  });

  describe('persistence', () => {
    it('should survive re-instantiation on the same file', async () => {
      await manager.create('persistent-tpl', {
        workingDirectory: '/persistent',
        systemPrompt: 'Remember me',
      });

      // Create a new TemplateManager instance pointing at the same file
      const manager2 = new TemplateManager(filePath);
      const template = await manager2.get('persistent-tpl');

      expect(template.name).toBe('persistent-tpl');
      expect(template.workingDirectory).toBe('/persistent');
      expect(template.systemPrompt).toBe('Remember me');
    });
  });

  describe('file locking', () => {
    it('should not corrupt data when concurrent create() calls race', async () => {
      await Promise.all([
        manager.create('tpl-a', {}),
        manager.create('tpl-b', {}),
        manager.create('tpl-c', {}),
      ]);

      const data = await manager.load();
      expect(Object.keys(data.templates)).toHaveLength(3);
      expect(data.templates['tpl-a']).toBeDefined();
      expect(data.templates['tpl-b']).toBeDefined();
      expect(data.templates['tpl-c']).toBeDefined();
    });

    it('should throw TemplateLockError when lock cannot be acquired', async () => {
      // Create the file so proper-lockfile can lock it
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(
        filePath,
        JSON.stringify({ version: 1, templates: {} }, null, 2),
        'utf-8',
      );

      // Hold the lock externally so withLock() cannot acquire it
      const release = await lock(filePath, {
        stale: 60_000,
        realpath: false,
      });

      try {
        await expect(manager.create('blocked', {})).rejects.toThrow(
          TemplateLockError,
        );
      } finally {
        await release();
      }
    });

    it('should release lock even when mutator throws', async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(
        filePath,
        JSON.stringify({ version: 1, templates: {} }, null, 2),
        'utf-8',
      );

      // withLock with a throwing mutator
      await expect(
        manager.withLock(() => {
          throw new Error('mutator exploded');
        }),
      ).rejects.toThrow('mutator exploded');

      // Lock should be released -- subsequent operations should work
      await manager.create('after-error', {});
      const data = await manager.load();
      expect(data.templates['after-error']).toBeDefined();
    });

    it('should propagate mutator errors without wrapping in TemplateLockError', async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(
        filePath,
        JSON.stringify({ version: 1, templates: {} }, null, 2),
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
      ).rejects.not.toBeInstanceOf(TemplateLockError);
    });

    it('should recover from stale locks', async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(
        filePath,
        JSON.stringify({ version: 1, templates: {} }, null, 2),
        'utf-8',
      );

      // Create a stale lockfile manually (simulating a crashed process)
      const lockDir = `${filePath}.lock`;
      await fs.mkdir(lockDir, { recursive: true });

      // Backdate the lock so it appears stale (older than 10s stale threshold)
      const pastTime = new Date(Date.now() - 15_000);
      await fs.utimes(lockDir, pastTime, pastTime);

      // The manager should be able to acquire the lock despite the stale lockfile
      await manager.create('after-stale', {});

      const data = await manager.load();
      expect(data.templates['after-stale']).toBeDefined();
      expect(data.templates['after-stale'].name).toBe('after-stale');
    });
  });
});
