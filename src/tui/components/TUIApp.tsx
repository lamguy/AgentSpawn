import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import type { TUIState, OutputLine } from '../types.js';
import { SessionListPane } from './SessionListPane.js';
import { OutputPane } from './OutputPane.js';
import { StatusBar } from './StatusBar.js';
import { handleKeypress } from '../keybindings.js';

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
  /** Callback for raw stdin input (used in attached mode to forward to session) */
  onRawInput?: (data: Buffer) => void;
}

/**
 * Main TUI application component.
 *
 * Renders a three-panel layout:
 * - Header: Title bar with session count
 * - Body: Two-column layout (SessionListPane | OutputPane)
 * - Footer: StatusBar with keyboard shortcuts
 *
 * Handles keyboard input via Ink's useInput hook and delegates to keybindings module.
 * Manages selection state and notifies parent of state changes.
 */
export function TUIApp({
  initialState,
  onStateChange,
  onExit,
  onRawInput,
}: TUIAppProps): React.ReactElement {
  const [state, setState] = useState<TUIState>(initialState);

  // Detect terminal size for graceful degradation
  const terminalWidth = process.stdout.columns || 80;
  const terminalHeight = process.stdout.rows || 24;
  const isSmallTerminal = terminalWidth < 80 || terminalHeight < 20;

  // Handle keyboard input
  // In attached mode, useInput is still active but only processes Escape (for detach)
  // and forwards all other input via onRawInput callback
  // In navigation mode, useInput processes TUI shortcuts
  useInput(
    (input, key) => {
      // In attached mode, forward raw input to session (except Escape for detach)
      if (state.mode === 'attached') {
        // Check for Escape key to detach
        if (key.escape) {
          const result = handleKeypress(state, '\x1b');
          if ('quit' in result && result.quit) {
            onExit();
            return;
          }
          setState(result as TUIState);
          return;
        }

        // Forward all other input to the session
        if (onRawInput) {
          // Convert input to Buffer
          const buffer = Buffer.from(input, 'utf8');
          onRawInput(buffer);
        }
        return;
      }

      // In navigation mode, process TUI shortcuts
      // Map Ink key events to our key codes
      let keyCode: string;

      if (key.return) {
        keyCode = '\r'; // Enter
      } else if (key.tab) {
        keyCode = key.shift ? '\x1b[Z' : '\t'; // Tab or Shift+Tab
      } else if (key.upArrow) {
        keyCode = '\x1b[A'; // Up arrow
      } else if (key.downArrow) {
        keyCode = '\x1b[B'; // Down arrow
      } else if (key.escape) {
        keyCode = '\x1b'; // Escape
      } else if (key.ctrl && input === 'c') {
        keyCode = '\x03'; // Ctrl+C
      } else {
        keyCode = input; // Regular character
      }

      // Process the key press
      const result = handleKeypress(state, keyCode);

      // Check if we should quit
      if ('quit' in result && result.quit) {
        onExit();
        return;
      }

      // Update state (TypeScript knows result is TUIState here because of the check above)
      setState(result as TUIState);
    },
    { isActive: true }, // Always active, but we handle mode-specific logic inside
  );

  // Notify parent of state changes
  useEffect(() => {
    if (onStateChange) {
      onStateChange(state);
    }
  }, [state, onStateChange]);

  // Determine selected session for output pane
  const selectedSession = state.sessions.find(
    (s) => s.name === state.selectedSessionName,
  );

  // Convert output lines (strings) to OutputLine objects
  // This is a temporary adapter until we refactor the state shape
  const outputLines: OutputLine[] = state.outputLines.map((text) => ({
    sessionName: state.selectedSessionName ?? '',
    text,
    timestamp: new Date(), // Placeholder timestamp
    isError: false,
  }));

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

  return (
    <Box flexDirection="column" height="100%">
      {/* Header: Title bar */}
      <Box
        flexDirection="row"
        justifyContent="space-between"
        paddingX={1}
        borderStyle="single"
        borderBottom
      >
        <Box flexDirection="row" gap={1}>
          <Text bold>AgentSpawn</Text>
          {state.mode === 'attached' && state.attachedSessionName && (
            <Text color="green">
              [ATTACHED: {state.attachedSessionName}]
            </Text>
          )}
        </Box>
        <Text color="cyan">
          [{state.sessions.length} {state.sessions.length === 1 ? 'session' : 'sessions'}]
        </Text>
      </Box>

      {/* Body: Two-column layout (30% session list / 70% output) */}
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
            session={selectedSession ?? null}
            outputLines={outputLines}
          />
        </Box>
      </Box>

      {/* Footer: Status bar */}
      <Box borderStyle="single" borderTop>
        <StatusBar state={state} />
      </Box>
    </Box>
  );
}
