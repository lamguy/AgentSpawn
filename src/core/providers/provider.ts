import type { ProviderType } from '../../types.js';
export type { ProviderType };

export interface ProviderAdapter {
  readonly type: ProviderType;
  readonly binary: string;
  readonly configDir: string;

  buildFirstPromptArgs(sessionId: string): string[];
  buildResumeArgs(sessionId: string): string[];
  extractText(line: string): string | null;
  readonly supportsNativeSession: boolean;
  buildModeArgs(mode?: string): string[];
}
