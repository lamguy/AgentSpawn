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

/**
 * OutputPane - Displays live output from the selected session.
 *
 * Features:
 * - Streams output from OutputCapture
 * - Handles ANSI escape sequences (preserved in terminal)
 * - Shows tool call formatting (⏺ for calls, ⎿ for results)
 * - Implements scrollback buffer
 * - Auto-scrolls to bottom by default
 * - Shows session name header with spinner when active
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
      <Box flexDirection="column" padding={1}>
        <Text dimColor>No session attached</Text>
      </Box>
    );
  }

  // Render session header
  const isActive = session.state === SessionState.Running;
  const spinner = isActive ? '⏹' : '';
  const header = `> ${session.name} ${spinner}`.trim();

  // Calculate visible lines (apply scrollback)
  const totalLines = outputLines.length;
  const visibleStartIndex = Math.max(0, totalLines - maxVisibleLines + scrollOffset);
  const visibleEndIndex = totalLines + scrollOffset;
  const visibleLines = outputLines.slice(visibleStartIndex, visibleEndIndex);

  return (
    <Box flexDirection="column" width="100%">
      {/* Session name header */}
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          {header}
        </Text>
      </Box>

      {/* Output lines */}
      <Box flexDirection="column">
        {visibleLines.length === 0 ? (
          <Text dimColor>No output yet...</Text>
        ) : (
          visibleLines.map((line, index) => (
            <OutputLineComponent
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
            [{Math.abs(scrollOffset)} lines below, scroll to see more]
          </Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * OutputLineComponent - Renders a single output line with formatting.
 *
 * Handles special formatting:
 * - Tool calls: lines starting with "⏺" are colored cyan
 * - Tool results: lines starting with "⎿" are colored gray
 * - Error lines: colored red
 * - Regular lines: default color with ANSI sequences preserved
 */
function OutputLineComponent({ line }: { line: OutputLine }): React.ReactElement {
  const text = line.text;

  // Detect tool call formatting
  const isToolCall = text.trimStart().startsWith('⏺');
  const isToolResult = text.trimStart().startsWith('⎿');

  // Apply semantic colors
  if (line.isError) {
    return <Text color="red">{text}</Text>;
  }

  if (isToolCall) {
    return <Text color="cyan">{text}</Text>;
  }

  if (isToolResult) {
    return <Text dimColor>{text}</Text>;
  }

  // Default: preserve ANSI sequences in the text
  // Ink will render ANSI escape codes automatically
  return <Text>{text}</Text>;
}
