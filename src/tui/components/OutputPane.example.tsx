/**
 * OutputPane Usage Example
 *
 * This file demonstrates how to integrate the OutputPane component
 * into the main TUI application.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { OutputPane } from './OutputPane.js';
import type { TUIState } from '../types.js';
import type { OutputCapture } from '../output-capture.js';
import { SessionState } from '../../types.js';

/**
 * Example: Basic usage in the main App component
 */
export function AppWithOutputPane(props: {
  state: TUIState;
  outputCapture: OutputCapture;
}): React.ReactElement {
  const { state, outputCapture } = props;

  // Find the selected session info
  const selectedSession = state.sessions.find(
    (s) => s.name === state.selectedSessionName,
  ) ?? null;

  // Get output lines for the selected session from OutputCapture
  const outputLines = state.selectedSessionName
    ? outputCapture.getLines(state.selectedSessionName)
    : [];

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {/* Header */}
      <Box borderStyle="single" borderBottom={true} paddingX={1}>
        <Box flexGrow={1}>
          <Text bold>AgentSpawn</Text>
        </Box>
        <Text dimColor>[{state.sessions.length} sessions]</Text>
      </Box>

      {/* Main content area */}
      <Box flexGrow={1} flexDirection="row">
        {/* Left sidebar: Session list (future component) */}
        <Box width={20} borderStyle="single" borderRight={true}>
          {/* SessionList component would go here */}
        </Box>

        {/* Right pane: Output display */}
        <Box flexGrow={1} paddingX={1}>
          <OutputPane
            session={selectedSession}
            outputLines={outputLines}
            maxVisibleLines={1000}
            autoScroll={true}
          />
        </Box>
      </Box>

      {/* Footer: keyboard shortcuts */}
      <Box borderStyle="single" borderTop={true} paddingX={1}>
        <Text dimColor>[Tab] switch [Enter] attach [q] quit</Text>
      </Box>
    </Box>
  );
}

/**
 * Example: Standalone OutputPane for testing
 */
export function StandaloneOutputPaneExample(): React.ReactElement {
  const mockSession = {
    name: 'test-session',
    pid: 12345,
    state: SessionState.Running,
    startedAt: new Date(),
    workingDirectory: '/home/user/project',
    promptCount: 3,
  };

  const mockOutputLines = [
    {
      sessionName: 'test-session',
      text: '⏺ Bash(npm test)',
      timestamp: new Date(),
      isError: false,
    },
    {
      sessionName: 'test-session',
      text: '  ⎿ All 42 tests passed',
      timestamp: new Date(),
      isError: false,
    },
    {
      sessionName: 'test-session',
      text: 'Claude: Working on the authentication module...',
      timestamp: new Date(),
      isError: false,
    },
    {
      sessionName: 'test-session',
      text: '⏺ Read(src/auth.ts)',
      timestamp: new Date(),
      isError: false,
    },
    {
      sessionName: 'test-session',
      text: '  ⎿ Read 1 file',
      timestamp: new Date(),
      isError: false,
    },
  ];

  return (
    <Box padding={1}>
      <OutputPane
        session={mockSession}
        outputLines={mockOutputLines}
        maxVisibleLines={100}
        autoScroll={true}
      />
    </Box>
  );
}
