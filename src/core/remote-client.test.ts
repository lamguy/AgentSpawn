import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RemoteClient } from './remote-client.js';
import { SessionState } from '../types.js';
import type { SessionInfo, SessionConfig } from '../types.js';
import { TunnelError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Stub fetch globally — must be done before tests run
// ---------------------------------------------------------------------------

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockResponse(status: number, body: unknown): void {
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    json: () => Promise.resolve(body),
  });
}

function makeSessionInfo(name: string): SessionInfo {
  return {
    name,
    pid: 12345,
    state: SessionState.Running,
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    workingDirectory: '/tmp/test',
    promptCount: 0,
  };
}

function makeSessionConfig(name: string): SessionConfig {
  return {
    name,
    workingDirectory: '/tmp/test',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RemoteClient', () => {
  let client: RemoteClient;
  const BASE_URL = 'http://localhost:19000';
  const ALIAS = 'test-remote';

  beforeEach(() => {
    fetchMock.mockReset();
    client = new RemoteClient(BASE_URL, ALIAS);
  });

  // -------------------------------------------------------------------------
  // listSessions()
  // -------------------------------------------------------------------------

  describe('listSessions()', () => {
    it('should call GET /api/sessions', async () => {
      mockResponse(200, []);

      await client.listSessions();

      expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/api/sessions`);
    });

    it('should return sessions with remoteAlias set to the client alias', async () => {
      const session = makeSessionInfo('my-session');
      mockResponse(200, [session]);

      const result = await client.listSessions();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('my-session');
      expect(result[0].remoteAlias).toBe(ALIAS);
    });

    it('should tag all returned sessions with remoteAlias', async () => {
      mockResponse(200, [makeSessionInfo('s1'), makeSessionInfo('s2')]);

      const result = await client.listSessions();

      expect(result).toHaveLength(2);
      for (const session of result) {
        expect(session.remoteAlias).toBe(ALIAS);
      }
    });

    it('should return an empty array when no sessions exist', async () => {
      mockResponse(200, []);

      const result = await client.listSessions();

      expect(result).toEqual([]);
    });

    it('should throw TunnelError on non-2xx response', async () => {
      mockResponse(503, { error: 'Service Unavailable' });

      await expect(client.listSessions()).rejects.toThrow(TunnelError);
    });

    it('should include the alias in the TunnelError message', async () => {
      mockResponse(500, { error: 'Internal Error' });

      await expect(client.listSessions()).rejects.toThrow(ALIAS);
    });

    it('should use statusText when error body has no error field', async () => {
      mockResponse(404, {});

      await expect(client.listSessions()).rejects.toThrow(TunnelError);
    });

    it('should use the error field from response body when present', async () => {
      mockResponse(502, { error: 'Bad gateway detail' });

      const rejection = client.listSessions();
      await expect(rejection).rejects.toThrow('Bad gateway detail');
    });
  });

  // -------------------------------------------------------------------------
  // startSession()
  // -------------------------------------------------------------------------

  describe('startSession()', () => {
    it('should call POST /api/sessions with correct body', async () => {
      const config = makeSessionConfig('new-session');
      const created = makeSessionInfo('new-session');
      mockResponse(201, created);

      await client.startSession(config);

      expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
    });

    it('should return the created session with remoteAlias set', async () => {
      const config = makeSessionConfig('new-session');
      const created = makeSessionInfo('new-session');
      mockResponse(201, created);

      const result = await client.startSession(config);

      expect(result.name).toBe('new-session');
      expect(result.remoteAlias).toBe(ALIAS);
    });

    it('should throw TunnelError on non-2xx response', async () => {
      const config = makeSessionConfig('bad-session');
      mockResponse(400, { error: 'Session name already exists' });

      await expect(client.startSession(config)).rejects.toThrow(TunnelError);
    });

    it('should include the alias in TunnelError on failure', async () => {
      const config = makeSessionConfig('fail-session');
      mockResponse(500, {});

      await expect(client.startSession(config)).rejects.toThrow(ALIAS);
    });
  });

  // -------------------------------------------------------------------------
  // stopSession()
  // -------------------------------------------------------------------------

  describe('stopSession()', () => {
    it('should call DELETE /api/sessions/:name', async () => {
      mockResponse(204, null);

      await client.stopSession('my-session');

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/api/sessions/my-session`,
        { method: 'DELETE' },
      );
    });

    it('should URL-encode the session name', async () => {
      mockResponse(204, null);

      await client.stopSession('session with spaces');

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/api/sessions/session%20with%20spaces`,
        { method: 'DELETE' },
      );
    });

    it('should resolve without a value on success', async () => {
      mockResponse(204, null);

      const result = await client.stopSession('my-session');

      expect(result).toBeUndefined();
    });

    it('should throw TunnelError on non-2xx response', async () => {
      mockResponse(404, { error: 'Session not found' });

      await expect(client.stopSession('ghost')).rejects.toThrow(TunnelError);
    });

    it('should include alias in TunnelError on failure', async () => {
      mockResponse(500, {});

      await expect(client.stopSession('fail')).rejects.toThrow(ALIAS);
    });
  });

  // -------------------------------------------------------------------------
  // sendPrompt()
  // -------------------------------------------------------------------------

  describe('sendPrompt()', () => {
    it('should call POST /api/sessions/:name/prompt with correct body', async () => {
      mockResponse(200, { response: 'Hello from Claude' });

      await client.sendPrompt('my-session', 'Say hello');

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/api/sessions/my-session/prompt`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: 'Say hello' }),
        },
      );
    });

    it('should URL-encode the session name in the path', async () => {
      mockResponse(200, { response: 'ok' });

      await client.sendPrompt('my session', 'hello');

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/api/sessions/my%20session/prompt`,
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should return the response string from the body', async () => {
      mockResponse(200, { response: 'Hello from Claude' });

      const result = await client.sendPrompt('my-session', 'Say hello');

      expect(result).toBe('Hello from Claude');
    });

    it('should throw TunnelError on non-2xx response', async () => {
      mockResponse(500, { error: 'Claude crashed' });

      await expect(client.sendPrompt('my-session', 'hello')).rejects.toThrow(TunnelError);
    });

    it('should include alias in TunnelError on failure', async () => {
      mockResponse(503, {});

      await expect(client.sendPrompt('my-session', 'hello')).rejects.toThrow(ALIAS);
    });

    it('should use error field from response body in TunnelError message', async () => {
      mockResponse(422, { error: 'Session is not running' });

      await expect(client.sendPrompt('stopped-session', 'hello')).rejects.toThrow(
        'Session is not running',
      );
    });
  });

  // -------------------------------------------------------------------------
  // TunnelError structure
  // -------------------------------------------------------------------------

  describe('TunnelError properties', () => {
    it('should produce a TunnelError with code TUNNEL_ERROR', async () => {
      mockResponse(500, {});

      let caughtError: unknown;
      try {
        await client.listSessions();
      } catch (e) {
        caughtError = e;
      }

      expect(caughtError).toBeInstanceOf(TunnelError);
      expect((caughtError as TunnelError).code).toBe('TUNNEL_ERROR');
    });

    it('should include alias in the TunnelError message for all methods', async () => {
      // listSessions
      mockResponse(500, {});
      await expect(client.listSessions()).rejects.toThrow(`"${ALIAS}"`);

      // startSession
      mockResponse(500, {});
      await expect(client.startSession(makeSessionConfig('x'))).rejects.toThrow(`"${ALIAS}"`);

      // stopSession
      mockResponse(500, {});
      await expect(client.stopSession('x')).rejects.toThrow(`"${ALIAS}"`);

      // sendPrompt
      mockResponse(500, {});
      await expect(client.sendPrompt('x', 'hello')).rejects.toThrow(`"${ALIAS}"`);
    });
  });
});
