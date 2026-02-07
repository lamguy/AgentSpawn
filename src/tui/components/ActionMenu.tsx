import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { ActionMenuItem } from '../types.js';

/**
 * ActionMenu component props.
 */
export interface ActionMenuProps {
  /** Currently highlighted menu item index */
  selectedIndex: number;
  /** The session this menu applies to (null for global actions) */
  targetSessionName: string | null;
  /** Callback when user selects (activates) a menu item */
  onSelect: (item: ActionMenuItem) => void;
  /** Callback when user navigates (positive = down, negative = up) */
  onNavigate: (delta: number) => void;
  /** Callback when user dismisses the menu */
  onDismiss: () => void;
}

/**
 * Default action menu items.
 * Enabled state is determined externally; these are the base definitions.
 */
const MENU_ITEMS: ActionMenuItem[] = [
  {
    id: 'new-session',
    label: 'New Session',
    description: 'Create a new Claude session',
    shortcut: 'n',
    enabled: true,
  },
  {
    id: 'attach',
    label: 'Attach',
    description: 'Attach to selected session',
    shortcut: 'Enter',
    enabled: true,
  },
  {
    id: 'stop-session',
    label: 'Stop Session',
    description: 'Stop the selected session',
    shortcut: 'x',
    enabled: true,
  },
  {
    id: 'restart-session',
    label: 'Restart Session',
    description: 'Restart the selected session',
    shortcut: undefined,
    enabled: true,
  },
  {
    id: 'stop-all',
    label: 'Stop All',
    description: 'Stop all running sessions',
    shortcut: undefined,
    enabled: true,
  },
  {
    id: 'help',
    label: 'Help',
    description: 'Show keyboard shortcuts',
    shortcut: '?',
    enabled: true,
  },
  {
    id: 'quit',
    label: 'Quit',
    description: 'Exit AgentSpawn',
    shortcut: 'q',
    enabled: true,
  },
];

/** IDs of destructive actions that render in red when selected */
const DESTRUCTIVE_IDS = new Set(['stop-session', 'stop-all']);

/**
 * ActionMenu - A round-bordered dropdown command palette.
 *
 * Renders a centered menu with 7 action items. The user navigates with
 * arrow keys (Up/Down) and selects with Enter. Each item shows a label
 * and an optional shortcut hint. Disabled items are rendered dim, and
 * destructive items appear in red when selected.
 *
 * Dismisses on Escape.
 */
export function ActionMenu({
  selectedIndex,
  targetSessionName,
  onSelect,
  onNavigate,
  onDismiss,
}: ActionMenuProps): React.ReactElement {
  useInput((input, key) => {
    if (key.escape) {
      onDismiss();
      return;
    }

    if (key.upArrow) {
      onNavigate(-1);
      return;
    }

    if (key.downArrow) {
      onNavigate(1);
      return;
    }

    if (key.return) {
      const item = MENU_ITEMS[selectedIndex];
      if (item && item.enabled) {
        onSelect(item);
      }
      return;
    }
  });

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      flexGrow={1}
    >
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="blue"
        paddingX={2}
        paddingY={1}
        width={36}
      >
        {/* Title */}
        <Box marginBottom={1}>
          <Text bold>Actions</Text>
        </Box>

        {/* Menu items */}
        {MENU_ITEMS.map((item, index) => {
          const isSelected = index === selectedIndex;
          const isDestructive = DESTRUCTIVE_IDS.has(item.id);
          const isDisabled = !item.enabled;

          // Determine text color
          let color: string | undefined;
          if (isDisabled) {
            color = 'gray';
          } else if (isSelected && isDestructive) {
            color = 'red';
          } else if (isSelected) {
            color = 'cyan';
          } else {
            color = undefined;
          }

          return (
            <Box
              key={item.id}
              flexDirection="row"
              justifyContent="space-between"
            >
              <Box flexDirection="row">
                <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
                  {isSelected ? '> ' : '  '}
                </Text>
                <Text
                  color={color}
                  bold={isSelected}
                  dimColor={isDisabled}
                  inverse={isSelected && !isDisabled}
                >
                  {item.label}
                </Text>
              </Box>
              {item.shortcut && (
                <Text dimColor>{item.shortcut}</Text>
              )}
            </Box>
          );
        })}

        {/* Footer hints */}
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Up/Down to navigate</Text>
          <Text dimColor>Enter to select, Esc close</Text>
        </Box>
      </Box>
    </Box>
  );
}
