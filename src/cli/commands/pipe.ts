import { Command } from 'commander';
import { SessionManager } from '../../core/manager.js';
import { SessionState } from '../../types.js';

/**
 * Register the `pipe` command.
 *
 * Usage: agentspawn pipe <from-session> <to-session>
 *
 * Waits for <from-session>'s next promptComplete event, then sends
 * that response as a prompt to <to-session>.
 */
export function registerPipeCommand(program: Command, manager: SessionManager): void {
  program
    .command('pipe <from> <to>')
    .description("Pipe <from>'s next response as a prompt to <to>")
    .action(async (fromName: string, toName: string) => {
      const fromSession = manager.getSession(fromName);
      if (!fromSession) {
        console.error(`Error: Session '${fromName}' not found.`);
        process.exitCode = 1;
        return;
      }
      if (fromSession.getState() !== SessionState.Running) {
        console.error(`Error: Session '${fromName}' is not running.`);
        process.exitCode = 1;
        return;
      }

      const toSession = manager.getSession(toName);
      if (!toSession) {
        console.error(`Error: Session '${toName}' not found.`);
        process.exitCode = 1;
        return;
      }
      if (toSession.getState() !== SessionState.Running) {
        console.error(`Error: Session '${toName}' is not running.`);
        process.exitCode = 1;
        return;
      }

      console.log(`Waiting for next response from [${fromName}]...`);

      try {
        const response = await new Promise<string>((resolve, reject) => {
          const onComplete = (text: string) => {
            fromSession.removeListener('promptError', onError);
            resolve(text);
          };
          const onError = (err: Error) => {
            fromSession.removeListener('promptComplete', onComplete);
            reject(err);
          };
          fromSession.once('promptComplete', onComplete);
          fromSession.once('promptError', onError);
        });

        console.log(`Piping [${fromName}] -> [${toName}]`);
        const result = await toSession.sendPrompt(response);
        console.log(result);
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exitCode = 1;
      }
    });
}
