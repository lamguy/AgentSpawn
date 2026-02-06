import { Command } from 'commander';
import path from 'node:path';
import { SessionManager } from '../../core/manager.js';
import { Router } from '../../io/router.js';
import { formatStatusLine } from '../../io/formatter.js';
import { SessionAlreadyExistsError, SpawnFailedError } from '../../utils/errors.js';

export function registerStartCommand(
  program: Command,
  manager: SessionManager,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _router: Router,
): void {
  program
    .command('start <name>')
    .description('Start a new agent session')
    .option('-d, --dir <path>', 'Working directory', process.cwd())
    .action(async (name: string, options: { dir: string }) => {
      try {
        const workingDirectory = path.resolve(options.dir);
        const session = await manager.startSession({ name, workingDirectory });
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
