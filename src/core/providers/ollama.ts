import type { ProviderAdapter, ProviderType } from './provider.js';

export class OllamaAdapter implements ProviderAdapter {
  readonly type: ProviderType = 'ollama';
  readonly binary: string = 'ollama';
  readonly configDir: string = `${process.env.HOME ?? '~'}/.ollama`;
  readonly supportsNativeSession: boolean = false;

  private readonly modelName: string;

  constructor(modelName: string = 'llama3.2') {
    this.modelName = modelName;
  }

  buildFirstPromptArgs(_sessionId: string): string[] {
    return ['run', this.modelName];
  }

  buildResumeArgs(_sessionId: string): string[] {
    return ['run', this.modelName];
  }

  buildModeArgs(_mode?: string): string[] {
    return [];
  }

  extractText(line: string): string | null {
    try {
      const parsed = JSON.parse(line);
      return parsed.response ?? null;
    } catch {
      return null;
    }
  }
}
