import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { StatusBar } from './StatusBar.js';
import type { TUIState } from '../types.js';
import { SessionState } from '../../types.js';

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

describe('StatusBar', () => {
  it('should render NAV badge in navigation mode', () => {
    const state = makeState();
    const { lastFrame } = render(<StatusBar state={state} />);
    const output = lastFrame() || '';
    expect(output).toContain('NAV');
  });

  it('should render ATTACHED badge in attached mode', () => {
    const state = makeState({ mode: 'attached', attachedSessionName: 'demo' });
    const { lastFrame } = render(<StatusBar state={state} />);
    const output = lastFrame() || '';
    expect(output).toContain('ATTACHED');
  });

  it('should render HELP badge when help overlay is active', () => {
    const state = makeState({
      overlayStack: [{ kind: 'help', scrollOffset: 0 }],
    });
    const { lastFrame } = render(<StatusBar state={state} />);
    const output = lastFrame() || '';
    expect(output).toContain('HELP');
  });

  it('should render MENU badge when action menu overlay is active', () => {
    const state = makeState({
      overlayStack: [{ kind: 'action-menu', selectedIndex: 0, targetSessionName: null }],
    });
    const { lastFrame } = render(<StatusBar state={state} />);
    const output = lastFrame() || '';
    expect(output).toContain('MENU');
  });

  it('should render NEW SESSION badge when session creation overlay is active', () => {
    const state = makeState({
      overlayStack: [{
        kind: 'session-creation',
        fields: { name: '', template: '', directory: '.', permissionMode: 'acceptEdits' },
        activeField: 'name',
        errors: { name: '', template: '', directory: '', permissionMode: '' },
        isSubmitting: false,
      }],
    });
    const { lastFrame } = render(<StatusBar state={state} />);
    const output = lastFrame() || '';
    expect(output).toContain('NEW SESSION');
  });

  it('should render CONFIRM badge when confirmation overlay is active', () => {
    const state = makeState({
      overlayStack: [{
        kind: 'confirmation',
        title: 'Stop?',
        message: 'Are you sure?',
        action: { kind: 'stop-session', sessionName: 'test' },
      }],
    });
    const { lastFrame } = render(<StatusBar state={state} />);
    const output = lastFrame() || '';
    expect(output).toContain('CONFIRM');
  });

  it('should render with no sessions', () => {
    const state = makeState();
    const { lastFrame } = render(<StatusBar state={state} />);
    const output = lastFrame() || '';
    expect(output).toContain('no sessions');
  });

  it('should display session count', () => {
    const state = makeState({
      sessions: [
        {
          name: 'test-1',
          pid: 1234,
          state: SessionState.Running,
          startedAt: new Date(),
          workingDirectory: '/tmp',
          promptCount: 0,
        },
        {
          name: 'test-2',
          pid: 5678,
          state: SessionState.Running,
          startedAt: new Date(),
          workingDirectory: '/tmp',
          promptCount: 0,
        },
      ],
      selectedSessionName: 'test-1',
    });

    const { lastFrame } = render(<StatusBar state={state} />);
    const output = lastFrame() || '';
    expect(output).toContain('2 sessions');
  });

  it('should display version when provided', () => {
    const state = makeState();
    const { lastFrame } = render(<StatusBar state={state} version="v0.1.0" />);
    const output = lastFrame() || '';
    expect(output).toContain('v0.1.0');
  });

  it('should display navigation shortcuts in navigation mode', () => {
    const state = makeState();
    const { lastFrame } = render(<StatusBar state={state} />);
    const output = lastFrame() || '';
    expect(output).toContain('Tab');
    expect(output).toContain('Enter');
    expect(output).toContain('next');
    expect(output).toContain('attach');
    expect(output).toContain('help');
  });

  it('should display attached shortcuts in attached mode', () => {
    const state = makeState({ mode: 'attached', attachedSessionName: 'demo' });
    const { lastFrame } = render(<StatusBar state={state} />);
    const output = lastFrame() || '';
    expect(output).toContain('Esc');
    expect(output).toContain('detach');
  });

  it('should display help overlay shortcuts when help is active', () => {
    const state = makeState({
      overlayStack: [{ kind: 'help', scrollOffset: 0 }],
    });
    const { lastFrame } = render(<StatusBar state={state} />);
    const output = lastFrame() || '';
    expect(output).toContain('Esc');
    expect(output).toContain('close');
  });

  it('should display confirmation shortcuts when confirmation is active', () => {
    const state = makeState({
      overlayStack: [{
        kind: 'confirmation',
        title: 'Stop?',
        message: 'Are you sure?',
        action: { kind: 'stop-session', sessionName: 'test' },
      }],
    });
    const { lastFrame } = render(<StatusBar state={state} />);
    const output = lastFrame() || '';
    expect(output).toContain('confirm');
    expect(output).toContain('cancel');
  });

  it('should display status message when set and not expired', () => {
    const state = makeState({
      statusMessage: {
        text: 'Session started',
        level: 'success',
        expiresAt: Date.now() + 5000,
      },
    });
    const { lastFrame } = render(<StatusBar state={state} />);
    const output = lastFrame() || '';
    expect(output).toContain('Session started');
  });

  it('should not display expired status message', () => {
    const state = makeState({
      statusMessage: {
        text: 'Old message',
        level: 'info',
        expiresAt: Date.now() - 1000,
      },
    });
    const { lastFrame } = render(<StatusBar state={state} />);
    const output = lastFrame() || '';
    expect(output).not.toContain('Old message');
  });

  it('should display singular session count', () => {
    const state = makeState({
      sessions: [
        {
          name: 'test-1',
          pid: 1234,
          state: SessionState.Running,
          startedAt: new Date(),
          workingDirectory: '/tmp',
          promptCount: 0,
        },
      ],
      selectedSessionName: 'test-1',
    });

    const { lastFrame } = render(<StatusBar state={state} />);
    const output = lastFrame() || '';
    expect(output).toContain('1 session');
    // Make sure it's not "1 sessions"
    expect(output).not.toMatch(/1 sessions/);
  });
});
