import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { HelpOverlay } from './HelpOverlay.js';

describe('HelpOverlay', () => {
  it('should render the title', () => {
    const { lastFrame } = render(
      <HelpOverlay scrollOffset={0} onScroll={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(lastFrame()).toContain('HOW TO PLAY');
  });

  it('should render navigation shortcuts section', () => {
    const { lastFrame } = render(
      <HelpOverlay scrollOffset={0} onScroll={vi.fn()} onDismiss={vi.fn()} />,
    );
    const output = lastFrame() || '';
    expect(output).toContain('SELECT PLAYER MODE');
    expect(output).toContain('Tab');
    expect(output).toContain('Next player');
    expect(output).toContain('Enter');
    expect(output).toContain('PRESS START');
  });

  it('should render attached mode shortcuts section', () => {
    const { lastFrame } = render(
      <HelpOverlay scrollOffset={0} onScroll={vi.fn()} onDismiss={vi.fn()} />,
    );
    const output = lastFrame() || '';
    expect(output).toContain('IN GAME MODE');
    expect(output).toContain('Esc');
    expect(output).toContain('PAUSE GAME');
  });

  it('should render global shortcuts section', () => {
    const { lastFrame } = render(
      <HelpOverlay scrollOffset={0} onScroll={vi.fn()} onDismiss={vi.fn()} />,
    );
    const output = lastFrame() || '';
    expect(output).toContain('UNIVERSAL');
    expect(output).toContain('Toggle HOW TO PLAY');
  });

  it('should render dismiss hint', () => {
    const { lastFrame } = render(
      <HelpOverlay scrollOffset={0} onScroll={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(lastFrame()).toContain('PRESS [Esc] OR [?] TO CLOSE');
  });
});
