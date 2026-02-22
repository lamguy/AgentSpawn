import { Command } from 'commander';
import { SessionManager } from '../../core/manager.js';
import { Router } from '../../io/router.js';
import { RemoteManager } from '../../core/remote.js';
import { RemoteClient } from '../../core/remote-client.js';
import { openTunnel } from '../../core/tunnel.js';
import { TunnelError } from '../../utils/errors.js';
import { formatSessionTable } from '../../io/formatter.js';

export function registerListCommand(
  program: Command,
  manager: SessionManager,
  _router: Router,
  remoteManager: RemoteManager,
): void {
  program
    .command('list')
    .description('List agent sessions')
    .option('--json', 'Output as JSON')
    .option('--tag <tag>', 'Filter sessions by tag (repeatable)', (val: string, acc: string[]) => [...acc, val], [] as string[])
    .option('-r, --remote <alias>', 'List sessions on a remote AgentSpawn instance')
    .action(async (options: { json?: boolean; tag: string[]; remote?: string }) => {
      if (options.remote) {
        const entry = await remoteManager.getRemote(options.remote);
        if (!entry) {
          console.error(
            `Remote '${options.remote}' not found. Run: agentspawn remote list`,
          );
          process.exitCode = 1;
          return;
        }

        let handle: Awaited<ReturnType<typeof openTunnel>>;
        try {
          handle = await openTunnel(entry);
        } catch (e) {
          if (e instanceof TunnelError) {
            console.error(`Error: ${e.message}`);
            process.exitCode = 1;
            return;
          }
          throw e;
        }

        try {
          const client = new RemoteClient(
            `http://localhost:${handle.localPort}`,
            options.remote,
          );
          const sessions = await client.listSessions();
          if (options.json) {
            console.log(JSON.stringify(sessions, null, 2));
            return;
          }
          console.log(
            `Remote: ${options.remote} (${entry.sshUser}@${entry.sshHost})`,
          );
          if (sessions.length === 0) {
            console.log(`No sessions found on remote '${options.remote}'.`);
          } else {
            console.log(formatSessionTable(sessions));
          }
        } finally {
          await handle.close();
        }
        return;
      }

      let sessions = manager.listSessions();
      if (options.tag.length > 0) {
        sessions = sessions.filter((s) =>
          options.tag.every((t) => s.tags?.includes(t)),
        );
      }
      if (options.json) {
        console.log(JSON.stringify(sessions, null, 2));
        return;
      }
      console.log(formatSessionTable(sessions));
    });
}
