import { Command } from 'commander';
import { SessionManager } from '../../core/manager.js';
import { Router } from '../../io/router.js';
import { formatSessionTable } from '../../io/formatter.js';

export function registerListCommand(
  program: Command,
  manager: SessionManager,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _router: Router,
): void {
  program
    .command('list')
    .description('List agent sessions')
    .option('--json', 'Output as JSON')
    .action((options: { json?: boolean }) => {
      const sessions = manager.listSessions();
      if (options.json) {
        console.log(JSON.stringify(sessions, null, 2));
        return;
      }
      console.log(formatSessionTable(sessions));
    });
}
