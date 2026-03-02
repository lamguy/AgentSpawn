import type { ProviderAdapter, ProviderType } from './provider.js';

export class ClaudeAdapter implements ProviderAdapter {
  readonly type: ProviderType = 'claude';
  readonly binary: string = 'claude';
  readonly configDir: string = `${process.env.HOME ?? '~'}/.claude`;
  readonly supportsNativeSession: boolean = true;

  buildFirstPromptArgs(sessionId: string): string[] {
    return ['--print', '--output-format', 'stream-json', '--verbose', '--session-id', sessionId];
  }

  buildResumeArgs(sessionId: string): string[] {
    return ['--print', '--output-format', 'stream-json', '--verbose', '--resume', sessionId];
  }

  buildModeArgs(mode?: string): string[] {
    if (mode) {
      return ['--permission-mode', mode];
    }
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extractText(line: string): string | null {
    let event: any;
    try {
      event = JSON.parse(line);
    } catch {
      return null;
    }

    if (!event || !event.type) return null;

    switch (event.type) {
      case 'assistant': {
        // Full assistant message — extract text content blocks
        const content = event.message?.content;
        if (Array.isArray(content)) {
          const texts = content
            .filter((c: { type: string }) => c.type === 'text')
            .map((c: { text: string }) => c.text);
          return texts.length > 0 ? texts.join('') : null;
        }
        return null;
      }
      case 'content_block_delta': {
        // Streaming text delta
        if (event.delta?.type === 'text_delta') {
          return event.delta.text ?? null;
        }
        return null;
      }
      case 'result': {
        // Final result — content already captured via assistant/delta events
        return null;
      }
      default:
        return null;
    }
  }
}
