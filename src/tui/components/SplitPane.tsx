import React from 'react';
import { Box, Text } from 'ink';
import type { OutputLine } from '../types.js';
import type { SessionInfo } from '../../types.js';
import { SessionState } from '../../types.js';
import { ARCADE_COLORS, ARCADE_STATUS, ARCADE_DECOR } from '../theme/arcade.js';

interface SplitOutputPaneProps {
  session: SessionInfo | null;
  lines: OutputLine[];
  isActive: boolean;
  paneLabel: string;
  maxVisibleLines?: number;
}

/**
 * SplitOutputPane — one pane of the VERSUS MODE split view.
 */
export function SplitOutputPane({
  session,
  lines,
  isActive,
  paneLabel,
  maxVisibleLines = 200,
}: SplitOutputPaneProps): React.ReactElement {
  const borderColor = isActive ? ARCADE_COLORS.neonCyan : ARCADE_COLORS.phosphorGray;

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
        <Box marginBottom={0}>
          <Text bold color={ARCADE_COLORS.arcadeOrange}>{paneLabel}</Text>
          <Text bold color={isActive ? ARCADE_COLORS.neonCyan : ARCADE_COLORS.phosphorGray}>
            {isActive ? '  [ Active Pane ]' : '  [ Pane ]'}
          </Text>
        </Box>
        <Text color={ARCADE_COLORS.phosphorGray}>{ARCADE_DECOR.scanline}</Text>
        <Text color={ARCADE_COLORS.phosphorGray}>NO PLAYER ASSIGNED</Text>
        <Text color={ARCADE_COLORS.phosphorGray}>PRESS START TO ASSIGN</Text>
      </Box>
    );
  }

  const stateKey = session.state as keyof typeof ARCADE_STATUS;
  const status = ARCADE_STATUS[stateKey] ?? ARCADE_STATUS[SessionState.Stopped as keyof typeof ARCADE_STATUS];

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
      <Box flexDirection="row" justifyContent="space-between" marginBottom={0}>
        <Box flexDirection="row">
          <Text bold color={ARCADE_COLORS.arcadeOrange}>{paneLabel} </Text>
          <Text bold color={isActive ? ARCADE_COLORS.neonCyan : ARCADE_COLORS.ghostWhite}>
            {session.name}
          </Text>
          <Text>  </Text>
          <Text bold color={status.color}>{status.symbol}</Text>
          <Text>  </Text>
          <Text color={status.color}>{status.label}</Text>
        </Box>
        {isActive && (
          <Text bold color={ARCADE_COLORS.neonCyan}>[ACTIVE]</Text>
        )}
      </Box>

      {/* Scanline separator */}
      <Text color={ARCADE_COLORS.phosphorGray}>{ARCADE_DECOR.scanline}</Text>

      {/* Output lines */}
      {visibleLines.length === 0 ? (
        <Box paddingX={1}>
          <Text color={ARCADE_COLORS.phosphorGray}>NO OUTPUT YET</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {visibleLines.map((line, index) => (
            <SplitOutputLine key={`${line.timestamp.getTime()}-${index}`} line={line} />
          ))}
        </Box>
      )}
    </Box>
  );
}

export interface SplitPaneProps {
  leftSession: SessionInfo | null;
  rightSession: SessionInfo | null;
  outputMap: Map<string, OutputLine[]>;
  activePaneIndex: 0 | 1;
}

/**
 * SplitPane — VERSUS MODE two-column layout.
 */
export function SplitPane({
  leftSession,
  rightSession,
  outputMap,
  activePaneIndex,
}: SplitPaneProps): React.ReactElement {
  const leftLines  = leftSession  ? (outputMap.get(leftSession.name)  ?? []) : [];
  const rightLines = rightSession ? (outputMap.get(rightSession.name) ?? []) : [];

  return (
    <Box flexDirection="row" flexGrow={1}>
      <SplitOutputPane
        session={leftSession}
        lines={leftLines}
        isActive={activePaneIndex === 0}
        paneLabel="P1:"
      />
      <SplitOutputPane
        session={rightSession}
        lines={rightLines}
        isActive={activePaneIndex === 1}
        paneLabel="P2:"
      />
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

function SplitOutputLine({ line }: { line: OutputLine }): React.ReactElement {
  const lineType = classifyLine(line.text, line.isError);
  const timestamp = formatTimestamp(line.timestamp);
  return (
    <Box flexDirection="row">
      <Text color={ARCADE_COLORS.phosphorGray}>{timestamp} </Text>
      {lineType === 'error'       && <Text color={ARCADE_COLORS.laserRed}>{line.text}</Text>}
      {lineType === 'user-prompt' && <Text bold color={ARCADE_COLORS.hotPink}>{line.text}</Text>}
      {lineType === 'tool-call'   && <Text color={ARCADE_COLORS.neonCyan}>{line.text}</Text>}
      {lineType === 'tool-result' && <Text color={ARCADE_COLORS.phosphorGray}>{line.text}</Text>}
      {lineType === 'normal'      && <Text color={ARCADE_COLORS.ghostWhite}>{line.text}</Text>}
    </Box>
  );
}
