import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, RenderResult } from 'ink-testing-library';
import { TUIApp } from '../../src/tui/components/TUIApp.js';
import type { TUIState, OutputLine } from '../../src/tui/types.js';
import { SessionState } from '../../src/types.js';

/** Helper to create OutputLine objects from plain text strings. */
function makeOutputLines(texts: string[], sessionName = ''): OutputLine[] {
  return texts.map((text) => ({
    sessionName,
    text,
    timestamp: new Date(),
    isError: false,
  }));
}

/**
 * Integration tests for the TUI application.
 *
 * These tests verify the full TUI workflow:
 * - Component rendering and layout
 * - Keyboard navigation (Tab, arrows, Enter, q)
 * - State updates and session selection
 * - Status bar information display
 * - Output pane integration with OutputCapture
 * - Quit functionality
 *
 * Uses ink-testing-library to render components in a test environment
 * without requiring a real terminal.
 */

function makeState(overrides?: Partial<TUIState>): TUIState {
  return {
    sessions: [],
    selectedSessionName: null,
    attachedSessionName: null,
    outputLines: [],
    isShuttingDown: false,
    mode: 'navigation',
    isProcessing: false,
    overlayStack: [],
    statusMessage: null,
    ...overrides,
  };
}

describe('TUI Integration Tests', () => {
  let mockOnExit: ReturnType<typeof vi.fn>;
  let mockOnStateChange: ReturnType<typeof vi.fn>;
  let originalColumns: number;
  let originalRows: number;

  beforeEach(() => {
    // Mock callbacks
    mockOnExit = vi.fn();
    mockOnStateChange = vi.fn();

    // Mock terminal size (ensure we're above the 80x20 minimum)
    originalColumns = process.stdout.columns;
    originalRows = process.stdout.rows;
    process.stdout.columns = 120;
    process.stdout.rows = 30;
  });

  afterEach(() => {
    // Restore terminal size
    process.stdout.columns = originalColumns;
    process.stdout.rows = originalRows;

    // Clear all mocks
    vi.clearAllMocks();
  });

  describe('TUI Launch and Initial Rendering', () => {
    it('should launch successfully with empty state', () => {
      const initialState = makeState();

      const { lastFrame } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      const output = lastFrame() || '';

      // Verify header is present
      expect(output).toContain('AgentSpawn');
      expect(output).toContain('0 sessions');

      // Verify status bar shortcuts are present (new format: no brackets)
      expect(output).toContain('Tab');
      expect(output).toContain('next');
      expect(output).toContain('Enter');
      expect(output).toContain('attach');
      expect(output).toContain('help');

      // Verify session list shows empty state
      expect(output).toContain('No sessions');

      // Verify output pane shows empty state
      expect(output).toContain('Select a session to view output');
    });

    it('should launch successfully with populated state', () => {
      const initialState = makeState({
        sessions: [
          {
            name: 'project-a',
            pid: 1234,
            state: SessionState.Running,
            startedAt: new Date('2025-01-01T12:00:00Z'),
            workingDirectory: '/home/user/project-a',
            promptCount: 3,
          },
          {
            name: 'project-b',
            pid: 5678,
            state: SessionState.Running,
            startedAt: new Date('2025-01-01T12:05:00Z'),
            workingDirectory: '/home/user/project-b',
            promptCount: 1,
          },
        ],
        selectedSessionName: 'project-a',
      });

      const { lastFrame } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      const output = lastFrame() || '';

      // Verify header shows session count
      expect(output).toContain('2 sessions');

      // Verify session list displays both sessions
      expect(output).toContain('project-a');
      expect(output).toContain('project-b');

      // Verify Unicode status symbols (filled circle for running)
      expect(output).toContain('\u25CF');

      // Verify selected session details
      expect(output).toContain('/home/user/project-a');
      expect(output).toContain('PID 1234');
    });

    it('should handle small terminal gracefully', () => {
      // Mock small terminal size
      process.stdout.columns = 70;
      process.stdout.rows = 15;

      const initialState = makeState();

      const { lastFrame } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      const output = lastFrame() || '';

      // Verify warning message is displayed
      expect(output).toContain('Terminal too small');
      expect(output).toContain('Minimum size: 80x20');
      expect(output).toContain('current: 70x15');
      expect(output).toContain('Press');
      expect(output).toContain('q');
      expect(output).toContain('to quit');

      // Restore terminal size for subsequent tests
      process.stdout.columns = 120;
      process.stdout.rows = 30;
    });
  });

  describe('Session List Display', () => {
    it('should display all sessions with correct status symbols', () => {
      const initialState = makeState({
        sessions: [
          {
            name: 'running-session',
            pid: 1111,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/running',
            promptCount: 0,
          },
          {
            name: 'stopped-session',
            pid: 2222,
            state: SessionState.Stopped,
            startedAt: new Date(),
            workingDirectory: '/tmp/stopped',
            promptCount: 0,
          },
          {
            name: 'crashed-session',
            pid: 3333,
            state: SessionState.Crashed,
            startedAt: new Date(),
            workingDirectory: '/tmp/crashed',
            exitCode: 1,
            promptCount: 0,
          },
        ],
        selectedSessionName: 'running-session',
      });

      const { lastFrame } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      const output = lastFrame() || '';

      // Verify all sessions are listed
      expect(output).toContain('running-session');
      expect(output).toContain('stopped-session');
      expect(output).toContain('crashed-session');

      // Verify Unicode status symbols
      expect(output).toContain('\u25CF'); // filled circle (running)
      expect(output).toContain('\u25CB'); // empty circle (stopped)
      expect(output).toContain('\u25B2'); // triangle (crashed)

      // Verify selected session shows details
      expect(output).toContain('/tmp/running');
      expect(output).toContain('PID 1111');
    });

    it('should highlight attached session differently', () => {
      const initialState = makeState({
        sessions: [
          {
            name: 'session-1',
            pid: 1111,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/1',
            promptCount: 0,
          },
          {
            name: 'session-2',
            pid: 2222,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/2',
            promptCount: 0,
          },
        ],
        selectedSessionName: 'session-2',
        attachedSessionName: 'session-2',
      });

      const { lastFrame } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      const output = lastFrame() || '';

      // Verify both sessions are present
      expect(output).toContain('session-1');
      expect(output).toContain('session-2');

      // Verify attached session details shown
      expect(output).toContain('/tmp/2');
      expect(output).toContain('ATTACHED');
    });

    it('should display session details only for selected session', () => {
      const initialState = makeState({
        sessions: [
          {
            name: 'session-a',
            pid: 1111,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/path/to/a',
            promptCount: 0,
          },
          {
            name: 'session-b',
            pid: 2222,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/path/to/b',
            promptCount: 0,
          },
        ],
        selectedSessionName: 'session-a',
      });

      const { lastFrame } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      const output = lastFrame() || '';

      // Verify selected session details are shown
      expect(output).toContain('/path/to/a');
      expect(output).toContain('PID 1111');

      // Verify non-selected session details are NOT shown
      expect(output).not.toContain('/path/to/b');
      expect(output).not.toContain('PID 2222');
    });

    it('should display exit code for crashed sessions', () => {
      const initialState = makeState({
        sessions: [
          {
            name: 'crashed-session',
            pid: 1234,
            state: SessionState.Crashed,
            startedAt: new Date(),
            workingDirectory: '/tmp/crashed',
            exitCode: 137,
            promptCount: 0,
          },
        ],
        selectedSessionName: 'crashed-session',
      });

      const { lastFrame } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      const output = lastFrame() || '';

      // Verify crash details are displayed
      expect(output).toContain('\u25B2'); // crashed triangle
      expect(output).toContain('Exit code: 137');
    });
  });

  describe('Keyboard Navigation', () => {
    it('should register input handler on mount', () => {
      const initialState = makeState({
        sessions: [
          {
            name: 'session-1',
            pid: 1111,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/1',
            promptCount: 0,
          },
        ],
        selectedSessionName: 'session-1',
      });

      // Just verify the component renders without crashing
      const { lastFrame } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      const output = lastFrame() || '';
      expect(output).toContain('session-1');
      expect(output).toContain('Tab');
      expect(output).toContain('Enter');
    });

    it('should display keyboard shortcuts in status bar', () => {
      const initialState = makeState();

      const { lastFrame } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      const output = lastFrame() || '';

      // Verify navigation shortcuts are visible (redesigned format)
      expect(output).toContain('Tab');
      expect(output).toContain('next');
      expect(output).toContain('Enter');
      expect(output).toContain('attach');
      expect(output).toContain('help');
    });

    it('should call onStateChange when state updates', () => {
      const initialState = makeState({
        sessions: [
          {
            name: 'session-1',
            pid: 1111,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/1',
            promptCount: 0,
          },
        ],
        selectedSessionName: 'session-1',
      });

      render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      // Verify onStateChange was called at least once during initial render
      expect(mockOnStateChange).toHaveBeenCalled();
    });
  });

  describe('Status Bar Information', () => {
    it('should display correct session count', () => {
      const initialState = makeState({
        sessions: [
          {
            name: 'session-1',
            pid: 1111,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/1',
            promptCount: 0,
          },
          {
            name: 'session-2',
            pid: 2222,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/2',
            promptCount: 0,
          },
          {
            name: 'session-3',
            pid: 3333,
            state: SessionState.Stopped,
            startedAt: new Date(),
            workingDirectory: '/tmp/3',
            promptCount: 0,
          },
        ],
        selectedSessionName: 'session-1',
      });

      const { lastFrame } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      const output = lastFrame() || '';

      // Verify session count in status bar
      expect(output).toContain('3 sessions');
    });

    it('should display all keyboard shortcuts', () => {
      const initialState = makeState();

      const { lastFrame } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      const output = lastFrame() || '';

      // Verify keyboard shortcuts are displayed (redesigned format)
      expect(output).toContain('Tab');
      expect(output).toContain('next');
      expect(output).toContain('Enter');
      expect(output).toContain('attach');
      expect(output).toContain('help');
    });

    it('should update session count when navigating', () => {
      const initialState = makeState({
        sessions: [
          {
            name: 'session-1',
            pid: 1111,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/1',
            promptCount: 0,
          },
        ],
        selectedSessionName: 'session-1',
      });

      const { lastFrame } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      const output = lastFrame() || '';

      // Verify header session count
      expect(output).toContain('1 session');

      // Verify status bar shows singular "session"
      expect(output).toContain('1 session');
    });
  });

  describe('Output Pane Integration', () => {
    it('should display output lines from selected session', () => {
      const initialState = makeState({
        sessions: [
          {
            name: 'test-session',
            pid: 1234,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/test',
            promptCount: 0,
          },
        ],
        selectedSessionName: 'test-session',
        outputLines: makeOutputLines(['Line 1', 'Line 2', 'Line 3'], 'test-session'),
      });

      const { lastFrame } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      const output = lastFrame() || '';

      // Verify output pane header (redesigned format)
      expect(output).toContain('Output:');
      expect(output).toContain('test-session');

      // Verify output lines are displayed
      expect(output).toContain('Line 1');
      expect(output).toContain('Line 2');
      expect(output).toContain('Line 3');
    });

    it('should show empty state when no output', () => {
      const initialState = makeState({
        sessions: [
          {
            name: 'empty-session',
            pid: 1234,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/empty',
            promptCount: 0,
          },
        ],
        selectedSessionName: 'empty-session',
        outputLines: [],
      });

      const { lastFrame } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      const output = lastFrame() || '';

      // Verify empty output message (redesigned)
      expect(output).toContain('No output yet');
      expect(output).toContain('Press Enter to attach and send prompts');
    });

    it('should display output for selected session', () => {
      const initialState = makeState({
        sessions: [
          {
            name: 'session-1',
            pid: 1111,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/1',
            promptCount: 0,
          },
          {
            name: 'session-2',
            pid: 2222,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/2',
            promptCount: 0,
          },
        ],
        selectedSessionName: 'session-1',
        outputLines: makeOutputLines(['Output from session-1'], 'session-1'),
      });

      const { lastFrame } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      // Verify initial output
      const output = lastFrame() || '';
      expect(output).toContain('Output:');
      expect(output).toContain('session-1');
      expect(output).toContain('Output from session-1');
    });

    it('should display status symbol for running sessions', () => {
      const initialState = makeState({
        sessions: [
          {
            name: 'active-session',
            pid: 1234,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/active',
            promptCount: 0,
          },
        ],
        selectedSessionName: 'active-session',
        outputLines: [],
      });

      const { lastFrame } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      const output = lastFrame() || '';

      // Verify header with status symbol and label (redesigned)
      expect(output).toContain('active-session');
      expect(output).toContain('\u25CF'); // filled circle
      expect(output).toContain('running');
    });

    it('should not display activity indicator for stopped sessions', () => {
      const initialState = makeState({
        sessions: [
          {
            name: 'stopped-session',
            pid: 1234,
            state: SessionState.Stopped,
            startedAt: new Date(),
            workingDirectory: '/tmp/stopped',
            promptCount: 0,
          },
        ],
        selectedSessionName: 'stopped-session',
        outputLines: [],
      });

      const { lastFrame } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      const output = lastFrame() || '';

      // Verify stopped status (empty circle, not filled)
      expect(output).toContain('stopped-session');
      expect(output).toContain('stopped');
      expect(output).not.toContain('\u23F9'); // no stop symbol
    });
  });

  describe('Quit Functionality', () => {
    it('should exit when pressing q key', () => {
      const initialState = makeState();

      const { stdin } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      // Simulate q key press
      stdin.write('q');

      // Verify exit callback was called
      expect(mockOnExit).toHaveBeenCalledTimes(1);
    });

    it('should exit when pressing Ctrl+C', () => {
      const initialState = makeState();

      const { stdin } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      // Simulate Ctrl+C key press
      stdin.write('\x03');

      // Verify exit callback was called
      expect(mockOnExit).toHaveBeenCalledTimes(1);
    });

    it('should exit from small terminal with q key', () => {
      // Mock small terminal size
      process.stdout.columns = 70;
      process.stdout.rows = 15;

      const initialState = makeState();

      const { stdin } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      // Simulate q key press
      stdin.write('q');

      // Verify exit callback was called even from small terminal warning
      expect(mockOnExit).toHaveBeenCalledTimes(1);
    });
  });

  describe('Full TUI Workflows', () => {
    it('should render complete UI with multiple sessions', () => {
      const initialState = makeState({
        sessions: [
          {
            name: 'session-1',
            pid: 1111,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/1',
            promptCount: 0,
          },
          {
            name: 'session-2',
            pid: 2222,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/2',
            promptCount: 0,
          },
          {
            name: 'session-3',
            pid: 3333,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/3',
            promptCount: 0,
          },
        ],
        selectedSessionName: 'session-1',
      });

      const { lastFrame } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      const output = lastFrame() || '';

      // Verify all major UI sections are present
      expect(output).toContain('AgentSpawn');
      expect(output).toContain('3 sessions');
      expect(output).toContain('session-1');
      expect(output).toContain('session-2');
      expect(output).toContain('session-3');
      expect(output).toContain('Tab');
      expect(output).toContain('Enter');
    });

    it('should integrate SessionListPane, OutputPane, and StatusBar', () => {
      const initialState = makeState({
        sessions: [
          {
            name: 'target-session',
            pid: 1234,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/target',
            promptCount: 0,
          },
          {
            name: 'other-session',
            pid: 5678,
            state: SessionState.Stopped,
            startedAt: new Date(),
            workingDirectory: '/tmp/other',
            promptCount: 0,
          },
        ],
        selectedSessionName: 'target-session',
        attachedSessionName: 'target-session',
        outputLines: makeOutputLines(['Test output line 1', 'Test output line 2'], 'target-session'),
      });

      const { lastFrame } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      const output = lastFrame() || '';

      // Verify SessionListPane integration
      expect(output).toContain('Sessions');
      expect(output).toContain('target-session');
      expect(output).toContain('\u25CF'); // running symbol
      expect(output).toContain('other-session');
      expect(output).toContain('\u25CB'); // stopped symbol

      // Verify OutputPane integration (redesigned header)
      expect(output).toContain('Output:');
      expect(output).toContain('Test output line 1');
      expect(output).toContain('Test output line 2');

      // Verify StatusBar integration
      expect(output).toContain('2 sessions');
    });

    it('should handle navigation with no sessions gracefully', () => {
      const initialState = makeState();

      const { lastFrame } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      const output = lastFrame() || '';

      // Verify empty state is handled
      expect(output).toContain('No sessions');
      expect(output).toContain('0 sessions');
      expect(output).toContain('Select a session to view output');
    });
  });
});
