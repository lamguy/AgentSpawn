import { EventEmitter } from 'node:events';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import * as pty from '@homebridge/node-pty-prebuilt-multiarch';
import { Session } from './session.js';
import { SessionState, SessionConfig } from '../types.js';
import { SpawnFailedError } from '../utils/errors.js';

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

  it('start() spawns "claude" with PTY and correct cwd', async () => {
    const mockPty = createMockPty(42);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedPtySpawn.mockReturnValue(mockPty as any);

    await session.start();

    expect(mockedPtySpawn).toHaveBeenCalledWith(
      'claude',
      [],
      expect.objectContaining({
        cwd: '/tmp/test',
        cols: expect.any(Number),
        rows: expect.any(Number),
      }),
    );
  });

  it('start() sets state to Running and records PID', async () => {
    const mockPty = createMockPty(9999);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedPtySpawn.mockReturnValue(mockPty as any);

    await session.start();

    expect(session.getState()).toBe(SessionState.Running);
    const info = session.getInfo();
    expect(info.pid).toBe(9999);
  });

  it('start() throws SpawnFailedError when pid is undefined', async () => {
    const mockPty = createMockPty(12345);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockPty as any).pid = undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedPtySpawn.mockReturnValue(mockPty as any);

    await expect(session.start()).rejects.toThrow(SpawnFailedError);
    await expect(
      new Session(config).start().catch((e: unknown) => {
        const pty2 = createMockPty(1);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (pty2 as any).pid = undefined;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockedPtySpawn.mockReturnValue(pty2 as any);
        throw e;
      }),
    ).rejects.toThrow('process pid is undefined');
  });

  it('unexpected "exit" event transitions to Crashed with exit code', async () => {
    const mockPty = createMockPty(555);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedPtySpawn.mockReturnValue(mockPty as any);

    await session.start();
    expect(session.getState()).toBe(SessionState.Running);

    // Simulate unexpected exit
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockPty as any).simulateExit(1);

    // Wait for event to propagate
    await new Promise(resolve => process.nextTick(resolve));

    expect(session.getState()).toBe(SessionState.Crashed);
    expect(session.getExitCode()).toBe(1);
  });

  it('stop() sends SIGTERM then resolves when process exits', async () => {
    const mockPty = createMockPty(777);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedPtySpawn.mockReturnValue(mockPty as any);

    await session.start();
    expect(session.getState()).toBe(SessionState.Running);

    // Mock process.kill so the "is process alive?" probe (signal 0) succeeds
    const originalKill = process.kill;
    const killProbe = vi.fn(() => true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    process.kill = killProbe as any;

    try {
      await session.stop();

      expect(mockPty.kill).toHaveBeenCalledWith('SIGTERM');
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

    const mockPty = createMockPty(888);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedPtySpawn.mockReturnValue(mockPty as any);

    await session.start();

    const handle = session.getHandle();
    expect(handle).not.toBeNull();
    expect(handle!.stdin).toBeDefined();
    expect(handle!.stdout).toBeDefined();
    expect(handle!.stderr).toBeDefined();
    expect(handle!.childProcess).toBeDefined();

    await session.stop();
    expect(session.getHandle()).toBeNull();
  });

  it('getInfo() returns correct shape with real PID and exitCode', async () => {
    const mockPty = createMockPty(4242);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedPtySpawn.mockReturnValue(mockPty as any);

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockPty as any).simulateExit(42);

    // Wait for event to propagate
    await new Promise(resolve => process.nextTick(resolve));

    const infoAfterCrash = session.getInfo();
    expect(infoAfterCrash.state).toBe(SessionState.Crashed);
    expect(infoAfterCrash.exitCode).toBe(42);
  });

  it('getInfo() returns null startedAt before start()', () => {
    const info = session.getInfo();
    expect(info.startedAt).toBeNull();
  });

  it('PTY data is forwarded to stdout stream', async () => {
    const mockPty = createMockPty(999);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedPtySpawn.mockReturnValue(mockPty as any);

    await session.start();
    const handle = session.getHandle();
    expect(handle).not.toBeNull();

    // Listen for data on stdout
    const dataChunks: string[] = [];
    handle!.stdout.on('data', (chunk: Buffer) => {
      dataChunks.push(chunk.toString());
    });

    // Simulate PTY sending data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockPty as any).simulateData('Hello from Claude Code\n');

    // Wait for stream to propagate
    await new Promise(resolve => setImmediate(resolve));

    expect(dataChunks.join('')).toBe('Hello from Claude Code\n');
  });

  it('stdin writes are forwarded to PTY', async () => {
    const mockPty = createMockPty(888);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedPtySpawn.mockReturnValue(mockPty as any);

    await session.start();
    const handle = session.getHandle();
    expect(handle).not.toBeNull();

    // Write to stdin
    handle!.stdin.write('test input\n');

    // Wait for write to propagate
    await new Promise(resolve => setImmediate(resolve));

    expect(mockPty.write).toHaveBeenCalledWith('test input\n');
  });
});
