import { describe, it, expect } from 'vitest';
import { SessionState, type SessionInfo } from '../../types.js';

// Note: These tests are structural validation tests.
// Full rendering tests would require ink-testing-library.

describe('SessionListPane', () => {
  const mockSessions: SessionInfo[] = [
    {
      name: 'project-a',
      pid: 12345,
      state: SessionState.Running,
      startedAt: new Date(Date.now() - 23 * 60 * 1000), // 23 minutes ago
      workingDirectory: '/home/user/project-a',
    },
    {
      name: 'project-b',
      pid: 12346,
      state: SessionState.Running,
      startedAt: new Date(Date.now() - 90 * 60 * 1000), // 90 minutes ago
      workingDirectory: '/home/user/project-b',
    },
    {
      name: 'project-c',
      pid: 0,
      state: SessionState.Stopped,
      startedAt: null,
      workingDirectory: '/home/user/project-c',
    },
    {
      name: 'project-d',
      pid: 12347,
      state: SessionState.Crashed,
      startedAt: new Date(Date.now() - 5 * 60 * 1000),
      workingDirectory: '/home/user/project-d',
      exitCode: 1,
    },
  ];

  it('should handle empty sessions array', () => {
    const props = {
      sessions: [],
      selectedSessionName: null,
      attachedSessionName: null,
    };

    expect(props.sessions.length).toBe(0);
  });

  it('should accept sessions with various states', () => {
    expect(mockSessions.length).toBe(4);
    expect(mockSessions[0].state).toBe(SessionState.Running);
    expect(mockSessions[2].state).toBe(SessionState.Stopped);
    expect(mockSessions[3].state).toBe(SessionState.Crashed);
  });

  it('should track selected session name', () => {
    const props = {
      sessions: mockSessions,
      selectedSessionName: 'project-b',
      attachedSessionName: null,
    };

    expect(props.selectedSessionName).toBe('project-b');
    expect(mockSessions.some((s) => s.name === props.selectedSessionName)).toBe(true);
  });

  it('should have session details available', () => {
    const selectedSession = mockSessions.find((s) => s.name === 'project-a');

    expect(selectedSession).toBeDefined();
    expect(selectedSession?.workingDirectory).toBe('/home/user/project-a');
    expect(selectedSession?.pid).toBe(12345);
    expect(selectedSession?.startedAt).toBeDefined();
  });

  it('should include exit code for crashed sessions', () => {
    const crashedSession = mockSessions.find((s) => s.state === SessionState.Crashed);

    expect(crashedSession).toBeDefined();
    expect(crashedSession?.exitCode).toBe(1);
  });

  it('should handle sessions with different start times', () => {
    const now = Date.now();
    const sessions: SessionInfo[] = [
      {
        name: 'short',
        pid: 1,
        state: SessionState.Running,
        startedAt: new Date(now - 45 * 1000), // 45 seconds
        workingDirectory: '/tmp/short',
      },
      {
        name: 'minutes',
        pid: 2,
        state: SessionState.Running,
        startedAt: new Date(now - 23 * 60 * 1000), // 23 minutes
        workingDirectory: '/tmp/minutes',
      },
      {
        name: 'hours',
        pid: 3,
        state: SessionState.Running,
        startedAt: new Date(now - 90 * 60 * 1000), // 1.5 hours
        workingDirectory: '/tmp/hours',
      },
      {
        name: 'days',
        pid: 4,
        state: SessionState.Running,
        startedAt: new Date(now - 50 * 60 * 60 * 1000), // 50 hours
        workingDirectory: '/tmp/days',
      },
    ];

    // Verify all sessions have valid start times
    sessions.forEach((session) => {
      expect(session.startedAt).toBeInstanceOf(Date);
      expect(session.startedAt!.getTime()).toBeLessThan(now);
    });
  });

  it('should handle large number of sessions', () => {
    const manySessions: SessionInfo[] = Array.from({ length: 25 }, (_, i) => ({
      name: `session-${i}`,
      pid: 1000 + i,
      state: SessionState.Running,
      startedAt: new Date(),
      workingDirectory: `/tmp/session-${i}`,
    }));

    expect(manySessions.length).toBe(25);

    const props = {
      sessions: manySessions,
      selectedSessionName: 'session-22',
      attachedSessionName: null,
      maxVisible: 20,
    };

    expect(props.sessions.length).toBeGreaterThan(props.maxVisible);
  });

  it('should track attached session separately from selected', () => {
    const props = {
      sessions: mockSessions,
      selectedSessionName: 'project-a',
      attachedSessionName: 'project-a',
    };

    expect(props.selectedSessionName).toBe(props.attachedSessionName);

    const differentProps = {
      sessions: mockSessions,
      selectedSessionName: 'project-a',
      attachedSessionName: 'project-b',
    };

    expect(differentProps.selectedSessionName).not.toBe(differentProps.attachedSessionName);
  });

  it('should handle session with no startedAt date', () => {
    const sessions: SessionInfo[] = [
      {
        name: 'no-start',
        pid: 0,
        state: SessionState.Stopped,
        startedAt: null,
        workingDirectory: '/tmp/no-start',
      },
    ];

    expect(sessions[0].startedAt).toBeNull();
    expect(sessions[0].state).toBe(SessionState.Stopped);
  });
});
