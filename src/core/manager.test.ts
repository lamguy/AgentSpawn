import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { SessionManager } from './manager.js';
import { Session } from './session.js';
import { SessionState, SessionConfig } from '../types.js';
import { SessionAlreadyExistsError, SessionNotFoundError } from '../utils/errors.js';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

const mockedSpawn = vi.mocked(spawn);

function createMockChildProcess(pid: number = 12345) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cp = new EventEmitter() as any;
  cp.stdin = new PassThrough();
  cp.stdout = new PassThrough();
  cp.stderr = new PassThrough();
  cp.pid = pid;
  cp.kill = vi.fn((signal?: string) => {
    process.nextTick(() => cp.emit('exit', signal === 'SIGKILL' ? 137 : 0, signal || null));
    return true;
  });
  return cp;
}

function tmpRegistryPath(): string {
  return path.join(
    os.tmpdir(),
    `manager-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
}

describe('SessionManager', () => {
  let registryPath: string;
  let manager: SessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    registryPath = tmpRegistryPath();
    manager = new SessionManager({ registryPath });
  });

  afterEach(async () => {
    await fs.unlink(registryPath).catch(() => {});
  });

  it('can be instantiated', () => {
    expect(manager).toBeInstanceOf(SessionManager);
  });

  it('init() detects stale PIDs and marks Crashed in registry', async () => {
    // Write a registry file with a "running" session that has a stale PID
    const stalePid = 999999999;
    const data = {
      version: 1,
      sessions: {
        'stale-session': {
          name: 'stale-session',
          pid: stalePid,
          state: 'running',
          startedAt: new Date().toISOString(),
          workingDirectory: '/tmp/stale',
          exitCode: null,
        },
      },
    };
    const dir = path.dirname(registryPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(registryPath, JSON.stringify(data, null, 2), 'utf-8');

    // Mock process.kill to throw ESRCH (process not found)
    const originalKill = process.kill;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const killMock = vi.fn((_pid: number, _signal?: string | number) => {
      const err = new Error('kill ESRCH') as NodeJS.ErrnoException;
      err.code = 'ESRCH';
      throw err;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    process.kill = killMock as any;

    try {
      await manager.init();

      // Read registry back and verify it was updated to crashed
      const raw = await fs.readFile(registryPath, 'utf-8');
      const updated = JSON.parse(raw);
      expect(updated.sessions['stale-session'].state).toBe('crashed');
    } finally {
      process.kill = originalKill;
    }
  });

  it('startSession() creates session and persists to registry', async () => {
    const mockCp = createMockChildProcess(5000);
    mockedSpawn.mockReturnValue(mockCp);

    await manager.init();

    const config: SessionConfig = {
      name: 'my-session',
      workingDirectory: '/tmp/work',
    };
    const session = await manager.startSession(config);

    expect(session).toBeInstanceOf(Session);
    expect(session.getState()).toBe(SessionState.Running);
    expect(manager.listSessions()).toHaveLength(1);
    expect(manager.listSessions()[0].name).toBe('my-session');

    // Verify registry file contains the entry
    const raw = await fs.readFile(registryPath, 'utf-8');
    const data = JSON.parse(raw);
    expect(data.sessions['my-session']).toBeDefined();
    expect(data.sessions['my-session'].pid).toBe(5000);
  });

  it('stopSession() removes from registry', async () => {
    const mockCp = createMockChildProcess(6000);
    mockedSpawn.mockReturnValue(mockCp);

    await manager.init();
    await manager.startSession({ name: 'remove-me', workingDirectory: '/tmp/work' });
    expect(manager.listSessions()).toHaveLength(1);

    await manager.stopSession('remove-me');
    expect(manager.listSessions()).toHaveLength(0);

    // Verify registry file no longer contains the entry
    const raw = await fs.readFile(registryPath, 'utf-8');
    const data = JSON.parse(raw);
    expect(data.sessions['remove-me']).toBeUndefined();
  });

  it('listSessions() returns accurate info', async () => {
    let pidCounter = 7000;
    mockedSpawn.mockImplementation(() => {
      return createMockChildProcess(pidCounter++);
    });

    await manager.init();
    await manager.startSession({ name: 'alpha', workingDirectory: '/tmp/a' });
    await manager.startSession({ name: 'beta', workingDirectory: '/tmp/b' });

    const sessions = manager.listSessions();
    expect(sessions).toHaveLength(2);

    const names = sessions.map((s) => s.name).sort();
    expect(names).toEqual(['alpha', 'beta']);

    for (const s of sessions) {
      expect(s.state).toBe(SessionState.Running);
      expect(typeof s.pid).toBe('number');
      expect(s.pid).toBeGreaterThan(0);
    }
  });

  it('duplicate name throws SessionAlreadyExistsError', async () => {
    const mockCp = createMockChildProcess(8000);
    mockedSpawn.mockReturnValue(mockCp);

    await manager.init();
    await manager.startSession({ name: 'dup-session', workingDirectory: '/tmp/work' });

    await expect(
      manager.startSession({ name: 'dup-session', workingDirectory: '/tmp/work' }),
    ).rejects.toThrow(SessionAlreadyExistsError);
    await expect(
      manager.startSession({ name: 'dup-session', workingDirectory: '/tmp/work' }),
    ).rejects.toThrow('Session already exists: dup-session');
  });

  it('not-found name throws SessionNotFoundError', async () => {
    await manager.init();

    await expect(manager.stopSession('nonexistent')).rejects.toThrow(SessionNotFoundError);
    await expect(manager.stopSession('nonexistent')).rejects.toThrow(
      'Session not found: nonexistent',
    );
  });

  it('stopAll() clears everything', async () => {
    let pidCounter = 9000;
    mockedSpawn.mockImplementation(() => {
      return createMockChildProcess(pidCounter++);
    });

    await manager.init();
    await manager.startSession({ name: 'a', workingDirectory: '/tmp/a' });
    await manager.startSession({ name: 'b', workingDirectory: '/tmp/b' });
    await manager.startSession({ name: 'c', workingDirectory: '/tmp/c' });
    expect(manager.listSessions()).toHaveLength(3);

    await manager.stopAll();
    expect(manager.listSessions()).toHaveLength(0);

    // Verify registry is empty
    const raw = await fs.readFile(registryPath, 'utf-8');
    const data = JSON.parse(raw);
    expect(Object.keys(data.sessions)).toHaveLength(0);
  });
});
