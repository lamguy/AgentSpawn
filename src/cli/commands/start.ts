import { Command } from 'commander';
import path from 'node:path';
import { SessionManager } from '../../core/manager.js';
import { Router } from '../../io/router.js';
import { TemplateManager } from '../../core/template.js';
import { formatStatusLine } from '../../io/formatter.js';
import { SessionAlreadyExistsError, SpawnFailedError, TemplateNotFoundError } from '../../utils/errors.js';

export function registerStartCommand(
  program: Command,
  manager: SessionManager,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _router: Router,
  templateManager?: TemplateManager,
): void {
  program
    .command('start <name>')
    .description('Start a new agent session')
    .option('-d, --dir <path>', 'Working directory')
    .option('--permission-mode <mode>', 'Permission mode for Claude (bypassPermissions, acceptEdits, default, plan, delegate, dontAsk)')
    .option('-t, --template <name>', 'Use a session template')
    .action(async (name: string, options: { dir?: string; permissionMode?: string; template?: string }) => {
      try {
        let workingDirectory = options.dir ? path.resolve(options.dir) : undefined;
        let permissionMode = options.permissionMode;
        let env: Record<string, string> | undefined;

        if (options.template) {
          if (!templateManager) {
            console.error('Error: Template support is not available.');
            process.exitCode = 2;
            return;
          }
          try {
            const template = await templateManager.get(options.template);
            // Template values serve as defaults; CLI flags override them
            if (!workingDirectory && template.workingDirectory) {
              workingDirectory = template.workingDirectory;
            }
            if (!permissionMode && template.permissionMode) {
              permissionMode = template.permissionMode;
            }
            if (template.env) {
              env = { ...template.env };
            }
          } catch (e) {
            if (e instanceof TemplateNotFoundError) {
              console.error(`Error: ${e.message}`);
              process.exitCode = 1;
              return;
            }
            throw e;
          }
        }

        // Apply defaults when no template or CLI flag provided
        if (!workingDirectory) {
          workingDirectory = process.cwd();
        }
        if (!permissionMode) {
          permissionMode = 'bypassPermissions';
        }

        const session = await manager.startSession({
          name,
          workingDirectory,
          permissionMode,
          env,
        });
        console.log(formatStatusLine(session.getInfo()));
      } catch (e) {
        if (e instanceof SessionAlreadyExistsError || e instanceof SpawnFailedError) {
          console.error(`Error: ${e.message}`);
          process.exitCode = 1;
          return;
        }
        throw e;
      }
    });
}
