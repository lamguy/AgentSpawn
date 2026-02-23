import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { ActionMenuItem } from '../types.js';
import { ARCADE_COLORS, ARCADE_MENU_LABELS, ARCADE_DECOR } from '../theme/arcade.js';

export interface ActionMenuProps {
  selectedIndex: number;
  targetSessionName: string | null;
  onSelect: (item: ActionMenuItem) => void;
  onNavigate: (delta: number) => void;
  onDismiss: () => void;
}

const MENU_ITEMS: ActionMenuItem[] = [
  { id: 'new-session',     label: 'New Session',     description: 'Create a new Claude session', shortcut: 'n',     enabled: true },
  { id: 'attach',          label: 'Attach',          description: 'Attach to selected session',  shortcut: 'Enter', enabled: true },
  { id: 'stop-session',    label: 'Stop Session',    description: 'Stop the selected session',   shortcut: 'x',     enabled: true },
  { id: 'restart-session', label: 'Restart Session', description: 'Restart the selected session',shortcut: undefined, enabled: true },
  { id: 'stop-all',        label: 'Stop All',        description: 'Stop all running sessions',   shortcut: undefined, enabled: true },
  { id: 'help',            label: 'Help',            description: 'Show keyboard shortcuts',     shortcut: '?',     enabled: true },
  { id: 'quit',            label: 'Quit',            description: 'Exit AgentSpawn',             shortcut: 'q',     enabled: true },
];

const DESTRUCTIVE_IDS = new Set(['stop-session', 'stop-all']);

/**
 * ActionMenu — COMMAND CENTER with arcade-labeled actions.
 */
export function ActionMenu({ selectedIndex, onSelect, onNavigate, onDismiss }: ActionMenuProps): React.ReactElement {
  useInput((input, key) => {
    if (key.escape)    { onDismiss();  return; }
    if (key.upArrow)   { onNavigate(-1); return; }
    if (key.downArrow) { onNavigate(1);  return; }
    if (key.return) {
      const item = MENU_ITEMS[selectedIndex];
      if (item && item.enabled) onSelect(item);
      return;
    }
  });

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
      <Box
        flexDirection="column"
        borderStyle="double"
        borderColor={ARCADE_COLORS.neonCyan}
        paddingX={2}
        paddingY={1}
        width={38}
      >
        {/* Title */}
        <Box marginBottom={1}>
          <Text bold color={ARCADE_COLORS.neonCyan}>
            {ARCADE_DECOR.sectionTitle('COMMAND CENTER')}
          </Text>
        </Box>

        {MENU_ITEMS.map((item, index) => {
          const isSelected = index === selectedIndex;
          const isDestructive = DESTRUCTIVE_IDS.has(item.id);
          const isDisabled = !item.enabled;
          const arcadeLabel = ARCADE_MENU_LABELS[item.id] ?? item.label;

          let color: string | undefined;
          if (isDisabled) {
            color = ARCADE_COLORS.phosphorGray;
          } else if (isSelected && isDestructive) {
            color = ARCADE_COLORS.laserRed;
          } else if (isSelected) {
            color = ARCADE_COLORS.neonCyan;
          } else {
            color = ARCADE_COLORS.ghostWhite;
          }

          return (
            <Box key={item.id} flexDirection="row" justifyContent="space-between">
              <Box flexDirection="row">
                <Text color={isSelected ? ARCADE_COLORS.neonCyan : undefined} bold={isSelected}>
                  {isSelected ? `${ARCADE_DECOR.cursorSelected} ` : `${ARCADE_DECOR.cursorBlank} `}
                </Text>
                <Text
                  color={color}
                  bold={isSelected}
                  dimColor={isDisabled}
                  inverse={isSelected && !isDisabled}
                >
                  {arcadeLabel}
                </Text>
              </Box>
              {item.shortcut && (
                <Text color={ARCADE_COLORS.phosphorGray}>{item.shortcut}</Text>
              )}
            </Box>
          );
        })}

        {/* Footer */}
        <Box flexDirection="column" marginTop={1}>
          <Text color={ARCADE_COLORS.phosphorGray}>Up/Down navigate</Text>
          <Text color={ARCADE_COLORS.phosphorGray}>Enter select{ARCADE_DECOR.separator}Esc close</Text>
        </Box>
      </Box>
    </Box>
  );
}
