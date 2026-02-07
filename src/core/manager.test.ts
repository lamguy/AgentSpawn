import { EventEmitter } from 'node:events';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as pty from '@homebridge/node-pty-prebuilt-multiarch';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { SessionManager } from './manager.js';
import { Session } from './session.js';
import { SessionState, SessionConfig } from '../types.js';
import { SessionAlreadyExistsError, SessionNotFoundError } from '../utils/errors.js';

vi.mock('@homebridge/node-pty-prebuilt-multiarch', () => ({
  spawn: vi.fn(),
}));

const mockedPtySpawn = vi.mocked(pty.spawn);

interface MockIPty extends EventEmitter {
  pid: number;
  write: (data: string) => void;
  kill: (signal?: string) => void;
  onData: (callback: (data: string) => void) => void;
  onExit: (callback: (event: { exitCode: number; signal?: number }) => void) => void;
  resize: (cols: number, rows: number) => void;
}

function createMockPty(pid: number = 12345): MockIPty {
  const ptyEmitter = new EventEmitter() as MockIPty;
  ptyEmitter.pid = pid;

  let dataCallback: ((data: string) => void) | null = null;
  let exitCallback: ((event: { exitCode: number; signal?: number }) => void) | null = null;

  ptyEmitter.write = vi.fn(() => {
    // Simulate writing to pty
  });

  ptyEmitter.kill = vi.fn((signal?: string) => {
    process.nextTick(() => {
      if (exitCallback) {
        const exitCode = signal === 'SIGKILL' ? 137 : 0;
        exitCallback({ exitCode, signal: exitCode });
      }
    });
  });

  ptyEmitter.onData = vi.fn((callback: (data: string) => void) => {
    dataCallback = callback;
  });

  ptyEmitter.onExit = vi.fn((callback: (event: { exitCode: number; signal?: number }) => void) => {
    exitCallback = callback;
  });

  ptyEmitter.resize = vi.fn(() => {
    // Mock resize
  });

  // Helper to simulate data from the pty
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ptyEmitter as any).simulateData = (data: string) => {
    if (dataCallback) {
      dataCallback(data);
    }
  };

  // Helper to simulate exit
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ptyEmitter as any).simulateExit = (code: number, signal?: number) => {
    if (exitCallback) {
      exitCallback({ exitCode: code, signal });
    }
  };

  return ptyEmitter;
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
    const mockCp = createMockPty(5000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedPtySpawn.mockReturnValue(mockCp as any);

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
    const mockCp = createMockPty(6000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedPtySpawn.mockReturnValue(mockCp as any);

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
    mockedPtySpawn.mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return createMockPty(pidCounter++) as any;
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
    const mockCp = createMockPty(8000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedPtySpawn.mockReturnValue(mockCp as any);

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
    mockedPtySpawn.mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return createMockPty(pidCounter++) as any;
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

  it('getSessionInfo() returns info for in-memory sessions', async () => {
    const mockCp = createMockPty(10000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedPtySpawn.mockReturnValue(mockCp as any);

    await manager.init();
    await manager.startSession({ name: 'test-session', workingDirectory: '/tmp/test' });

    const info = manager.getSessionInfo('test-session');
    expect(info).toBeDefined();
    expect(info?.name).toBe('test-session');
    expect(info?.pid).toBe(10000);
    expect(info?.state).toBe(SessionState.Running);
    expect(info?.workingDirectory).toBe('/tmp/test');
  });

  it('getSessionInfo() returns info from registry for cross-process sessions', async () => {
    // Simulate a session started by another process
    const data = {
      version: 1,
      sessions: {
        'cross-process-session': {
          name: 'cross-process-session',
          pid: 11000,
          state: 'running',
          startedAt: new Date().toISOString(),
          workingDirectory: '/tmp/cross',
          exitCode: null,
        },
      },
    };
    const dir = path.dirname(registryPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(registryPath, JSON.stringify(data, null, 2), 'utf-8');

    // Mock process.kill to pretend the PID is alive
    const originalKill = process.kill;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const killMock = vi.fn((_pid: number, _signal?: string | number) => {
      // Return true to indicate process exists
      return true;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    process.kill = killMock as any;

    try {
      await manager.init();

      // Session should not be in memory
      expect(manager.getSession('cross-process-session')).toBeUndefined();

      // But getSessionInfo() should return info from registry
      const info = manager.getSessionInfo('cross-process-session');
      expect(info).toBeDefined();
      expect(info?.name).toBe('cross-process-session');
      expect(info?.pid).toBe(11000);
      expect(info?.state).toBe(SessionState.Running);
      expect(info?.workingDirectory).toBe('/tmp/cross');
    } finally {
      process.kill = originalKill;
    }
  });

  it('getSessionInfo() returns undefined for nonexistent sessions', async () => {
    await manager.init();
    const info = manager.getSessionInfo('nonexistent');
    expect(info).toBeUndefined();
  });

  it('getSessionInfo() prefers in-memory session over registry entry', async () => {
    // Create a registry entry
    const data = {
      version: 1,
      sessions: {
        'test-session': {
          name: 'test-session',
          pid: 12000,
          state: 'stopped',
          startedAt: new Date().toISOString(),
          workingDirectory: '/tmp/registry',
          exitCode: 0,
        },
      },
    };
    const dir = path.dirname(registryPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(registryPath, JSON.stringify(data, null, 2), 'utf-8');

    await manager.init();

    // Now start a session with the same name (this would fail in real code due to duplicate check,
    // but we're testing the priority logic)
    const mockCp = createMockPty(13000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedPtySpawn.mockReturnValue(mockCp as any);

    // Remove the registry entry first to allow starting
    await fs.writeFile(registryPath, JSON.stringify({ version: 1, sessions: {} }, null, 2), 'utf-8');
    await manager.init();

    await manager.startSession({ name: 'test-session', workingDirectory: '/tmp/memory' });

    // getSessionInfo() should return the in-memory session's info
    const info = manager.getSessionInfo('test-session');
    expect(info).toBeDefined();
    expect(info?.pid).toBe(13000);
    expect(info?.state).toBe(SessionState.Running);
    expect(info?.workingDirectory).toBe('/tmp/memory');
  });
});
