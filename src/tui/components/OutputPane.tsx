import React, { useEffect, useState, useRef } from 'react';
import { Box, Text } from 'ink';
import type { OutputLine } from '../types.js';
import type { SessionInfo } from '../../types.js';
import { SessionState } from '../../types.js';

interface OutputPaneProps {
  /** The session whose output to display */
  session: SessionInfo | null;
  /** Captured output lines from OutputCapture */
  outputLines: OutputLine[];
  /** Maximum number of lines to display (scrollback buffer size) */
  maxVisibleLines?: number;
  /** Whether to auto-scroll to bottom on new content */
  autoScroll?: boolean;
}

/** Status symbol and color per session state */
const STATUS_CONFIG: Record<
  SessionState,
  { symbol: string; color: string; label: string }
> = {
  [SessionState.Running]: { symbol: '\u25CF', color: 'green', label: 'running' },
  [SessionState.Stopped]: { symbol: '\u25CB', color: 'gray', label: 'stopped' },
  [SessionState.Crashed]: { symbol: '\u25B2', color: 'red', label: 'crashed' },
};

/**
 * OutputPane - Displays live output from the selected session.
 *
 * Features:
 * - Pane header with session name, status symbol, state label, and scroll position
 * - Dim HH:MM timestamps in a gutter for each output line
 * - Styled output lines classified by content (user prompt, tool call, tool result, error)
 * - Informative empty state with session name and guidance
 * - Auto-scrolls to bottom by default
 */
export function OutputPane({
  session,
  outputLines,
  maxVisibleLines = 1000,
  autoScroll = true,
}: OutputPaneProps): React.ReactElement {
  const [scrollOffset, setScrollOffset] = useState(0);
  const previousLineCount = useRef(outputLines.length);

  // Auto-scroll to bottom when new lines arrive
  useEffect(() => {
    if (autoScroll && outputLines.length > previousLineCount.current) {
      setScrollOffset(0);
    }
    previousLineCount.current = outputLines.length;
  }, [outputLines.length, autoScroll]);

  // Empty state: no session selected
  if (!session) {
    return (
      <Box flexDirection="column" width="100%">
        {/* Minimal header */}
        <Box marginBottom={1}>
          <Text bold>Output</Text>
        </Box>
        <Box flexDirection="column" paddingX={2} paddingY={1}>
          <Text dimColor>Select a session to view output</Text>
          <Text dimColor>or press n to create a new one</Text>
        </Box>
      </Box>
    );
  }

  const status = STATUS_CONFIG[session.state] ?? STATUS_CONFIG[SessionState.Stopped];

  // Calculate visible lines (apply scrollback)
  const totalLines = outputLines.length;
  const visibleStartIndex = Math.max(0, totalLines - maxVisibleLines + scrollOffset);
  const visibleEndIndex = totalLines + scrollOffset;
  const visibleLines = outputLines.slice(visibleStartIndex, visibleEndIndex);

  // Scroll position indicator
  const scrollIndicator =
    scrollOffset >= 0 ? 'END' : `${visibleEndIndex}/${totalLines}`;

  return (
    <Box flexDirection="column" width="100%">
      {/* Pane header: Output: name  symbol  state    [scroll] */}
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <Box flexDirection="row">
          <Text bold>Output: </Text>
          <Text bold color="cyan">{session.name}</Text>
          <Text>  </Text>
          <Text color={status.color}>{status.symbol}</Text>
          <Text>  </Text>
          <Text color={status.color}>{status.label}</Text>
        </Box>
        <Text dimColor>[{scrollIndicator}]</Text>
      </Box>

      {/* Output lines */}
      <Box flexDirection="column">
        {visibleLines.length === 0 ? (
          <Box flexDirection="column" paddingX={2} paddingY={1}>
            <Text dimColor>{session.name} - No output yet</Text>
            <Text dimColor>Press Enter to attach and send prompts</Text>
          </Box>
        ) : (
          visibleLines.map((line, index) => (
            <StyledOutputLine
              key={`${line.timestamp.getTime()}-${index}`}
              line={line}
            />
          ))
        )}
      </Box>

      {/* Scrollback indicator (if not at bottom) */}
      {scrollOffset < 0 && (
        <Box marginTop={1}>
          <Text dimColor>
            ... {Math.abs(scrollOffset)} lines below
          </Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * Classify an output line by its content for styling.
 */
function classifyLine(
  text: string,
  isError: boolean,
): 'user-prompt' | 'tool-call' | 'tool-result' | 'error' | 'normal' {
  if (isError) return 'error';
  const trimmed = text.trimStart();
  if (trimmed.startsWith('You:') || trimmed.startsWith('>')) return 'user-prompt';
  if (trimmed.startsWith('\u23FA') || trimmed.startsWith('*')) return 'tool-call';
  if (trimmed.startsWith('\u23BF') || trimmed.startsWith('|')) return 'tool-result';
  return 'normal';
}

/**
 * Format a Date to HH:MM for the timestamp gutter.
 */
function formatTimestamp(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * StyledOutputLine - Renders a single output line with timestamp gutter and semantic styling.
 */
function StyledOutputLine({ line }: { line: OutputLine }): React.ReactElement {
  const text = line.text;
  const lineType = classifyLine(text, line.isError);
  const timestamp = formatTimestamp(line.timestamp);

  return (
    <Box flexDirection="row">
      {/* Timestamp gutter */}
      <Text dimColor>{timestamp} </Text>

      {/* Styled line content */}
      {lineType === 'error' && <Text color="red">{text}</Text>}
      {lineType === 'user-prompt' && <Text bold color="magenta">{text}</Text>}
      {lineType === 'tool-call' && <Text color="cyan">{text}</Text>}
      {lineType === 'tool-result' && <Text dimColor>{text}</Text>}
      {lineType === 'normal' && <Text>{text}</Text>}
    </Box>
  );
}
