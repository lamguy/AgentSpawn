import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { StatusBar } from './StatusBar.js';
import type { TUIState } from '../types.js';
import { SessionState } from '../../types.js';

describe('StatusBar', () => {
  it('should render with no sessions', () => {
    const state: TUIState = {
      sessions: [],
      selectedSessionName: null,
      attachedSessionName: null,
      outputLines: [],
      isShuttingDown: false,
      mode: 'navigation',
    };

    const { lastFrame } = render(<StatusBar state={state} />);
    const output = lastFrame() || '';

    expect(output).toContain('[Tab]');
    expect(output).toContain('[Enter]');
    expect(output).toContain('[q]');
    expect(output).toContain('[?]');
    expect(output).toContain('no sessions');
  });

  it('should display session count', () => {
    const state: TUIState = {
      sessions: [
        {
          name: 'test-1',
          pid: 1234,
          state: SessionState.Running,
          startedAt: new Date(),
          workingDirectory: '/tmp',
        },
        {
          name: 'test-2',
          pid: 5678,
          state: SessionState.Running,
          startedAt: new Date(),
          workingDirectory: '/tmp',
        },
      ],
      selectedSessionName: 'test-1',
      attachedSessionName: null,
      outputLines: [],
      isShuttingDown: false,
      mode: 'navigation',
    };

    const { lastFrame } = render(<StatusBar state={state} />);
    const output = lastFrame() || '';

    expect(output).toContain('2 sessions');
  });

  it('should display running count when different from total', () => {
    const state: TUIState = {
      sessions: [
        {
          name: 'test-1',
          pid: 1234,
          state: SessionState.Running,
          startedAt: new Date(),
          workingDirectory: '/tmp',
        },
        {
          name: 'test-2',
          pid: 5678,
          state: SessionState.Stopped,
          startedAt: new Date(),
          workingDirectory: '/tmp',
        },
      ],
      selectedSessionName: 'test-1',
      attachedSessionName: null,
      outputLines: [],
      isShuttingDown: false,
      mode: 'navigation',
    };

    const { lastFrame } = render(<StatusBar state={state} />);
    const output = lastFrame() || '';

    expect(output).toContain('2 sessions (1 running)');
  });

  it('should display version when provided', () => {
    const state: TUIState = {
      sessions: [],
      selectedSessionName: null,
      attachedSessionName: null,
      outputLines: [],
      isShuttingDown: false,
      mode: 'navigation',
    };

    const { lastFrame } = render(<StatusBar state={state} version="v0.1.0" />);
    const output = lastFrame() || '';

    expect(output).toContain('v0.1.0');
  });

  it('should display model when provided', () => {
    const state: TUIState = {
      sessions: [],
      selectedSessionName: null,
      attachedSessionName: null,
      outputLines: [],
      isShuttingDown: false,
      mode: 'navigation',
    };

    const { lastFrame } = render(<StatusBar state={state} model="opus" />);
    const output = lastFrame() || '';

    expect(output).toContain('model: opus');
  });

  it('should display cost when provided', () => {
    const state: TUIState = {
      sessions: [],
      selectedSessionName: null,
      attachedSessionName: null,
      outputLines: [],
      isShuttingDown: false,
      mode: 'navigation',
    };

    const { lastFrame } = render(<StatusBar state={state} cost="$0.12" />);
    const output = lastFrame() || '';

    expect(output).toContain('$0.12');
  });

  it('should hide details when showDetails is false', () => {
    const state: TUIState = {
      sessions: [],
      selectedSessionName: null,
      attachedSessionName: null,
      outputLines: [],
      isShuttingDown: false,
      mode: 'navigation',
    };

    const { lastFrame } = render(
      <StatusBar state={state} version="v0.1.0" model="opus" cost="$0.12" showDetails={false} />,
    );
    const output = lastFrame() || '';

    expect(output).not.toContain('v0.1.0');
    expect(output).not.toContain('model: opus');
    expect(output).not.toContain('$0.12');
  });

  it('should display all keyboard shortcuts', () => {
    const state: TUIState = {
      sessions: [],
      selectedSessionName: null,
      attachedSessionName: null,
      outputLines: [],
      isShuttingDown: false,
      mode: 'navigation',
    };

    const { lastFrame } = render(<StatusBar state={state} />);
    const output = lastFrame() || '';

    expect(output).toContain('switch');
    expect(output).toContain('attach');
    expect(output).toContain('quit');
    expect(output).toContain('help');
  });
});
