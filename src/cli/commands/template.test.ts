import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerTemplateCommand } from './template.js';
import {
  TemplateAlreadyExistsError,
  TemplateNotFoundError,
} from '../../utils/errors.js';
import type { TemplateManager } from '../../core/template.js';
import type { TemplateEntry } from '../../types.js';

// -- Mock factories ----------------------------------------------------------

function createMockTemplateManager(): {
  create: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
} {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(undefined),
  };
}

function makeTemplate(overrides: Partial<TemplateEntry> = {}): TemplateEntry {
  return {
    name: 'test-template',
    createdAt: '2025-01-15T10:30:00.000Z',
    ...overrides,
  };
}

// -- Test helpers ------------------------------------------------------------

async function runCommand(
  program: Command,
  args: string[],
): Promise<void> {
  await program.parseAsync(['node', 'agentspawn', ...args]);
}

// -- Tests -------------------------------------------------------------------

describe('template command', () => {
  let program: Command;
  let mockManager: ReturnType<typeof createMockTemplateManager>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let savedExitCode: typeof process.exitCode;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    mockManager = createMockTemplateManager();
    registerTemplateCommand(
      program,
      mockManager as unknown as TemplateManager,
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

  describe('template create', () => {
    it('should create a template with name only', async () => {
      await runCommand(program, ['template', 'create', 'my-tpl']);

      expect(mockManager.create).toHaveBeenCalledWith('my-tpl', {
        workingDirectory: undefined,
        permissionMode: undefined,
        systemPrompt: undefined,
        env: undefined,
      });
      expect(logSpy).toHaveBeenCalledWith('Template "my-tpl" created');
    });

    it('should pass --dir option as workingDirectory', async () => {
      await runCommand(program, [
        'template', 'create', 'my-tpl', '-d', '/projects/backend',
      ]);

      expect(mockManager.create).toHaveBeenCalledWith('my-tpl', {
        workingDirectory: '/projects/backend',
        permissionMode: undefined,
        systemPrompt: undefined,
        env: undefined,
      });
    });

    it('should pass --permission-mode option', async () => {
      await runCommand(program, [
        'template', 'create', 'my-tpl', '--permission-mode', 'bypassPermissions',
      ]);

      expect(mockManager.create).toHaveBeenCalledWith('my-tpl', {
        workingDirectory: undefined,
        permissionMode: 'bypassPermissions',
        systemPrompt: undefined,
        env: undefined,
      });
    });

    it('should pass --system-prompt option', async () => {
      await runCommand(program, [
        'template', 'create', 'my-tpl', '--system-prompt', 'Be concise',
      ]);

      expect(mockManager.create).toHaveBeenCalledWith('my-tpl', {
        workingDirectory: undefined,
        permissionMode: undefined,
        systemPrompt: 'Be concise',
        env: undefined,
      });
    });

    it('should parse --env KEY=VALUE pairs into an object', async () => {
      await runCommand(program, [
        'template', 'create', 'my-tpl', '-e', 'NODE_ENV=production', '-e', 'DEBUG=1',
      ]);

      expect(mockManager.create).toHaveBeenCalledWith('my-tpl', {
        workingDirectory: undefined,
        permissionMode: undefined,
        systemPrompt: undefined,
        env: { NODE_ENV: 'production', DEBUG: '1' },
      });
    });

    it('should handle env values that contain equals signs', async () => {
      await runCommand(program, [
        'template', 'create', 'my-tpl', '-e', 'TOKEN=abc=def=ghi',
      ]);

      expect(mockManager.create).toHaveBeenCalledWith('my-tpl', {
        workingDirectory: undefined,
        permissionMode: undefined,
        systemPrompt: undefined,
        env: { TOKEN: 'abc=def=ghi' },
      });
    });

    it('should error on invalid env format (missing =)', async () => {
      await runCommand(program, [
        'template', 'create', 'my-tpl', '-e', 'INVALID_NO_EQUALS',
      ]);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid environment variable format'),
      );
      expect(process.exitCode).toBe(1);
      expect(mockManager.create).not.toHaveBeenCalled();
    });

    it('should handle TemplateAlreadyExistsError', async () => {
      mockManager.create.mockRejectedValue(
        new TemplateAlreadyExistsError('dup'),
      );

      await runCommand(program, ['template', 'create', 'dup']);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Template already exists: dup'),
      );
      expect(process.exitCode).toBe(1);
    });

    it('should pass all options together', async () => {
      await runCommand(program, [
        'template', 'create', 'full',
        '-d', '/work',
        '--permission-mode', 'acceptEdits',
        '--system-prompt', 'You are a coding assistant',
        '-e', 'A=1', '-e', 'B=2',
      ]);

      expect(mockManager.create).toHaveBeenCalledWith('full', {
        workingDirectory: '/work',
        permissionMode: 'acceptEdits',
        systemPrompt: 'You are a coding assistant',
        env: { A: '1', B: '2' },
      });
      expect(logSpy).toHaveBeenCalledWith('Template "full" created');
    });
  });

  describe('template list', () => {
    it('should show message when no templates exist', async () => {
      mockManager.list.mockResolvedValue([]);

      await runCommand(program, ['template', 'list']);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('No templates found'),
      );
    });

    it('should display templates as a table', async () => {
      const templates = [
        makeTemplate({ name: 'alpha', workingDirectory: '/a' }),
        makeTemplate({ name: 'beta', permissionMode: 'default' }),
      ];
      mockManager.list.mockResolvedValue(templates);

      await runCommand(program, ['template', 'list']);

      expect(mockManager.list).toHaveBeenCalledTimes(1);
      // formatTemplateTable is called and its output logged
      const allOutput = logSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(allOutput).toContain('alpha');
      expect(allOutput).toContain('beta');
    });

    it('should output JSON when --json flag is set', async () => {
      const templates = [
        makeTemplate({ name: 'json-tpl', workingDirectory: '/json' }),
      ];
      mockManager.list.mockResolvedValue(templates);

      await runCommand(program, ['template', 'list', '--json']);

      expect(logSpy).toHaveBeenCalledTimes(1);
      const output = logSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);
      expect(parsed).toEqual(templates);
    });
  });

  describe('template show', () => {
    it('should display template details', async () => {
      const template = makeTemplate({
        name: 'detailed',
        workingDirectory: '/projects/detail',
        permissionMode: 'bypassPermissions',
        systemPrompt: 'Be verbose',
        env: { KEY: 'value' },
      });
      mockManager.get.mockResolvedValue(template);

      await runCommand(program, ['template', 'show', 'detailed']);

      expect(mockManager.get).toHaveBeenCalledWith('detailed');
      const allOutput = logSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(allOutput).toContain('Name: detailed');
      expect(allOutput).toContain('Directory: /projects/detail');
      expect(allOutput).toContain('Permission Mode: bypassPermissions');
      expect(allOutput).toContain('System Prompt: Be verbose');
      expect(allOutput).toContain('KEY=value');
      expect(allOutput).toContain('Created:');
    });

    it('should display "--" for undefined optional fields', async () => {
      const template = makeTemplate({ name: 'minimal' });
      mockManager.get.mockResolvedValue(template);

      await runCommand(program, ['template', 'show', 'minimal']);

      const allOutput = logSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(allOutput).toContain('Directory: --');
      expect(allOutput).toContain('Permission Mode: --');
      expect(allOutput).toContain('System Prompt: --');
      expect(allOutput).toContain('Environment: --');
    });

    it('should handle TemplateNotFoundError', async () => {
      mockManager.get.mockRejectedValue(
        new TemplateNotFoundError('missing'),
      );

      await runCommand(program, ['template', 'show', 'missing']);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Template not found: missing'),
      );
      expect(process.exitCode).toBe(1);
    });
  });

  describe('template delete', () => {
    it('should delete a template and confirm', async () => {
      await runCommand(program, ['template', 'delete', 'old-tpl']);

      expect(mockManager.delete).toHaveBeenCalledWith('old-tpl');
      expect(logSpy).toHaveBeenCalledWith('Template "old-tpl" deleted');
    });

    it('should handle TemplateNotFoundError', async () => {
      mockManager.delete.mockRejectedValue(
        new TemplateNotFoundError('gone'),
      );

      await runCommand(program, ['template', 'delete', 'gone']);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Template not found: gone'),
      );
      expect(process.exitCode).toBe(1);
    });
  });
});
