import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerStatsCommand } from './stats.js';
import { SessionState } from '../../types.js';

// Mock the SessionManager
const mockGetSession = vi.fn();
const mockListSessions = vi.fn();

const mockManager = {
  getSession: mockGetSession,
  listSessions: mockListSessions,
} as unknown as import('../../core/manager.js').SessionManager;

function makeProgram(): Command {
  const program = new Command();
  program.exitOverride(); // Prevent Commander from calling process.exit()
  registerStatsCommand(program, mockManager);
  return program;
}

describe('stats command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('prints an error when session is not found', async () => {
    mockListSessions.mockReturnValue([]);
    mockGetSession.mockReturnValue(undefined);

    const program = makeProgram();
    await program.parseAsync(['node', 'agentspawn', 'stats', 'missing-session']);

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Session 'missing-session' not found"));
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it('prints formatted stats when session is in memory', async () => {
    const startedAt = new Date(Date.now() - 60_000); // 1 minute ago

    mockListSessions.mockReturnValue([
      {
        name: 'project-a',
        state: SessionState.Running,
        workingDirectory: '/Users/lam/projects/project-a',
        startedAt,
        promptCount: 5,
        pid: 1234,
        exitCode: null,
      },
    ]);

    const mockMetrics = {
      promptCount: 5,
      avgResponseTimeMs: 3200,
      totalResponseChars: 45230,
      estimatedTokens: 11308,
      uptimeMs: 60_000,
    };

    mockGetSession.mockReturnValue({
      getMetrics: vi.fn().mockReturnValue(mockMetrics),
    });

    const program = makeProgram();
    await program.parseAsync(['node', 'agentspawn', 'stats', 'project-a']);

    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('project-a');
    expect(output).toContain('running');
    expect(output).toContain('5');       // prompt count
    expect(output).toContain('3.2s');    // avg response time
    expect(output).toContain('45,230');  // total chars
    expect(output).toContain('11,308'); // estimated tokens
    expect(output).toContain('/Users/lam/projects/project-a');
  });

  it('prints n/a metrics when session is not in memory', async () => {
    const startedAt = new Date(Date.now() - 30_000);

    mockListSessions.mockReturnValue([
      {
        name: 'stale-session',
        state: SessionState.Stopped,
        workingDirectory: '/tmp/stale',
        startedAt,
        promptCount: 3,
        pid: 0,
        exitCode: null,
      },
    ]);

    mockGetSession.mockReturnValue(undefined);

    const program = makeProgram();
    await program.parseAsync(['node', 'agentspawn', 'stats', 'stale-session']);

    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('stale-session');
    expect(output).toContain('stopped');
    expect(output).toContain('n/a');
  });

  it('outputs JSON when --json flag is used', async () => {
    const startedAt = new Date();

    mockListSessions.mockReturnValue([
      {
        name: 'json-session',
        state: SessionState.Running,
        workingDirectory: '/tmp/json',
        startedAt,
        promptCount: 2,
        pid: 999,
        exitCode: null,
      },
    ]);

    const mockMetrics = {
      promptCount: 2,
      avgResponseTimeMs: 1500,
      totalResponseChars: 200,
      estimatedTokens: 50,
      uptimeMs: 5000,
    };

    mockGetSession.mockReturnValue({
      getMetrics: vi.fn().mockReturnValue(mockMetrics),
    });

    const program = makeProgram();
    await program.parseAsync(['node', 'agentspawn', 'stats', 'json-session', '--json']);

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(parsed.name).toBe('json-session');
    expect(parsed.metrics).toMatchObject(mockMetrics);
  });

  it('shows uptime for sessions not in memory using startedAt from info', async () => {
    const startedAt = new Date(Date.now() - 120_000); // 2 minutes ago

    mockListSessions.mockReturnValue([
      {
        name: 'old-session',
        state: SessionState.Stopped,
        workingDirectory: '/tmp/old',
        startedAt,
        promptCount: 0,
        pid: 0,
        exitCode: null,
      },
    ]);

    mockGetSession.mockReturnValue(undefined);

    const program = makeProgram();
    await program.parseAsync(['node', 'agentspawn', 'stats', 'old-session']);

    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    // Should show 2m uptime (or 1m 59s, depending on timing)
    expect(output).toMatch(/\d+m|\d+s/);
  });
});
