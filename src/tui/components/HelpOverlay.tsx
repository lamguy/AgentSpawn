import React from 'react';
import { Box, Text, useInput } from 'ink';

/**
 * HelpOverlay component props.
 */
export interface HelpOverlayProps {
  /** Current scroll offset for long help text */
  scrollOffset: number;
  /** Callback when user scrolls (positive = down, negative = up) */
  onScroll: (delta: number) => void;
  /** Callback when user dismisses the overlay */
  onDismiss: () => void;
}

interface ShortcutEntry {
  key: string;
  description: string;
}

const NAVIGATION_SHORTCUTS: ShortcutEntry[] = [
  { key: 'Up/Down, j/k', description: 'Move selection' },
  { key: 'Tab', description: 'Next session' },
  { key: 'Shift+Tab', description: 'Previous session' },
  { key: 'Enter', description: 'Attach to session' },
  { key: 'n', description: 'New session' },
  { key: 'x', description: 'Stop selected session' },
  { key: ':  or  Ctrl+P', description: 'Open action menu' },
  { key: 'q', description: 'Quit' },
  { key: 'Ctrl+C', description: 'Quit' },
];

const ATTACHED_SHORTCUTS: ShortcutEntry[] = [
  { key: 'Esc', description: 'Detach from session' },
  { key: 'Enter', description: 'Send prompt' },
  { key: 'Ctrl+C', description: 'Clear input' },
  { key: 'Ctrl+A', description: 'Move to start of line' },
  { key: 'Ctrl+E', description: 'Move to end of line' },
  { key: 'Ctrl+U', description: 'Clear to start of line' },
];

const GLOBAL_SHORTCUTS: ShortcutEntry[] = [
  { key: '?', description: 'Toggle this help' },
];

const KEY_COLUMN_WIDTH = 20;

/**
 * HelpOverlay - A centered modal showing all keyboard shortcuts.
 *
 * Renders a double-bordered overlay with shortcuts grouped by mode:
 * Navigation, Attached Mode, and Global. Supports scrolling with
 * Up/Down arrow keys for small terminals.
 *
 * Dismisses on Escape or ? key press.
 */
export function HelpOverlay(props: HelpOverlayProps): React.ReactElement {
  const { onScroll, onDismiss } = props;
  useInput((input, key) => {
    if (key.escape || input === '?') {
      onDismiss();
      return;
    }

    if (key.upArrow) {
      onScroll(-1);
      return;
    }

    if (key.downArrow) {
      onScroll(1);
      return;
    }
  });

  const renderShortcutRow = (entry: ShortcutEntry): React.ReactElement => (
    <Box key={entry.key} flexDirection="row">
      <Box width={KEY_COLUMN_WIDTH}>
        <Text bold color="cyan">
          {entry.key}
        </Text>
      </Box>
      <Text>{entry.description}</Text>
    </Box>
  );

  const renderSectionHeader = (title: string): React.ReactElement => (
    <Box flexDirection="column" key={title}>
      <Text bold underline>
        {title}
      </Text>
    </Box>
  );

  // Build all rows for potential scrolling
  const allSections = [
    { header: 'NAVIGATION', entries: NAVIGATION_SHORTCUTS },
    { header: 'ATTACHED MODE', entries: ATTACHED_SHORTCUTS },
    { header: 'GLOBAL', entries: GLOBAL_SHORTCUTS },
  ];

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
        width={60}
      >
        {/* Title */}
        <Box justifyContent="center" marginBottom={1}>
          <Text bold>AgentSpawn Keyboard Shortcuts</Text>
        </Box>

        {/* Shortcut groups */}
        {allSections.map((section, sectionIndex) => (
          <Box
            key={section.header}
            flexDirection="column"
            marginTop={sectionIndex > 0 ? 1 : 0}
          >
            {renderSectionHeader(section.header)}
            <Box flexDirection="column" marginTop={0}>
              {section.entries.map(renderShortcutRow)}
            </Box>
          </Box>
        ))}

        {/* Footer hint */}
        <Box justifyContent="center" marginTop={1}>
          <Text dimColor>Press Esc or ? to close</Text>
        </Box>
      </Box>
    </Box>
  );
}
