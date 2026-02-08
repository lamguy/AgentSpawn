import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import type { TUIState, TUIAction } from '../types.js';
import { SessionListPane } from './SessionListPane.js';
import { OutputPane } from './OutputPane.js';
import { StatusBar } from './StatusBar.js';
import { InputBar } from './InputBar.js';
import { HelpOverlay } from './HelpOverlay.js';
import { ActionMenu } from './ActionMenu.js';
import { SessionCreationDialog } from './SessionCreationDialog.js';
import { ConfirmationDialog } from './ConfirmationDialog.js';
import { HistorySearchOverlay } from './HistorySearchOverlay.js';
import { handleKeypress } from '../keybindings.js';
import { topOverlay } from '../overlay-helpers.js';

/**
 * TUIApp component props.
 */
export interface TUIAppProps {
  /** Initial TUI state */
  initialState: TUIState;
  /** Callback when state changes (for external sync) */
  onStateChange?: (state: TUIState) => void;
  /** Callback when user requests exit */
  onExit: () => void;
  /** Callback when user sends a prompt to the attached session */
  onSendPrompt?: (sessionName: string, prompt: string) => void;
  /** Callback for side-effect actions produced by keybindings */
  onAction?: (action: TUIAction) => void;
  /** Whether a prompt is currently being processed */
  isProcessing?: boolean;
}

/**
 * Main TUI application component.
 *
 * Renders a professional layout with:
 * - Header: styled title bar with session count and mode indicator
 * - Body: Two-column layout (SessionListPane | OutputPane) or overlay when active
 * - Input bar: visible only in attached mode
 * - Footer: StatusBar with mode badges and context-sensitive shortcuts
 */
export function TUIApp({
  initialState,
  onStateChange,
  onExit,
  onSendPrompt,
  onAction,
  isProcessing = false,
}: TUIAppProps): React.ReactElement {
  const [state, setState] = useState<TUIState>(initialState);

  // Detect terminal size for graceful degradation
  const terminalWidth = process.stdout.columns || 80;
  const terminalHeight = process.stdout.rows || 24;
  const isSmallTerminal = terminalWidth < 80 || terminalHeight < 20;

  const isAttached = state.mode === 'attached';
  const activeOverlay = topOverlay(state);

  // Handle keyboard input
  // Overlay stack takes priority, then base mode (navigation/attached)
  // Disabled when session-creation overlay is active (it handles its own text input)
  const isSessionCreation = activeOverlay?.kind === 'session-creation';

  useInput(
    (input, key) => {
      // Map Ink key events to raw key codes
      let keyCode: string;

      if (key.return) {
        keyCode = '\r';
      } else if (key.tab) {
        keyCode = key.shift ? '\x1b[Z' : '\t';
      } else if (key.upArrow) {
        keyCode = '\x1b[A';
      } else if (key.downArrow) {
        keyCode = '\x1b[B';
      } else if (key.escape) {
        keyCode = '\x1b';
      } else if (key.ctrl && input === 'c') {
        keyCode = '\x03';
      } else if (key.ctrl && input === 'a') {
        keyCode = '\x01';
      } else if (key.ctrl && input === 'r') {
        keyCode = '\x12';
      } else if (key.delete || key.backspace) {
        keyCode = '\x7f';
      } else {
        keyCode = input;
      }

      const result = handleKeypress(state, keyCode);

      switch (result.kind) {
        case 'quit':
          onExit();
          break;
        case 'state':
          setState(result.state);
          break;
        case 'action':
          setState(result.state);
          if (onAction) {
            onAction(result.action);
          }
          break;
      }
    },
    { isActive: !isSessionCreation },
  );

  // Notify parent of state changes
  useEffect(() => {
    if (onStateChange) {
      onStateChange(state);
    }
  }, [state, onStateChange]);

  // Determine which session to display in the output pane:
  // attached session takes priority, then selected session
  const displaySessionName =
    isAttached && state.attachedSessionName
      ? state.attachedSessionName
      : state.selectedSessionName;
  const displaySession = state.sessions.find(
    (s) => s.name === displaySessionName,
  ) ?? null;

  // Output lines now carry full metadata (timestamp, isError) from OutputCapture
  const outputLines = state.outputLines;

  // Render small terminal warning if terminal is too small
  if (isSmallTerminal) {
    return (
      <Box flexDirection="column" padding={2}>
        <Text bold color="yellow">
          Terminal too small
        </Text>
        <Text>
          Minimum size: 80x20 (current: {terminalWidth}x{terminalHeight})
        </Text>
        <Box marginTop={1}>
          <Text dimColor>
            Please resize your terminal or use the CLI commands instead.
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press </Text>
          <Text color="cyan">q</Text>
          <Text dimColor> to quit</Text>
        </Box>
      </Box>
    );
  }

  // Render the active overlay content (replaces body when active)
  const renderOverlay = (): React.ReactElement | null => {
    if (!activeOverlay) return null;

    switch (activeOverlay.kind) {
      case 'help':
        return (
          <HelpOverlay
            scrollOffset={activeOverlay.scrollOffset}
            onScroll={(delta) => {
              const result = handleKeypress(state, delta > 0 ? '\x1b[B' : '\x1b[A');
              if (result.kind === 'state') setState(result.state);
            }}
            onDismiss={() => {
              const result = handleKeypress(state, '\x1b');
              if (result.kind === 'state') setState(result.state);
            }}
          />
        );
      case 'action-menu':
        return (
          <ActionMenu
            selectedIndex={activeOverlay.selectedIndex}
            targetSessionName={activeOverlay.targetSessionName}
            onSelect={() => {
              const result = handleKeypress(state, '\r');
              if (result.kind === 'state') setState(result.state);
              else if (result.kind === 'action') {
                setState(result.state);
                if (onAction) onAction(result.action);
              } else if (result.kind === 'quit') onExit();
            }}
            onNavigate={(delta) => {
              const result = handleKeypress(state, delta > 0 ? '\x1b[B' : '\x1b[A');
              if (result.kind === 'state') setState(result.state);
            }}
            onDismiss={() => {
              const result = handleKeypress(state, '\x1b');
              if (result.kind === 'state') setState(result.state);
            }}
          />
        );
      case 'session-creation':
        return (
          <SessionCreationDialog
            fields={activeOverlay.fields}
            activeField={activeOverlay.activeField}
            errors={activeOverlay.errors}
            isSubmitting={activeOverlay.isSubmitting}
            onFieldChange={(field, value) => {
              // Direct state update for form fields
              const newOverlay = {
                ...activeOverlay,
                fields: { ...activeOverlay.fields, [field]: value },
                errors: { ...activeOverlay.errors, [field]: '' },
              };
              setState({
                ...state,
                overlayStack: [...state.overlayStack.slice(0, -1), newOverlay],
              });
            }}
            onFieldSwitch={(field) => {
              const newOverlay = { ...activeOverlay, activeField: field };
              setState({
                ...state,
                overlayStack: [...state.overlayStack.slice(0, -1), newOverlay],
              });
            }}
            onSubmit={() => {
              const result = handleKeypress(state, '\r');
              if (result.kind === 'state') setState(result.state);
              else if (result.kind === 'action') {
                setState(result.state);
                if (onAction) onAction(result.action);
              }
            }}
            onDismiss={() => {
              const result = handleKeypress(state, '\x1b');
              if (result.kind === 'state') setState(result.state);
            }}
          />
        );
      case 'confirmation':
        return (
          <ConfirmationDialog
            title={activeOverlay.title}
            message={activeOverlay.message}
            onConfirm={() => {
              const result = handleKeypress(state, 'y');
              if (result.kind === 'state') setState(result.state);
              else if (result.kind === 'action') {
                setState(result.state);
                if (onAction) onAction(result.action);
              }
            }}
            onCancel={() => {
              const result = handleKeypress(state, '\x1b');
              if (result.kind === 'state') setState(result.state);
            }}
          />
        );
      case 'history-search':
        return (
          <HistorySearchOverlay
            query={activeOverlay.query}
            results={activeOverlay.results}
            selectedIndex={activeOverlay.selectedIndex}
            isLoading={activeOverlay.isLoading}
          />
        );
    }
  };

  return (
    <Box flexDirection="column" height="100%">
      {/* Header: Professional title bar */}
      <Box
        flexDirection="row"
        justifyContent="space-between"
        paddingX={1}
        borderStyle="single"
        borderBottom
      >
        <Box flexDirection="row" gap={1}>
          <Text bold color="cyan">⚡</Text>
          <Text bold>AgentSpawn</Text>
          {isAttached && state.attachedSessionName && (
            <Text color="magenta" inverse bold>
              {' '}ATTACHED: {state.attachedSessionName}{' '}
            </Text>
          )}
        </Box>
        <Text dimColor>
          {state.sessions.length} {state.sessions.length === 1 ? 'session' : 'sessions'}
        </Text>
      </Box>

      {/* Body: Overlay replaces content, or show two-column layout */}
      {activeOverlay ? (
        <Box flexGrow={1} flexDirection="column" justifyContent="center" alignItems="center" paddingY={1}>
          {renderOverlay()}
        </Box>
      ) : (
        <Box flexDirection="row" flexGrow={1}>
          {/* Left column: Session list */}
          <Box
            width="30%"
            borderStyle="single"
            borderRight
            flexDirection="column"
            paddingY={1}
          >
            <SessionListPane
              sessions={state.sessions}
              selectedSessionName={state.selectedSessionName}
              attachedSessionName={state.attachedSessionName}
            />
          </Box>

          {/* Right column: Output pane */}
          <Box width="70%" flexDirection="column" paddingY={1} paddingX={1}>
            <OutputPane
              session={displaySession}
              outputLines={outputLines}
            />
          </Box>
        </Box>
      )}

      {/* Input bar: visible only in attached mode (and no overlay) */}
      {isAttached && state.attachedSessionName && !activeOverlay && (
        <InputBar
          isActive={isAttached}
          isProcessing={isProcessing}
          sessionName={state.attachedSessionName}
          pendingInput={state.pendingInput}
          onPendingInputConsumed={() => {
            setState((prev) => ({ ...prev, pendingInput: null }));
          }}
          onSubmit={(text) => {
            if (state.attachedSessionName && onSendPrompt) {
              onSendPrompt(state.attachedSessionName, text);
            }
          }}
        />
      )}

      {/* Footer: Status bar */}
      <Box borderStyle="single" borderTop>
        <StatusBar state={state} />
      </Box>
    </Box>
  );
}
