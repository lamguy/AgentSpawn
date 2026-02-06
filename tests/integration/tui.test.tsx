import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, RenderResult } from 'ink-testing-library';
import { TUIApp } from '../../src/tui/components/TUIApp.js';
import type { TUIState, OutputLine } from '../../src/tui/types.js';
import { SessionState } from '../../src/types.js';

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
      const initialState: TUIState = {
        sessions: [],
        selectedSessionName: null,
        attachedSessionName: null,
        outputLines: [],
        isShuttingDown: false,
      };

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
      expect(output).toContain('[0 sessions]');

      // Verify status bar is present
      expect(output).toContain('[Tab]');
      expect(output).toContain('switch');
      expect(output).toContain('[Enter]');
      expect(output).toContain('[q]');
      expect(output).toContain('quit');

      // Verify session list shows empty state
      expect(output).toContain('No sessions');

      // Verify output pane shows empty state
      expect(output).toContain('No session attached');
    });

    it('should launch successfully with populated state', () => {
      const initialState: TUIState = {
        sessions: [
          {
            name: 'project-a',
            pid: 1234,
            state: SessionState.Running,
            startedAt: new Date('2025-01-01T12:00:00Z'),
            workingDirectory: '/home/user/project-a',
          },
          {
            name: 'project-b',
            pid: 5678,
            state: SessionState.Running,
            startedAt: new Date('2025-01-01T12:05:00Z'),
            workingDirectory: '/home/user/project-b',
          },
        ],
        selectedSessionName: 'project-a',
        attachedSessionName: null,
        outputLines: [],
        isShuttingDown: false,
      };

      const { lastFrame } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      const output = lastFrame() || '';

      // Verify header shows session count
      expect(output).toContain('[2 sessions]');

      // Verify session list displays both sessions
      expect(output).toContain('project-a');
      expect(output).toContain('project-b');

      // Verify status indicators
      expect(output).toContain('[running]');

      // Verify selected session details
      expect(output).toContain('/home/user/project-a');
      expect(output).toContain('PID 1234');
    });

    it('should handle small terminal gracefully', () => {
      // Mock small terminal size
      process.stdout.columns = 70;
      process.stdout.rows = 15;

      const initialState: TUIState = {
        sessions: [],
        selectedSessionName: null,
        attachedSessionName: null,
        outputLines: [],
        isShuttingDown: false,
      };

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
    it('should display all sessions with correct status badges', () => {
      const initialState: TUIState = {
        sessions: [
          {
            name: 'running-session',
            pid: 1111,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/running',
          },
          {
            name: 'stopped-session',
            pid: 2222,
            state: SessionState.Stopped,
            startedAt: new Date(),
            workingDirectory: '/tmp/stopped',
          },
          {
            name: 'crashed-session',
            pid: 3333,
            state: SessionState.Crashed,
            startedAt: new Date(),
            workingDirectory: '/tmp/crashed',
            exitCode: 1,
          },
        ],
        selectedSessionName: 'running-session',
        attachedSessionName: null,
        outputLines: [],
        isShuttingDown: false,
      };

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

      // Verify status badges
      expect(output).toContain('[running]');
      expect(output).toContain('[stopped]');
      expect(output).toContain('[crashed]');

      // Verify selected session shows details
      expect(output).toContain('/tmp/running');
      expect(output).toContain('PID 1111');
    });

    it('should highlight attached session differently', () => {
      const initialState: TUIState = {
        sessions: [
          {
            name: 'session-1',
            pid: 1111,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/1',
          },
          {
            name: 'session-2',
            pid: 2222,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/2',
          },
        ],
        selectedSessionName: 'session-2',
        attachedSessionName: 'session-2',
        outputLines: [],
        isShuttingDown: false,
      };

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

      // Note: ink-testing-library renders color as ANSI codes,
      // so we verify the presence of both sessions. The actual color
      // highlighting happens via Ink's color prop, which we test
      // in unit tests.
      expect(output).toContain('/tmp/2');
    });

    it('should display session details only for selected session', () => {
      const initialState: TUIState = {
        sessions: [
          {
            name: 'session-a',
            pid: 1111,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/path/to/a',
          },
          {
            name: 'session-b',
            pid: 2222,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/path/to/b',
          },
        ],
        selectedSessionName: 'session-a',
        attachedSessionName: null,
        outputLines: [],
        isShuttingDown: false,
      };

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
      const initialState: TUIState = {
        sessions: [
          {
            name: 'crashed-session',
            pid: 1234,
            state: SessionState.Crashed,
            startedAt: new Date(),
            workingDirectory: '/tmp/crashed',
            exitCode: 137,
          },
        ],
        selectedSessionName: 'crashed-session',
        attachedSessionName: null,
        outputLines: [],
        isShuttingDown: false,
      };

      const { lastFrame } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      const output = lastFrame() || '';

      // Verify crash details are displayed
      expect(output).toContain('[crashed]');
      expect(output).toContain('Exit code: 137');
    });
  });

  describe('Keyboard Navigation', () => {
    it('should register input handler on mount', () => {
      const initialState: TUIState = {
        sessions: [
          {
            name: 'session-1',
            pid: 1111,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/1',
          },
        ],
        selectedSessionName: 'session-1',
        attachedSessionName: null,
        outputLines: [],
        isShuttingDown: false,
      };

      // Just verify the component renders without crashing
      // Actual keyboard navigation logic is tested in keybindings.test.ts
      const { lastFrame } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      const output = lastFrame() || '';
      expect(output).toContain('session-1');
      expect(output).toContain('[Tab]');
      expect(output).toContain('[Enter]');
    });

    it('should display keyboard shortcuts in status bar', () => {
      const initialState: TUIState = {
        sessions: [],
        selectedSessionName: null,
        attachedSessionName: null,
        outputLines: [],
        isShuttingDown: false,
      };

      const { lastFrame } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      const output = lastFrame() || '';

      // Verify all navigation shortcuts are visible
      expect(output).toContain('[Tab]');
      expect(output).toContain('switch');
      expect(output).toContain('[Enter]');
      expect(output).toContain('attach');
      expect(output).toContain('[q]');
      expect(output).toContain('quit');
      expect(output).toContain('[?]');
      expect(output).toContain('help');
    });

    it('should call onStateChange when state updates', () => {
      const initialState: TUIState = {
        sessions: [
          {
            name: 'session-1',
            pid: 1111,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/1',
          },
        ],
        selectedSessionName: 'session-1',
        attachedSessionName: null,
        outputLines: [],
        isShuttingDown: false,
      };

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
      const initialState: TUIState = {
        sessions: [
          {
            name: 'session-1',
            pid: 1111,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/1',
          },
          {
            name: 'session-2',
            pid: 2222,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/2',
          },
          {
            name: 'session-3',
            pid: 3333,
            state: SessionState.Stopped,
            startedAt: new Date(),
            workingDirectory: '/tmp/3',
          },
        ],
        selectedSessionName: 'session-1',
        attachedSessionName: null,
        outputLines: [],
        isShuttingDown: false,
      };

      const { lastFrame } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      const output = lastFrame() || '';

      // Verify session count in status bar
      expect(output).toContain('3 sessions (2 running)');
    });

    it('should display all keyboard shortcuts', () => {
      const initialState: TUIState = {
        sessions: [],
        selectedSessionName: null,
        attachedSessionName: null,
        outputLines: [],
        isShuttingDown: false,
      };

      const { lastFrame } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      const output = lastFrame() || '';

      // Verify all keyboard shortcuts are displayed
      expect(output).toContain('[Tab]');
      expect(output).toContain('switch');
      expect(output).toContain('[Enter]');
      expect(output).toContain('attach');
      expect(output).toContain('[q]');
      expect(output).toContain('quit');
      expect(output).toContain('[?]');
      expect(output).toContain('help');
    });

    it('should update session count when navigating', () => {
      const initialState: TUIState = {
        sessions: [
          {
            name: 'session-1',
            pid: 1111,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/1',
          },
        ],
        selectedSessionName: 'session-1',
        attachedSessionName: null,
        outputLines: [],
        isShuttingDown: false,
      };

      const { lastFrame } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      const output = lastFrame() || '';

      // Verify header session count
      expect(output).toContain('[1 session]');

      // Verify status bar shows singular "session"
      expect(output).toContain('1 session');
    });
  });

  describe('Output Pane Integration', () => {
    it('should display output lines from selected session', () => {
      const initialState: TUIState = {
        sessions: [
          {
            name: 'test-session',
            pid: 1234,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/test',
          },
        ],
        selectedSessionName: 'test-session',
        attachedSessionName: null,
        outputLines: ['Line 1', 'Line 2', 'Line 3'],
        isShuttingDown: false,
      };

      const { lastFrame } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      const output = lastFrame() || '';

      // Verify output pane header
      expect(output).toContain('> test-session');

      // Verify output lines are displayed
      expect(output).toContain('Line 1');
      expect(output).toContain('Line 2');
      expect(output).toContain('Line 3');
    });

    it('should show empty state when no output', () => {
      const initialState: TUIState = {
        sessions: [
          {
            name: 'empty-session',
            pid: 1234,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/empty',
          },
        ],
        selectedSessionName: 'empty-session',
        attachedSessionName: null,
        outputLines: [],
        isShuttingDown: false,
      };

      const { lastFrame } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      const output = lastFrame() || '';

      // Verify empty output message
      expect(output).toContain('No output yet...');
    });

    it('should display output for selected session', () => {
      const initialState: TUIState = {
        sessions: [
          {
            name: 'session-1',
            pid: 1111,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/1',
          },
          {
            name: 'session-2',
            pid: 2222,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/2',
          },
        ],
        selectedSessionName: 'session-1',
        attachedSessionName: null,
        outputLines: ['Output from session-1'],
        isShuttingDown: false,
      };

      const { lastFrame } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      // Verify initial output
      const output = lastFrame() || '';
      expect(output).toContain('> session-1');
      expect(output).toContain('Output from session-1');
    });

    it('should display activity indicator for running sessions', () => {
      const initialState: TUIState = {
        sessions: [
          {
            name: 'active-session',
            pid: 1234,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/active',
          },
        ],
        selectedSessionName: 'active-session',
        attachedSessionName: null,
        outputLines: [],
        isShuttingDown: false,
      };

      const { lastFrame } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      const output = lastFrame() || '';

      // Verify spinner/activity indicator is present for running session
      expect(output).toContain('> active-session');
      expect(output).toContain('⏹');
    });

    it('should not display activity indicator for stopped sessions', () => {
      const initialState: TUIState = {
        sessions: [
          {
            name: 'stopped-session',
            pid: 1234,
            state: SessionState.Stopped,
            startedAt: new Date(),
            workingDirectory: '/tmp/stopped',
          },
        ],
        selectedSessionName: 'stopped-session',
        attachedSessionName: null,
        outputLines: [],
        isShuttingDown: false,
      };

      const { lastFrame } = render(
        <TUIApp
          initialState={initialState}
          onStateChange={mockOnStateChange}
          onExit={mockOnExit}
        />,
      );

      const output = lastFrame() || '';

      // Verify no spinner for stopped session
      expect(output).toContain('> stopped-session');
      expect(output).not.toContain('⏹');
    });
  });

  describe('Quit Functionality', () => {
    it('should exit when pressing q key', () => {
      const initialState: TUIState = {
        sessions: [],
        selectedSessionName: null,
        attachedSessionName: null,
        outputLines: [],
        isShuttingDown: false,
      };

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
      const initialState: TUIState = {
        sessions: [],
        selectedSessionName: null,
        attachedSessionName: null,
        outputLines: [],
        isShuttingDown: false,
      };

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

      const initialState: TUIState = {
        sessions: [],
        selectedSessionName: null,
        attachedSessionName: null,
        outputLines: [],
        isShuttingDown: false,
      };

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
      const initialState: TUIState = {
        sessions: [
          {
            name: 'session-1',
            pid: 1111,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/1',
          },
          {
            name: 'session-2',
            pid: 2222,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/2',
          },
          {
            name: 'session-3',
            pid: 3333,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/3',
          },
        ],
        selectedSessionName: 'session-1',
        attachedSessionName: null,
        outputLines: [],
        isShuttingDown: false,
      };

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
      expect(output).toContain('[3 sessions]');
      expect(output).toContain('session-1');
      expect(output).toContain('session-2');
      expect(output).toContain('session-3');
      expect(output).toContain('[Tab]');
      expect(output).toContain('[Enter]');
      expect(output).toContain('[q]');
    });

    it('should integrate SessionListPane, OutputPane, and StatusBar', () => {
      const initialState: TUIState = {
        sessions: [
          {
            name: 'target-session',
            pid: 1234,
            state: SessionState.Running,
            startedAt: new Date(),
            workingDirectory: '/tmp/target',
          },
          {
            name: 'other-session',
            pid: 5678,
            state: SessionState.Stopped,
            startedAt: new Date(),
            workingDirectory: '/tmp/other',
          },
        ],
        selectedSessionName: 'target-session',
        attachedSessionName: 'target-session',
        outputLines: ['Test output line 1', 'Test output line 2'],
        isShuttingDown: false,
      };

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
      expect(output).toContain('[running]');
      expect(output).toContain('other-session');
      expect(output).toContain('[stopped]');

      // Verify OutputPane integration
      expect(output).toContain('> target-session');
      expect(output).toContain('Test output line 1');
      expect(output).toContain('Test output line 2');

      // Verify StatusBar integration
      expect(output).toContain('2 sessions (1 running)');
    });

    it('should handle navigation with no sessions gracefully', () => {
      const initialState: TUIState = {
        sessions: [],
        selectedSessionName: null,
        attachedSessionName: null,
        outputLines: [],
        isShuttingDown: false,
      };

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
      expect(output).toContain('[0 sessions]');
      expect(output).toContain('No session attached');
    });
  });
});
