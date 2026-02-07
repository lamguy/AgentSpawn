import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { SessionManager } from './manager.js';
import { Session } from './session.js';
import { SessionState, SessionConfig } from '../types.js';
import { SessionAlreadyExistsError, SessionNotFoundError } from '../utils/errors.js';
import * as childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

const mockedSpawn = vi.mocked(childProcess.spawn);

interface MockChildProcess extends EventEmitter {
  pid: number | undefined;
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
}

function createMockChild(pid: number = 12345): MockChildProcess {
  const child = new EventEmitter() as MockChildProcess;
  child.pid = pid;
  child.stdin = {
    write: vi.fn(),
    end: vi.fn(),
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
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

      const raw = await fs.readFile(registryPath, 'utf-8');
      const updated = JSON.parse(raw);
      expect(updated.sessions['stale-session'].state).toBe('crashed');
    } finally {
      process.kill = originalKill;
    }
  });

  it('startSession() creates session and persists to registry', async () => {
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
    expect(data.sessions['my-session'].pid).toBe(0); // Prompt-based sessions have no persistent PID
  });

  it('stopSession() removes from registry', async () => {
    await manager.init();
    await manager.startSession({ name: 'remove-me', workingDirectory: '/tmp/work' });
    expect(manager.listSessions()).toHaveLength(1);

    await manager.stopSession('remove-me');
    expect(manager.listSessions()).toHaveLength(0);

    const raw = await fs.readFile(registryPath, 'utf-8');
    const data = JSON.parse(raw);
    expect(data.sessions['remove-me']).toBeUndefined();
  });

  it('listSessions() returns accurate info', async () => {
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
      expect(s.pid).toBe(0); // Prompt-based sessions
    }
  });

  it('duplicate name throws SessionAlreadyExistsError', async () => {
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
    await manager.init();
    await manager.startSession({ name: 'a', workingDirectory: '/tmp/a' });
    await manager.startSession({ name: 'b', workingDirectory: '/tmp/b' });
    await manager.startSession({ name: 'c', workingDirectory: '/tmp/c' });
    expect(manager.listSessions()).toHaveLength(3);

    await manager.stopAll();
    expect(manager.listSessions()).toHaveLength(0);

    const raw = await fs.readFile(registryPath, 'utf-8');
    const data = JSON.parse(raw);
    expect(Object.keys(data.sessions)).toHaveLength(0);
  });

  it('getSessionInfo() returns info for in-memory sessions', async () => {
    await manager.init();
    await manager.startSession({ name: 'test-session', workingDirectory: '/tmp/test' });

    const info = manager.getSessionInfo('test-session');
    expect(info).toBeDefined();
    expect(info?.name).toBe('test-session');
    expect(info?.pid).toBe(0); // Prompt-based sessions
    expect(info?.state).toBe(SessionState.Running);
    expect(info?.workingDirectory).toBe('/tmp/test');
  });

  it('getSessionInfo() returns info from registry for cross-process sessions', async () => {
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

    const originalKill = process.kill;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const killMock = vi.fn((_pid: number, _signal?: string | number) => {
      return true;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    process.kill = killMock as any;

    try {
      await manager.init();

      expect(manager.getSession('cross-process-session')).toBeUndefined();

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

  it('adoptSession() returns existing in-memory session', async () => {
    await manager.init();
    const session = await manager.startSession({ name: 'adopt-me', workingDirectory: '/tmp/a' });

    const adopted = await manager.adoptSession('adopt-me');
    expect(adopted).toBe(session);
  });

  it('adoptSession() creates new session from registry entry', async () => {
    const data = {
      version: 1,
      sessions: {
        'orphan-session': {
          name: 'orphan-session',
          pid: 99999,
          state: 'stopped',
          startedAt: new Date().toISOString(),
          workingDirectory: '/tmp/orphan',
          exitCode: null,
        },
      },
    };
    const dir = path.dirname(registryPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(registryPath, JSON.stringify(data, null, 2), 'utf-8');

    await manager.init();

    const adopted = await manager.adoptSession('orphan-session');
    expect(adopted).toBeInstanceOf(Session);
    expect(adopted.getState()).toBe(SessionState.Running);
    expect(adopted.getInfo().workingDirectory).toBe('/tmp/orphan');
  });

  it('adoptSession() throws for nonexistent session', async () => {
    await manager.init();
    await expect(manager.adoptSession('nonexistent')).rejects.toThrow(SessionNotFoundError);
  });

  it('startSession() persists claudeSessionId in registry', async () => {
    await manager.init();

    const config: SessionConfig = {
      name: 'persist-id-session',
      workingDirectory: '/tmp/work',
    };
    const session = await manager.startSession(config);

    // Read registry file directly
    const raw = await fs.readFile(registryPath, 'utf-8');
    const data = JSON.parse(raw);

    expect(data.sessions['persist-id-session'].claudeSessionId).toBeDefined();
    expect(data.sessions['persist-id-session'].claudeSessionId).toBe(session.getSessionId());
  });

  it('startSession() persists promptCount in registry', async () => {
    await manager.init();

    const config: SessionConfig = {
      name: 'persist-count-session',
      workingDirectory: '/tmp/work',
    };
    await manager.startSession(config);

    // Read registry file directly
    const raw = await fs.readFile(registryPath, 'utf-8');
    const data = JSON.parse(raw);

    expect(data.sessions['persist-count-session'].promptCount).toBe(0);
  });

  it('adoptSession() preserves claudeSessionId from registry', async () => {
    const knownUUID = '99999999-9999-9999-9999-999999999999';
    const data = {
      version: 1,
      sessions: {
        'adopt-with-id': {
          name: 'adopt-with-id',
          pid: 0,
          state: 'stopped',
          startedAt: new Date().toISOString(),
          workingDirectory: '/tmp/adopt',
          exitCode: null,
          claudeSessionId: knownUUID,
          promptCount: 3,
        },
      },
    };
    const dir = path.dirname(registryPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(registryPath, JSON.stringify(data, null, 2), 'utf-8');

    await manager.init();

    const adopted = await manager.adoptSession('adopt-with-id');
    expect(adopted.getSessionId()).toBe(knownUUID);
  });

  it('adoptSession() preserves promptCount from registry', async () => {
    const data = {
      version: 1,
      sessions: {
        'adopt-with-count': {
          name: 'adopt-with-count',
          pid: 0,
          state: 'stopped',
          startedAt: new Date().toISOString(),
          workingDirectory: '/tmp/adopt',
          exitCode: null,
          claudeSessionId: '88888888-8888-8888-8888-888888888888',
          promptCount: 5,
        },
      },
    };
    const dir = path.dirname(registryPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(registryPath, JSON.stringify(data, null, 2), 'utf-8');

    await manager.init();

    const adopted = await manager.adoptSession('adopt-with-count');
    const info = adopted.getInfo();
    expect(info.promptCount).toBe(5);
  });

  it('startSession() persists permissionMode in registry', async () => {
    await manager.init();

    const config: SessionConfig = {
      name: 'persist-perm-session',
      workingDirectory: '/tmp/work',
      permissionMode: 'acceptEdits',
    };
    await manager.startSession(config);

    // Read registry file directly
    const raw = await fs.readFile(registryPath, 'utf-8');
    const data = JSON.parse(raw);

    expect(data.sessions['persist-perm-session'].permissionMode).toBe('acceptEdits');
  });

  it('adoptSession() preserves permissionMode from registry', async () => {
    const data = {
      version: 1,
      sessions: {
        'adopt-with-perm': {
          name: 'adopt-with-perm',
          pid: 0,
          state: 'stopped',
          startedAt: new Date().toISOString(),
          workingDirectory: '/tmp/adopt',
          exitCode: null,
          claudeSessionId: '77777777-7777-7777-7777-777777777777',
          promptCount: 2,
          permissionMode: 'bypassPermissions',
        },
      },
    };
    const dir = path.dirname(registryPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(registryPath, JSON.stringify(data, null, 2), 'utf-8');

    await manager.init();

    const adopted = await manager.adoptSession('adopt-with-perm');
    const info = adopted.getInfo();
    expect(info.permissionMode).toBe('bypassPermissions');

    // Verify that when sending a prompt, the permissionMode is passed to spawn
    const mockChild = createMockChild(42);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedSpawn.mockReturnValue(mockChild as any);

    const p = adopted.sendPrompt('test');

    const args = mockedSpawn.mock.calls[0][1] as string[];
    expect(args).toContain('--permission-mode');
    const permModeIndex = args.indexOf('--permission-mode');
    expect(args[permModeIndex + 1]).toBe('bypassPermissions');

    mockChild.emit('close', 0);
    await p;
  });

  describe('refreshRegistry()', () => {
    it('discovers new sessions added to registry by another process', async () => {
      await manager.init();

      // Verify initially empty
      expect(manager.listSessions()).toHaveLength(0);

      // Simulate another process adding a session to the registry file
      const dir = path.dirname(registryPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        registryPath,
        JSON.stringify({
          version: 1,
          sessions: {
            'external-session': {
              name: 'external-session',
              pid: 999999999,
              state: 'running',
              startedAt: new Date().toISOString(),
              workingDirectory: '/tmp/external',
              exitCode: null,
            },
          },
        }),
      );

      await manager.refreshRegistry();

      const sessions = manager.listSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].name).toBe('external-session');
      // PID 999999999 doesn't exist, so it should be marked crashed
      expect(sessions[0].state).toBe(SessionState.Crashed);
    });

    it('keeps prompt-based sessions (pid=0) as running', async () => {
      await manager.init();

      const dir = path.dirname(registryPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        registryPath,
        JSON.stringify({
          version: 1,
          sessions: {
            'prompt-session': {
              name: 'prompt-session',
              pid: 0,
              state: 'running',
              startedAt: new Date().toISOString(),
              workingDirectory: '/tmp/prompt',
              exitCode: null,
            },
          },
        }),
      );

      await manager.refreshRegistry();

      const sessions = manager.listSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].name).toBe('prompt-session');
      // pid=0 means prompt-based — no PID check, stays Running
      expect(sessions[0].state).toBe(SessionState.Running);
    });

    it('does not duplicate sessions already tracked in memory', async () => {
      await manager.init();
      await manager.startSession({ name: 'in-memory', workingDirectory: '/tmp/m' });

      await manager.refreshRegistry();

      const sessions = manager.listSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].name).toBe('in-memory');
    });

    it('removes registry entries that were deleted on disk', async () => {
      // Start with a session in the registry
      const dir = path.dirname(registryPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        registryPath,
        JSON.stringify({
          version: 1,
          sessions: {
            'will-be-removed': {
              name: 'will-be-removed',
              pid: 999999999,
              state: 'stopped',
              startedAt: new Date().toISOString(),
              workingDirectory: '/tmp/gone',
              exitCode: 0,
            },
          },
        }),
      );

      await manager.init();
      expect(manager.listSessions()).toHaveLength(1);

      // Another process removes the session from registry
      await fs.writeFile(
        registryPath,
        JSON.stringify({ version: 1, sessions: {} }),
      );

      await manager.refreshRegistry();
      expect(manager.listSessions()).toHaveLength(0);
    });
  });
});
