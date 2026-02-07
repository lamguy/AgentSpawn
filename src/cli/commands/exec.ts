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
      try {
        console.log(`Sending to [${name}]: ${command}`);
        const response = await session.sendPrompt(command);
        console.log(response);
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exitCode = 1;
      }
    });
}
