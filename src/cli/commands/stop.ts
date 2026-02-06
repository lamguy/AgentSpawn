import { Command } from 'commander';
import { SessionManager } from '../../core/manager.js';
import { Router } from '../../io/router.js';
import { SessionNotFoundError } from '../../utils/errors.js';

export function registerStopCommand(
  program: Command,
  manager: SessionManager,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _router: Router,
): void {
  program
    .command('stop [name]')
    .description('Stop an agent session')
    .option('--all', 'Stop all sessions')
    .action(async (name: string | undefined, options: { all?: boolean }) => {
      try {
        if (options.all) {
          const count = manager.listSessions().length;
          await manager.stopAll();
          console.log(`Stopped ${count} session(s).`);
          return;
        }
        if (!name) {
          console.error('Error: Specify a session name or use --all');
          process.exitCode = 1;
          return;
        }
        await manager.stopSession(name);
        console.log(`Stopped session: ${name}`);
      } catch (e) {
        if (e instanceof SessionNotFoundError) {
          console.error(`Error: ${e.message}`);
          process.exitCode = 1;
          return;
        }
        throw e;
      }
    });
}
