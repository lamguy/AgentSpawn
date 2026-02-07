# ADR-003: TUI Redesign Architecture

**Status:** Accepted
**Date:** 2026-02-06
**Authors:** Architecture Agent
**Supersedes:** None (extends existing TUI built in initial implementation)

---

## Context

The current AgentSpawn TUI (`/Users/lam/dev/AgentSpawn/src/tui/`) provides a functional two-panel layout with session list, output pane, status bar, and input bar. However, it has several architectural limitations that block the planned redesign into a professional, Claude-Code-aligned terminal experience:

1. **`TUIMode` is a flat binary enum** (`'navigation' | 'attached'`). There is no way to represent overlays such as help screens, action menus, session creation dialogs, or confirmation prompts. Several key handlers (`handleNewSession`, `handleStopSession`, `handleToggleHelp`) are stubs returning unchanged state.

2. **Keybindings are a single flat map** (`Record<string, KeyBinding>`). All bindings are active in navigation mode and all are suppressed in attached mode (except Escape). There is no mechanism for mode-specific keybindings or overlay-scoped keys (arrow navigation in a menu, Tab to switch form fields, y/n for confirmations).

3. **Key handlers are synchronous**. They return `TUIState | { quit: true }`. Session operations like `startSession()` and `stopSession()` are async. The current architecture cannot bridge this gap — there is no way for a key handler to trigger an async operation and reflect its result in the UI.

4. **State ownership is split**. React `useState` inside `TUIApp` holds the component state, while the `TUI` orchestrator class holds `this.state` and mutates it directly. Sync happens via `onStateChange` callbacks and `forceRerender()`. This dual-ownership pattern is fragile and makes it hard to add new stateful features like form inputs or pending async operations.

5. **`SessionInfo` lacks `promptCount`**. The `Session` class tracks `promptCount` internally (line 19 of `session.ts`) but does not expose it through `getInfo()` or `SessionInfo`. The redesigned session list needs this to show interaction count.

6. **Router is effectively dead code**. `Session.getHandle()` returns `null` in the prompt-based model. `Router.attach()` throws immediately. The TUI orchestrator uses `Session.sendPrompt()` directly. The `RouterAdapter` wraps Router but `getActiveSession()` returns undefined in practice.

### What We Need

A TUI architecture that supports:
- Overlays (help, action menu, session creation, confirmation dialogs) rendered on top of the base layout
- Mode-specific keybinding dispatch
- Async operations (session create/stop/restart) triggered from the UI with loading states and error feedback
- Clean unidirectional data flow from orchestrator to components
- A `SessionInfo` type that exposes `promptCount`

---

## Decision 1: Overlay Stack State Model

### Options Considered

**Option A: Flat enum** — Extend `TUIMode` to `'navigation' | 'attached' | 'help' | 'action-menu' | 'session-creation' | 'confirmation'`.

- Pros: Simple, each mode is a distinct state, easy to reason about.
- Cons: Cannot layer overlays (e.g., action menu opens a confirmation dialog on top). Adding a new overlay requires modifying the enum and every switch statement that handles it. No inherent "go back" behavior.

**Option B: Overlay stack** — Keep `TUIMode` as the base mode. Overlays are a separate stack that sits on top.

- Pros: Overlays can layer naturally (action menu -> confirmation). "Dismiss" always pops the stack. Base mode is unaffected by overlays — you can open help from both navigation and attached modes. Separation of concerns: mode governs the base UI behavior, overlay stack governs what's drawn on top.
- Cons: Slightly more complex stack management. Must handle edge cases (e.g., max stack depth, stale overlays after session deletion).

### Decision

**Option B: Overlay stack.** The base `TUIMode` stays as `'navigation' | 'attached'`. A separate `overlayStack: OverlayState[]` field holds zero or more overlay descriptors. The top of the stack is the active overlay and captures all key input. Dismissing an overlay pops the stack, returning input to the overlay below it or to the base mode if the stack is empty.

### Type Definitions

```typescript
// /Users/lam/dev/AgentSpawn/src/tui/types.ts

/**
 * Base interaction mode. Governs what the main layout does.
 * Overlays render on top of whatever base mode is active.
 */
export type TUIMode = 'navigation' | 'attached';

/**
 * Discriminated union of all overlay types.
 * Each variant carries the state specific to that overlay.
 */
export type OverlayState =
  | HelpOverlayState
  | ActionMenuOverlayState
  | SessionCreationOverlayState
  | ConfirmationOverlayState;

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
    directory: string;
  };
  /** Which form field is currently focused */
  activeField: 'name' | 'directory';
  /** Validation errors keyed by field name (empty string = no error) */
  errors: {
    name: string;
    directory: string;
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

/**
 * Actions that require user confirmation before execution.
 * Discriminated union so the orchestrator knows what to do on confirm.
 */
export type ConfirmableAction =
  | { kind: 'stop-session'; sessionName: string }
  | { kind: 'kill-session'; sessionName: string }
  | { kind: 'restart-session'; sessionName: string }
  | { kind: 'stop-all' };

/**
 * Extended TUI application state.
 */
export interface TUIState {
  /** All sessions currently tracked by the manager */
  sessions: SessionInfo[];
  /** Name of the currently selected session in the session list */
  selectedSessionName: string | null;
  /** Name of the session that's receiving prompts (in attached mode) */
  attachedSessionName: string | null;
  /** Captured output lines for the selected session */
  outputLines: string[];
  /** Whether the TUI is in the process of shutting down */
  isShuttingDown: boolean;
  /** Base interaction mode */
  mode: TUIMode;
  /** Whether a prompt is being processed by the attached session */
  isProcessing: boolean;
  /** Stack of active overlays. Top of array = topmost overlay. Empty = no overlay. */
  overlayStack: OverlayState[];
  /** Transient error message to display in the status bar (auto-clears) */
  statusMessage: StatusMessage | null;
}

export interface StatusMessage {
  text: string;
  level: 'info' | 'error' | 'success';
  /** Timestamp for auto-clear (e.g., clear after 5 seconds) */
  expiresAt: number;
}
```

### Overlay Stack Operations

These are pure helper functions, not part of a class:

```typescript
// /Users/lam/dev/AgentSpawn/src/tui/overlay-helpers.ts

/** Push an overlay onto the stack. Returns new state. */
function pushOverlay(state: TUIState, overlay: OverlayState): TUIState;

/** Pop the topmost overlay. Returns new state. */
function popOverlay(state: TUIState): TUIState;

/** Get the topmost overlay, or null if stack is empty. */
function topOverlay(state: TUIState): OverlayState | null;

/** Check if any overlay is active. */
function hasOverlay(state: TUIState): boolean;

/** Replace the topmost overlay (e.g., updating form state). Returns new state. */
function replaceTopOverlay(state: TUIState, overlay: OverlayState): TUIState;
```

### Constraints

- Maximum stack depth: 2 (an overlay can open one confirmation dialog on top of itself, but no deeper nesting). Enforce in `pushOverlay`.
- When an overlay is active, the base mode's keybindings are suppressed. Only the overlay's keybindings are active.
- Dismissing all overlays returns control to the base mode's keybinding set.

---

## Decision 2: SessionInfo Extension

### Decision

Add `promptCount` to `SessionInfo` in `/Users/lam/dev/AgentSpawn/src/types.ts`:

```typescript
export interface SessionInfo {
  name: string;
  pid: number;
  state: SessionState;
  startedAt: Date | null;
  workingDirectory: string;
  exitCode?: number | null;
  /** Number of prompts sent in this session (0 if not yet interacted) */
  promptCount: number;
}
```

Update `Session.getInfo()` in `/Users/lam/dev/AgentSpawn/src/core/session.ts` to include `promptCount: this.promptCount`.

Update `SessionManager.listSessions()` and `SessionManager.getSessionInfo()` to populate `promptCount: 0` for registry-only entries (since prompt count is not persisted).

Update `RegistryEntry` in `/Users/lam/dev/AgentSpawn/src/types.ts` to optionally include `promptCount?: number` for future persistence.

---

## Decision 3: Component Architecture

### Component Tree

```
TUIApp
  ├── Header
  ├── Body (flexDirection="row")
  │     ├── SessionListPane (30% width)
  │     └── OutputPane (70% width)
  ├── InputBar (conditional: only in attached mode)
  ├── StatusBar
  └── OverlayHost (conditional: renders topmost overlay)
        ├── HelpOverlay
        ├── ActionMenu
        ├── SessionCreationDialog
        └── ConfirmationDialog
```

### File Organization

**Decision: Flat in `components/`.** The project currently has 5 component files in a flat structure. Adding 4 overlay components brings it to 9 total. This is well within the range where flat organization is simpler than subfolders. A subfolder structure (`components/overlays/`) becomes worthwhile at ~15+ files.

```
src/tui/components/
  TUIApp.tsx              # Main layout, delegates to all sub-components
  Header.tsx              # NEW: extracted from inline JSX in TUIApp
  SessionListPane.tsx     # Existing, receives style updates
  OutputPane.tsx           # Existing, receives style updates
  InputBar.tsx             # Existing, receives style updates
  StatusBar.tsx            # Existing, receives style updates
  OverlayHost.tsx          # NEW: conditional renderer for overlay stack
  HelpOverlay.tsx          # NEW: keybinding reference overlay
  ActionMenu.tsx           # NEW: command palette overlay
  SessionCreationDialog.tsx # NEW: form overlay for creating sessions
  ConfirmationDialog.tsx   # NEW: y/n confirmation overlay
```

### Overlay Rendering in Ink

Ink does not support CSS-like absolute positioning or z-index. Overlays cannot float over content. Instead, overlays **replace the body content area** when active. The layout becomes:

```
When no overlay:                  When overlay active:
┌────────────────────────┐       ┌────────────────────────┐
│ Header                 │       │ Header                 │
├────────┬───────────────┤       ├────────────────────────┤
│ List   │ Output        │       │                        │
│        │               │       │   [Overlay Content]    │
│        │               │       │                        │
├────────┴───────────────┤       ├────────────────────────┤
│ StatusBar              │       │ StatusBar              │
└────────────────────────┘       └────────────────────────┘
```

The `OverlayHost` component replaces the body row (SessionListPane + OutputPane) with the overlay content. Header and StatusBar remain visible for context. This approach:
- Works within Ink's layout model (no absolute positioning needed)
- Keeps the user oriented (header shows session count, status bar shows overlay-specific shortcuts)
- Is simple to implement (conditional rendering in TUIApp)

### Props Interfaces

```typescript
// /Users/lam/dev/AgentSpawn/src/tui/components/Header.tsx
export interface HeaderProps {
  mode: TUIMode;
  attachedSessionName: string | null;
  sessionCount: number;
}

// /Users/lam/dev/AgentSpawn/src/tui/components/OverlayHost.tsx
export interface OverlayHostProps {
  overlay: OverlayState;
  onDismiss: () => void;
  /** Callbacks for overlay-specific actions */
  actions: OverlayActions;
}

export interface OverlayActions {
  onCreateSession: (name: string, directory: string) => void;
  onConfirmAction: (action: ConfirmableAction) => void;
  onSelectMenuItem: (item: ActionMenuItem) => void;
}

// /Users/lam/dev/AgentSpawn/src/tui/components/HelpOverlay.tsx
export interface HelpOverlayProps {
  scrollOffset: number;
  onScroll: (delta: number) => void;
  onDismiss: () => void;
}

// /Users/lam/dev/AgentSpawn/src/tui/components/ActionMenu.tsx
export interface ActionMenuProps {
  selectedIndex: number;
  targetSessionName: string | null;
  onSelect: (item: ActionMenuItem) => void;
  onNavigate: (delta: number) => void;
  onDismiss: () => void;
}

export interface ActionMenuItem {
  id: string;
  label: string;
  description: string;
  shortcut?: string;
  /** Whether this item is available given current state */
  enabled: boolean;
}

// /Users/lam/dev/AgentSpawn/src/tui/components/SessionCreationDialog.tsx
export interface SessionCreationDialogProps {
  fields: { name: string; directory: string };
  activeField: 'name' | 'directory';
  errors: { name: string; directory: string };
  isSubmitting: boolean;
  onFieldChange: (field: 'name' | 'directory', value: string) => void;
  onFieldSwitch: (field: 'name' | 'directory') => void;
  onSubmit: () => void;
  onDismiss: () => void;
}

// /Users/lam/dev/AgentSpawn/src/tui/components/ConfirmationDialog.tsx
export interface ConfirmationDialogProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}
```

### Updated TUIAppProps

```typescript
export interface TUIAppProps {
  initialState: TUIState;
  onStateChange?: (state: TUIState) => void;
  onExit: () => void;
  onSendPrompt?: (sessionName: string, prompt: string) => void;
  onAction: (action: TUIAction) => void;
  isProcessing?: boolean;
}
```

---

## Decision 4: Keybinding Architecture

### Options Considered

**Option A: Nested map** — `Record<TUIMode | OverlayKind, Record<string, KeyBinding>>`. Lookup: `bindings[currentMode][keyCode]`.

- Pros: Simple data structure, easy to reason about.
- Cons: Cannot handle the overlay stack (need to know overlay kind, not base mode). Requires `OverlayKind` type that duplicates `OverlayState.kind`. Does not scale well for overlays that need state-aware handlers (e.g., form input in session creation).

**Option B: Dispatch function pattern** — A `dispatch(state, key)` function that examines state (overlay stack first, then base mode) and routes to the correct handler. Each mode/overlay has its own handler module.

- Pros: Can inspect full state to make routing decisions. Overlays naturally take priority (check stack first). Handlers can be async-aware via a dispatch result type. Each handler is a self-contained module, easy to test in isolation.
- Cons: Slightly more indirection than a flat map lookup.

### Decision

**Option B: Dispatch function pattern.** The primary `handleKeypress` function becomes a dispatcher that checks the overlay stack first, then falls back to the base mode handler. Each overlay and base mode has its own handler function.

### Architecture

```typescript
// /Users/lam/dev/AgentSpawn/src/tui/keybindings.ts

/**
 * Result of a key press handler.
 * Expanded to support async side effects.
 */
export type KeyHandlerResult =
  | { kind: 'state'; state: TUIState }       // Pure state update
  | { kind: 'quit' }                          // Exit the TUI
  | { kind: 'action'; state: TUIState; action: TUIAction }; // State update + side effect

/**
 * Side-effect actions that the orchestrator must execute.
 * Key handlers produce these; the orchestrator consumes them.
 */
export type TUIAction =
  | { kind: 'create-session'; name: string; directory: string }
  | { kind: 'stop-session'; sessionName: string }
  | { kind: 'restart-session'; sessionName: string }
  | { kind: 'stop-all' }
  | { kind: 'send-prompt'; sessionName: string; prompt: string };

/**
 * Main dispatch function. Replaces the current flat handleKeypress.
 * Checks overlay stack first, then base mode.
 */
export function handleKeypress(state: TUIState, key: string): KeyHandlerResult {
  const overlay = topOverlay(state);

  if (overlay) {
    return handleOverlayKeypress(state, overlay, key);
  }

  return handleBaseModeKeypress(state, key);
}
```

### Navigation Mode Bindings

```
Key          | Action
-------------|------------------------------------------
Tab          | Select next session
Shift+Tab    | Select previous session
Up Arrow     | Select previous session
Down Arrow   | Select next session
Enter        | Attach to selected session
n            | Open session creation dialog (push overlay)
x            | Open stop confirmation for selected session (push overlay)
Ctrl+A       | Open action menu (push overlay)
?            | Open help overlay (push overlay)
q            | Quit TUI
Ctrl+C       | Quit TUI
```

### Attached Mode Bindings

```
Key          | Action
-------------|------------------------------------------
Escape       | Detach from session (return to navigation)
All others   | Handled by InputBar component (not by keybinding system)
```

### Help Overlay Bindings

```
Key          | Action
-------------|------------------------------------------
Escape       | Dismiss help (pop overlay)
?            | Dismiss help (pop overlay, toggle behavior)
q            | Dismiss help (pop overlay)
Up Arrow     | Scroll help text up
Down Arrow   | Scroll help text down
```

### Action Menu Bindings

```
Key          | Action
-------------|------------------------------------------
Escape       | Dismiss menu (pop overlay)
Up Arrow     | Move selection up
Down Arrow   | Move selection down
Enter        | Execute selected item (may push confirmation overlay)
```

### Session Creation Bindings

```
Key          | Action
-------------|------------------------------------------
Escape       | Cancel and dismiss (pop overlay)
Tab          | Switch between name/directory fields
Shift+Tab    | Switch between name/directory fields (reverse)
Enter        | Submit form (triggers async create)
All others   | Text input to active field (handled inline)
```

### Confirmation Dialog Bindings

```
Key          | Action
-------------|------------------------------------------
y / Enter    | Confirm action (triggers async operation, pop overlay)
n / Escape   | Cancel (pop overlay)
```

### Backward Compatibility

The `handleKeypress` function signature changes from:

```typescript
// OLD
type KeyHandler = (state: TUIState, key: string) => TUIState | { quit: true };
```

to:

```typescript
// NEW
type KeyHandler = (state: TUIState, key: string) => KeyHandlerResult;
```

This is a **breaking change**. The consumer (`TUIApp.tsx` and `TUI` orchestrator) must be updated to handle the new `KeyHandlerResult` discriminated union. Since both consumers are internal, this is acceptable.

---

## Decision 5: Integration Points

### How Session Creation Triggers `SessionManager.startSession()`

1. User presses `n` in navigation mode.
2. Key handler pushes `SessionCreationOverlayState` onto the overlay stack with empty fields.
3. User fills in form fields via text input.
4. User presses Enter.
5. Key handler validates fields (name: non-empty, no duplicates).
6. If validation fails: update `errors` on the overlay state. Stay on the overlay.
7. If validation passes: return `{ kind: 'action', state: stateWithSubmitting, action: { kind: 'create-session', name, directory } }`.
8. The orchestrator receives the action, calls `await manager.startSession({ name, workingDirectory: directory })`.
9. On success: pop overlay, set success status message.
10. On failure: update overlay with error.

### How Stop/Kill Actions Trigger `SessionManager.stopSession()`

1. User presses `x` on a selected session (or selects "Stop" from action menu).
2. Key handler pushes `ConfirmationOverlayState` with the action embedded.
3. User presses `y` or Enter.
4. Key handler returns action result.
5. Orchestrator calls `await manager.stopSession(sessionName)`.

### Error Surfacing

Errors from async session operations reach the UI through the `StatusMessage` mechanism. The `StatusBar` reads `state.statusMessage` and renders it with color coding. A timer in the orchestrator's `updateState()` loop clears expired messages.

---

## Decision 6: TUI Orchestrator Changes

### Action Execution Flow

```
TUIApp (React)                     TUI Orchestrator (Class)
     │                                    │
     │  useInput captures keypress        │
     │         │                          │
     │  handleKeypress(state, key)        │
     │         │                          │
     │  result = { kind: 'action',        │
     │            state: newState,         │
     │            action: TUIAction }      │
     │         │                          │
     │  setState(result.state)            │
     │         │                          │
     │  onAction(result.action) ─────────>│  executeAction(action)
     │                                    │       │
     │                                    │  await manager.startSession(...)
     │                                    │       │
     │                                    │  update this.state
     │                                    │  (pop overlay, set statusMessage)
     │                                    │       │
     │  <──── forceRerender() ────────────│
```

### Updated TUIAppProps (Final)

```typescript
export interface TUIAppProps {
  initialState: TUIState;
  onStateChange?: (state: TUIState) => void;
  onExit: () => void;
  onSendPrompt?: (sessionName: string, prompt: string) => void;
  onAction: (action: TUIAction) => void;
  isProcessing?: boolean;
}
```

Note: `onAction` replaces individual `onCreateSession`, `onStopSession`, etc. callbacks. A single `onAction` handler with a discriminated union is simpler and scales better.

---

## Appendix: Action Menu Items

```typescript
const ACTION_MENU_ITEMS: ActionMenuItem[] = [
  { id: 'new-session',     label: 'New Session',       description: 'Create a new Claude session',     shortcut: 'n', enabled: true },
  { id: 'attach',          label: 'Attach',            description: 'Attach to selected session',      shortcut: 'Enter', enabled: /* hasSelectedSession */ },
  { id: 'stop-session',    label: 'Stop Session',      description: 'Stop the selected session',       shortcut: 'x', enabled: /* hasSelectedRunningSession */ },
  { id: 'restart-session', label: 'Restart Session',   description: 'Restart the selected session',    shortcut: undefined, enabled: /* hasSelectedSession */ },
  { id: 'stop-all',        label: 'Stop All',          description: 'Stop all running sessions',       shortcut: undefined, enabled: /* hasRunningSessions */ },
  { id: 'help',            label: 'Help',              description: 'Show keyboard shortcuts',         shortcut: '?', enabled: true },
  { id: 'quit',            label: 'Quit',              description: 'Exit AgentSpawn',                 shortcut: 'q', enabled: true },
];
```

---

## Appendix: Files to Create or Modify

| File | Action | Description |
|------|--------|-------------|
| `src/types.ts` | Modify | Add `promptCount` to `SessionInfo` |
| `src/core/session.ts` | Modify | Expose `promptCount` in `getInfo()` |
| `src/core/manager.ts` | Modify | Default `promptCount: 0` for registry entries |
| `src/tui/types.ts` | Modify | Add overlay types, `StatusMessage`, update `TUIState` |
| `src/tui/overlay-helpers.ts` | Create | Pure functions for overlay stack manipulation |
| `src/tui/keybindings.ts` | Rewrite | Dispatch pattern, mode-specific handlers, `KeyHandlerResult` union |
| `src/tui/components/Header.tsx` | Create | Extracted header component |
| `src/tui/components/OverlayHost.tsx` | Create | Overlay rendering dispatcher |
| `src/tui/components/HelpOverlay.tsx` | Create | Help overlay component |
| `src/tui/components/ActionMenu.tsx` | Create | Action menu overlay component |
| `src/tui/components/SessionCreationDialog.tsx` | Create | Session creation form overlay |
| `src/tui/components/ConfirmationDialog.tsx` | Create | Confirmation dialog overlay |
| `src/tui/components/TUIApp.tsx` | Modify | Integrate OverlayHost, new props, updated useInput |
| `src/tui/components/StatusBar.tsx` | Modify | Render `statusMessage`, overlay-specific shortcuts |
| `src/tui/index.ts` | Modify | Add `executeAction`, `onAction` callback, status message management |
