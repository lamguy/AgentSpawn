import type { ProviderAdapter, ProviderType } from './provider.js';
import { ClaudeAdapter } from './claude.js';
import { GeminiAdapter } from './gemini.js';
import { OllamaAdapter } from './ollama.js';
import { OpenAICompatAdapter } from './openai-compat.js';

type ProviderFactoryConfig = {
  modelName?: string;
  providerBinary?: string;
  providerArgs?: string[];
};

export function createProvider(type: ProviderType, config?: ProviderFactoryConfig): ProviderAdapter {
  switch (type) {
    case 'claude': return new ClaudeAdapter();
    case 'gemini': return new GeminiAdapter();
    case 'ollama': return new OllamaAdapter(config?.modelName);
    case 'openai-compat': return new OpenAICompatAdapter({
      binary: config?.providerBinary,
      extraArgs: config?.providerArgs,
    });
    default:
      throw new Error(`Unknown provider type: ${type as string}`);
  }
}

export type { ProviderAdapter, ProviderType } from './provider.js';
export { ClaudeAdapter } from './claude.js';
export { GeminiAdapter } from './gemini.js';
export { OllamaAdapter } from './ollama.js';
export { OpenAICompatAdapter } from './openai-compat.js';
