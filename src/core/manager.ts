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
import { logger } from '../utils/logger.js';
import { HistoryStore } from './history.js';
import os from 'node:os';
import path from 'node:path';

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private registryEntries: Map<string, RegistryEntry> = new Map();
  readonly registry: Registry;
  private readonly historyStore?: HistoryStore;

  constructor(private readonly options?: ManagerOptions) {
    this.historyStore = options?.historyStore;
    let registryPath =
      options?.registryPath ?? path.join(os.homedir(), '.agentspawn', 'sessions.json');

    if (registryPath.startsWith('~')) {
      registryPath = path.join(os.homedir(), registryPath.slice(1));
    }

    this.registry = new Registry(registryPath);
  }

  async init(): Promise<void> {
    await this.registry.withLock((data) => {
      for (const [name, entry] of Object.entries(data.sessions)) {
        if (entry.state === SessionState.Running && entry.pid > 0) {
          let alive = false;
          try {
            process.kill(entry.pid, 0);
            alive = true;
          } catch {
            alive = false;
          }

          if (!alive) {
            logger.warn(`Detected crashed session "${name}" (pid ${entry.pid})`);
            entry.state = SessionState.Crashed;
          }
        }
      }
    });

    // Re-read after lock release to populate in-memory cache
    const data = await this.registry.load();
    for (const [name, entry] of Object.entries(data.sessions)) {
      this.registryEntries.set(name, entry);
    }
  }

  async startSession(config: SessionConfig, claudeSessionId?: string, promptCount?: number): Promise<Session> {
    if (this.sessions.has(config.name)) {
      throw new SessionAlreadyExistsError(config.name);
    }

    const session = new Session(config, this.options?.shutdownTimeoutMs, claudeSessionId, promptCount);
    await session.start();
    logger.info(`Session "${config.name}" started in ${config.workingDirectory}`);

    const info = session.getInfo();
    const entry: RegistryEntry = {
      name: info.name,
      pid: info.pid,
      state: info.state,
      startedAt: info.startedAt ? info.startedAt.toISOString() : new Date().toISOString(),
      workingDirectory: info.workingDirectory,
      exitCode: info.exitCode ?? null,
      claudeSessionId: session.getSessionId(),
      promptCount: info.promptCount,
      permissionMode: config.permissionMode,
    };

    try {
      await this.registry.withLock((data) => {
        if (data.sessions[config.name]) {
          throw new SessionAlreadyExistsError(config.name);
        }
        data.sessions[config.name] = entry;
      });
    } catch (err) {
      await session.stop();
      throw err;
    }

    this.sessions.set(config.name, session);
    this.registryEntries.set(config.name, entry);
    this.wireHistoryRecording(session, config.name);

    return session;
  }

  async stopSession(name: string): Promise<void> {
    const session = this.sessions.get(name);
    if (session) {
      await session.stop();
      await this.registry.removeEntry(name);
      this.sessions.delete(name);
      this.registryEntries.delete(name);
      logger.info(`Session "${name}" stopped`);
      return;
    }

    // Session not in memory — check registry entries for an alive PID
    const entry = this.registryEntries.get(name);
    if (!entry) {
      throw new SessionNotFoundError(name);
    }

    if (entry.state === SessionState.Running && entry.pid > 0) {
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
    // Stop all in-memory sessions
    const inMemoryNames = [...this.sessions.keys()];
    for (const name of inMemoryNames) {
      await this.stopSession(name);
    }

    // Also clean up registry-only entries (sessions started by other processes)
    const registryNames = [...this.registryEntries.keys()];
    for (const name of registryNames) {
      await this.stopSession(name);
    }
  }

  getSession(name: string): Session | undefined {
    return this.sessions.get(name);
  }

  /**
   * Adopt a registry-only session into this process.
   * In prompt-based mode there is no persistent child process to kill —
   * we simply create a new in-memory Session with the same config.
   */
  async adoptSession(name: string): Promise<Session> {
    // Already in memory — nothing to do
    const existing = this.sessions.get(name);
    if (existing) {
      return existing;
    }

    // Must exist in registry
    const entry = this.registryEntries.get(name);
    if (!entry) {
      throw new SessionNotFoundError(name);
    }

    // Remove old registry entry and start a fresh session
    await this.registry.removeEntry(name);
    this.registryEntries.delete(name);

    const config: SessionConfig = {
      name: entry.name,
      workingDirectory: entry.workingDirectory,
      permissionMode: entry.permissionMode,
    };

    return this.startSession(config, entry.claudeSessionId, entry.promptCount);
  }

  private wireHistoryRecording(session: Session, sessionName: string): void {
    if (!this.historyStore) return;

    const store = this.historyStore;
    let pendingPrompt: string | null = null;

    session.on('promptStart', (prompt: string) => {
      pendingPrompt = prompt;
    });

    session.on('promptComplete', (response: string) => {
      if (pendingPrompt) {
        const prompt = pendingPrompt;
        pendingPrompt = null;
        store.record(sessionName, {
          prompt,
          responsePreview: response,
        }).catch((err) => {
          logger.warn(`Failed to record history for session "${sessionName}": ${err}`);
        });
      }
    });
  }

  /**
   * Get session info by name, checking both in-memory sessions and registry entries.
   * Unlike getSession(), this works for sessions started by other processes.
   */
  getSessionInfo(name: string): SessionInfo | undefined {
    // First check in-memory sessions (authoritative for live sessions)
    const session = this.sessions.get(name);
    if (session) {
      return session.getInfo();
    }

    // Fall back to registry entries
    const entry = this.registryEntries.get(name);
    if (entry) {
      return {
        name: entry.name,
        pid: entry.pid,
        state: entry.state,
        startedAt: entry.startedAt ? new Date(entry.startedAt) : null,
        workingDirectory: entry.workingDirectory,
        exitCode: entry.exitCode ?? null,
        promptCount: 0,
        permissionMode: entry.permissionMode,
      };
    }

    return undefined;
  }

  /**
   * Re-read the on-disk registry and merge any new entries.
   * Called periodically by the TUI so externally-started sessions are discovered.
   */
  async refreshRegistry(): Promise<void> {
    const data = await this.registry.load();

    for (const [name, entry] of Object.entries(data.sessions)) {
      // Skip sessions already tracked in memory (either as Session or RegistryEntry)
      if (this.sessions.has(name) || this.registryEntries.has(name)) {
        continue;
      }

      // Only check PID liveness for sessions with a real persistent process.
      // Prompt-based sessions (pid === 0) have no persistent process to check.
      if (entry.state === SessionState.Running && entry.pid > 0) {
        try {
          process.kill(entry.pid, 0);
        } catch {
          entry.state = SessionState.Crashed;
        }
      }

      this.registryEntries.set(name, entry);
    }

    // Remove registry entries that no longer exist on disk
    // (e.g. stopped by another process)
    const diskNames = new Set(Object.keys(data.sessions));
    for (const name of this.registryEntries.keys()) {
      if (!diskNames.has(name) && !this.sessions.has(name)) {
        this.registryEntries.delete(name);
      }
    }
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
          promptCount: 0,
          permissionMode: entry.permissionMode,
        });
      }
    }

    return results;
  }
}
