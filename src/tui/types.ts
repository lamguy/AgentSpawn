import type { SessionInfo } from '../types.js';

/**
 * TUI interaction mode.
 */
export type TUIMode = 'navigation' | 'attached';

/**
 * TUI application state — represents the complete view model for the terminal UI.
 */
export interface TUIState {
  /** All sessions currently tracked by the manager */
  sessions: SessionInfo[];
  /** Name of the currently selected session in the UI */
  selectedSessionName: string | null;
  /** Name of the session that's receiving stdin (attached by router) */
  attachedSessionName: string | null;
  /** Captured output lines for the selected session */
  outputLines: string[];
  /** Whether the TUI is in the process of shutting down */
  isShuttingDown: boolean;
  /** Current interaction mode: navigation (TUI shortcuts active) or attached (stdin forwarded) */
  mode: TUIMode;
}

/**
 * Options for launching the TUI.
 */
export interface TUIOptions {
  /** Initial session to select (if any) */
  initialSession?: string;
  /** Whether to attach to the initial session */
  autoAttach?: boolean;
}

/**
 * Read-only snapshot of SessionManager state.
 * This isolates the TUI from direct SessionManager mutation.
 */
export interface SessionManagerSnapshot {
  /** Get list of all sessions */
  getSessions(): SessionInfo[];
  /** Get a specific session by name */
  getSession(name: string): SessionInfo | undefined;
}

/**
 * Read-only snapshot of Router state.
 * This isolates the TUI from direct Router mutation.
 */
export interface RouterSnapshot {
  /** Get the name of the currently attached session (if any) */
  getActiveSession(): string | undefined;
}

/**
 * Captured output line with metadata.
 */
export interface OutputLine {
  /** The session name that emitted this line */
  sessionName: string;
  /** The raw text content */
  text: string;
  /** Timestamp when captured */
  timestamp: Date;
  /** Whether this came from stderr (vs stdout) */
  isError: boolean;
}

/**
 * Configuration for the output capture buffer.
 */
export interface OutputCaptureConfig {
  /** Maximum number of lines to retain per session */
  maxLinesPerSession?: number;
  /** Whether to capture stderr separately */
  captureStderr?: boolean;
}
