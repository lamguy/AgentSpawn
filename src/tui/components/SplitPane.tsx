import React from 'react';
import { Box, Text } from 'ink';
import type { OutputLine } from '../types.js';
import type { SessionInfo } from '../../types.js';
import { SessionState } from '../../types.js';

// ── Status config (shared with OutputPane) ────────────────────────────────────

const STATUS_CONFIG: Record<
  SessionState,
  { symbol: string; color: string; label: string }
> = {
  [SessionState.Running]: { symbol: '\u25CF', color: 'green', label: 'running' },
  [SessionState.Stopped]: { symbol: '\u25CB', color: 'gray', label: 'stopped' },
  [SessionState.Crashed]: { symbol: '\u25B2', color: 'red', label: 'crashed' },
};

// ── SplitOutputPane ───────────────────────────────────────────────────────────

interface SplitOutputPaneProps {
  /** Session info for this pane (null if no session assigned) */
  session: SessionInfo | null;
  /** Captured output lines for this session */
  lines: OutputLine[];
  /** Whether this pane is the currently focused pane */
  isActive: boolean;
  /** Maximum number of lines to display */
  maxVisibleLines?: number;
}

/**
 * SplitOutputPane — a single pane in the split-view layout.
 *
 * Shows a session name header, status indicator, and the last N output lines.
 * The active pane gets a cyan border; inactive panes get a dimmed border.
 */
export function SplitOutputPane({
  session,
  lines,
  isActive,
  maxVisibleLines = 200,
}: SplitOutputPaneProps): React.ReactElement {
  const borderColor = isActive ? 'cyan' : 'gray';

  if (!session) {
    return (
      <Box
        flexDirection="column"
        flexGrow={1}
        borderStyle="single"
        borderColor={borderColor}
        paddingX={1}
        paddingY={0}
        overflow="hidden"
      >
        <Box marginBottom={1}>
          <Text bold color={isActive ? 'cyan' : 'gray'}>
            {isActive ? '[ Active Pane ]' : '[ Pane ]'}
          </Text>
        </Box>
        <Text dimColor>No session assigned</Text>
        <Text dimColor>Press Enter to assign selected session</Text>
      </Box>
    );
  }

  const status = STATUS_CONFIG[session.state] ?? STATUS_CONFIG[SessionState.Stopped];

  // Slice to last maxVisibleLines
  const visibleLines = lines.length > maxVisibleLines
    ? lines.slice(lines.length - maxVisibleLines)
    : lines;

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="single"
      borderColor={borderColor}
      paddingX={1}
      paddingY={0}
      overflow="hidden"
    >
      {/* Pane header */}
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <Box flexDirection="row">
          <Text bold color={isActive ? 'cyan' : 'white'}>{session.name}</Text>
          <Text>  </Text>
          <Text color={status.color}>{status.symbol}</Text>
          <Text>  </Text>
          <Text color={status.color}>{status.label}</Text>
        </Box>
        {isActive && (
          <Text bold color="cyan">ACTIVE</Text>
        )}
      </Box>

      {/* Output lines */}
      {visibleLines.length === 0 ? (
        <Box paddingX={1}>
          <Text dimColor>No output yet</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {visibleLines.map((line, index) => (
            <SplitOutputLine
              key={`${line.timestamp.getTime()}-${index}`}
              line={line}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

// ── SplitPane ─────────────────────────────────────────────────────────────────

export interface SplitPaneProps {
  /** Session assigned to the left pane */
  leftSession: SessionInfo | null;
  /** Session assigned to the right pane */
  rightSession: SessionInfo | null;
  /** Output lines per session */
  outputMap: Map<string, OutputLine[]>;
  /** Which pane index is active (0 = left, 1 = right) */
  activePaneIndex: 0 | 1;
}

/**
 * SplitPane — two-column split view showing output from two sessions simultaneously.
 *
 * Layout: [left pane | right pane]
 * Active pane is highlighted with a cyan border.
 * Use `[`/`]` or left/right arrows to navigate between panes.
 */
export function SplitPane({
  leftSession,
  rightSession,
  outputMap,
  activePaneIndex,
}: SplitPaneProps): React.ReactElement {
  const leftLines = leftSession ? (outputMap.get(leftSession.name) ?? []) : [];
  const rightLines = rightSession ? (outputMap.get(rightSession.name) ?? []) : [];

  return (
    <Box flexDirection="row" flexGrow={1}>
      <SplitOutputPane
        session={leftSession}
        lines={leftLines}
        isActive={activePaneIndex === 0}
      />
      <SplitOutputPane
        session={rightSession}
        lines={rightLines}
        isActive={activePaneIndex === 1}
      />
    </Box>
  );
}

// ── SplitOutputLine ───────────────────────────────────────────────────────────

function classifyLine(text: string, isError: boolean): 'user-prompt' | 'tool-call' | 'tool-result' | 'error' | 'normal' {
  if (isError) return 'error';
  const trimmed = text.trimStart();
  if (trimmed.startsWith('You:') || trimmed.startsWith('>')) return 'user-prompt';
  if (trimmed.startsWith('\u23FA') || trimmed.startsWith('*')) return 'tool-call';
  if (trimmed.startsWith('\u23BF') || trimmed.startsWith('|')) return 'tool-result';
  return 'normal';
}

function formatTimestamp(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function SplitOutputLine({ line }: { line: OutputLine }): React.ReactElement {
  const lineType = classifyLine(line.text, line.isError);
  const timestamp = formatTimestamp(line.timestamp);

  return (
    <Box flexDirection="row">
      <Text dimColor>{timestamp} </Text>
      {lineType === 'error' && <Text color="red">{line.text}</Text>}
      {lineType === 'user-prompt' && <Text bold color="magenta">{line.text}</Text>}
      {lineType === 'tool-call' && <Text color="cyan">{line.text}</Text>}
      {lineType === 'tool-result' && <Text dimColor>{line.text}</Text>}
      {lineType === 'normal' && <Text>{line.text}</Text>}
    </Box>
  );
}
