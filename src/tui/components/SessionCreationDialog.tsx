import React from 'react';
import { Box, Text, useInput } from 'ink';
import { ARCADE_COLORS, ARCADE_DECOR, ARCADE_BLINK } from '../theme/arcade.js';
import { BlinkText } from './BlinkText.js';

export interface SessionCreationDialogProps {
  fields: { name: string; template: string; directory: string; permissionMode: string };
  activeField: 'name' | 'template' | 'directory' | 'permissionMode';
  errors: { name: string; template: string; directory: string; permissionMode: string };
  isSubmitting: boolean;
  onFieldChange: (field: 'name' | 'template' | 'directory' | 'permissionMode', value: string) => void;
  onFieldSwitch: (field: 'name' | 'template' | 'directory' | 'permissionMode') => void;
  onSubmit: () => void;
  onDismiss: () => void;
}

/**
 * SessionCreationDialog — INSERT COIN screen for creating new players.
 */
export function SessionCreationDialog({
  fields,
  activeField,
  errors,
  isSubmitting,
  onFieldChange,
  onFieldSwitch,
  onSubmit,
  onDismiss,
}: SessionCreationDialogProps): React.ReactElement {
  useInput(
    (input, key) => {
      if (isSubmitting) return;
      if (key.escape)  { onDismiss(); return; }
      if (key.tab) {
        const fieldOrder: Array<'name' | 'template' | 'directory' | 'permissionMode'> = [
          'name', 'template', 'directory', 'permissionMode',
        ];
        const currentIdx = fieldOrder.indexOf(activeField);
        onFieldSwitch(fieldOrder[(currentIdx + 1) % fieldOrder.length]);
        return;
      }
      if (key.return) { onSubmit(); return; }
      if (key.backspace || key.delete) {
        const v = fields[activeField];
        if (v.length > 0) onFieldChange(activeField, v.slice(0, -1));
        return;
      }
      if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) return;
      if (input && !key.ctrl && !key.meta) {
        onFieldChange(activeField, fields[activeField] + input);
      }
    },
    { isActive: true },
  );

  const renderField = (
    label: string,
    field: 'name' | 'template' | 'directory' | 'permissionMode',
    placeholder: string,
  ): React.ReactElement => {
    const isActive = activeField === field;
    const value = fields[field];
    const error = errors[field];

    return (
      <Box flexDirection="column" key={field}>
        <Text bold color={isActive ? ARCADE_COLORS.neonCyan : ARCADE_COLORS.ghostWhite}>
          {label}:
        </Text>
        <Box
          borderStyle="single"
          borderColor={isActive ? ARCADE_COLORS.neonCyan : ARCADE_COLORS.phosphorGray}
          paddingX={1}
        >
          {value.length > 0 ? (
            <Box flexDirection="row">
              <Text color={ARCADE_COLORS.ghostWhite}>{value}</Text>
              {isActive && <Text inverse>{' '}</Text>}
            </Box>
          ) : (
            <Box flexDirection="row">
              {isActive ? (
                <Text inverse>{' '}</Text>
              ) : (
                <Text color={ARCADE_COLORS.phosphorGray}>{placeholder}</Text>
              )}
            </Box>
          )}
        </Box>
        {error.length > 0 && (
          <Text color={ARCADE_COLORS.laserRed}>{error}</Text>
        )}
      </Box>
    );
  };

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
      <Box
        flexDirection="column"
        borderStyle="double"
        borderColor={ARCADE_COLORS.acidYellow}
        paddingX={2}
        paddingY={1}
        width={44}
      >
        {/* Title */}
        <Box marginBottom={1}>
          <Text bold color={ARCADE_COLORS.acidYellow}>
            {ARCADE_DECOR.sectionTitle('INSERT COIN')}
          </Text>
        </Box>

        {isSubmitting ? (
          <Box>
            <BlinkText color={ARCADE_COLORS.acidYellow} bold intervalMs={ARCADE_BLINK.processing}>
              LOADING PLAYER...
            </BlinkText>
          </Box>
        ) : (
          <Box flexDirection="column">
            {renderField('PLAYER NAME', 'name', 'session-name')}
            <Box marginTop={1}>
              {renderField('TEMPLATE (OPTIONAL)', 'template', 'template-name')}
            </Box>
            <Box marginTop={1}>
              {renderField('ARENA', 'directory', './path/to/project')}
            </Box>
            <Box marginTop={1}>
              {renderField('PERMISSION MODE', 'permissionMode', 'bypassPermissions')}
            </Box>
          </Box>
        )}

        {/* Footer hints */}
        <Box flexDirection="column" marginTop={1}>
          <Text color={ARCADE_COLORS.phosphorGray}>Tab to switch fields</Text>
          <Text color={ARCADE_COLORS.phosphorGray}>Modes: bypassPermissions, acceptEdits, default</Text>
          <Text color={ARCADE_COLORS.phosphorGray}>
            Enter to deploy{ARCADE_DECOR.separator}Esc abort
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
