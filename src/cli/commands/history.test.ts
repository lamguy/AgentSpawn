import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerHistoryCommand } from './history.js';
import { SessionState } from '../../types.js';
import type { PromptHistoryEntry } from '../../types.js';
import type { SessionManager } from '../../core/manager.js';
import type { HistoryStore, HistorySearchResult } from '../../core/history.js';

// ── Mock factories ────────────────────────────────────────────────────────────

function createMockHistoryStore(): {
  getBySession: ReturnType<typeof vi.fn>;
  search: ReturnType<typeof vi.fn>;
  record: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
} {
  return {
    getBySession: vi.fn().mockResolvedValue([]),
    search: vi.fn().mockResolvedValue([]),
    record: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockSession(
  state: SessionState = SessionState.Running,
): {
  getState: ReturnType<typeof vi.fn>;
  sendPrompt: ReturnType<typeof vi.fn>;
} {
  return {
    getState: vi.fn().mockReturnValue(state),
    sendPrompt: vi.fn().mockResolvedValue('Mock response'),
  };
}

function createMockManager(): {
  getSession: ReturnType<typeof vi.fn>;
  listSessions: ReturnType<typeof vi.fn>;
} {
  return {
    getSession: vi.fn().mockReturnValue(undefined),
    listSessions: vi.fn().mockReturnValue([]),
  };
}

function makeEntry(overrides: Partial<PromptHistoryEntry> = {}): PromptHistoryEntry {
  return {
    index: 0,
    prompt: 'test prompt',
    responsePreview: 'test response',
    timestamp: '2025-01-15T10:30:00.000Z',
    ...overrides,
  };
}

// ── Test helpers ──────────────────────────────────────────────────────────────

async function runCommand(
  program: Command,
  args: string[],
): Promise<void> {
  // Commander needs the binary name and script name before the actual args
  await program.parseAsync(['node', 'agentspawn', ...args]);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('history command', () => {
  let program: Command;
  let mockManager: ReturnType<typeof createMockManager>;
  let mockHistoryStore: ReturnType<typeof createMockHistoryStore>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let savedExitCode: typeof process.exitCode;

  beforeEach(() => {
    program = new Command();
    program.exitOverride(); // Prevent Commander from calling process.exit
    mockManager = createMockManager();
    mockHistoryStore = createMockHistoryStore();
    registerHistoryCommand(
      program,
      mockManager as unknown as SessionManager,
      mockHistoryStore as unknown as HistoryStore,
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

  describe('history <session>', () => {
    it('should list history for a session', async () => {
      const entries = [
        makeEntry({ index: 1, prompt: 'second prompt' }),
        makeEntry({ index: 0, prompt: 'first prompt' }),
      ];
      mockHistoryStore.getBySession.mockResolvedValue(entries);

      await runCommand(program, ['history', 'my-session']);

      expect(mockHistoryStore.getBySession).toHaveBeenCalledWith('my-session');
      expect(mockHistoryStore.getBySession).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalled();
      // Check that the header mentions the session name
      const allCalls = logSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(allCalls).toContain('my-session');
    });

    it('should show "no history found" when session has no entries', async () => {
      mockHistoryStore.getBySession.mockResolvedValue([]);

      await runCommand(program, ['history', 'empty-session']);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('No history found'),
      );
    });

    it('should respect the --limit option', async () => {
      const allEntries = [
        makeEntry({ index: 0 }),
        makeEntry({ index: 1 }),
        makeEntry({ index: 2 }),
        makeEntry({ index: 3 }),
        makeEntry({ index: 4 }),
      ];
      mockHistoryStore.getBySession.mockResolvedValue(allEntries);

      await runCommand(program, ['history', 'sess', '-l', '5']);

      expect(mockHistoryStore.getBySession).toHaveBeenCalledWith('sess');
      expect(mockHistoryStore.getBySession).toHaveBeenCalledTimes(1);
    });

    it('should show entry count in header', async () => {
      const entries = [makeEntry({ index: 0 })];
      mockHistoryStore.getBySession.mockResolvedValue(entries);

      await runCommand(program, ['history', 'sess']);

      expect(mockHistoryStore.getBySession).toHaveBeenCalledTimes(1);
      const allOutput = logSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(allOutput).toContain('showing 1 of 1');
    });
  });

  describe('history --search <query>', () => {
    it('should search across all sessions when no session is specified', async () => {
      const results: HistorySearchResult[] = [
        {
          ...makeEntry({ prompt: 'fix bug in auth' }),
          sessionName: 'alpha',
        },
      ];
      mockHistoryStore.search.mockResolvedValue(results);

      await runCommand(program, ['history', '--search', 'fix bug']);

      expect(mockHistoryStore.search).toHaveBeenCalledWith('fix bug', {
        sessionName: undefined,
        limit: 20,
      });
      const allOutput = logSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(allOutput).toContain('all sessions');
      expect(allOutput).toContain('1 results');
    });

    it('should search within a specific session when session is specified', async () => {
      const results: HistorySearchResult[] = [
        {
          ...makeEntry({ prompt: 'fix bug in alpha' }),
          sessionName: 'alpha',
        },
      ];
      mockHistoryStore.search.mockResolvedValue(results);

      await runCommand(program, ['history', 'alpha', '--search', 'fix']);

      expect(mockHistoryStore.search).toHaveBeenCalledWith('fix', {
        sessionName: 'alpha',
        limit: 20,
      });
      const allOutput = logSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(allOutput).toContain('session "alpha"');
    });

    it('should show no results message when search finds nothing', async () => {
      mockHistoryStore.search.mockResolvedValue([]);

      await runCommand(program, ['history', '--search', 'nonexistent']);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('No results found'),
      );
    });
  });

  describe('history without session or search', () => {
    it('should show error when neither session nor search is provided', async () => {
      await runCommand(program, ['history']);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Please specify a session name or use --search'),
      );
      expect(process.exitCode).toBe(1);
    });
  });
});

describe('replay command', () => {
  let program: Command;
  let mockManager: ReturnType<typeof createMockManager>;
  let mockHistoryStore: ReturnType<typeof createMockHistoryStore>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let savedExitCode: typeof process.exitCode;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    mockManager = createMockManager();
    mockHistoryStore = createMockHistoryStore();
    registerHistoryCommand(
      program,
      mockManager as unknown as SessionManager,
      mockHistoryStore as unknown as HistoryStore,
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

  it('should replay a prompt from history', async () => {
    const entry = makeEntry({ index: 3, prompt: 'fix the tests' });
    mockHistoryStore.getBySession.mockResolvedValue([entry]);
    const mockSession = createMockSession();
    mockSession.sendPrompt.mockResolvedValue('Tests are fixed!');
    mockManager.getSession.mockReturnValue(mockSession);

    await runCommand(program, ['replay', 'my-session', '3']);

    expect(mockHistoryStore.getBySession).toHaveBeenCalledWith('my-session');
    expect(mockSession.sendPrompt).toHaveBeenCalledWith('fix the tests');
    const allOutput = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allOutput).toContain('Replaying prompt #3');
    expect(allOutput).toContain('Tests are fixed!');
  });

  it('should handle missing session', async () => {
    const entry = makeEntry({ index: 0 });
    mockHistoryStore.getBySession.mockResolvedValue([entry]);
    mockManager.getSession.mockReturnValue(undefined);

    await runCommand(program, ['replay', 'nonexistent', '0']);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Session 'nonexistent' not found"),
    );
    expect(process.exitCode).toBe(1);
  });

  it('should handle missing entry at given index', async () => {
    mockHistoryStore.getBySession.mockResolvedValue([
      makeEntry({ index: 0 }),
    ]);

    await runCommand(program, ['replay', 'sess', '99']);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('not found'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('should error on invalid index (negative)', async () => {
    // Commander interprets `-1` as an option flag, so we use `--` to terminate
    // option parsing and pass -1 as a positional argument.
    await runCommand(program, ['replay', 'sess', '--', '-1']);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('non-negative integer'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('should error on invalid index (non-numeric)', async () => {
    await runCommand(program, ['replay', 'sess', 'abc']);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('non-negative integer'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('should error when session is not running', async () => {
    const entry = makeEntry({ index: 0, prompt: 'test' });
    mockHistoryStore.getBySession.mockResolvedValue([entry]);
    const stoppedSession = createMockSession(SessionState.Stopped);
    mockManager.getSession.mockReturnValue(stoppedSession);

    await runCommand(program, ['replay', 'sess', '0']);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('not running'),
    );
    expect(process.exitCode).toBe(1);
  });
});
