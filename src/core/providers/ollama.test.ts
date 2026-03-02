import { describe, it, expect } from 'vitest';
import { OllamaAdapter } from './ollama.js';

describe('OllamaAdapter', () => {
  const sessionId = 'unused-session-id';

  it('uses default model when not specified', () => {
    const adapter = new OllamaAdapter();
    expect(adapter.binary).toBe('ollama');
    expect(adapter.type).toBe('ollama');
  });

  it('has configDir pointing to ~/.ollama', () => {
    const adapter = new OllamaAdapter();
    expect(adapter.configDir).toContain('.ollama');
  });

  it('supportsNativeSession is false', () => {
    expect(new OllamaAdapter().supportsNativeSession).toBe(false);
  });

  it('buildFirstPromptArgs returns ["run", defaultModel]', () => {
    const adapter = new OllamaAdapter();
    const args = adapter.buildFirstPromptArgs(sessionId);
    expect(args[0]).toBe('run');
    expect(args.length).toBe(2);
  });

  it('buildFirstPromptArgs uses custom model name', () => {
    const adapter = new OllamaAdapter('mistral');
    const args = adapter.buildFirstPromptArgs(sessionId);
    expect(args).toEqual(['run', 'mistral']);
  });

  it('buildResumeArgs returns ["run", modelName]', () => {
    const adapter = new OllamaAdapter('llama3.2');
    const args = adapter.buildResumeArgs(sessionId);
    expect(args).toEqual(['run', 'llama3.2']);
  });

  it('buildModeArgs always returns empty array', () => {
    const adapter = new OllamaAdapter();
    expect(adapter.buildModeArgs()).toEqual([]);
    expect(adapter.buildModeArgs('bypassPermissions')).toEqual([]);
  });

  it('extractText parses NDJSON response field', () => {
    const adapter = new OllamaAdapter();
    const line = JSON.stringify({ model: 'llama3.2', response: 'Hello there', done: false });
    expect(adapter.extractText(line)).toBe('Hello there');
  });

  it('extractText returns null when response field is missing', () => {
    const adapter = new OllamaAdapter();
    const line = JSON.stringify({ model: 'llama3.2', done: true });
    expect(adapter.extractText(line)).toBeNull();
  });

  it('extractText returns null for invalid JSON', () => {
    const adapter = new OllamaAdapter();
    expect(adapter.extractText('not json')).toBeNull();
    expect(adapter.extractText('{bad')).toBeNull();
  });

  it('extractText returns empty string for empty response field', () => {
    const adapter = new OllamaAdapter();
    const line = JSON.stringify({ response: '' });
    // empty string is returned as-is (not null)
    expect(adapter.extractText(line)).toBe('');
  });
});
