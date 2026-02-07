import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { ConfirmationDialog } from './ConfirmationDialog.js';

describe('ConfirmationDialog', () => {
  const defaults = {
    title: 'Stop Session',
    message: 'This will terminate the session.',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  it('should render the title', () => {
    const { lastFrame } = render(<ConfirmationDialog {...defaults} />);
    expect(lastFrame()).toContain('Stop Session');
  });

  it('should render the message', () => {
    const { lastFrame } = render(<ConfirmationDialog {...defaults} />);
    expect(lastFrame()).toContain('This will terminate the session.');
  });

  it('should render confirm and cancel hints', () => {
    const { lastFrame } = render(<ConfirmationDialog {...defaults} />);
    const output = lastFrame() || '';
    expect(output).toContain('[y]');
    expect(output).toContain('Confirm');
    expect(output).toContain('[n]');
    expect(output).toContain('Cancel');
  });
});
