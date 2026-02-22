import { Command } from 'commander';
import path from 'node:path';
import { SessionManager } from '../../core/manager.js';
import { Router } from '../../io/router.js';
import { TemplateManager } from '../../core/template.js';
import { formatStatusLine } from '../../io/formatter.js';
import { SessionAlreadyExistsError, SpawnFailedError, TemplateNotFoundError, SandboxNotAvailableError, SandboxStartError } from '../../utils/errors.js';
import type { RestartPolicy, SandboxLevel } from '../../types.js';

export function registerStartCommand(
  program: Command,
  manager: SessionManager,
  _router: Router,
  templateManager?: TemplateManager,
): void {
  program
    .command('start <name>')
    .description('Start a new agent session')
    .option('-d, --dir <path>', 'Working directory')
    .option('--permission-mode <mode>', 'Permission mode for Claude (bypassPermissions, acceptEdits, default, plan, delegate, dontAsk)')
    .option('-t, --template <name>', 'Use a session template')
    .option('--max-retries <number>', 'Maximum restart attempts (default: 3)', '3')
    .option('--retry-backoff <ms>', 'Initial backoff delay in milliseconds (default: 1000)', '1000')
    .option('--tag <tag>', 'Add a tag to this session (repeatable)', (val: string, acc: string[]) => [...acc, val], [] as string[])
    .option('-S, --sandbox', 'Run session in a sandbox (Docker, bwrap on Linux, or sandbox-exec on macOS)')
    .option('--sandbox-level <level>', 'Isolation level: permissive (default), standard, strict')
    .option('--sandbox-image <image>', 'Custom Docker image for sandbox (e.g. debian@sha256:...)')
    .option('--sandbox-memory <limit>', 'Memory limit for sandbox container (e.g. 512m)')
    .option('--sandbox-cpu <cores>', 'CPU limit for sandbox container (e.g. 0.5)')
    .action(async (name: string, options: { dir?: string; permissionMode?: string; template?: string; maxRetries: string; retryBackoff: string; tag: string[]; sandbox?: boolean; sandboxLevel?: string; sandboxImage?: string; sandboxMemory?: string; sandboxCpu?: string }) => {
      try {
        let workingDirectory = options.dir ? path.resolve(options.dir) : undefined;
        let permissionMode = options.permissionMode;
        let env: Record<string, string> | undefined;
        let templateRestartPolicy: RestartPolicy | undefined;

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
            if (template.restartPolicy) {
              templateRestartPolicy = template.restartPolicy;
            }
            if (!options.sandbox && template.sandboxed) {
              // Template enables sandbox by default; CLI --sandbox overrides
              options.sandbox = template.sandboxed;
            }
            if (!options.sandboxLevel && template.sandboxLevel) {
              options.sandboxLevel = template.sandboxLevel;
            }
            if (!options.sandboxImage && template.sandboxImage) {
              options.sandboxImage = template.sandboxImage;
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

        // Parse retry flags and build restart policy
        const maxRetries = parseInt(options.maxRetries, 10);
        const retryBackoff = parseInt(options.retryBackoff, 10);

        if (isNaN(maxRetries) || maxRetries < 0) {
          console.error('Error: --max-retries must be a non-negative number');
          process.exitCode = 1;
          return;
        }

        if (isNaN(retryBackoff) || retryBackoff < 0) {
          console.error('Error: --retry-backoff must be a non-negative number');
          process.exitCode = 1;
          return;
        }

        if (options.sandboxLevel && !['permissive', 'standard', 'strict'].includes(options.sandboxLevel)) {
          console.error('Error: --sandbox-level must be permissive, standard, or strict');
          process.exitCode = 1;
          return;
        }

        // Build restart policy: merge template defaults with CLI flags
        const restartPolicy: RestartPolicy = {
          enabled: true,
          maxRetries: templateRestartPolicy?.maxRetries ?? maxRetries,
          initialBackoffMs: retryBackoff,
          maxBackoffMs: 30000,
          retryableExitCodes: [1, 137],
          replayPrompt: true,
        };

        const session = await manager.startSession({
          name,
          workingDirectory,
          permissionMode,
          env,
          restartPolicy,
          tags: options.tag.length > 0 ? options.tag : undefined,
          sandboxed: options.sandbox ?? false,
          sandboxLevel: options.sandboxLevel as SandboxLevel | undefined,
          sandboxImage: options.sandboxImage,
          sandboxMemoryLimit: options.sandboxMemory,
          sandboxCpuLimit: options.sandboxCpu ? parseFloat(options.sandboxCpu) : undefined,
        });
        console.log(formatStatusLine(session.getInfo()));
      } catch (e) {
        if (e instanceof SessionAlreadyExistsError || e instanceof SpawnFailedError) {
          console.error(`Error: ${e.message}`);
          process.exitCode = 1;
          return;
        }
        if (e instanceof SandboxNotAvailableError || e instanceof SandboxStartError) {
          console.error(`Error: ${e.message}`);
          process.exitCode = 1;
          return;
        }
        throw e;
      }
    });
}
