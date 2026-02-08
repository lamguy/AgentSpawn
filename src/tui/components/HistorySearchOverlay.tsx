import React from 'react';
import { Box, Text } from 'ink';
import type { PromptHistoryEntry } from '../../types.js';

export interface HistorySearchOverlayProps {
  query: string;
  results: (PromptHistoryEntry & { sessionName: string })[];
  selectedIndex: number;
  isLoading: boolean;
}

const MAX_PROMPT_LENGTH = 60;
const VISIBLE_RESULTS = 10;

function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

/**
 * HistorySearchOverlay - A centered modal for searching prompt history.
 *
 * Shows a search input and scrollable results list. Follows existing
 * overlay patterns (double border, centered, keyboard-driven).
 */
export function HistorySearchOverlay({
  query,
  results,
  selectedIndex,
  isLoading,
}: HistorySearchOverlayProps): React.ReactElement {
  const hasResults = results.length > 0;

  // Compute visible window for scrolling
  const scrollStart = Math.max(
    0,
    Math.min(
      selectedIndex - Math.floor(VISIBLE_RESULTS / 2),
      results.length - VISIBLE_RESULTS,
    ),
  );
  const visibleResults = results.slice(scrollStart, scrollStart + VISIBLE_RESULTS);

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      flexGrow={1}
    >
      <Box
        flexDirection="column"
        borderStyle="double"
        borderColor="yellow"
        paddingX={2}
        paddingY={1}
        width={72}
      >
        {/* Title */}
        <Box justifyContent="center" marginBottom={1}>
          <Text bold>History Search (Ctrl+R)</Text>
        </Box>

        {/* Search input */}
        <Box flexDirection="row" marginBottom={1}>
          <Text color="cyan" bold>{'> '}</Text>
          <Text>{query}</Text>
          <Text inverse> </Text>
          {isLoading && <Text color="yellow"> searching...</Text>}
        </Box>

        {/* Results */}
        {!hasResults && query.length === 0 && (
          <Box justifyContent="center" paddingY={1}>
            <Text dimColor>Type to search prompt history</Text>
          </Box>
        )}

        {!hasResults && query.length > 0 && !isLoading && (
          <Box justifyContent="center" paddingY={1}>
            <Text dimColor>No results for &quot;{truncate(query, 30)}&quot;</Text>
          </Box>
        )}

        {hasResults && (
          <Box flexDirection="column">
            <Box marginBottom={0}>
              <Text dimColor>
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
                  <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
                    {isSelected ? '>' : ' '}
                  </Text>
                  <Text
                    color={isSelected ? 'cyan' : undefined}
                    bold={isSelected}
                  >
                    {truncate(entry.prompt, MAX_PROMPT_LENGTH)}
                  </Text>
                  <Text dimColor>
                    {formatRelativeTime(entry.timestamp)}
                  </Text>
                </Box>
              );
            })}
          </Box>
        )}

        {/* Footer */}
        <Box justifyContent="center" marginTop={1}>
          <Text dimColor>
            {'\u2191\u2193'} navigate  Enter select  Esc close
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
