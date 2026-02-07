import { Command } from 'commander';
import { SessionManager } from '../../core/manager.js';
import { Router } from '../../io/router.js';
import { SessionState } from '../../types.js';
import readline from 'node:readline';

export function registerSwitchCommand(
  program: Command,
  manager: SessionManager,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _router: Router,
): void {
  program
    .command('switch <name>')
    .description('Switch to an agent session (interactive prompt mode)')
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

      console.error(`Attached to session: ${name}. Type prompts, Ctrl+C to detach.`);

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stderr,
        prompt: '> ',
      });

      rl.prompt();

      rl.on('line', async (line: string) => {
        const prompt = line.trim();
        if (!prompt) {
          rl.prompt();
          return;
        }
        try {
          const response = await session.sendPrompt(prompt);
          console.log(response);
        } catch (err) {
          console.error(`Error: ${err instanceof Error ? err.message : err}`);
        }
        rl.prompt();
      });

      return new Promise<void>((resolve) => {
        rl.on('close', () => {
          console.error(`\nDetached from session: ${name}`);
          resolve();
        });
      });
    });
}
