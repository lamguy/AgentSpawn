import { SessionInfo, RouterOptions } from '../types.js';

export class Router {
  private activeSession: string | undefined;

  constructor(private readonly options?: RouterOptions) {}

  attach(session: SessionInfo): void {
    this.activeSession = session.name;
  }

  detach(): void {
    this.activeSession = undefined;
  }

  getActiveSession(): string | undefined {
    return this.activeSession;
  }
}
