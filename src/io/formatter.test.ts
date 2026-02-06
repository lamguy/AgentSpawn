import { describe, it, expect } from 'vitest';
import {
  formatSessionOutput,
  formatStatusLine,
  colorForState,
  formatSessionTable,
} from './formatter.js';
import { SessionState } from '../types.js';

describe('Formatter', () => {
  it('formatSessionOutput prefixes with session name', () => {
    const result = formatSessionOutput('agent-1', 'hello world');
    expect(result).toBe('[agent-1] hello world');
  });

  it('formatStatusLine returns formatted string with ANSI codes', () => {
    const result = formatStatusLine({
      name: 'agent-1',
      pid: 1234,
      state: SessionState.Running,
      startedAt: new Date(),
      workingDirectory: '/tmp/work',
    });
    expect(result).toContain('agent-1');
    expect(result).toContain('running');
    expect(result).toContain('/tmp/work');
    expect(result).toContain('1234');
  });

  it('colorForState returns GREEN for Running', () => {
    expect(colorForState(SessionState.Running)).toBe('\x1b[32m');
  });

  it('colorForState returns RED for Crashed', () => {
    expect(colorForState(SessionState.Crashed)).toBe('\x1b[31m');
  });

  it('colorForState returns GRAY for Stopped', () => {
    expect(colorForState(SessionState.Stopped)).toBe('\x1b[90m');
  });

  it('formatSessionTable returns "No sessions." for empty array', () => {
    expect(formatSessionTable([])).toBe('No sessions.');
  });

  it('formatSessionTable returns table containing both session names and states', () => {
    const sessions = [
      {
        name: 'agent-1',
        pid: 1234,
        state: SessionState.Running,
        startedAt: new Date('2025-01-01T00:00:00Z'),
        workingDirectory: '/tmp/a',
      },
      {
        name: 'agent-2',
        pid: 5678,
        state: SessionState.Crashed,
        startedAt: null,
        workingDirectory: '/tmp/b',
      },
    ];
    const result = formatSessionTable(sessions);
    expect(result).toContain('agent-1');
    expect(result).toContain('agent-2');
    expect(result).toContain('running');
    expect(result).toContain('crashed');
    expect(result).toContain('--');
  });
});
