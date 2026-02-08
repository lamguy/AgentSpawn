import type { SessionInfo, PromptHistoryEntry } from '../types.js';

/**
 * Base TUI interaction mode.
 * Governs what the main layout does. Overlays render on top.
 */
export type TUIMode = 'navigation' | 'attached';

// ── Overlay State Types ─────────────────────────────────────────────────────

/**
 * Discriminated union of all overlay types.
 * Each variant carries the state specific to that overlay.
 */
export type OverlayState =
  | HelpOverlayState
  | ActionMenuOverlayState
  | SessionCreationOverlayState
  | ConfirmationOverlayState
  | HistorySearchOverlayState;

export interface HelpOverlayState {
  kind: 'help';
  /** Scroll offset for long help text */
  scrollOffset: number;
}

export interface ActionMenuOverlayState {
  kind: 'action-menu';
  /** Currently highlighted menu item index */
  selectedIndex: number;
  /** The session this menu applies to (null for global actions) */
  targetSessionName: string | null;
}

export interface SessionCreationOverlayState {
  kind: 'session-creation';
  /** Form field values */
  fields: {
    name: string;
    template: string;
    directory: string;
    permissionMode: string;
  };
  /** Which form field is currently focused */
  activeField: 'name' | 'template' | 'directory' | 'permissionMode';
  /** Validation errors keyed by field name (empty string = no error) */
  errors: {
    name: string;
    template: string;
    directory: string;
    permissionMode: string;
  };
  /** Whether the form submission is in progress */
  isSubmitting: boolean;
}

export interface ConfirmationOverlayState {
  kind: 'confirmation';
  /** Title displayed in the dialog header */
  title: string;
  /** Descriptive message explaining what will happen */
  message: string;
  /** The action to execute if confirmed */
  action: ConfirmableAction;
}

export interface HistorySearchOverlayState {
  kind: 'history-search';
  query: string;
  results: (PromptHistoryEntry & { sessionName: string })[];
  selectedIndex: number;
  isLoading: boolean;
}

/**
 * Actions that require user confirmation before execution.
 * Discriminated union so the orchestrator knows what to do on confirm.
 */
export type ConfirmableAction =
  | { kind: 'stop-session'; sessionName: string }
  | { kind: 'restart-session'; sessionName: string }
  | { kind: 'stop-all' };

// ── Status Message ──────────────────────────────────────────────────────────

export interface StatusMessage {
  text: string;
  level: 'info' | 'error' | 'success';
  /** Timestamp for auto-clear (e.g., clear after 5 seconds) */
  expiresAt: number;
}

// ── TUI Action (side-effect descriptors) ────────────────────────────────────

/**
 * Side-effect actions that the orchestrator must execute.
 * Key handlers produce these; the orchestrator consumes them.
 */
export type TUIAction =
  | { kind: 'create-session'; name: string; directory: string; permissionMode: string }
  | { kind: 'create-session-from-template'; name: string; templateName: string; directory: string; permissionMode: string }
  | { kind: 'stop-session'; sessionName: string }
  | { kind: 'restart-session'; sessionName: string }
  | { kind: 'stop-all' }
  | { kind: 'send-prompt'; sessionName: string; prompt: string }
  | { kind: 'history-search-load'; sessionName: string | undefined; query: string }
  | { kind: 'history-insert'; prompt: string };

// ── Action Menu Item ────────────────────────────────────────────────────────

export interface ActionMenuItem {
  id: string;
  label: string;
  description: string;
  shortcut?: string;
  /** Whether this item is available given current state */
  enabled: boolean;
}

// ── TUI Application State ───────────────────────────────────────────────────

/**
 * TUI application state — represents the complete view model for the terminal UI.
 */
export interface TUIState {
  /** All sessions currently tracked by the manager */
  sessions: SessionInfo[];
  /** Name of the currently selected session in the session list */
  selectedSessionName: string | null;
  /** Name of the session that's receiving prompts (in attached mode) */
  attachedSessionName: string | null;
  /** Captured output lines for the displayed session (with full metadata) */
  outputLines: OutputLine[];
  /** Whether the TUI is in the process of shutting down */
  isShuttingDown: boolean;
  /** Base interaction mode */
  mode: TUIMode;
  /** Whether a prompt is being processed by the attached session */
  isProcessing: boolean;
  /** Stack of active overlays. Top of array = topmost overlay. Empty = no overlay. */
  overlayStack: OverlayState[];
  /** Transient message to display in the status bar (auto-clears) */
  statusMessage: StatusMessage | null;
  /** Pending input text to pre-fill in the InputBar (e.g., from history search) */
  pendingInput?: string | null;
}

// ── Options ─────────────────────────────────────────────────────────────────

/**
 * Options for launching the TUI.
 */
export interface TUIOptions {
  /** Initial session to select (if any) */
  initialSession?: string;
  /** Whether to attach to the initial session */
  autoAttach?: boolean;
}

// ── Adapter Interfaces ──────────────────────────────────────────────────────

/**
 * Read-only snapshot of SessionManager state.
 */
export interface SessionManagerSnapshot {
  /** Get list of all sessions */
  getSessions(): SessionInfo[];
  /** Get a specific session by name */
  getSession(name: string): SessionInfo | undefined;
}

/**
 * Read-only snapshot of Router state.
 */
export interface RouterSnapshot {
  /** Get the name of the currently attached session (if any) */
  getActiveSession(): string | undefined;
}

// ── Output Types ────────────────────────────────────────────────────────────

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
  /** Maximum total lines across all sessions. 0 or Infinity = disabled. Default: 10000 */
  maxTotalLines?: number;
  /** Maximum characters per line. Lines exceeding this are truncated. 0 or Infinity = disabled. Default: 10000 */
  maxLineLength?: number;
}
