import { Command } from 'commander';
import { SessionManager } from '../../core/manager.js';
import { Router } from '../../io/router.js';
import { SessionState } from '../../types.js';

export function registerSwitchCommand(
  program: Command,
  manager: SessionManager,
  router: Router,
): void {
  program
    .command('switch <name>')
    .description('Switch to an agent session')
    .action(async (name: string) => {
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

      if (router.getActiveSession()) {
        router.detach();
      }

      router.attach(session);
      console.error(`Attached to session: ${name}. Press Ctrl+C to detach.`);

      return new Promise<void>((resolve) => {
        const onSigint = (): void => {
          clearInterval(checkInterval);
          router.detach();
          console.error(`\nDetached from session: ${name}`);
          process.removeListener('SIGINT', onSigint);
          resolve();
        };
        process.on('SIGINT', onSigint);

        // Also resolve if session exits while attached
        const checkInterval = setInterval(() => {
          if (session.getState() !== SessionState.Running) {
            clearInterval(checkInterval);
            if (router.getActiveSession()) {
              router.detach();
            }
            console.error(`\nSession '${name}' exited.`);
            process.removeListener('SIGINT', onSigint);
            resolve();
          }
        }, 500);
      });
    });
}
