import type { SessionManager } from '../core/manager.js';
import type { Router } from '../io/router.js';
import type { SessionManagerSnapshot, RouterSnapshot } from './types.js';
import type { SessionInfo } from '../types.js';

/**
 * Read-only adapter for SessionManager.
 * Provides a snapshot interface to prevent direct mutation from the TUI.
 */
export class SessionManagerAdapter implements SessionManagerSnapshot {
  constructor(private readonly manager: SessionManager) {}

  getSessions(): SessionInfo[] {
    return this.manager.listSessions();
  }

  getSession(name: string): SessionInfo | undefined {
    return this.manager.getSessionInfo(name);
  }
}

/**
 * Read-only adapter for Router.
 * Provides a snapshot interface to prevent direct mutation from the TUI.
 */
export class RouterAdapter implements RouterSnapshot {
  constructor(private readonly router: Router) {}

  getActiveSession(): string | undefined {
    return this.router.getActiveSession();
  }
}
