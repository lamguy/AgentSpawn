import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { ARCADE_COLORS, ARCADE_BLINK } from '../theme/arcade.js';
import { BlinkText } from './BlinkText.js';

export interface InputBarProps {
  isActive: boolean;
  onSubmit: (text: string) => void;
  isProcessing: boolean;
  sessionName?: string;
  pendingInput?: string | null;
  onPendingInputConsumed?: () => void;
}

/**
 * InputBar — IN GAME prompt input with arcade styling.
 *
 * Shows `sessionName >> ` prefix with hot-pink border.
 * Processing state blinks "PROCESSING MOVE...".
 */
export function InputBar({
  isActive,
  onSubmit,
  isProcessing,
  sessionName,
  pendingInput,
  onPendingInputConsumed,
}: InputBarProps): React.ReactElement {
  const [inputText, setInputText] = useState('');
  const [cursorPos, setCursorPos] = useState(0);

  React.useEffect(() => {
    if (pendingInput != null && pendingInput.length > 0) {
      setInputText(pendingInput);
      setCursorPos(pendingInput.length);
      if (onPendingInputConsumed) onPendingInputConsumed();
    }
  }, [pendingInput, onPendingInputConsumed]);

  useInput(
    (input, key) => {
      if (isProcessing || !isActive) return;
      if (key.escape) return;

      if (key.return) {
        const trimmed = inputText.trim();
        if (trimmed.length > 0) {
          onSubmit(trimmed);
          setInputText('');
          setCursorPos(0);
        }
        return;
      }

      if (key.backspace || key.delete) {
        if (cursorPos > 0) {
          setInputText(inputText.slice(0, cursorPos - 1) + inputText.slice(cursorPos));
          setCursorPos(cursorPos - 1);
        }
        return;
      }

      if (key.leftArrow)  { if (cursorPos > 0)             setCursorPos(cursorPos - 1); return; }
      if (key.rightArrow) { if (cursorPos < inputText.length) setCursorPos(cursorPos + 1); return; }

      if (key.ctrl && input === 'c') { setInputText(''); setCursorPos(0); return; }
      if (key.ctrl && input === 'a') { setCursorPos(0); return; }
      if (key.ctrl && input === 'e') { setCursorPos(inputText.length); return; }
      if (key.ctrl && input === 'u') { setInputText(inputText.slice(cursorPos)); setCursorPos(0); return; }

      if (key.tab || key.upArrow || key.downArrow) return;

      if (input && !key.ctrl && !key.meta) {
        setInputText(inputText.slice(0, cursorPos) + input + inputText.slice(cursorPos));
        setCursorPos(cursorPos + input.length);
      }
    },
    { isActive },
  );

  if (isProcessing) {
    return (
      <Box paddingX={1} borderStyle="round" borderColor={ARCADE_COLORS.hotPink} borderTop borderBottom={false}>
        <Box flexDirection="row" justifyContent="space-between" width="100%">
          <Box flexDirection="row" gap={0}>
            {sessionName && (
              <Text bold color={ARCADE_COLORS.hotPink}>{sessionName} </Text>
            )}
            <Text bold color={ARCADE_COLORS.acidYellow}>{'>>'} </Text>
            <BlinkText color={ARCADE_COLORS.acidYellow} bold intervalMs={ARCADE_BLINK.processing}>
              PROCESSING MOVE...
            </BlinkText>
          </Box>
        </Box>
      </Box>
    );
  }

  const beforeCursor = inputText.slice(0, cursorPos);
  const cursorChar = inputText[cursorPos] ?? ' ';
  const afterCursor = inputText.slice(cursorPos + 1);
  const isEmpty = inputText.length === 0;

  return (
    <Box paddingX={1} borderStyle="round" borderColor={ARCADE_COLORS.hotPink} borderTop borderBottom={false}>
      <Box flexDirection="row" justifyContent="space-between" width="100%">
        <Box flexDirection="row" gap={0}>
          {sessionName && (
            <Text bold color={ARCADE_COLORS.hotPink}>{sessionName} </Text>
          )}
          <Text bold color={ARCADE_COLORS.acidYellow}>{'>>'} </Text>
          {isEmpty ? (
            <>
              <Text inverse> </Text>
              <Text color={ARCADE_COLORS.phosphorGray}>Type your move...</Text>
            </>
          ) : (
            <>
              <Text color={ARCADE_COLORS.ghostWhite}>{beforeCursor}</Text>
              <Text inverse>{cursorChar}</Text>
              <Text color={ARCADE_COLORS.ghostWhite}>{afterCursor}</Text>
            </>
          )}
        </Box>
        <Text color={ARCADE_COLORS.phosphorGray}>{inputText.length}</Text>
      </Box>
    </Box>
  );
}
