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
  // Example state
  const state: TUIState = {
    sessions: [
      {
        name: 'project-a',
        pid: 12345,
        state: SessionState.Running,
        startedAt: new Date(),
        workingDirectory: '/home/user/project-a',
      },
      {
        name: 'project-b',
        pid: 67890,
        state: SessionState.Running,
        startedAt: new Date(),
        workingDirectory: '/home/user/project-b',
      },
      {
        name: 'project-c',
        pid: 11111,
        state: SessionState.Stopped,
        startedAt: new Date(),
        workingDirectory: '/home/user/project-c',
      },
    ],
    selectedSessionName: 'project-a',
    attachedSessionName: 'project-a',
    outputLines: [],
    isShuttingDown: false,
    mode: 'navigation',
  };

  return (
    <Box flexDirection="column" height="100%">
      {/* Main content area */}
      <Box flexGrow={1} padding={1}>
        {/* Your content here (session list, output pane, etc.) */}
      </Box>

      {/* StatusBar at the bottom */}
      <StatusBar state={state} version="v0.1.0" model="opus" cost="$0.12" />
    </Box>
  );
}

/**
 * Example: StatusBar with minimal info (no details).
 */
export function MinimalStatusBar(): React.ReactElement {
  const state: TUIState = {
    sessions: [],
    selectedSessionName: null,
    attachedSessionName: null,
    outputLines: [],
    isShuttingDown: false,
    mode: 'navigation',
  };

  return <StatusBar state={state} showDetails={false} />;
}

/**
 * Example: StatusBar with all optional props.
 */
export function FullStatusBar(): React.ReactElement {
  const state: TUIState = {
    sessions: [
      {
        name: 'example',
        pid: 12345,
        state: SessionState.Running,
        startedAt: new Date(),
        workingDirectory: '/tmp',
      },
    ],
    selectedSessionName: 'example',
    attachedSessionName: null,
    outputLines: [],
    isShuttingDown: false,
    mode: 'navigation',
  };

  return (
    <StatusBar
      state={state}
      version="v0.1.0"
      model="claude-opus-4-6"
      cost="$1.23"
      showDetails={true}
    />
  );
}
