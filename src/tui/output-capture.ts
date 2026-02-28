import type { Session } from '../core/session.js';
import type { Logger } from '../utils/logger.js';
import type { OutputLine, OutputCaptureConfig } from './types.js';

/**
 * OutputCapture — Captures and buffers output from multiple sessions.
 *
 * Listens to Session EventEmitter events ('promptStart', 'data', 'promptComplete',
 * 'promptError', 'system') and maintains a circular buffer of output lines per session.
 */
export class OutputCapture {
  private readonly buffers: Map<string, OutputLine[]> = new Map();
  private readonly listeners: Map<string, (() => void)[]> = new Map();
  private maxLinesPerSession: number;
  private readonly maxTotalLines: number;
  private readonly maxLineLength: number;
  private readonly logger: Logger | undefined;
  private totalLineCount: number = 0;
  private liveLineIndices: Map<string, number> = new Map();

  /** Optional callback invoked whenever the buffer changes. */
  onUpdate?: () => void;

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
   *
   * Listens to 'promptStart', 'data', 'promptComplete', 'promptError', 'stderr', and 'system'.
   */
  captureSession(sessionName: string, session: Session): void {
    if (this.listeners.has(sessionName)) {
      return;
    }

    if (!this.buffers.has(sessionName)) {
      this.buffers.set(sessionName, []);
    }

    const onPromptStart = (prompt: string): void => {
      this.finalizeLiveLine(sessionName);
      this.appendLine(sessionName, `You: ${prompt}`, false);
    };

    const onData = (chunk: string): void => {
      this.appendStreamingChunk(sessionName, chunk);
    };

    const onPromptComplete = (): void => {
      this.finalizeLiveLine(sessionName);
      // Add a blank line after response for readability
      this.appendLine(sessionName, '', false);
    };

    const onPromptError = (err: Error): void => {
      this.appendLine(sessionName, `Error: ${err.message}`, true);
    };

    const onStderr = (chunk: string): void => {
      this.appendLine(sessionName, chunk.trim(), true);
    };

    const onSystem = (message: string): void => {
      this.appendLine(sessionName, message, false, true);
    };

    session.on('promptStart', onPromptStart);
    session.on('data', onData);
    session.on('promptComplete', onPromptComplete);
    session.on('promptError', onPromptError);
    session.on('stderr', onStderr);
    session.on('system', onSystem);

    // Store cleanup functions
    const cleanups = [
      () => session.removeListener('promptStart', onPromptStart),
      () => session.removeListener('data', onData),
      () => session.removeListener('promptComplete', onPromptComplete),
      () => session.removeListener('promptError', onPromptError),
      () => session.removeListener('stderr', onStderr),
      () => session.removeListener('system', onSystem),
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
  appendLine(sessionName: string, text: string, isError: boolean, isSystem: boolean = false): void {
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
      isSystem,
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

    this.onUpdate?.();
  }

  /**
   * Get captured output lines for a specific session.
   */
  getLines(sessionName: string): OutputLine[] {
    return this.buffers.get(sessionName) ?? [];
  }

  /**
   * Mark the current live line for a session as finalized (no longer streaming).
   */
  finalizeLiveLine(sessionName: string): void {
    const idx = this.liveLineIndices.get(sessionName);
    if (idx === undefined) return;
    const buffer = this.buffers.get(sessionName);
    if (!buffer || idx >= buffer.length) {
      this.liveLineIndices.delete(sessionName);
      return;
    }
    buffer[idx] = { ...buffer[idx], isLive: false };
    this.liveLineIndices.delete(sessionName);
  }

  /**
   * Append a streaming chunk of text to a session's live output line.
   * Splits on newlines: fragments before a newline accumulate on the current
   * live line; a newline finalizes it and starts a fresh live line.
   */
  appendStreamingChunk(sessionName: string, text: string): void {
    if (!this.buffers.has(sessionName)) {
      this.buffers.set(sessionName, []);
    }

    const parts = text.split('\n');
    // parts[0]       — fragment before the first \n (or whole text if no \n)
    // parts[1..n-2]  — complete middle lines (only present when \n chars exist)
    // parts[n-1]     — fragment after the last \n (starts a new live line)

    // Append parts[0] to the current live line (or create one)
    const buffer = this.buffers.get(sessionName)!;
    const existingIdx = this.liveLineIndices.get(sessionName);

    if (existingIdx !== undefined && existingIdx < buffer.length) {
      // Update existing live line in-place via replacement
      const existing = buffer[existingIdx];
      buffer[existingIdx] = {
        ...existing,
        text: existing.text + parts[0],
        isLive: true,
      };
      this.onUpdate?.();
    } else {
      // Create a new live line
      const newLine: OutputLine = {
        sessionName,
        text: parts[0],
        timestamp: new Date(),
        isError: false,
        isLive: true,
      };
      buffer.push(newLine);
      this.totalLineCount++;
      this.liveLineIndices.set(sessionName, buffer.length - 1);

      // Apply per-session cap
      if (buffer.length > this.maxLinesPerSession) {
        buffer.shift();
        this.totalLineCount--;
        const currentIdx = this.liveLineIndices.get(sessionName);
        if (currentIdx !== undefined && currentIdx > 0) {
          this.liveLineIndices.set(sessionName, currentIdx - 1);
        } else {
          this.liveLineIndices.delete(sessionName);
        }
      }

      if (this.maxTotalLines !== Infinity) {
        this.evictGlobalLines();
      }
      this.onUpdate?.();
    }

    if (parts.length === 1) {
      // No newline in this chunk — just updated the live line
      this.onUpdate?.();
      return;
    }

    // Newline(s) present: finalize the current live line, add middle lines,
    // then start a new live line for the trailing fragment
    this.finalizeLiveLine(sessionName);

    // Middle complete lines (parts[1] through parts[parts.length - 2])
    for (let i = 1; i < parts.length - 1; i++) {
      this.appendLine(sessionName, parts[i], false);
    }

    // Last fragment becomes the new live line (even if empty — represents cursor)
    const lastPart = parts[parts.length - 1];
    const newLiveLine: OutputLine = {
      sessionName,
      text: lastPart,
      timestamp: new Date(),
      isError: false,
      isLive: true,
    };
    const buf = this.buffers.get(sessionName)!;
    buf.push(newLiveLine);
    this.totalLineCount++;
    this.liveLineIndices.set(sessionName, buf.length - 1);

    // Apply per-session cap (mirrors the else-branch above)
    if (buf.length > this.maxLinesPerSession) {
      buf.shift();
      this.totalLineCount--;
      const currentIdx = this.liveLineIndices.get(sessionName);
      if (currentIdx !== undefined && currentIdx > 0) {
        this.liveLineIndices.set(sessionName, currentIdx - 1);
      } else {
        this.liveLineIndices.delete(sessionName);
      }
    }
    if (this.maxTotalLines !== Infinity) {
      this.evictGlobalLines();
    }

    // onUpdate is already invoked inside appendLine for each middle line;
    // emit one final notification for the new live line.
    this.onUpdate?.();
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
    this.liveLineIndices.delete(sessionName);
  }

  /**
   * Clear all captured output.
   */
  clearAll(): void {
    this.buffers.clear();
    this.totalLineCount = 0;
    this.liveLineIndices.clear();
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

      // Keep liveLineIndices consistent after shift
      const liveIdx = this.liveLineIndices.get(oldestSession);
      if (liveIdx !== undefined) {
        if (liveIdx === 0) {
          // The live line itself was evicted
          this.liveLineIndices.delete(oldestSession);
        } else {
          this.liveLineIndices.set(oldestSession, liveIdx - 1);
        }
      }

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
