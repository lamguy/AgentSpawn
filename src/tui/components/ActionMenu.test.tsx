import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { ActionMenu } from './ActionMenu.js';

describe('ActionMenu', () => {
  const defaults = {
    selectedIndex: 0,
    targetSessionName: 'demo',
    onSelect: vi.fn(),
    onNavigate: vi.fn(),
    onDismiss: vi.fn(),
  };

  it('should render the title', () => {
    const { lastFrame } = render(<ActionMenu {...defaults} />);
    expect(lastFrame()).toContain('COMMAND CENTER');
  });

  it('should render all 7 menu items', () => {
    const { lastFrame } = render(<ActionMenu {...defaults} />);
    const output = lastFrame() || '';
    expect(output).toContain('INSERT COIN');
    expect(output).toContain('PRESS START');
    expect(output).toContain('PULL PLUG');
    expect(output).toContain('CONTINUE?');
    expect(output).toContain('GAME RESET');
    expect(output).toContain('HOW TO PLAY');
    expect(output).toContain('POWER OFF');
  });

  it('should highlight the selected item with cursor', () => {
    const { lastFrame } = render(<ActionMenu {...defaults} selectedIndex={0} />);
    const output = lastFrame() || '';
    expect(output).toContain('>');
  });

  it('should render footer hints', () => {
    const { lastFrame } = render(<ActionMenu {...defaults} />);
    const output = lastFrame() || '';
    expect(output).toContain('Up/Down navigate');
    expect(output).toContain('Enter select');
  });

  it('should render shortcut hints for items that have them', () => {
    const { lastFrame } = render(<ActionMenu {...defaults} />);
    const output = lastFrame() || '';
    // 'n' shortcut for New Session
    expect(output).toContain('n');
    // '?' shortcut for Help
    expect(output).toContain('?');
    // 'q' shortcut for Quit
    expect(output).toContain('q');
  });
});
