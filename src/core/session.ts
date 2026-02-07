import { spawn, ChildProcess } from 'node:child_process';
import { SessionState, SessionConfig, SessionInfo } from '../types.js';
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';

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

  constructor(
    private readonly config: SessionConfig,
    private readonly shutdownTimeoutMs: number = 5000,
    initialSessionId?: string,
    initialPromptCount?: number,
  ) {
    super();
    this.claudeSessionId = initialSessionId ?? crypto.randomUUID();
    this.promptCount = initialPromptCount ?? 0;
  }

  async start(): Promise<void> {
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

    this.emit('promptStart', prompt);

    return new Promise<string>((resolve, reject) => {
      // Build args: first prompt uses --session-id, subsequent use --resume
      const args = ['--print', '--output-format', 'text'];
      if (this.promptCount === 0) {
        args.push('--session-id', this.claudeSessionId);
      } else {
        args.push('--resume', this.claudeSessionId);
      }

      const child = spawn('claude', args, {
        cwd: this.config.workingDirectory,
        env: { ...process.env, ...this.config.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.activeProcess = child;
      this.pid = child.pid ?? this.pid;

      let response = '';

      child.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        response += text;
        this.emit('data', text);
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        // Stderr output from Claude (warnings, debug info)
        this.emit('stderr', chunk.toString());
      });

      child.on('error', (err: Error) => {
        this.activeProcess = null;
        this.emit('promptError', err);
        reject(err);
      });

      child.on('close', (code: number | null) => {
        this.activeProcess = null;
        this.promptCount++;

        if (code === 0) {
          this.emit('promptComplete', response);
          resolve(response);
        } else {
          const err = new Error(`Claude exited with code ${code}`);
          this.emit('promptError', err);
          reject(err);
        }
      });

      // Write prompt to stdin and close it
      child.stdin?.write(prompt);
      child.stdin?.end();
    });
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
    };
  }

  getSessionId(): string {
    return this.claudeSessionId;
  }

  getExitCode(): number | null {
    return this.exitCode;
  }

  // Legacy compatibility — not used in prompt mode
  getHandle(): null {
    return null;
  }
}
