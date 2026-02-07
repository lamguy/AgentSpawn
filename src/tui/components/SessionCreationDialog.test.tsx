import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { SessionCreationDialog } from './SessionCreationDialog.js';

describe('SessionCreationDialog', () => {
  const defaults = {
    fields: { name: '', directory: '' },
    activeField: 'name' as const,
    errors: { name: '', directory: '' },
    isSubmitting: false,
    onFieldChange: vi.fn(),
    onFieldSwitch: vi.fn(),
    onSubmit: vi.fn(),
    onDismiss: vi.fn(),
  };

  it('should render the title', () => {
    const { lastFrame } = render(<SessionCreationDialog {...defaults} />);
    expect(lastFrame()).toContain('New Session');
  });

  it('should render both field labels', () => {
    const { lastFrame } = render(<SessionCreationDialog {...defaults} />);
    const output = lastFrame() || '';
    expect(output).toContain('Name:');
    expect(output).toContain('Directory:');
  });

  it('should render field values when provided', () => {
    const { lastFrame } = render(
      <SessionCreationDialog
        {...defaults}
        fields={{ name: 'my-session', directory: '/tmp/project' }}
      />,
    );
    const output = lastFrame() || '';
    expect(output).toContain('my-session');
    expect(output).toContain('/tmp/project');
  });

  it('should render validation errors', () => {
    const { lastFrame } = render(
      <SessionCreationDialog
        {...defaults}
        errors={{ name: 'Name is required', directory: '' }}
      />,
    );
    expect(lastFrame()).toContain('Name is required');
  });

  it('should render submitting state', () => {
    const { lastFrame } = render(
      <SessionCreationDialog {...defaults} isSubmitting={true} />,
    );
    expect(lastFrame()).toContain('Creating...');
  });

  it('should render footer hints', () => {
    const { lastFrame } = render(<SessionCreationDialog {...defaults} />);
    const output = lastFrame() || '';
    expect(output).toContain('Tab to switch fields');
    expect(output).toContain('Enter to create');
  });
});
