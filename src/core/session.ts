import { spawn, ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { SessionState, SessionConfig, SessionInfo, SessionCrashedEvent, SessionMetrics, RestartPolicy } from '../types.js';
import { logger } from '../utils/logger.js';
import { PromptTimeoutError } from '../utils/errors.js';
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import { classifyExitCode } from './restart-policy.js';
import { SandboxManager } from './sandbox.js';

/**
 * Session — represents a conversation with Claude Code.
 *
 * Uses `claude --print` per prompt instead of a persistent interactive process.
 * Conversation continuity is maintained via --session-id / --resume flags.
 * The TUI stays in control at all times.
 */
export class Session extends EventEmitter {
  private state: SessionState = SessionState.Stopped;
  private pid: number = 0;
  private startedAt: Date | null = null;
  private exitCode: number | null = null;
  private claudeSessionId: string;
  private promptCount: number = 0;
  private activeProcess: ChildProcess | null = null;
  private restartPolicy: RestartPolicy;
  private lastPrompt: string | null = null;
  private retryCount: number = 0;
  private responseTimes: number[] = [];
  private totalResponseChars: number = 0;
  private promptStartTime: number = 0;

  constructor(
    private readonly config: SessionConfig,
    private readonly shutdownTimeoutMs: number = 5000,
    initialSessionId?: string,
    initialPromptCount?: number,
    initialRetryCount: number = 0,
    private readonly sandbox?: SandboxManager,
  ) {
    super();
    this.claudeSessionId = initialSessionId ?? crypto.randomUUID();
    this.promptCount = initialPromptCount ?? 0;
    this.retryCount = initialRetryCount;
    this.restartPolicy = config.restartPolicy ?? { enabled: false, maxRetries: 3 };
  }

  async start(): Promise<void> {
    await mkdir(this.config.workingDirectory, { recursive: true });
    this.state = SessionState.Running;
    this.startedAt = new Date();
    this.pid = 0; // Prompt-based sessions have no persistent process
    this.exitCode = null;
  }

  /**
   * Send a prompt to Claude and stream the response.
   *
   * Emits:
   * - 'promptStart' (prompt: string) — when prompt is sent
   * - 'data' (chunk: string) — as response text arrives
   * - 'promptComplete' (response: string) — when response is fully received
   * - 'promptError' (error: Error) — if something goes wrong
   */
  async sendPrompt(prompt: string): Promise<string> {
    if (this.state !== SessionState.Running) {
      throw new Error(`Session "${this.config.name}" is not running`);
    }

    if (this.activeProcess) {
      throw new Error(`Session "${this.config.name}" is already processing a prompt`);
    }

    // Store the prompt for crash recovery
    this.lastPrompt = prompt;

    // Record start time for response-time tracking
    this.promptStartTime = Date.now();

    logger.info(`Sending prompt to session "${this.config.name}"`);
    this.emit('promptStart', prompt);

    const timeoutMs = this.config.promptTimeoutMs ?? 300000;

    return new Promise<string>((resolve, reject) => {
      let settled = false;
      let timedOut = false;
      let timeoutTimer: NodeJS.Timeout | undefined;

      const settle = (): void => {
        settled = true;
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
          timeoutTimer = undefined;
        }
      };

      // Build args: first prompt uses --session-id, subsequent use --resume
      const args = ['--print', '--output-format', 'stream-json', '--verbose'];
      if (this.promptCount === 0) {
        args.push('--session-id', this.claudeSessionId);
      } else {
        args.push('--resume', this.claudeSessionId);
      }

      if (this.config.permissionMode) {
        args.push('--permission-mode', this.config.permissionMode);
      }

      const { cmd, args: spawnArgs } = this.sandbox
        ? this.sandbox.buildSpawnArgs(args)
        : { cmd: 'claude', args };
      const child = spawn(cmd, spawnArgs, {
        cwd: this.config.workingDirectory,
        env: { ...process.env, ...this.config.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.activeProcess = child;
      this.pid = child.pid ?? this.pid;

      let response = '';
      let jsonBuffer = '';

      child.stdout?.on('data', (chunk: Buffer) => {
        jsonBuffer += chunk.toString();

        // Process complete JSON lines (newline-delimited)
        const lines = jsonBuffer.split('\n');
        jsonBuffer = lines.pop() ?? ''; // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const event = JSON.parse(trimmed);
            const text = this.extractText(event);
            if (text) {
              response += text;
              this.emit('data', text);
            }
          } catch {
            // Non-JSON output — emit as-is
            response += trimmed;
            this.emit('data', trimmed);
          }
        }
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        // Stderr output from Claude (warnings, debug info)
        this.emit('stderr', chunk.toString());
      });

      child.on('error', (err: Error) => {
        if (settled) return;
        settle();
        logger.error(`Spawn error for session "${this.config.name}": ${err.message}`);
        this.activeProcess = null;
        this.emit('promptError', err);
        reject(err);
      });

      child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
        // Process any remaining buffered JSON
        if (jsonBuffer.trim()) {
          try {
            const event = JSON.parse(jsonBuffer.trim());
            const text = this.extractText(event);
            if (text) {
              response += text;
              this.emit('data', text);
            }
          } catch {
            // Ignore
          }
        }

        this.activeProcess = null;
        this.promptCount++;

        if (timedOut) {
          settle();
          const err = new PromptTimeoutError(this.config.name, timeoutMs, prompt);
          this.emit('promptTimeout', {
            sessionName: this.config.name,
            timeoutMs,
            promptText: prompt,
            partialResponse: response,
          });
          reject(err);
          return;
        }

        settle();

        if (code === 0) {
          // Success — record metrics and reset retry count
          const elapsedMs = Date.now() - this.promptStartTime;
          this.responseTimes.push(elapsedMs);
          this.totalResponseChars += response.length;
          this.retryCount = 0;
          logger.info(`Prompt completed for session "${this.config.name}"`);
          this.emit('promptComplete', response);
          resolve(response);
        } else {
          // Crash detected — classify exit code and emit crashed event
          const { classification, reason } = classifyExitCode(code, signal);

          logger.error(
            `Prompt failed for session "${this.config.name}" (exit code ${code}, signal ${signal}): ${reason}`,
          );

          const crashedEvent: SessionCrashedEvent = {
            sessionName: this.config.name,
            exitCode: code,
            signal,
            classification,
            reason,
            promptText: this.lastPrompt,
            retryCount: this.retryCount,
          };

          this.emit('crashed', crashedEvent);

          const err = new Error(`Claude exited with code ${code}: ${reason}`);
          this.emit('promptError', err);
          reject(err);
        }
      });

      // Write prompt to stdin and close it
      child.stdin?.write(prompt);
      child.stdin?.end();

      // Set up timeout if enabled (timeoutMs > 0; 0 means no timeout)
      if (timeoutMs > 0) {
        timeoutTimer = setTimeout(() => {
          if (settled) return;
          timedOut = true;
          logger.warn(`Prompt timed out after ${timeoutMs}ms in session "${this.config.name}"`);
          try {
            child.kill('SIGTERM');
          } catch {
            // Already dead
          }
          // Grace period: SIGKILL if child doesn't exit
          const graceMs = this.shutdownTimeoutMs;
          let graceTimer: NodeJS.Timeout | undefined = setTimeout(() => {
            graceTimer = undefined;
            if (this.activeProcess === child) {
              try {
                child.kill('SIGKILL');
              } catch {
                // Already dead
              }
            }
          }, graceMs);

          // Clear grace timer if child exits promptly after SIGTERM
          child.once('close', () => {
            if (graceTimer) {
              clearTimeout(graceTimer);
              graceTimer = undefined;
            }
          });
        }, timeoutMs);
      }
    });
  }

  /**
   * Extract displayable text from a stream-json event.
   *
   * Stream-json events include:
   * - { type: "assistant", message: { content: [{ type: "text", text: "..." }] } }
   * - { type: "content_block_delta", delta: { type: "text_delta", text: "..." } }
   * - { type: "result", result: "..." }
   * - { type: "system" } — init metadata, ignored
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractText(event: any): string | null {
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
        // Final result — only use if we haven't already captured content
        return null; // Content already captured via assistant/delta events
      }
      default:
        return null;
    }
  }

  /**
   * Check if a prompt is currently being processed.
   */
  isProcessing(): boolean {
    return this.activeProcess !== null;
  }

  async stop(): Promise<void> {
    if (this.state === SessionState.Stopped) {
      return;
    }

    this.state = SessionState.Stopped;

    // Kill active process if any
    if (this.activeProcess) {
      try {
        this.activeProcess.kill('SIGTERM');
        // Give it a moment, then force kill
        setTimeout(() => {
          if (this.activeProcess) {
            try { this.activeProcess.kill('SIGKILL'); } catch { /* already dead */ }
          }
        }, this.shutdownTimeoutMs);
      } catch {
        // Already dead
      }
      this.activeProcess = null;
    }

    await this.sandbox?.stop();
  }

  getState(): SessionState {
    return this.state;
  }

  getInfo(): SessionInfo {
    return {
      name: this.config.name,
      pid: this.pid,
      state: this.state,
      startedAt: this.startedAt,
      workingDirectory: this.config.workingDirectory,
      exitCode: this.exitCode,
      promptCount: this.promptCount,
      permissionMode: this.config.permissionMode,
      tags: this.config.tags,
      sandboxed: this.sandbox !== undefined,
      sandboxBackend: this.sandbox?.getBackend(),
      sandboxLevel: this.sandbox?.getLevel(),
    };
  }

  getMetrics(): SessionMetrics {
    const avgResponseTimeMs =
      this.responseTimes.length > 0
        ? this.responseTimes.reduce((sum, t) => sum + t, 0) / this.responseTimes.length
        : 0;

    const uptimeMs = this.startedAt ? Date.now() - this.startedAt.getTime() : 0;

    return {
      promptCount: this.promptCount,
      avgResponseTimeMs,
      totalResponseChars: this.totalResponseChars,
      estimatedTokens: Math.round(this.totalResponseChars / 4),
      uptimeMs,
    };
  }

  getSessionId(): string {
    return this.claudeSessionId;
  }

  getExitCode(): number | null {
    return this.exitCode;
  }

  getRetryCount(): number {
    return this.retryCount;
  }

  getLastPrompt(): string | null {
    return this.lastPrompt;
  }

  getConfig(): SessionConfig {
    return this.config;
  }

  getRestartPolicy(): RestartPolicy {
    return this.restartPolicy;
  }

  incrementRetryCount(): void {
    this.retryCount++;
  }

  resetRetryCount(): void {
    this.retryCount = 0;
  }

  // Legacy compatibility — not used in prompt mode
  getHandle(): null {
    return null;
  }
}
