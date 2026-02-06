import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { spawn } from 'node:child_process';
import { Session } from './session.js';
import { SessionState, SessionConfig } from '../types.js';
import { SpawnFailedError } from '../utils/errors.js';

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

describe('Session', () => {
  let config: SessionConfig;
  let session: Session;

  beforeEach(() => {
    vi.clearAllMocks();
    config = {
      name: 'test-session',
      workingDirectory: '/tmp/test',
    };
    session = new Session(config);
  });

  it('can be instantiated with a SessionConfig', () => {
    expect(session).toBeInstanceOf(Session);
  });

  it('getState() returns SessionState.Stopped initially', () => {
    expect(session.getState()).toBe(SessionState.Stopped);
  });

  it('start() spawns "claude" with correct cwd and stdio pipe', async () => {
    const mockCp = createMockChildProcess(42);
    mockedSpawn.mockReturnValue(mockCp);

    await session.start();

    expect(mockedSpawn).toHaveBeenCalledWith(
      'claude',
      [],
      expect.objectContaining({
        cwd: '/tmp/test',
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
    );
  });

  it('start() sets state to Running and records PID', async () => {
    const mockCp = createMockChildProcess(9999);
    mockedSpawn.mockReturnValue(mockCp);

    await session.start();

    expect(session.getState()).toBe(SessionState.Running);
    const info = session.getInfo();
    expect(info.pid).toBe(9999);
  });

  it('start() throws SpawnFailedError when pid is undefined', async () => {
    const mockCp = createMockChildProcess(12345);
    mockCp.pid = undefined;
    mockedSpawn.mockReturnValue(mockCp);

    await expect(session.start()).rejects.toThrow(SpawnFailedError);
    await expect(
      new Session(config).start().catch((e: unknown) => {
        mockedSpawn.mockReturnValue(createMockChildProcess(1));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mockedSpawn.mock.results[mockedSpawn.mock.results.length - 1] as any) = undefined;
        const cp2 = createMockChildProcess(1);
        cp2.pid = undefined;
        mockedSpawn.mockReturnValue(cp2);
        throw e;
      }),
    ).rejects.toThrow('process pid is undefined');
  });

  it('unexpected "exit" event transitions to Crashed with exit code', async () => {
    const mockCp = createMockChildProcess(555);
    mockedSpawn.mockReturnValue(mockCp);

    await session.start();
    expect(session.getState()).toBe(SessionState.Running);

    // Simulate unexpected exit
    mockCp.emit('exit', 1);

    expect(session.getState()).toBe(SessionState.Crashed);
    expect(session.getExitCode()).toBe(1);
  });

  it('stop() sends SIGTERM then resolves when process exits', async () => {
    const mockCp = createMockChildProcess(777);
    mockedSpawn.mockReturnValue(mockCp);

    await session.start();
    expect(session.getState()).toBe(SessionState.Running);

    // Mock process.kill so the "is process alive?" probe (signal 0) succeeds
    const originalKill = process.kill;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const killProbe = vi.fn((_pid: number, _signal?: string | number) => true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    process.kill = killProbe as any;

    try {
      await session.stop();

      expect(mockCp.kill).toHaveBeenCalledWith('SIGTERM');
      expect(session.getState()).toBe(SessionState.Stopped);
    } finally {
      process.kill = originalKill;
    }
  });

  it('stop() on already-stopped session is a no-op', async () => {
    // Session was never started, state is Stopped
    await session.stop();
    expect(session.getState()).toBe(SessionState.Stopped);
  });

  it('getHandle() returns streams when running, null when stopped', async () => {
    // Before start, handle is null
    expect(session.getHandle()).toBeNull();

    const mockCp = createMockChildProcess(888);
    mockedSpawn.mockReturnValue(mockCp);

    await session.start();

    const handle = session.getHandle();
    expect(handle).not.toBeNull();
    expect(handle!.stdin).toBeDefined();
    expect(handle!.stdout).toBeDefined();
    expect(handle!.stderr).toBeDefined();
    expect(handle!.childProcess).toBe(mockCp);

    await session.stop();
    expect(session.getHandle()).toBeNull();
  });

  it('getInfo() returns correct shape with real PID and exitCode', async () => {
    const mockCp = createMockChildProcess(4242);
    mockedSpawn.mockReturnValue(mockCp);

    await session.start();
    const info = session.getInfo();

    expect(info).toEqual(
      expect.objectContaining({
        name: 'test-session',
        pid: 4242,
        state: SessionState.Running,
        workingDirectory: '/tmp/test',
        exitCode: null,
      }),
    );
    expect(info.startedAt).toBeInstanceOf(Date);

    // Now simulate a crash and check exitCode
    mockCp.emit('exit', 42);
    const infoAfterCrash = session.getInfo();
    expect(infoAfterCrash.state).toBe(SessionState.Crashed);
    expect(infoAfterCrash.exitCode).toBe(42);
  });

  it('getInfo() returns null startedAt before start()', () => {
    const info = session.getInfo();
    expect(info.startedAt).toBeNull();
  });
});
