import { spawn, ChildProcess } from 'node:child_process';
import { SessionState, SessionConfig, SessionInfo, SessionHandle } from '../types.js';
import { SpawnFailedError } from '../utils/errors.js';

export class Session {
  private state: SessionState = SessionState.Stopped;
  private pid: number = 0;
  private startedAt: Date | null = null;
  private childProcess: ChildProcess | null = null;
  private exitCode: number | null = null;

  constructor(
    private readonly config: SessionConfig,
    private readonly shutdownTimeoutMs: number = 5000,
  ) {}

  async start(): Promise<void> {
    const childProcess = spawn('claude', [], {
      cwd: this.config.workingDirectory,
      env: { ...process.env, ...this.config.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (childProcess.pid === undefined) {
      throw new SpawnFailedError(this.config.name, 'process pid is undefined');
    }

    this.childProcess = childProcess;
    this.pid = childProcess.pid;
    this.state = SessionState.Running;
    this.startedAt = new Date();
    this.exitCode = null;

    childProcess.on('exit', (code) => {
      if (this.state === SessionState.Running) {
        this.state = SessionState.Crashed;
        this.exitCode = code ?? null;
      }
    });

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
          process.kill(child.pid!, 0);
          return false;
        } catch {
          return true;
        }
      })();

    if (alreadyDead) {
      this.childProcess = null;
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
      childProcess: this.childProcess,
      stdin: this.childProcess.stdin,
      stdout: this.childProcess.stdout,
      stderr: this.childProcess.stderr,
    };
  }

  getExitCode(): number | null {
    return this.exitCode;
  }
}
