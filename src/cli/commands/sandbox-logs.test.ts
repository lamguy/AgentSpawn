import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { SessionState } from '../../types.js';

// ---------------------------------------------------------------------------
// Hoist mock functions so they are available inside vi.mock factories.
// vi.hoisted() runs before any vi.mock factory, making its return value safe
// to reference from within a factory closure.
// ---------------------------------------------------------------------------
const { mockIsPlatformSupported } = vi.hoisted(() => ({
  mockIsPlatformSupported: vi.fn().mockReturnValue(true),
}));

// ---------------------------------------------------------------------------
// Mock SandboxLogWatcher
//
// Because vi.mock factories are hoisted to the top of the module (before any
// imports execute), we must not reference any top-level `const`/`let` that
// is declared after the mock call.  Using vi.hoisted() above solves this.
// ---------------------------------------------------------------------------
vi.mock('../../core/sandbox-log-watcher.js', () => {
  const MockSandboxLogWatcher = vi.fn().mockImplementation(() => ({
    start: vi.fn().mockReturnValue({
      stdout: { pipe: vi.fn() },
      // The implementation awaits child.on('close', ...) in streaming mode.
      // Firing the callback immediately lets the Promise resolve so the test
      // does not hang.
      on: vi.fn().mockImplementation((event: string, cb: () => void) => {
        if (event === 'close') {
          cb();
        }
      }),
    }),
    stop: vi.fn(),
    parseLine: vi.fn().mockReturnValue(null),
  }));

  // Attach isPlatformSupported as a static-style property on the constructor
  // so that the implementation's `SandboxLogWatcher.isPlatformSupported()`
  // call resolves to our controllable mock function.
  (MockSandboxLogWatcher as unknown as Record<string, unknown>).isPlatformSupported =
    mockIsPlatformSupported;

  return { SandboxLogWatcher: MockSandboxLogWatcher };
});

// ---------------------------------------------------------------------------
// Mock node:readline.
//
// The implementation awaits `rl.on('close', resolve)` in historical mode.
// To prevent that test from hanging, fire the callback immediately whenever
// the 'close' event is registered.  For all other events (e.g. 'line') do
// nothing so we don't accidentally trigger line-processing logic.
// ---------------------------------------------------------------------------
vi.mock('node:readline', () => ({
  createInterface: vi.fn().mockReturnValue({
    on: vi.fn().mockImplementation((event: string, cb: () => void) => {
      if (event === 'close') {
        // Resolve the awaited promise immediately so the action completes.
        cb();
      }
      return { on: vi.fn() };
    }),
    // The implementation calls rl.close() after the readline interface is done.
    close: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Module under test (imported after vi.mock hoisting)
// ---------------------------------------------------------------------------
import { SandboxLogWatcher } from '../../core/sandbox-log-watcher.js';
import { registerSandboxCommand } from './sandbox.js';

// ---------------------------------------------------------------------------
// Mock manager
// ---------------------------------------------------------------------------
const mockGetSessionInfo = vi.fn();

const mockManager = {
  getSessionInfo: mockGetSessionInfo,
} as unknown as import('../../core/manager.js').SessionManager;

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function makeProgram(): Command {
  const program = new Command();
  program.exitOverride(); // prevent Commander from calling process.exit()
  registerSandboxCommand(program, mockManager);
  return program;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('sandbox logs subcommand', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: platform is supported; individual tests override as needed.
    mockIsPlatformSupported.mockReturnValue(true);

    // vi.clearAllMocks() wipes mockImplementation set in the vi.mock factory.
    // Re-establish the constructor implementation so each test gets a fresh
    // instance object with properly-typed spy methods.
    vi.mocked(SandboxLogWatcher).mockImplementation(() => ({
      start: vi.fn().mockReturnValue({
        stdout: { pipe: vi.fn() },
        // Immediately fire 'close' so the streaming-mode Promise resolves.
        on: vi.fn().mockImplementation((event: string, cb: () => void) => {
          if (event === 'close') {
            cb();
          }
        }),
      }),
      stop: vi.fn(),
      parseLine: vi.fn().mockReturnValue(null),
    }));

    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Streaming-mode calls process.exit(0) after the child closes.
    // Mock it so the test process is not actually terminated.
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    exitSpy.mockRestore();
    // Prevent exitCode from bleeding between tests
    process.exitCode = 0;
  });

  // -------------------------------------------------------------------------
  // 1. Non-macOS platform
  // -------------------------------------------------------------------------
  it('should print an error and set exitCode when platform is not supported', async () => {
    mockIsPlatformSupported.mockReturnValue(false);

    const program = makeProgram();
    await program.parseAsync(['node', 'agentspawn', 'sandbox', 'logs']);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('sandbox logs requires macOS'),
    );
    expect(process.exitCode).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 2. No session arg, no --past (streaming mode)
  // -------------------------------------------------------------------------
  it('should start streaming mode with no session or --past', async () => {
    const program = makeProgram();
    await program.parseAsync(['node', 'agentspawn', 'sandbox', 'logs']);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Watching sandbox violations'),
    );

    expect(SandboxLogWatcher).toHaveBeenCalledWith(
      expect.objectContaining({ pid: undefined, past: undefined }),
    );

    // mock.results[0].value is the object returned from the constructor call,
    // which is where the start spy lives.
    const mockInstance = vi.mocked(SandboxLogWatcher).mock.results[0]?.value as {
      start: ReturnType<typeof vi.fn>;
    };
    expect(mockInstance.start).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 3. No session arg, with --past 5m (historical mode)
  // -------------------------------------------------------------------------
  it('should print historical mode message and pass past option when --past is given', async () => {
    const program = makeProgram();
    await program.parseAsync([
      'node',
      'agentspawn',
      'sandbox',
      'logs',
      '--past',
      '5m',
    ]);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('last 5m'),
    );

    expect(SandboxLogWatcher).toHaveBeenCalledWith(
      expect.objectContaining({ past: '5m' }),
    );
  });

  // -------------------------------------------------------------------------
  // 4. Session arg, session not found
  // -------------------------------------------------------------------------
  it('should print an error and set exitCode when session is not found', async () => {
    mockGetSessionInfo.mockReturnValue(undefined);

    const program = makeProgram();
    await program.parseAsync([
      'node',
      'agentspawn',
      'sandbox',
      'logs',
      'missing',
    ]);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('missing'),
    );
    expect(process.exitCode).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 5. Session arg, session found with pid > 0
  // -------------------------------------------------------------------------
  it('should pass session PID to SandboxLogWatcher when session is found', async () => {
    mockGetSessionInfo.mockReturnValue({
      name: 'my-session',
      pid: 5678,
      state: SessionState.Running,
      startedAt: new Date(),
      workingDirectory: '/tmp/my-session',
      promptCount: 0,
    });

    const program = makeProgram();
    await program.parseAsync([
      'node',
      'agentspawn',
      'sandbox',
      'logs',
      'my-session',
    ]);

    expect(SandboxLogWatcher).toHaveBeenCalledWith(
      expect.objectContaining({ pid: 5678 }),
    );
  });

  // -------------------------------------------------------------------------
  // 6. Session arg, session found with pid === 0
  // -------------------------------------------------------------------------
  it('should warn and pass pid: undefined to SandboxLogWatcher when session PID is 0', async () => {
    mockGetSessionInfo.mockReturnValue({
      name: 'my-session',
      pid: 0,
      state: SessionState.Running,
      startedAt: new Date(),
      workingDirectory: '/tmp/my-session',
      promptCount: 0,
    });

    const program = makeProgram();
    await program.parseAsync([
      'node',
      'agentspawn',
      'sandbox',
      'logs',
      'my-session',
    ]);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('PID is 0'),
    );

    expect(SandboxLogWatcher).toHaveBeenCalledWith(
      expect.objectContaining({ pid: undefined }),
    );
  });
});
