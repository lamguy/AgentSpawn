import React from 'react';
import { Box, Text } from 'ink';
import type { TUIState, OverlayState, StatusMessage } from '../types.js';

/**
 * StatusBar component props.
 */
export interface StatusBarProps {
  /** Current TUI state */
  state: TUIState;
  /** Version string (e.g., "v0.1.0") */
  version?: string;
}

interface ShortcutDef {
  key: string;
  action: string;
}

/**
 * Get the mode badge label and colors based on current state.
 */
function getModeBadge(
  mode: TUIState['mode'],
  topOverlay: OverlayState | null,
): { label: string; bgColor?: string; fgColor: string } {
  // Overlay takes priority over base mode
  if (topOverlay) {
    switch (topOverlay.kind) {
      case 'help':
        return { label: ' HELP ', bgColor: 'yellow', fgColor: 'black' };
      case 'action-menu':
        return { label: ' MENU ', bgColor: 'blue', fgColor: 'black' };
      case 'session-creation':
        return { label: ' NEW SESSION ', bgColor: 'yellow', fgColor: 'black' };
      case 'confirmation':
        return { label: ' CONFIRM ', bgColor: 'yellow', fgColor: 'black' };
    }
  }

  switch (mode) {
    case 'attached':
      return { label: ' ATTACHED ', bgColor: 'magenta', fgColor: 'black' };
    case 'navigation':
    default:
      return { label: ' NAV ', fgColor: 'cyan' };
  }
}

/**
 * Get context-sensitive shortcuts based on current mode and overlay.
 */
function getShortcuts(
  mode: TUIState['mode'],
  topOverlay: OverlayState | null,
): ShortcutDef[] {
  if (topOverlay) {
    switch (topOverlay.kind) {
      case 'help':
        return [
          { key: 'Esc', action: 'close' },
          { key: '?', action: 'close' },
        ];
      case 'action-menu':
        return [
          { key: 'Up/Down', action: 'navigate' },
          { key: 'Enter', action: 'select' },
          { key: 'Esc', action: 'close' },
        ];
      case 'session-creation':
        return [
          { key: 'Tab', action: 'switch field' },
          { key: 'Enter', action: 'create' },
          { key: 'Esc', action: 'cancel' },
        ];
      case 'confirmation':
        return [
          { key: 'y', action: 'confirm' },
          { key: 'n', action: 'cancel' },
        ];
    }
  }

  switch (mode) {
    case 'attached':
      return [
        { key: 'Esc', action: 'detach' },
        { key: 'Ctrl+C', action: 'clear' },
      ];
    case 'navigation':
    default:
      return [
        { key: 'Tab', action: 'next' },
        { key: 'Enter', action: 'attach' },
        { key: 'n', action: 'new' },
        { key: 'x', action: 'stop' },
        { key: '?', action: 'help' },
        { key: ':', action: 'menu' },
      ];
  }
}

/**
 * Get the color for a status message level.
 */
function getStatusMessageColor(level: StatusMessage['level']): string {
  switch (level) {
    case 'success':
      return 'green';
    case 'error':
      return 'red';
    case 'info':
    default:
      return 'cyan';
  }
}

/**
 * StatusBar component -- displays persistent bottom bar with mode badge,
 * context-sensitive keyboard shortcuts, and session metadata.
 *
 * Layout:
 * ```
 * [mode-badge] | {shortcuts or status message}           | {metadata}
 * ```
 *
 * The mode badge reflects the current mode or active overlay:
 * - NAV: cyan text (no background)
 * - ATTACHED: magenta background, black text
 * - HELP/MENU/NEW SESSION/CONFIRM: yellow/blue background, black text
 *
 * Shortcuts change based on context. When a status message is active,
 * it replaces the shortcuts area with a colored message.
 */
export function StatusBar({
  state,
  version,
}: StatusBarProps): React.ReactElement {
  const sessionCount = state.sessions.length;

  // Determine the top overlay (if any)
  const topOverlay =
    state.overlayStack && state.overlayStack.length > 0
      ? state.overlayStack[state.overlayStack.length - 1]
      : null;

  const badge = getModeBadge(state.mode, topOverlay);
  const shortcuts = getShortcuts(state.mode, topOverlay);

  // Check for active (non-expired) status message
  const statusMessage =
    state.statusMessage && state.statusMessage.expiresAt > Date.now()
      ? state.statusMessage
      : null;

  // Session count string
  const sessionCountStr =
    sessionCount === 0
      ? 'no sessions'
      : `${sessionCount} ${sessionCount === 1 ? 'session' : 'sessions'}`;

  return (
    <Box flexDirection="row" justifyContent="space-between" paddingX={1}>
      {/* Left: mode badge + shortcuts/status message */}
      <Box flexDirection="row" gap={0}>
        {/* Mode badge */}
        {badge.bgColor ? (
          <Text bold backgroundColor={badge.bgColor} color={badge.fgColor}>
            {badge.label}
          </Text>
        ) : (
          <Text bold color={badge.fgColor}>
            {badge.label}
          </Text>
        )}

        <Text color="gray"> | </Text>

        {/* Shortcuts or status message */}
        {statusMessage ? (
          <Text color={getStatusMessageColor(statusMessage.level)} bold>
            {statusMessage.text}
          </Text>
        ) : (
          <Box flexDirection="row" gap={0}>
            {shortcuts.map(({ key, action }, index) => (
              <Box key={key + action} flexDirection="row" gap={0}>
                {index > 0 && <Text>  </Text>}
                <Text bold color="cyan">
                  {key}
                </Text>
                <Text dimColor> {action}</Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {/* Right: metadata */}
      <Box flexDirection="row" gap={0}>
        <Text color="cyan">{sessionCountStr}</Text>
        {version && (
          <>
            <Text dimColor>  </Text>
            <Text dimColor>{version}</Text>
          </>
        )}
      </Box>
    </Box>
  );
}
