import React from 'react';
import { Box } from 'ink';
import { SessionListPane } from './SessionListPane.js';
import { SessionState, type SessionInfo } from '../../types.js';

/**
 * Example usage of SessionListPane component.
 * This demonstrates the various features of the session list pane.
 */

// Example 1: Basic usage with a few sessions
const exampleSessions: SessionInfo[] = [
  {
    name: 'project-a',
    pid: 12345,
    state: SessionState.Running,
    startedAt: new Date(Date.now() - 23 * 60 * 1000), // 23 minutes ago
    workingDirectory: '/home/user/projects/project-a',
    promptCount: 5,
  },
  {
    name: 'project-b',
    pid: 12346,
    state: SessionState.Running,
    startedAt: new Date(Date.now() - 90 * 60 * 1000), // 90 minutes ago
    workingDirectory: '/home/user/projects/project-b',
    promptCount: 12,
  },
  {
    name: 'project-c',
    pid: 0,
    state: SessionState.Stopped,
    startedAt: null,
    workingDirectory: '/home/user/projects/project-c',
    promptCount: 0,
  },
];

// Example 1: Basic rendering
function Example1() {
  return (
    <Box flexDirection="column" padding={1}>
      <SessionListPane
        sessions={exampleSessions}
        selectedSessionName="project-a"
        attachedSessionName={null}
      />
    </Box>
  );
}

// Example 2: With attached session
function Example2() {
  return (
    <Box flexDirection="column" padding={1}>
      <SessionListPane
        sessions={exampleSessions}
        selectedSessionName="project-a"
        attachedSessionName="project-a"
      />
    </Box>
  );
}

// Example 3: Empty state
function Example3() {
  return (
    <Box flexDirection="column" padding={1}>
      <SessionListPane sessions={[]} selectedSessionName={null} attachedSessionName={null} />
    </Box>
  );
}

// Example 4: Many sessions with scrolling
function Example4() {
  const manySessions: SessionInfo[] = Array.from({ length: 25 }, (_, i) => ({
    name: `session-${i.toString().padStart(2, '0')}`,
    pid: 10000 + i,
    state: i % 3 === 0 ? SessionState.Stopped : SessionState.Running,
    startedAt: i % 3 === 0 ? null : new Date(Date.now() - i * 5 * 60 * 1000),
    workingDirectory: `/home/user/sessions/session-${i}`,
    promptCount: i,
  }));

  return (
    <Box flexDirection="column" padding={1}>
      <SessionListPane
        sessions={manySessions}
        selectedSessionName="session-15"
        attachedSessionName="session-10"
        maxVisible={10}
      />
    </Box>
  );
}

// Uncomment to run examples
// render(<Example1 />);
// render(<Example2 />);
// render(<Example3 />);
// render(<Example4 />);

export { Example1, Example2, Example3, Example4 };
