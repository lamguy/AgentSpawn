import { SessionConfig, SessionInfo, ManagerOptions } from '../types.js';
import { Session } from './session.js';
import { SessionAlreadyExistsError, SessionNotFoundError } from '../utils/errors.js';

export class SessionManager {
  private sessions: Map<string, Session> = new Map();

  constructor(private readonly options?: ManagerOptions) {}

  async startSession(config: SessionConfig): Promise<Session> {
    if (this.sessions.has(config.name)) {
      throw new SessionAlreadyExistsError(config.name);
    }

    const session = new Session(config);
    await session.start();
    this.sessions.set(config.name, session);
    return session;
  }

  async stopSession(name: string): Promise<void> {
    const session = this.sessions.get(name);
    if (!session) {
      throw new SessionNotFoundError(name);
    }

    await session.stop();
    this.sessions.delete(name);
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
    return Array.from(this.sessions.values()).map((session) => session.getInfo());
  }
}
