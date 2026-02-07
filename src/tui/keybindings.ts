import type {
  TUIState,
  TUIAction,
  OverlayState,
  ActionMenuOverlayState,
  SessionCreationOverlayState,
  ConfirmationOverlayState,
  HelpOverlayState,
  ActionMenuItem,
  ConfirmableAction,
} from './types.js';
import {
  topOverlay,
  popOverlay,
  pushOverlay,
  replaceTopOverlay,
} from './overlay-helpers.js';

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
  CTRL_A: '\x01',
  BACKSPACE: '\x7f',
  LOWERCASE_Q: 'q',
  LOWERCASE_N: 'n',
  LOWERCASE_X: 'x',
  LOWERCASE_Y: 'y',
  QUESTION_MARK: '?',
} as const;

/**
 * Result type for key handlers.
 * Discriminated union supporting pure state updates, quit, or state + side effect.
 */
export type KeyHandlerResult =
  | { kind: 'state'; state: TUIState }
  | { kind: 'quit' }
  | { kind: 'action'; state: TUIState; action: TUIAction };

// ── Helper: wrap a state into a KeyHandlerResult ─────────────────────────────

function stateResult(state: TUIState): KeyHandlerResult {
  return { kind: 'state', state };
}

function quitResult(): KeyHandlerResult {
  return { kind: 'quit' };
}

function actionResult(state: TUIState, action: TUIAction): KeyHandlerResult {
  return { kind: 'action', state, action };
}

// ── Session navigation helpers ───────────────────────────────────────────────

function selectNextSession(state: TUIState): TUIState {
  if (state.sessions.length === 0) return state;
  const currentIndex = state.sessions.findIndex(
    (s) => s.name === state.selectedSessionName,
  );
  const nextIndex =
    currentIndex === -1 ? 0 : (currentIndex + 1) % state.sessions.length;
  return { ...state, selectedSessionName: state.sessions[nextIndex].name };
}

function selectPreviousSession(state: TUIState): TUIState {
  if (state.sessions.length === 0) return state;
  const currentIndex = state.sessions.findIndex(
    (s) => s.name === state.selectedSessionName,
  );
  const previousIndex =
    currentIndex === -1
      ? state.sessions.length - 1
      : currentIndex === 0
        ? state.sessions.length - 1
        : currentIndex - 1;
  return { ...state, selectedSessionName: state.sessions[previousIndex].name };
}

// ── Action menu items ────────────────────────────────────────────────────────

function getActionMenuItems(state: TUIState): ActionMenuItem[] {
  const hasSelected = state.selectedSessionName !== null;
  const selectedSession = hasSelected
    ? state.sessions.find((s) => s.name === state.selectedSessionName)
    : undefined;
  const hasSelectedRunning = selectedSession?.state === 'running';
  const hasRunningSessions = state.sessions.some((s) => s.state === 'running');

  return [
    {
      id: 'new-session',
      label: 'New Session',
      description: 'Create a new Claude session',
      shortcut: 'n',
      enabled: true,
    },
    {
      id: 'stop-session',
      label: 'Stop Session',
      description: 'Stop the selected session',
      shortcut: 'x',
      enabled: hasSelected && hasSelectedRunning === true,
    },
    {
      id: 'stop-all',
      label: 'Stop All',
      description: 'Stop all running sessions',
      enabled: hasRunningSessions,
    },
    {
      id: 'help',
      label: 'Help',
      description: 'Show keyboard shortcuts',
      shortcut: '?',
      enabled: true,
    },
    {
      id: 'quit',
      label: 'Quit',
      description: 'Exit AgentSpawn',
      shortcut: 'q',
      enabled: true,
    },
  ];
}

// ── Navigation mode handler ──────────────────────────────────────────────────

export function handleNavigationKeypress(
  state: TUIState,
  key: string,
): KeyHandlerResult {
  switch (key) {
    case KEY_CODES.TAB:
    case KEY_CODES.DOWN_ARROW:
      return stateResult(selectNextSession(state));

    case KEY_CODES.SHIFT_TAB:
    case KEY_CODES.UP_ARROW:
      return stateResult(selectPreviousSession(state));

    case KEY_CODES.ENTER: {
      if (!state.selectedSessionName) return stateResult(state);
      return stateResult({
        ...state,
        attachedSessionName: state.selectedSessionName,
        mode: 'attached',
      });
    }

    case KEY_CODES.LOWERCASE_N:
      return stateResult(
        pushOverlay(state, {
          kind: 'session-creation',
          fields: { name: '', directory: '.' },
          activeField: 'name',
          errors: { name: '', directory: '' },
          isSubmitting: false,
        }),
      );

    case KEY_CODES.LOWERCASE_X: {
      if (!state.selectedSessionName) return stateResult(state);
      return stateResult(
        pushOverlay(state, {
          kind: 'confirmation',
          title: `Stop session "${state.selectedSessionName}"?`,
          message: 'This will send SIGTERM to the running process.',
          action: {
            kind: 'stop-session',
            sessionName: state.selectedSessionName,
          },
        }),
      );
    }

    case KEY_CODES.CTRL_A:
      return stateResult(
        pushOverlay(state, {
          kind: 'action-menu',
          selectedIndex: 0,
          targetSessionName: state.selectedSessionName,
        }),
      );

    case KEY_CODES.QUESTION_MARK:
      return stateResult(
        pushOverlay(state, { kind: 'help', scrollOffset: 0 }),
      );

    case KEY_CODES.LOWERCASE_Q:
    case KEY_CODES.CTRL_C:
      return quitResult();

    default:
      return stateResult(state);
  }
}

// ── Attached mode handler ────────────────────────────────────────────────────

export function handleAttachedKeypress(
  state: TUIState,
  key: string,
): KeyHandlerResult {
  if (key === KEY_CODES.ESCAPE) {
    return stateResult({
      ...state,
      attachedSessionName: null,
      mode: 'navigation',
    });
  }
  // All other keys are handled by InputBar, not by keybinding dispatch
  return stateResult(state);
}

// ── Help overlay handler ─────────────────────────────────────────────────────

export function handleHelpKeypress(
  state: TUIState,
  _overlay: HelpOverlayState,
  key: string,
): KeyHandlerResult {
  switch (key) {
    case KEY_CODES.ESCAPE:
    case KEY_CODES.QUESTION_MARK:
      return stateResult(popOverlay(state));

    case KEY_CODES.UP_ARROW:
      return stateResult(
        replaceTopOverlay(state, {
          ..._overlay,
          scrollOffset: Math.max(0, _overlay.scrollOffset - 1),
        }),
      );

    case KEY_CODES.DOWN_ARROW:
      return stateResult(
        replaceTopOverlay(state, {
          ..._overlay,
          scrollOffset: _overlay.scrollOffset + 1,
        }),
      );

    default:
      return stateResult(state);
  }
}

// ── Action menu handler ──────────────────────────────────────────────────────

export function handleActionMenuKeypress(
  state: TUIState,
  overlay: ActionMenuOverlayState,
  key: string,
): KeyHandlerResult {
  const items = getActionMenuItems(state);

  switch (key) {
    case KEY_CODES.ESCAPE:
      return stateResult(popOverlay(state));

    case KEY_CODES.UP_ARROW: {
      const newIndex =
        overlay.selectedIndex <= 0
          ? items.length - 1
          : overlay.selectedIndex - 1;
      return stateResult(
        replaceTopOverlay(state, { ...overlay, selectedIndex: newIndex }),
      );
    }

    case KEY_CODES.DOWN_ARROW: {
      const newIndex =
        overlay.selectedIndex >= items.length - 1
          ? 0
          : overlay.selectedIndex + 1;
      return stateResult(
        replaceTopOverlay(state, { ...overlay, selectedIndex: newIndex }),
      );
    }

    case KEY_CODES.ENTER: {
      const selectedItem = items[overlay.selectedIndex];
      if (!selectedItem || !selectedItem.enabled) return stateResult(state);
      return executeMenuItem(state, selectedItem);
    }

    default:
      return stateResult(state);
  }
}

function executeMenuItem(
  state: TUIState,
  item: ActionMenuItem,
): KeyHandlerResult {
  const popped = popOverlay(state);

  switch (item.id) {
    case 'new-session':
      return stateResult(
        pushOverlay(popped, {
          kind: 'session-creation',
          fields: { name: '', directory: '.' },
          activeField: 'name',
          errors: { name: '', directory: '' },
          isSubmitting: false,
        }),
      );

    case 'stop-session': {
      if (!state.selectedSessionName) return stateResult(popped);
      return stateResult(
        pushOverlay(popped, {
          kind: 'confirmation',
          title: `Stop session "${state.selectedSessionName}"?`,
          message: 'This will send SIGTERM to the running process.',
          action: {
            kind: 'stop-session',
            sessionName: state.selectedSessionName,
          },
        }),
      );
    }

    case 'stop-all':
      return stateResult(
        pushOverlay(popped, {
          kind: 'confirmation',
          title: `Stop all ${state.sessions.filter((s) => s.state === 'running').length} sessions?`,
          message: 'This will send SIGTERM to all running processes.',
          action: { kind: 'stop-all' },
        }),
      );

    case 'help':
      return stateResult(
        pushOverlay(popped, { kind: 'help', scrollOffset: 0 }),
      );

    case 'quit':
      return quitResult();

    default:
      return stateResult(popped);
  }
}

// ── Session creation handler ─────────────────────────────────────────────────

export function handleSessionCreationKeypress(
  state: TUIState,
  overlay: SessionCreationOverlayState,
  key: string,
): KeyHandlerResult {
  switch (key) {
    case KEY_CODES.ESCAPE:
      return stateResult(popOverlay(state));

    case KEY_CODES.TAB:
      return stateResult(
        replaceTopOverlay(state, {
          ...overlay,
          activeField: overlay.activeField === 'name' ? 'directory' : 'name',
        }),
      );

    case KEY_CODES.SHIFT_TAB:
      return stateResult(
        replaceTopOverlay(state, {
          ...overlay,
          activeField: overlay.activeField === 'name' ? 'directory' : 'name',
        }),
      );

    case KEY_CODES.ENTER: {
      // Validate
      const errors = { name: '', directory: '' };
      const trimmedName = overlay.fields.name.trim();

      if (!trimmedName) {
        errors.name = 'Name is required';
      } else if (state.sessions.some((s) => s.name === trimmedName)) {
        errors.name = `Session "${trimmedName}" already exists`;
      }

      if (errors.name) {
        return stateResult(
          replaceTopOverlay(state, { ...overlay, errors }),
        );
      }

      // Valid: pop overlay, mark submitting, return action
      const submitting = replaceTopOverlay(state, {
        ...overlay,
        isSubmitting: true,
        errors,
      });
      const popped = popOverlay(submitting);
      return actionResult(popped, {
        kind: 'create-session',
        name: trimmedName,
        directory: overlay.fields.directory || '.',
      });
    }

    case KEY_CODES.BACKSPACE: {
      const field = overlay.activeField;
      const currentValue = overlay.fields[field];
      if (currentValue.length === 0) return stateResult(state);
      return stateResult(
        replaceTopOverlay(state, {
          ...overlay,
          fields: {
            ...overlay.fields,
            [field]: currentValue.slice(0, -1),
          },
          errors: { ...overlay.errors, [field]: '' },
        }),
      );
    }

    default: {
      // Only accept printable single characters for text input
      if (key.length === 1 && key >= ' ' && key <= '~') {
        const field = overlay.activeField;
        return stateResult(
          replaceTopOverlay(state, {
            ...overlay,
            fields: {
              ...overlay.fields,
              [field]: overlay.fields[field] + key,
            },
            errors: { ...overlay.errors, [field]: '' },
          }),
        );
      }
      return stateResult(state);
    }
  }
}

// ── Confirmation handler ─────────────────────────────────────────────────────

export function handleConfirmationKeypress(
  state: TUIState,
  overlay: ConfirmationOverlayState,
  key: string,
): KeyHandlerResult {
  switch (key) {
    case KEY_CODES.LOWERCASE_Y:
    case KEY_CODES.ENTER: {
      const popped = popOverlay(state);
      return confirmableActionToResult(popped, overlay.action);
    }

    case KEY_CODES.LOWERCASE_N:
    case KEY_CODES.ESCAPE:
      return stateResult(popOverlay(state));

    default:
      return stateResult(state);
  }
}

function confirmableActionToResult(
  state: TUIState,
  action: ConfirmableAction,
): KeyHandlerResult {
  switch (action.kind) {
    case 'stop-session':
      return actionResult(state, {
        kind: 'stop-session',
        sessionName: action.sessionName,
      });
    case 'restart-session':
      return actionResult(state, {
        kind: 'restart-session',
        sessionName: action.sessionName,
      });
    case 'stop-all':
      return actionResult(state, { kind: 'stop-all' });
  }
}

// ── Overlay dispatch ─────────────────────────────────────────────────────────

function handleOverlayKeypress(
  state: TUIState,
  overlay: OverlayState,
  key: string,
): KeyHandlerResult {
  switch (overlay.kind) {
    case 'help':
      return handleHelpKeypress(state, overlay, key);
    case 'action-menu':
      return handleActionMenuKeypress(state, overlay, key);
    case 'session-creation':
      return handleSessionCreationKeypress(state, overlay, key);
    case 'confirmation':
      return handleConfirmationKeypress(state, overlay, key);
  }
}

// ── Main dispatch function ───────────────────────────────────────────────────

/**
 * Main key press handler.
 * Checks overlay stack first (topmost overlay captures all input),
 * then falls back to base mode handler.
 */
export function handleKeypress(
  state: TUIState,
  key: string,
): KeyHandlerResult {
  const overlay = topOverlay(state);

  if (overlay) {
    return handleOverlayKeypress(state, overlay, key);
  }

  switch (state.mode) {
    case 'navigation':
      return handleNavigationKeypress(state, key);
    case 'attached':
      return handleAttachedKeypress(state, key);
  }
}
