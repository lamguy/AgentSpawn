import type { ProviderAdapter, ProviderType } from './provider.js';

interface OpenAICompatConfig {
  binary?: string;
  configDir?: string;
  extraArgs?: string[];
}

export class OpenAICompatAdapter implements ProviderAdapter {
  readonly type: ProviderType = 'openai-compat';
  readonly binary: string;
  readonly configDir: string;
  readonly supportsNativeSession: boolean = false;

  private readonly extraArgs: string[];

  constructor(config?: OpenAICompatConfig) {
    this.binary = config?.binary ?? 'sgpt';
    this.configDir = config?.configDir ?? `${process.env.HOME ?? '~'}/.config/shell_gpt`;
    this.extraArgs = config?.extraArgs ?? [];
  }

  buildFirstPromptArgs(_sessionId: string): string[] {
    return [...this.extraArgs, '--no-md'];
  }

  buildResumeArgs(_sessionId: string): string[] {
    return [...this.extraArgs, '--no-md'];
  }

  buildModeArgs(_mode?: string): string[] {
    return [];
  }

  extractText(line: string): string | null {
    return line.trim() !== '' ? line : null;
  }
}
