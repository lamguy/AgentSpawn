/**
 * Example usage of the StatusBar component.
 * This file demonstrates how to integrate the StatusBar into the TUI layout.
 */

import React from 'react';
import { Box } from 'ink';
import { StatusBar } from './StatusBar.js';
import type { TUIState } from '../types.js';
import { SessionState } from '../../types.js';

/**
 * Example TUI layout with StatusBar at the bottom.
 */
export function ExampleLayout(): React.ReactElement {
  const state: TUIState = {
    sessions: [
      {
        name: 'project-a',
        pid: 12345,
        state: SessionState.Running,
        startedAt: new Date(),
        workingDirectory: '/home/user/project-a',
        promptCount: 5,
      },
      {
        name: 'project-b',
        pid: 67890,
        state: SessionState.Running,
        startedAt: new Date(),
        workingDirectory: '/home/user/project-b',
        promptCount: 2,
      },
      {
        name: 'project-c',
        pid: 11111,
        state: SessionState.Stopped,
        startedAt: new Date(),
        workingDirectory: '/home/user/project-c',
        promptCount: 0,
      },
    ],
    selectedSessionName: 'project-a',
    attachedSessionName: 'project-a',
    outputLines: [],
    isShuttingDown: false,
    mode: 'navigation',
    isProcessing: false,
    overlayStack: [],
    statusMessage: null,
  };

  return (
    <Box flexDirection="column" height="100%">
      {/* Main content area */}
      <Box flexGrow={1} padding={1}>
        {/* Your content here (session list, output pane, etc.) */}
      </Box>

      {/* StatusBar at the bottom */}
      <StatusBar state={state} version="v0.1.0" />
    </Box>
  );
}

/**
 * Example: StatusBar with help overlay active.
 */
export function HelpModeStatusBar(): React.ReactElement {
  const state: TUIState = {
    sessions: [],
    selectedSessionName: null,
    attachedSessionName: null,
    outputLines: [],
    isShuttingDown: false,
    mode: 'navigation',
    isProcessing: false,
    overlayStack: [{ kind: 'help', scrollOffset: 0 }],
    statusMessage: null,
  };

  return <StatusBar state={state} />;
}

/**
 * Example: StatusBar with a success status message.
 */
export function StatusMessageBar(): React.ReactElement {
  const state: TUIState = {
    sessions: [
      {
        name: 'example',
        pid: 12345,
        state: SessionState.Running,
        startedAt: new Date(),
        workingDirectory: '/tmp',
        promptCount: 0,
      },
    ],
    selectedSessionName: 'example',
    attachedSessionName: null,
    outputLines: [],
    isShuttingDown: false,
    mode: 'navigation',
    isProcessing: false,
    overlayStack: [],
    statusMessage: {
      text: 'Session "example" started successfully',
      level: 'success',
      expiresAt: Date.now() + 5000,
    },
  };

  return <StatusBar state={state} version="v0.1.0" />;
}
