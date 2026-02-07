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

    expect(lastFrame()).toContain('Select a session to view output');
    expect(lastFrame()).toContain('or press n to create a new one');
  });

  it('renders session header with name and status', () => {
    const mockSession: SessionInfo = {
      name: 'test-session',
      pid: 12345,
      state: SessionState.Running,
      startedAt: new Date(),
      workingDirectory: '/test',
      promptCount: 0,
    };

    const { lastFrame } = render(
      <OutputPane session={mockSession} outputLines={[]} />,
    );

    expect(lastFrame()).toContain('Output:');
    expect(lastFrame()).toContain('test-session');
    expect(lastFrame()).toContain('running');
  });

  it('shows status symbol for running sessions', () => {
    const mockSession: SessionInfo = {
      name: 'test-session',
      pid: 12345,
      state: SessionState.Running,
      startedAt: new Date(),
      workingDirectory: '/test',
      promptCount: 0,
    };

    const { lastFrame } = render(
      <OutputPane session={mockSession} outputLines={[]} />,
    );

    // Running uses filled circle
    expect(lastFrame()).toContain('\u25CF');
  });

  it('shows stopped status for stopped sessions', () => {
    const mockSession: SessionInfo = {
      name: 'test-session',
      pid: 12345,
      state: SessionState.Stopped,
      startedAt: new Date(),
      workingDirectory: '/test',
      promptCount: 0,
    };

    const { lastFrame } = render(
      <OutputPane session={mockSession} outputLines={[]} />,
    );

    expect(lastFrame()).toContain('stopped');
    // Stopped uses empty circle
    expect(lastFrame()).toContain('\u25CB');
  });

  it('renders output lines with timestamps', () => {
    const mockSession: SessionInfo = {
      name: 'test-session',
      pid: 12345,
      state: SessionState.Running,
      startedAt: new Date(),
      workingDirectory: '/test',
      promptCount: 0,
    };

    const timestamp = new Date(2025, 0, 1, 14, 32);
    const mockOutputLines: OutputLine[] = [
      {
        sessionName: 'test-session',
        text: 'Line 1',
        timestamp,
        isError: false,
      },
      {
        sessionName: 'test-session',
        text: 'Line 2',
        timestamp,
        isError: false,
      },
    ];

    const { lastFrame } = render(
      <OutputPane session={mockSession} outputLines={mockOutputLines} />,
    );

    expect(lastFrame()).toContain('Line 1');
    expect(lastFrame()).toContain('Line 2');
    expect(lastFrame()).toContain('14:32');
  });

  it('shows informative empty state when session has no output', () => {
    const mockSession: SessionInfo = {
      name: 'test-session',
      pid: 12345,
      state: SessionState.Running,
      startedAt: new Date(),
      workingDirectory: '/test',
      promptCount: 0,
    };

    const { lastFrame } = render(
      <OutputPane session={mockSession} outputLines={[]} />,
    );

    expect(lastFrame()).toContain('test-session - No output yet');
    expect(lastFrame()).toContain('Press Enter to attach and send prompts');
  });

  it('renders output lines with content', () => {
    const mockSession: SessionInfo = {
      name: 'test-session',
      pid: 12345,
      state: SessionState.Running,
      startedAt: new Date(),
      workingDirectory: '/test',
      promptCount: 0,
    };

    const mockOutputLines: OutputLine[] = [
      {
        sessionName: 'test-session',
        text: 'Working on the fix...',
        timestamp: new Date(),
        isError: false,
      },
    ];

    const { lastFrame } = render(
      <OutputPane session={mockSession} outputLines={mockOutputLines} />,
    );

    expect(lastFrame()).toContain('Working on the fix...');
  });

  it('shows scroll position indicator', () => {
    const mockSession: SessionInfo = {
      name: 'test-session',
      pid: 12345,
      state: SessionState.Running,
      startedAt: new Date(),
      workingDirectory: '/test',
      promptCount: 0,
    };

    const { lastFrame } = render(
      <OutputPane session={mockSession} outputLines={[]} />,
    );

    // At bottom, should show END
    expect(lastFrame()).toContain('[END]');
  });

  it('limits visible lines based on maxVisibleLines', () => {
    const mockSession: SessionInfo = {
      name: 'test-session',
      pid: 12345,
      state: SessionState.Running,
      startedAt: new Date(),
      workingDirectory: '/test',
      promptCount: 0,
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
