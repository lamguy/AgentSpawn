import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, unlink, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SandboxBackend, SandboxLevel, SandboxOptions, SandboxTestResult } from '../types.js';

const execFileAsync = promisify(execFile);

export class SandboxManager {
  private containerId: string | null = null;
  private sbProfilePath: string | null = null;
  private startedAt: Date | null = null;

  constructor(
    private readonly sessionName: string,
    private readonly workingDirectory: string,
    private readonly backend: SandboxBackend,
    private readonly options: SandboxOptions = {},
  ) {}

  /**
   * Probes backends in preference order and returns the first available.
   * Returns null if no backend is available on this system.
   *
   * Detection order:
   * 1. Docker (all platforms): `docker info` exits 0 → 'docker'
   * 2. Platform-native:
   *    - Linux: `which bwrap` exits 0 → 'bwrap'
   *    - macOS: `which sandbox-exec` exits 0 → 'sandbox-exec'
   * 3. null
   */
  static async detectBackend(): Promise<SandboxBackend | null> {
    // 1. Docker — available on all platforms
    try {
      await execFileAsync('docker', ['info']);
      return 'docker';
    } catch {
      // Docker not available or not running, continue
    }

    // 2. Platform-native backend
    const platform = os.platform();

    if (platform === 'linux') {
      try {
        await execFileAsync('which', ['bwrap']);
        return 'bwrap';
      } catch {
        // bwrap not installed
      }
    } else if (platform === 'darwin') {
      try {
        await execFileAsync('which', ['sandbox-exec']);
        return 'sandbox-exec';
      } catch {
        // sandbox-exec not available
      }
    }

    return null;
  }

  /**
   * Like detectBackend() but skips Docker — only checks the platform-native
   * backend (bwrap on Linux, sandbox-exec on macOS). Used for graceful
   * fallback when Docker fails to start.
   */
  static async detectPlatformNativeBackend(): Promise<SandboxBackend | null> {
    const platform = os.platform();

    if (platform === 'linux') {
      try {
        await execFileAsync('which', ['bwrap']);
        return 'bwrap';
      } catch {
        // bwrap not installed
      }
    } else if (platform === 'darwin') {
      try {
        await execFileAsync('which', ['sandbox-exec']);
        return 'sandbox-exec';
      } catch {
        // sandbox-exec not available
      }
    }

    return null;
  }

  /**
   * Starts the sandbox.
   *
   * Docker:
   *   Runs a long-lived container named agentspawn-<sessionName> with the
   *   claude binary and working directory bind-mounted. Stores the container ID.
   *
   * bwrap:
   *   No-op — bwrap is invoked per-prompt via buildSpawnArgs.
   *
   * sandbox-exec:
   *   Writes a .sb profile to /tmp/agentspawn-<sessionName>.sb that allows
   *   writes only under workingDirectory and /tmp. Stores the profile path.
   */
  async start(): Promise<void> {
    this.startedAt = new Date();

    switch (this.backend) {
      case 'docker': {
        const { stdout: claudePathRaw } = await execFileAsync('which', ['claude']);
        const claudePath = claudePathRaw.trim();
        const homedir = os.homedir();
        const containerName = `agentspawn-${this.sessionName}`;

        const uid = process.getuid?.() ?? 1000;
        const gid = process.getgid?.() ?? 1000;
        const level = this.options.level ?? 'permissive';
        // Pin to a specific digest in production: --sandbox-image debian@sha256:<digest>
        const image = this.options.image ?? 'debian:12-slim';

        // Arguments passed directly to execFile — no shell interpolation,
        // so session names / paths with spaces or metacharacters are safe.
        const dockerArgs: string[] = [
          'run', '-d', '--rm',
          '--name', containerName,
          '-v', `${claudePath}:/usr/local/bin/claude:ro`,
          '-v', `${homedir}/.claude:/root/.claude:ro`,
          '-v', `${this.workingDirectory}:${this.workingDirectory}:rw`,
          '--workdir', this.workingDirectory,
          // bridge network prevents Claude from accessing host localhost services
          // while preserving outbound internet access for API calls
          '--network', 'bridge',
          '--user', `${uid}:${gid}`,
          '--cap-drop', 'ALL',
          '--security-opt', 'no-new-privileges',
        ];

        if (level === 'standard') {
          dockerArgs.push(
            '--memory', this.options.memoryLimit ?? '512m',
            '--cpus', String(this.options.cpuLimit ?? 1.0),
          );
        } else if (level === 'strict') {
          dockerArgs.push(
            '--memory', this.options.memoryLimit ?? '256m',
            '--cpus', String(this.options.cpuLimit ?? 0.5),
            '--read-only',
            '--tmpfs', '/tmp:rw,noexec,nosuid',
          );
        }

        dockerArgs.push(image, 'sleep', 'infinity');

        const { stdout } = await execFileAsync('docker', dockerArgs);
        this.containerId = stdout.trim();
        break;
      }

      case 'bwrap': {
        // Stateless per-invocation; nothing to set up
        break;
      }

      case 'sandbox-exec': {
        // Validate that workingDirectory contains no SBPL-special characters.
        // sandbox-exec profile strings are delimited by double-quotes; a path
        // containing '"' or unmatched parentheses would produce malformed SBPL,
        // causing sandbox-exec to abort silently with zero write isolation.
        const illegalChars = /["\(\)]/;
        if (illegalChars.test(this.workingDirectory)) {
          throw new Error(
            `Working directory contains characters not supported in a sandbox-exec profile: ${this.workingDirectory}`,
          );
        }

        const profilePath = path.join(os.tmpdir(), `agentspawn-${this.sessionName}.sb`);
        const profileContent = this.buildSandboxExecProfile();

        await writeFile(profilePath, profileContent, 'utf8');
        this.sbProfilePath = profilePath;
        break;
      }
    }
  }

  /**
   * Generates the SBPL profile content for sandbox-exec based on the
   * configured isolation level.
   *
   * Rule ordering: (deny file-write*) must precede (allow file-write* ...)
   * so that the more-specific allow rules override the global deny.
   * sandbox-exec uses a last-match-wins model for same-specificity rules,
   * but explicit deny+allow pairs work correctly when ordered this way.
   */
  private buildSandboxExecProfile(): string {
    const homedir = os.homedir();
    const workdir = this.workingDirectory;
    const level = this.options.level ?? 'permissive';

    if (level === 'permissive') {
      return [
        '(version 1)',
        '(allow default)',
        '(deny file-write* (subpath "/"))',
        `(allow file-write* (subpath "${workdir}") (subpath "/tmp"))`,
      ].join('\n');
    }

    if (level === 'standard') {
      return [
        '(version 1)',
        '(allow default)',
        '(deny file-write* (subpath "/"))',
        `(allow file-write* (subpath "${workdir}") (subpath "/tmp"))`,
        '(deny file-read*',
        `  (subpath "${homedir}/.ssh")`,
        `  (subpath "${homedir}/.gnupg")`,
        `  (subpath "${homedir}/.aws")`,
        `  (subpath "${homedir}/.azure")`,
        `  (subpath "${homedir}/.kube")`,
        `  (subpath "${homedir}/.config/gcloud")`,
        `  (subpath "${homedir}/.docker")`,
        `  (subpath "${homedir}/.netrc")`,
        `  (subpath "${homedir}/.npmrc")`,
        `  (subpath "${homedir}/.pypirc"))`,
      ].join('\n');
    }

    // strict: broader home directory read denial + network denial
    // NOTE: (deny network*) blocks Claude's API calls. Use only for local/offline models.
    return [
      '(version 1)',
      '(allow default)',
      '(deny file-write* (subpath "/"))',
      `(allow file-write* (subpath "${workdir}") (subpath "/tmp"))`,
      `(deny file-read* (subpath "${homedir}"))`,
      '(allow file-read*',
      `  (subpath "${homedir}/.claude")`,
      `  (subpath "${workdir}"))`,
      '(deny network*)',
    ].join('\n');
  }

  /**
   * Returns { cmd, args } to use in place of bare `claude` for each prompt
   * invocation. The caller prepends these to the claude argument list.
   *
   * Docker:       docker exec <containerId> claude ...claudeArgs
   * bwrap:        bwrap <namespace flags> claude ...claudeArgs
   * sandbox-exec: sandbox-exec -f <profile> claude ...claudeArgs
   */
  buildSpawnArgs(claudeArgs: string[]): { cmd: string; args: string[] } {
    return this.buildArbitrarySpawnArgs('claude', claudeArgs);
  }

  /**
   * Like buildSpawnArgs but wraps an arbitrary executable instead of always
   * `claude`. Used internally by runIsolationTest().
   */
  buildArbitrarySpawnArgs(executable: string, execArgs: string[]): { cmd: string; args: string[] } {
    switch (this.backend) {
      case 'docker': {
        return {
          cmd: 'docker',
          args: ['exec', this.containerId!, executable, ...execArgs],
        };
      }

      case 'bwrap': {
        const homedir = os.homedir();
        const level = this.options.level ?? 'permissive';

        if (level === 'permissive') {
          // Overlay order: ro-bind / first (read-only root), then rw-bind overlays
          // for workdir and /tmp. Later mounts in bwrap override earlier ones for
          // the same path, giving writable access only to the targeted directories.
          return {
            cmd: 'bwrap',
            args: [
              '--ro-bind', '/', '/',
              '--bind', this.workingDirectory, this.workingDirectory,
              '--tmpfs', '/tmp',
              '--ro-bind', `${homedir}/.claude`, `${homedir}/.claude`,
              '--dev', '/dev',
              '--proc', '/proc',
              '--unshare-all',
              '--share-net',  // Claude Code needs network access for API calls
              executable,
              ...execArgs,
            ],
          };
        }

        if (level === 'standard') {
          // Selective bind mounts instead of --ro-bind / — prevents reading
          // ~/.ssh, ~/.aws, ~/.gnupg, and other credential stores.
          const args: string[] = [
            '--ro-bind', '/usr', '/usr',
            '--ro-bind', '/bin', '/bin',
            '--ro-bind', '/sbin', '/sbin',
            '--ro-bind', '/lib', '/lib',
            '--ro-bind', '/etc', '/etc',
          ];

          // /lib64 only exists on Linux multilib systems
          if (existsSync('/lib64')) {
            args.push('--ro-bind', '/lib64', '/lib64');
          }

          args.push(
            '--tmpfs', '/tmp',
            '--bind', this.workingDirectory, this.workingDirectory,
            '--ro-bind', `${homedir}/.claude`, `${homedir}/.claude`,
            '--dev', '/dev',
            '--proc', '/proc',
            '--unshare-all',
            '--share-net',  // Claude Code needs network access for API calls
          );

          if (this.options.memoryLimit) {
            args.push('--rlimit-as', this.options.memoryLimit);
          }

          args.push(executable, ...execArgs);
          return { cmd: 'bwrap', args };
        }

        // strict: same as standard but unshare-net instead of share-net
        // NOTE: --unshare-net blocks all network including Claude's API. Use only for local/offline models.
        const strictArgs: string[] = [
          '--ro-bind', '/usr', '/usr',
          '--ro-bind', '/bin', '/bin',
          '--ro-bind', '/sbin', '/sbin',
          '--ro-bind', '/lib', '/lib',
          '--ro-bind', '/etc', '/etc',
        ];

        if (existsSync('/lib64')) {
          strictArgs.push('--ro-bind', '/lib64', '/lib64');
        }

        strictArgs.push(
          '--tmpfs', '/tmp',
          '--bind', this.workingDirectory, this.workingDirectory,
          '--ro-bind', `${homedir}/.claude`, `${homedir}/.claude`,
          '--dev', '/dev',
          '--proc', '/proc',
          '--unshare-all',
          // NOTE: --unshare-net blocks all network including Claude's API. Use only for local/offline models.
        );

        if (this.options.memoryLimit) {
          strictArgs.push('--rlimit-as', this.options.memoryLimit);
        }

        strictArgs.push(executable, ...execArgs);
        return { cmd: 'bwrap', args: strictArgs };
      }

      case 'sandbox-exec': {
        return {
          cmd: 'sandbox-exec',
          args: ['-f', this.sbProfilePath!, executable, ...execArgs],
        };
      }
    }
  }

  /**
   * Returns a list of strings describing filesystem changes since start() was called.
   *
   * Docker:            Runs `docker diff <containerId>` and returns lines like
   *                    'A /workspace/foo.ts' or 'C /workspace/bar.ts'.
   * bwrap/sandbox-exec: Walks workingDirectory and reports files whose mtime
   *                    is newer than startedAt, formatted as 'M <filepath>'.
   *
   * Returns [] if called before start() or if Docker containerId is null.
   */
  async diff(): Promise<string[]> {
    if (!this.startedAt) {
      return [];
    }

    switch (this.backend) {
      case 'docker': {
        if (!this.containerId) return [];
        const { stdout } = await execFileAsync('docker', ['diff', this.containerId]);
        return stdout.split('\n').filter((line) => line.trim().length > 0);
      }

      case 'bwrap':
      case 'sandbox-exec': {
        const since = this.startedAt;
        const changed: string[] = [];

        const walk = async (dir: string): Promise<void> => {
          let entries: string[];
          try {
            entries = await readdir(dir);
          } catch {
            return;
          }
          for (const entry of entries) {
            const fullPath = path.join(dir, entry);
            try {
              const fileStat = await stat(fullPath);
              if (fileStat.isDirectory()) {
                await walk(fullPath);
              } else if (fileStat.mtime > since) {
                changed.push(`M ${fullPath}`);
              }
            } catch {
              // Skip files we cannot stat
            }
          }
        };

        await walk(this.workingDirectory);
        return changed;
      }
    }
  }

  /**
   * Verifies the sandbox is actually enforcing isolation by running probes
   * inside it. Returns a SandboxTestResult describing what was blocked and
   * whether the sandbox configuration passed all expected checks.
   */
  async runIsolationTest(): Promise<SandboxTestResult> {
    const level = this.options.level ?? 'permissive';
    const canaryFilename = 'agentspawn-canary-write-test';
    const workdirCanary = path.join(this.workingDirectory, canaryFilename);

    // Test 1: write outside workdir — should be BLOCKED
    const exitCode1 = await this.runInSandbox(`touch /etc/${canaryFilename}`);

    // Test 2: write inside workdir — should SUCCEED
    const exitCode2 = await this.runInSandbox(`touch ${workdirCanary}`);

    // Test 3: read credential dir — standard/strict only; should be BLOCKED
    let exitCode3: number | null = null;
    if (level !== 'permissive') {
      const homedir = os.homedir();
      exitCode3 = await this.runInSandbox(`cat ${homedir}/.ssh/id_rsa`);
    }

    // Clean up any canary files written inside workdir
    try {
      await unlink(workdirCanary);
    } catch {
      // File may not exist if test 2 failed; ignore
    }

    const writeInsideWorkdir = exitCode2 === 0;
    const writeOutsideWorkdir = exitCode1 === 0;
    const readCredentialDir: boolean | null =
      level !== 'permissive' && exitCode3 !== null
        ? exitCode3 !== 0
          ? false
          : true
        : null;

    const passed =
      writeInsideWorkdir &&
      !writeOutsideWorkdir &&
      (readCredentialDir === false || readCredentialDir === null);

    return {
      backend: this.backend,
      level,
      writeInsideWorkdir,
      writeOutsideWorkdir,
      readCredentialDir,
      passed,
    };
  }

  /**
   * Runs a shell command inside the sandbox and returns its exit code.
   * Used internally by runIsolationTest().
   */
  private async runInSandbox(shellCmd: string): Promise<number> {
    const { cmd, args } = this.buildArbitrarySpawnArgs('sh', ['-c', shellCmd]);
    return new Promise((resolve) => {
      const child = spawn(cmd, args, { stdio: 'ignore' });
      child.on('close', (code) => {
        resolve(code ?? 1);
      });
      child.on('error', () => {
        resolve(1);
      });
    });
  }

  /**
   * Tears down the sandbox.
   * Docker:       Force-removes the named container.
   * sandbox-exec: Deletes the temporary .sb profile file.
   * bwrap:        No-op.
   */
  async stop(): Promise<void> {
    switch (this.backend) {
      case 'docker': {
        // Guard: if start() was never called or failed before setting containerId,
        // there is nothing to remove. Mirrors the sandbox-exec null guard below.
        if (!this.containerId) break;
        const containerName = `agentspawn-${this.sessionName}`;
        await execFileAsync('docker', ['rm', '-f', containerName]);
        this.containerId = null;
        break;
      }

      case 'sandbox-exec': {
        if (this.sbProfilePath !== null) {
          await unlink(this.sbProfilePath);
          this.sbProfilePath = null;
        }
        break;
      }

      case 'bwrap': {
        // Stateless; nothing to tear down
        break;
      }
    }
  }

  getBackend(): SandboxBackend {
    return this.backend;
  }

  getLevel(): SandboxLevel {
    return this.options.level ?? 'permissive';
  }
}
