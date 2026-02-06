import { SessionState, SessionConfig, SessionInfo } from '../types.js';

export class Session {
  private state: SessionState = SessionState.Stopped;
  private pid: number = 0;
  private startedAt: Date | null = null;

  constructor(private readonly config: SessionConfig) {}

  async start(): Promise<void> {
    this.state = SessionState.Running;
    this.startedAt = new Date();
    this.pid = 0;
  }

  async stop(): Promise<void> {
    this.state = SessionState.Stopped;
  }

  getState(): SessionState {
    return this.state;
  }

  getInfo(): SessionInfo {
    return {
      name: this.config.name,
      pid: this.pid,
      state: this.state,
      startedAt: this.startedAt,
      workingDirectory: this.config.workingDirectory,
    };
  }
}
