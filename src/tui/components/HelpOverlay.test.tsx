import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { HelpOverlay } from './HelpOverlay.js';

describe('HelpOverlay', () => {
  it('should render the title', () => {
    const { lastFrame } = render(
      <HelpOverlay scrollOffset={0} onScroll={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(lastFrame()).toContain('AgentSpawn Keyboard Shortcuts');
  });

  it('should render navigation shortcuts section', () => {
    const { lastFrame } = render(
      <HelpOverlay scrollOffset={0} onScroll={vi.fn()} onDismiss={vi.fn()} />,
    );
    const output = lastFrame() || '';
    expect(output).toContain('NAVIGATION');
    expect(output).toContain('Tab');
    expect(output).toContain('Next session');
    expect(output).toContain('Enter');
    expect(output).toContain('Attach to session');
  });

  it('should render attached mode shortcuts section', () => {
    const { lastFrame } = render(
      <HelpOverlay scrollOffset={0} onScroll={vi.fn()} onDismiss={vi.fn()} />,
    );
    const output = lastFrame() || '';
    expect(output).toContain('ATTACHED MODE');
    expect(output).toContain('Esc');
    expect(output).toContain('Detach from session');
  });

  it('should render global shortcuts section', () => {
    const { lastFrame } = render(
      <HelpOverlay scrollOffset={0} onScroll={vi.fn()} onDismiss={vi.fn()} />,
    );
    const output = lastFrame() || '';
    expect(output).toContain('GLOBAL');
    expect(output).toContain('Toggle this help');
  });

  it('should render dismiss hint', () => {
    const { lastFrame } = render(
      <HelpOverlay scrollOffset={0} onScroll={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(lastFrame()).toContain('Press Esc or ? to close');
  });
});
