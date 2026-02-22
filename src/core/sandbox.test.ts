import { vi, describe, it, expect, beforeEach } from 'vitest';
import { execFile, spawn } from 'node:child_process';
import * as fsPromises from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import os from 'node:os';
import { SandboxManager } from './sandbox.js';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  stat: vi.fn().mockResolvedValue({ isDirectory: () => false, mtime: new Date(0) }),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
}));

vi.mock('node:os', () => ({
  default: {
    platform: vi.fn().mockReturnValue('darwin'),
    homedir: vi.fn().mockReturnValue('/home/user'),
    tmpdir: vi.fn().mockReturnValue('/tmp'),
  },
}));

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------

const mockExecFile = vi.mocked(execFile);
const mockSpawn = vi.mocked(spawn);
const mockWriteFile = vi.mocked(fsPromises.writeFile);
const mockUnlink = vi.mocked(fsPromises.unlink);
const mockReaddir = vi.mocked(fsPromises.readdir);
const mockStat = vi.mocked(fsPromises.stat);
const _mockExistsSync = vi.mocked(existsSync);
const mockOs = vi.mocked(os);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Make execFile call its callback with a successful result. */
function execFileSucceeds(stdout = ''): void {
  mockExecFile.mockImplementation((_file: unknown, _args: unknown, callback: unknown) => {
    (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
      stdout,
      stderr: '',
    });
    return {} as ReturnType<typeof execFile>;
  });
}

/**
 * Build an execFile mock that returns different results per call.
 * Each entry in `responses` controls one sequential execFile invocation.
 *
 * An entry of `Error` means "fail with that error".
 * An entry of `{ stdout: string }` means "succeed with that stdout".
 */
function execFileSequence(
  responses: Array<{ stdout: string } | Error>,
): void {
  let callIndex = 0;
  mockExecFile.mockImplementation((_file: unknown, _args: unknown, callback: unknown) => {
    const response = responses[callIndex++];
    if (response instanceof Error) {
      (callback as (err: Error) => void)(response);
    } else {
      (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
        stdout: (response as { stdout: string }).stdout,
        stderr: '',
      });
    }
    return {} as ReturnType<typeof execFile>;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SandboxManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default os mock values
    mockOs.platform.mockReturnValue('darwin');
    mockOs.homedir.mockReturnValue('/home/user');
    mockOs.tmpdir.mockReturnValue('/tmp');

    // Default spawn mock: simulate a child process that exits with code 0
    mockSpawn.mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown) => {
      const emitter = new EventEmitter();
      setTimeout(() => emitter.emit('close', 0), 0);
      return emitter as unknown as ReturnType<typeof spawn>;
    });
  });

  // -------------------------------------------------------------------------
  // detectBackend()
  // -------------------------------------------------------------------------

  describe('detectBackend()', () => {
    it('should return "docker" when docker info succeeds', async () => {
      execFileSucceeds('Docker version 24.0.0');

      const backend = await SandboxManager.detectBackend();

      expect(backend).toBe('docker');
    });

    it('should return "bwrap" on Linux when docker fails but bwrap is available', async () => {
      mockOs.platform.mockReturnValue('linux');

      execFileSequence([
        new Error('docker: command not found'),   // docker info fails
        { stdout: '/usr/bin/bwrap\n' },           // which bwrap succeeds
      ]);

      const backend = await SandboxManager.detectBackend();

      expect(backend).toBe('bwrap');
    });

    it('should return "sandbox-exec" on macOS when docker fails but sandbox-exec is available', async () => {
      mockOs.platform.mockReturnValue('darwin');

      execFileSequence([
        new Error('Cannot connect to Docker daemon'), // docker info fails
        { stdout: '/usr/bin/sandbox-exec\n' },        // which sandbox-exec succeeds
      ]);

      const backend = await SandboxManager.detectBackend();

      expect(backend).toBe('sandbox-exec');
    });

    it('should return null when no backend is available', async () => {
      mockOs.platform.mockReturnValue('darwin');

      execFileSequence([
        new Error('docker: command not found'),      // docker info fails
        new Error('sandbox-exec: command not found'), // which sandbox-exec fails
      ]);

      const backend = await SandboxManager.detectBackend();

      expect(backend).toBe(null);
    });

    it('should return null on Linux when docker and bwrap are both unavailable', async () => {
      mockOs.platform.mockReturnValue('linux');

      execFileSequence([
        new Error('docker: command not found'), // docker info fails
        new Error('bwrap: command not found'),  // which bwrap fails
      ]);

      const backend = await SandboxManager.detectBackend();

      expect(backend).toBe(null);
    });

    it('should not check for bwrap on macOS when docker fails', async () => {
      mockOs.platform.mockReturnValue('darwin');

      execFileSequence([
        new Error('docker not running'), // docker info fails
        new Error('no sandbox-exec'),    // which sandbox-exec fails
      ]);

      await SandboxManager.detectBackend();

      // Exactly two execFile calls: docker info + which sandbox-exec (not bwrap)
      expect(mockExecFile).toHaveBeenCalledTimes(2);
      const secondCallArgs = mockExecFile.mock.calls[1][1] as string[];
      expect(secondCallArgs).toContain('sandbox-exec');
      expect(secondCallArgs).not.toContain('bwrap');
    });

    it('should not check for sandbox-exec on Linux when docker fails', async () => {
      mockOs.platform.mockReturnValue('linux');

      execFileSequence([
        new Error('docker not running'), // docker info fails
        new Error('no bwrap'),           // which bwrap fails
      ]);

      await SandboxManager.detectBackend();

      const secondCallArgs = mockExecFile.mock.calls[1][1] as string[];
      expect(secondCallArgs).toContain('bwrap');
      expect(secondCallArgs).not.toContain('sandbox-exec');
    });
  });

  // -------------------------------------------------------------------------
  // detectPlatformNativeBackend()
  // -------------------------------------------------------------------------

  describe('detectPlatformNativeBackend()', () => {
    it('should return "bwrap" on Linux when bwrap is available', async () => {
      mockOs.platform.mockReturnValue('linux');
      execFileSucceeds('/usr/bin/bwrap\n');
      const backend = await SandboxManager.detectPlatformNativeBackend();
      expect(backend).toBe('bwrap');
      // Should NOT have called docker info
      expect(mockExecFile.mock.calls[0][1]).toContain('bwrap');
      expect(mockExecFile.mock.calls[0][1]).not.toContain('docker');
    });

    it('should return "sandbox-exec" on macOS when sandbox-exec is available', async () => {
      mockOs.platform.mockReturnValue('darwin');
      execFileSucceeds('/usr/bin/sandbox-exec\n');
      const backend = await SandboxManager.detectPlatformNativeBackend();
      expect(backend).toBe('sandbox-exec');
    });

    it('should return null when platform-native backend is unavailable', async () => {
      mockOs.platform.mockReturnValue('darwin');
      execFileSequence([new Error('not found')]);
      const backend = await SandboxManager.detectPlatformNativeBackend();
      expect(backend).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // start()
  // -------------------------------------------------------------------------

  describe('start()', () => {
    describe('docker backend', () => {
      it('should use --network bridge not --network host', async () => {
        const manager = new SandboxManager('my-session', '/workspace/project', 'docker');

        execFileSequence([
          { stdout: '/usr/local/bin/claude\n' }, // which claude
          { stdout: 'container-id-abc123\n' },   // docker run
        ]);

        await manager.start();

        const dockerRunArgs = mockExecFile.mock.calls[1][1] as string[];
        expect(dockerRunArgs).toContain('--network');
        expect(dockerRunArgs).toContain('bridge');
        expect(dockerRunArgs).not.toContain('host');
      });

      it('should bind-mount the claude binary read-only', async () => {
        const manager = new SandboxManager('my-session', '/workspace/project', 'docker');

        execFileSequence([
          { stdout: '/usr/local/bin/claude\n' },
          { stdout: 'container-id-abc123\n' },
        ]);

        await manager.start();

        const dockerRunArgs = mockExecFile.mock.calls[1][1] as string[];
        expect(dockerRunArgs).toContain('-v');
        expect(dockerRunArgs).toContain('/usr/local/bin/claude:/usr/local/bin/claude:ro');
      });

      it('should bind-mount the working directory read-write', async () => {
        const manager = new SandboxManager('my-session', '/workspace/project', 'docker');

        execFileSequence([
          { stdout: '/usr/local/bin/claude\n' },
          { stdout: 'container-id-abc123\n' },
        ]);

        await manager.start();

        const dockerRunArgs = mockExecFile.mock.calls[1][1] as string[];
        expect(dockerRunArgs).toContain('-v');
        expect(dockerRunArgs).toContain('/workspace/project:/workspace/project:rw');
      });

      it('should name the container agentspawn-<sessionName>', async () => {
        const manager = new SandboxManager('my-session', '/workspace/project', 'docker');

        execFileSequence([
          { stdout: '/usr/local/bin/claude\n' },
          { stdout: 'container-id-abc123\n' },
        ]);

        await manager.start();

        const dockerRunArgs = mockExecFile.mock.calls[1][1] as string[];
        expect(dockerRunArgs).toContain('--name');
        expect(dockerRunArgs).toContain('agentspawn-my-session');
      });

      it('should store the trimmed container ID', async () => {
        const manager = new SandboxManager('my-session', '/workspace/project', 'docker');

        execFileSequence([
          { stdout: '/usr/local/bin/claude\n' },
          { stdout: 'container-id-abc123\n' },
        ]);

        await manager.start();

        // Verify the stored container ID is used in buildSpawnArgs
        const { args } = manager.buildSpawnArgs(['--print']);
        expect(args).toContain('container-id-abc123');
      });

      it('should set the working directory inside the container', async () => {
        const manager = new SandboxManager('my-session', '/workspace/project', 'docker');

        execFileSequence([
          { stdout: '/usr/local/bin/claude\n' },
          { stdout: 'container-id-abc123\n' },
        ]);

        await manager.start();

        const dockerRunArgs = mockExecFile.mock.calls[1][1] as string[];
        expect(dockerRunArgs).toContain('--workdir');
        expect(dockerRunArgs).toContain('/workspace/project');
      });

      it('should bind-mount .claude from homedir read-only', async () => {
        mockOs.homedir.mockReturnValue('/home/user');
        const manager = new SandboxManager('my-session', '/workspace/project', 'docker');

        execFileSequence([
          { stdout: '/usr/local/bin/claude\n' },
          { stdout: 'container-id-abc123\n' },
        ]);

        await manager.start();

        const dockerRunArgs = mockExecFile.mock.calls[1][1] as string[];
        expect(dockerRunArgs).toContain('-v');
        expect(dockerRunArgs).toContain('/home/user/.claude:/root/.claude:ro');
      });

      it('should include --user uid:gid for all levels', async () => {
        const manager = new SandboxManager('my-session', '/workspace/project', 'docker');

        execFileSequence([
          { stdout: '/usr/local/bin/claude\n' },
          { stdout: 'container-id-abc123\n' },
        ]);

        await manager.start();

        const dockerRunArgs = mockExecFile.mock.calls[1][1] as string[];
        expect(dockerRunArgs).toContain('--user');
      });

      it('should include --cap-drop ALL for all levels', async () => {
        const manager = new SandboxManager('my-session', '/workspace/project', 'docker');

        execFileSequence([
          { stdout: '/usr/local/bin/claude\n' },
          { stdout: 'container-id-abc123\n' },
        ]);

        await manager.start();

        const dockerRunArgs = mockExecFile.mock.calls[1][1] as string[];
        expect(dockerRunArgs).toContain('--cap-drop');
        expect(dockerRunArgs).toContain('ALL');
      });

      it('should include --security-opt no-new-privileges for all levels', async () => {
        const manager = new SandboxManager('my-session', '/workspace/project', 'docker');

        execFileSequence([
          { stdout: '/usr/local/bin/claude\n' },
          { stdout: 'container-id-abc123\n' },
        ]);

        await manager.start();

        const dockerRunArgs = mockExecFile.mock.calls[1][1] as string[];
        expect(dockerRunArgs).toContain('--security-opt');
        expect(dockerRunArgs).toContain('no-new-privileges');
      });

      describe('isolation levels', () => {
        it('should include --network bridge (not host) for all levels', async () => {
          const manager = new SandboxManager('s', '/w', 'docker', { level: 'standard' });
          execFileSequence([{ stdout: '/usr/local/bin/claude\n' }, { stdout: 'cid\n' }]);
          await manager.start();
          const args = mockExecFile.mock.calls[1][1] as string[];
          expect(args).toContain('bridge');
          expect(args).not.toContain('host');
        });

        it('should include memory and cpu limits for standard level', async () => {
          const manager = new SandboxManager('s', '/w', 'docker', { level: 'standard' });
          execFileSequence([{ stdout: '/usr/local/bin/claude\n' }, { stdout: 'cid\n' }]);
          await manager.start();
          const args = mockExecFile.mock.calls[1][1] as string[];
          expect(args).toContain('--memory');
          expect(args).toContain('512m'); // default
          expect(args).toContain('--cpus');
          expect(args).toContain('1');
        });

        it('should use custom memoryLimit when provided', async () => {
          const manager = new SandboxManager('s', '/w', 'docker', { level: 'standard', memoryLimit: '1g' });
          execFileSequence([{ stdout: '/usr/local/bin/claude\n' }, { stdout: 'cid\n' }]);
          await manager.start();
          const args = mockExecFile.mock.calls[1][1] as string[];
          expect(args).toContain('1g');
        });

        it('should include --read-only and --tmpfs for strict level', async () => {
          const manager = new SandboxManager('s', '/w', 'docker', { level: 'strict' });
          execFileSequence([{ stdout: '/usr/local/bin/claude\n' }, { stdout: 'cid\n' }]);
          await manager.start();
          const args = mockExecFile.mock.calls[1][1] as string[];
          expect(args).toContain('--read-only');
          expect(args).toContain('--tmpfs');
        });

        it('should use custom image when provided', async () => {
          const manager = new SandboxManager('s', '/w', 'docker', { image: 'my-image:latest' });
          execFileSequence([{ stdout: '/usr/local/bin/claude\n' }, { stdout: 'cid\n' }]);
          await manager.start();
          const args = mockExecFile.mock.calls[1][1] as string[];
          expect(args).toContain('my-image:latest');
        });

        it('should not include --memory or --cpus for permissive level', async () => {
          const manager = new SandboxManager('s', '/w', 'docker', { level: 'permissive' });
          execFileSequence([{ stdout: '/usr/local/bin/claude\n' }, { stdout: 'cid\n' }]);
          await manager.start();
          const args = mockExecFile.mock.calls[1][1] as string[];
          expect(args).not.toContain('--memory');
          expect(args).not.toContain('--cpus');
        });

        it('should not include --read-only for standard level', async () => {
          const manager = new SandboxManager('s', '/w', 'docker', { level: 'standard' });
          execFileSequence([{ stdout: '/usr/local/bin/claude\n' }, { stdout: 'cid\n' }]);
          await manager.start();
          const args = mockExecFile.mock.calls[1][1] as string[];
          expect(args).not.toContain('--read-only');
        });
      });
    });

    describe('sandbox-exec backend', () => {
      it('should write a .sb profile to /tmp/agentspawn-<sessionName>.sb', async () => {
        const manager = new SandboxManager('my-session', '/workspace/project', 'sandbox-exec');

        await manager.start();

        expect(mockWriteFile).toHaveBeenCalledTimes(1);
        const [filePath] = mockWriteFile.mock.calls[0] as [string, string, string];
        expect(filePath).toBe('/tmp/agentspawn-my-session.sb');
      });

      it('should write a profile that starts with (version 1)', async () => {
        const manager = new SandboxManager('my-session', '/workspace/project', 'sandbox-exec');

        await manager.start();

        const [, profileContent] = mockWriteFile.mock.calls[0] as [string, string, string];
        expect(profileContent).toContain('(version 1)');
      });

      it('should write a profile that contains a deny file-write* rule', async () => {
        const manager = new SandboxManager('my-session', '/workspace/project', 'sandbox-exec');

        await manager.start();

        const [, profileContent] = mockWriteFile.mock.calls[0] as [string, string, string];
        expect(profileContent).toContain('(deny file-write*');
      });

      it('should write a profile that allows writes to the working directory', async () => {
        const manager = new SandboxManager('my-session', '/workspace/project', 'sandbox-exec');

        await manager.start();

        const [, profileContent] = mockWriteFile.mock.calls[0] as [string, string, string];
        expect(profileContent).toContain('(allow file-write*');
        expect(profileContent).toContain('/workspace/project');
      });

      it('should write a profile that allows writes to /tmp', async () => {
        const manager = new SandboxManager('my-session', '/workspace/project', 'sandbox-exec');

        await manager.start();

        const [, profileContent] = mockWriteFile.mock.calls[0] as [string, string, string];
        expect(profileContent).toContain('(allow file-write*');
        expect(profileContent).toContain('/tmp');
      });

      it('should use tmpdir() from os for the profile path', async () => {
        mockOs.tmpdir.mockReturnValue('/var/folders/tmp');
        const manager = new SandboxManager('my-session', '/workspace/project', 'sandbox-exec');

        await manager.start();

        const [filePath] = mockWriteFile.mock.calls[0] as [string, string, string];
        expect(filePath).toContain('/var/folders/tmp');
        expect(filePath).toContain('agentspawn-my-session.sb');
      });

      it('should not call execFile', async () => {
        const manager = new SandboxManager('my-session', '/workspace/project', 'sandbox-exec');

        await manager.start();

        expect(mockExecFile).not.toHaveBeenCalled();
      });

      it('should throw if working directory contains SBPL-special characters', async () => {
        const manager = new SandboxManager('my-session', '/path/with"quote', 'sandbox-exec');
        await expect(manager.start()).rejects.toThrow('characters not supported in a sandbox-exec profile');
      });
    });

    describe('bwrap backend', () => {
      it('should be a no-op (no execFile calls, no file writes)', async () => {
        const manager = new SandboxManager('my-session', '/workspace/project', 'bwrap');

        await manager.start();

        expect(mockExecFile).not.toHaveBeenCalled();
        expect(mockWriteFile).not.toHaveBeenCalled();
      });

      it('should resolve without throwing', async () => {
        const manager = new SandboxManager('my-session', '/workspace/project', 'bwrap');

        await expect(manager.start()).resolves.toBeUndefined();
      });
    });
  });

  // -------------------------------------------------------------------------
  // buildSpawnArgs()
  // -------------------------------------------------------------------------

  describe('buildSpawnArgs()', () => {
    describe('docker backend (after start)', () => {
      it('should return cmd: "docker" with exec subcommand', async () => {
        const manager = new SandboxManager('proj', '/work', 'docker');

        execFileSequence([
          { stdout: '/usr/local/bin/claude\n' },
          { stdout: 'abc123\n' },
        ]);
        await manager.start();

        const result = manager.buildSpawnArgs(['--print', 'hello']);

        expect(result.cmd).toBe('docker');
      });

      it('should include "exec" and the container ID before "claude"', async () => {
        const manager = new SandboxManager('proj', '/work', 'docker');

        execFileSequence([
          { stdout: '/usr/local/bin/claude\n' },
          { stdout: 'abc123\n' },
        ]);
        await manager.start();

        const result = manager.buildSpawnArgs(['--print', 'hello']);

        expect(result.args[0]).toBe('exec');
        expect(result.args[1]).toBe('abc123');
        expect(result.args[2]).toBe('claude');
      });

      it('should append claudeArgs after "claude"', async () => {
        const manager = new SandboxManager('proj', '/work', 'docker');

        execFileSequence([
          { stdout: '/usr/local/bin/claude\n' },
          { stdout: 'abc123\n' },
        ]);
        await manager.start();

        const claudeArgs = ['--print', '--output-format', 'stream-json'];
        const result = manager.buildSpawnArgs(claudeArgs);

        expect(result.args).toEqual(['exec', 'abc123', 'claude', ...claudeArgs]);
      });

      it('should work with an empty claudeArgs array', async () => {
        const manager = new SandboxManager('proj', '/work', 'docker');

        execFileSequence([
          { stdout: '/usr/local/bin/claude\n' },
          { stdout: 'containerXYZ\n' },
        ]);
        await manager.start();

        const result = manager.buildSpawnArgs([]);

        expect(result.args).toEqual(['exec', 'containerXYZ', 'claude']);
      });
    });

    describe('bwrap backend', () => {
      it('should return cmd: "bwrap"', () => {
        const manager = new SandboxManager('bwrap-session', '/work', 'bwrap');

        const result = manager.buildSpawnArgs(['--print']);

        expect(result.cmd).toBe('bwrap');
      });

      it('should include --ro-bind / / as the first bind arguments (permissive level)', () => {
        const manager = new SandboxManager('bwrap-session', '/work', 'bwrap', { level: 'permissive' });

        const result = manager.buildSpawnArgs([]);

        const roBindIdx = result.args.indexOf('--ro-bind');
        expect(roBindIdx).toBeGreaterThanOrEqual(0);
        expect(result.args[roBindIdx + 1]).toBe('/');
        expect(result.args[roBindIdx + 2]).toBe('/');
      });

      it('should bind the working directory read-write', () => {
        const manager = new SandboxManager('bwrap-session', '/work', 'bwrap');

        const result = manager.buildSpawnArgs([]);

        // Find the --bind entry that maps /work → /work
        const bindIndices: number[] = [];
        result.args.forEach((arg, i) => {
          if (arg === '--bind') bindIndices.push(i);
        });

        const workdirBind = bindIndices.find(
          (i) => result.args[i + 1] === '/work' && result.args[i + 2] === '/work',
        );
        expect(workdirBind).toBeDefined();
      });

      it('should include --unshare-all', () => {
        const manager = new SandboxManager('bwrap-session', '/work', 'bwrap');

        const result = manager.buildSpawnArgs([]);

        expect(result.args).toContain('--unshare-all');
      });

      it('should include --share-net', () => {
        const manager = new SandboxManager('bwrap-session', '/work', 'bwrap');

        const result = manager.buildSpawnArgs([]);

        expect(result.args).toContain('--share-net');
      });

      it('should include "claude" followed by claudeArgs', () => {
        const manager = new SandboxManager('bwrap-session', '/work', 'bwrap');
        const claudeArgs = ['--print', '--verbose'];

        const result = manager.buildSpawnArgs(claudeArgs);

        const claudeIdx = result.args.indexOf('claude');
        expect(claudeIdx).toBeGreaterThan(-1);
        expect(result.args.slice(claudeIdx + 1)).toEqual(claudeArgs);
      });

      it('should use --tmpfs /tmp (not --bind /tmp /tmp) for permissive level', () => {
        const manager = new SandboxManager('bwrap-session', '/work', 'bwrap', { level: 'permissive' });

        const result = manager.buildSpawnArgs([]);

        expect(result.args).toContain('--tmpfs');
        const tmpfsIdx = result.args.indexOf('--tmpfs');
        expect(result.args[tmpfsIdx + 1]).toBe('/tmp');

        // Should NOT contain --bind /tmp /tmp
        const bindIndices: number[] = [];
        result.args.forEach((arg, i) => {
          if (arg === '--bind') bindIndices.push(i);
        });
        const hasTmpBind = bindIndices.some((i) => result.args[i + 1] === '/tmp');
        expect(hasTmpBind).toBe(false);
      });

      it('should include --dev /dev', () => {
        const manager = new SandboxManager('bwrap-session', '/work', 'bwrap');

        const result = manager.buildSpawnArgs([]);

        const devIdx = result.args.indexOf('--dev');
        expect(devIdx).toBeGreaterThan(-1);
        expect(result.args[devIdx + 1]).toBe('/dev');
      });

      it('should include --proc /proc', () => {
        const manager = new SandboxManager('bwrap-session', '/work', 'bwrap');

        const result = manager.buildSpawnArgs([]);

        const procIdx = result.args.indexOf('--proc');
        expect(procIdx).toBeGreaterThan(-1);
        expect(result.args[procIdx + 1]).toBe('/proc');
      });

      it('should ro-bind the .claude homedir path', () => {
        mockOs.homedir.mockReturnValue('/home/user');
        const manager = new SandboxManager('bwrap-session', '/work', 'bwrap');

        const result = manager.buildSpawnArgs([]);

        // Look for --ro-bind entries beyond the first / / binding
        const roBindArgs: string[] = [];
        result.args.forEach((arg, i) => {
          if (arg === '--ro-bind') {
            roBindArgs.push(`${result.args[i + 1]}:${result.args[i + 2]}`);
          }
        });

        expect(roBindArgs).toContain('/home/user/.claude:/home/user/.claude');
      });
    });

    describe('sandbox-exec backend', () => {
      it('should return cmd: "sandbox-exec"', async () => {
        const manager = new SandboxManager('sb-session', '/work', 'sandbox-exec');
        await manager.start();

        const result = manager.buildSpawnArgs(['--print']);

        expect(result.cmd).toBe('sandbox-exec');
      });

      it('should include -f followed by the profile path', async () => {
        mockOs.tmpdir.mockReturnValue('/tmp');
        const manager = new SandboxManager('sb-session', '/work', 'sandbox-exec');
        await manager.start();

        const result = manager.buildSpawnArgs(['--print']);

        expect(result.args[0]).toBe('-f');
        expect(result.args[1]).toBe('/tmp/agentspawn-sb-session.sb');
      });

      it('should place "claude" after the profile arguments', async () => {
        const manager = new SandboxManager('sb-session', '/work', 'sandbox-exec');
        await manager.start();

        const result = manager.buildSpawnArgs(['--print']);

        expect(result.args[2]).toBe('claude');
      });

      it('should append claudeArgs after "claude"', async () => {
        const manager = new SandboxManager('sb-session', '/work', 'sandbox-exec');
        await manager.start();

        const claudeArgs = ['--print', '--output-format', 'stream-json', '--verbose'];
        const result = manager.buildSpawnArgs(claudeArgs);

        expect(result.args).toEqual(['-f', '/tmp/agentspawn-sb-session.sb', 'claude', ...claudeArgs]);
      });
    });
  });

  // -------------------------------------------------------------------------
  // buildArbitrarySpawnArgs()
  // -------------------------------------------------------------------------

  describe('buildArbitrarySpawnArgs()', () => {
    it('docker: should use the given executable instead of claude', async () => {
      const manager = new SandboxManager('s', '/w', 'docker');
      execFileSequence([{ stdout: '/usr/local/bin/claude\n' }, { stdout: 'cid\n' }]);
      await manager.start();
      const result = manager.buildArbitrarySpawnArgs('sh', ['-c', 'echo hi']);
      expect(result.args).toContain('sh');
      expect(result.args).not.toContain('claude');
    });

    it('bwrap: permissive uses --tmpfs /tmp (not --bind /tmp /tmp)', () => {
      const manager = new SandboxManager('s', '/w', 'bwrap', { level: 'permissive' });
      const result = manager.buildArbitrarySpawnArgs('claude', []);
      expect(result.args).toContain('--tmpfs');
      const tmpfsIdx = result.args.indexOf('--tmpfs');
      expect(result.args[tmpfsIdx + 1]).toBe('/tmp');
      // should NOT contain --bind /tmp /tmp
      const bindIndices = result.args.reduce<number[]>((acc, a, i) => a === '--bind' ? [...acc, i] : acc, []);
      const hasTmpBind = bindIndices.some(i => result.args[i + 1] === '/tmp');
      expect(hasTmpBind).toBe(false);
    });

    it('bwrap: standard uses selective mounts (no --ro-bind / /)', () => {
      const manager = new SandboxManager('s', '/w', 'bwrap', { level: 'standard' });
      const result = manager.buildArbitrarySpawnArgs('claude', []);
      // Should NOT have --ro-bind / /
      const roBindIndices = result.args.reduce<number[]>((acc, a, i) => a === '--ro-bind' ? [...acc, i] : acc, []);
      const hasRootBind = roBindIndices.some(i => result.args[i + 1] === '/');
      expect(hasRootBind).toBe(false);
      // Should include selective system dirs
      expect(result.args).toContain('/usr');
      expect(result.args).toContain('/etc');
    });

    it('bwrap: strict omits --share-net', () => {
      const manager = new SandboxManager('s', '/w', 'bwrap', { level: 'strict' });
      const result = manager.buildArbitrarySpawnArgs('claude', []);
      expect(result.args).not.toContain('--share-net');
    });
  });

  // -------------------------------------------------------------------------
  // getLevel()
  // -------------------------------------------------------------------------

  describe('getLevel()', () => {
    it('should return "permissive" when no level specified', () => {
      const m = new SandboxManager('s', '/w', 'docker');
      expect(m.getLevel()).toBe('permissive');
    });

    it('should return the specified level', () => {
      const m = new SandboxManager('s', '/w', 'docker', { level: 'strict' });
      expect(m.getLevel()).toBe('strict');
    });

    it('should return "standard" when standard level is specified', () => {
      const m = new SandboxManager('s', '/w', 'bwrap', { level: 'standard' });
      expect(m.getLevel()).toBe('standard');
    });
  });

  // -------------------------------------------------------------------------
  // diff()
  // -------------------------------------------------------------------------

  describe('diff()', () => {
    it('should return [] before start() is called', async () => {
      const manager = new SandboxManager('s', '/w', 'docker');
      const result = await manager.diff();
      expect(result).toEqual([]);
    });

    it('docker: should call docker diff with the container ID', async () => {
      const manager = new SandboxManager('s', '/w', 'docker');
      execFileSequence([
        { stdout: '/usr/local/bin/claude\n' },
        { stdout: 'abc123\n' },
        { stdout: 'A /w/foo.ts\nC /w/bar.ts\n' }, // docker diff output
      ]);
      await manager.start();
      const changes = await manager.diff();
      expect(mockExecFile).toHaveBeenCalledWith('docker', ['diff', 'abc123'], expect.any(Function));
      expect(changes).toEqual(['A /w/foo.ts', 'C /w/bar.ts']);
    });

    it('sandbox-exec: should return files modified after start()', async () => {
      const startTime = Date.now();
      const manager = new SandboxManager('s', '/workspace', 'sandbox-exec');
      await manager.start(); // sets startedAt

      // Mock readdir to return one file
      const mockReaddirFn = vi.mocked(fsPromises.readdir);
      mockReaddirFn.mockResolvedValue(['changed.ts'] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);

      const mockStatFn = vi.mocked(fsPromises.stat);
      mockStatFn.mockResolvedValue({
        isDirectory: () => false,
        mtime: new Date(startTime + 5000), // modified after start
      } as unknown as Awaited<ReturnType<typeof fsPromises.stat>>);

      const changes = await manager.diff();
      expect(changes).toHaveLength(1);
      expect(changes[0]).toContain('changed.ts');
    });

    it('sandbox-exec: should return [] for files not modified after start()', async () => {
      const manager = new SandboxManager('s', '/workspace', 'sandbox-exec');
      await manager.start();

      mockReaddir.mockResolvedValue(['old.ts'] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);
      mockStat.mockResolvedValue({
        isDirectory: () => false,
        mtime: new Date(0), // old file, before start
      } as unknown as Awaited<ReturnType<typeof fsPromises.stat>>);

      const changes = await manager.diff();
      expect(changes).toEqual([]);
    });

    it('bwrap: should return [] before start() is called', async () => {
      const manager = new SandboxManager('s', '/w', 'bwrap');
      const result = await manager.diff();
      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // runIsolationTest()
  // -------------------------------------------------------------------------

  describe('runIsolationTest()', () => {
    it('should return passed=true when writes are properly isolated', async () => {
      // sandbox-exec is stateless so no start() exec calls needed for the test
      const manager = new SandboxManager('s', '/workspace', 'sandbox-exec');
      await manager.start();
      vi.clearAllMocks();

      // spawn mock: first call (write outside) → exit 1 (blocked)
      //             second call (write inside) → exit 0 (allowed)
      let spawnCallCount = 0;
      mockSpawn.mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown) => {
        const emitter = new EventEmitter();
        const exitCode = spawnCallCount++ === 0 ? 1 : 0; // blocked, then allowed
        setTimeout(() => emitter.emit('close', exitCode), 0);
        return emitter as unknown as ReturnType<typeof spawn>;
      });

      const result = await manager.runIsolationTest();
      expect(result.passed).toBe(true);
      expect(result.writeOutsideWorkdir).toBe(false);
      expect(result.writeInsideWorkdir).toBe(true);
      expect(result.readCredentialDir).toBeNull(); // permissive level
    });

    it('should return passed=false when write outside workdir is not blocked', async () => {
      const manager = new SandboxManager('s', '/workspace', 'sandbox-exec');
      await manager.start();
      vi.clearAllMocks();

      // Both writes succeed — sandbox not blocking
      mockSpawn.mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown) => {
        const emitter = new EventEmitter();
        setTimeout(() => emitter.emit('close', 0), 0);
        return emitter as unknown as ReturnType<typeof spawn>;
      });

      const result = await manager.runIsolationTest();
      expect(result.passed).toBe(false);
      expect(result.writeOutsideWorkdir).toBe(true);
    });

    it('should return passed=false when write inside workdir fails', async () => {
      const manager = new SandboxManager('s', '/workspace', 'sandbox-exec');
      await manager.start();
      vi.clearAllMocks();

      // Both writes fail — write inside also blocked (misconfigured sandbox)
      mockSpawn.mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown) => {
        const emitter = new EventEmitter();
        setTimeout(() => emitter.emit('close', 1), 0);
        return emitter as unknown as ReturnType<typeof spawn>;
      });

      const result = await manager.runIsolationTest();
      expect(result.passed).toBe(false);
      expect(result.writeInsideWorkdir).toBe(false);
    });

    it('should test credential read for standard level', async () => {
      const manager = new SandboxManager('s', '/workspace', 'sandbox-exec', { level: 'standard' });
      await manager.start();
      vi.clearAllMocks();

      // Write outside → blocked (exit 1)
      // Write inside → allowed (exit 0)
      // Read credential → blocked (exit 1 = non-zero = not readable = readCredentialDir false)
      let spawnCallCount = 0;
      mockSpawn.mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown) => {
        const emitter = new EventEmitter();
        const exitCode = spawnCallCount++ === 1 ? 0 : 1; // only the 2nd call (write inside) succeeds
        setTimeout(() => emitter.emit('close', exitCode), 0);
        return emitter as unknown as ReturnType<typeof spawn>;
      });

      const result = await manager.runIsolationTest();
      expect(result.readCredentialDir).toBe(false); // was blocked (exit non-zero = blocked = false)
      expect(result.passed).toBe(true);
    });

    it('should include backend and level in the result', async () => {
      const manager = new SandboxManager('s', '/workspace', 'bwrap', { level: 'permissive' });
      await manager.start();
      vi.clearAllMocks();

      let spawnCallCount = 0;
      mockSpawn.mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown) => {
        const emitter = new EventEmitter();
        const exitCode = spawnCallCount++ === 0 ? 1 : 0;
        setTimeout(() => emitter.emit('close', exitCode), 0);
        return emitter as unknown as ReturnType<typeof spawn>;
      });

      const result = await manager.runIsolationTest();
      expect(result.backend).toBe('bwrap');
      expect(result.level).toBe('permissive');
    });
  });

  // -------------------------------------------------------------------------
  // stop()
  // -------------------------------------------------------------------------

  describe('stop()', () => {
    describe('docker backend', () => {
      it('should call docker rm -f agentspawn-<sessionName>', async () => {
        const manager = new SandboxManager('my-session', '/workspace/project', 'docker');

        execFileSequence([
          { stdout: '/usr/local/bin/claude\n' },
          { stdout: 'container-id-abc123\n' },
        ]);

        await manager.start();
        vi.clearAllMocks();

        execFileSucceeds('');

        await manager.stop();

        expect(mockExecFile).toHaveBeenCalledWith(
          'docker',
          ['rm', '-f', 'agentspawn-my-session'],
          expect.any(Function),
        );
      });

      it('should resolve without throwing after removing the container', async () => {
        const manager = new SandboxManager('my-session', '/workspace/project', 'docker');

        execFileSequence([
          { stdout: '/usr/local/bin/claude\n' },
          { stdout: 'container-id-abc123\n' },
          { stdout: '' }, // docker rm -f response
        ]);

        await manager.start();

        await expect(manager.stop()).resolves.toBeUndefined();
      });

      it('should be a no-op if stop() is called before start()', async () => {
        const manager = new SandboxManager('my-session', '/workspace/project', 'docker');

        // Do NOT call start() — containerId is null
        await manager.stop();

        expect(mockExecFile).not.toHaveBeenCalled();
      });
    });

    describe('sandbox-exec backend', () => {
      it('should unlink the profile file', async () => {
        mockOs.tmpdir.mockReturnValue('/tmp');
        const manager = new SandboxManager('my-session', '/workspace/project', 'sandbox-exec');

        await manager.start();
        vi.clearAllMocks();

        await manager.stop();

        expect(mockUnlink).toHaveBeenCalledTimes(1);
        const [unlinkPath] = mockUnlink.mock.calls[0] as [string];
        expect(unlinkPath).toBe('/tmp/agentspawn-my-session.sb');
      });

      it('should not call execFile', async () => {
        const manager = new SandboxManager('my-session', '/workspace/project', 'sandbox-exec');

        await manager.start();
        vi.clearAllMocks();

        await manager.stop();

        expect(mockExecFile).not.toHaveBeenCalled();
      });

      it('should be a no-op if stop() is called before start()', async () => {
        const manager = new SandboxManager('my-session', '/workspace/project', 'sandbox-exec');

        // Do NOT call start() — sbProfilePath is null
        await manager.stop();

        expect(mockUnlink).not.toHaveBeenCalled();
        expect(mockExecFile).not.toHaveBeenCalled();
      });
    });

    describe('bwrap backend', () => {
      it('should be a no-op (no execFile calls, no unlink calls)', async () => {
        const manager = new SandboxManager('my-session', '/workspace/project', 'bwrap');

        await manager.start();
        vi.clearAllMocks();

        await manager.stop();

        expect(mockExecFile).not.toHaveBeenCalled();
        expect(mockUnlink).not.toHaveBeenCalled();
      });

      it('should resolve without throwing', async () => {
        const manager = new SandboxManager('my-session', '/workspace/project', 'bwrap');

        await expect(manager.stop()).resolves.toBeUndefined();
      });
    });
  });

  // -------------------------------------------------------------------------
  // getBackend()
  // -------------------------------------------------------------------------

  describe('getBackend()', () => {
    it('should return "docker" for docker backend', () => {
      const manager = new SandboxManager('s', '/w', 'docker');
      expect(manager.getBackend()).toBe('docker');
    });

    it('should return "bwrap" for bwrap backend', () => {
      const manager = new SandboxManager('s', '/w', 'bwrap');
      expect(manager.getBackend()).toBe('bwrap');
    });

    it('should return "sandbox-exec" for sandbox-exec backend', () => {
      const manager = new SandboxManager('s', '/w', 'sandbox-exec');
      expect(manager.getBackend()).toBe('sandbox-exec');
    });
  });
});
