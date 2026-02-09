import { Command } from 'commander';
import { SessionManager } from '../../core/manager.js';
import { Router } from '../../io/router.js';
import { WorkspaceManager } from '../../core/workspace.js';
import { SessionState } from '../../types.js';
import { formatBroadcastResults } from '../../io/formatter.js';

export function registerExecCommand(
  program: Command,
  manager: SessionManager,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _router: Router,
  workspaceManager: WorkspaceManager,
): void {
  program
    .command('exec [name] <command>')
    .description('Execute a command in an agent session (or broadcast to multiple)')
    .option('--all', 'Broadcast to all running sessions')
    .option('--group <name>', 'Broadcast to all sessions in a workspace')
    .action(async (nameOrCommand: string, commandOrUndefined: string | undefined, opts: { all?: boolean; group?: string }) => {
      if (opts.all && opts.group) {
        console.error('Error: --all and --group are mutually exclusive.');
        process.exitCode = 1;
        return;
      }

      // When --all or --group is used, the first positional arg is the command
      // (since <name> is optional in that case)
      if (opts.all || opts.group) {
        const prompt = commandOrUndefined ? `${nameOrCommand} ${commandOrUndefined}` : nameOrCommand;
        let sessionNames: string[];

        if (opts.all) {
          const running = manager.listSessions().filter((s) => s.state === SessionState.Running);
          sessionNames = running.map((s) => s.name);
        } else {
          let workspaceSessionNames: string[];
          try {
            workspaceSessionNames = await workspaceManager.getSessionNames(opts.group!);
          } catch (err) {
            console.error(`Error: ${err instanceof Error ? err.message : err}`);
            process.exitCode = 1;
            return;
          }
          const runningSessions = manager.listSessions().filter((s) => s.state === SessionState.Running);
          const runningNames = new Set(runningSessions.map((s) => s.name));
          sessionNames = workspaceSessionNames.filter((n) => runningNames.has(n));
        }

        if (sessionNames.length === 0) {
          console.error(opts.all ? 'Error: No running sessions found.' : `Error: No running sessions in workspace '${opts.group}'.`);
          process.exitCode = 1;
          return;
        }

        try {
          const results = await manager.broadcastPrompt(sessionNames, prompt);
          console.log(formatBroadcastResults(results));
          const failed = results.filter((r) => r.status === 'rejected');
          if (failed.length > 0) {
            process.exitCode = 1;
          }
        } catch (err) {
          console.error(`Error: ${err instanceof Error ? err.message : err}`);
          process.exitCode = 1;
        }
        return;
      }

      // Standard single-session exec
      const name = nameOrCommand;
      const command = commandOrUndefined;

      if (!command) {
        console.error('Error: Missing required argument <command>.');
        process.exitCode = 1;
        return;
      }

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
