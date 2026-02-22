import { Command } from 'commander';
import { SessionManager } from '../../core/manager.js';
import { Router } from '../../io/router.js';
import { SessionNotFoundError } from '../../utils/errors.js';

export function registerStopCommand(
  program: Command,
  manager: SessionManager,
   
  _router: Router,
): void {
  program
    .command('stop [name]')
    .description('Stop an agent session')
    .option('--all', 'Stop all sessions')
    .option('--tag <tag>', 'Stop all sessions with this tag (repeatable)', (val: string, acc: string[]) => [...acc, val], [] as string[])
    .action(async (name: string | undefined, options: { all?: boolean; tag: string[] }) => {
      try {
        if (options.all) {
          const count = manager.listSessions().length;
          await manager.stopAll();
          console.log(`Stopped ${count} session(s).`);
          return;
        }
        if (options.tag.length > 0) {
          let total = 0;
          for (const tag of options.tag) {
            total += await manager.stopByTag(tag);
          }
          console.log(`Stopped ${total} session(s).`);
          return;
        }
        if (!name) {
          console.error('Error: Specify a session name, --tag <tag>, or use --all');
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
