import { Command } from 'commander';
import { SessionManager } from '../../core/manager.js';
import { Router } from '../../io/router.js';
import { SessionState } from '../../types.js';

export function registerExecCommand(
  program: Command,
  manager: SessionManager,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _router: Router,
): void {
  program
    .command('exec <name> <command>')
    .description('Execute a command in an agent session')
    .action(async (name: string, command: string) => {
      const session = manager.getSession(name);
      if (!session) {
        console.error(`Error: Session '${name}' not found.`);
        process.exitCode = 1;
        return;
      }
      if (session.getState() !== SessionState.Running) {
        console.error(`Error: Session '${name}' is not running.`);
        process.exitCode = 1;
        return;
      }
      const handle = session.getHandle();
      if (!handle) {
        console.error(`Error: Session '${name}' has no active process.`);
        process.exitCode = 1;
        return;
      }
      handle.stdin.write(command + '\n');
      console.log(`Sent to [${name}]: ${command}`);
    });
}
