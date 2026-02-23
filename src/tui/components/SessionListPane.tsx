import React from 'react';
import { Box, Text } from 'ink';
import type { SessionInfo } from '../../types.js';
import { SessionState } from '../../types.js';
import { ARCADE_COLORS, ARCADE_STATUS, ARCADE_DECOR, ARCADE_BLINK } from '../theme/arcade.js';
import { BlinkText } from './BlinkText.js';

export interface SessionListPaneProps {
  sessions: SessionInfo[];
  selectedSessionName: string | null;
  attachedSessionName: string | null;
  maxVisible?: number;
  remoteSessions?: SessionInfo[];
}

/**
 * SessionListPane — the SELECT PLAYER screen.
 *
 * Each session is a "player" with an arcade status badge [+]/[-]/[X],
 * player number P1/P2/..., and expanded details for the selected entry.
 */
export function SessionListPane({
  sessions,
  selectedSessionName,
  attachedSessionName,
  maxVisible = 20,
  remoteSessions = [],
}: SessionListPaneProps): React.ReactElement {
  const allSessions = [...sessions, ...remoteSessions];

  if (allSessions.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold color={ARCADE_COLORS.neonCyan}>
          {ARCADE_DECOR.sectionTitle('SELECT PLAYER')}
        </Text>
        <Text color={ARCADE_COLORS.phosphorGray}>{ARCADE_DECOR.scanline}</Text>
        <Box marginTop={1} flexDirection="column" alignItems="center">
          <BlinkText color={ARCADE_COLORS.acidYellow} bold intervalMs={ARCADE_BLINK.insertCoin}>
            INSERT COIN TO BEGIN
          </BlinkText>
          <Text color={ARCADE_COLORS.phosphorGray}>Press n to spawn a player</Text>
        </Box>
      </Box>
    );
  }

  const selectedIndex = allSessions.findIndex((s) => s.name === selectedSessionName);
  const scrollOffset = Math.max(0, selectedIndex - maxVisible + 1);
  const visibleSessions = allSessions.slice(scrollOffset, scrollOffset + maxVisible);
  const hasMoreAbove = scrollOffset > 0;
  const hasMoreBelow = scrollOffset + maxVisible < allSessions.length;

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Pane title */}
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold color={ARCADE_COLORS.neonCyan}>
          {ARCADE_DECOR.sectionTitle('SELECT PLAYER')}
        </Text>
        <Text color={ARCADE_COLORS.arcadeOrange}>{allSessions.length}</Text>
      </Box>
      <Text color={ARCADE_COLORS.phosphorGray}>{ARCADE_DECOR.scanline}</Text>

      <Box flexDirection="column" marginTop={1}>
        {hasMoreAbove && (
          <Text color={ARCADE_COLORS.phosphorGray}>  {ARCADE_DECOR.scrollUp(scrollOffset)}</Text>
        )}

        {visibleSessions.map((session, listIndex) => {
          const globalIndex = scrollOffset + listIndex;
          const playerNum = `P${globalIndex + 1}`;
          const isSelected = session.name === selectedSessionName;
          const isAttached = session.name === attachedSessionName;
          const isRemote = Boolean(session.remoteAlias);

          const stateKey = session.state as keyof typeof ARCADE_STATUS;
          const statusCfg = ARCADE_STATUS[stateKey] ?? ARCADE_STATUS[SessionState.Stopped as keyof typeof ARCADE_STATUS];

          return (
            <Box key={(session.remoteAlias ? session.remoteAlias + ':' : '') + session.name} flexDirection="column">
              {/* Session row */}
              <Box flexDirection="row">
                {/* Cursor */}
                <Text bold color={ARCADE_COLORS.neonCyan}>
                  {isSelected ? ARCADE_DECOR.cursorSelected : ARCADE_DECOR.cursorBlank}
                </Text>
                <Text>{' '}</Text>

                {/* Player number */}
                <Text bold color={ARCADE_COLORS.arcadeOrange}>{playerNum}</Text>
                <Text>{' '}</Text>

                {/* Remote alias */}
                {isRemote && (
                  <Text color={ARCADE_COLORS.phosphorGray}>[{session.remoteAlias}] </Text>
                )}

                {/* Session name */}
                <Text
                  bold={isSelected}
                  color={
                    isAttached
                      ? ARCADE_COLORS.hotPink
                      : isSelected
                        ? ARCADE_COLORS.neonCyan
                        : isRemote
                          ? ARCADE_COLORS.scanlineGray
                          : ARCADE_COLORS.ghostWhite
                  }
                >
                  {session.name}
                </Text>

                <Text>{' '}</Text>

                {/* Status symbol */}
                <Text bold color={statusCfg.color}>{statusCfg.symbol}</Text>
              </Box>

              {/* Expanded details for selected session */}
              {isSelected && (
                <Box flexDirection="column" marginLeft={5}>
                  <Text color={ARCADE_COLORS.phosphorGray}>{session.workingDirectory}</Text>

                  {session.state === SessionState.Running && session.pid > 0 && (
                    <Text color={ARCADE_COLORS.phosphorGray}>
                      <Text color={ARCADE_COLORS.acidYellow}>CHIP# </Text>
                      {session.pid}{'  '}
                      <Text color={ARCADE_COLORS.acidYellow}>PLAY TIME </Text>
                      {formatUptime(session.startedAt)}
                    </Text>
                  )}

                  <Text color={ARCADE_COLORS.phosphorGray}>
                    <Text color={ARCADE_COLORS.acidYellow}>MOVES: </Text>
                    {session.promptCount ?? 0}
                  </Text>

                  {session.state === SessionState.Crashed && session.exitCode != null && (
                    <Text color={ARCADE_COLORS.phosphorGray}>
                      Exit code: {session.exitCode}
                    </Text>
                  )}

                  {isAttached && (
                    <Text bold color={ARCADE_COLORS.hotPink}>[IN GAME]</Text>
                  )}

                  <Text bold color={statusCfg.color}>
                    {statusCfg.label}
                  </Text>
                </Box>
              )}
            </Box>
          );
        })}

        {hasMoreBelow && (
          <Text color={ARCADE_COLORS.phosphorGray}>
            {'  '}{ARCADE_DECOR.scrollDown(allSessions.length - scrollOffset - maxVisible)}
          </Text>
        )}
      </Box>
    </Box>
  );
}

function formatUptime(startedAt: Date | null): string {
  if (!startedAt) return '--';
  const uptimeMs = Date.now() - startedAt.getTime();
  const s = Math.floor(uptimeMs / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
}
