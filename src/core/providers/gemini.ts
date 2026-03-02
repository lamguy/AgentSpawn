import type { ProviderAdapter, ProviderType } from './provider.js';

export class GeminiAdapter implements ProviderAdapter {
  readonly type: ProviderType = 'gemini';
  readonly binary: string = 'gemini';
  readonly configDir: string = `${process.env.HOME ?? '~'}/.gemini`;
  readonly supportsNativeSession: boolean = false;

  buildFirstPromptArgs(_sessionId: string): string[] {
    return ['-p'];
  }

  buildResumeArgs(_sessionId: string): string[] {
    return ['-p'];
  }

  buildModeArgs(_mode?: string): string[] {
    return [];
  }

  extractText(line: string): string | null {
    return line.trim() !== '' ? line : null;
  }
}
