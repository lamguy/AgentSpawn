import type { Session } from '../core/session.js';
import type { Logger } from '../utils/logger.js';
import type { OutputLine, OutputCaptureConfig } from './types.js';

/**
 * OutputCapture — Captures and buffers output from multiple sessions.
 *
 * Listens to Session EventEmitter events ('promptStart', 'data', 'promptComplete',
 * 'promptError') and maintains a circular buffer of output lines per session.
 */
export class OutputCapture {
  private readonly buffers: Map<string, OutputLine[]> = new Map();
  private readonly listeners: Map<string, (() => void)[]> = new Map();
  private maxLinesPerSession: number;
  private readonly maxTotalLines: number;
  private readonly maxLineLength: number;
  private readonly logger: Logger | undefined;
  private totalLineCount: number = 0;

  constructor(config?: OutputCaptureConfig, logger?: Logger) {
    this.maxLinesPerSession = config?.maxLinesPerSession ?? 1000;
    this.logger = logger;

    const rawMaxTotal = config?.maxTotalLines ?? 10000;
    this.maxTotalLines = (rawMaxTotal === 0 || rawMaxTotal === Infinity) ? Infinity : rawMaxTotal;

    const rawMaxLen = config?.maxLineLength ?? 10000;
    this.maxLineLength = (rawMaxLen === 0 || rawMaxLen === Infinity) ? Infinity : rawMaxLen;

    // Validate: global cap should not be less than per-session cap
    if (this.maxTotalLines !== Infinity && this.maxTotalLines < this.maxLinesPerSession) {
      this.logger?.warn(
        `OutputCapture: maxTotalLines (${this.maxTotalLines}) is less than maxLinesPerSession (${this.maxLinesPerSession}), clamping maxLinesPerSession`,
      );
      this.maxLinesPerSession = this.maxTotalLines;
    }
  }

  /**
   * Start capturing output from a session via its EventEmitter events.
   */
  captureSession(sessionName: string, session: Session): void {
    if (this.listeners.has(sessionName)) {
      return;
    }

    if (!this.buffers.has(sessionName)) {
      this.buffers.set(sessionName, []);
    }

    const onPromptStart = (prompt: string): void => {
      this.appendLine(sessionName, `You: ${prompt}`, false);
    };

    const onData = (chunk: string): void => {
      // Append response data as it streams in
      this.appendOutput(sessionName, chunk, false);
    };

    const onPromptComplete = (): void => {
      // Add a blank line after response for readability
      this.appendLine(sessionName, '', false);
    };

    const onPromptError = (err: Error): void => {
      this.appendLine(sessionName, `Error: ${err.message}`, true);
    };

    session.on('promptStart', onPromptStart);
    session.on('data', onData);
    session.on('promptComplete', onPromptComplete);
    session.on('promptError', onPromptError);

    // Store cleanup functions
    const cleanups = [
      () => session.removeListener('promptStart', onPromptStart),
      () => session.removeListener('data', onData),
      () => session.removeListener('promptComplete', onPromptComplete),
      () => session.removeListener('promptError', onPromptError),
    ];
    this.listeners.set(sessionName, cleanups);
  }

  /**
   * Stop capturing output from a session.
   */
  releaseSession(sessionName: string): void {
    const cleanups = this.listeners.get(sessionName);
    if (cleanups) {
      for (const cleanup of cleanups) {
        cleanup();
      }
      this.listeners.delete(sessionName);
    }
  }

  /**
   * Directly append a line of text to a session's output buffer.
   */
  appendLine(sessionName: string, text: string, isError: boolean): void {
    const buffer = this.buffers.get(sessionName) ?? [];

    // Truncate long lines
    const finalText = this.maxLineLength !== Infinity && text.length > this.maxLineLength
      ? text.slice(0, this.maxLineLength) + ' [truncated]'
      : text;

    buffer.push({
      sessionName,
      text: finalText,
      timestamp: new Date(),
      isError,
    });
    this.totalLineCount++;

    // Per-session cap eviction
    if (buffer.length > this.maxLinesPerSession) {
      buffer.shift();
      this.totalLineCount--;
    }

    this.buffers.set(sessionName, buffer);

    // Global eviction (oldest-first across all sessions)
    if (this.maxTotalLines !== Infinity) {
      this.evictGlobalLines();
    }
  }

  /**
   * Get captured output lines for a specific session.
   */
  getLines(sessionName: string): OutputLine[] {
    return this.buffers.get(sessionName) ?? [];
  }

  /**
   * Clear captured output for a specific session.
   */
  clearSession(sessionName: string): void {
    const buffer = this.buffers.get(sessionName);
    if (buffer) {
      this.totalLineCount -= buffer.length;
    }
    this.buffers.set(sessionName, []);
  }

  /**
   * Clear all captured output.
   */
  clearAll(): void {
    this.buffers.clear();
    this.totalLineCount = 0;
  }

  /**
   * Get all session names that have captured output.
   */
  getSessionNames(): string[] {
    return Array.from(this.buffers.keys());
  }

  /**
   * Internal method to append raw output text, splitting into lines.
   */
  private appendOutput(sessionName: string, text: string, isError: boolean): void {
    const lines = text.split('\n');

    for (const line of lines) {
      if (line === '' && lines.length > 1) {
        continue;
      }

      this.appendLine(sessionName, line, isError);
    }
  }

  /**
   * Evict oldest lines across all sessions to stay within global limit.
   */
  private evictGlobalLines(): void {
    let evicted = 0;

    while (this.totalLineCount > this.maxTotalLines) {
      // Find the session whose oldest line has the earliest timestamp
      let oldestSession: string | null = null;
      let oldestTime = Infinity;

      for (const [name, buffer] of this.buffers) {
        if (buffer.length > 0 && buffer[0].timestamp.getTime() < oldestTime) {
          oldestTime = buffer[0].timestamp.getTime();
          oldestSession = name;
        }
      }

      if (!oldestSession) break;

      const buffer = this.buffers.get(oldestSession)!;
      buffer.shift();
      this.totalLineCount--;
      evicted++;

      // If eviction emptied the buffer, remove from map (but not listeners)
      if (buffer.length === 0) {
        this.buffers.delete(oldestSession);
      }
    }

    if (evicted > 0) {
      this.logger?.warn(
        `OutputCapture: evicted ${evicted} line(s) to stay within global limit of ${this.maxTotalLines}`,
      );
    }
  }
}
