import React from 'react';
import { Box, Text, useInput } from 'ink';
import { ARCADE_COLORS } from '../theme/arcade.js';

export interface ConfirmationDialogProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * ConfirmationDialog — arcade WARNING screen for destructive actions.
 */
export function ConfirmationDialog({
  title,
  message,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps): React.ReactElement {
  useInput((input, key) => {
    if (input === 'y' || key.return) { onConfirm(); return; }
    if (input === 'n' || key.escape) { onCancel();  return; }
  });

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
      <Box
        flexDirection="column"
        borderStyle="double"
        borderColor={ARCADE_COLORS.laserRed}
        paddingX={2}
        paddingY={1}
        width={44}
      >
        {/* Warning header */}
        <Box justifyContent="center" marginBottom={1}>
          <Text bold color={ARCADE_COLORS.laserRed}>!! WARNING !!</Text>
        </Box>

        {/* Title */}
        <Box marginBottom={1}>
          <Text bold color={ARCADE_COLORS.ghostWhite}>{title}</Text>
        </Box>

        {/* Message */}
        <Box>
          <Text color={ARCADE_COLORS.scanlineGray}>{message}</Text>
        </Box>

        {/* Confirm / Cancel */}
        <Box justifyContent="center" marginTop={1}>
          <Text bold color={ARCADE_COLORS.neonGreen}>[Y] CONFIRM</Text>
          <Text color={ARCADE_COLORS.phosphorGray}>  </Text>
          <Text bold color={ARCADE_COLORS.laserRed}>[N] ABORT</Text>
        </Box>
      </Box>
    </Box>
  );
}
