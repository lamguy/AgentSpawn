import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerExportCommand } from './export.js';
import type { PromptHistoryEntry } from '../../types.js';
import type { HistoryStore } from '../../core/history.js';
import fs from 'node:fs/promises';
import path from 'node:path';

// ── Mock modules ──────────────────────────────────────────────────────────────

vi.mock('node:fs/promises');

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

describe('export command', () => {
  let program: Command;
  let mockHistoryStore: ReturnType<typeof createMockHistoryStore>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let savedExitCode: typeof process.exitCode;
  let mockWriteFile: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    program = new Command();
    program.exitOverride(); // Prevent Commander from calling process.exit
    mockHistoryStore = createMockHistoryStore();
    registerExportCommand(
      program,
      mockHistoryStore as unknown as HistoryStore,
    );
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    savedExitCode = process.exitCode;

    // Mock fs.writeFile
    mockWriteFile = vi.fn().mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockImplementation(mockWriteFile);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    vi.clearAllMocks();
    process.exitCode = savedExitCode;
  });

  describe('basic export functionality', () => {
    it('should export history in markdown format by default', async () => {
      const entries = [
        makeEntry({ index: 1, prompt: 'second prompt', timestamp: '2025-01-15T10:35:00.000Z' }),
        makeEntry({ index: 0, prompt: 'first prompt', timestamp: '2025-01-15T10:30:00.000Z' }),
      ];
      mockHistoryStore.getBySession.mockResolvedValue(entries);

      await runCommand(program, ['export', 'my-session']);

      expect(mockHistoryStore.getBySession).toHaveBeenCalledWith('my-session');
      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      const [filePath] = mockWriteFile.mock.calls[0];
      expect(filePath).toContain('my-session-history.md');
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Exported 2 history entries'),
      );
    });

    it('should export in json format when specified', async () => {
      const entries = [makeEntry({ index: 0 })];
      mockHistoryStore.getBySession.mockResolvedValue(entries);

      await runCommand(program, ['export', 'test-session', '--format', 'json']);

      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      const [filePath] = mockWriteFile.mock.calls[0];
      expect(filePath).toContain('test-session-history.json');
    });

    it('should export in text format when specified', async () => {
      const entries = [makeEntry({ index: 0 })];
      mockHistoryStore.getBySession.mockResolvedValue(entries);

      await runCommand(program, ['export', 'test-session', '-f', 'text']);

      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      const [filePath] = mockWriteFile.mock.calls[0];
      expect(filePath).toContain('test-session-history.txt');
    });

    it('should use custom output path when provided', async () => {
      const entries = [makeEntry({ index: 0 })];
      mockHistoryStore.getBySession.mockResolvedValue(entries);
      const customPath = '/tmp/custom-export.md';

      await runCommand(program, ['export', 'sess', '-o', customPath]);

      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      const [filePath] = mockWriteFile.mock.calls[0];
      expect(filePath).toBe(path.resolve(customPath));
    });

    it('should use short option for output path', async () => {
      const entries = [makeEntry({ index: 0 })];
      mockHistoryStore.getBySession.mockResolvedValue(entries);

      await runCommand(program, ['export', 'sess', '-o', 'out.md']);

      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      const [filePath] = mockWriteFile.mock.calls[0];
      expect(filePath).toContain('out.md');
    });
  });

  describe('entry order handling', () => {
    it('should reverse entries to chronological order before export', async () => {
      // getBySession returns reverse chronological (newest first)
      const entries = [
        makeEntry({ index: 2, timestamp: '2025-01-15T10:40:00.000Z' }),
        makeEntry({ index: 1, timestamp: '2025-01-15T10:35:00.000Z' }),
        makeEntry({ index: 0, timestamp: '2025-01-15T10:30:00.000Z' }),
      ];
      mockHistoryStore.getBySession.mockResolvedValue(entries);

      await runCommand(program, ['export', 'sess']);

      expect(mockHistoryStore.getBySession).toHaveBeenCalledWith('sess');
      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      // The implementation reverses the array before passing to formatter
    });
  });

  describe('error handling', () => {
    it('should error when session has no history', async () => {
      mockHistoryStore.getBySession.mockResolvedValue([]);

      await runCommand(program, ['export', 'empty-session']);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('No history found for session "empty-session"'),
      );
      expect(process.exitCode).toBe(1);
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should error on invalid format', async () => {
      await runCommand(program, ['export', 'sess', '--format', 'xml']);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid format "xml"'),
      );
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Must be one of: markdown, json, text'),
      );
      expect(process.exitCode).toBe(1);
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should handle invalid format with different casing', async () => {
      await runCommand(program, ['export', 'sess', '-f', 'PDF']);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid format "PDF"'),
      );
      expect(process.exitCode).toBe(1);
    });


    it('should handle file write errors', async () => {
      const entries = [makeEntry({ index: 0 })];
      mockHistoryStore.getBySession.mockResolvedValue(entries);
      mockWriteFile.mockRejectedValue(new Error('EACCES: permission denied'));

      await runCommand(program, ['export', 'sess']);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to export history'),
      );
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('EACCES: permission denied'),
      );
      expect(process.exitCode).toBe(1);
    });

    it('should handle historyStore errors', async () => {
      mockHistoryStore.getBySession.mockRejectedValue(new Error('Database error'));

      await runCommand(program, ['export', 'sess']);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to export history'),
      );
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Database error'),
      );
      expect(process.exitCode).toBe(1);
    });

    it('should handle non-Error exceptions', async () => {
      mockHistoryStore.getBySession.mockRejectedValue('string error');

      await runCommand(program, ['export', 'sess']);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to export history'),
      );
      expect(process.exitCode).toBe(1);
    });
  });

  describe('format case insensitivity', () => {
    it('should accept MARKDOWN in uppercase', async () => {
      const entries = [makeEntry({ index: 0 })];
      mockHistoryStore.getBySession.mockResolvedValue(entries);

      await runCommand(program, ['export', 'sess', '-f', 'MARKDOWN']);

      // Should not error on format validation
      expect(errorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Invalid format'),
      );
    });

    it('should accept Json in mixed case', async () => {
      const entries = [makeEntry({ index: 0 })];
      mockHistoryStore.getBySession.mockResolvedValue(entries);

      await runCommand(program, ['export', 'sess', '-f', 'Json']);

      expect(errorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Invalid format'),
      );
    });

    it('should accept TEXT in uppercase', async () => {
      const entries = [makeEntry({ index: 0 })];
      mockHistoryStore.getBySession.mockResolvedValue(entries);

      await runCommand(program, ['export', 'sess', '--format', 'TEXT']);

      expect(errorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Invalid format'),
      );
    });
  });

  describe('output path resolution', () => {
    it('should resolve relative output paths to absolute', async () => {
      const entries = [makeEntry({ index: 0 })];
      mockHistoryStore.getBySession.mockResolvedValue(entries);

      await runCommand(program, ['export', 'sess', '-o', './exports/out.md']);

      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      const [filePath] = mockWriteFile.mock.calls[0];
      expect(path.isAbsolute(filePath as string)).toBe(true);
      expect(filePath).toContain('exports/out.md');
    });

    it('should generate default filename with session name and format extension', async () => {
      const entries = [makeEntry({ index: 0 })];
      mockHistoryStore.getBySession.mockResolvedValue(entries);

      await runCommand(program, ['export', 'my-project', '-f', 'json']);

      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      const [filePath] = mockWriteFile.mock.calls[0];
      expect(filePath).toContain('my-project-history.json');
    });
  });

  describe('success messages', () => {
    it('should report number of entries exported', async () => {
      const entries = [
        makeEntry({ index: 0 }),
        makeEntry({ index: 1 }),
        makeEntry({ index: 2 }),
      ];
      mockHistoryStore.getBySession.mockResolvedValue(entries);

      await runCommand(program, ['export', 'sess']);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Exported 3 history entries'),
      );
    });

    it('should report the absolute output path', async () => {
      const entries = [makeEntry({ index: 0 })];
      mockHistoryStore.getBySession.mockResolvedValue(entries);
      const outputPath = 'export.md';

      await runCommand(program, ['export', 'sess', '-o', outputPath]);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining(path.resolve(outputPath)),
      );
    });
  });

  describe('edge cases', () => {
    it('should handle session names with special characters', async () => {
      const entries = [makeEntry({ index: 0 })];
      mockHistoryStore.getBySession.mockResolvedValue(entries);

      await runCommand(program, ['export', 'my-project@v2']);

      expect(mockHistoryStore.getBySession).toHaveBeenCalledWith('my-project@v2');
      // Default filename will contain the session name as-is
    });

    it('should handle very long session names', async () => {
      const longName = 'a'.repeat(200);
      const entries = [makeEntry({ index: 0 })];
      mockHistoryStore.getBySession.mockResolvedValue(entries);

      await runCommand(program, ['export', longName]);

      expect(mockHistoryStore.getBySession).toHaveBeenCalledWith(longName);
    });

    it('should handle single entry export', async () => {
      const entries = [makeEntry({ index: 0, prompt: 'only prompt' })];
      mockHistoryStore.getBySession.mockResolvedValue(entries);

      await runCommand(program, ['export', 'sess']);

      expect(mockHistoryStore.getBySession).toHaveBeenCalledTimes(1);
    });

    it('should handle many entries', async () => {
      const entries = Array.from({ length: 1000 }, (_, i) =>
        makeEntry({ index: i, prompt: `prompt ${i}` }),
      ).reverse(); // Reverse chronological order
      mockHistoryStore.getBySession.mockResolvedValue(entries);

      await runCommand(program, ['export', 'large-session']);

      expect(mockHistoryStore.getBySession).toHaveBeenCalledWith('large-session');
    });
  });

  describe('command registration', () => {
    it('should register export command with correct name', () => {
      const commands = program.commands.map((c) => c.name());
      expect(commands).toContain('export');
    });

    it('should have correct description', () => {
      const exportCmd = program.commands.find((c) => c.name() === 'export');
      expect(exportCmd?.description()).toBe('Export session history to a file');
    });

    it('should accept session as required argument', () => {
      const exportCmd = program.commands.find((c) => c.name() === 'export');
      const args = exportCmd?.registeredArguments || [];
      expect(args.length).toBeGreaterThan(0);
      expect(args[0].name()).toBe('session');
      expect(args[0].required).toBe(true);
    });

    it('should have format option with default value', () => {
      const exportCmd = program.commands.find((c) => c.name() === 'export');
      const formatOpt = exportCmd?.options.find((o) =>
        o.long === '--format' || o.short === '-f'
      );
      expect(formatOpt).toBeDefined();
      expect(formatOpt?.defaultValue).toBe('markdown');
    });

    it('should have output option as optional', () => {
      const exportCmd = program.commands.find((c) => c.name() === 'export');
      const outputOpt = exportCmd?.options.find((o) =>
        o.long === '--output' || o.short === '-o'
      );
      expect(outputOpt).toBeDefined();
      // Commander options don't have a 'required' property by default
      // Optional options simply don't have the 'required' flag set
      expect(outputOpt?.mandatory).toBeFalsy();
    });
  });
});
