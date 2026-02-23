import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import type { TUIState, TUIAction } from '../types.js';
import { SessionListPane } from './SessionListPane.js';
import { OutputPane } from './OutputPane.js';
import { SplitPane } from './SplitPane.js';
import { StatusBar } from './StatusBar.js';
import { InputBar } from './InputBar.js';
import { HelpOverlay } from './HelpOverlay.js';
import { ActionMenu } from './ActionMenu.js';
import { SessionCreationDialog } from './SessionCreationDialog.js';
import { ConfirmationDialog } from './ConfirmationDialog.js';
import { HistorySearchOverlay } from './HistorySearchOverlay.js';
import { handleKeypress } from '../keybindings.js';
import { topOverlay } from '../overlay-helpers.js';
import { type KeybindingConfig, DEFAULT_KEYBINDINGS } from '../../config/keybindings.js';
import { ARCADE_COLORS, ARCADE_HEADER_COMPACT, ARCADE_DECOR } from '../theme/arcade.js';

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
  /** Resolved keybinding configuration (loaded from disk at startup) */
  keybindings?: Required<KeybindingConfig>;
}

/**
 * Main TUI application component — retro arcade cabinet aesthetic.
 *
 * Renders:
 * - Header: ASCII art title + player count + score
 * - Body: Session list (SELECT PLAYER) + output pane (GAME FEED) or overlays
 * - Input bar: visible only in IN GAME mode
 * - Footer: StatusBar with arcade mode badges and context-sensitive hints
 */
export function TUIApp({
  initialState,
  onStateChange,
  onExit,
  onSendPrompt,
  onAction,
  isProcessing = false,
  keybindings = DEFAULT_KEYBINDINGS,
}: TUIAppProps): React.ReactElement {
  const [state, setState] = useState<TUIState>(initialState);

  const terminalWidth = process.stdout.columns || 80;
  const terminalHeight = process.stdout.rows || 24;
  const isSmallTerminal = terminalWidth < 80 || terminalHeight < 20;

  const isAttached = state.mode === 'attached';
  const activeOverlay = topOverlay(state);
  const isSessionCreation = activeOverlay?.kind === 'session-creation';

  useInput(
    (input, key) => {
      let keyCode: string;

      if (key.return) {
        keyCode = '\r';
      } else if (key.tab) {
        keyCode = key.shift ? '\x1b[Z' : '\t';
      } else if (key.upArrow) {
        keyCode = '\x1b[A';
      } else if (key.downArrow) {
        keyCode = '\x1b[B';
      } else if (key.leftArrow) {
        keyCode = '\x1b[D';
      } else if (key.rightArrow) {
        keyCode = '\x1b[C';
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

      const result = handleKeypress(state, keyCode, keybindings);

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

  useEffect(() => {
    if (onStateChange) {
      onStateChange(state);
    }
  }, [state, onStateChange]);

  const displaySessionName =
    isAttached && state.attachedSessionName
      ? state.attachedSessionName
      : state.selectedSessionName;
  const displaySession = state.sessions.find(
    (s) => s.name === displaySessionName,
  ) ?? null;

  const outputLines = state.outputLines;

  // Total prompt count across all sessions (used as SCORE)
  const totalPrompts = state.sessions.reduce(
    (sum, s) => sum + (s.promptCount ?? 0), 0,
  );
  const playerCount = state.sessions.length + state.remoteSessions.length;

  // Small terminal warning — arcade style
  if (isSmallTerminal) {
    return (
      <Box flexDirection="column" padding={2}>
        <Text bold color={ARCADE_COLORS.acidYellow}>
          !! SCREEN TOO SMALL !!
        </Text>
        <Text color={ARCADE_COLORS.ghostWhite}>
          MINIMUM: 80x20  CURRENT: {terminalWidth}x{terminalHeight}
        </Text>
        <Box marginTop={1}>
          <Text color={ARCADE_COLORS.phosphorGray}>
            RESIZE TERMINAL OR USE CLI COMMANDS
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color={ARCADE_COLORS.phosphorGray}>PRESS </Text>
          <Text bold color={ARCADE_COLORS.neonCyan}>q</Text>
          <Text color={ARCADE_COLORS.phosphorGray}> TO POWER OFF</Text>
        </Box>
      </Box>
    );
  }

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
      {/* Header: ASCII art + player count + score */}
      <Box
        flexDirection="column"
        paddingX={1}
        borderStyle="double"
        borderBottom
        borderColor={ARCADE_COLORS.neonCyan}
      >
        {/* ASCII art title */}
        {ARCADE_HEADER_COMPACT.map((line, i) => (
          <Text key={i} bold color={ARCADE_COLORS.neonCyan}>{line}</Text>
        ))}
        {/* Subtitle row */}
        <Box flexDirection="row" justifyContent="space-between" marginTop={0}>
          <Box flexDirection="row" gap={1}>
            <Text color={ARCADE_COLORS.acidYellow}>
              {ARCADE_DECOR.sectionTitle('SESSION MANAGER')}
            </Text>
            {isAttached && state.attachedSessionName && (
              <Text
                bold
                backgroundColor={ARCADE_COLORS.hotPink}
                color="#000000"
              >
                {' '}[IN GAME: {state.attachedSessionName}]{' '}
              </Text>
            )}
            {state.splitMode && (
              <Text
                bold
                backgroundColor={ARCADE_COLORS.electricPurple}
                color="#000000"
              >
                {' '}[VERSUS MODE]{' '}
              </Text>
            )}
          </Box>
          <Text color={ARCADE_COLORS.arcadeOrange}>
            PLAYERS: {String(playerCount).padStart(2, '0')}
            {ARCADE_DECOR.separator}
            SCORE: {String(totalPrompts).padStart(6, '0')}
          </Text>
        </Box>
      </Box>

      {/* Body */}
      {activeOverlay ? (
        <Box flexGrow={1} flexDirection="column" justifyContent="center" alignItems="center" paddingY={1}>
          {renderOverlay()}
        </Box>
      ) : state.splitMode ? (
        <Box flexDirection="row" flexGrow={1}>
          <Box width="20%" borderStyle="single" borderRight flexDirection="column" paddingY={1}>
            <SessionListPane
              sessions={state.sessions}
              selectedSessionName={state.selectedSessionName}
              attachedSessionName={state.attachedSessionName}
              remoteSessions={state.remoteSessions}
            />
          </Box>
          <Box width="80%" flexDirection="column">
            <SplitPane
              leftSession={state.sessions.find((s) => s.name === state.splitPaneSessions[0]) ?? null}
              rightSession={state.sessions.find((s) => s.name === state.splitPaneSessions[1]) ?? null}
              outputMap={state.splitOutputLines}
              activePaneIndex={state.activePaneIndex}
            />
          </Box>
        </Box>
      ) : (
        <Box flexDirection="row" flexGrow={1}>
          <Box width="30%" borderStyle="single" borderRight flexDirection="column" paddingY={1}>
            <SessionListPane
              sessions={state.sessions}
              selectedSessionName={state.selectedSessionName}
              attachedSessionName={state.attachedSessionName}
              remoteSessions={state.remoteSessions}
            />
          </Box>
          <Box width="70%" flexDirection="column" paddingY={1} paddingX={1}>
            <OutputPane session={displaySession} outputLines={outputLines} />
          </Box>
        </Box>
      )}

      {/* Input bar: IN GAME mode only */}
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

      {/* Footer */}
      <Box borderStyle="double" borderTop borderColor={ARCADE_COLORS.neonCyan}>
        <StatusBar state={state} />
      </Box>
    </Box>
  );
}
