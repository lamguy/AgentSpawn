import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

/**
 * InputBar component props.
 */
export interface InputBarProps {
  /** Whether the input bar is active and accepting input */
  isActive: boolean;
  /** Callback when the user submits a prompt */
  onSubmit: (text: string) => void;
  /** Whether a prompt is currently being processed */
  isProcessing: boolean;
  /** Session name to display as prefix */
  sessionName?: string;
  /** Pre-filled input text (e.g., from history search). Consumed once. */
  pendingInput?: string | null;
  /** Callback to clear pendingInput after consuming it */
  onPendingInputConsumed?: () => void;
}

/**
 * InputBar - A text input bar for typing prompts to the attached session.
 *
 * Rendered at the bottom of the TUI above the StatusBar when in attached mode.
 * Captures keyboard input via Ink's useInput hook and maintains an internal
 * text buffer. Supports basic editing (backspace, arrows, Ctrl shortcuts)
 * and submission (Enter).
 *
 * Features:
 * - Session name prefix (e.g., "demo > ")
 * - Character count on the right side
 * - Placeholder text when empty
 * - Styled processing indicator with session name
 * - Round border style for visual distinction
 *
 * When isProcessing is true, shows a styled indicator and disables input.
 * Does NOT handle Escape -- that is left to the parent for detach behavior.
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

  // Consume pendingInput when it arrives
  React.useEffect(() => {
    if (pendingInput != null && pendingInput.length > 0) {
      setInputText(pendingInput);
      setCursorPos(pendingInput.length);
      if (onPendingInputConsumed) {
        onPendingInputConsumed();
      }
    }
  }, [pendingInput, onPendingInputConsumed]);

  useInput(
    (input, key) => {
      // Do not handle input when processing or inactive
      if (isProcessing || !isActive) {
        return;
      }

      // Let Escape pass through to parent (for detach)
      if (key.escape) {
        return;
      }

      // Submit on Enter
      if (key.return) {
        const trimmed = inputText.trim();
        if (trimmed.length > 0) {
          onSubmit(trimmed);
          setInputText('');
          setCursorPos(0);
        }
        return;
      }

      // Backspace: delete character before cursor
      if (key.backspace || key.delete) {
        if (cursorPos > 0) {
          setInputText(
            inputText.slice(0, cursorPos - 1) + inputText.slice(cursorPos),
          );
          setCursorPos(cursorPos - 1);
        }
        return;
      }

      // Left arrow: move cursor left
      if (key.leftArrow) {
        if (cursorPos > 0) {
          setCursorPos(cursorPos - 1);
        }
        return;
      }

      // Right arrow: move cursor right
      if (key.rightArrow) {
        if (cursorPos < inputText.length) {
          setCursorPos(cursorPos + 1);
        }
        return;
      }

      // Ctrl+C: clear input
      if (key.ctrl && input === 'c') {
        setInputText('');
        setCursorPos(0);
        return;
      }

      // Ctrl+A: move to beginning
      if (key.ctrl && input === 'a') {
        setCursorPos(0);
        return;
      }

      // Ctrl+E: move to end
      if (key.ctrl && input === 'e') {
        setCursorPos(inputText.length);
        return;
      }

      // Ctrl+U: clear line before cursor
      if (key.ctrl && input === 'u') {
        setInputText(inputText.slice(cursorPos));
        setCursorPos(0);
        return;
      }

      // Ignore other control sequences (tab, arrows handled above, etc.)
      if (key.tab || key.upArrow || key.downArrow) {
        return;
      }

      // Regular character input: insert at cursor position
      if (input && !key.ctrl && !key.meta) {
        setInputText(
          inputText.slice(0, cursorPos) + input + inputText.slice(cursorPos),
        );
        setCursorPos(cursorPos + input.length);
      }
    },
    { isActive },
  );

  // Processing state: show styled indicator
  if (isProcessing) {
    return (
      <Box
        paddingX={1}
        borderStyle="round"
        borderColor="cyan"
        borderTop
        borderBottom={false}
      >
        <Box flexDirection="row" justifyContent="space-between" width="100%">
          <Box flexDirection="row" gap={0}>
            {sessionName && (
              <Text bold color="cyan">
                {sessionName}{' '}
              </Text>
            )}
            <Text color="yellow" bold>
              {'> '}
            </Text>
            <Text color="yellow">Thinking...</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  // Render the input line with a visual cursor
  const beforeCursor = inputText.slice(0, cursorPos);
  const cursorChar = inputText[cursorPos] ?? ' ';
  const afterCursor = inputText.slice(cursorPos + 1);
  const isEmpty = inputText.length === 0;

  return (
    <Box
      paddingX={1}
      borderStyle="round"
      borderColor="cyan"
      borderTop
      borderBottom={false}
    >
      <Box flexDirection="row" justifyContent="space-between" width="100%">
        {/* Left: session name prefix + input */}
        <Box flexDirection="row" gap={0}>
          {sessionName && (
            <Text bold color="cyan">
              {sessionName}{' '}
            </Text>
          )}
          <Text color="cyan" bold>
            {'> '}
          </Text>
          {isEmpty ? (
            <>
              <Text inverse> </Text>
              <Text dimColor>Type a prompt...</Text>
            </>
          ) : (
            <>
              <Text>{beforeCursor}</Text>
              <Text inverse>{cursorChar}</Text>
              <Text>{afterCursor}</Text>
            </>
          )}
        </Box>

        {/* Right: character count */}
        <Text dimColor>{inputText.length}</Text>
      </Box>
    </Box>
  );
}
