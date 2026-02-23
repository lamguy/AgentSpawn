import React from 'react';
import { Box, Text, useInput } from 'ink';
import { ARCADE_COLORS, ARCADE_DECOR } from '../theme/arcade.js';

export interface HelpOverlayProps {
  scrollOffset: number;
  onScroll: (delta: number) => void;
  onDismiss: () => void;
}

interface ShortcutEntry {
  key: string;
  description: string;
}

const NAVIGATION_SHORTCUTS: ShortcutEntry[] = [
  { key: 'Up/Down, j/k', description: 'Move selection' },
  { key: 'Tab',          description: 'Next player' },
  { key: 'Shift+Tab',    description: 'Previous player' },
  { key: 'Enter',        description: 'PRESS START (attach)' },
  { key: 'n',            description: 'INSERT COIN (new player)' },
  { key: 'x',            description: 'PULL PLUG (stop player)' },
  { key: ':  or  Ctrl+P',description: 'COMMAND CENTER' },
  { key: 'q',            description: 'POWER OFF' },
  { key: 'Ctrl+C',       description: 'POWER OFF' },
];

const ATTACHED_SHORTCUTS: ShortcutEntry[] = [
  { key: 'Esc',    description: 'PAUSE GAME (detach)' },
  { key: 'Enter',  description: 'Send move' },
  { key: 'Ctrl+C', description: 'Clear input' },
  { key: 'Ctrl+A', description: 'Move to start of line' },
  { key: 'Ctrl+E', description: 'Move to end of line' },
  { key: 'Ctrl+U', description: 'Clear to start of line' },
];

const GLOBAL_SHORTCUTS: ShortcutEntry[] = [
  { key: '?', description: 'Toggle HOW TO PLAY' },
];

const KEY_COLUMN_WIDTH = 20;

/**
 * HelpOverlay — HOW TO PLAY screen with arcade terminology.
 */
export function HelpOverlay({ onScroll, onDismiss }: HelpOverlayProps): React.ReactElement {
  useInput((input, key) => {
    if (key.escape || input === '?') { onDismiss(); return; }
    if (key.upArrow)   { onScroll(-1); return; }
    if (key.downArrow) { onScroll(1);  return; }
  });

  const renderShortcutRow = (entry: ShortcutEntry): React.ReactElement => (
    <Box key={entry.key} flexDirection="row">
      <Box width={KEY_COLUMN_WIDTH}>
        <Text bold color={ARCADE_COLORS.neonCyan}>{entry.key}</Text>
      </Box>
      <Text color={ARCADE_COLORS.ghostWhite}>{entry.description}</Text>
    </Box>
  );

  const renderSectionHeader = (title: string): React.ReactElement => (
    <Box flexDirection="column" key={title} marginTop={1}>
      <Text bold color={ARCADE_COLORS.hotPink}>{title}</Text>
      <Text color={ARCADE_COLORS.phosphorGray}>
        {'─'.repeat(title.length)}
      </Text>
    </Box>
  );

  const allSections = [
    { header: 'SELECT PLAYER MODE', entries: NAVIGATION_SHORTCUTS },
    { header: 'IN GAME MODE',        entries: ATTACHED_SHORTCUTS },
    { header: 'UNIVERSAL',           entries: GLOBAL_SHORTCUTS },
  ];

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
      <Box
        flexDirection="column"
        borderStyle="double"
        borderColor={ARCADE_COLORS.acidYellow}
        paddingX={2}
        paddingY={1}
        width={62}
      >
        {/* Title */}
        <Box justifyContent="center" marginBottom={1}>
          <Text bold color={ARCADE_COLORS.acidYellow}>
            {ARCADE_DECOR.sectionTitle('HOW TO PLAY')}
          </Text>
        </Box>

        <Text color={ARCADE_COLORS.phosphorGray}>{ARCADE_DECOR.scanline}</Text>

        {allSections.map((section, sectionIndex) => (
          <Box key={section.header} flexDirection="column" marginTop={sectionIndex === 0 ? 1 : 0}>
            {renderSectionHeader(section.header)}
            <Box flexDirection="column" marginTop={0}>
              {section.entries.map(renderShortcutRow)}
            </Box>
            {sectionIndex < allSections.length - 1 && (
              <Text color={ARCADE_COLORS.phosphorGray}>{ARCADE_DECOR.scanline}</Text>
            )}
          </Box>
        ))}

        {/* Footer */}
        <Box justifyContent="center" marginTop={1}>
          <Text color={ARCADE_COLORS.acidYellow}>
            .o0O  PRESS [Esc] OR [?] TO CLOSE  O0o.
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
