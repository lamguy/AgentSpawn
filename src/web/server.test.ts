import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { WebServer } from './server.js';
import { SessionState } from '../types.js';
import type { SessionInfo } from '../types.js';
import type { SessionManager } from '../core/manager.js';

// ── Minimal mock session ───────────────────────────────────────────────────

function makeSession(name: string, overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    name,
    pid: 0,
    state: SessionState.Running,
    startedAt: new Date(),
    workingDirectory: '/tmp',
    exitCode: null,
    promptCount: 0,
    permissionMode: 'bypassPermissions',
    ...overrides,
  };
}

// ── Mock SessionManager ────────────────────────────────────────────────────

function makeMockManager(sessions: SessionInfo[] = []): SessionManager {
  const emitter = new EventEmitter();

  const mockSession = {
    on: vi.fn(),
    sendPrompt: vi.fn().mockResolvedValue('mock response'),
    getInfo: vi.fn(),
  };

  const manager = Object.assign(emitter, {
    listSessions: vi.fn().mockReturnValue(sessions),
    getSession: vi.fn().mockReturnValue(mockSession),
    getSessionInfo: vi.fn((name: string) => sessions.find((s) => s.name === name)),
    startSession: vi.fn().mockResolvedValue({
      getInfo: vi.fn().mockReturnValue(sessions[0] ?? makeSession('test')),
      on: vi.fn(),
    }),
    stopSession: vi.fn().mockResolvedValue(undefined),
  }) as unknown as SessionManager;

  return manager;
}

// ── HTTP helper ────────────────────────────────────────────────────────────

function httpRequest(
  port: number,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        // Disable keep-alive so connections are not reused between tests
        agent: new http.Agent({ keepAlive: false }),
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          try {
            const text = Buffer.concat(chunks).toString();
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(text) });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() });
          }
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('WebServer', () => {
  let server: WebServer;
  let manager: SessionManager;
  const PORT = 17821;

  beforeEach(async () => {
    const sessions = [makeSession('alpha'), makeSession('beta', { state: SessionState.Stopped })];
    manager = makeMockManager(sessions);
    server = new WebServer(manager, PORT);
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
    vi.clearAllMocks();
  });

  // ── Dashboard ────────────────────────────────────────────────────────────

  it('GET / returns HTML dashboard', async () => {
    const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      http.get(`http://127.0.0.1:${PORT}/`, (r) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => resolve({ status: r.statusCode ?? 0, body: Buffer.concat(chunks).toString() }));
      }).on('error', reject);
    });

    expect(res.status).toBe(200);
    expect(res.body).toContain('<!DOCTYPE html>');
    expect(res.body).toContain('AgentSpawn');
  });

  // ── GET /api/sessions ────────────────────────────────────────────────────

  it('GET /api/sessions returns session list', async () => {
    const res = await httpRequest(PORT, 'GET', '/api/sessions');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const body = res.body as SessionInfo[];
    expect(body).toHaveLength(2);
    expect(body[0].name).toBe('alpha');
  });

  // ── POST /api/sessions ───────────────────────────────────────────────────

  it('POST /api/sessions creates a session', async () => {
    const res = await httpRequest(PORT, 'POST', '/api/sessions', {
      name: 'new-session',
      workingDirectory: '/tmp',
      permissionMode: 'bypassPermissions',
    });
    expect(res.status).toBe(201);
    expect(manager.startSession).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'new-session', workingDirectory: '/tmp' }),
    );
  });

  it('POST /api/sessions returns 400 when name is missing', async () => {
    const res = await httpRequest(PORT, 'POST', '/api/sessions', { workingDirectory: '/tmp' });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/name/i);
  });

  // ── DELETE /api/sessions/:name ───────────────────────────────────────────

  it('DELETE /api/sessions/:name stops a session', async () => {
    const res = await httpRequest(PORT, 'DELETE', '/api/sessions/alpha');
    expect(res.status).toBe(200);
    expect(manager.stopSession).toHaveBeenCalledWith('alpha');
  });

  it('DELETE /api/sessions/:name returns 404 when session not found', async () => {
    vi.mocked(manager.stopSession).mockRejectedValueOnce(new Error("Session 'missing' not found"));
    const res = await httpRequest(PORT, 'DELETE', '/api/sessions/missing');
    expect(res.status).toBe(404);
  });

  // ── POST /api/sessions/:name/prompt ─────────────────────────────────────

  it('POST /api/sessions/:name/prompt sends a prompt and returns response', async () => {
    const res = await httpRequest(PORT, 'POST', '/api/sessions/alpha/prompt', {
      prompt: 'Hello',
    });
    expect(res.status).toBe(200);
    expect((res.body as { response: string }).response).toBe('mock response');
  });

  it('POST /api/sessions/:name/prompt returns 404 when session not in memory', async () => {
    vi.mocked(manager.getSession).mockReturnValueOnce(undefined);
    const res = await httpRequest(PORT, 'POST', '/api/sessions/ghost/prompt', { prompt: 'Hi' });
    expect(res.status).toBe(404);
  });

  it('POST /api/sessions/:name/prompt returns 400 when prompt is missing', async () => {
    const res = await httpRequest(PORT, 'POST', '/api/sessions/alpha/prompt', {});
    expect(res.status).toBe(400);
  });

  // ── GET /api/sessions/:name/history ─────────────────────────────────────

  it('GET /api/sessions/:name/history returns empty array when no historyStore', async () => {
    const res = await httpRequest(PORT, 'GET', '/api/sessions/alpha/history');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('GET /api/sessions/:name/history uses historyStore when provided', async () => {
    const historyStore = {
      getBySession: vi.fn().mockResolvedValue([
        { index: 0, prompt: 'hi', responsePreview: 'hello', timestamp: new Date().toISOString() },
      ]),
    };

    const srv2 = new WebServer(
      manager,
      PORT + 1,
      historyStore as unknown as import('../core/history.js').HistoryStore,
    );
    await srv2.start();

    try {
      const res = await httpRequest(PORT + 1, 'GET', '/api/sessions/alpha/history');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect((res.body as unknown[])).toHaveLength(1);
    } finally {
      await srv2.stop();
    }
  });

  // ── 404 fallthrough ──────────────────────────────────────────────────────

  it('unknown routes return 404', async () => {
    const res = await httpRequest(PORT, 'GET', '/not-a-real-path');
    expect(res.status).toBe(404);
  });

  // ── WebSocket broadcast ──────────────────────────────────────────────────

  it('WebSocket receives sessions snapshot on connect', async () => {
    const { WebSocket: WS } = await import('ws');
    const ws = new WS(`ws://127.0.0.1:${PORT}/ws`);

    const msg = await new Promise<unknown>((resolve, reject) => {
      ws.on('message', (data: Buffer) => {
        try { resolve(JSON.parse(data.toString())); } catch { reject(new Error('bad json')); }
      });
      ws.on('error', reject);
    });

    ws.close();

    expect((msg as { type: string }).type).toBe('sessions');
    expect(Array.isArray((msg as { data: unknown[] }).data)).toBe(true);
  });

  it('WebSocket receives sessionUpdate broadcast on manager event', async () => {
    const { WebSocket: WS } = await import('ws');
    const ws = new WS(`ws://127.0.0.1:${PORT}/ws`);

    // Wait for initial connect message
    await new Promise<void>((resolve, reject) => {
      ws.on('message', () => resolve());
      ws.on('error', reject);
    });

    const updateInfo = makeSession('alpha');

    const broadcastMsg = new Promise<unknown>((resolve) => {
      ws.on('message', (data: Buffer) => {
        const msg = JSON.parse(data.toString()) as { type: string };
        if (msg.type === 'sessionUpdate') resolve(msg);
      });
    });

    // Trigger a manager event
    (manager as unknown as EventEmitter).emit('sessionStarted', updateInfo);

    const received = await broadcastMsg;
    ws.close();

    expect((received as { type: string }).type).toBe('sessionUpdate');
    expect((received as { data: { name: string } }).data.name).toBe('alpha');
  });
});
