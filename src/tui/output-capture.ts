import type { Session } from '../core/session.js';
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
  private readonly maxLinesPerSession: number;

  constructor(config?: OutputCaptureConfig) {
    this.maxLinesPerSession = config?.maxLinesPerSession ?? 1000;
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

    buffer.push({
      sessionName,
      text,
      timestamp: new Date(),
      isError,
    });

    if (buffer.length > this.maxLinesPerSession) {
      buffer.shift();
    }

    this.buffers.set(sessionName, buffer);
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
    this.buffers.set(sessionName, []);
  }

  /**
   * Clear all captured output.
   */
  clearAll(): void {
    this.buffers.clear();
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
    const buffer = this.buffers.get(sessionName) ?? [];
    const lines = text.split('\n');

    for (const line of lines) {
      if (line === '' && lines.length > 1) {
        continue;
      }

      buffer.push({
        sessionName,
        text: line,
        timestamp: new Date(),
        isError,
      });

      if (buffer.length > this.maxLinesPerSession) {
        buffer.shift();
      }
    }

    this.buffers.set(sessionName, buffer);
  }
}
