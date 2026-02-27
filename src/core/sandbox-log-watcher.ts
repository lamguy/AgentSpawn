import { spawn, ChildProcess } from 'node:child_process';

export interface SandboxLogEntry {
  timestamp: string;   // ISO-8601 preserving timezone offset
  processName: string; // e.g. "claude"
  pid: number;
  operation: string;   // e.g. "deny(1)"
  path: string;        // resource targeted by denied op
  raw: string;         // original unmodified log line
}

export interface SandboxLogWatcherOptions {
  pid?: number;      // filter to this PID; if absent or 0, no filter
  past?: string;     // "5m", "1h" etc → historical mode via log show --last
  spawnFn?: typeof spawn; // injectable for testing; defaults to node:child_process spawn
}

export class SandboxLogWatcher {
  private readonly pid: number;
  private readonly past: string;
  private readonly spawnFn: typeof spawn;
  private child: ChildProcess | null = null;

  constructor(options: SandboxLogWatcherOptions) {
    this.pid = options.pid ?? 0;
    this.past = options.past ?? '';
    this.spawnFn = options.spawnFn ?? spawn;
  }

  static isPlatformSupported(): boolean {
    return process.platform === 'darwin';
  }

  start(): ChildProcess {
    if (!SandboxLogWatcher.isPlatformSupported()) {
      throw new Error('SandboxLogWatcher is only supported on macOS (darwin)');
    }

    if (this.child !== null) {
      this.stop();
    }

    const predicate = this.buildPredicate();
    const args = this.buildArgs(predicate);

    const child = this.spawnFn('log', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.child = child;

    child.on('error', (_err: Error) => {
      // Spawning failed (e.g. 'log' binary not found).
      // Caller can detect this via the 'close' event with a non-zero exit code.
    });

    return child;
  }

  stop(): void {
    if (this.child === null) {
      return;
    }

    try {
      this.child.kill('SIGTERM');
    } catch {
      // Process may already be dead; safe to ignore
    }

    this.child = null;
  }

  parseLine(line: string): SandboxLogEntry | null {
    if (!line.includes('(Sandbox)')) {
      return null;
    }

    try {
      return this.parseLineInternal(line);
    } catch {
      return null;
    }
  }

  private buildPredicate(): string {
    const base = 'subsystem == "com.apple.sandbox"';
    if (this.pid > 0) {
      return `${base} AND processID == ${this.pid}`;
    }
    return base;
  }

  private buildArgs(predicate: string): string[] {
    const trimmedPast = this.past.trim();
    if (trimmedPast.length > 0) {
      return ['show', '--style', 'syslog', '--predicate', predicate, '--last', trimmedPast];
    }
    return ['stream', '--style', 'syslog', '--predicate', predicate, '--level', 'debug'];
  }

  private parseLineInternal(line: string): SandboxLogEntry | null {
    // Split on `: (Sandbox)` to isolate the left side (contains timestamp + process name)
    // and the right side (contains operation and path).
    const sandboxMarker = ': (Sandbox) ';
    const markerIndex = line.indexOf(sandboxMarker);
    if (markerIndex === -1) {
      return null;
    }

    const leftPart = line.slice(0, markerIndex);
    const rightPart = line.slice(markerIndex + sandboxMarker.length);

    // Parse the right side: first token is the operation, rest is the path.
    const rightTokens = rightPart.trim().split(/\s+/);
    if (rightTokens.length < 2) {
      return null;
    }
    const operation = rightTokens[0];
    const path = rightTokens.slice(1).join(' ');

    // Extract process name: the leftPart ends with `processName`, preceded by spaces/fields.
    // Find the last token of leftPart as the process name.
    const leftTokens = leftPart.trim().split(/\s+/);
    if (leftTokens.length < 2) {
      return null;
    }
    const processName = leftTokens[leftTokens.length - 1];

    // Parse the timestamp from the first two space-separated tokens of the full line.
    // Format: "2026-02-26 18:52:28.123456-0700"
    // Convert to ISO-8601: replace space with 'T', fix timezone "-0700" → "-07:00"
    const lineTokens = line.trim().split(/\s+/);
    if (lineTokens.length < 2) {
      return null;
    }

    const rawDate = lineTokens[0];
    const rawTime = lineTokens[1];
    const rawDatetime = `${rawDate} ${rawTime}`;
    const timestamp = convertToIso8601(rawDatetime);
    if (timestamp === null) {
      return null;
    }

    // Find the PID: scan tokens for two consecutive numeric values; the first is PID.
    // The syslog format has: ... 0x<activity>  <PID>  <TTL>  processName: ...
    // PID and TTL appear as consecutive plain integers (not 0x-prefixed).
    const pid = extractPid(lineTokens);
    if (pid === null) {
      return null;
    }

    return {
      timestamp,
      processName,
      pid,
      operation,
      path,
      raw: line,
    };
  }
}

/**
 * Converts a syslog-style datetime string to ISO-8601.
 * Input:  "2026-02-26 18:52:28.123456-0700"
 * Output: "2026-02-26T18:52:28.123456-07:00"
 *
 * Returns null if the string doesn't match the expected format.
 */
function convertToIso8601(rawDatetime: string): string | null {
  // Replace the space between date and time with 'T'
  const withT = rawDatetime.replace(' ', 'T');

  // Insert colon into timezone offset: -0700 → -07:00 (or +0530 → +05:30)
  // Timezone offset is at the end: ±HHMM
  const tzMatch = withT.match(/^(.+)([+-])(\d{2})(\d{2})$/);
  if (!tzMatch) {
    return null;
  }

  const [, datetimePart, sign, hours, minutes] = tzMatch;
  return `${datetimePart}${sign}${hours}:${minutes}`;
}

/**
 * Scans an array of syslog line tokens and finds two consecutive plain
 * integers (not 0x-prefixed), returning the first as the PID.
 *
 * The macOS syslog format places PID and TTL as the two consecutive
 * plain-integer fields after the activity ID (0x...) columns.
 *
 * Returns null if no such pair is found.
 */
function extractPid(tokens: string[]): number | null {
  const plainInt = /^\d+$/;

  for (let i = 0; i < tokens.length - 1; i++) {
    if (plainInt.test(tokens[i]) && plainInt.test(tokens[i + 1])) {
      const pid = parseInt(tokens[i], 10);
      if (!isNaN(pid) && pid > 0) {
        return pid;
      }
    }
  }

  return null;
}
