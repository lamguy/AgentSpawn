import React from 'react';
import { Box, Text, useInput } from 'ink';

/**
 * SessionCreationDialog component props.
 */
export interface SessionCreationDialogProps {
  /** Current form field values */
  fields: { name: string; directory: string; permissionMode: string };
  /** Which form field is currently focused */
  activeField: 'name' | 'directory' | 'permissionMode';
  /** Validation errors keyed by field name (empty string = no error) */
  errors: { name: string; directory: string; permissionMode: string };
  /** Whether the form submission is in progress */
  isSubmitting: boolean;
  /** Callback when a field value changes */
  onFieldChange: (field: 'name' | 'directory' | 'permissionMode', value: string) => void;
  /** Callback when the active field switches */
  onFieldSwitch: (field: 'name' | 'directory' | 'permissionMode') => void;
  /** Callback when the user submits the form */
  onSubmit: () => void;
  /** Callback when the user dismisses the dialog */
  onDismiss: () => void;
}

/**
 * SessionCreationDialog - A round-bordered modal form for creating new sessions.
 *
 * Renders a centered dialog with two text fields: "Session Name" (required)
 * and "Working Directory" (defaults to "."). The active field is highlighted
 * with a cyan label. Users navigate between fields with Tab, submit with Enter,
 * and cancel with Escape.
 *
 * Text editing follows the same patterns as InputBar: character input at cursor,
 * backspace for deletion, and basic cursor movement with arrow keys.
 *
 * When isSubmitting is true, a "Creating..." indicator is shown and input is
 * disabled.
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
      if (isSubmitting) {
        return;
      }

      // Escape: cancel
      if (key.escape) {
        onDismiss();
        return;
      }

      // Tab: switch fields
      if (key.tab) {
        const nextField =
          activeField === 'name'
            ? 'directory'
            : activeField === 'directory'
              ? 'permissionMode'
              : 'name';
        onFieldSwitch(nextField);
        return;
      }

      // Enter: submit
      if (key.return) {
        onSubmit();
        return;
      }

      // Backspace: delete last character in active field
      if (key.backspace || key.delete) {
        const currentValue = fields[activeField];
        if (currentValue.length > 0) {
          onFieldChange(activeField, currentValue.slice(0, -1));
        }
        return;
      }

      // Ignore arrow keys and control sequences
      if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) {
        return;
      }

      // Regular character input
      if (input && !key.ctrl && !key.meta) {
        const currentValue = fields[activeField];
        onFieldChange(activeField, currentValue + input);
      }
    },
    { isActive: true },
  );

  const renderField = (
    label: string,
    field: 'name' | 'directory' | 'permissionMode',
    placeholder: string,
  ): React.ReactElement => {
    const isActive = activeField === field;
    const value = fields[field];
    const error = errors[field];

    return (
      <Box flexDirection="column" key={field}>
        <Text bold color={isActive ? 'cyan' : 'white'}>
          {label}:
        </Text>
        <Box
          borderStyle="single"
          borderColor={isActive ? 'cyan' : 'gray'}
          paddingX={1}
        >
          {value.length > 0 ? (
            <Box flexDirection="row">
              <Text>{value}</Text>
              {isActive && <Text inverse>{' '}</Text>}
            </Box>
          ) : (
            <Box flexDirection="row">
              {isActive ? (
                <Text inverse>{' '}</Text>
              ) : (
                <Text dimColor>{placeholder}</Text>
              )}
            </Box>
          )}
        </Box>
        {error.length > 0 && (
          <Text color="red">{error}</Text>
        )}
      </Box>
    );
  };

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
        borderColor="cyan"
        paddingX={2}
        paddingY={1}
        width={40}
      >
        {/* Title */}
        <Box marginBottom={1}>
          <Text bold>New Session</Text>
        </Box>

        {isSubmitting ? (
          <Box>
            <Text color="yellow">Creating...</Text>
          </Box>
        ) : (
          <Box flexDirection="column">
            {/* Name field */}
            {renderField('Name', 'name', 'session-name')}

            <Box marginTop={1}>
              {/* Directory field */}
              {renderField('Directory', 'directory', '~/path/to/project')}
            </Box>

            <Box marginTop={1}>
              {/* Permission Mode field */}
              {renderField('Permission Mode', 'permissionMode', 'bypassPermissions')}
            </Box>
          </Box>
        )}

        {/* Footer hints */}
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Tab to switch fields</Text>
          <Text dimColor>Modes: bypassPermissions, acceptEdits, default</Text>
          <Text dimColor>Enter to create, Esc cancel</Text>
        </Box>
      </Box>
    </Box>
  );
}
