import type { TUIState, OverlayState } from './types.js';

const MAX_OVERLAY_DEPTH = 2;

/** Push an overlay onto the stack. Returns new state. Enforces max depth. */
export function pushOverlay(state: TUIState, overlay: OverlayState): TUIState {
  if (state.overlayStack.length >= MAX_OVERLAY_DEPTH) {
    return state;
  }
  return {
    ...state,
    overlayStack: [...state.overlayStack, overlay],
  };
}

/** Pop the topmost overlay. Returns new state. */
export function popOverlay(state: TUIState): TUIState {
  if (state.overlayStack.length === 0) {
    return state;
  }
  return {
    ...state,
    overlayStack: state.overlayStack.slice(0, -1),
  };
}

/** Get the topmost overlay, or null if stack is empty. */
export function topOverlay(state: TUIState): OverlayState | null {
  return state.overlayStack.length > 0
    ? state.overlayStack[state.overlayStack.length - 1]
    : null;
}

/** Check if any overlay is active. */
export function hasOverlay(state: TUIState): boolean {
  return state.overlayStack.length > 0;
}

/** Replace the topmost overlay (e.g., updating form state). Returns new state. */
export function replaceTopOverlay(state: TUIState, overlay: OverlayState): TUIState {
  if (state.overlayStack.length === 0) {
    return state;
  }
  return {
    ...state,
    overlayStack: [...state.overlayStack.slice(0, -1), overlay],
  };
}
