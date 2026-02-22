import React, { useEffect, useState, useRef } from 'react';
import { Box, Text } from 'ink';
import type { OutputLine } from '../types.js';
import type { SessionInfo } from '../../types.js';
import { SessionState } from '../../types.js';
import { ARCADE_COLORS, ARCADE_STATUS, ARCADE_DECOR } from '../theme/arcade.js';

interface OutputPaneProps {
  session: SessionInfo | null;
  outputLines: OutputLine[];
  maxVisibleLines?: number;
  autoScroll?: boolean;
}

/**
 * OutputPane — GAME FEED display for a session's output.
 */
export function OutputPane({
  session,
  outputLines,
  maxVisibleLines = 1000,
  autoScroll = true,
}: OutputPaneProps): React.ReactElement {
  const [scrollOffset, setScrollOffset] = useState(0);
  const previousLineCount = useRef(outputLines.length);

  useEffect(() => {
    if (autoScroll && outputLines.length > previousLineCount.current) {
      setScrollOffset(0);
    }
    previousLineCount.current = outputLines.length;
  }, [outputLines.length, autoScroll]);

  if (!session) {
    return (
      <Box flexDirection="column" width="100%">
        <Box marginBottom={1}>
          <Text bold color={ARCADE_COLORS.acidYellow}>GAME FEED</Text>
        </Box>
        <Box flexDirection="column" paddingX={2} paddingY={1}>
          <Text color={ARCADE_COLORS.phosphorGray}>SELECT A PLAYER TO VIEW GAME FEED</Text>
          <Text color={ARCADE_COLORS.phosphorGray}>or press n to INSERT COIN</Text>
        </Box>
      </Box>
    );
  }

  const stateKey = session.state as keyof typeof ARCADE_STATUS;
  const status = ARCADE_STATUS[stateKey] ?? ARCADE_STATUS[SessionState.Stopped as keyof typeof ARCADE_STATUS];

  const totalLines = outputLines.length;
  const visibleStartIndex = Math.max(0, totalLines - maxVisibleLines + scrollOffset);
  const visibleEndIndex = totalLines + scrollOffset;
  const visibleLines = outputLines.slice(visibleStartIndex, visibleEndIndex);

  const scrollIndicator = scrollOffset >= 0 ? 'END' : `${visibleEndIndex}/${totalLines}`;

  return (
    <Box flexDirection="column" width="100%">
      {/* Pane header */}
      <Box flexDirection="row" justifyContent="space-between" marginBottom={0}>
        <Box flexDirection="row">
          <Text bold color={ARCADE_COLORS.acidYellow}>GAME FEED: </Text>
          <Text bold color={ARCADE_COLORS.neonCyan}>{session.name}</Text>
          <Text>  </Text>
          <Text bold color={status.color}>{status.symbol}</Text>
          <Text>  </Text>
          <Text color={status.color}>{status.label}</Text>
        </Box>
        <Text color={ARCADE_COLORS.phosphorGray}>[{scrollIndicator}]</Text>
      </Box>

      {/* Scanline separator */}
      <Text color={ARCADE_COLORS.phosphorGray}>{ARCADE_DECOR.scanline}</Text>

      {/* Output lines */}
      <Box flexDirection="column">
        {visibleLines.length === 0 ? (
          <Box flexDirection="column" paddingX={2} paddingY={1}>
            <Text color={ARCADE_COLORS.phosphorGray}>
              {session.name}{ARCADE_DECOR.separator}NO OUTPUT YET
            </Text>
            <Text color={ARCADE_COLORS.phosphorGray}>Press Enter to attach and send moves</Text>
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

      {scrollOffset < 0 && (
        <Box marginTop={1}>
          <Text color={ARCADE_COLORS.phosphorGray}>
            ... {Math.abs(scrollOffset)} lines below
          </Text>
        </Box>
      )}
    </Box>
  );
}

function classifyLine(text: string, isError: boolean): 'user-prompt' | 'tool-call' | 'tool-result' | 'error' | 'normal' {
  if (isError) return 'error';
  const trimmed = text.trimStart();
  if (trimmed.startsWith('You:') || trimmed.startsWith('>')) return 'user-prompt';
  if (trimmed.startsWith('\u23FA') || trimmed.startsWith('*')) return 'tool-call';
  if (trimmed.startsWith('\u23BF') || trimmed.startsWith('|')) return 'tool-result';
  return 'normal';
}

function formatTimestamp(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function StyledOutputLine({ line }: { line: OutputLine }): React.ReactElement {
  const text = line.text;
  const lineType = classifyLine(text, line.isError);
  const timestamp = formatTimestamp(line.timestamp);

  return (
    <Box flexDirection="row">
      <Text color={ARCADE_COLORS.phosphorGray}>{timestamp} </Text>
      {lineType === 'error'       && <Text color={ARCADE_COLORS.laserRed}>{text}</Text>}
      {lineType === 'user-prompt' && <Text bold color={ARCADE_COLORS.hotPink}>{text}</Text>}
      {lineType === 'tool-call'   && <Text color={ARCADE_COLORS.neonCyan}>{text}</Text>}
      {lineType === 'tool-result' && <Text color={ARCADE_COLORS.phosphorGray}>{text}</Text>}
      {lineType === 'normal'      && <Text color={ARCADE_COLORS.ghostWhite}>{text}</Text>}
    </Box>
  );
}
