import { describe, it, expect } from 'vitest';
import {
  handleKeypress,
  handleNavigationKeypress,
  handleAttachedKeypress,
  handleHelpKeypress,
  handleActionMenuKeypress,
  handleSessionCreationKeypress,
  handleConfirmationKeypress,
  KEY_CODES,
} from './keybindings.js';
import type { KeyHandlerResult } from './keybindings.js';
import type {
  TUIState,
  TUIAction,
  HelpOverlayState,
  ActionMenuOverlayState,
  SessionCreationOverlayState,
  ConfirmationOverlayState,
} from './types.js';
import { SessionState } from '../types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMockState(sessionNames: string[]): TUIState {
  return {
    sessions: sessionNames.map((name) => ({
      name,
      pid: 1000,
      state: SessionState.Running,
      startedAt: new Date(),
      workingDirectory: '/tmp',
      promptCount: 0,
    })),
    selectedSessionName: sessionNames[0] ?? null,
    attachedSessionName: null,
    outputLines: [],
    isShuttingDown: false,
    mode: 'navigation',
    isProcessing: false,
    overlayStack: [],
    statusMessage: null,
  };
}

function expectState(result: KeyHandlerResult): TUIState {
  expect(result.kind).toBe('state');
  if (result.kind !== 'state') throw new Error('Expected state result');
  return result.state;
}

function expectQuit(result: KeyHandlerResult): void {
  expect(result.kind).toBe('quit');
}

function expectAction(result: KeyHandlerResult): {
  state: TUIState;
  action: TUIAction;
} {
  expect(result.kind).toBe('action');
  if (result.kind !== 'action') throw new Error('Expected action result');
  return result;
}

// ── Main handleKeypress dispatch ─────────────────────────────────────────────

describe('handleKeypress (dispatch)', () => {
  it('should delegate to navigation handler in navigation mode', () => {
    const state = createMockState(['a', 'b']);
    const result = handleKeypress(state, KEY_CODES.TAB);
    const s = expectState(result);
    expect(s.selectedSessionName).toBe('b');
  });

  it('should delegate to attached handler in attached mode', () => {
    const state = createMockState(['a']);
    state.mode = 'attached';
    state.attachedSessionName = 'a';
    const result = handleKeypress(state, KEY_CODES.ESCAPE);
    const s = expectState(result);
    expect(s.mode).toBe('navigation');
    expect(s.attachedSessionName).toBeNull();
  });

  it('should delegate to overlay handler when overlay is active', () => {
    const state = createMockState(['a']);
    state.overlayStack = [{ kind: 'help', scrollOffset: 0 }];
    const result = handleKeypress(state, KEY_CODES.ESCAPE);
    const s = expectState(result);
    expect(s.overlayStack).toHaveLength(0);
  });

  it('should give overlay priority over base mode', () => {
    const state = createMockState(['a', 'b']);
    state.mode = 'navigation';
    state.overlayStack = [{ kind: 'help', scrollOffset: 0 }];
    // Tab would select next session in navigation mode,
    // but help overlay captures it and ignores it
    const result = handleKeypress(state, KEY_CODES.TAB);
    const s = expectState(result);
    // Selection should not change because help overlay absorbed the key
    expect(s.selectedSessionName).toBe('a');
  });
});

// ── Navigation mode ──────────────────────────────────────────────────────────

describe('handleNavigationKeypress', () => {
  describe('Tab key (next session)', () => {
    it('should cycle to the next session', () => {
      const state = createMockState(['a', 'b', 'c']);
      const s = expectState(handleNavigationKeypress(state, KEY_CODES.TAB));
      expect(s.selectedSessionName).toBe('b');
    });

    it('should wrap around to the first session', () => {
      const state = createMockState(['a', 'b', 'c']);
      state.selectedSessionName = 'c';
      const s = expectState(handleNavigationKeypress(state, KEY_CODES.TAB));
      expect(s.selectedSessionName).toBe('a');
    });

    it('should select first session when none is selected', () => {
      const state = createMockState(['a', 'b']);
      state.selectedSessionName = null;
      const s = expectState(handleNavigationKeypress(state, KEY_CODES.TAB));
      expect(s.selectedSessionName).toBe('a');
    });

    it('should handle empty session list', () => {
      const state = createMockState([]);
      const s = expectState(handleNavigationKeypress(state, KEY_CODES.TAB));
      expect(s.selectedSessionName).toBeNull();
    });
  });

  describe('Shift+Tab key (previous session)', () => {
    it('should cycle to the previous session', () => {
      const state = createMockState(['a', 'b', 'c']);
      state.selectedSessionName = 'b';
      const s = expectState(
        handleNavigationKeypress(state, KEY_CODES.SHIFT_TAB),
      );
      expect(s.selectedSessionName).toBe('a');
    });

    it('should wrap around to the last session', () => {
      const state = createMockState(['a', 'b', 'c']);
      state.selectedSessionName = 'a';
      const s = expectState(
        handleNavigationKeypress(state, KEY_CODES.SHIFT_TAB),
      );
      expect(s.selectedSessionName).toBe('c');
    });

    it('should select last session when none is selected', () => {
      const state = createMockState(['a', 'b']);
      state.selectedSessionName = null;
      const s = expectState(
        handleNavigationKeypress(state, KEY_CODES.SHIFT_TAB),
      );
      expect(s.selectedSessionName).toBe('b');
    });
  });

  describe('Arrow keys', () => {
    it('should move up (same as previous session)', () => {
      const state = createMockState(['a', 'b', 'c']);
      state.selectedSessionName = 'b';
      const s = expectState(
        handleNavigationKeypress(state, KEY_CODES.UP_ARROW),
      );
      expect(s.selectedSessionName).toBe('a');
    });

    it('should move down (same as next session)', () => {
      const state = createMockState(['a', 'b', 'c']);
      state.selectedSessionName = 'b';
      const s = expectState(
        handleNavigationKeypress(state, KEY_CODES.DOWN_ARROW),
      );
      expect(s.selectedSessionName).toBe('c');
    });
  });

  describe('Enter key (attach)', () => {
    it('should attach to the selected session', () => {
      const state = createMockState(['a', 'b']);
      state.selectedSessionName = 'b';
      const s = expectState(handleNavigationKeypress(state, KEY_CODES.ENTER));
      expect(s.attachedSessionName).toBe('b');
      expect(s.mode).toBe('attached');
    });

    it('should not change state when no session is selected', () => {
      const state = createMockState(['a', 'b']);
      state.selectedSessionName = null;
      const s = expectState(handleNavigationKeypress(state, KEY_CODES.ENTER));
      expect(s.attachedSessionName).toBeNull();
    });
  });

  describe('Quit keys', () => {
    it('should quit on "q" key', () => {
      const state = createMockState(['a']);
      expectQuit(handleNavigationKeypress(state, KEY_CODES.LOWERCASE_Q));
    });

    it('should quit on Ctrl+C', () => {
      const state = createMockState(['a']);
      expectQuit(handleNavigationKeypress(state, KEY_CODES.CTRL_C));
    });
  });

  describe('"n" key (new session overlay)', () => {
    it('should push session-creation overlay', () => {
      const state = createMockState(['a']);
      const s = expectState(
        handleNavigationKeypress(state, KEY_CODES.LOWERCASE_N),
      );
      expect(s.overlayStack).toHaveLength(1);
      expect(s.overlayStack[0].kind).toBe('session-creation');
    });
  });

  describe('"x" key (stop session confirmation)', () => {
    it('should push confirmation overlay for selected session', () => {
      const state = createMockState(['my-session']);
      const s = expectState(
        handleNavigationKeypress(state, KEY_CODES.LOWERCASE_X),
      );
      expect(s.overlayStack).toHaveLength(1);
      expect(s.overlayStack[0].kind).toBe('confirmation');
      const confirm = s.overlayStack[0] as ConfirmationOverlayState;
      expect(confirm.action).toEqual({
        kind: 'stop-session',
        sessionName: 'my-session',
      });
    });

    it('should not push overlay when no session is selected', () => {
      const state = createMockState(['a']);
      state.selectedSessionName = null;
      const s = expectState(
        handleNavigationKeypress(state, KEY_CODES.LOWERCASE_X),
      );
      expect(s.overlayStack).toHaveLength(0);
    });
  });

  describe('Ctrl+A (action menu)', () => {
    it('should push action-menu overlay', () => {
      const state = createMockState(['a']);
      const s = expectState(
        handleNavigationKeypress(state, KEY_CODES.CTRL_A),
      );
      expect(s.overlayStack).toHaveLength(1);
      expect(s.overlayStack[0].kind).toBe('action-menu');
    });
  });

  describe('"?" key (help overlay)', () => {
    it('should push help overlay', () => {
      const state = createMockState(['a']);
      const s = expectState(
        handleNavigationKeypress(state, KEY_CODES.QUESTION_MARK),
      );
      expect(s.overlayStack).toHaveLength(1);
      expect(s.overlayStack[0].kind).toBe('help');
    });
  });

  describe('Unknown keys', () => {
    it('should ignore unknown keys', () => {
      const state = createMockState(['a']);
      const s = expectState(handleNavigationKeypress(state, 'z'));
      expect(s).toEqual(state);
    });
  });
});

// ── Attached mode ────────────────────────────────────────────────────────────

describe('handleAttachedKeypress', () => {
  it('should detach on Escape', () => {
    const state = createMockState(['a']);
    state.mode = 'attached';
    state.attachedSessionName = 'a';
    const s = expectState(handleAttachedKeypress(state, KEY_CODES.ESCAPE));
    expect(s.mode).toBe('navigation');
    expect(s.attachedSessionName).toBeNull();
  });

  it('should ignore all other keys', () => {
    const state = createMockState(['a', 'b']);
    state.mode = 'attached';
    state.attachedSessionName = 'a';
    state.selectedSessionName = 'a';

    const keys = [
      KEY_CODES.TAB,
      KEY_CODES.UP_ARROW,
      KEY_CODES.DOWN_ARROW,
      KEY_CODES.LOWERCASE_Q,
      KEY_CODES.LOWERCASE_N,
      'a',
      'z',
    ];

    for (const key of keys) {
      const s = expectState(handleAttachedKeypress(state, key));
      expect(s.mode).toBe('attached');
      expect(s.attachedSessionName).toBe('a');
    }
  });
});

// ── Help overlay ─────────────────────────────────────────────────────────────

describe('handleHelpKeypress', () => {
  const helpOverlay: HelpOverlayState = { kind: 'help', scrollOffset: 0 };

  function helpState(): TUIState {
    const state = createMockState(['a']);
    state.overlayStack = [{ ...helpOverlay }];
    return state;
  }

  it('should pop overlay on Escape', () => {
    const state = helpState();
    const s = expectState(handleHelpKeypress(state, helpOverlay, KEY_CODES.ESCAPE));
    expect(s.overlayStack).toHaveLength(0);
  });

  it('should pop overlay on "?"', () => {
    const state = helpState();
    const s = expectState(
      handleHelpKeypress(state, helpOverlay, KEY_CODES.QUESTION_MARK),
    );
    expect(s.overlayStack).toHaveLength(0);
  });

  it('should scroll down on Down arrow', () => {
    const state = helpState();
    const s = expectState(
      handleHelpKeypress(state, helpOverlay, KEY_CODES.DOWN_ARROW),
    );
    expect(s.overlayStack).toHaveLength(1);
    expect((s.overlayStack[0] as HelpOverlayState).scrollOffset).toBe(1);
  });

  it('should scroll up on Up arrow (clamped at 0)', () => {
    const state = helpState();
    const s = expectState(
      handleHelpKeypress(state, helpOverlay, KEY_CODES.UP_ARROW),
    );
    expect((s.overlayStack[0] as HelpOverlayState).scrollOffset).toBe(0);
  });

  it('should scroll up from non-zero offset', () => {
    const state = helpState();
    const overlay: HelpOverlayState = { kind: 'help', scrollOffset: 5 };
    state.overlayStack = [overlay];
    const s = expectState(
      handleHelpKeypress(state, overlay, KEY_CODES.UP_ARROW),
    );
    expect((s.overlayStack[0] as HelpOverlayState).scrollOffset).toBe(4);
  });

  it('should ignore unknown keys', () => {
    const state = helpState();
    const s = expectState(handleHelpKeypress(state, helpOverlay, 'z'));
    expect(s.overlayStack).toHaveLength(1);
  });
});

// ── Action menu overlay ──────────────────────────────────────────────────────

describe('handleActionMenuKeypress', () => {
  function menuState(): { state: TUIState; overlay: ActionMenuOverlayState } {
    const state = createMockState(['session-a']);
    const overlay: ActionMenuOverlayState = {
      kind: 'action-menu',
      selectedIndex: 0,
      targetSessionName: 'session-a',
    };
    state.overlayStack = [overlay];
    return { state, overlay };
  }

  it('should pop overlay on Escape', () => {
    const { state, overlay } = menuState();
    const s = expectState(
      handleActionMenuKeypress(state, overlay, KEY_CODES.ESCAPE),
    );
    expect(s.overlayStack).toHaveLength(0);
  });

  it('should navigate down', () => {
    const { state, overlay } = menuState();
    const s = expectState(
      handleActionMenuKeypress(state, overlay, KEY_CODES.DOWN_ARROW),
    );
    expect(
      (s.overlayStack[0] as ActionMenuOverlayState).selectedIndex,
    ).toBe(1);
  });

  it('should navigate up (wrap to last)', () => {
    const { state, overlay } = menuState();
    const s = expectState(
      handleActionMenuKeypress(state, overlay, KEY_CODES.UP_ARROW),
    );
    // Should wrap to last item (menu has 5 items: new-session, stop-session, stop-all, help, quit)
    expect(
      (s.overlayStack[0] as ActionMenuOverlayState).selectedIndex,
    ).toBe(4);
  });

  it('should execute "New Session" item on Enter (push session-creation overlay)', () => {
    const { state, overlay } = menuState();
    // Index 0 = "New Session"
    const result = handleActionMenuKeypress(state, overlay, KEY_CODES.ENTER);
    const s = expectState(result);
    // Action menu should be popped, session-creation should be pushed
    expect(s.overlayStack).toHaveLength(1);
    expect(s.overlayStack[0].kind).toBe('session-creation');
  });

  it('should execute "Help" item on Enter (push help overlay)', () => {
    const { state, overlay: base } = menuState();
    // Index 3 = "Help"
    const overlay = { ...base, selectedIndex: 3 };
    state.overlayStack = [overlay];
    const result = handleActionMenuKeypress(state, overlay, KEY_CODES.ENTER);
    const s = expectState(result);
    expect(s.overlayStack).toHaveLength(1);
    expect(s.overlayStack[0].kind).toBe('help');
  });

  it('should quit when selecting "Quit"', () => {
    const { state, overlay: base } = menuState();
    // Index 4 = "Quit"
    const overlay = { ...base, selectedIndex: 4 };
    state.overlayStack = [overlay];
    expectQuit(handleActionMenuKeypress(state, overlay, KEY_CODES.ENTER));
  });

  it('should push confirmation for "Stop Session" if selected session is running', () => {
    const { state, overlay: base } = menuState();
    // Index 1 = "Stop Session"
    const overlay = { ...base, selectedIndex: 1 };
    state.overlayStack = [overlay];
    const result = handleActionMenuKeypress(state, overlay, KEY_CODES.ENTER);
    const s = expectState(result);
    expect(s.overlayStack).toHaveLength(1);
    expect(s.overlayStack[0].kind).toBe('confirmation');
  });

  it('should push confirmation for "Stop All"', () => {
    const { state, overlay: base } = menuState();
    // Index 2 = "Stop All"
    const overlay = { ...base, selectedIndex: 2 };
    state.overlayStack = [overlay];
    const result = handleActionMenuKeypress(state, overlay, KEY_CODES.ENTER);
    const s = expectState(result);
    expect(s.overlayStack).toHaveLength(1);
    expect(s.overlayStack[0].kind).toBe('confirmation');
  });
});

// ── Session creation overlay ─────────────────────────────────────────────────

describe('handleSessionCreationKeypress', () => {
  function creationState(): {
    state: TUIState;
    overlay: SessionCreationOverlayState;
  } {
    const state = createMockState(['existing']);
    const overlay: SessionCreationOverlayState = {
      kind: 'session-creation',
      fields: { name: '', directory: '.', permissionMode: 'bypassPermissions' },
      activeField: 'name',
      errors: { name: '', directory: '', permissionMode: '' },
      isSubmitting: false,
    };
    state.overlayStack = [overlay];
    return { state, overlay };
  }

  it('should pop overlay on Escape', () => {
    const { state, overlay } = creationState();
    const s = expectState(
      handleSessionCreationKeypress(state, overlay, KEY_CODES.ESCAPE),
    );
    expect(s.overlayStack).toHaveLength(0);
  });

  it('should switch fields on Tab', () => {
    const { state, overlay } = creationState();
    const s = expectState(
      handleSessionCreationKeypress(state, overlay, KEY_CODES.TAB),
    );
    expect(
      (s.overlayStack[0] as SessionCreationOverlayState).activeField,
    ).toBe('directory');
  });

  it('should cycle through all three fields in session creation', () => {
    const { state, overlay } = creationState();
    // Start at name
    expect(overlay.activeField).toBe('name');

    // Tab to directory
    const s1 = expectState(
      handleSessionCreationKeypress(state, overlay, KEY_CODES.TAB),
    );
    const o1 = s1.overlayStack[0] as SessionCreationOverlayState;
    expect(o1.activeField).toBe('directory');

    // Tab to permissionMode
    const s2 = expectState(
      handleSessionCreationKeypress(s1, o1, KEY_CODES.TAB),
    );
    const o2 = s2.overlayStack[0] as SessionCreationOverlayState;
    expect(o2.activeField).toBe('permissionMode');

    // Tab back to name
    const s3 = expectState(
      handleSessionCreationKeypress(s2, o2, KEY_CODES.TAB),
    );
    const o3 = s3.overlayStack[0] as SessionCreationOverlayState;
    expect(o3.activeField).toBe('name');
  });

  it('should switch fields back on Shift+Tab', () => {
    const { state, overlay: base } = creationState();
    const overlay = { ...base, activeField: 'permissionMode' as const };
    state.overlayStack = [overlay];
    const s = expectState(
      handleSessionCreationKeypress(state, overlay, KEY_CODES.SHIFT_TAB),
    );
    expect(
      (s.overlayStack[0] as SessionCreationOverlayState).activeField,
    ).toBe('directory');
  });

  it('should append typed characters to active field', () => {
    const { state, overlay } = creationState();
    let s = expectState(handleSessionCreationKeypress(state, overlay, 'm'));
    let o = s.overlayStack[0] as SessionCreationOverlayState;
    expect(o.fields.name).toBe('m');

    s = expectState(handleSessionCreationKeypress(s, o, 'y'));
    o = s.overlayStack[0] as SessionCreationOverlayState;
    expect(o.fields.name).toBe('my');
  });

  it('should delete character on Backspace', () => {
    const { state, overlay: base } = creationState();
    const overlay = {
      ...base,
      fields: { ...base.fields, name: 'hello' },
    };
    state.overlayStack = [overlay];
    const s = expectState(
      handleSessionCreationKeypress(state, overlay, KEY_CODES.BACKSPACE),
    );
    expect(
      (s.overlayStack[0] as SessionCreationOverlayState).fields.name,
    ).toBe('hell');
  });

  it('should not delete when field is empty', () => {
    const { state, overlay } = creationState();
    const s = expectState(
      handleSessionCreationKeypress(state, overlay, KEY_CODES.BACKSPACE),
    );
    expect(s).toEqual(state);
  });

  it('should validate: error on empty name', () => {
    const { state, overlay } = creationState();
    const s = expectState(
      handleSessionCreationKeypress(state, overlay, KEY_CODES.ENTER),
    );
    expect(s.overlayStack).toHaveLength(1);
    expect(
      (s.overlayStack[0] as SessionCreationOverlayState).errors.name,
    ).toBe('Name is required');
  });

  it('should validate: error on duplicate name', () => {
    const { state, overlay: base } = creationState();
    const overlay = {
      ...base,
      fields: { ...base.fields, name: 'existing' },
    };
    state.overlayStack = [overlay];
    const s = expectState(
      handleSessionCreationKeypress(state, overlay, KEY_CODES.ENTER),
    );
    expect(
      (s.overlayStack[0] as SessionCreationOverlayState).errors.name,
    ).toContain('already exists');
  });

  it('should return action on valid submission', () => {
    const { state, overlay: base } = creationState();
    const overlay = {
      ...base,
      fields: { name: 'new-session', directory: '/tmp/project', permissionMode: 'bypassPermissions' },
    };
    state.overlayStack = [overlay];
    const result = handleSessionCreationKeypress(
      state,
      overlay,
      KEY_CODES.ENTER,
    );
    const { state: s, action } = expectAction(result);
    expect(s.overlayStack).toHaveLength(0);
    expect(action.kind).toBe('create-session');
    if (action.kind === 'create-session') {
      expect(action.name).toBe('new-session');
      expect(action.directory).toBe('/tmp/project');
      expect(action.permissionMode).toBe('bypassPermissions');
    }
  });

  it('should clear error when typing after validation failure', () => {
    const { state, overlay: base } = creationState();
    // First trigger validation error
    const overlay = {
      ...base,
      errors: { name: 'Name is required', directory: '', permissionMode: '' },
    };
    state.overlayStack = [overlay];
    const s = expectState(handleSessionCreationKeypress(state, overlay, 'a'));
    expect(
      (s.overlayStack[0] as SessionCreationOverlayState).errors.name,
    ).toBe('');
  });

  it('should ignore non-printable characters', () => {
    const { state, overlay } = creationState();
    const s = expectState(
      handleSessionCreationKeypress(state, overlay, '\x1b[A'),
    );
    expect(
      (s.overlayStack[0] as SessionCreationOverlayState).fields.name,
    ).toBe('');
  });
});

// ── Confirmation overlay ─────────────────────────────────────────────────────

describe('handleConfirmationKeypress', () => {
  function confirmState(): {
    state: TUIState;
    overlay: ConfirmationOverlayState;
  } {
    const state = createMockState(['target']);
    const overlay: ConfirmationOverlayState = {
      kind: 'confirmation',
      title: 'Stop session "target"?',
      message: 'This will send SIGTERM.',
      action: { kind: 'stop-session', sessionName: 'target' },
    };
    state.overlayStack = [overlay];
    return { state, overlay };
  }

  it('should confirm on "y" and return stop-session action', () => {
    const { state, overlay } = confirmState();
    const result = handleConfirmationKeypress(
      state,
      overlay,
      KEY_CODES.LOWERCASE_Y,
    );
    const { state: s, action } = expectAction(result);
    expect(s.overlayStack).toHaveLength(0);
    expect(action.kind).toBe('stop-session');
  });

  it('should confirm on Enter', () => {
    const { state, overlay } = confirmState();
    const result = handleConfirmationKeypress(
      state,
      overlay,
      KEY_CODES.ENTER,
    );
    const { action } = expectAction(result);
    expect(action.kind).toBe('stop-session');
  });

  it('should cancel on "n"', () => {
    const { state, overlay } = confirmState();
    const s = expectState(
      handleConfirmationKeypress(state, overlay, KEY_CODES.LOWERCASE_N),
    );
    expect(s.overlayStack).toHaveLength(0);
  });

  it('should cancel on Escape', () => {
    const { state, overlay } = confirmState();
    const s = expectState(
      handleConfirmationKeypress(state, overlay, KEY_CODES.ESCAPE),
    );
    expect(s.overlayStack).toHaveLength(0);
  });

  it('should ignore unknown keys', () => {
    const { state, overlay } = confirmState();
    const s = expectState(handleConfirmationKeypress(state, overlay, 'z'));
    expect(s.overlayStack).toHaveLength(1);
  });

  it('should handle stop-all confirmation', () => {
    const state = createMockState(['a', 'b']);
    const overlay: ConfirmationOverlayState = {
      kind: 'confirmation',
      title: 'Stop all?',
      message: 'Will stop everything.',
      action: { kind: 'stop-all' },
    };
    state.overlayStack = [overlay];
    const result = handleConfirmationKeypress(
      state,
      overlay,
      KEY_CODES.LOWERCASE_Y,
    );
    const { action } = expectAction(result);
    expect(action.kind).toBe('stop-all');
  });

  it('should handle restart-session confirmation', () => {
    const state = createMockState(['target']);
    const overlay: ConfirmationOverlayState = {
      kind: 'confirmation',
      title: 'Restart?',
      message: 'Will restart.',
      action: { kind: 'restart-session', sessionName: 'target' },
    };
    state.overlayStack = [overlay];
    const result = handleConfirmationKeypress(
      state,
      overlay,
      KEY_CODES.LOWERCASE_Y,
    );
    const { action } = expectAction(result);
    expect(action.kind).toBe('restart-session');
  });
});
