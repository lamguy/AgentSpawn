import { Session } from '../core/session.js';
import { SessionHandle, RouterOptions } from '../types.js';
import { formatSessionOutput } from './formatter.js';

export class Router {
  private activeSessionName: string | undefined;
  private activeSession: Session | null = null;
  private attachedHandle: SessionHandle | null = null;
  private stdinHandler: ((data: Buffer) => void) | null = null;
  private stdoutHandler: ((data: Buffer) => void) | null = null;
  private stderrHandler: ((data: Buffer) => void) | null = null;
  private exitHandler: (() => void) | null = null;

  constructor(private readonly options?: RouterOptions) {}

  attach(session: Session): void {
    const handle = session.getHandle();
    if (!handle) {
      throw new Error(
        'Cannot attach to session: session handle is null (session may not be running)',
      );
    }

    this.activeSession = session;
    this.attachedHandle = handle;
    this.activeSessionName = session.getInfo().name;

    const name = this.activeSessionName;

    // stdin: forward process.stdin data to session stdin with error handling
    this.stdinHandler = (data: Buffer) => {
      // Skip if session is detached (race condition guard)
      if (!this.attachedHandle || this.attachedHandle !== handle) {
        return;
      }

      // Verify stdin is still writable
      if (handle.stdin.destroyed || handle.stdin.writableEnded) {
        process.stderr.write(`Session "${name}" stdin closed, detaching.\n`);
        this.detach();
        return;
      }

      try {
        const canWrite = handle.stdin.write(data);

        // Handle backpressure - pause process.stdin until session stdin drains
        if (!canWrite) {
          process.stdin.pause();
          handle.stdin.once('drain', () => {
            if (this.attachedHandle === handle && process.stdin.readable) {
              process.stdin.resume();
            }
          });
        }
      } catch (err) {
        // Stdin pipe broken - detach gracefully
        process.stderr.write(`Session "${name}" stdin error: ${err}, detaching.\n`);
        this.detach();
      }
    };
    process.stdin.on('data', this.stdinHandler);

    // stdout: forward session stdout to process.stdout
    this.stdoutHandler = (data: Buffer) => {
      if (this.options?.prefixOutput) {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (line.length > 0) {
            process.stdout.write(formatSessionOutput(name, line) + '\n');
          }
        }
      } else {
        process.stdout.write(data);
      }
    };
    handle.stdout.on('data', this.stdoutHandler);

    // stderr: forward session stderr to process.stderr
    this.stderrHandler = (data: Buffer) => {
      if (this.options?.prefixOutput) {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (line.length > 0) {
            process.stderr.write(formatSessionOutput(name, line) + '\n');
          }
        }
      } else {
        process.stderr.write(data);
      }
    };
    handle.stderr.on('data', this.stderrHandler);

    // exit: auto-detach on session child process exit
    this.exitHandler = () => {
      process.stderr.write(`Session "${name}" exited.\n`);
      this.detach();
    };
    handle.childProcess.on('exit', this.exitHandler);

    // If stdin is a TTY, enable raw mode so keystrokes are forwarded immediately
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
    } else {
      // For non-TTY stdin (pipes, redirects), ensure it's readable
      process.stdin.resume();
    }
  }

  detach(): void {
    const handle = this.attachedHandle;

    // Immediately clear attachedHandle to prevent race conditions
    // (new stdin data arriving during cleanup)
    this.attachedHandle = null;

    // Remove stdin listener from process.stdin
    if (this.stdinHandler) {
      process.stdin.removeListener('data', this.stdinHandler);
      this.stdinHandler = null;
    }

    // Remove stdout listener from session
    if (handle && this.stdoutHandler) {
      handle.stdout.removeListener('data', this.stdoutHandler);
      this.stdoutHandler = null;
    }

    // Remove stderr listener from session
    if (handle && this.stderrHandler) {
      handle.stderr.removeListener('data', this.stderrHandler);
      this.stderrHandler = null;
    }

    // Remove exit listener from session child process
    if (handle && this.exitHandler) {
      handle.childProcess.removeListener('exit', this.exitHandler);
      this.exitHandler = null;
    }

    // Restore TTY state
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    } else {
      // For non-TTY stdin, pause to stop reading
      process.stdin.pause();
    }

    // Remove any drain listeners we may have added during backpressure handling
    if (handle && handle.stdin) {
      handle.stdin.removeAllListeners('drain');
    }

    // Clear remaining references
    this.activeSession = null;
    this.activeSessionName = undefined;
  }

  getActiveSession(): string | undefined {
    return this.activeSessionName;
  }
}
