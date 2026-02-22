import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerRemoteCommand } from './remote.js';
import { RemoteAlreadyExistsError, RemoteNotFoundError, TunnelError } from '../../utils/errors.js';
import type { RemoteEntry } from '../../types.js';

// ---------------------------------------------------------------------------
// Mock openTunnel so no real SSH connections are attempted
// ---------------------------------------------------------------------------

const mockClose = vi.fn().mockResolvedValue(undefined);
const mockTunnelHandle = { localPort: 19000, close: mockClose };
const mockOpenTunnel = vi.fn().mockResolvedValue(mockTunnelHandle);

vi.mock('../../core/tunnel.js', () => ({
  openTunnel: (...args: unknown[]) => mockOpenTunnel(...args),
}));

// ---------------------------------------------------------------------------
// Mock RemoteManager factory
// ---------------------------------------------------------------------------

function createMockRemoteManager(remotes: RemoteEntry[] = []) {
  const map = new Map<string, RemoteEntry>(remotes.map((r) => [r.alias, r]));

  return {
    addRemote: vi.fn().mockImplementation(async (entry: RemoteEntry) => {
      if (map.has(entry.alias)) {
        throw new RemoteAlreadyExistsError(entry.alias);
      }
      map.set(entry.alias, entry);
    }),
    removeRemote: vi.fn().mockImplementation(async (alias: string) => {
      if (!map.has(alias)) {
        throw new RemoteNotFoundError(alias);
      }
      map.delete(alias);
    }),
    listRemotes: vi.fn().mockImplementation(async () => Array.from(map.values())),
    getRemote: vi.fn().mockImplementation(async (alias: string) => map.get(alias)),
  };
}

function makeEntry(alias: string, overrides: Partial<RemoteEntry> = {}): RemoteEntry {
  return {
    alias,
    sshHost: 'example.com',
    sshUser: 'deploy',
    sshPort: 22,
    remotePort: 7821,
    localPort: 19000,
    addedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// CLI test helpers
// ---------------------------------------------------------------------------

async function runCommand(program: Command, args: string[]): Promise<void> {
  await program.parseAsync(['node', 'agentspawn', ...args]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('remote command', () => {
  let program: Command;
  let mockManager: ReturnType<typeof createMockRemoteManager>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let savedExitCode: typeof process.exitCode;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    mockManager = createMockRemoteManager();
    registerRemoteCommand(program, mockManager as never);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    savedExitCode = process.exitCode;
    mockOpenTunnel.mockResolvedValue(mockTunnelHandle);
    mockClose.mockResolvedValue(undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    process.exitCode = savedExitCode;
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // remote add
  // -------------------------------------------------------------------------

  describe('remote add <alias> <ssh-target>', () => {
    it('should call addRemote with a correctly constructed RemoteEntry', async () => {
      await runCommand(program, ['remote', 'add', 'server-1', 'user@host.example.com']);

      expect(mockManager.addRemote).toHaveBeenCalledTimes(1);
      const entry = mockManager.addRemote.mock.calls[0][0] as RemoteEntry;
      expect(entry.alias).toBe('server-1');
      expect(entry.sshHost).toBe('host.example.com');
      expect(entry.sshUser).toBe('user');
    });

    it('should parse sshUser from user@host format', async () => {
      await runCommand(program, ['remote', 'add', 'srv', 'admin@10.0.0.1']);

      const entry = mockManager.addRemote.mock.calls[0][0] as RemoteEntry;
      expect(entry.sshUser).toBe('admin');
      expect(entry.sshHost).toBe('10.0.0.1');
    });

    it('should default sshUser to "root" when no @ is present', async () => {
      await runCommand(program, ['remote', 'add', 'srv', 'plain-host.com']);

      const entry = mockManager.addRemote.mock.calls[0][0] as RemoteEntry;
      expect(entry.sshUser).toBe('root');
      expect(entry.sshHost).toBe('plain-host.com');
    });

    it('should strip leading ssh:// from ssh-target', async () => {
      await runCommand(program, ['remote', 'add', 'srv', 'ssh://deploy@myhost.com']);

      const entry = mockManager.addRemote.mock.calls[0][0] as RemoteEntry;
      expect(entry.sshUser).toBe('deploy');
      expect(entry.sshHost).toBe('myhost.com');
    });

    it('should use --ssh-user flag to override user in ssh-target', async () => {
      await runCommand(program, [
        'remote', 'add', 'srv', 'wrong@host.com', '--ssh-user', 'correct',
      ]);

      const entry = mockManager.addRemote.mock.calls[0][0] as RemoteEntry;
      expect(entry.sshUser).toBe('correct');
    });

    it('should use --ssh-port flag when provided', async () => {
      await runCommand(program, [
        'remote', 'add', 'srv', 'user@host.com', '--ssh-port', '2222',
      ]);

      const entry = mockManager.addRemote.mock.calls[0][0] as RemoteEntry;
      expect(entry.sshPort).toBe(2222);
    });

    it('should default to sshPort 22 when --ssh-port is not provided', async () => {
      await runCommand(program, ['remote', 'add', 'srv', 'user@host.com']);

      const entry = mockManager.addRemote.mock.calls[0][0] as RemoteEntry;
      expect(entry.sshPort).toBe(22);
    });

    it('should use --remote-port flag when provided', async () => {
      await runCommand(program, [
        'remote', 'add', 'srv', 'user@host.com', '--remote-port', '9000',
      ]);

      const entry = mockManager.addRemote.mock.calls[0][0] as RemoteEntry;
      expect(entry.remotePort).toBe(9000);
    });

    it('should use --local-port flag when provided', async () => {
      await runCommand(program, [
        'remote', 'add', 'srv', 'user@host.com', '--local-port', '20000',
      ]);

      const entry = mockManager.addRemote.mock.calls[0][0] as RemoteEntry;
      expect(entry.localPort).toBe(20000);
    });

    it('should set a random localPort when --local-port is not provided', async () => {
      await runCommand(program, ['remote', 'add', 'srv', 'user@host.com']);

      const entry = mockManager.addRemote.mock.calls[0][0] as RemoteEntry;
      expect(entry.localPort).toBeGreaterThanOrEqual(10000);
      expect(entry.localPort).toBeLessThanOrEqual(60000);
    });

    it('should set addedAt to an ISO date string', async () => {
      await runCommand(program, ['remote', 'add', 'srv', 'user@host.com']);

      const entry = mockManager.addRemote.mock.calls[0][0] as RemoteEntry;
      expect(new Date(entry.addedAt).toISOString()).toBe(entry.addedAt);
    });

    it('should log a success message after adding', async () => {
      await runCommand(program, ['remote', 'add', 'server-1', 'user@host.com']);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("Remote 'server-1' added"),
      );
    });

    it('should print error and set exitCode=1 on duplicate alias', async () => {
      mockManager = createMockRemoteManager([makeEntry('existing')]);
      program = new Command();
      program.exitOverride();
      registerRemoteCommand(program, mockManager as never);
      logSpy.mockRestore();
      errorSpy.mockRestore();
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await runCommand(program, ['remote', 'add', 'existing', 'user@host.com']);

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Error:'));
      expect(process.exitCode).toBe(1);
    });

    it('should print error and set exitCode=1 for invalid --ssh-port', async () => {
      await runCommand(program, [
        'remote', 'add', 'srv', 'user@host.com', '--ssh-port', 'notanumber',
      ]);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('--ssh-port'),
      );
      expect(process.exitCode).toBe(1);
    });

    it('should print error and set exitCode=1 for invalid --remote-port', async () => {
      await runCommand(program, [
        'remote', 'add', 'srv', 'user@host.com', '--remote-port', '99999',
      ]);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('--remote-port'),
      );
      expect(process.exitCode).toBe(1);
    });

    it('should print error and set exitCode=1 for invalid --local-port', async () => {
      await runCommand(program, [
        'remote', 'add', 'srv', 'user@host.com', '--local-port', '0',
      ]);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('--local-port'),
      );
      expect(process.exitCode).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // remote remove
  // -------------------------------------------------------------------------

  describe('remote remove <alias>', () => {
    it('should call removeRemote with the given alias', async () => {
      mockManager = createMockRemoteManager([makeEntry('server-1')]);
      program = new Command();
      program.exitOverride();
      registerRemoteCommand(program, mockManager as never);
      logSpy.mockRestore();
      errorSpy.mockRestore();
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await runCommand(program, ['remote', 'remove', 'server-1']);

      expect(mockManager.removeRemote).toHaveBeenCalledWith('server-1');
    });

    it('should log success message after removing', async () => {
      mockManager = createMockRemoteManager([makeEntry('to-remove')]);
      program = new Command();
      program.exitOverride();
      registerRemoteCommand(program, mockManager as never);
      logSpy.mockRestore();
      errorSpy.mockRestore();
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await runCommand(program, ['remote', 'remove', 'to-remove']);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("Remote 'to-remove' removed"),
      );
    });

    it('should print error and set exitCode=1 for unknown alias', async () => {
      await runCommand(program, ['remote', 'remove', 'ghost']);

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Error:'));
      expect(process.exitCode).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // remote list
  // -------------------------------------------------------------------------

  describe('remote list', () => {
    it('should print a no-remotes message when list is empty', async () => {
      await runCommand(program, ['remote', 'list']);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('No remotes'),
      );
    });

    it('should print a table with ALIAS header when remotes exist', async () => {
      mockManager = createMockRemoteManager([
        makeEntry('server-1', { sshHost: 'host1.com', sshUser: 'admin' }),
      ]);
      program = new Command();
      program.exitOverride();
      registerRemoteCommand(program, mockManager as never);
      logSpy.mockRestore();
      errorSpy.mockRestore();
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await runCommand(program, ['remote', 'list']);

      const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(output).toContain('ALIAS');
      expect(output).toContain('server-1');
    });

    it('should print SSH HOST, SSH USER, PORT, ADDED columns', async () => {
      mockManager = createMockRemoteManager([
        makeEntry('my-remote', {
          sshHost: 'host.example.com',
          sshUser: 'root',
          remotePort: 7821,
        }),
      ]);
      program = new Command();
      program.exitOverride();
      registerRemoteCommand(program, mockManager as never);
      logSpy.mockRestore();
      errorSpy.mockRestore();
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await runCommand(program, ['remote', 'list']);

      const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(output).toContain('SSH HOST');
      expect(output).toContain('SSH USER');
      expect(output).toContain('PORT');
      expect(output).toContain('ADDED');
    });

    it('should output JSON array when --json flag is provided', async () => {
      const entry = makeEntry('srv-json', { sshHost: 'jsonhost.com' });
      mockManager = createMockRemoteManager([entry]);
      program = new Command();
      program.exitOverride();
      registerRemoteCommand(program, mockManager as never);
      logSpy.mockRestore();
      errorSpy.mockRestore();
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await runCommand(program, ['remote', 'list', '--json']);

      expect(logSpy).toHaveBeenCalledTimes(1);
      const output = logSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output) as RemoteEntry[];
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].alias).toBe('srv-json');
    });

    it('should output empty JSON array when --json and no remotes', async () => {
      await runCommand(program, ['remote', 'list', '--json']);

      const output = logSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output) as unknown[];
      expect(parsed).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // remote connect
  // -------------------------------------------------------------------------

  describe('remote connect <alias>', () => {
    it('should print error and set exitCode=1 when alias is not found', async () => {
      await runCommand(program, ['remote', 'connect', 'no-such-remote']);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Remote 'no-such-remote' not found"),
      );
      expect(process.exitCode).toBe(1);
    });

    it('should call openTunnel with the correct RemoteEntry', async () => {
      const entry = makeEntry('prod', { sshHost: 'prod.example.com' });
      mockManager = createMockRemoteManager([entry]);
      program = new Command();
      program.exitOverride();
      registerRemoteCommand(program, mockManager as never);
      logSpy.mockRestore();
      errorSpy.mockRestore();
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // connect registers SIGINT/SIGTERM handlers so don't actually block
      // The action hangs waiting for signals; we verify openTunnel is called
      const connectPromise = runCommand(program, ['remote', 'connect', 'prod']);

      // Allow microtasks to run so openTunnel is invoked
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Verify openTunnel was called with the entry
      expect(mockOpenTunnel).toHaveBeenCalledWith(
        expect.objectContaining({ alias: 'prod', sshHost: 'prod.example.com' }),
      );

      // Clean up: the promise never resolves (waits for SIGINT) so we need
      // to not await it; just verify the side effects above suffice.
      void connectPromise;
    });

    it('should print tunnel info message after successful open', async () => {
      const entry = makeEntry('staging', {
        sshHost: 'staging.example.com',
        localPort: 19000,
        remotePort: 7821,
      });
      mockManager = createMockRemoteManager([entry]);
      program = new Command();
      program.exitOverride();
      registerRemoteCommand(program, mockManager as never);
      logSpy.mockRestore();
      errorSpy.mockRestore();
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      void runCommand(program, ['remote', 'connect', 'staging']);

      // Allow microtasks to settle
      await new Promise((resolve) => setTimeout(resolve, 0));

      const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(output).toContain('Tunnel open');
      expect(output).toContain('localhost:19000');
    });

    it('should print error and set exitCode=1 when openTunnel throws TunnelError', async () => {
      mockOpenTunnel.mockRejectedValueOnce(
        new TunnelError('prod', 'SSH refused connection'),
      );

      const entry = makeEntry('prod');
      mockManager = createMockRemoteManager([entry]);
      program = new Command();
      program.exitOverride();
      registerRemoteCommand(program, mockManager as never);
      logSpy.mockRestore();
      errorSpy.mockRestore();
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await runCommand(program, ['remote', 'connect', 'prod']);

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Error:'));
      expect(process.exitCode).toBe(1);
    });
  });
});
