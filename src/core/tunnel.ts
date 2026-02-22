import { spawn } from 'node:child_process';
import { RemoteEntry } from '../types.js';
import { TunnelError } from '../utils/errors.js';

const PROBE_INTERVAL_MS = 200;
const PROBE_TIMEOUT_MS = 10_000;

export interface TunnelHandle {
  localPort: number;
  close(): Promise<void>;
}

export async function openTunnel(entry: RemoteEntry): Promise<TunnelHandle> {
  const { alias, sshHost, sshUser, sshPort, remotePort, localPort } = entry;

  const args = [
    '-N',
    '-L',
    `${localPort}:localhost:${remotePort}`,
    '-p',
    String(sshPort),
    `${sshUser}@${sshHost}`,
  ];

  const sshProcess = spawn('ssh', args, { stdio: 'pipe' });

  // Collect stderr for error reporting
  const stderrChunks: Buffer[] = [];
  sshProcess.stderr?.on('data', (chunk: Buffer) => {
    stderrChunks.push(chunk);
  });

  // Wait for the tunnel to become reachable or for the process to exit early
  await new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + PROBE_TIMEOUT_MS;
    let settled = false;

    const settle = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearInterval(probeInterval);
      sshProcess.removeListener('exit', onExit);
      sshProcess.removeListener('error', onSpawnError);
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      const stderrOutput = Buffer.concat(stderrChunks).toString('utf-8').trim();
      const detail = stderrOutput || `exited with code ${String(code)} signal ${String(signal)}`;
      settle(new TunnelError(alias, `SSH process exited prematurely: ${detail}`));
    };

    const onSpawnError = (err: Error) => {
      settle(new TunnelError(alias, `Failed to spawn SSH: ${err.message}`));
    };

    sshProcess.once('exit', onExit);
    sshProcess.once('error', onSpawnError);

    const probeInterval = setInterval(async () => {
      // If the SSH process has already exited, the 'exit' event will fire first;
      // but check the deadline here as well.
      if (Date.now() >= deadline) {
        sshProcess.kill('SIGTERM');
        settle(new TunnelError(alias, 'timeout waiting for tunnel to become ready'));
        return;
      }

      try {
        const res = await fetch(`http://localhost:${localPort}/api/sessions`);
        if (res.ok || res.status < 500) {
          // Any non-connection-refused response means the tunnel is up
          settle();
        }
      } catch {
        // Connection refused or network error — tunnel not yet ready, keep probing
      }
    }, PROBE_INTERVAL_MS);
  });

  let closed = false;

  // Kill the SSH child synchronously when the parent process exits.
  // 'exit' is the last event where synchronous code still runs.
  // We store the listener reference so close() can de-register it,
  // preventing listener accumulation across many tunnel open/close cycles.
  const onParentExit = () => {
    if (!closed && sshProcess.exitCode === null) {
      sshProcess.kill();
    }
  };
  process.once('exit', onParentExit);

  return {
    localPort,
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      process.removeListener('exit', onParentExit);

      if (sshProcess.exitCode !== null) {
        // Process already exited
        return;
      }

      await new Promise<void>((resolve) => {
        sshProcess.once('exit', () => resolve());
        sshProcess.once('error', () => resolve());
        sshProcess.kill('SIGTERM');
      });
    },
  };
}
