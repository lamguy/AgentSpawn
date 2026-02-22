import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { Command } from 'commander';
import { registerExecCommand, resolveSessionRefs } from './exec.js';
import { SessionState } from '../../types.js';
import type { SessionManager } from '../../core/manager.js';
import type { Router } from '../../io/router.js';
import type { WorkspaceManager } from '../../core/workspace.js';
import type { HistoryStore } from '../../core/history.js';
import { WorkspaceNotFoundError } from '../../utils/errors.js';

// -- Mock factories ----------------------------------------------------------

function createMockSession(
  name: string,
  state: SessionState = SessionState.Running,
): EventEmitter & { getState: ReturnType<typeof vi.fn>; sendPrompt: ReturnType<typeof vi.fn>; getInfo: ReturnType<typeof vi.fn> } {
  const emitter = new EventEmitter() as EventEmitter & { getState: ReturnType<typeof vi.fn>; sendPrompt: ReturnType<typeof vi.fn>; getInfo: ReturnType<typeof vi.fn> };
  emitter.getState = vi.fn().mockReturnValue(state);
  emitter.sendPrompt = vi.fn().mockResolvedValue(`response from ${name}`);
  emitter.getInfo = vi.fn().mockReturnValue({
    name,
    pid: 0,
    state,
    startedAt: new Date(),
    workingDirectory: `/tmp/${name}`,
    promptCount: 0,
  });
  return emitter;
}

function createMockManager(sessions: Record<string, ReturnType<typeof createMockSession>> = {}): {
  getSession: ReturnType<typeof vi.fn>;
  listSessions: ReturnType<typeof vi.fn>;
  broadcastPrompt: ReturnType<typeof vi.fn>;
} {
  return {
    getSession: vi.fn((name: string) => sessions[name] ?? undefined),
    listSessions: vi.fn(() =>
      Object.entries(sessions).map(([name, s]) => ({
        name,
        pid: 0,
        state: s.getState(),
        startedAt: new Date(),
        workingDirectory: `/tmp/${name}`,
        promptCount: 0,
      })),
    ),
    broadcastPrompt: vi.fn().mockResolvedValue([]),
  };
}

function createMockRouter(): { getActiveSession: ReturnType<typeof vi.fn> } {
  return {
    getActiveSession: vi.fn().mockReturnValue(undefined),
  };
}

function createMockWorkspaceManager(): {
  getSessionNames: ReturnType<typeof vi.fn>;
} {
  return {
    getSessionNames: vi.fn().mockResolvedValue([]),
  };
}

// -- Test helpers ------------------------------------------------------------

async function runCommand(program: Command, args: string[]): Promise<void> {
  await program.parseAsync(['node', 'agentspawn', ...args]);
}

// -- Tests -------------------------------------------------------------------

describe('exec command', () => {
  let program: Command;
  let mockManager: ReturnType<typeof createMockManager>;
  let mockRouter: ReturnType<typeof createMockRouter>;
  let mockWorkspaceManager: ReturnType<typeof createMockWorkspaceManager>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let savedExitCode: typeof process.exitCode;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    mockManager = createMockManager();
    mockRouter = createMockRouter();
    mockWorkspaceManager = createMockWorkspaceManager();
    registerExecCommand(
      program,
      mockManager as unknown as SessionManager,
      mockRouter as unknown as Router,
      mockWorkspaceManager as unknown as WorkspaceManager,
    );
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    savedExitCode = process.exitCode;
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    process.exitCode = savedExitCode;
  });

  describe('exec --all', () => {
    // NOTE: The command is defined as `exec [name] <command>`, so Commander
    // requires two positional args. When --all is used, the handler
    // concatenates them into a single prompt string. We pass two words
    // (e.g. 'fix' 'bugs') to satisfy Commander's arg requirements.

    it('should broadcast prompt to all running sessions', async () => {
      const sessionA = createMockSession('alpha');
      const sessionB = createMockSession('beta');
      mockManager = createMockManager({ alpha: sessionA, beta: sessionB });
      mockManager.broadcastPrompt.mockResolvedValue([
        { sessionName: 'alpha', status: 'fulfilled', response: 'done-a' },
        { sessionName: 'beta', status: 'fulfilled', response: 'done-b' },
      ]);

      // Re-register with new mockManager
      program = new Command();
      program.exitOverride();
      registerExecCommand(
        program,
        mockManager as unknown as SessionManager,
        mockRouter as unknown as Router,
        mockWorkspaceManager as unknown as WorkspaceManager,
      );

      await runCommand(program, ['exec', '--all', 'fix', 'bugs']);

      expect(mockManager.listSessions).toHaveBeenCalled();
      expect(mockManager.broadcastPrompt).toHaveBeenCalledWith(
        ['alpha', 'beta'],
        'fix bugs',
      );
    });

    it('should error when no running sessions exist', async () => {
      // mockManager has no sessions by default
      await runCommand(program, ['exec', '--all', 'fix', 'bugs']);

      expect(errorSpy).toHaveBeenCalledWith('Error: No running sessions found.');
      expect(process.exitCode).toBe(1);
      expect(mockManager.broadcastPrompt).not.toHaveBeenCalled();
    });

    it('should only broadcast to running sessions, not stopped ones', async () => {
      const running = createMockSession('alive', SessionState.Running);
      const stopped = createMockSession('dead', SessionState.Stopped);
      mockManager = createMockManager({ alive: running, dead: stopped });
      mockManager.broadcastPrompt.mockResolvedValue([
        { sessionName: 'alive', status: 'fulfilled', response: 'ok' },
      ]);

      program = new Command();
      program.exitOverride();
      registerExecCommand(
        program,
        mockManager as unknown as SessionManager,
        mockRouter as unknown as Router,
        mockWorkspaceManager as unknown as WorkspaceManager,
      );

      await runCommand(program, ['exec', '--all', 'say', 'hello']);

      // listSessions returns both, but only running ones should be broadcast to
      const broadcastCall = mockManager.broadcastPrompt.mock.calls[0];
      expect(broadcastCall[0]).toEqual(['alive']);
      expect(broadcastCall[0]).not.toContain('dead');
    });

    it('should set exitCode to 1 when some broadcasts fail', async () => {
      const session = createMockSession('s1');
      mockManager = createMockManager({ s1: session });
      mockManager.broadcastPrompt.mockResolvedValue([
        { sessionName: 's1', status: 'rejected', error: 'timeout' },
      ]);

      program = new Command();
      program.exitOverride();
      registerExecCommand(
        program,
        mockManager as unknown as SessionManager,
        mockRouter as unknown as Router,
        mockWorkspaceManager as unknown as WorkspaceManager,
      );

      await runCommand(program, ['exec', '--all', 'run', 'test']);

      expect(process.exitCode).toBe(1);
    });
  });

  describe('exec --group', () => {
    it('should resolve workspace sessions and broadcast to them', async () => {
      // Create running sessions that are in the workspace
      const wsA = createMockSession('ws-a', SessionState.Running);
      const wsB = createMockSession('ws-b', SessionState.Running);
      mockManager = createMockManager({ 'ws-a': wsA, 'ws-b': wsB });

      // Re-register the command with the updated manager
      program = new Command();
      program.exitOverride();
      registerExecCommand(
        program,
        mockManager as unknown as SessionManager,
        mockRouter as unknown as Router,
        mockWorkspaceManager as unknown as WorkspaceManager,
      );

      mockWorkspaceManager.getSessionNames.mockResolvedValue(['ws-a', 'ws-b']);
      mockManager.broadcastPrompt.mockResolvedValue([
        { sessionName: 'ws-a', status: 'fulfilled', response: 'ok-a' },
        { sessionName: 'ws-b', status: 'fulfilled', response: 'ok-b' },
      ]);

      await runCommand(program, ['exec', '--group', 'my-workspace', 'please', 'deploy']);

      expect(mockWorkspaceManager.getSessionNames).toHaveBeenCalledWith('my-workspace');
      expect(mockManager.broadcastPrompt).toHaveBeenCalledWith(
        ['ws-a', 'ws-b'],
        'please deploy',
      );
    });

    it('should error when workspace has no sessions', async () => {
      mockWorkspaceManager.getSessionNames.mockResolvedValue([]);

      await runCommand(program, ['exec', '--group', 'empty-ws', 'run', 'test']);

      expect(errorSpy).toHaveBeenCalledWith("Error: No running sessions in workspace 'empty-ws'.");
      expect(process.exitCode).toBe(1);
      expect(mockManager.broadcastPrompt).not.toHaveBeenCalled();
    });

    it('should error when workspace does not exist', async () => {
      mockWorkspaceManager.getSessionNames.mockRejectedValue(
        new WorkspaceNotFoundError('missing-ws'),
      );

      await runCommand(program, ['exec', '--group', 'missing-ws', 'run', 'test']);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Workspace not found: missing-ws'),
      );
      expect(process.exitCode).toBe(1);
    });
  });

  describe('--all and --group mutual exclusivity', () => {
    it('should error when both --all and --group are provided', async () => {
      await runCommand(program, ['exec', '--all', '--group', 'ws', 'run', 'test']);

      expect(errorSpy).toHaveBeenCalledWith('Error: --all and --group are mutually exclusive.');
      expect(process.exitCode).toBe(1);
      expect(mockManager.broadcastPrompt).not.toHaveBeenCalled();
    });
  });

  describe('single session exec', () => {
    it('should send prompt to a named session', async () => {
      const session = createMockSession('my-session');
      mockManager = createMockManager({ 'my-session': session });

      program = new Command();
      program.exitOverride();
      registerExecCommand(
        program,
        mockManager as unknown as SessionManager,
        mockRouter as unknown as Router,
        mockWorkspaceManager as unknown as WorkspaceManager,
      );

      await runCommand(program, ['exec', 'my-session', 'run tests']);

      expect(mockManager.getSession).toHaveBeenCalledWith('my-session');
      expect(session.sendPrompt).toHaveBeenCalledWith('run tests');
    });

    it('should error when session not found', async () => {
      await runCommand(program, ['exec', 'ghost', 'hello']);

      expect(errorSpy).toHaveBeenCalledWith("Error: Session 'ghost' not found.");
      expect(process.exitCode).toBe(1);
    });

    it('should error when session is not running', async () => {
      const stoppedSession = createMockSession('stopped', SessionState.Stopped);
      mockManager = createMockManager({ stopped: stoppedSession });

      program = new Command();
      program.exitOverride();
      registerExecCommand(
        program,
        mockManager as unknown as SessionManager,
        mockRouter as unknown as Router,
        mockWorkspaceManager as unknown as WorkspaceManager,
      );

      await runCommand(program, ['exec', 'stopped', 'hello']);

      expect(errorSpy).toHaveBeenCalledWith("Error: Session 'stopped' is not running.");
      expect(process.exitCode).toBe(1);
    });
  });

  describe('--pipe flag', () => {
    let originalIsTTY: boolean | undefined;
    let stdinSpy: ReturnType<typeof vi.spyOn> | null = null;

    beforeEach(() => {
      originalIsTTY = process.stdin.isTTY;
    });

    afterEach(() => {
      // Restore isTTY
      Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
      if (stdinSpy) {
        stdinSpy.mockRestore();
        stdinSpy = null;
      }
    });

    it('should read prompt from stdin when --pipe is set and no command arg is given', async () => {
      const session = createMockSession('my-session');
      mockManager = createMockManager({ 'my-session': session });

      program = new Command();
      program.exitOverride();
      registerExecCommand(
        program,
        mockManager as unknown as SessionManager,
        mockRouter as unknown as Router,
        mockWorkspaceManager as unknown as WorkspaceManager,
      );

      // Simulate non-TTY stdin with piped content
      Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });

      // Mock process.stdin.on to emit data then end
      stdinSpy = vi.spyOn(process.stdin, 'on').mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
        if (event === 'data') {
          handler(Buffer.from('fix the lint errors'));
        }
        if (event === 'end') {
          handler();
        }
        return process.stdin;
      });

      await runCommand(program, ['exec', '--pipe', 'my-session']);

      expect(session.sendPrompt).toHaveBeenCalledWith('fix the lint errors');
    });

    it('should use the command arg over stdin when both are provided', async () => {
      const session = createMockSession('my-session');
      mockManager = createMockManager({ 'my-session': session });

      program = new Command();
      program.exitOverride();
      registerExecCommand(
        program,
        mockManager as unknown as SessionManager,
        mockRouter as unknown as Router,
        mockWorkspaceManager as unknown as WorkspaceManager,
      );

      // Stdin would return something, but command arg takes precedence
      Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
      stdinSpy = vi.spyOn(process.stdin, 'on').mockImplementation(() => process.stdin);

      await runCommand(program, ['exec', '--pipe', 'my-session', 'explicit prompt']);

      // stdin.on should not have been called since command arg was provided
      expect(session.sendPrompt).toHaveBeenCalledWith('explicit prompt');
    });

    it('should error when --pipe is set but stdin is empty', async () => {
      mockManager = createMockManager({});

      program = new Command();
      program.exitOverride();
      registerExecCommand(
        program,
        mockManager as unknown as SessionManager,
        mockRouter as unknown as Router,
        mockWorkspaceManager as unknown as WorkspaceManager,
      );

      // Simulate TTY stdin (nothing piped)
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

      await runCommand(program, ['exec', '--pipe', 'my-session']);

      expect(errorSpy).toHaveBeenCalledWith('Error: Missing required argument <command>.');
      expect(process.exitCode).toBe(1);
    });
  });

  describe('@session-name reference resolution', () => {
    function createMockHistoryStore(
      historyBySession: Record<string, Array<{ index: number; prompt: string; responsePreview: string; timestamp: string }>>,
    ): HistoryStore {
      return {
        getBySession: vi.fn().mockImplementation(async (name: string) => {
          return historyBySession[name] ?? [];
        }),
      } as unknown as HistoryStore;
    }

    it('should replace @session-name with its latest response preview', async () => {
      const historyStore = createMockHistoryStore({
        backend: [
          { index: 0, prompt: 'describe your API', responsePreview: 'GET /users returns a list', timestamp: '2026-01-01T00:00:00Z' },
        ],
      });

      const result = await resolveSessionRefs(
        "Generate TypeScript client from @backend's API spec",
        historyStore,
      );

      expect(result).toBe("Generate TypeScript client from GET /users returns a list's API spec");
    });

    it('should leave @session-name as-is when session has no history', async () => {
      const historyStore = createMockHistoryStore({});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await resolveSessionRefs('use @unknown session', historyStore);

      expect(result).toBe('use @unknown session');
      expect(warnSpy).toHaveBeenCalledWith(
        "Warning: No history found for session '@unknown', leaving reference as-is.",
      );

      warnSpy.mockRestore();
    });

    it('should return prompt unchanged when no @references exist', async () => {
      const historyStore = createMockHistoryStore({});

      const result = await resolveSessionRefs('just a plain prompt', historyStore);

      expect(result).toBe('just a plain prompt');
    });

    it('should resolve multiple @references in one prompt', async () => {
      const historyStore = createMockHistoryStore({
        alpha: [
          { index: 0, prompt: 'q', responsePreview: 'alpha-output', timestamp: '2026-01-01T00:00:00Z' },
        ],
        beta: [
          { index: 0, prompt: 'q', responsePreview: 'beta-output', timestamp: '2026-01-01T00:00:00Z' },
        ],
      });

      const result = await resolveSessionRefs('combine @alpha and @beta', historyStore);

      expect(result).toBe('combine alpha-output and beta-output');
    });

    it('should truncate very long responses to 4000 chars', async () => {
      const longResponse = 'x'.repeat(5000);
      const historyStore = createMockHistoryStore({
        bigSession: [
          { index: 0, prompt: 'q', responsePreview: longResponse, timestamp: '2026-01-01T00:00:00Z' },
        ],
      });

      const result = await resolveSessionRefs('use @bigSession output', historyStore);

      expect(result).toContain('...[truncated]');
      expect(result.length).toBeLessThan('use @bigSession output'.length + 5000);
    });

    it('should use latest (first) history entry when multiple exist', async () => {
      const historyStore = createMockHistoryStore({
        mySession: [
          // getBySession returns most-recent first
          { index: 1, prompt: 'q2', responsePreview: 'latest response', timestamp: '2026-01-02T00:00:00Z' },
          { index: 0, prompt: 'q1', responsePreview: 'older response', timestamp: '2026-01-01T00:00:00Z' },
        ],
      });

      const result = await resolveSessionRefs('context: @mySession', historyStore);

      expect(result).toBe('context: latest response');
    });

    it('should resolve @session-name in exec command before sending prompt', async () => {
      const session = createMockSession('frontend');
      mockManager = createMockManager({ frontend: session });

      const historyStore = createMockHistoryStore({
        backend: [
          { index: 0, prompt: 'q', responsePreview: 'POST /api/users', timestamp: '2026-01-01T00:00:00Z' },
        ],
      });

      program = new Command();
      program.exitOverride();
      registerExecCommand(
        program,
        mockManager as unknown as SessionManager,
        mockRouter as unknown as Router,
        mockWorkspaceManager as unknown as WorkspaceManager,
        historyStore,
      );

      await runCommand(program, ['exec', 'frontend', 'generate client from @backend']);

      expect(session.sendPrompt).toHaveBeenCalledWith('generate client from POST /api/users');
    });
  });

  describe('--format ndjson', () => {
    let stdoutSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      stdoutSpy.mockRestore();
    });

    it('should emit NDJSON chunk and done events', async () => {
      const session = createMockSession('my-session');
      // sendPrompt resolves with the full response
      session.sendPrompt = vi.fn().mockResolvedValue('full response text');

      mockManager = createMockManager({ 'my-session': session });

      program = new Command();
      program.exitOverride();
      registerExecCommand(
        program,
        mockManager as unknown as SessionManager,
        mockRouter as unknown as Router,
        mockWorkspaceManager as unknown as WorkspaceManager,
      );

      await runCommand(program, ['exec', '--format', 'ndjson', 'my-session', 'run tests']);

      // Should emit the done event as NDJSON
      const writtenLines = stdoutSpy.mock.calls.map((c) => c[0] as string);
      const doneLines = writtenLines.filter((l) => l.includes('"type":"done"'));
      expect(doneLines).toHaveLength(1);
      const done = JSON.parse(doneLines[0]);
      expect(done).toEqual({ type: 'done', response: 'full response text', sessionName: 'my-session' });
    });

    it('should emit chunk events for data emitted by session', async () => {
      const session = createMockSession('my-session');
      // Simulate data events being emitted during sendPrompt
      session.sendPrompt = vi.fn().mockImplementation(async () => {
        session.emit('data', 'hello ');
        session.emit('data', 'world');
        return 'hello world';
      });

      mockManager = createMockManager({ 'my-session': session });

      program = new Command();
      program.exitOverride();
      registerExecCommand(
        program,
        mockManager as unknown as SessionManager,
        mockRouter as unknown as Router,
        mockWorkspaceManager as unknown as WorkspaceManager,
      );

      await runCommand(program, ['exec', '--format', 'ndjson', 'my-session', 'run tests']);

      const writtenLines = stdoutSpy.mock.calls.map((c) => c[0] as string);
      const chunkLines = writtenLines.filter((l) => l.includes('"type":"chunk"'));
      expect(chunkLines).toHaveLength(2);
      expect(JSON.parse(chunkLines[0])).toEqual({ type: 'chunk', text: 'hello ' });
      expect(JSON.parse(chunkLines[1])).toEqual({ type: 'chunk', text: 'world' });
    });

    it('should use text format by default', async () => {
      const session = createMockSession('my-session');
      mockManager = createMockManager({ 'my-session': session });

      program = new Command();
      program.exitOverride();
      registerExecCommand(
        program,
        mockManager as unknown as SessionManager,
        mockRouter as unknown as Router,
        mockWorkspaceManager as unknown as WorkspaceManager,
      );

      await runCommand(program, ['exec', 'my-session', 'run tests']);

      // Text format uses console.log, not process.stdout.write
      expect(logSpy).toHaveBeenCalledWith('response from my-session');
      expect(stdoutSpy).not.toHaveBeenCalled();
    });
  });
});
