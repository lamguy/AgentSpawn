import { describe, it, expect } from 'vitest';
import { createProvider, ClaudeAdapter, GeminiAdapter, OllamaAdapter, OpenAICompatAdapter } from './index.js';

describe('createProvider', () => {
  it('creates ClaudeAdapter for claude', () => {
    const p = createProvider('claude');
    expect(p).toBeInstanceOf(ClaudeAdapter);
    expect(p.type).toBe('claude');
  });

  it('creates GeminiAdapter for gemini', () => {
    const p = createProvider('gemini');
    expect(p).toBeInstanceOf(GeminiAdapter);
    expect(p.type).toBe('gemini');
  });

  it('creates OllamaAdapter for ollama with default model', () => {
    const p = createProvider('ollama');
    expect(p).toBeInstanceOf(OllamaAdapter);
    expect(p.type).toBe('ollama');
    // Default model should produce run args
    expect(p.buildFirstPromptArgs('id')[0]).toBe('run');
  });

  it('creates OllamaAdapter with custom modelName', () => {
    const p = createProvider('ollama', { modelName: 'mistral' });
    expect(p).toBeInstanceOf(OllamaAdapter);
    expect(p.buildFirstPromptArgs('id')).toEqual(['run', 'mistral']);
  });

  it('creates OpenAICompatAdapter for openai-compat', () => {
    const p = createProvider('openai-compat');
    expect(p).toBeInstanceOf(OpenAICompatAdapter);
    expect(p.type).toBe('openai-compat');
  });

  it('creates OpenAICompatAdapter with custom binary', () => {
    const p = createProvider('openai-compat', { providerBinary: 'aichat' });
    expect(p).toBeInstanceOf(OpenAICompatAdapter);
    expect(p.binary).toBe('aichat');
  });

  it('throws for unknown provider type', () => {
    expect(() => createProvider('unknown' as never)).toThrow();
  });

  it('all providers have required interface properties', () => {
    const providers = [
      createProvider('claude'),
      createProvider('gemini'),
      createProvider('ollama'),
      createProvider('openai-compat'),
    ];
    for (const p of providers) {
      expect(typeof p.type).toBe('string');
      expect(typeof p.binary).toBe('string');
      expect(typeof p.configDir).toBe('string');
      expect(typeof p.supportsNativeSession).toBe('boolean');
      expect(typeof p.buildFirstPromptArgs).toBe('function');
      expect(typeof p.buildResumeArgs).toBe('function');
      expect(typeof p.extractText).toBe('function');
      expect(typeof p.buildModeArgs).toBe('function');
    }
  });
});
