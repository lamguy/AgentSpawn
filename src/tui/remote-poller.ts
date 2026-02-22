import { EventEmitter } from 'node:events';
import type { RemoteEntry, SessionInfo } from '../types.js';
import { RemoteClient } from '../core/remote-client.js';
import { openTunnel } from '../core/tunnel.js';
import type { TunnelHandle } from '../core/tunnel.js';

export interface RemoteSessionsEvent {
  alias: string;
  sessions: SessionInfo[];
}

export interface RemoteErrorEvent {
  alias: string;
  error: string;
}

/**
 * Polls remote AgentSpawn instances periodically and emits session data.
 *
 * Events:
 *   'sessions' (RemoteSessionsEvent) — fresh session list from a remote
 *   'remoteError' (RemoteErrorEvent) — a remote was unreachable (non-fatal)
 */
export class RemotePoller extends EventEmitter {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private tunnels = new Map<string, TunnelHandle>();

  constructor(
    private readonly remotes: RemoteEntry[],
    private readonly intervalMs = 5000,
  ) {
    super();
  }

  /** Start polling. Opens tunnels for each remote on first poll. */
  start(): void {
    // Poll immediately, then on interval
    void this.poll();
    this.intervalId = setInterval(() => void this.poll(), this.intervalMs);
  }

  /** Stop polling and close all tunnels. */
  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    await Promise.allSettled(
      Array.from(this.tunnels.values()).map((t) => t.close()),
    );
    this.tunnels.clear();
  }

  private async poll(): Promise<void> {
    // Poll all remotes concurrently so a single slow/unreachable remote
    // doesn't block the others (openTunnel can take up to 10s to time out).
    await Promise.allSettled(
      this.remotes.map((entry) => this.pollOne(entry)),
    );
  }

  private async pollOne(entry: RemoteEntry): Promise<void> {
    try {
      // Open tunnel if not yet open
      if (!this.tunnels.has(entry.alias)) {
        const handle = await openTunnel(entry);
        this.tunnels.set(entry.alias, handle);
      }
      const tunnel = this.tunnels.get(entry.alias)!;
      const client = new RemoteClient(
        `http://localhost:${tunnel.localPort}`,
        entry.alias,
      );
      const sessions = await client.listSessions();
      this.emit('sessions', { alias: entry.alias, sessions } satisfies RemoteSessionsEvent);
    } catch (err) {
      // If tunnel open failed, remove it so next poll retries
      this.tunnels.delete(entry.alias);
      this.emit('remoteError', {
        alias: entry.alias,
        error: err instanceof Error ? err.message : String(err),
      } satisfies RemoteErrorEvent);
    }
  }
}
