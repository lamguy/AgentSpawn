import { describe, it, expect } from 'vitest';
import { ClaudeAdapter } from './claude.js';

describe('ClaudeAdapter', () => {
  const adapter = new ClaudeAdapter();
  const sessionId = 'test-session-uuid-1234';

  it('has correct type and binary', () => {
    expect(adapter.type).toBe('claude');
    expect(adapter.binary).toBe('claude');
  });

  it('has configDir pointing to ~/.claude', () => {
    expect(adapter.configDir).toContain('.claude');
  });

  it('supportsNativeSession is true', () => {
    expect(adapter.supportsNativeSession).toBe(true);
  });

  it('buildFirstPromptArgs returns correct args with --session-id', () => {
    const args = adapter.buildFirstPromptArgs(sessionId);
    expect(args).toContain('--print');
    expect(args).toContain('--output-format');
    expect(args).toContain('stream-json');
    expect(args).toContain('--session-id');
    expect(args).toContain(sessionId);
    expect(args).not.toContain('--resume');
  });

  it('buildResumeArgs returns correct args with --resume', () => {
    const args = adapter.buildResumeArgs(sessionId);
    expect(args).toContain('--print');
    expect(args).toContain('--output-format');
    expect(args).toContain('stream-json');
    expect(args).toContain('--resume');
    expect(args).toContain(sessionId);
    expect(args).not.toContain('--session-id');
  });

  it('buildModeArgs with mode returns permission flag', () => {
    const args = adapter.buildModeArgs('bypassPermissions');
    expect(args.length).toBeGreaterThan(0);
    // Should contain some flag related to permission mode
    expect(args.join(' ')).toContain('bypassPermissions');
  });

  it('buildModeArgs without mode returns empty array', () => {
    expect(adapter.buildModeArgs()).toEqual([]);
    expect(adapter.buildModeArgs(undefined)).toEqual([]);
  });

  it('extractText returns text from content_block_delta', () => {
    const line = JSON.stringify({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: 'Hello world' },
    });
    expect(adapter.extractText(line)).toBe('Hello world');
  });

  it('extractText returns text from assistant message', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: 'Hi there' }],
      },
    });
    expect(adapter.extractText(line)).toBe('Hi there');
  });

  it('extractText joins multiple text content blocks', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Part 1' },
          { type: 'text', text: ' Part 2' },
        ],
      },
    });
    expect(adapter.extractText(line)).toBe('Part 1 Part 2');
  });

  it('extractText returns null for result type', () => {
    const line = JSON.stringify({ type: 'result', result: 'success' });
    expect(adapter.extractText(line)).toBeNull();
  });

  it('extractText returns null for invalid JSON', () => {
    expect(adapter.extractText('not valid json')).toBeNull();
    expect(adapter.extractText('{broken')).toBeNull();
  });

  it('extractText returns null for unknown event type', () => {
    const line = JSON.stringify({ type: 'system', content: 'init' });
    expect(adapter.extractText(line)).toBeNull();
  });

  it('extractText returns null for non-text delta type', () => {
    const line = JSON.stringify({
      type: 'content_block_delta',
      delta: { type: 'input_json_delta', partial_json: '{}' },
    });
    expect(adapter.extractText(line)).toBeNull();
  });
});
