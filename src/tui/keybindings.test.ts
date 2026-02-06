import { describe, it, expect } from 'vitest';
import { handleKeypress, KEY_CODES } from './keybindings.js';
import type { TUIState } from './types.js';
import { SessionState } from '../types.js';

describe('keybindings', () => {
  const createMockState = (sessionNames: string[]): TUIState => ({
    sessions: sessionNames.map((name) => ({
      name,
      pid: 1000,
      state: SessionState.Running,
      startedAt: new Date(),
      workingDirectory: '/tmp',
    })),
    selectedSessionName: sessionNames[0] ?? null,
    attachedSessionName: null,
    outputLines: [],
    isShuttingDown: false,
    mode: 'navigation',
  });

  describe('Tab key (next session)', () => {
    it('should cycle to the next session', () => {
      const state = createMockState(['session-a', 'session-b', 'session-c']);
      const result = handleKeypress(state, KEY_CODES.TAB);

      expect('quit' in result).toBe(false);
      if ('quit' in result) return;

      expect(result.selectedSessionName).toBe('session-b');
    });

    it('should wrap around to the first session', () => {
      const state = createMockState(['session-a', 'session-b', 'session-c']);
      state.selectedSessionName = 'session-c';

      const result = handleKeypress(state, KEY_CODES.TAB);

      expect('quit' in result).toBe(false);
      if ('quit' in result) return;

      expect(result.selectedSessionName).toBe('session-a');
    });

    it('should select first session when none is selected', () => {
      const state = createMockState(['session-a', 'session-b']);
      state.selectedSessionName = null;

      const result = handleKeypress(state, KEY_CODES.TAB);

      expect('quit' in result).toBe(false);
      if ('quit' in result) return;

      expect(result.selectedSessionName).toBe('session-a');
    });

    it('should handle empty session list', () => {
      const state = createMockState([]);

      const result = handleKeypress(state, KEY_CODES.TAB);

      expect('quit' in result).toBe(false);
      if ('quit' in result) return;

      expect(result.selectedSessionName).toBeNull();
    });
  });

  describe('Shift+Tab key (previous session)', () => {
    it('should cycle to the previous session', () => {
      const state = createMockState(['session-a', 'session-b', 'session-c']);
      state.selectedSessionName = 'session-b';

      const result = handleKeypress(state, KEY_CODES.SHIFT_TAB);

      expect('quit' in result).toBe(false);
      if ('quit' in result) return;

      expect(result.selectedSessionName).toBe('session-a');
    });

    it('should wrap around to the last session', () => {
      const state = createMockState(['session-a', 'session-b', 'session-c']);
      state.selectedSessionName = 'session-a';

      const result = handleKeypress(state, KEY_CODES.SHIFT_TAB);

      expect('quit' in result).toBe(false);
      if ('quit' in result) return;

      expect(result.selectedSessionName).toBe('session-c');
    });

    it('should select last session when none is selected', () => {
      const state = createMockState(['session-a', 'session-b']);
      state.selectedSessionName = null;

      const result = handleKeypress(state, KEY_CODES.SHIFT_TAB);

      expect('quit' in result).toBe(false);
      if ('quit' in result) return;

      expect(result.selectedSessionName).toBe('session-b');
    });
  });

  describe('Arrow keys', () => {
    it('should move up (same as previous session)', () => {
      const state = createMockState(['session-a', 'session-b', 'session-c']);
      state.selectedSessionName = 'session-b';

      const result = handleKeypress(state, KEY_CODES.UP_ARROW);

      expect('quit' in result).toBe(false);
      if ('quit' in result) return;

      expect(result.selectedSessionName).toBe('session-a');
    });

    it('should move down (same as next session)', () => {
      const state = createMockState(['session-a', 'session-b', 'session-c']);
      state.selectedSessionName = 'session-b';

      const result = handleKeypress(state, KEY_CODES.DOWN_ARROW);

      expect('quit' in result).toBe(false);
      if ('quit' in result) return;

      expect(result.selectedSessionName).toBe('session-c');
    });
  });

  describe('Enter key (attach)', () => {
    it('should attach to the selected session', () => {
      const state = createMockState(['session-a', 'session-b']);
      state.selectedSessionName = 'session-b';

      const result = handleKeypress(state, KEY_CODES.ENTER);

      expect('quit' in result).toBe(false);
      if ('quit' in result) return;

      expect(result.attachedSessionName).toBe('session-b');
    });

    it('should not change state when no session is selected', () => {
      const state = createMockState(['session-a', 'session-b']);
      state.selectedSessionName = null;

      const result = handleKeypress(state, KEY_CODES.ENTER);

      expect('quit' in result).toBe(false);
      if ('quit' in result) return;

      expect(result.attachedSessionName).toBeNull();
    });
  });

  describe('Quit keys', () => {
    it('should quit on "q" key', () => {
      const state = createMockState(['session-a']);

      const result = handleKeypress(state, KEY_CODES.LOWERCASE_Q);

      expect(result).toEqual({ quit: true });
    });

    it('should quit on Ctrl+C', () => {
      const state = createMockState(['session-a']);

      const result = handleKeypress(state, KEY_CODES.CTRL_C);

      expect(result).toEqual({ quit: true });
    });
  });

  describe('Placeholder keys', () => {
    it('should not change state on "n" key (new session placeholder)', () => {
      const state = createMockState(['session-a']);

      const result = handleKeypress(state, KEY_CODES.LOWERCASE_N);

      expect('quit' in result).toBe(false);
      if ('quit' in result) return;

      expect(result).toEqual(state);
    });

    it('should not change state on "x" key (stop session placeholder)', () => {
      const state = createMockState(['session-a']);

      const result = handleKeypress(state, KEY_CODES.LOWERCASE_X);

      expect('quit' in result).toBe(false);
      if ('quit' in result) return;

      expect(result).toEqual(state);
    });

    it('should not change state on "?" key (help placeholder)', () => {
      const state = createMockState(['session-a']);

      const result = handleKeypress(state, KEY_CODES.QUESTION_MARK);

      expect('quit' in result).toBe(false);
      if ('quit' in result) return;

      expect(result).toEqual(state);
    });
  });

  describe('Unknown keys', () => {
    it('should ignore unknown keys', () => {
      const state = createMockState(['session-a']);

      const result = handleKeypress(state, 'z');

      expect('quit' in result).toBe(false);
      if ('quit' in result) return;

      expect(result).toEqual(state);
    });

    it('should ignore random escape sequences', () => {
      const state = createMockState(['session-a']);

      const result = handleKeypress(state, '\x1b[999~');

      expect('quit' in result).toBe(false);
      if ('quit' in result) return;

      expect(result).toEqual(state);
    });
  });

  describe('Mode switching', () => {
    it('should switch to attached mode when attaching to a session', () => {
      const state = createMockState(['session-a', 'session-b']);
      state.selectedSessionName = 'session-b';

      const result = handleKeypress(state, KEY_CODES.ENTER);

      expect('quit' in result).toBe(false);
      if ('quit' in result) return;

      expect(result.mode).toBe('attached');
      expect(result.attachedSessionName).toBe('session-b');
    });

    it('should switch to navigation mode when detaching', () => {
      const state = createMockState(['session-a', 'session-b']);
      state.mode = 'attached';
      state.attachedSessionName = 'session-a';

      const result = handleKeypress(state, KEY_CODES.ESCAPE);

      expect('quit' in result).toBe(false);
      if ('quit' in result) return;

      expect(result.mode).toBe('navigation');
      expect(result.attachedSessionName).toBeNull();
    });

    it('should ignore all keys except Esc when in attached mode', () => {
      const state = createMockState(['session-a', 'session-b']);
      state.mode = 'attached';
      state.attachedSessionName = 'session-a';
      state.selectedSessionName = 'session-a';

      // Try various keys that would normally do something
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
        const result = handleKeypress(state, key);

        expect('quit' in result).toBe(false);
        if ('quit' in result) continue;

        // State should be unchanged
        expect(result).toEqual(state);
      }
    });

    it('should allow Esc to detach when in attached mode', () => {
      const state = createMockState(['session-a']);
      state.mode = 'attached';
      state.attachedSessionName = 'session-a';

      const result = handleKeypress(state, KEY_CODES.ESCAPE);

      expect('quit' in result).toBe(false);
      if ('quit' in result) return;

      expect(result.mode).toBe('navigation');
      expect(result.attachedSessionName).toBeNull();
    });

    it('should process all keys normally in navigation mode', () => {
      const state = createMockState(['session-a', 'session-b']);
      state.mode = 'navigation';

      // Test that Tab works
      const result = handleKeypress(state, KEY_CODES.TAB);

      expect('quit' in result).toBe(false);
      if ('quit' in result) return;

      expect(result.selectedSessionName).toBe('session-b');
    });
  });
});
