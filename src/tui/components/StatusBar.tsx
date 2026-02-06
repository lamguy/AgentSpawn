import React from 'react';
import { Box, Text } from 'ink';
import type { TUIState } from '../types.js';

/**
 * StatusBar component props.
 */
export interface StatusBarProps {
  /** Current TUI state */
  state: TUIState;
  /** Version string (e.g., "v0.1.0") */
  version?: string;
  /** Model name (e.g., "opus", "sonnet") */
  model?: string;
  /** Cost counter (e.g., "$0.12") */
  cost?: string;
  /** Whether to show detailed info */
  showDetails?: boolean;
}

/**
 * StatusBar component — displays persistent bottom bar with keyboard shortcuts,
 * session count, version, model, and cost information.
 *
 * Matches Claude Code status bar style:
 * - Single line at bottom of screen
 * - Space-separated sections
 * - Keyboard shortcuts in cyan
 * - Session count and metadata
 *
 * Layout:
 * ```
 * [Tab] switch  [Enter] attach  [q] quit  [?] help    3 sessions  model: opus  $0.12
 * ```
 *
 * Design principles:
 * - Semantic colors only (cyan for informational metadata)
 * - Compact — single line, essential info only
 * - Keyboard-first — shortcuts prominently displayed
 * - Progressive disclosure — optional details can be shown/hidden
 */
export function StatusBar({
  state,
  version,
  model,
  cost,
  showDetails = true,
}: StatusBarProps): React.ReactElement {
  const sessionCount = state.sessions.length;
  const runningCount = state.sessions.filter((s) => s.state === 'running').length;
  const isAttached = state.mode === 'attached';

  // Build keyboard shortcut sections based on mode
  const shortcuts = isAttached
    ? [{ key: '[Esc]', action: 'detach  Type your prompt and press Enter' }]
    : [
        { key: '[Tab]', action: 'switch' },
        { key: '[Enter]', action: 'attach' },
        { key: '[q]', action: 'quit' },
        { key: '[?]', action: 'help' },
      ];

  // Build metadata sections (right side)
  const metadata: string[] = [];

  // Session count with running indicator
  if (sessionCount === 0) {
    metadata.push('no sessions');
  } else if (runningCount === sessionCount) {
    metadata.push(`${sessionCount} ${sessionCount === 1 ? 'session' : 'sessions'}`);
  } else {
    metadata.push(
      `${sessionCount} ${sessionCount === 1 ? 'session' : 'sessions'} (${runningCount} running)`,
    );
  }

  // Version
  if (showDetails && version) {
    metadata.push(version);
  }

  // Model indicator
  if (showDetails && model) {
    metadata.push(`model: ${model}`);
  }

  // Cost counter
  if (showDetails && cost) {
    metadata.push(cost);
  }

  return (
    <Box
      flexDirection="row"
      justifyContent="space-between"
      paddingX={1}
      backgroundColor={isAttached ? 'cyan' : undefined}
    >
      {/* Left side: keyboard shortcuts */}
      <Box flexDirection="row" gap={1}>
        {shortcuts.map(({ key, action }, index) => (
          <Box key={action} flexDirection="row" gap={0}>
            {index > 0 && <Text>  </Text>}
            <Text color={isAttached ? 'black' : 'cyan'} bold={isAttached}>
              {key}
            </Text>
            <Text color={isAttached ? 'black' : undefined} bold={isAttached}>
              {' '}
              {action}
            </Text>
          </Box>
        ))}
      </Box>

      {/* Right side: metadata */}
      <Box flexDirection="row" gap={1}>
        {metadata.map((item, index) => (
          <Box key={index} flexDirection="row" gap={0}>
            {index > 0 && <Text>  </Text>}
            <Text color={isAttached ? 'black' : 'cyan'} bold={isAttached}>
              {item}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
