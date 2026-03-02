import { describe, it, expect } from 'vitest';
import { GeminiAdapter } from './gemini.js';

describe('GeminiAdapter', () => {
  const adapter = new GeminiAdapter();
  const sessionId = 'unused-session-id';

  it('has binary gemini', () => {
    expect(adapter.binary).toBe('gemini');
    expect(adapter.type).toBe('gemini');
  });

  it('has configDir pointing to ~/.gemini', () => {
    expect(adapter.configDir).toContain('.gemini');
  });

  it('supportsNativeSession is false', () => {
    expect(adapter.supportsNativeSession).toBe(false);
  });

  it('buildFirstPromptArgs returns ["-p"]', () => {
    const args = adapter.buildFirstPromptArgs(sessionId);
    expect(args).toEqual(['-p']);
  });

  it('buildResumeArgs returns ["-p"]', () => {
    const args = adapter.buildResumeArgs(sessionId);
    expect(args).toEqual(['-p']);
  });

  it('buildModeArgs always returns empty array', () => {
    expect(adapter.buildModeArgs()).toEqual([]);
    expect(adapter.buildModeArgs('bypassPermissions')).toEqual([]);
  });

  it('extractText returns non-empty lines as-is', () => {
    expect(adapter.extractText('Hello from Gemini')).toBe('Hello from Gemini');
    expect(adapter.extractText('  some text  ')).toBe('  some text  ');
  });

  it('extractText returns null for empty lines', () => {
    expect(adapter.extractText('')).toBeNull();
  });

  it('extractText returns null for whitespace-only lines', () => {
    expect(adapter.extractText('   ')).toBeNull();
    expect(adapter.extractText('\t\n')).toBeNull();
  });
});
