import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { TunnelError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Mock node:child_process before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

// Stub fetch globally so probe calls are controlled
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockSshProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    exitCode: number | null;
    killed: boolean;
    pid: number;
    stderr: EventEmitter;
    stdout: EventEmitter;
    stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
    kill: ReturnType<typeof vi.fn>;
  };
  proc.exitCode = null;
  proc.killed = false;
  proc.pid = 12345;
  proc.stderr = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stdin = { write: vi.fn(), end: vi.fn() };
  proc.kill = vi.fn((signal?: string) => {
    proc.killed = true;
    proc.exitCode = null;
    proc.emit('exit', null, signal ?? 'SIGTERM');
  });
  return proc;
}

function makeRemoteEntry(overrides: Record<string, unknown> = {}) {
  return {
    alias: 'test-remote',
    sshHost: 'example.com',
    sshUser: 'deploy',
    sshPort: 22,
    remotePort: 7821,
    localPort: 19001,
    addedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('openTunnel()', () => {
  // Import spawn lazily to pick up the vi.mock
  let spawnMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    fetchMock.mockReset();
    const cp = await import('node:child_process');
    spawnMock = cp.spawn as ReturnType<typeof vi.fn>;
    spawnMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Spawn argument verification
  // -------------------------------------------------------------------------

  describe('spawn arguments', () => {
    it('should spawn ssh with -N -L and the correct port-forward string', async () => {
      const proc = makeMockSshProcess();
      spawnMock.mockReturnValue(proc);
      fetchMock.mockResolvedValue({ ok: true, status: 200 });

      const entry = makeRemoteEntry({
        sshHost: 'prod.server.com',
        sshUser: 'admin',
        sshPort: 2222,
        remotePort: 8080,
        localPort: 15000,
      });

      // openTunnel() will be awaited after the probe resolves
      const { openTunnel } = await import('./tunnel.js');
      await openTunnel(entry as Parameters<typeof openTunnel>[0]);

      expect(spawnMock).toHaveBeenCalledWith(
        'ssh',
        ['-N', '-L', '15000:localhost:8080', '-p', '2222', 'admin@prod.server.com'],
        { stdio: 'pipe' },
      );
    });

    it('should use sshPort 22 by default', async () => {
      const proc = makeMockSshProcess();
      spawnMock.mockReturnValue(proc);
      fetchMock.mockResolvedValue({ ok: true, status: 200 });

      const entry = makeRemoteEntry();
      const { openTunnel } = await import('./tunnel.js');
      await openTunnel(entry as Parameters<typeof openTunnel>[0]);

      const spawnArgs = spawnMock.mock.calls[0][1] as string[];
      const portFlagIdx = spawnArgs.indexOf('-p');
      expect(portFlagIdx).not.toBe(-1);
      expect(spawnArgs[portFlagIdx + 1]).toBe('22');
    });
  });

  // -------------------------------------------------------------------------
  // Successful tunnel setup
  // -------------------------------------------------------------------------

  describe('successful probe', () => {
    it('should resolve the tunnel handle when probe returns 200', async () => {
      const proc = makeMockSshProcess();
      spawnMock.mockReturnValue(proc);
      fetchMock.mockResolvedValue({ ok: true, status: 200 });

      const entry = makeRemoteEntry({ localPort: 19001 });
      const { openTunnel } = await import('./tunnel.js');
      const handle = await openTunnel(entry as Parameters<typeof openTunnel>[0]);

      expect(handle).toBeDefined();
      expect(handle.localPort).toBe(19001);
    });

    it('should resolve when the server returns a non-5xx error (e.g. 404)', async () => {
      // A 404 means the tunnel is up but the path is wrong — still counts as connected
      const proc = makeMockSshProcess();
      spawnMock.mockReturnValue(proc);
      fetchMock.mockResolvedValue({ ok: false, status: 404 });

      const entry = makeRemoteEntry();
      const { openTunnel } = await import('./tunnel.js');
      const handle = await openTunnel(entry as Parameters<typeof openTunnel>[0]);

      expect(handle).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // SSH process exit before probe succeeds
  // -------------------------------------------------------------------------

  describe('early exit', () => {
    it('should reject with TunnelError when ssh process exits before probe succeeds', async () => {
      const proc = makeMockSshProcess();
      spawnMock.mockReturnValue(proc);

      // fetch will always reject (connection refused) — tunnel never ready
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

      const entry = makeRemoteEntry();
      const { openTunnel } = await import('./tunnel.js');

      // Kick off the tunnel open, then immediately emit exit.
      // Attach .catch() immediately to avoid "unhandled rejection" warnings
      // from Node's detection before the assertion's .rejects can attach.
      const tunnelPromise = openTunnel(entry as Parameters<typeof openTunnel>[0]);
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      tunnelPromise.catch(() => {});

      // Let the setInterval and listeners register (microtask queue flush)
      await new Promise((resolve) => setTimeout(resolve, 0));

      proc.exitCode = 1;
      proc.emit('exit', 1, null);

      await expect(tunnelPromise).rejects.toThrow(TunnelError);
    });

    it('should include alias in TunnelError when ssh exits early', async () => {
      const proc = makeMockSshProcess();
      spawnMock.mockReturnValue(proc);
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

      const entry = makeRemoteEntry({ alias: 'my-alias' });
      const { openTunnel } = await import('./tunnel.js');

      const tunnelPromise = openTunnel(entry as Parameters<typeof openTunnel>[0]);
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      tunnelPromise.catch(() => {});

      await new Promise((resolve) => setTimeout(resolve, 0));
      proc.exitCode = 1;
      proc.emit('exit', 1, null);

      await expect(tunnelPromise).rejects.toThrow('my-alias');
    });

    it('should include stderr output in TunnelError message when ssh exits', async () => {
      const proc = makeMockSshProcess();
      spawnMock.mockReturnValue(proc);
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

      const entry = makeRemoteEntry();
      const { openTunnel } = await import('./tunnel.js');

      const tunnelPromise = openTunnel(entry as Parameters<typeof openTunnel>[0]);
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      tunnelPromise.catch(() => {});

      await new Promise((resolve) => setTimeout(resolve, 0));

      // Emit stderr data before exit
      proc.stderr.emit('data', Buffer.from('Connection refused\n'));
      proc.exitCode = 255;
      proc.emit('exit', 255, null);

      await expect(tunnelPromise).rejects.toThrow('Connection refused');
    });
  });

  // -------------------------------------------------------------------------
  // Timeout
  // -------------------------------------------------------------------------

  describe('timeout', () => {
    // The tunnel probes on a setInterval. To simulate timeout without
    // unhandled rejections we make fetch return a pending-forever promise
    // (so no rejection leaks) and advance fake timers past the 10s deadline.
    function neverResolvingFetch(): Promise<never> {
      return new Promise(() => {
        // intentionally never resolves or rejects
      });
    }

    it('should reject with TunnelError after timeout waiting for probe', async () => {
      vi.useFakeTimers();

      const proc = makeMockSshProcess();
      // Override kill so it does NOT emit 'exit' — the timeout path calls
      // sshProcess.kill('SIGTERM') before calling settle(), and our default
      // mock emits 'exit' synchronously which would fire onExit and settle
      // with "exited prematurely" instead of "timeout".
      proc.kill = vi.fn();
      spawnMock.mockReturnValue(proc);

      // fetch hangs forever — probe never succeeds, no unhandled rejections
      fetchMock.mockImplementation(neverResolvingFetch);

      const entry = makeRemoteEntry();
      const { openTunnel } = await import('./tunnel.js');

      // Attach .catch() immediately to suppress Node's "unhandled rejection"
      // detection, which fires before the awaited assertion can attach.
      const tunnelPromise = openTunnel(entry as Parameters<typeof openTunnel>[0]);
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const silenced = tunnelPromise.catch(() => {});

      // Advance past the 10s timeout (PROBE_TIMEOUT_MS = 10_000)
      await vi.advanceTimersByTimeAsync(11_000);
      await silenced;

      await expect(tunnelPromise).rejects.toThrow(TunnelError);
    });

    it('should include "timeout" in the TunnelError message', async () => {
      vi.useFakeTimers();

      const proc = makeMockSshProcess();
      // Same reason: don't emit 'exit' from kill so the timeout message wins
      proc.kill = vi.fn();
      spawnMock.mockReturnValue(proc);

      // fetch hangs forever — no unhandled rejections
      fetchMock.mockImplementation(neverResolvingFetch);

      const entry = makeRemoteEntry();
      const { openTunnel } = await import('./tunnel.js');

      const tunnelPromise = openTunnel(entry as Parameters<typeof openTunnel>[0]);
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const silenced = tunnelPromise.catch(() => {});

      await vi.advanceTimersByTimeAsync(11_000);
      await silenced;

      await expect(tunnelPromise).rejects.toThrow('timeout');
    });
  });

  // -------------------------------------------------------------------------
  // TunnelHandle.close()
  // -------------------------------------------------------------------------

  describe('TunnelHandle.close()', () => {
    it('should send SIGTERM to the SSH process when close() is called', async () => {
      const proc = makeMockSshProcess();
      spawnMock.mockReturnValue(proc);
      fetchMock.mockResolvedValue({ ok: true, status: 200 });

      const entry = makeRemoteEntry();
      const { openTunnel } = await import('./tunnel.js');
      const handle = await openTunnel(entry as Parameters<typeof openTunnel>[0]);

      await handle.close();

      expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should be idempotent — calling close() twice should not throw', async () => {
      const proc = makeMockSshProcess();
      spawnMock.mockReturnValue(proc);
      fetchMock.mockResolvedValue({ ok: true, status: 200 });

      const entry = makeRemoteEntry();
      const { openTunnel } = await import('./tunnel.js');
      const handle = await openTunnel(entry as Parameters<typeof openTunnel>[0]);

      await handle.close();
      await expect(handle.close()).resolves.toBeUndefined();

      // kill should only be called once
      expect(proc.kill).toHaveBeenCalledTimes(1);
    });

    it('should not call kill when process has already exited', async () => {
      const proc = makeMockSshProcess();
      spawnMock.mockReturnValue(proc);
      fetchMock.mockResolvedValue({ ok: true, status: 200 });

      const entry = makeRemoteEntry();
      const { openTunnel } = await import('./tunnel.js');
      const handle = await openTunnel(entry as Parameters<typeof openTunnel>[0]);

      // Simulate the SSH process exiting on its own after tunnel is open
      proc.exitCode = 0;

      await handle.close();

      expect(proc.kill).not.toHaveBeenCalled();
    });

    it('should expose the correct localPort on the handle', async () => {
      const proc = makeMockSshProcess();
      spawnMock.mockReturnValue(proc);
      fetchMock.mockResolvedValue({ ok: true, status: 200 });

      const entry = makeRemoteEntry({ localPort: 42000 });
      const { openTunnel } = await import('./tunnel.js');
      const handle = await openTunnel(entry as Parameters<typeof openTunnel>[0]);

      expect(handle.localPort).toBe(42000);
    });
  });
});
