import { Command } from 'commander';
import { RemoteManager } from '../../core/remote.js';
import { openTunnel } from '../../core/tunnel.js';
import { RemoteAlreadyExistsError, RemoteNotFoundError, TunnelError } from '../../utils/errors.js';
import { DEFAULT_WEB_PORT } from '../../config/defaults.js';
import { formatRelativeDate } from '../../io/formatter.js';
import { RemoteEntry } from '../../types.js';

const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function pickRandomPort(): number {
  return Math.floor(Math.random() * (60000 - 10000 + 1)) + 10000;
}

function parseSshTarget(
  target: string,
  sshUserOverride?: string,
  sshPortOverride?: number,
): { sshHost: string; sshUser: string; sshPort: number } {
  // Strip leading ssh:// if present
  let normalized = target;
  if (normalized.startsWith('ssh://')) {
    normalized = normalized.slice('ssh://'.length);
  }

  let sshUser = 'root';
  let sshHost = normalized;

  // Parse user@host
  const atIdx = normalized.indexOf('@');
  if (atIdx !== -1) {
    sshUser = normalized.slice(0, atIdx);
    sshHost = normalized.slice(atIdx + 1);
  }

  // Parse embedded port from host:port (e.g. user@host:2222 or host:2222)
  // Only do this when --ssh-port was not explicitly provided.
  let embeddedPort: number | undefined;
  const colonIdx = sshHost.lastIndexOf(':');
  if (colonIdx !== -1) {
    const portStr = sshHost.slice(colonIdx + 1);
    const portNum = parseInt(portStr, 10);
    if (!isNaN(portNum) && portNum > 0 && portNum <= 65535) {
      embeddedPort = portNum;
      sshHost = sshHost.slice(0, colonIdx);
    }
  }

  // Override with explicit flags if provided
  if (sshUserOverride) {
    sshUser = sshUserOverride;
  }

  return {
    sshHost,
    sshUser,
    // Explicit --ssh-port takes priority, then embedded port, then default 22
    sshPort: sshPortOverride ?? embeddedPort ?? 22,
  };
}

function formatRemoteTable(remotes: RemoteEntry[]): string {
  if (remotes.length === 0) {
    return 'No remotes.';
  }

  const headers = ['ALIAS', 'SSH HOST', 'SSH USER', 'PORT', 'ADDED'];

  const rows = remotes.map((r) => [
    r.alias,
    r.sshHost,
    r.sshUser,
    String(r.remotePort),
    formatRelativeDate(r.addedAt),
  ]);

  const colWidths = headers.map((h, i) => {
    const maxRow = rows.reduce((max, row) => Math.max(max, row[i].length), 0);
    return Math.max(h.length, maxRow);
  });

  const pad = (str: string, width: number): string => str.padEnd(width);

  const headerLine = headers
    .map((h, i) => `${BOLD}${pad(h, colWidths[i])}${RESET}`)
    .join('  ');

  const bodyLines = rows.map((row) =>
    row.map((cell, i) => pad(cell, colWidths[i])).join('  '),
  );

  return [headerLine, ...bodyLines].join('\n');
}

export function registerRemoteCommand(
  program: Command,
  remoteManager: RemoteManager,
): void {
  const remote = program
    .command('remote')
    .description('Manage remote AgentSpawn instances');

  // remote add <alias> <ssh-target>
  remote
    .command('add <alias> <ssh-target>')
    .description('Add a remote AgentSpawn instance reachable via SSH')
    .option('--ssh-user <user>', 'SSH user (overrides user in ssh-target)')
    .option('--ssh-port <port>', 'SSH port', '22')
    .option(
      '--remote-port <port>',
      'Port the remote AgentSpawn web server listens on',
      String(DEFAULT_WEB_PORT),
    )
    .option(
      '--local-port <port>',
      'Local port for the SSH tunnel (random if not given)',
    )
    .action(
      async (
        alias: string,
        sshTarget: string,
        opts: {
          sshUser?: string;
          sshPort: string;
          remotePort: string;
          localPort?: string;
        },
      ) => {
        const sshPortNum = parseInt(opts.sshPort, 10);
        if (isNaN(sshPortNum) || sshPortNum < 1 || sshPortNum > 65535) {
          console.error('Error: --ssh-port must be a valid port number (1-65535)');
          process.exitCode = 1;
          return;
        }

        const remotePortNum = parseInt(opts.remotePort, 10);
        if (isNaN(remotePortNum) || remotePortNum < 1 || remotePortNum > 65535) {
          console.error('Error: --remote-port must be a valid port number (1-65535)');
          process.exitCode = 1;
          return;
        }

        let localPortNum: number;
        if (opts.localPort !== undefined) {
          localPortNum = parseInt(opts.localPort, 10);
          if (isNaN(localPortNum) || localPortNum < 1 || localPortNum > 65535) {
            console.error('Error: --local-port must be a valid port number (1-65535)');
            process.exitCode = 1;
            return;
          }
        } else {
          localPortNum = pickRandomPort();
        }

        const { sshHost, sshUser, sshPort } = parseSshTarget(
          sshTarget,
          opts.sshUser,
          sshPortNum,
        );

        const entry: RemoteEntry = {
          alias,
          sshHost,
          sshUser,
          sshPort,
          remotePort: remotePortNum,
          localPort: localPortNum,
          addedAt: new Date().toISOString(),
        };

        try {
          await remoteManager.addRemote(entry);
          console.log(
            `Remote '${alias}' added (tunnel: localhost:${localPortNum} -> ${sshHost}:${remotePortNum}).`,
          );
        } catch (e) {
          if (e instanceof RemoteAlreadyExistsError) {
            console.error(`Error: ${e.message}`);
            process.exitCode = 1;
            return;
          }
          throw e;
        }
      },
    );

  // remote remove <alias>
  remote
    .command('remove <alias>')
    .description('Remove a remote AgentSpawn instance')
    .action(async (alias: string) => {
      try {
        await remoteManager.removeRemote(alias);
        console.log(`Remote '${alias}' removed.`);
      } catch (e) {
        if (e instanceof RemoteNotFoundError) {
          console.error(`Error: ${e.message}`);
          process.exitCode = 1;
          return;
        }
        throw e;
      }
    });

  // remote list
  remote
    .command('list')
    .description('List all registered remote AgentSpawn instances')
    .option('--json', 'Output as JSON')
    .action(async (opts: { json?: boolean }) => {
      const remotes = await remoteManager.listRemotes();
      if (opts.json) {
        console.log(JSON.stringify(remotes, null, 2));
        return;
      }
      if (remotes.length === 0) {
        console.log(
          'No remotes found. Add one with: agentspawn remote add <alias> <user@host>',
        );
        return;
      }
      console.log(formatRemoteTable(remotes));
    });

  // remote connect <alias>
  remote
    .command('connect <alias>')
    .description('Open an SSH tunnel to a remote AgentSpawn instance')
    .action(async (alias: string) => {
      const entry = await remoteManager.getRemote(alias);
      if (!entry) {
        console.error(
          `Error: Remote '${alias}' not found. Run: agentspawn remote list`,
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

      console.log(
        `Tunnel open: localhost:${handle.localPort} -> ${entry.sshHost}:${entry.remotePort}`,
      );
      console.log('Press Ctrl+C to close the tunnel.');

      const close = async (): Promise<void> => {
        await handle.close();
        process.exit(0);
      };

      process.on('SIGINT', close);
      process.on('SIGTERM', close);
    });
}
