import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { ChildProcess } from 'node:child_process';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SandboxLogWatcher } from './sandbox-log-watcher.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockChild(): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  (child as unknown as { stdout: PassThrough }).stdout = new PassThrough();
  (child as unknown as { stderr: PassThrough }).stderr = new PassThrough();
  (child as unknown as { kill: (signal?: string) => boolean }).kill = vi
    .fn()
    .mockReturnValue(true);
  (child as unknown as { pid: number }).pid = 9999;
  return child;
}

// Sample syslog-style sandbox violation line matching macOS `log stream` output.
const VIOLATION_LINE =
  '2026-02-26 18:52:28.123456-0700  0x1a2b3c   Default     0x0          1234  0    claude: (Sandbox) deny(1) file-write-create /etc/hosts';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SandboxLogWatcher', () => {
  // -------------------------------------------------------------------------
  // Global platform stub — ensures all start() calls behave as if running on
  // macOS.  The nested 'throws on non-darwin' block overrides this with its
  // own beforeEach that sets platform to 'linux'.
  // -------------------------------------------------------------------------
  let originalPlatform: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
  });

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  // -------------------------------------------------------------------------
  // isPlatformSupported()
  // -------------------------------------------------------------------------

  describe('isPlatformSupported()', () => {
    let originalPlatform: PropertyDescriptor | undefined;

    beforeEach(() => {
      originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    });

    afterEach(() => {
      if (originalPlatform !== undefined) {
        Object.defineProperty(process, 'platform', originalPlatform);
      }
    });

    it('should return true when process.platform is darwin', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
        writable: false,
      });

      expect(SandboxLogWatcher.isPlatformSupported()).toBe(true);
    });

    it('should return false when process.platform is linux', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
        writable: false,
      });

      expect(SandboxLogWatcher.isPlatformSupported()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // start() — streaming mode (no past)
  // -------------------------------------------------------------------------

  describe('start() — streaming mode (no past)', () => {
    let mockChild: ChildProcess;
    let spawnFn: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockChild = makeMockChild();
      spawnFn = vi.fn().mockReturnValue(mockChild);
    });

    it('should call spawnFn with "log" as the command', () => {
      const watcher = new SandboxLogWatcher({ spawnFn });
      watcher.start();

      expect(spawnFn).toHaveBeenCalledTimes(1);
      expect(spawnFn.mock.calls[0][0]).toBe('log');
    });

    it('should include "stream" in the args array', () => {
      const watcher = new SandboxLogWatcher({ spawnFn });
      watcher.start();

      const args: string[] = spawnFn.mock.calls[0][1];
      expect(args).toContain('stream');
    });

    it('should include "--predicate" in the args array', () => {
      const watcher = new SandboxLogWatcher({ spawnFn });
      watcher.start();

      const args: string[] = spawnFn.mock.calls[0][1];
      expect(args).toContain('--predicate');
    });

    it('should include "com.apple.sandbox" in the predicate argument', () => {
      const watcher = new SandboxLogWatcher({ spawnFn });
      watcher.start();

      const args: string[] = spawnFn.mock.calls[0][1];
      const predicateIndex = args.indexOf('--predicate');
      expect(predicateIndex).toBeGreaterThan(-1);
      const predicate = args[predicateIndex + 1];
      expect(predicate).toContain('com.apple.sandbox');
    });

    it('should include "--level" followed by "debug" in the args array', () => {
      const watcher = new SandboxLogWatcher({ spawnFn });
      watcher.start();

      const args: string[] = spawnFn.mock.calls[0][1];
      const levelIndex = args.indexOf('--level');
      expect(levelIndex).toBeGreaterThan(-1);
      expect(args[levelIndex + 1]).toBe('debug');
    });

    it('should NOT include "show" in the args array', () => {
      const watcher = new SandboxLogWatcher({ spawnFn });
      watcher.start();

      const args: string[] = spawnFn.mock.calls[0][1];
      expect(args).not.toContain('show');
    });

    it('should NOT include "--last" in the args array', () => {
      const watcher = new SandboxLogWatcher({ spawnFn });
      watcher.start();

      const args: string[] = spawnFn.mock.calls[0][1];
      expect(args).not.toContain('--last');
    });

    it('should return the child process returned by spawnFn', () => {
      const watcher = new SandboxLogWatcher({ spawnFn });
      const child = watcher.start();

      expect(child).toBe(mockChild);
    });
  });

  // -------------------------------------------------------------------------
  // start() — with pid filter
  // -------------------------------------------------------------------------

  describe('start() — pid filter', () => {
    let mockChild: ChildProcess;
    let spawnFn: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockChild = makeMockChild();
      spawnFn = vi.fn().mockReturnValue(mockChild);
    });

    it('should include "processID == 1234" in the predicate when pid is 1234', () => {
      const watcher = new SandboxLogWatcher({ pid: 1234, spawnFn });
      watcher.start();

      const args: string[] = spawnFn.mock.calls[0][1];
      const predicateIndex = args.indexOf('--predicate');
      const predicate = args[predicateIndex + 1];
      expect(predicate).toContain('processID == 1234');
    });

    it('should NOT include "processID" in the predicate when no pid is passed', () => {
      const watcher = new SandboxLogWatcher({ spawnFn });
      watcher.start();

      const args: string[] = spawnFn.mock.calls[0][1];
      const predicateIndex = args.indexOf('--predicate');
      const predicate = args[predicateIndex + 1];
      expect(predicate).not.toContain('processID');
    });

    it('should NOT include "processID" in the predicate when pid is 0', () => {
      const watcher = new SandboxLogWatcher({ pid: 0, spawnFn });
      watcher.start();

      const args: string[] = spawnFn.mock.calls[0][1];
      const predicateIndex = args.indexOf('--predicate');
      const predicate = args[predicateIndex + 1];
      expect(predicate).not.toContain('processID');
    });
  });

  // -------------------------------------------------------------------------
  // start() — historical mode (past provided)
  // -------------------------------------------------------------------------

  describe('start() — historical mode (past provided)', () => {
    let mockChild: ChildProcess;
    let spawnFn: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockChild = makeMockChild();
      spawnFn = vi.fn().mockReturnValue(mockChild);
    });

    it('should include "show" in the args array when past is "5m"', () => {
      const watcher = new SandboxLogWatcher({ past: '5m', spawnFn });
      watcher.start();

      const args: string[] = spawnFn.mock.calls[0][1];
      expect(args).toContain('show');
    });

    it('should include "--last" followed by "5m" when past is "5m"', () => {
      const watcher = new SandboxLogWatcher({ past: '5m', spawnFn });
      watcher.start();

      const args: string[] = spawnFn.mock.calls[0][1];
      const lastIndex = args.indexOf('--last');
      expect(lastIndex).toBeGreaterThan(-1);
      expect(args[lastIndex + 1]).toBe('5m');
    });

    it('should NOT include "stream" in the args array when past is provided', () => {
      const watcher = new SandboxLogWatcher({ past: '5m', spawnFn });
      watcher.start();

      const args: string[] = spawnFn.mock.calls[0][1];
      expect(args).not.toContain('stream');
    });

    it('should NOT include "--level" in the args array when past is provided', () => {
      const watcher = new SandboxLogWatcher({ past: '5m', spawnFn });
      watcher.start();

      const args: string[] = spawnFn.mock.calls[0][1];
      expect(args).not.toContain('--level');
    });

    it('should still include "--predicate" with "com.apple.sandbox" in historical mode', () => {
      const watcher = new SandboxLogWatcher({ past: '1h', spawnFn });
      watcher.start();

      const args: string[] = spawnFn.mock.calls[0][1];
      const predicateIndex = args.indexOf('--predicate');
      expect(predicateIndex).toBeGreaterThan(-1);
      const predicate = args[predicateIndex + 1];
      expect(predicate).toContain('com.apple.sandbox');
    });
  });

  // -------------------------------------------------------------------------
  // start() — throws on non-darwin
  // -------------------------------------------------------------------------

  describe('start() — throws on non-darwin', () => {
    let originalPlatform: PropertyDescriptor | undefined;

    beforeEach(() => {
      originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    });

    afterEach(() => {
      if (originalPlatform !== undefined) {
        Object.defineProperty(process, 'platform', originalPlatform);
      }
    });

    it('should throw when process.platform is linux', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
        writable: false,
      });

      const spawnFn = vi.fn();
      const watcher = new SandboxLogWatcher({ spawnFn });

      expect(() => watcher.start()).toThrow();
    });

    it('should not call spawnFn when platform is not darwin', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
        writable: false,
      });

      const spawnFn = vi.fn();
      const watcher = new SandboxLogWatcher({ spawnFn });

      try {
        watcher.start();
      } catch {
        // expected
      }

      expect(spawnFn).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // stop()
  // -------------------------------------------------------------------------

  describe('stop()', () => {
    it('should call kill("SIGTERM") on the child process after start()', () => {
      const mockChild = makeMockChild();
      const spawnFn = vi.fn().mockReturnValue(mockChild);
      const watcher = new SandboxLogWatcher({ spawnFn });

      watcher.start();
      watcher.stop();

      const killFn = (mockChild as unknown as { kill: ReturnType<typeof vi.fn> }).kill;
      expect(killFn).toHaveBeenCalledWith('SIGTERM');
    });

    it('should not throw when stop() is called before start()', () => {
      const watcher = new SandboxLogWatcher({});

      expect(() => watcher.stop()).not.toThrow();
    });

    it('should not call kill if no child process was started', () => {
      const mockChild = makeMockChild();
      const spawnFn = vi.fn().mockReturnValue(mockChild);
      // Intentionally do NOT call start()
      const watcher = new SandboxLogWatcher({ spawnFn });

      watcher.stop();

      const killFn = (mockChild as unknown as { kill: ReturnType<typeof vi.fn> }).kill;
      expect(killFn).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // parseLine() — valid violation line
  // -------------------------------------------------------------------------

  describe('parseLine() — valid violation line', () => {
    let watcher: SandboxLogWatcher;

    beforeEach(() => {
      watcher = new SandboxLogWatcher({});
    });

    it('should return a non-null entry for a valid sandbox violation line', () => {
      const entry = watcher.parseLine(VIOLATION_LINE);
      expect(entry).not.toBeNull();
    });

    it('should set processName to "claude"', () => {
      const entry = watcher.parseLine(VIOLATION_LINE);
      expect(entry!.processName).toBe('claude');
    });

    it('should set pid to 1234', () => {
      const entry = watcher.parseLine(VIOLATION_LINE);
      expect(entry!.pid).toBe(1234);
    });

    it('should set operation to "deny(1)"', () => {
      const entry = watcher.parseLine(VIOLATION_LINE);
      expect(entry!.operation).toBe('deny(1)');
    });

    it('should set path to "file-write-create /etc/hosts"', () => {
      // The right side of `: (Sandbox) ` is "deny(1) file-write-create /etc/hosts"
      // operation = first token = "deny(1)"
      // path = remaining tokens joined with space = "file-write-create /etc/hosts"
      const entry = watcher.parseLine(VIOLATION_LINE);
      expect(entry!.path).toBe('file-write-create /etc/hosts');
    });

    it('should set timestamp containing "2026-02-26"', () => {
      const entry = watcher.parseLine(VIOLATION_LINE);
      expect(entry!.timestamp).toContain('2026-02-26');
    });

    it('should produce an ISO-8601 timestamp with "T" separator', () => {
      const entry = watcher.parseLine(VIOLATION_LINE);
      expect(entry!.timestamp).toContain('T');
    });

    it('should convert timezone offset "-0700" to "-07:00" in the timestamp', () => {
      const entry = watcher.parseLine(VIOLATION_LINE);
      expect(entry!.timestamp).toContain('-07:00');
      expect(entry!.timestamp).not.toContain('-0700');
    });

    it('should set raw to the original unmodified input line', () => {
      const entry = watcher.parseLine(VIOLATION_LINE);
      expect(entry!.raw).toBe(VIOLATION_LINE);
    });
  });

  // -------------------------------------------------------------------------
  // parseLine() — non-violation lines return null
  // -------------------------------------------------------------------------

  describe('parseLine() — non-violation lines return null', () => {
    let watcher: SandboxLogWatcher;

    beforeEach(() => {
      watcher = new SandboxLogWatcher({});
    });

    it('should return null for a normal log line without "(Sandbox)"', () => {
      const normalLine =
        '2026-02-26 18:52:28.123456-0700  0x1a2b3c   Default     0x0          1234  0    claude: some regular log message';
      const entry = watcher.parseLine(normalLine);
      expect(entry).toBeNull();
    });

    it('should return null for an empty string', () => {
      const entry = watcher.parseLine('');
      expect(entry).toBeNull();
    });

    it('should return null for a whitespace-only string', () => {
      const entry = watcher.parseLine('   ');
      expect(entry).toBeNull();
    });

    it('should return null for a line containing "(Sandbox)" but missing the operation and path tokens', () => {
      // Has the marker but right side has fewer than 2 tokens
      const incompleteLine =
        '2026-02-26 18:52:28.123456-0700  0x1a2b3c   Default     0x0          1234  0    claude: (Sandbox) deny(1)';
      // Right part trimmed = "deny(1)" — only 1 token, so parseLine returns null
      const entry = watcher.parseLine(incompleteLine);
      expect(entry).toBeNull();
    });

    it('should return null for a line with "(Sandbox)" but an unparseable timestamp', () => {
      // No recognizable timezone offset at the end of the timestamp
      const badTimestampLine =
        'BADDATE BADTIME  0x1a2b3c   Default     0x0          1234  0    claude: (Sandbox) deny(1) /etc/hosts';
      const entry = watcher.parseLine(badTimestampLine);
      expect(entry).toBeNull();
    });

    it('should return null for a line with "(Sandbox)" but no consecutive plain integer pair for PID', () => {
      // All fields before the process name are hex, so no PID pair can be found
      const noPidLine =
        '2026-02-26 18:52:28.123456-0700  0x1a2b3c   0xabcdef  0x0    claude: (Sandbox) deny(1) /etc/hosts';
      const entry = watcher.parseLine(noPidLine);
      expect(entry).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // start() — second call stops existing child first
  // -------------------------------------------------------------------------

  describe('start() — re-start behavior', () => {
    it('should stop the previous child when start() is called a second time', () => {
      const firstChild = makeMockChild();
      const secondChild = makeMockChild();
      let callCount = 0;
      const spawnFn = vi.fn().mockImplementation(() => {
        callCount += 1;
        return callCount === 1 ? firstChild : secondChild;
      });

      const watcher = new SandboxLogWatcher({ spawnFn });

      watcher.start();
      watcher.start();

      const firstKill = (firstChild as unknown as { kill: ReturnType<typeof vi.fn> }).kill;
      expect(firstKill).toHaveBeenCalledWith('SIGTERM');
      expect(spawnFn).toHaveBeenCalledTimes(2);
    });
  });
});
