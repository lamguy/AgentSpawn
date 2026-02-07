import React from 'react';
import { Box, Text } from 'ink';
import type { SessionInfo } from '../../types.js';
import { SessionState } from '../../types.js';

export interface SessionListPaneProps {
  /** All sessions to display */
  sessions: SessionInfo[];
  /** Name of the currently selected session */
  selectedSessionName: string | null;
  /** Name of the session that's attached (receiving stdin) */
  attachedSessionName: string | null;
  /** Maximum number of visible sessions before scrolling */
  maxVisible?: number;
}

/** Status symbol and color per session state */
const STATUS_CONFIG: Record<
  SessionState,
  { symbol: string; color: string }
> = {
  [SessionState.Running]: { symbol: '\u25CF', color: 'green' },   // ●
  [SessionState.Stopped]: { symbol: '\u25CB', color: 'gray' },    // ○
  [SessionState.Crashed]: { symbol: '\u25B2', color: 'red' },     // ▲
};

/**
 * Session list pane component.
 * Displays all sessions with Unicode status symbols, card-like rows,
 * expanded details for the selected session, and scroll indicators.
 */
export function SessionListPane({
  sessions,
  selectedSessionName,
  attachedSessionName,
  maxVisible = 20,
}: SessionListPaneProps): React.ReactElement {
  // Handle empty state
  if (sessions.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold>Sessions</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>No sessions. Press n to create one.</Text>
        </Box>
      </Box>
    );
  }

  // Calculate scroll offset if there are more sessions than can be displayed
  const selectedIndex = sessions.findIndex((s) => s.name === selectedSessionName);
  const scrollOffset = Math.max(0, selectedIndex - maxVisible + 1);
  const visibleSessions = sessions.slice(scrollOffset, scrollOffset + maxVisible);
  const hasMoreAbove = scrollOffset > 0;
  const hasMoreBelow = scrollOffset + maxVisible < sessions.length;

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Pane title with session count */}
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold>Sessions</Text>
        <Text dimColor>{sessions.length}</Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {/* Scroll-up indicator */}
        {hasMoreAbove && (
          <Text dimColor>  ... {scrollOffset} more above</Text>
        )}

        {visibleSessions.map((session) => {
          const isSelected = session.name === selectedSessionName;
          const isAttached = session.name === attachedSessionName;
          const status = STATUS_CONFIG[session.state] ?? STATUS_CONFIG[SessionState.Stopped];

          return (
            <Box key={session.name} flexDirection="column">
              {/* Session row: cursor + name + status symbol */}
              <Box flexDirection="row">
                {/* Cursor */}
                <Text bold color="cyan">{isSelected ? '> ' : '  '}</Text>

                {/* Session name */}
                <Text
                  bold={isSelected}
                  color={isAttached ? 'magenta' : isSelected ? 'cyan' : undefined}
                >
                  {session.name}
                </Text>

                {/* Spacer */}
                <Text>{' '}</Text>

                {/* Status symbol */}
                <Text color={status.color}>{status.symbol}</Text>
              </Box>

              {/* Expanded details for selected session */}
              {isSelected && (
                <Box flexDirection="column" marginLeft={3}>
                  {/* Working directory */}
                  <Text dimColor>{session.workingDirectory}</Text>

                  {/* PID and uptime (for running sessions) */}
                  {session.state === SessionState.Running && session.pid > 0 && (
                    <Text dimColor>
                      PID {session.pid}  {formatUptime(session.startedAt)}
                    </Text>
                  )}

                  {/* Prompt count */}
                  <Text dimColor>Prompts: {session.promptCount ?? 0}</Text>

                  {/* Exit code for crashed sessions */}
                  {session.state === SessionState.Crashed && session.exitCode != null && (
                    <Text dimColor>Exit code: {session.exitCode}</Text>
                  )}

                  {/* Attached indicator */}
                  {isAttached && (
                    <Text bold color="magenta">ATTACHED</Text>
                  )}
                </Box>
              )}
            </Box>
          );
        })}

        {/* Scroll-down indicator */}
        {hasMoreBelow && (
          <Text dimColor>
            {'  '}... {sessions.length - scrollOffset - maxVisible} more below
          </Text>
        )}
      </Box>
    </Box>
  );
}

/**
 * Format uptime from start date to now.
 * Returns a human-readable duration string (e.g., "23m", "1h 5m", "2d 3h").
 */
function formatUptime(startedAt: Date | null): string {
  if (!startedAt) {
    return '--';
  }

  const now = new Date();
  const uptimeMs = now.getTime() - startedAt.getTime();
  const uptimeSeconds = Math.floor(uptimeMs / 1000);

  if (uptimeSeconds < 60) {
    return `${uptimeSeconds}s`;
  }

  const uptimeMinutes = Math.floor(uptimeSeconds / 60);
  if (uptimeMinutes < 60) {
    return `${uptimeMinutes}m`;
  }

  const uptimeHours = Math.floor(uptimeMinutes / 60);
  const remainingMinutes = uptimeMinutes % 60;
  if (uptimeHours < 24) {
    return remainingMinutes > 0 ? `${uptimeHours}h ${remainingMinutes}m` : `${uptimeHours}h`;
  }

  const uptimeDays = Math.floor(uptimeHours / 24);
  const remainingHours = uptimeHours % 24;
  return remainingHours > 0 ? `${uptimeDays}d ${remainingHours}h` : `${uptimeDays}d`;
}
