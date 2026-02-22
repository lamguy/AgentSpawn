import { describe, it, expect } from 'vitest';
import {
  toggleSplitMode,
  switchActivePane,
  assignSessionToActivePane,
  handleNavigationKeypress,
  KEY_CODES,
} from './keybindings.js';
import type { TUIState } from './types.js';
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
    splitMode: false,
    splitPaneSessions: [null, null],
    activePaneIndex: 0,
    splitOutputLines: new Map(),
  };
}

// ── toggleSplitMode ──────────────────────────────────────────────────────────

describe('toggleSplitMode', () => {
  it('should enter split mode from navigation mode', () => {
    const state = createMockState(['session-a', 'session-b']);
    const next = toggleSplitMode(state);
    expect(next.splitMode).toBe(true);
  });

  it('should exit split mode when already in split mode', () => {
    const state = createMockState(['session-a', 'session-b']);
    state.splitMode = true;
    state.splitPaneSessions = ['session-a', 'session-b'];
    const next = toggleSplitMode(state);
    expect(next.splitMode).toBe(false);
    expect(next.splitPaneSessions).toEqual([null, null]);
    expect(next.activePaneIndex).toBe(0);
  });

  it('should auto-populate pane 0 with selected session', () => {
    const state = createMockState(['session-a', 'session-b', 'session-c']);
    state.selectedSessionName = 'session-b';
    const next = toggleSplitMode(state);
    expect(next.splitPaneSessions[0]).toBe('session-b');
  });

  it('should auto-populate pane 1 with next session', () => {
    const state = createMockState(['session-a', 'session-b', 'session-c']);
    state.selectedSessionName = 'session-b';
    const next = toggleSplitMode(state);
    // session-b is index 1, next is index 2 = session-c
    expect(next.splitPaneSessions[1]).toBe('session-c');
  });

  it('should wrap pane 1 to first session when selected is last', () => {
    const state = createMockState(['session-a', 'session-b', 'session-c']);
    state.selectedSessionName = 'session-c';
    const next = toggleSplitMode(state);
    expect(next.splitPaneSessions[0]).toBe('session-c');
    expect(next.splitPaneSessions[1]).toBe('session-a');
  });

  it('should handle single session (pane 1 = same session)', () => {
    const state = createMockState(['only-session']);
    const next = toggleSplitMode(state);
    expect(next.splitPaneSessions[0]).toBe('only-session');
    expect(next.splitPaneSessions[1]).toBe('only-session');
  });

  it('should handle empty session list (both panes null)', () => {
    const state = createMockState([]);
    const next = toggleSplitMode(state);
    expect(next.splitMode).toBe(true);
    expect(next.splitPaneSessions[0]).toBeNull();
    expect(next.splitPaneSessions[1]).toBeNull();
  });

  it('should reset activePaneIndex to 0 when entering split mode', () => {
    const state = createMockState(['session-a', 'session-b']);
    state.activePaneIndex = 1;
    const next = toggleSplitMode(state);
    expect(next.activePaneIndex).toBe(0);
  });
});

// ── switchActivePane ─────────────────────────────────────────────────────────

describe('switchActivePane', () => {
  it('should switch from pane 0 to pane 1 on next', () => {
    const state = createMockState(['a', 'b']);
    state.splitMode = true;
    state.activePaneIndex = 0;
    const next = switchActivePane(state, 'next');
    expect(next.activePaneIndex).toBe(1);
  });

  it('should switch from pane 1 to pane 0 on next (wraps)', () => {
    const state = createMockState(['a', 'b']);
    state.splitMode = true;
    state.activePaneIndex = 1;
    const next = switchActivePane(state, 'next');
    expect(next.activePaneIndex).toBe(0);
  });

  it('should switch from pane 0 to pane 1 on prev (wraps)', () => {
    const state = createMockState(['a', 'b']);
    state.splitMode = true;
    state.activePaneIndex = 0;
    const next = switchActivePane(state, 'prev');
    expect(next.activePaneIndex).toBe(1);
  });

  it('should switch from pane 1 to pane 0 on prev', () => {
    const state = createMockState(['a', 'b']);
    state.splitMode = true;
    state.activePaneIndex = 1;
    const next = switchActivePane(state, 'prev');
    expect(next.activePaneIndex).toBe(0);
  });

  it('should be a no-op when split mode is off', () => {
    const state = createMockState(['a', 'b']);
    state.splitMode = false;
    state.activePaneIndex = 0;
    const next = switchActivePane(state, 'next');
    expect(next.activePaneIndex).toBe(0);
    expect(next).toBe(state); // same reference
  });
});

// ── assignSessionToActivePane ─────────────────────────────────────────────────

describe('assignSessionToActivePane', () => {
  it('should assign selected session to pane 0 when active', () => {
    const state = createMockState(['session-a', 'session-b']);
    state.splitMode = true;
    state.activePaneIndex = 0;
    state.selectedSessionName = 'session-b';
    state.splitPaneSessions = [null, null];
    const next = assignSessionToActivePane(state);
    expect(next.splitPaneSessions[0]).toBe('session-b');
    expect(next.splitPaneSessions[1]).toBeNull();
  });

  it('should assign selected session to pane 1 when active', () => {
    const state = createMockState(['session-a', 'session-b']);
    state.splitMode = true;
    state.activePaneIndex = 1;
    state.selectedSessionName = 'session-a';
    state.splitPaneSessions = ['session-b', null];
    const next = assignSessionToActivePane(state);
    expect(next.splitPaneSessions[0]).toBe('session-b');
    expect(next.splitPaneSessions[1]).toBe('session-a');
  });

  it('should be a no-op when split mode is off', () => {
    const state = createMockState(['session-a']);
    state.splitMode = false;
    state.selectedSessionName = 'session-a';
    const next = assignSessionToActivePane(state);
    expect(next).toBe(state);
  });

  it('should be a no-op when no session is selected', () => {
    const state = createMockState(['session-a']);
    state.splitMode = true;
    state.selectedSessionName = null;
    const next = assignSessionToActivePane(state);
    expect(next).toBe(state);
  });
});

// ── Navigation keybindings for split mode ────────────────────────────────────

describe('handleNavigationKeypress — split mode', () => {
  describe('"v" key (toggle split)', () => {
    it('should enter split mode on "v"', () => {
      const state = createMockState(['session-a', 'session-b']);
      const result = handleNavigationKeypress(state, KEY_CODES.LOWERCASE_V);
      expect(result.kind).toBe('state');
      if (result.kind === 'state') {
        expect(result.state.splitMode).toBe(true);
      }
    });

    it('should exit split mode on "v" when already in split mode', () => {
      const state = createMockState(['session-a', 'session-b']);
      state.splitMode = true;
      state.splitPaneSessions = ['session-a', 'session-b'];
      const result = handleNavigationKeypress(state, KEY_CODES.LOWERCASE_V);
      expect(result.kind).toBe('state');
      if (result.kind === 'state') {
        expect(result.state.splitMode).toBe(false);
      }
    });
  });

  describe('"[" and "]" keys (switch pane in split mode)', () => {
    it('should switch to pane 1 on "]"', () => {
      const state = createMockState(['session-a', 'session-b']);
      state.splitMode = true;
      state.activePaneIndex = 0;
      const result = handleNavigationKeypress(state, KEY_CODES.RIGHT_BRACKET);
      expect(result.kind).toBe('state');
      if (result.kind === 'state') {
        expect(result.state.activePaneIndex).toBe(1);
      }
    });

    it('should switch to pane 0 on "["', () => {
      const state = createMockState(['session-a', 'session-b']);
      state.splitMode = true;
      state.activePaneIndex = 1;
      const result = handleNavigationKeypress(state, KEY_CODES.LEFT_BRACKET);
      expect(result.kind).toBe('state');
      if (result.kind === 'state') {
        expect(result.state.activePaneIndex).toBe(0);
      }
    });

    it('should not respond to "[" when not in split mode', () => {
      const state = createMockState(['session-a', 'session-b']);
      state.splitMode = false;
      state.activePaneIndex = 0;
      const result = handleNavigationKeypress(state, KEY_CODES.LEFT_BRACKET);
      expect(result.kind).toBe('state');
      if (result.kind === 'state') {
        // In non-split mode, [ is ignored (falls through to stateResult(state))
        expect(result.state.activePaneIndex).toBe(0);
      }
    });
  });

  describe('left/right arrow keys (switch pane in split mode)', () => {
    it('should switch to pane 1 on right arrow in split mode', () => {
      const state = createMockState(['session-a', 'session-b']);
      state.splitMode = true;
      state.activePaneIndex = 0;
      const result = handleNavigationKeypress(state, KEY_CODES.RIGHT_ARROW);
      expect(result.kind).toBe('state');
      if (result.kind === 'state') {
        expect(result.state.activePaneIndex).toBe(1);
      }
    });

    it('should switch to pane 0 on left arrow in split mode', () => {
      const state = createMockState(['session-a', 'session-b']);
      state.splitMode = true;
      state.activePaneIndex = 1;
      const result = handleNavigationKeypress(state, KEY_CODES.LEFT_ARROW);
      expect(result.kind).toBe('state');
      if (result.kind === 'state') {
        expect(result.state.activePaneIndex).toBe(0);
      }
    });
  });

  describe('Enter key in split mode (assign session to pane)', () => {
    it('should assign selected session to active pane on Enter', () => {
      const state = createMockState(['session-a', 'session-b']);
      state.splitMode = true;
      state.activePaneIndex = 1;
      state.selectedSessionName = 'session-a';
      state.splitPaneSessions = ['session-b', null];
      const result = handleNavigationKeypress(state, KEY_CODES.ENTER);
      expect(result.kind).toBe('state');
      if (result.kind === 'state') {
        expect(result.state.splitPaneSessions[1]).toBe('session-a');
      }
    });

    it('should NOT enter attached mode when in split mode and Enter is pressed', () => {
      const state = createMockState(['session-a']);
      state.splitMode = true;
      state.selectedSessionName = 'session-a';
      const result = handleNavigationKeypress(state, KEY_CODES.ENTER);
      expect(result.kind).toBe('state');
      if (result.kind === 'state') {
        expect(result.state.mode).toBe('navigation');
        expect(result.state.attachedSessionName).toBeNull();
      }
    });
  });
});
