import React from 'react';
import { Box, Text, useInput } from 'ink';

/**
 * ConfirmationDialog component props.
 */
export interface ConfirmationDialogProps {
  /** Title displayed in the dialog header (e.g., "Stop Session") */
  title: string;
  /** Descriptive message explaining what will happen */
  message: string;
  /** Callback when user confirms the action */
  onConfirm: () => void;
  /** Callback when user cancels the action */
  onCancel: () => void;
}

/**
 * ConfirmationDialog - A double-bordered modal for confirming destructive actions.
 *
 * Renders a small centered dialog with a red accent border, a bold title,
 * descriptive message text, and footer instructions for confirming or canceling.
 *
 * - Press `y` or Enter to confirm
 * - Press `n` or Escape to cancel
 */
export function ConfirmationDialog({
  title,
  message,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps): React.ReactElement {
  useInput((input, key) => {
    if (input === 'y' || key.return) {
      onConfirm();
      return;
    }

    if (input === 'n' || key.escape) {
      onCancel();
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
        borderStyle="double"
        borderColor="red"
        paddingX={2}
        paddingY={1}
        width={40}
      >
        {/* Title */}
        <Box marginBottom={1}>
          <Text bold>{title}</Text>
        </Box>

        {/* Message */}
        <Box>
          <Text dimColor>{message}</Text>
        </Box>

        {/* Footer: confirm/cancel hints */}
        <Box justifyContent="center" marginTop={1}>
          <Text>
            <Text bold color="green">[y]</Text>
            <Text> Confirm  </Text>
            <Text bold color="red">[n]</Text>
            <Text> Cancel</Text>
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
