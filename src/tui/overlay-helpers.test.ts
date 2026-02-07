import { describe, it, expect } from 'vitest';
import {
  pushOverlay,
  popOverlay,
  topOverlay,
  hasOverlay,
  replaceTopOverlay,
} from './overlay-helpers.js';
import type { TUIState, OverlayState } from './types.js';

function makeState(overlayStack: OverlayState[] = []): TUIState {
  return {
    sessions: [],
    selectedSessionName: null,
    attachedSessionName: null,
    outputLines: [],
    isShuttingDown: false,
    mode: 'navigation',
    isProcessing: false,
    overlayStack,
    statusMessage: null,
  };
}

const helpOverlay: OverlayState = { kind: 'help', scrollOffset: 0 };
const menuOverlay: OverlayState = {
  kind: 'action-menu',
  selectedIndex: 0,
  targetSessionName: null,
};
const confirmOverlay: OverlayState = {
  kind: 'confirmation',
  title: 'Stop?',
  message: 'Stop session?',
  action: { kind: 'stop-all' },
};

describe('pushOverlay', () => {
  it('should push an overlay onto an empty stack', () => {
    const state = makeState();
    const result = pushOverlay(state, helpOverlay);
    expect(result.overlayStack).toHaveLength(1);
    expect(result.overlayStack[0]).toEqual(helpOverlay);
  });

  it('should push a second overlay onto the stack', () => {
    const state = makeState([helpOverlay]);
    const result = pushOverlay(state, confirmOverlay);
    expect(result.overlayStack).toHaveLength(2);
    expect(result.overlayStack[1]).toEqual(confirmOverlay);
  });

  it('should enforce max depth of 2', () => {
    const state = makeState([helpOverlay, confirmOverlay]);
    const result = pushOverlay(state, menuOverlay);
    // Should not push — returns same state
    expect(result.overlayStack).toHaveLength(2);
    expect(result).toBe(state);
  });

  it('should not mutate original state', () => {
    const state = makeState();
    pushOverlay(state, helpOverlay);
    expect(state.overlayStack).toHaveLength(0);
  });
});

describe('popOverlay', () => {
  it('should remove the top overlay', () => {
    const state = makeState([helpOverlay]);
    const result = popOverlay(state);
    expect(result.overlayStack).toHaveLength(0);
  });

  it('should pop only the top overlay when stack has two', () => {
    const state = makeState([helpOverlay, confirmOverlay]);
    const result = popOverlay(state);
    expect(result.overlayStack).toHaveLength(1);
    expect(result.overlayStack[0]).toEqual(helpOverlay);
  });

  it('should return same state when stack is empty', () => {
    const state = makeState();
    const result = popOverlay(state);
    expect(result).toBe(state);
  });

  it('should not mutate original state', () => {
    const state = makeState([helpOverlay]);
    popOverlay(state);
    expect(state.overlayStack).toHaveLength(1);
  });
});

describe('topOverlay', () => {
  it('should return null for empty stack', () => {
    const state = makeState();
    expect(topOverlay(state)).toBeNull();
  });

  it('should return the single overlay', () => {
    const state = makeState([helpOverlay]);
    expect(topOverlay(state)).toEqual(helpOverlay);
  });

  it('should return the topmost overlay', () => {
    const state = makeState([helpOverlay, confirmOverlay]);
    expect(topOverlay(state)).toEqual(confirmOverlay);
  });
});

describe('hasOverlay', () => {
  it('should return false for empty stack', () => {
    const state = makeState();
    expect(hasOverlay(state)).toBe(false);
  });

  it('should return true when overlay exists', () => {
    const state = makeState([helpOverlay]);
    expect(hasOverlay(state)).toBe(true);
  });
});

describe('replaceTopOverlay', () => {
  it('should replace the top overlay', () => {
    const state = makeState([helpOverlay]);
    const newOverlay: OverlayState = { kind: 'help', scrollOffset: 5 };
    const result = replaceTopOverlay(state, newOverlay);
    expect(result.overlayStack).toHaveLength(1);
    expect((result.overlayStack[0] as { scrollOffset: number }).scrollOffset).toBe(5);
  });

  it('should only replace the top when stack has two', () => {
    const state = makeState([helpOverlay, confirmOverlay]);
    const result = replaceTopOverlay(state, menuOverlay);
    expect(result.overlayStack).toHaveLength(2);
    expect(result.overlayStack[0]).toEqual(helpOverlay);
    expect(result.overlayStack[1]).toEqual(menuOverlay);
  });

  it('should return same state when stack is empty', () => {
    const state = makeState();
    const result = replaceTopOverlay(state, helpOverlay);
    expect(result).toBe(state);
  });

  it('should not mutate original state', () => {
    const state = makeState([helpOverlay]);
    replaceTopOverlay(state, confirmOverlay);
    expect(state.overlayStack[0]).toEqual(helpOverlay);
  });
});
