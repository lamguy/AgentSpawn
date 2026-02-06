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

/**
 * Session list pane component.
 * Displays all sessions with status indicators, cursor navigation, and scrolling support.
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
      <Box flexDirection="column" paddingLeft={1}>
        <Text bold>Sessions</Text>
        <Text dimColor>No sessions</Text>
      </Box>
    );
  }

  // Calculate scroll offset if there are more sessions than can be displayed
  const selectedIndex = sessions.findIndex((s) => s.name === selectedSessionName);
  const scrollOffset = Math.max(0, selectedIndex - maxVisible + 1);
  const visibleSessions = sessions.slice(scrollOffset, scrollOffset + maxVisible);

  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Text bold>Sessions</Text>
      <Box flexDirection="column" marginTop={1}>
        {visibleSessions.map((session) => {
          const isSelected = session.name === selectedSessionName;
          const isAttached = session.name === attachedSessionName;
          const cursor = isSelected ? '>' : ' ';

          return (
            <Box key={session.name} flexDirection="column" marginBottom={0}>
              {/* Session name line with cursor and status */}
              <Box flexDirection="row">
                <Text>{cursor} </Text>
                <Text bold={isSelected} color={isAttached ? 'cyan' : undefined}>
                  {session.name}
                </Text>
                <Text> </Text>
                <StatusBadge state={session.state} />
              </Box>

              {/* Session details (only when selected) */}
              {isSelected && (
                <Box flexDirection="column" marginLeft={2} marginTop={0}>
                  <Text dimColor>• {session.workingDirectory}</Text>
                  {session.state === SessionState.Running && session.pid > 0 && (
                    <Text dimColor>
                      • PID {session.pid} • {formatUptime(session.startedAt)}
                    </Text>
                  )}
                  {session.state === SessionState.Crashed && session.exitCode !== null && (
                    <Text dimColor>• Exit code: {session.exitCode}</Text>
                  )}
                </Box>
              )}
            </Box>
          );
        })}

        {/* Scroll indicator */}
        {sessions.length > maxVisible && (
          <Text dimColor>
            ({scrollOffset + visibleSessions.length}/{sessions.length})
          </Text>
        )}
      </Box>
    </Box>
  );
}

/**
 * Status badge component with color coding.
 */
function StatusBadge({ state }: { state: SessionState }): React.ReactElement {
  const statusConfig = getStatusConfig(state);

  return <Text color={statusConfig.color}>[{statusConfig.label}]</Text>;
}

/**
 * Get status configuration for a given session state.
 * Uses Claude Code semantic color system.
 */
function getStatusConfig(state: SessionState): {
  label: string;
  color: 'green' | 'gray' | 'red' | 'yellow';
} {
  switch (state) {
    case SessionState.Running:
      return { label: 'running', color: 'green' };
    case SessionState.Stopped:
      return { label: 'stopped', color: 'gray' };
    case SessionState.Crashed:
      return { label: 'crashed', color: 'red' };
    default:
      // Fallback for any future states (e.g., "starting")
      return { label: 'starting', color: 'yellow' };
  }
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
