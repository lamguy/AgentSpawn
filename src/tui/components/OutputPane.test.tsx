import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { OutputPane } from './OutputPane.js';
import { SessionState } from '../../types.js';
import type { SessionInfo } from '../../types.js';
import type { OutputLine } from '../types.js';

describe('OutputPane', () => {
  it('renders empty state when no session is provided', () => {
    const { lastFrame } = render(
      <OutputPane session={null} outputLines={[]} />,
    );

    expect(lastFrame()).toContain('No session attached');
  });

  it('renders session header with name', () => {
    const mockSession: SessionInfo = {
      name: 'test-session',
      pid: 12345,
      state: SessionState.Running,
      startedAt: new Date(),
      workingDirectory: '/test',
    };

    const { lastFrame } = render(
      <OutputPane session={mockSession} outputLines={[]} />,
    );

    expect(lastFrame()).toContain('> test-session');
  });

  it('shows spinner for running sessions', () => {
    const mockSession: SessionInfo = {
      name: 'test-session',
      pid: 12345,
      state: SessionState.Running,
      startedAt: new Date(),
      workingDirectory: '/test',
    };

    const { lastFrame } = render(
      <OutputPane session={mockSession} outputLines={[]} />,
    );

    expect(lastFrame()).toContain('⏹');
  });

  it('does not show spinner for stopped sessions', () => {
    const mockSession: SessionInfo = {
      name: 'test-session',
      pid: 12345,
      state: SessionState.Stopped,
      startedAt: new Date(),
      workingDirectory: '/test',
    };

    const { lastFrame } = render(
      <OutputPane session={mockSession} outputLines={[]} />,
    );

    expect(lastFrame()).not.toContain('⏹');
  });

  it('renders output lines', () => {
    const mockSession: SessionInfo = {
      name: 'test-session',
      pid: 12345,
      state: SessionState.Running,
      startedAt: new Date(),
      workingDirectory: '/test',
    };

    const mockOutputLines: OutputLine[] = [
      {
        sessionName: 'test-session',
        text: 'Line 1',
        timestamp: new Date(),
        isError: false,
      },
      {
        sessionName: 'test-session',
        text: 'Line 2',
        timestamp: new Date(),
        isError: false,
      },
    ];

    const { lastFrame } = render(
      <OutputPane session={mockSession} outputLines={mockOutputLines} />,
    );

    expect(lastFrame()).toContain('Line 1');
    expect(lastFrame()).toContain('Line 2');
  });

  it('shows "No output yet" when session has no output', () => {
    const mockSession: SessionInfo = {
      name: 'test-session',
      pid: 12345,
      state: SessionState.Running,
      startedAt: new Date(),
      workingDirectory: '/test',
    };

    const { lastFrame } = render(
      <OutputPane session={mockSession} outputLines={[]} />,
    );

    expect(lastFrame()).toContain('No output yet...');
  });

  it('handles tool call formatting', () => {
    const mockSession: SessionInfo = {
      name: 'test-session',
      pid: 12345,
      state: SessionState.Running,
      startedAt: new Date(),
      workingDirectory: '/test',
    };

    const mockOutputLines: OutputLine[] = [
      {
        sessionName: 'test-session',
        text: '⏺ Bash(npm test)',
        timestamp: new Date(),
        isError: false,
      },
      {
        sessionName: 'test-session',
        text: '  ⎿ All tests passed',
        timestamp: new Date(),
        isError: false,
      },
    ];

    const { lastFrame } = render(
      <OutputPane session={mockSession} outputLines={mockOutputLines} />,
    );

    expect(lastFrame()).toContain('⏺ Bash(npm test)');
    expect(lastFrame()).toContain('⎿ All tests passed');
  });

  it('limits visible lines based on maxVisibleLines', () => {
    const mockSession: SessionInfo = {
      name: 'test-session',
      pid: 12345,
      state: SessionState.Running,
      startedAt: new Date(),
      workingDirectory: '/test',
    };

    // Create 100 lines
    const mockOutputLines: OutputLine[] = Array.from({ length: 100 }, (_, i) => ({
      sessionName: 'test-session',
      text: `Line ${i + 1}`,
      timestamp: new Date(),
      isError: false,
    }));

    const { lastFrame } = render(
      <OutputPane
        session={mockSession}
        outputLines={mockOutputLines}
        maxVisibleLines={10}
      />,
    );

    // Should show last 10 lines
    expect(lastFrame()).toContain('Line 100');
    expect(lastFrame()).toContain('Line 91');
    expect(lastFrame()).not.toContain('Line 90');
  });
});
