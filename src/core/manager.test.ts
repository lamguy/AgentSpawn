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
  execFile: vi.fn(),
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

  describe('broadcastPrompt()', () => {
    it('should send prompt to all listed sessions concurrently', async () => {
      await manager.init();
      const sessionA = await manager.startSession({ name: 'a', workingDirectory: '/tmp/a' });
      const sessionB = await manager.startSession({ name: 'b', workingDirectory: '/tmp/b' });

      const mockChild = createMockChild(42);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockedSpawn.mockReturnValue(mockChild as any);

      // Mock sendPrompt on both sessions to resolve immediately
      const sendA = vi.spyOn(sessionA, 'sendPrompt').mockResolvedValue('response-a');
      const sendB = vi.spyOn(sessionB, 'sendPrompt').mockResolvedValue('response-b');

      const results = await manager.broadcastPrompt(['a', 'b'], 'hello');

      expect(sendA).toHaveBeenCalledWith('hello');
      expect(sendB).toHaveBeenCalledWith('hello');
      expect(results).toHaveLength(2);
      expect(results).toEqual(
        expect.arrayContaining([
          { sessionName: 'a', status: 'fulfilled', response: 'response-a' },
          { sessionName: 'b', status: 'fulfilled', response: 'response-b' },
        ]),
      );
    });

    it('should return rejected result for sessions not found', async () => {
      await manager.init();

      const results = await manager.broadcastPrompt(['nonexistent'], 'hello');

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        sessionName: 'nonexistent',
        status: 'rejected',
        error: "Session 'nonexistent' not found",
      });
    });

    it('should return rejected result for sessions not running', async () => {
      await manager.init();
      const session = await manager.startSession({ name: 'stopped-one', workingDirectory: '/tmp/s' });
      await session.stop();

      const results = await manager.broadcastPrompt(['stopped-one'], 'hello');

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        sessionName: 'stopped-one',
        status: 'rejected',
        error: "Session 'stopped-one' is not running",
      });
    });

    it('should return rejected result for sessions that throw during sendPrompt', async () => {
      await manager.init();
      const session = await manager.startSession({ name: 'error-session', workingDirectory: '/tmp/e' });

      vi.spyOn(session, 'sendPrompt').mockRejectedValue(new Error('Claude crashed'));

      const results = await manager.broadcastPrompt(['error-session'], 'hello');

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        sessionName: 'error-session',
        status: 'rejected',
        error: 'Claude crashed',
      });
    });

    it('should return empty results for empty session array', async () => {
      await manager.init();

      const results = await manager.broadcastPrompt([], 'hello');

      expect(results).toEqual([]);
    });

    it('should handle mixed success and failure across sessions', async () => {
      await manager.init();
      const sessionOk = await manager.startSession({ name: 'ok', workingDirectory: '/tmp/ok' });
      const sessionFail = await manager.startSession({ name: 'fail', workingDirectory: '/tmp/fail' });

      vi.spyOn(sessionOk, 'sendPrompt').mockResolvedValue('success');
      vi.spyOn(sessionFail, 'sendPrompt').mockRejectedValue(new Error('boom'));

      const results = await manager.broadcastPrompt(['ok', 'fail', 'ghost'], 'test');

      expect(results).toHaveLength(3);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(fulfilled[0].sessionName).toBe('ok');
      expect(fulfilled[0].response).toBe('success');

      expect(rejected).toHaveLength(2);
      const rejectedNames = rejected.map((r) => r.sessionName).sort();
      expect(rejectedNames).toEqual(['fail', 'ghost']);
    });
  });

  describe('session auto-restart', () => {
    // Helper: wait for sessionRestarted event with a 2s safety timeout.
    const waitForRestart = (): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        const t = setTimeout(
          () => reject(new Error('Timed out waiting for sessionRestarted event')),
          2000,
        );
        manager.once('sessionRestarted', () => {
          clearTimeout(t);
          resolve();
        });
      });

    beforeEach(() => {
      // Re-create manager with backoffFn: () => 0 so restarts happen in the next
      // event-loop tick rather than after 1000ms+. This lets tests use real timers
      // and await the sessionRestarted event instead of advancing fake timers.
      //
      // Also spy on registry.withLock to make it a synchronous no-op, avoiding
      // proper-lockfile's internal setTimeout usage which would otherwise compete
      // with real file I/O during restartSession.
      manager = new SessionManager({ registryPath, backoffFn: () => 0 });
      vi.spyOn(manager.registry, 'withLock').mockResolvedValue(undefined);
    });

    afterEach(async () => {
      // Cancel pending restart timers so they don't bleed into the next test.
      await manager.stopAll().catch(() => {});
      vi.restoreAllMocks();
    });

    it('should emit sessionCrashed event when a session crashes', async () => {
      await manager.init();

      const config: SessionConfig = {
        name: 'crash-test',
        workingDirectory: '/tmp/crash',
        restartPolicy: { enabled: true, maxRetries: 3 },
      };

      const session = await manager.startSession(config);
      const mockChild = createMockChild(42);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockedSpawn.mockReturnValue(mockChild as any);

      const crashHandler = vi.fn();
      manager.on('sessionCrashed', crashHandler);

      const p = session.sendPrompt('test');
      mockChild.emit('close', 1, null);

      await expect(p).rejects.toThrow();

      expect(crashHandler).toHaveBeenCalledTimes(1);
      expect(crashHandler.mock.calls[0][0]).toMatchObject({
        sessionName: 'crash-test',
        exitCode: 1,
        classification: 'Retryable',
        retryCount: 0,
      });
    });

    it('should schedule restart after retryable crash', async () => {
      await manager.init();

      const config: SessionConfig = {
        name: 'retry-session',
        workingDirectory: '/tmp/retry',
        restartPolicy: { enabled: true, maxRetries: 3 },
      };

      const session = await manager.startSession(config);
      const mockChild = createMockChild(42);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockedSpawn.mockReturnValue(mockChild as any);

      const restartHandler = vi.fn();
      manager.on('sessionRestarted', restartHandler);

      const p = session.sendPrompt('failing prompt');
      mockChild.emit('close', 1, null);
      await expect(p).rejects.toThrow();

      await waitForRestart();

      expect(restartHandler).toHaveBeenCalledWith('retry-session', 1);
    });

    it('should not restart when policy is disabled', async () => {
      await manager.init();

      const config: SessionConfig = {
        name: 'no-restart',
        workingDirectory: '/tmp/no-restart',
        restartPolicy: { enabled: false, maxRetries: 3 },
      };

      const session = await manager.startSession(config);
      const mockChild = createMockChild(42);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockedSpawn.mockReturnValue(mockChild as any);

      const restartHandler = vi.fn();
      manager.on('sessionRestarted', restartHandler);

      const p = session.sendPrompt('test');
      mockChild.emit('close', 1, null);
      await expect(p).rejects.toThrow();

      // Brief pause — no restart should fire even with backoffFn: () => 0
      await new Promise((r) => setTimeout(r, 20));
      expect(restartHandler).not.toHaveBeenCalled();
    });

    it('should not restart on permanent failure', async () => {
      await manager.init();

      const config: SessionConfig = {
        name: 'permanent-fail',
        workingDirectory: '/tmp/perm',
        restartPolicy: { enabled: true, maxRetries: 3 },
      };

      const session = await manager.startSession(config);
      const mockChild = createMockChild(42);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockedSpawn.mockReturnValue(mockChild as any);

      const restartHandler = vi.fn();
      manager.on('sessionRestarted', restartHandler);

      const p = session.sendPrompt('test');
      mockChild.emit('close', 127, null); // Command not found - permanent
      await expect(p).rejects.toThrow();

      await new Promise((r) => setTimeout(r, 20));
      expect(restartHandler).not.toHaveBeenCalled();
    });

    it('should emit retryLimitExceeded when max retries reached', async () => {
      await manager.init();

      const config: SessionConfig = {
        name: 'max-retry',
        workingDirectory: '/tmp/max',
        restartPolicy: { enabled: true, maxRetries: 2 },
      };

      // Start session with retry count already at limit
      const session = await manager.startSession(config, undefined, undefined, 2);
      const mockChild = createMockChild(42);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockedSpawn.mockReturnValue(mockChild as any);

      const limitHandler = vi.fn();
      const restartHandler = vi.fn();
      manager.on('retryLimitExceeded', limitHandler);
      manager.on('sessionRestarted', restartHandler);

      const p = session.sendPrompt('test');
      mockChild.emit('close', 1, null);
      await expect(p).rejects.toThrow();

      await new Promise((r) => setTimeout(r, 20));
      expect(limitHandler).toHaveBeenCalledWith('max-retry', expect.any(Object));
      expect(restartHandler).not.toHaveBeenCalled();
    });

    it('should cancel pending restart when session is stopped', async () => {
      await manager.init();

      const config: SessionConfig = {
        name: 'cancel-restart',
        workingDirectory: '/tmp/cancel',
        restartPolicy: { enabled: true, maxRetries: 3 },
      };

      const session = await manager.startSession(config);
      const mockChild = createMockChild(42);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockedSpawn.mockReturnValue(mockChild as any);

      const cancelHandler = vi.fn();
      manager.on('restartCanceled', cancelHandler);

      const p = session.sendPrompt('test');
      mockChild.emit('close', 1, null);
      await expect(p).rejects.toThrow();

      // stopSession calls clearTimeout synchronously before any await, so the
      // 0ms restart timer is cancelled before the event loop can fire it.
      await manager.stopSession('cancel-restart');

      expect(cancelHandler).toHaveBeenCalledWith('cancel-restart');

      // Give time for any errant restart to fire and verify it doesn't
      await new Promise((r) => setTimeout(r, 20));
      expect(manager.getSession('cancel-restart')).toBeUndefined();
    });

    it('should preserve claudeSessionId and promptCount on restart', async () => {
      await manager.init();

      const config: SessionConfig = {
        name: 'preserve-id',
        workingDirectory: '/tmp/preserve',
        restartPolicy: { enabled: true, maxRetries: 3 },
      };

      const session = await manager.startSession(config);
      const originalSessionId = session.getSessionId();

      const mockChild = createMockChild(42);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockedSpawn.mockReturnValue(mockChild as any);

      const p1 = session.sendPrompt('crash me');
      mockChild.emit('close', 1, null);
      await expect(p1).rejects.toThrow();

      await waitForRestart();

      const newSession = manager.getSession('preserve-id');
      expect(newSession).toBeDefined();
      expect(newSession?.getSessionId()).toBe(originalSessionId);
    });

    it('should replay last prompt on restart when replayPrompt is true', async () => {
      await manager.init();

      const config: SessionConfig = {
        name: 'replay-prompt',
        workingDirectory: '/tmp/replay',
        restartPolicy: { enabled: true, maxRetries: 3, replayPrompt: true },
      };

      const session = await manager.startSession(config);

      const mockChild1 = createMockChild(42);
      const mockChild2 = createMockChild(43);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockedSpawn.mockReturnValueOnce(mockChild1 as any).mockReturnValueOnce(mockChild2 as any);

      const p1 = session.sendPrompt('important prompt');
      mockChild1.emit('close', 1, null);
      await expect(p1).rejects.toThrow();

      // sessionRestarted fires before the replay sendPrompt is awaited;
      // EventEmitter.emit is synchronous so stdin.write is called in the same tick.
      await waitForRestart();

      expect(mockChild2.stdin.write).toHaveBeenCalledWith('important prompt');
    });

    it('should call backoffFn with increasing attempt numbers on repeated crashes', async () => {
      await manager.init();

      // Use a spy backoffFn so we can verify the attempt argument
      const backoffAttempts: number[] = [];
      manager = new SessionManager({
        registryPath,
        backoffFn: (attempt) => {
          backoffAttempts.push(attempt);
          return 0;
        },
      });
      vi.spyOn(manager.registry, 'withLock').mockResolvedValue(undefined);
      await manager.init();

      const config: SessionConfig = {
        name: 'backoff-test',
        workingDirectory: '/tmp/backoff',
        restartPolicy: { enabled: true, maxRetries: 5 },
      };

      const session = await manager.startSession(config);
      // Use separate mocks so that each sendPrompt gets its own child process object.
      // Reusing a single mockChild would cause the first sendPrompt's 'close' listener
      // to fire again on the second emit, triggering a spurious extra crash/restart.
      const mockChild1 = createMockChild(42);
      const mockChild2 = createMockChild(43);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockedSpawn.mockReturnValueOnce(mockChild1 as any).mockReturnValueOnce(mockChild2 as any);

      // First crash → attempt 0
      const p1 = session.sendPrompt('crash 1');
      mockChild1.emit('close', 1, null);
      await expect(p1).rejects.toThrow();
      await waitForRestart();

      const newSession = manager.getSession('backoff-test');
      expect(newSession).toBeDefined();
      expect(newSession?.getRetryCount()).toBe(1);

      // Second crash → attempt 1
      const p2 = newSession!.sendPrompt('crash 2');
      mockChild2.emit('close', 1, null);
      await expect(p2).rejects.toThrow();
      await waitForRestart();

      const finalSession = manager.getSession('backoff-test');
      expect(finalSession).toBeDefined();
      expect(finalSession?.getRetryCount()).toBe(2);

      // Verify backoffFn was called with increasing attempt numbers
      expect(backoffAttempts[0]).toBe(0);
      expect(backoffAttempts[1]).toBe(1);
    });

  });

  it('startSession() persists restartPolicy in registry', async () => {
    await manager.init();

    const config: SessionConfig = {
      name: 'persist-policy',
      workingDirectory: '/tmp/policy',
      restartPolicy: { enabled: true, maxRetries: 5 },
    };

    await manager.startSession(config);

    const raw = await fs.readFile(registryPath, 'utf-8');
    const data = JSON.parse(raw);

    expect(data.sessions['persist-policy'].restartPolicy).toEqual({
      enabled: true,
      maxRetries: 5,
    });
  });

  describe('session tagging', () => {
    it('startSession() persists tags in registry', async () => {
      await manager.init();

      await manager.startSession({
        name: 'tagged-session',
        workingDirectory: '/tmp/tagged',
        tags: ['bug', 'urgent'],
      });

      const raw = await fs.readFile(registryPath, 'utf-8');
      const data = JSON.parse(raw);
      expect(data.sessions['tagged-session'].tags).toEqual(['bug', 'urgent']);
    });

    it('getInfo() returns tags from in-memory session', async () => {
      await manager.init();

      await manager.startSession({
        name: 'tag-info-session',
        workingDirectory: '/tmp/tag-info',
        tags: ['feature'],
      });

      const info = manager.getSessionInfo('tag-info-session');
      expect(info?.tags).toEqual(['feature']);
    });

    it('listSessions() returns tags for in-memory sessions', async () => {
      await manager.init();

      await manager.startSession({ name: 'a', workingDirectory: '/tmp/a', tags: ['bug'] });
      await manager.startSession({ name: 'b', workingDirectory: '/tmp/b', tags: ['feature'] });
      await manager.startSession({ name: 'c', workingDirectory: '/tmp/c' });

      const sessions = manager.listSessions();
      const a = sessions.find((s) => s.name === 'a');
      const b = sessions.find((s) => s.name === 'b');
      const c = sessions.find((s) => s.name === 'c');

      expect(a?.tags).toEqual(['bug']);
      expect(b?.tags).toEqual(['feature']);
      expect(c?.tags).toBeUndefined();
    });

    it('listSessions() returns tags from registry-only sessions', async () => {
      const dir = path.dirname(registryPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        registryPath,
        JSON.stringify({
          version: 1,
          sessions: {
            'registry-tagged': {
              name: 'registry-tagged',
              pid: 0,
              state: 'running',
              startedAt: new Date().toISOString(),
              workingDirectory: '/tmp/reg-tagged',
              exitCode: null,
              tags: ['release'],
            },
          },
        }),
      );

      await manager.init();

      const sessions = manager.listSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].tags).toEqual(['release']);
    });

    it('stopByTag() stops all sessions with that tag', async () => {
      await manager.init();

      await manager.startSession({ name: 'bug-1', workingDirectory: '/tmp/b1', tags: ['bug', 'urgent'] });
      await manager.startSession({ name: 'bug-2', workingDirectory: '/tmp/b2', tags: ['bug'] });
      await manager.startSession({ name: 'feat-1', workingDirectory: '/tmp/f1', tags: ['feature'] });

      const stopped = await manager.stopByTag('bug');

      expect(stopped).toBe(2);
      expect(manager.listSessions()).toHaveLength(1);
      expect(manager.listSessions()[0].name).toBe('feat-1');
    });

    it('stopByTag() returns 0 when no sessions match', async () => {
      await manager.init();

      await manager.startSession({ name: 'session-a', workingDirectory: '/tmp/sa', tags: ['feature'] });

      const stopped = await manager.stopByTag('nonexistent-tag');
      expect(stopped).toBe(0);
      expect(manager.listSessions()).toHaveLength(1);
    });

    it('stopByTag() does nothing when there are no sessions', async () => {
      await manager.init();

      const stopped = await manager.stopByTag('urgent');
      expect(stopped).toBe(0);
    });

    it('adoptSession() preserves tags from registry', async () => {
      const data = {
        version: 1,
        sessions: {
          'adopt-tagged': {
            name: 'adopt-tagged',
            pid: 0,
            state: 'stopped',
            startedAt: new Date().toISOString(),
            workingDirectory: '/tmp/adopt-tag',
            exitCode: null,
            claudeSessionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            promptCount: 1,
            tags: ['bug', 'v2'],
          },
        },
      };
      const dir = path.dirname(registryPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(registryPath, JSON.stringify(data, null, 2), 'utf-8');

      await manager.init();

      const adopted = await manager.adoptSession('adopt-tagged');
      expect(adopted.getInfo().tags).toEqual(['bug', 'v2']);
    });
  });
});
