import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RemotePoller } from './remote-poller.js';
import type { RemoteEntry } from '../types.js';
import { SessionState } from '../types.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Use vi.hoisted() so that the variables are available when vi.mock() factories
// are hoisted to the top of the file by Vitest's transform.
const { mockClose, mockTunnelHandle, mockOpenTunnel, mockListSessions, MockRemoteClient } =
  vi.hoisted(() => {
    const mockClose = vi.fn().mockResolvedValue(undefined);
    const mockTunnelHandle = { localPort: 9999, close: mockClose };
    const mockOpenTunnel = vi.fn().mockResolvedValue(mockTunnelHandle);

    const mockListSessions = vi.fn().mockResolvedValue([]);
    const MockRemoteClient = vi.fn().mockImplementation(() => ({
      listSessions: mockListSessions,
    }));

    return { mockClose, mockTunnelHandle, mockOpenTunnel, mockListSessions, MockRemoteClient };
  });

vi.mock('../core/tunnel.js', () => ({
  openTunnel: (...args: unknown[]) => mockOpenTunnel(...args),
}));

vi.mock('../core/remote-client.js', () => ({
  RemoteClient: MockRemoteClient,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(alias: string): RemoteEntry {
  return {
    alias,
    sshHost: 'example.com',
    sshUser: 'user',
    sshPort: 22,
    remotePort: 7080,
    localPort: 9999,
    addedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RemotePoller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListSessions.mockResolvedValue([]);
    mockOpenTunnel.mockResolvedValue(mockTunnelHandle);
  });

  describe('start() / poll()', () => {
    it('emits "sessions" with correct alias after start()', async () => {
      const entry = makeEntry('server-1');
      const sessions = [
        {
          name: 'my-session',
          pid: 0,
          state: SessionState.Running,
          startedAt: null,
          workingDirectory: '/tmp',
          promptCount: 0,
          remoteAlias: 'server-1',
        },
      ];
      mockListSessions.mockResolvedValue(sessions);

      const poller = new RemotePoller([entry], 60_000);
      const received: unknown[] = [];
      poller.on('sessions', (event) => received.push(event));

      poller.start();

      // Allow the immediate poll microtask to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      await poller.stop();

      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({ alias: 'server-1', sessions });
    });

    it('opens a tunnel once and reuses it on subsequent polls', async () => {
      const entry = makeEntry('server-2');
      // Run two manual polls by using a short interval and waiting
      const poller = new RemotePoller([entry], 10);
      poller.start();

      await new Promise((resolve) => setTimeout(resolve, 40));
      await poller.stop();

      // openTunnel should only be called once even though multiple polls ran
      expect(mockOpenTunnel).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop()', () => {
    it('clears the interval and calls close() on each open tunnel', async () => {
      const entry = makeEntry('server-3');
      const poller = new RemotePoller([entry], 60_000);
      poller.start();

      // Allow the first immediate poll to open the tunnel
      await new Promise((resolve) => setTimeout(resolve, 10));

      await poller.stop();

      expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it('can be called safely when no tunnels are open', async () => {
      // openTunnel throws so no tunnel is stored
      mockOpenTunnel.mockRejectedValueOnce(new Error('connect failed'));

      const entry = makeEntry('server-4');
      const poller = new RemotePoller([entry], 60_000);
      poller.start();

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should not throw
      await expect(poller.stop()).resolves.toBeUndefined();
      expect(mockClose).not.toHaveBeenCalled();
    });
  });

  describe('poll() error handling', () => {
    it('emits "remoteError" when openTunnel throws', async () => {
      mockOpenTunnel.mockRejectedValueOnce(new Error('SSH refused'));

      const entry = makeEntry('server-5');
      const poller = new RemotePoller([entry], 60_000);
      const errors: unknown[] = [];
      poller.on('remoteError', (event) => errors.push(event));

      poller.start();
      await new Promise((resolve) => setTimeout(resolve, 10));
      await poller.stop();

      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        alias: 'server-5',
        error: 'SSH refused',
      });
    });

    it('emits "remoteError" when listSessions throws', async () => {
      mockListSessions.mockRejectedValueOnce(new Error('HTTP 503'));

      const entry = makeEntry('server-6');
      const poller = new RemotePoller([entry], 60_000);
      const errors: unknown[] = [];
      poller.on('remoteError', (event) => errors.push(event));

      poller.start();
      await new Promise((resolve) => setTimeout(resolve, 10));
      await poller.stop();

      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        alias: 'server-6',
        error: 'HTTP 503',
      });
    });

    it('does not throw from poll() when errors occur', async () => {
      mockOpenTunnel.mockRejectedValue(new Error('always fails'));

      const entry = makeEntry('server-7');
      const poller = new RemotePoller([entry], 10);

      // Should not cause unhandled rejection
      poller.start();
      await new Promise((resolve) => setTimeout(resolve, 40));

      await expect(poller.stop()).resolves.toBeUndefined();
    });
  });
});
