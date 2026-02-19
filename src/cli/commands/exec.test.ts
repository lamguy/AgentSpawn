import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerExecCommand } from './exec.js';
import { SessionState } from '../../types.js';
import type { SessionManager } from '../../core/manager.js';
import type { Router } from '../../io/router.js';
import type { WorkspaceManager } from '../../core/workspace.js';
import type { Session } from '../../core/session.js';
import { WorkspaceNotFoundError } from '../../utils/errors.js';

// -- Mock factories ----------------------------------------------------------

function createMockSession(
  name: string,
  state: SessionState = SessionState.Running,
): { getState: ReturnType<typeof vi.fn>; sendPrompt: ReturnType<typeof vi.fn>; getInfo: ReturnType<typeof vi.fn> } {
  return {
    getState: vi.fn().mockReturnValue(state),
    sendPrompt: vi.fn().mockResolvedValue(`response from ${name}`),
    getInfo: vi.fn().mockReturnValue({
      name,
      pid: 0,
      state,
      startedAt: new Date(),
      workingDirectory: `/tmp/${name}`,
      promptCount: 0,
    }),
  };
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
});
