import { EventEmitter } from 'node:events';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as childProcess from 'node:child_process';
import { Session } from './session.js';
import { SessionState, SessionConfig } from '../types.js';
import { PromptTimeoutError } from '../utils/errors.js';

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

/** Create a stream-json assistant event buffer for mock stdout */
function assistantEvent(text: string): Buffer {
  const event = { type: 'assistant', message: { content: [{ type: 'text', text }] } };
  return Buffer.from(JSON.stringify(event) + '\n');
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

  it('start() sets state to Running without spawning a process', async () => {
    await session.start();

    expect(session.getState()).toBe(SessionState.Running);
    expect(mockedSpawn).not.toHaveBeenCalled();
  });

  it('start() records startedAt and PID', async () => {
    await session.start();

    const info = session.getInfo();
    expect(info.startedAt).toBeInstanceOf(Date);
    expect(info.pid).toBe(0); // Prompt-based: no persistent process
  });

  it('getHandle() always returns null in prompt mode', async () => {
    expect(session.getHandle()).toBeNull();

    await session.start();
    expect(session.getHandle()).toBeNull();
  });

  it('getSessionId() returns a UUID string', () => {
    const id = session.getSessionId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('constructor accepts optional claudeSessionId', () => {
    const knownUUID = '12345678-1234-1234-1234-123456789abc';
    const sessionWithId = new Session(config, 5000, knownUUID);
    expect(sessionWithId.getSessionId()).toBe(knownUUID);
  });

  it('constructor accepts optional promptCount', async () => {
    const mockChild = createMockChild(42);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedSpawn.mockReturnValue(mockChild as any);

    // Create session with promptCount: 5 (simulating 5 prior prompts)
    const sessionWithCount = new Session(config, 5000, undefined, 5);
    await sessionWithCount.start();

    // First prompt should use --resume (not --session-id) because promptCount > 0
    const p = sessionWithCount.sendPrompt('hello');

    const args = mockedSpawn.mock.calls[0][1] as string[];
    expect(args).toContain('--resume');
    expect(args).not.toContain('--session-id');

    mockChild.stdout.emit('data', assistantEvent('response'));
    mockChild.emit('close', 0);
    await p;
  });

  it('isProcessing() returns false when idle', async () => {
    await session.start();
    expect(session.isProcessing()).toBe(false);
  });

  it('sendPrompt() throws when session is not running', async () => {
    await expect(session.sendPrompt('hello')).rejects.toThrow('is not running');
  });

  it('sendPrompt() uses --session-id on first prompt', async () => {
    const mockChild = createMockChild(42);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedSpawn.mockReturnValue(mockChild as any);

    await session.start();

    const promptPromise = session.sendPrompt('hello');

    // Verify spawn was called with --session-id
    expect(mockedSpawn).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining(['--print', '--output-format', 'stream-json', '--verbose', '--session-id']),
      expect.objectContaining({
        cwd: '/tmp/test',
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
    );

    // Verify --session-id has the UUID value
    const args = mockedSpawn.mock.calls[0][1] as string[];
    const sessionIdIndex = args.indexOf('--session-id');
    expect(sessionIdIndex).toBeGreaterThan(-1);
    expect(args[sessionIdIndex + 1]).toBe(session.getSessionId());

    // Verify prompt was written to stdin
    expect(mockChild.stdin.write).toHaveBeenCalledWith('hello');
    expect(mockChild.stdin.end).toHaveBeenCalled();

    // Simulate response (stream-json format)
    mockChild.stdout.emit('data', assistantEvent('world'));
    mockChild.emit('close', 0);

    const result = await promptPromise;
    expect(result).toBe('world');
  });

  it('sendPrompt() uses --resume on subsequent prompts', async () => {
    const mockChild1 = createMockChild(42);
    const mockChild2 = createMockChild(43);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedSpawn.mockReturnValueOnce(mockChild1 as any).mockReturnValueOnce(mockChild2 as any);

    await session.start();

    // First prompt
    const p1 = session.sendPrompt('first');
    mockChild1.stdout.emit('data', assistantEvent('response1'));
    mockChild1.emit('close', 0);
    await p1;

    // Second prompt
    const p2 = session.sendPrompt('second');

    // Verify spawn was called with --resume
    const args = mockedSpawn.mock.calls[1][1] as string[];
    expect(args).toContain('--resume');
    expect(args).not.toContain('--session-id');
    const resumeIndex = args.indexOf('--resume');
    expect(args[resumeIndex + 1]).toBe(session.getSessionId());

    mockChild2.stdout.emit('data', assistantEvent('response2'));
    mockChild2.emit('close', 0);

    const result = await p2;
    expect(result).toBe('response2');
  });

  it('sendPrompt() emits promptStart, data, and promptComplete events', async () => {
    const mockChild = createMockChild(42);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedSpawn.mockReturnValue(mockChild as any);

    await session.start();

    const events: string[] = [];
    session.on('promptStart', () => events.push('promptStart'));
    session.on('data', () => events.push('data'));
    session.on('promptComplete', () => events.push('promptComplete'));

    const p = session.sendPrompt('test');

    mockChild.stdout.emit('data', assistantEvent('chunk1'));
    mockChild.stdout.emit('data', assistantEvent('chunk2'));
    mockChild.emit('close', 0);

    await p;

    expect(events).toEqual(['promptStart', 'data', 'data', 'promptComplete']);
  });

  it('sendPrompt() rejects and emits promptError on non-zero exit', async () => {
    const mockChild = createMockChild(42);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedSpawn.mockReturnValue(mockChild as any);

    await session.start();

    const errorHandler = vi.fn();
    session.on('promptError', errorHandler);

    const p = session.sendPrompt('bad');
    mockChild.emit('close', 1);

    await expect(p).rejects.toThrow('Claude exited with code 1');
    expect(errorHandler).toHaveBeenCalledTimes(1);
  });

  it('sendPrompt() rejects and emits promptError on spawn error', async () => {
    const mockChild = createMockChild(42);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedSpawn.mockReturnValue(mockChild as any);

    await session.start();

    const errorHandler = vi.fn();
    session.on('promptError', errorHandler);

    const p = session.sendPrompt('bad');
    mockChild.emit('error', new Error('spawn ENOENT'));

    await expect(p).rejects.toThrow('spawn ENOENT');
    expect(errorHandler).toHaveBeenCalledTimes(1);
  });

  it('sendPrompt() throws if already processing a prompt', async () => {
    const mockChild = createMockChild(42);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedSpawn.mockReturnValue(mockChild as any);

    await session.start();

    // Start first prompt (don't resolve it)
    session.sendPrompt('first');

    expect(session.isProcessing()).toBe(true);

    await expect(session.sendPrompt('second')).rejects.toThrow('already processing');

    // Clean up: resolve the first prompt
    mockChild.emit('close', 0);
  });

  it('sendPrompt() streams data chunks via data event', async () => {
    const mockChild = createMockChild(42);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedSpawn.mockReturnValue(mockChild as any);

    await session.start();

    const chunks: string[] = [];
    session.on('data', (chunk: string) => chunks.push(chunk));

    const p = session.sendPrompt('hello');

    mockChild.stdout.emit('data', assistantEvent('Hello'));
    mockChild.stdout.emit('data', assistantEvent(' World'));
    mockChild.emit('close', 0);

    const result = await p;
    expect(result).toBe('Hello World');
    expect(chunks).toEqual(['Hello', ' World']);
  });

  it('stop() is a no-op when already stopped', async () => {
    await session.stop();
    expect(session.getState()).toBe(SessionState.Stopped);
  });

  it('stop() sets state to Stopped', async () => {
    await session.start();
    expect(session.getState()).toBe(SessionState.Running);

    await session.stop();
    expect(session.getState()).toBe(SessionState.Stopped);
  });

  it('stop() kills active process if one is running', async () => {
    const mockChild = createMockChild(42);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedSpawn.mockReturnValue(mockChild as any);

    await session.start();

    // Start a prompt (don't resolve it)
    session.sendPrompt('long prompt').catch(() => {});

    expect(session.isProcessing()).toBe(true);

    await session.stop();

    expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');
    expect(session.getState()).toBe(SessionState.Stopped);
  });

  it('getInfo() returns correct shape', async () => {
    await session.start();
    const info = session.getInfo();

    expect(info).toEqual(
      expect.objectContaining({
        name: 'test-session',
        pid: 0,
        state: SessionState.Running,
        workingDirectory: '/tmp/test',
        exitCode: null,
      }),
    );
    expect(info.startedAt).toBeInstanceOf(Date);
  });

  it('getInfo() returns null startedAt before start()', () => {
    const info = session.getInfo();
    expect(info.startedAt).toBeNull();
  });

  it('stderr data is emitted via stderr event', async () => {
    const mockChild = createMockChild(42);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedSpawn.mockReturnValue(mockChild as any);

    await session.start();

    const stderrChunks: string[] = [];
    session.on('stderr', (chunk: string) => stderrChunks.push(chunk));

    const p = session.sendPrompt('hello');

    mockChild.stderr.emit('data', Buffer.from('warning'));
    mockChild.stdout.emit('data', assistantEvent('ok'));
    mockChild.emit('close', 0);

    await p;

    expect(stderrChunks).toEqual(['warning']);
  });

  it('env from config is passed to spawned process', async () => {
    const configWithEnv: SessionConfig = {
      name: 'env-session',
      workingDirectory: '/tmp/env',
      env: { MY_VAR: 'hello' },
    };
    const envSession = new Session(configWithEnv);
    await envSession.start();

    const mockChild = createMockChild(42);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedSpawn.mockReturnValue(mockChild as any);

    const p = envSession.sendPrompt('test');

    expect(mockedSpawn).toHaveBeenCalledWith(
      'claude',
      expect.any(Array),
      expect.objectContaining({
        env: expect.objectContaining({ MY_VAR: 'hello' }),
      }),
    );

    mockChild.emit('close', 0);
    await p;
  });

  it('sendPrompt() includes --permission-mode in spawn args when set', async () => {
    const configWithPermission: SessionConfig = {
      name: 'perm-session',
      workingDirectory: '/tmp/perm',
      permissionMode: 'acceptEdits',
    };
    const permSession = new Session(configWithPermission);
    await permSession.start();

    const mockChild = createMockChild(42);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedSpawn.mockReturnValue(mockChild as any);

    const p = permSession.sendPrompt('test');

    // Verify spawn was called with --permission-mode
    const args = mockedSpawn.mock.calls[0][1] as string[];
    expect(args).toContain('--permission-mode');
    const permModeIndex = args.indexOf('--permission-mode');
    expect(args[permModeIndex + 1]).toBe('acceptEdits');

    mockChild.emit('close', 0);
    await p;
  });

  it('sendPrompt() omits --permission-mode when not set', async () => {
    const mockChild = createMockChild(42);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedSpawn.mockReturnValue(mockChild as any);

    await session.start();

    const p = session.sendPrompt('test');

    // Verify spawn was called without --permission-mode
    const args = mockedSpawn.mock.calls[0][1] as string[];
    expect(args).not.toContain('--permission-mode');

    mockChild.emit('close', 0);
    await p;
  });

  it('getInfo() includes permissionMode', async () => {
    const configWithPermission: SessionConfig = {
      name: 'perm-session',
      workingDirectory: '/tmp/perm',
      permissionMode: 'bypassPermissions',
    };
    const permSession = new Session(configWithPermission);
    await permSession.start();

    const info = permSession.getInfo();
    expect(info.permissionMode).toBe('bypassPermissions');
  });

  describe('prompt timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should reject with PromptTimeoutError after timeout elapses', async () => {
      const timeoutConfig: SessionConfig = {
        name: 'timeout-session',
        workingDirectory: '/tmp/timeout',
        promptTimeoutMs: 1000,
      };
      const timeoutSession = new Session(timeoutConfig);
      await timeoutSession.start();

      const mockChild = createMockChild(42);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockedSpawn.mockReturnValue(mockChild as any);

      const p = timeoutSession.sendPrompt('slow prompt');

      // Advance past the timeout
      vi.advanceTimersByTime(1000);

      // Simulate the child exiting after SIGTERM
      mockChild.emit('close', null);

      await expect(p).rejects.toThrow(PromptTimeoutError);
      await expect(p).rejects.toThrow('Prompt timed out after 1000ms');
    });

    it('should emit promptTimeout event with correct data shape before rejection', async () => {
      const timeoutConfig: SessionConfig = {
        name: 'timeout-session',
        workingDirectory: '/tmp/timeout',
        promptTimeoutMs: 2000,
      };
      const timeoutSession = new Session(timeoutConfig);
      await timeoutSession.start();

      const mockChild = createMockChild(42);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockedSpawn.mockReturnValue(mockChild as any);

      const timeoutHandler = vi.fn();
      timeoutSession.on('promptTimeout', timeoutHandler);

      const p = timeoutSession.sendPrompt('my prompt');

      // Emit some partial data before timeout
      mockChild.stdout.emit('data', assistantEvent('partial'));

      vi.advanceTimersByTime(2000);
      mockChild.emit('close', null);

      await expect(p).rejects.toThrow(PromptTimeoutError);

      expect(timeoutHandler).toHaveBeenCalledTimes(1);
      expect(timeoutHandler).toHaveBeenCalledWith({
        sessionName: 'timeout-session',
        timeoutMs: 2000,
        promptText: 'my prompt',
        partialResponse: 'partial',
      });
    });

    it('should send SIGTERM to child process on timeout', async () => {
      const timeoutConfig: SessionConfig = {
        name: 'timeout-session',
        workingDirectory: '/tmp/timeout',
        promptTimeoutMs: 500,
      };
      const timeoutSession = new Session(timeoutConfig);
      await timeoutSession.start();

      const mockChild = createMockChild(42);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockedSpawn.mockReturnValue(mockChild as any);

      const p = timeoutSession.sendPrompt('test');

      vi.advanceTimersByTime(500);

      expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');

      mockChild.emit('close', null);
      await p.catch(() => {}); // Consume rejection
    });

    it('should clear timeout timer on normal completion (no leak)', async () => {
      const timeoutConfig: SessionConfig = {
        name: 'timeout-session',
        workingDirectory: '/tmp/timeout',
        promptTimeoutMs: 5000,
      };
      const timeoutSession = new Session(timeoutConfig);
      await timeoutSession.start();

      const mockChild = createMockChild(42);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockedSpawn.mockReturnValue(mockChild as any);

      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      const p = timeoutSession.sendPrompt('fast prompt');

      // Complete normally before timeout
      mockChild.stdout.emit('data', assistantEvent('done'));
      mockChild.emit('close', 0);

      await p;

      // clearTimeout should have been called by settle()
      expect(clearTimeoutSpy).toHaveBeenCalled();

      // Advance timers past original timeout — no timeout should fire
      vi.advanceTimersByTime(10000);

      clearTimeoutSpy.mockRestore();
    });

    it('should apply default timeout of 300000ms when promptTimeoutMs is not set', async () => {
      // config without promptTimeoutMs — default should be 300000
      await session.start();

      const mockChild = createMockChild(42);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockedSpawn.mockReturnValue(mockChild as any);

      const timeoutHandler = vi.fn();
      session.on('promptTimeout', timeoutHandler);

      const p = session.sendPrompt('default timeout');

      // Advance just under the default — should NOT have timed out
      vi.advanceTimersByTime(299999);
      expect(mockChild.kill).not.toHaveBeenCalled();

      // Advance past the default
      vi.advanceTimersByTime(1);
      expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');

      mockChild.emit('close', null);
      await expect(p).rejects.toThrow(PromptTimeoutError);

      expect(timeoutHandler).toHaveBeenCalledWith(
        expect.objectContaining({ timeoutMs: 300000 }),
      );
    });

    it('should disable timeout when promptTimeoutMs is 0', async () => {
      const noTimeoutConfig: SessionConfig = {
        name: 'no-timeout-session',
        workingDirectory: '/tmp/no-timeout',
        promptTimeoutMs: 0,
      };
      const noTimeoutSession = new Session(noTimeoutConfig);
      await noTimeoutSession.start();

      const mockChild = createMockChild(42);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockedSpawn.mockReturnValue(mockChild as any);

      const p = noTimeoutSession.sendPrompt('no timeout prompt');

      // Advance a very long time — should NOT trigger timeout
      vi.advanceTimersByTime(600000);
      expect(mockChild.kill).not.toHaveBeenCalled();

      // Complete normally
      mockChild.stdout.emit('data', assistantEvent('response'));
      mockChild.emit('close', 0);

      const result = await p;
      expect(result).toBe('response');
    });

    it('should not double-resolve when close and timeout race', async () => {
      const timeoutConfig: SessionConfig = {
        name: 'race-session',
        workingDirectory: '/tmp/race',
        promptTimeoutMs: 1000,
      };
      const raceSession = new Session(timeoutConfig);
      await raceSession.start();

      const mockChild = createMockChild(42);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockedSpawn.mockReturnValue(mockChild as any);

      const p = raceSession.sendPrompt('race prompt');

      // Complete normally first (before timeout fires)
      mockChild.stdout.emit('data', assistantEvent('done'));
      mockChild.emit('close', 0);

      const result = await p;
      expect(result).toBe('done');

      // Now advance past the timeout — the settled guard should prevent
      // any further action (no SIGTERM, no PromptTimeoutError)
      vi.advanceTimersByTime(1000);
      expect(mockChild.kill).not.toHaveBeenCalled();
    });
  });
});
