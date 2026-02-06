import * as pty from '@homebridge/node-pty-prebuilt-multiarch';
import { SessionState, SessionConfig, SessionInfo, SessionHandle } from '../types.js';
import { SpawnFailedError } from '../utils/errors.js';
import { Writable, Readable, PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';

// Wrapper to make PTY compatible with ChildProcess interface
class PtyChildProcessWrapper extends EventEmitter {
  readonly pid: number;
  readonly stdin: Writable;
  readonly stdout: Readable;
  readonly stderr: Readable;
  killed = false;

  constructor(private readonly ptyProcess: pty.IPty) {
    super();
    this.pid = ptyProcess.pid;

    // Create a writable stream that forwards to PTY
    this.stdin = new Writable({
      write: (chunk: Buffer | string, encoding: BufferEncoding, callback: (error?: Error | null) => void) => {
        try {
          const data = chunk.toString();
          ptyProcess.write(data);
          callback();
        } catch (err) {
          callback(err as Error);
        }
      },
    });

    // Create a readable stream for output (PTY merges stdout/stderr)
    this.stdout = new PassThrough();

    // Create an empty stderr stream (PTY merges stderr into stdout)
    this.stderr = new PassThrough();

    // Forward PTY data to stdout
    ptyProcess.onData((data: string) => {
      (this.stdout as PassThrough).write(data);
    });

    // Forward PTY exit to this wrapper
    ptyProcess.onExit((event: { exitCode: number; signal?: number }) => {
      this.emit('exit', event.exitCode, event.signal);
    });
  }

  kill(signal?: NodeJS.Signals | number): boolean {
    try {
      if (typeof signal === 'string') {
        // Map signal names to signal strings for node-pty
        this.ptyProcess.kill(signal);
      } else if (typeof signal === 'number') {
        // Map signal numbers to signal names for node-pty
        const signalMap: Record<number, string> = {
          15: 'SIGTERM',
          9: 'SIGKILL',
          2: 'SIGINT',
          1: 'SIGHUP',
        };
        this.ptyProcess.kill(signalMap[signal] ?? 'SIGTERM');
      } else {
        this.ptyProcess.kill();
      }
      this.killed = true;
      return true;
    } catch {
      return false;
    }
  }
}

export class Session {
  private state: SessionState = SessionState.Stopped;
  private pid: number = 0;
  private startedAt: Date | null = null;
  private childProcess: PtyChildProcessWrapper | null = null;
  private ptyProcess: pty.IPty | null = null;
  private exitCode: number | null = null;

  constructor(
    private readonly config: SessionConfig,
    private readonly shutdownTimeoutMs: number = 5000,
  ) {}

  async start(): Promise<void> {
    // Spawn Claude Code with a pseudo-TTY so it detects an interactive terminal
    // Claude Code runs in full interactive mode with its own TUI
    // This allows the user to see Claude's prompt interface and interact naturally
    const ptyProcess = pty.spawn('claude', [], {
      cwd: this.config.workingDirectory,
      env: { ...process.env, ...this.config.env },
      // Default PTY dimensions
      cols: process.stdout.columns || 80,
      rows: process.stdout.rows || 24,
    });

    if (ptyProcess.pid === undefined) {
      throw new SpawnFailedError(this.config.name, 'process pid is undefined');
    }

    // Wrap PTY in a ChildProcess-compatible interface
    const childProcess = new PtyChildProcessWrapper(ptyProcess);

    this.ptyProcess = ptyProcess;
    this.childProcess = childProcess;
    this.pid = ptyProcess.pid;
    this.state = SessionState.Running;
    this.startedAt = new Date();
    this.exitCode = null;

    childProcess.on('exit', (code) => {
      if (this.state === SessionState.Running) {
        this.state = SessionState.Crashed;
        this.exitCode = code ?? null;
      }
    });

    // PTY doesn't emit 'error' events, but we'll keep this for consistency
    childProcess.on('error', () => {
      if (this.state === SessionState.Running) {
        this.state = SessionState.Crashed;
      }
    });
  }

  async stop(): Promise<void> {
    if (!this.childProcess || this.state === SessionState.Stopped) {
      return;
    }

    this.state = SessionState.Stopped;

    const child = this.childProcess;

    // If the process already exited, clean up immediately to avoid deadlock
    const alreadyDead =
      child.killed ||
      (() => {
        try {
          process.kill(child.pid, 0);
          return false;
        } catch {
          return true;
        }
      })();

    if (alreadyDead) {
      this.childProcess = null;
      this.ptyProcess = null;
      return;
    }

    await new Promise<void>((resolve) => {
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(gracefulTimeout);
          clearTimeout(finalTimeout);
          resolve();
        }
      };

      // After graceful timeout, escalate to SIGKILL
      const gracefulTimeout = setTimeout(() => {
        child.kill('SIGKILL');
      }, this.shutdownTimeoutMs);

      // Unconditional final timeout after SIGKILL to prevent infinite hang
      const finalTimeout = setTimeout(() => {
        done();
      }, this.shutdownTimeoutMs + 3000);

      child.on('exit', (code) => {
        this.exitCode = code ?? null;
        done();
      });

      child.kill('SIGTERM');
    });

    this.childProcess = null;
    this.ptyProcess = null;
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
    };
  }

  getHandle(): SessionHandle | null {
    if (this.state !== SessionState.Running || !this.childProcess) {
      return null;
    }

    if (!this.childProcess.stdin || !this.childProcess.stdout || !this.childProcess.stderr) {
      return null;
    }

    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      childProcess: this.childProcess as any,
      stdin: this.childProcess.stdin,
      stdout: this.childProcess.stdout,
      stderr: this.childProcess.stderr,
    };
  }

  getExitCode(): number | null {
    return this.exitCode;
  }
}
