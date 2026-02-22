import React from 'react';
import { Text } from 'ink';
import { useBlink } from '../hooks/useBlink.js';

interface BlinkTextProps {
  children: string;
  color?: string;
  bold?: boolean;
  intervalMs?: number;
  enabled?: boolean;
}

/**
 * BlinkText — arcade-style blinking text.
 * Renders spaces of equal length when "off" to prevent layout shift.
 */
export function BlinkText({
  children,
  color,
  bold,
  intervalMs = 800,
  enabled = true,
}: BlinkTextProps): React.ReactElement {
  const visible = useBlink(intervalMs, enabled);
  return (
    <Text color={visible ? color : undefined} bold={bold}>
      {visible ? children : ' '.repeat(children.length)}
    </Text>
  );
}
