import React from 'react';
import { Box, Text } from 'ink';
import type { PromptHistoryEntry } from '../../types.js';
import { ARCADE_COLORS, ARCADE_DECOR } from '../theme/arcade.js';

export interface HistorySearchOverlayProps {
  query: string;
  results: (PromptHistoryEntry & { sessionName: string })[];
  selectedIndex: number;
  isLoading: boolean;
}

const MAX_PROMPT_LENGTH = 60;
const VISIBLE_RESULTS = 10;

function formatRelativeTime(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function truncate(text: string, maxLen: number): string {
  return text.length <= maxLen ? text : text.slice(0, maxLen - 3) + '...';
}

/**
 * HistorySearchOverlay — REPLAY SEARCH screen.
 */
export function HistorySearchOverlay({
  query,
  results,
  selectedIndex,
  isLoading,
}: HistorySearchOverlayProps): React.ReactElement {
  const hasResults = results.length > 0;

  const scrollStart = Math.max(
    0,
    Math.min(selectedIndex - Math.floor(VISIBLE_RESULTS / 2), results.length - VISIBLE_RESULTS),
  );
  const visibleResults = results.slice(scrollStart, scrollStart + VISIBLE_RESULTS);

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
      <Box
        flexDirection="column"
        borderStyle="double"
        borderColor={ARCADE_COLORS.acidYellow}
        paddingX={2}
        paddingY={1}
        width={72}
      >
        {/* Title */}
        <Box justifyContent="center" marginBottom={1}>
          <Text bold color={ARCADE_COLORS.acidYellow}>
            {ARCADE_DECOR.sectionTitle('REPLAY SEARCH')}
          </Text>
        </Box>

        {/* Search input */}
        <Box flexDirection="row" marginBottom={1}>
          <Text bold color={ARCADE_COLORS.neonCyan}>{'>>'} </Text>
          <Text color={ARCADE_COLORS.ghostWhite}>{query}</Text>
          <Text inverse> </Text>
          {isLoading && <Text color={ARCADE_COLORS.acidYellow}> searching...</Text>}
        </Box>

        {/* Empty / no-results states */}
        {!hasResults && query.length === 0 && (
          <Box justifyContent="center" paddingY={1}>
            <Text color={ARCADE_COLORS.phosphorGray}>TYPE TO SEARCH PAST MOVES</Text>
          </Box>
        )}

        {!hasResults && query.length > 0 && !isLoading && (
          <Box justifyContent="center" paddingY={1}>
            <Text color={ARCADE_COLORS.phosphorGray}>
              NO REPLAYS FOUND FOR &quot;{truncate(query, 30)}&quot;
            </Text>
          </Box>
        )}

        {hasResults && (
          <Box flexDirection="column">
            <Box marginBottom={0}>
              <Text color={ARCADE_COLORS.phosphorGray}>
                {results.length} result{results.length !== 1 ? 's' : ''}
              </Text>
            </Box>
            {visibleResults.map((entry, visIdx) => {
              const actualIdx = scrollStart + visIdx;
              const isSelected = actualIdx === selectedIndex;
              return (
                <Box
                  key={`${entry.sessionName}-${entry.index}`}
                  flexDirection="row"
                  gap={1}
                >
                  <Text bold color={isSelected ? ARCADE_COLORS.neonCyan : undefined}>
                    {isSelected ? ARCADE_DECOR.cursorSelected : '   '}
                  </Text>
                  <Text
                    bold={isSelected}
                    color={isSelected ? ARCADE_COLORS.neonCyan : ARCADE_COLORS.ghostWhite}
                  >
                    {truncate(entry.prompt, MAX_PROMPT_LENGTH)}
                  </Text>
                  <Text color={ARCADE_COLORS.phosphorGray}>
                    {formatRelativeTime(entry.timestamp)}
                  </Text>
                </Box>
              );
            })}
          </Box>
        )}

        {/* Footer */}
        <Box justifyContent="center" marginTop={1}>
          <Text color={ARCADE_COLORS.phosphorGray}>
            {'\u2191\u2193'} navigate{ARCADE_DECOR.separator}Enter select{ARCADE_DECOR.separator}Esc close
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
