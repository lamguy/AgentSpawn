import { describe, it, expect } from 'vitest';
import { formatSessionOutput, formatStatusLine } from './formatter.js';
import { SessionState } from '../types.js';

describe('Formatter', () => {
  it('formatSessionOutput prefixes with session name', () => {
    const result = formatSessionOutput('agent-1', 'hello world');
    expect(result).toBe('[agent-1] hello world');
  });

  it('formatStatusLine returns formatted string', () => {
    const result = formatStatusLine({
      name: 'agent-1',
      pid: 1234,
      state: SessionState.Running,
      startedAt: new Date(),
      workingDirectory: '/tmp/work',
    });
    expect(result).toBe('agent-1 [running] /tmp/work (pid: 1234)');
  });
});
