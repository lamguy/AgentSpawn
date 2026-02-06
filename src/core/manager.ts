import { Session } from './session.js';
import { Registry } from './registry.js';
import {
  SessionConfig,
  SessionInfo,
  SessionState,
  ManagerOptions,
  RegistryEntry,
} from '../types.js';
import { SessionAlreadyExistsError, SessionNotFoundError } from '../utils/errors.js';
import os from 'node:os';
import path from 'node:path';

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private registryEntries: Map<string, RegistryEntry> = new Map();
  private readonly registry: Registry;

  constructor(private readonly options?: ManagerOptions) {
    let registryPath =
      options?.registryPath ?? path.join(os.homedir(), '.agentspawn', 'sessions.json');

    if (registryPath.startsWith('~')) {
      registryPath = path.join(os.homedir(), registryPath.slice(1));
    }

    this.registry = new Registry(registryPath);
  }

  async init(): Promise<void> {
    const data = await this.registry.load();

    for (const [name, entry] of Object.entries(data.sessions)) {
      if (entry.state === SessionState.Running) {
        let alive = false;
        try {
          process.kill(entry.pid, 0);
          alive = true;
        } catch {
          alive = false;
        }

        if (!alive) {
          entry.state = SessionState.Crashed;
          data.sessions[name] = entry;
          await this.registry.save(data);
        }
      }

      this.registryEntries.set(name, entry);
    }
  }

  async startSession(config: SessionConfig): Promise<Session> {
    if (this.sessions.has(config.name)) {
      throw new SessionAlreadyExistsError(config.name);
    }

    const registryData = await this.registry.load();
    if (registryData.sessions[config.name]) {
      throw new SessionAlreadyExistsError(config.name);
    }

    const session = new Session(config, this.options?.shutdownTimeoutMs);
    await session.start();

    const info = session.getInfo();
    const entry: RegistryEntry = {
      name: info.name,
      pid: info.pid,
      state: info.state,
      startedAt: info.startedAt ? info.startedAt.toISOString() : new Date().toISOString(),
      workingDirectory: info.workingDirectory,
      exitCode: info.exitCode ?? null,
    };

    try {
      await this.registry.addEntry(entry);
    } catch (err) {
      await session.stop();
      throw err;
    }

    this.sessions.set(config.name, session);
    this.registryEntries.set(config.name, entry);

    return session;
  }

  async stopSession(name: string): Promise<void> {
    const session = this.sessions.get(name);
    if (session) {
      await session.stop();
      await this.registry.removeEntry(name);
      this.sessions.delete(name);
      this.registryEntries.delete(name);
      return;
    }

    // Session not in memory — check registry entries for an alive PID
    const entry = this.registryEntries.get(name);
    if (!entry) {
      throw new SessionNotFoundError(name);
    }

    if (entry.state === SessionState.Running) {
      try {
        process.kill(entry.pid, 'SIGTERM');
      } catch {
        // Process already gone, nothing to kill
      }
    }

    await this.registry.removeEntry(name);
    this.registryEntries.delete(name);
  }

  async stopAll(): Promise<void> {
    const names = [...this.sessions.keys()];
    for (const name of names) {
      await this.stopSession(name);
    }
  }

  getSession(name: string): Session | undefined {
    return this.sessions.get(name);
  }

  listSessions(): SessionInfo[] {
    const results: SessionInfo[] = [];
    const seen = new Set<string>();

    // First, include all in-memory sessions (authoritative for live sessions)
    for (const [name, session] of this.sessions) {
      results.push(session.getInfo());
      seen.add(name);
    }

    // Merge registry entries that are not already represented in memory
    for (const [name, entry] of this.registryEntries) {
      if (!seen.has(name)) {
        results.push({
          name: entry.name,
          pid: entry.pid,
          state: entry.state,
          startedAt: entry.startedAt ? new Date(entry.startedAt) : null,
          workingDirectory: entry.workingDirectory,
          exitCode: entry.exitCode ?? null,
        });
      }
    }

    return results;
  }
}
