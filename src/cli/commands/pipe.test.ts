import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerPipeCommand } from './pipe.js';
import { SessionState } from '../../types.js';
import type { SessionManager } from '../../core/manager.js';
import { EventEmitter } from 'node:events';

// -- Mock factories ----------------------------------------------------------

function createMockSession(
  name: string,
  state: SessionState = SessionState.Running,
): EventEmitter & {
  getState: ReturnType<typeof vi.fn>;
  sendPrompt: ReturnType<typeof vi.fn>;
} {
  const emitter = new EventEmitter() as EventEmitter & {
    getState: ReturnType<typeof vi.fn>;
    sendPrompt: ReturnType<typeof vi.fn>;
  };
  emitter.getState = vi.fn().mockReturnValue(state);
  emitter.sendPrompt = vi.fn().mockResolvedValue(`response from ${name}`);
  return emitter;
}

function createMockManager(
  sessions: Record<string, ReturnType<typeof createMockSession>> = {},
): { getSession: ReturnType<typeof vi.fn> } {
  return {
    getSession: vi.fn((name: string) => sessions[name] ?? undefined),
  };
}

async function runCommand(program: Command, args: string[]): Promise<void> {
  await program.parseAsync(['node', 'agentspawn', ...args]);
}

// -- Tests -------------------------------------------------------------------

describe('pipe command', () => {
  let program: Command;
  let mockManager: ReturnType<typeof createMockManager>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let savedExitCode: typeof process.exitCode;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    mockManager = createMockManager();
    registerPipeCommand(program, mockManager as unknown as SessionManager);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    savedExitCode = process.exitCode;
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    process.exitCode = savedExitCode;
  });

  it('should error when from-session is not found', async () => {
    const toSession = createMockSession('to');
    mockManager = createMockManager({ to: toSession });
    program = new Command();
    program.exitOverride();
    registerPipeCommand(program, mockManager as unknown as SessionManager);

    await runCommand(program, ['pipe', 'missing', 'to']);

    expect(errorSpy).toHaveBeenCalledWith("Error: Session 'missing' not found.");
    expect(process.exitCode).toBe(1);
  });

  it('should error when from-session is not running', async () => {
    const fromSession = createMockSession('from', SessionState.Stopped);
    const toSession = createMockSession('to');
    mockManager = createMockManager({ from: fromSession, to: toSession });
    program = new Command();
    program.exitOverride();
    registerPipeCommand(program, mockManager as unknown as SessionManager);

    await runCommand(program, ['pipe', 'from', 'to']);

    expect(errorSpy).toHaveBeenCalledWith("Error: Session 'from' is not running.");
    expect(process.exitCode).toBe(1);
  });

  it('should error when to-session is not found', async () => {
    const fromSession = createMockSession('from');
    mockManager = createMockManager({ from: fromSession });
    program = new Command();
    program.exitOverride();
    registerPipeCommand(program, mockManager as unknown as SessionManager);

    await runCommand(program, ['pipe', 'from', 'missing']);

    expect(errorSpy).toHaveBeenCalledWith("Error: Session 'missing' not found.");
    expect(process.exitCode).toBe(1);
  });

  it('should error when to-session is not running', async () => {
    const fromSession = createMockSession('from');
    const toSession = createMockSession('to', SessionState.Stopped);
    mockManager = createMockManager({ from: fromSession, to: toSession });
    program = new Command();
    program.exitOverride();
    registerPipeCommand(program, mockManager as unknown as SessionManager);

    await runCommand(program, ['pipe', 'from', 'to']);

    expect(errorSpy).toHaveBeenCalledWith("Error: Session 'to' is not running.");
    expect(process.exitCode).toBe(1);
  });

  it('should wait for promptComplete from from-session and send to to-session', async () => {
    const fromSession = createMockSession('from');
    const toSession = createMockSession('to');
    mockManager = createMockManager({ from: fromSession, to: toSession });
    program = new Command();
    program.exitOverride();
    registerPipeCommand(program, mockManager as unknown as SessionManager);

    // Start command — it will register the once() listener then wait
    const commandPromise = runCommand(program, ['pipe', 'from', 'to']);

    // Emit promptComplete on fromSession to trigger the pipe
    setImmediate(() => fromSession.emit('promptComplete', 'the response text'));

    await commandPromise;

    expect(toSession.sendPrompt).toHaveBeenCalledWith('the response text');
    expect(logSpy).toHaveBeenCalledWith('Piping [from] -> [to]');
  });

  it('should set exitCode=1 when promptError fires on from-session', async () => {
    const fromSession = createMockSession('from');
    const toSession = createMockSession('to');
    mockManager = createMockManager({ from: fromSession, to: toSession });
    program = new Command();
    program.exitOverride();
    registerPipeCommand(program, mockManager as unknown as SessionManager);

    const commandPromise = runCommand(program, ['pipe', 'from', 'to']);

    setImmediate(() => fromSession.emit('promptError', new Error('something went wrong')));

    await commandPromise;

    expect(errorSpy).toHaveBeenCalledWith('Error: something went wrong');
    expect(process.exitCode).toBe(1);
    expect(toSession.sendPrompt).not.toHaveBeenCalled();
  });
});
