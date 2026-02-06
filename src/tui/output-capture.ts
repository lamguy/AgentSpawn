import type { Session } from '../core/session.js';
import type { OutputLine, OutputCaptureConfig } from './types.js';
import type { Readable } from 'node:stream';

/**
 * OutputCapture — Captures and buffers output from multiple sessions.
 *
 * This utility attaches listeners to session stdout/stderr streams and maintains
 * a circular buffer of recent output lines per session. The TUI can query this
 * buffer to display session output without interfering with the Router's I/O routing.
 */
export class OutputCapture {
  private readonly buffers: Map<string, OutputLine[]> = new Map();
  private readonly listeners: Map<string, { stdout: (data: Buffer) => void; stderr: (data: Buffer) => void }> = new Map();
  private readonly maxLinesPerSession: number;
  private readonly captureStderr: boolean;

  constructor(config?: OutputCaptureConfig) {
    this.maxLinesPerSession = config?.maxLinesPerSession ?? 1000;
    this.captureStderr = config?.captureStderr ?? true;
  }

  /**
   * Start capturing output from a session.
   */
  captureSession(sessionName: string, session: Session): void {
    // If already capturing, do nothing
    if (this.listeners.has(sessionName)) {
      return;
    }

    const handle = session.getHandle();
    if (!handle) {
      // Session not running, cannot capture
      return;
    }

    // Initialize buffer for this session
    if (!this.buffers.has(sessionName)) {
      this.buffers.set(sessionName, []);
    }

    // Attach stdout listener
    const stdoutListener = (data: Buffer): void => {
      this.appendOutput(sessionName, data.toString(), false);
    };
    handle.stdout.on('data', stdoutListener);

    // Attach stderr listener if configured
    let stderrListener: (data: Buffer) => void;
    if (this.captureStderr) {
      stderrListener = (data: Buffer): void => {
        this.appendOutput(sessionName, data.toString(), true);
      };
      handle.stderr.on('data', stderrListener);
    } else {
      stderrListener = (): void => {};
    }

    // Store listeners for later cleanup
    this.listeners.set(sessionName, { stdout: stdoutListener, stderr: stderrListener });
  }

  /**
   * Stop capturing output from a session.
   */
  releaseSession(sessionName: string, session: Session): void {
    const listeners = this.listeners.get(sessionName);
    if (!listeners) {
      return;
    }

    const handle = session.getHandle();
    if (handle) {
      handle.stdout.removeListener('data', listeners.stdout);
      if (this.captureStderr) {
        handle.stderr.removeListener('data', listeners.stderr);
      }
    }

    this.listeners.delete(sessionName);
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
   * Internal method to append output and maintain circular buffer.
   */
  private appendOutput(sessionName: string, text: string, isError: boolean): void {
    const buffer = this.buffers.get(sessionName) ?? [];

    // Split text into lines, preserving empty lines
    const lines = text.split('\n');

    for (const line of lines) {
      // Skip completely empty lines from split
      if (line === '' && lines.length > 1) {
        continue;
      }

      const outputLine: OutputLine = {
        sessionName,
        text: line,
        timestamp: new Date(),
        isError,
      };

      buffer.push(outputLine);

      // Maintain circular buffer by removing oldest lines
      if (buffer.length > this.maxLinesPerSession) {
        buffer.shift();
      }
    }

    this.buffers.set(sessionName, buffer);
  }

  /**
   * Attach a listener to be notified when new output arrives.
   * Useful for triggering UI updates.
   */
  onOutput(callback: (sessionName: string, line: OutputLine) => void): () => void {
    // For now, this is a placeholder for future event-driven updates.
    // In a real implementation, we'd maintain a set of callbacks and invoke them
    // from appendOutput. For simplicity, the TUI will poll getLines() on a timer.
    return () => {
      // Cleanup function (currently no-op)
    };
  }
}
