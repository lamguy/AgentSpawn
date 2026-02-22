import React from 'react';
import { Box, Text } from 'ink';
import type { TUIState, OverlayState, StatusMessage } from '../types.js';
import { ARCADE_COLORS, ARCADE_MODES, ARCADE_DECOR } from '../theme/arcade.js';

export interface StatusBarProps {
  state: TUIState;
  version?: string;
}

interface ShortcutDef {
  key: string;
  action: string;
}

function getModeBadge(
  mode: TUIState['mode'],
  topOverlay: OverlayState | null,
  splitMode: boolean,
): { label: string; bgColor?: string; fgColor: string } {
  if (topOverlay) {
    switch (topOverlay.kind) {
      case 'help':
        return { label: ARCADE_MODES.help.label, bgColor: ARCADE_MODES.help.bg, fgColor: ARCADE_MODES.help.fg };
      case 'action-menu':
        return { label: ARCADE_MODES.actionMenu.label, bgColor: ARCADE_MODES.actionMenu.bg, fgColor: ARCADE_MODES.actionMenu.fg };
      case 'session-creation':
        return { label: ARCADE_MODES.sessionCreation.label, bgColor: ARCADE_MODES.sessionCreation.bg, fgColor: ARCADE_MODES.sessionCreation.fg };
      case 'confirmation':
        return { label: ARCADE_MODES.confirmation.label, bgColor: ARCADE_MODES.confirmation.bg, fgColor: ARCADE_MODES.confirmation.fg };
    }
  }

  if (splitMode) {
    return { label: ARCADE_MODES.split.label, bgColor: ARCADE_MODES.split.bg, fgColor: ARCADE_MODES.split.fg };
  }

  switch (mode) {
    case 'attached':
      return { label: ARCADE_MODES.attached.label, bgColor: ARCADE_MODES.attached.bg, fgColor: ARCADE_MODES.attached.fg };
    case 'navigation':
    default:
      return { label: ARCADE_MODES.navigation.label, bgColor: ARCADE_MODES.navigation.bg, fgColor: ARCADE_MODES.navigation.fg };
  }
}

function getShortcuts(
  mode: TUIState['mode'],
  topOverlay: OverlayState | null,
  splitMode: boolean,
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
          { key: 'Enter', action: 'deploy' },
          { key: 'Esc', action: 'abort' },
        ];
      case 'confirmation':
        return [
          { key: 'y', action: 'confirm' },
          { key: 'n', action: 'abort' },
        ];
    }
  }

  if (splitMode) {
    return [
      { key: 'Tab', action: 'next' },
      { key: 'Enter', action: 'assign' },
      { key: '[/]', action: 'switch' },
      { key: 'v', action: 'exit VERSUS' },
      { key: '?', action: 'HOW TO PLAY' },
    ];
  }

  switch (mode) {
    case 'attached':
      return [
        { key: 'Esc', action: 'PAUSE' },
        { key: 'Ctrl+C', action: 'clear' },
      ];
    case 'navigation':
    default:
      return [
        { key: 'Tab', action: 'next' },
        { key: 'Enter', action: 'START' },
        { key: 'n', action: 'COIN' },
        { key: '?', action: 'HOW' },
        { key: ':', action: 'CMD' },
      ];
  }
}

function getStatusMessageColor(level: StatusMessage['level']): string {
  switch (level) {
    case 'success': return ARCADE_COLORS.neonGreen;
    case 'error':   return ARCADE_COLORS.laserRed;
    case 'info':
    default:        return ARCADE_COLORS.neonCyan;
  }
}

/**
 * StatusBar — arcade score bar with mode badge, hints, and player/score counters.
 *
 * Layout:
 * ```
 * [MODE BADGE] :: key ACTION  key ACTION ...        PLAYERS:03 :: SCORE:000042
 * ```
 */
export function StatusBar({ state, version }: StatusBarProps): React.ReactElement {
  const sessionCount = state.sessions.length;

  const topOverlayItem =
    state.overlayStack && state.overlayStack.length > 0
      ? state.overlayStack[state.overlayStack.length - 1]
      : null;

  const badge = getModeBadge(state.mode, topOverlayItem, state.splitMode);
  const shortcuts = getShortcuts(state.mode, topOverlayItem, state.splitMode);

  const statusMessage =
    state.statusMessage && state.statusMessage.expiresAt > Date.now()
      ? state.statusMessage
      : null;

  const playerCountStr = `PLAYERS:${String(sessionCount).padStart(2, '0')}`;
  const totalPrompts = state.sessions.reduce((sum, s) => sum + (s.promptCount ?? 0), 0);
  const scoreStr = `SCORE:${String(totalPrompts).padStart(6, '0')}`;

  const remoteErrors = state.remoteErrors ?? [];

  return (
    <Box flexDirection="row" justifyContent="space-between" paddingX={1}>
      {/* Left: mode badge + hints/status */}
      <Box flexDirection="row" gap={0}>
        {badge.bgColor ? (
          <Text bold backgroundColor={badge.bgColor} color={badge.fgColor}>
            {badge.label}
          </Text>
        ) : (
          <Text bold color={badge.fgColor}>
            {badge.label}
          </Text>
        )}

        <Text color={ARCADE_COLORS.phosphorGray}>{ARCADE_DECOR.separator}</Text>

        {statusMessage ? (
          <Text color={getStatusMessageColor(statusMessage.level)} bold>
            {statusMessage.text}
          </Text>
        ) : (
          <Box flexDirection="row" gap={0}>
            {shortcuts.map(({ key, action }, index) => (
              <Box key={key + action} flexDirection="row" gap={0}>
                {index > 0 && <Text color={ARCADE_COLORS.phosphorGray}>  </Text>}
                <Text bold color={ARCADE_COLORS.neonCyan}>{key}</Text>
                <Text color={ARCADE_COLORS.scanlineGray}> {action}</Text>
              </Box>
            ))}
          </Box>
        )}

        {remoteErrors.length > 0 && (
          <Box flexDirection="row" gap={0} marginLeft={2}>
            {remoteErrors.map(({ alias }) => (
              <Text key={alias} color={ARCADE_COLORS.laserRed}>
                {'  '}[!] {alias}: unreachable
              </Text>
            ))}
          </Box>
        )}
      </Box>

      {/* Right: player count + score */}
      <Box flexDirection="row" gap={0}>
        <Text bold color={ARCADE_COLORS.acidYellow}>{playerCountStr}</Text>
        <Text color={ARCADE_COLORS.phosphorGray}>{ARCADE_DECOR.separator}</Text>
        <Text bold color={ARCADE_COLORS.arcadeOrange}>{scoreStr}</Text>
        {version && (
          <>
            <Text color={ARCADE_COLORS.phosphorGray}>{ARCADE_DECOR.separator}</Text>
            <Text color={ARCADE_COLORS.phosphorGray}>{version}</Text>
          </>
        )}
      </Box>
    </Box>
  );
}
