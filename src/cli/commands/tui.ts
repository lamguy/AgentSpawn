import { Command } from 'commander';
import { SessionManager } from '../../core/manager.js';
import { Router } from '../../io/router.js';
import { launchTUI } from '../../tui/index.js';

export function registerTUICommand(
  program: Command,
  manager: SessionManager,
  router: Router,
): void {
  program
    .command('tui')
    .description('Launch interactive terminal UI for managing sessions')
    .option('-s, --session <name>', 'Initially select a specific session')
    .action(async (options: { session?: string }) => {
      try {
        // Launch the TUI with optional initial session
        const tui = launchTUI(manager, router, {
          initialSession: options.session,
        });

        // Handle process signals for graceful shutdown
        const shutdown = (): void => {
          tui.stop();
          process.exit(0);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

        // Handle unexpected errors
        process.on('uncaughtException', (error: Error) => {
          tui.stop();
          console.error('Fatal error:', error.message);
          process.exit(2);
        });

        process.on('unhandledRejection', (reason: unknown) => {
          tui.stop();
          console.error('Unhandled rejection:', reason);
          process.exit(2);
        });
      } catch (e) {
        console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
        process.exitCode = 2;
      }
    });
}
