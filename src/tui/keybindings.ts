import type {
  TUIState,
  TUIAction,
  OverlayState,
  ActionMenuOverlayState,
  SessionCreationOverlayState,
  ConfirmationOverlayState,
  HelpOverlayState,
  HistorySearchOverlayState,
  ActionMenuItem,
  ConfirmableAction,
} from './types.js';
import {
  topOverlay,
  popOverlay,
  pushOverlay,
  replaceTopOverlay,
} from './overlay-helpers.js';
import {
  type KeybindingConfig,
  DEFAULT_KEYBINDINGS,
  matchesKey,
} from '../config/keybindings.js';

/**
 * Key code constants for terminal input.
 * These are the raw escape sequences sent by terminal emulators.
 */
export const KEY_CODES = {
  TAB: '\t',
  SHIFT_TAB: '\x1b[Z',
  UP_ARROW: '\x1b[A',
  DOWN_ARROW: '\x1b[B',
  LEFT_ARROW: '\x1b[D',
  RIGHT_ARROW: '\x1b[C',
  ENTER: '\r',
  ESCAPE: '\x1b',
  CTRL_C: '\x03',
  CTRL_A: '\x01',
  BACKSPACE: '\x7f',
  LOWERCASE_Q: 'q',
  LOWERCASE_N: 'n',
  LOWERCASE_V: 'v',
  LOWERCASE_X: 'x',
  LOWERCASE_Y: 'y',
  QUESTION_MARK: '?',
  CTRL_R: '\x12',
  LEFT_BRACKET: '[',
  RIGHT_BRACKET: ']',
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

// ── Split mode helpers ───────────────────────────────────────────────────────

/**
 * Toggle split mode. When entering split mode, auto-populate pane sessions
 * from the selected session (pane 0) and the next session (pane 1).
 */
export function toggleSplitMode(state: TUIState): TUIState {
  if (state.splitMode) {
    return {
      ...state,
      splitMode: false,
      splitPaneSessions: [null, null],
      activePaneIndex: 0,
    };
  }

  // Auto-populate panes: pane 0 = selected session, pane 1 = next session
  const sessions = state.sessions;
  const selectedIndex = sessions.findIndex((s) => s.name === state.selectedSessionName);
  const pane0 = sessions[selectedIndex]?.name ?? sessions[0]?.name ?? null;
  const pane1 = sessions[(selectedIndex + 1) % sessions.length]?.name ?? null;

  return {
    ...state,
    splitMode: true,
    splitPaneSessions: [pane0, pane1],
    activePaneIndex: 0,
  };
}

/**
 * Switch active pane in split mode. Cycles between 0 and 1.
 */
export function switchActivePane(state: TUIState, _direction: 'next' | 'prev'): TUIState {
  if (!state.splitMode) return state;
  const newIndex: 0 | 1 = state.activePaneIndex === 0 ? 1 : 0;
  return { ...state, activePaneIndex: newIndex };
}

/**
 * Assign the currently selected session to the active split pane.
 */
export function assignSessionToActivePane(state: TUIState): TUIState {
  if (!state.splitMode || !state.selectedSessionName) return state;
  const updated: [string | null, string | null] = [...state.splitPaneSessions] as [string | null, string | null];
  updated[state.activePaneIndex] = state.selectedSessionName;
  return { ...state, splitPaneSessions: updated };
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
  keybindings: Required<KeybindingConfig> = DEFAULT_KEYBINDINGS,
): KeyHandlerResult {
  // Configurable bindings: next/prev session, attach, stop, new, help, quit
  if (key === KEY_CODES.TAB || key === KEY_CODES.DOWN_ARROW || matchesKey(key, keybindings.nextSession)) {
    return stateResult(selectNextSession(state));
  }

  if (key === KEY_CODES.SHIFT_TAB || key === KEY_CODES.UP_ARROW || matchesKey(key, keybindings.prevSession)) {
    return stateResult(selectPreviousSession(state));
  }

  if (key === KEY_CODES.ENTER || matchesKey(key, keybindings.attachSession)) {
    if (!state.selectedSessionName) return stateResult(state);
    // In split mode, Enter assigns the selected session to the active pane
    if (state.splitMode) {
      return stateResult(assignSessionToActivePane(state));
    }
    return stateResult({
      ...state,
      attachedSessionName: state.selectedSessionName,
      mode: 'attached',
    });
  }

  if (matchesKey(key, keybindings.newSession)) {
    return stateResult(
      pushOverlay(state, {
        kind: 'session-creation',
        fields: { name: '', template: '', directory: '.', permissionMode: 'bypassPermissions' },
        activeField: 'name',
        errors: { name: '', template: '', directory: '', permissionMode: '' },
        isSubmitting: false,
      }),
    );
  }

  if (matchesKey(key, keybindings.stopSession)) {
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

  if (matchesKey(key, keybindings.toggleHelp)) {
    return stateResult(
      pushOverlay(state, { kind: 'help', scrollOffset: 0 }),
    );
  }

  if (matchesKey(key, keybindings.quit) || key === KEY_CODES.CTRL_C) {
    return quitResult();
  }

  // Non-configurable: action menu (Ctrl+A)
  if (key === KEY_CODES.CTRL_A) {
    return stateResult(
      pushOverlay(state, {
        kind: 'action-menu',
        selectedIndex: 0,
        targetSessionName: state.selectedSessionName,
      }),
    );
  }

  // Split mode: 'v' toggles split view
  if (key === KEY_CODES.LOWERCASE_V) {
    return stateResult(toggleSplitMode(state));
  }

  // Split mode pane navigation: '['/Left arrow = prev pane, ']'/Right arrow = next pane
  if (state.splitMode) {
    if (key === KEY_CODES.LEFT_BRACKET || key === KEY_CODES.LEFT_ARROW) {
      return stateResult(switchActivePane(state, 'prev'));
    }
    if (key === KEY_CODES.RIGHT_BRACKET || key === KEY_CODES.RIGHT_ARROW) {
      return stateResult(switchActivePane(state, 'next'));
    }
  }

  return stateResult(state);
}

// ── Attached mode handler ────────────────────────────────────────────────────

export function handleAttachedKeypress(
  state: TUIState,
  key: string,
  keybindings: Required<KeybindingConfig> = DEFAULT_KEYBINDINGS,
): KeyHandlerResult {
  if (key === KEY_CODES.ESCAPE || matchesKey(key, keybindings.detachSession)) {
    return stateResult({
      ...state,
      attachedSessionName: null,
      mode: 'navigation',
    });
  }

  if (key === KEY_CODES.CTRL_R) {
    return stateResult(
      pushOverlay(state, {
        kind: 'history-search',
        query: '',
        results: [],
        selectedIndex: 0,
        isLoading: false,
      }),
    );
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
          fields: { name: '', template: '', directory: '.', permissionMode: 'bypassPermissions' },
          activeField: 'name',
          errors: { name: '', template: '', directory: '', permissionMode: '' },
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

    case KEY_CODES.TAB: {
      const fieldOrder: SessionCreationOverlayState['activeField'][] = [
        'name', 'template', 'directory', 'permissionMode',
      ];
      const currentIdx = fieldOrder.indexOf(overlay.activeField);
      const nextField = fieldOrder[(currentIdx + 1) % fieldOrder.length];
      return stateResult(
        replaceTopOverlay(state, {
          ...overlay,
          activeField: nextField,
        }),
      );
    }

    case KEY_CODES.SHIFT_TAB: {
      const fieldOrder: SessionCreationOverlayState['activeField'][] = [
        'name', 'template', 'directory', 'permissionMode',
      ];
      const currentIdx = fieldOrder.indexOf(overlay.activeField);
      const prevField = fieldOrder[(currentIdx - 1 + fieldOrder.length) % fieldOrder.length];
      return stateResult(
        replaceTopOverlay(state, {
          ...overlay,
          activeField: prevField,
        }),
      );
    }

    case KEY_CODES.ENTER: {
      // Validate
      const errors = { name: '', template: '', directory: '', permissionMode: '' };
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

      const trimmedTemplate = overlay.fields.template.trim();
      if (trimmedTemplate) {
        return actionResult(popped, {
          kind: 'create-session-from-template',
          name: trimmedName,
          templateName: trimmedTemplate,
          directory: overlay.fields.directory || '.',
          permissionMode: overlay.fields.permissionMode || 'bypassPermissions',
        });
      }

      return actionResult(popped, {
        kind: 'create-session',
        name: trimmedName,
        directory: overlay.fields.directory || '.',
        permissionMode: overlay.fields.permissionMode || 'bypassPermissions',
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

// ── History search handler ───────────────────────────────────────────────────

export function handleHistorySearchKeypress(
  state: TUIState,
  overlay: HistorySearchOverlayState,
  key: string,
): KeyHandlerResult {
  switch (key) {
    case KEY_CODES.ESCAPE:
      return stateResult(popOverlay(state));

    case KEY_CODES.UP_ARROW: {
      const newIndex = Math.max(0, overlay.selectedIndex - 1);
      return stateResult(
        replaceTopOverlay(state, { ...overlay, selectedIndex: newIndex }),
      );
    }

    case KEY_CODES.DOWN_ARROW: {
      const newIndex = Math.min(
        overlay.results.length - 1,
        overlay.selectedIndex + 1,
      );
      return stateResult(
        replaceTopOverlay(state, {
          ...overlay,
          selectedIndex: Math.max(0, newIndex),
        }),
      );
    }

    case KEY_CODES.ENTER: {
      if (overlay.results.length === 0) return stateResult(state);
      const selected = overlay.results[overlay.selectedIndex];
      if (!selected) return stateResult(state);
      const popped = popOverlay(state);
      return actionResult(popped, {
        kind: 'history-insert',
        prompt: selected.prompt,
      });
    }

    case KEY_CODES.BACKSPACE: {
      if (overlay.query.length === 0) return stateResult(state);
      const newQuery = overlay.query.slice(0, -1);
      const sessionName = state.attachedSessionName ?? undefined;
      const updated = replaceTopOverlay(state, {
        ...overlay,
        query: newQuery,
        selectedIndex: 0,
        isLoading: true,
      });
      return actionResult(updated, {
        kind: 'history-search-load',
        sessionName,
        query: newQuery,
      });
    }

    default: {
      // Only accept printable single characters
      if (key.length === 1 && key >= ' ' && key <= '~') {
        const newQuery = overlay.query + key;
        const sessionName = state.attachedSessionName ?? undefined;
        const updated = replaceTopOverlay(state, {
          ...overlay,
          query: newQuery,
          selectedIndex: 0,
          isLoading: true,
        });
        return actionResult(updated, {
          kind: 'history-search-load',
          sessionName,
          query: newQuery,
        });
      }
      return stateResult(state);
    }
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
    case 'history-search':
      return handleHistorySearchKeypress(state, overlay, key);
  }
}

// ── Main dispatch function ───────────────────────────────────────────────────

/**
 * Main key press handler.
 * Checks overlay stack first (topmost overlay captures all input),
 * then falls back to base mode handler.
 *
 * @param keybindings - resolved keybinding config (defaults used when omitted)
 */
export function handleKeypress(
  state: TUIState,
  key: string,
  keybindings: Required<KeybindingConfig> = DEFAULT_KEYBINDINGS,
): KeyHandlerResult {
  const overlay = topOverlay(state);

  if (overlay) {
    return handleOverlayKeypress(state, overlay, key);
  }

  switch (state.mode) {
    case 'navigation':
      return handleNavigationKeypress(state, key, keybindings);
    case 'attached':
      return handleAttachedKeypress(state, key, keybindings);
  }
}
