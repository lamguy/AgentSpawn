import type { TUIState } from './types.js';

/**
 * Key code constants for terminal input.
 * These are the raw escape sequences sent by terminal emulators.
 */
export const KEY_CODES = {
  TAB: '\t',
  SHIFT_TAB: '\x1b[Z',
  UP_ARROW: '\x1b[A',
  DOWN_ARROW: '\x1b[B',
  ENTER: '\r',
  ESCAPE: '\x1b',
  CTRL_C: '\x03',
  LOWERCASE_Q: 'q',
  LOWERCASE_N: 'n',
  LOWERCASE_X: 'x',
  QUESTION_MARK: '?',
} as const;

/**
 * Result type for key handlers.
 * Either returns updated state or a quit signal.
 */
export type KeyHandlerResult = TUIState | { quit: true };

/**
 * Key binding definition.
 */
export interface KeyBinding {
  /** The key code that triggers this binding */
  key: string;
  /** Human-readable description for help text */
  description: string;
  /** Handler function that processes the key press */
  handler: (state: TUIState) => KeyHandlerResult;
}

/**
 * Key handler function type.
 * Takes current state and raw key input, returns new state or quit signal.
 */
export type KeyHandler = (state: TUIState, key: string) => KeyHandlerResult;

/**
 * Cycle to the next session in the list.
 * Wraps around to the first session when reaching the end.
 */
function handleNextSession(state: TUIState): TUIState {
  if (state.sessions.length === 0) {
    return state;
  }

  const currentIndex = state.sessions.findIndex(
    (s) => s.name === state.selectedSessionName,
  );

  const nextIndex =
    currentIndex === -1
      ? 0 // No selection, select first
      : (currentIndex + 1) % state.sessions.length; // Wrap around

  return {
    ...state,
    selectedSessionName: state.sessions[nextIndex].name,
  };
}

/**
 * Cycle to the previous session in the list.
 * Wraps around to the last session when reaching the start.
 */
function handlePreviousSession(state: TUIState): TUIState {
  if (state.sessions.length === 0) {
    return state;
  }

  const currentIndex = state.sessions.findIndex(
    (s) => s.name === state.selectedSessionName,
  );

  const previousIndex =
    currentIndex === -1
      ? state.sessions.length - 1 // No selection, select last
      : currentIndex === 0
        ? state.sessions.length - 1 // At start, wrap to end
        : currentIndex - 1;

  return {
    ...state,
    selectedSessionName: state.sessions[previousIndex].name,
  };
}

/**
 * Move selection up in the session list.
 * Same as previous session (sessions are displayed top to bottom).
 */
function handleUpArrow(state: TUIState): TUIState {
  return handlePreviousSession(state);
}

/**
 * Move selection down in the session list.
 * Same as next session (sessions are displayed top to bottom).
 */
function handleDownArrow(state: TUIState): TUIState {
  return handleNextSession(state);
}

/**
 * Attach to the selected session.
 * Placeholder implementation — actual attachment happens via router.
 */
function handleAttach(state: TUIState): TUIState {
  // TODO: Implement actual attachment via router
  // For now, just mark the selected session as attached in state
  if (!state.selectedSessionName) {
    return state;
  }

  return {
    ...state,
    attachedSessionName: state.selectedSessionName,
    mode: 'attached', // Switch to attached mode
  };
}

/**
 * Detach from the currently attached session.
 * Returns to navigation mode where TUI shortcuts are active.
 */
function handleDetach(state: TUIState): TUIState {
  // TODO: Implement actual detachment via router
  return {
    ...state,
    attachedSessionName: null,
    mode: 'navigation', // Switch to navigation mode
  };
}

/**
 * Quit the TUI.
 * Returns a special quit signal.
 */
function handleQuit(_state: TUIState): { quit: true } {
  return { quit: true };
}

/**
 * Create a new session.
 * Placeholder implementation — will be implemented later.
 */
function handleNewSession(state: TUIState): TUIState {
  // TODO: Implement session creation flow
  return state;
}

/**
 * Stop the selected session.
 * Placeholder implementation — will be implemented later.
 */
function handleStopSession(state: TUIState): TUIState {
  // TODO: Implement session stop via manager
  return state;
}

/**
 * Toggle help overlay.
 * Placeholder implementation — will be implemented later.
 */
function handleToggleHelp(state: TUIState): TUIState {
  // TODO: Implement help overlay toggle
  return state;
}

/**
 * All supported key bindings.
 * This map defines the complete keyboard navigation system.
 */
export const KEY_BINDINGS: Record<string, KeyBinding> = {
  [KEY_CODES.TAB]: {
    key: 'Tab',
    description: 'Switch to next session',
    handler: handleNextSession,
  },
  [KEY_CODES.SHIFT_TAB]: {
    key: 'Shift+Tab',
    description: 'Switch to previous session',
    handler: handlePreviousSession,
  },
  [KEY_CODES.UP_ARROW]: {
    key: '↑',
    description: 'Move selection up',
    handler: handleUpArrow,
  },
  [KEY_CODES.DOWN_ARROW]: {
    key: '↓',
    description: 'Move selection down',
    handler: handleDownArrow,
  },
  [KEY_CODES.ENTER]: {
    key: 'Enter',
    description: 'Attach to selected session',
    handler: handleAttach,
  },
  [KEY_CODES.ESCAPE]: {
    key: 'Esc',
    description: 'Detach from session',
    handler: handleDetach,
  },
  [KEY_CODES.LOWERCASE_Q]: {
    key: 'q',
    description: 'Quit',
    handler: handleQuit,
  },
  [KEY_CODES.CTRL_C]: {
    key: 'Ctrl+C',
    description: 'Quit',
    handler: handleQuit,
  },
  [KEY_CODES.LOWERCASE_N]: {
    key: 'n',
    description: 'New session (coming soon)',
    handler: handleNewSession,
  },
  [KEY_CODES.LOWERCASE_X]: {
    key: 'x',
    description: 'Stop selected session (coming soon)',
    handler: handleStopSession,
  },
  [KEY_CODES.QUESTION_MARK]: {
    key: '?',
    description: 'Toggle help (coming soon)',
    handler: handleToggleHelp,
  },
};

/**
 * Main key press handler.
 * Routes raw key input to the appropriate handler based on key bindings.
 *
 * In attached mode, only Esc is processed (to detach). All other keys are ignored
 * so they can be forwarded to the attached session.
 *
 * In navigation mode, all key bindings are active.
 *
 * @param state - Current TUI state
 * @param key - Raw key input from terminal
 * @returns Updated state or quit signal
 */
export const handleKeypress: KeyHandler = (state, key) => {
  // In attached mode, only allow Esc to detach
  // All other keys should be forwarded to the session (handled by Router)
  if (state.mode === 'attached') {
    if (key === KEY_CODES.ESCAPE) {
      return handleDetach(state);
    }
    // Ignore all other keys — they'll be forwarded to the session
    return state;
  }

  // In navigation mode, process all key bindings
  const binding = KEY_BINDINGS[key];

  if (binding) {
    return binding.handler(state);
  }

  // Unknown key — ignore
  return state;
};
