import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { SessionManager } from '../core/manager.js';
import { SessionConfig, SessionInfo } from '../types.js';
import { getDashboardHTML } from './dashboard.html.js';
import { HistoryStore } from '../core/history.js';

interface WsMessage {
  type: string;
  data?: unknown;
}

export class WebServer {
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;

  constructor(
    private readonly manager: SessionManager,
    private readonly port: number,
    private readonly historyStore?: HistoryStore,
  ) {}

  async start(): Promise<void> {
    const html = getDashboardHTML(this.port);

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res, html);
    });

    this.wss = new WebSocketServer({ server: this.server });

    this.wss.on('connection', (client) => {
      // Send current session list on connect
      const sessions = this.manager.listSessions();
      this.sendToClient(client, { type: 'sessions', data: sessions });
    });

    // Forward session manager events to all WebSocket clients
    this.manager.on('sessionStarted', (info: SessionInfo) => {
      this.broadcast({ type: 'sessionUpdate', data: info });
    });

    this.manager.on('sessionStopped', (name: string) => {
      this.broadcast({ type: 'sessionRemoved', data: name });
    });

    this.manager.on('sessionCrashed', (event: { sessionName: string }) => {
      const info = this.manager.getSessionInfo(event.sessionName);
      if (info) this.broadcast({ type: 'sessionUpdate', data: info });
    });

    // Wire per-session output events for sessions that are already running
    this.wireSessionEvents();

    // Also wire new sessions as they start
    this.manager.on('sessionStarted', (info: SessionInfo) => {
      const session = this.manager.getSession(info.name);
      if (session) this.wireSession(info.name, session);
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.port, () => resolve());
    });
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (this.wss) {
        this.wss.close(() => resolve());
        this.wss = null;
      } else {
        resolve();
      }
    });

    await new Promise<void>((resolve, reject) => {
      if (this.server) {
        this.server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
        this.server = null;
      } else {
        resolve();
      }
    });
  }

  private wireSessionEvents(): void {
    for (const info of this.manager.listSessions()) {
      const session = this.manager.getSession(info.name);
      if (session) this.wireSession(info.name, session);
    }
  }

  private wireSession(name: string, session: { on: (event: string, cb: (...args: unknown[]) => void) => void }): void {
    session.on('promptStart', (prompt: unknown) => {
      this.broadcast({ type: 'promptStart', data: { sessionName: name, prompt } });
      // Also broadcast a session state update
      const info = this.manager.getSessionInfo(name);
      if (info) this.broadcast({ type: 'sessionUpdate', data: info });
    });

    session.on('data', (chunk: unknown) => {
      this.broadcast({ type: 'output', data: { sessionName: name, chunk } });
    });

    session.on('promptComplete', () => {
      const info = this.manager.getSessionInfo(name);
      if (info) this.broadcast({ type: 'sessionUpdate', data: info });
    });
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse, html: string): void {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    // Dashboard root
    if (url === '/' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    // API routing
    if (url.startsWith('/api/')) {
      this.handleApi(req, res, url, method);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  private handleApi(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: string,
    method: string,
  ): void {
    // GET /api/sessions
    if (url === '/api/sessions' && method === 'GET') {
      const sessions = this.manager.listSessions();
      this.jsonResponse(res, 200, sessions);
      return;
    }

    // POST /api/sessions
    if (url === '/api/sessions' && method === 'POST') {
      this.readBody(req)
        .then((body) => {
          const { name, workingDirectory, permissionMode } = body as {
            name?: string;
            workingDirectory?: string;
            permissionMode?: string;
          };

          if (!name || typeof name !== 'string') {
            this.jsonResponse(res, 400, { error: 'name is required' });
            return;
          }

          const config: SessionConfig = {
            name,
            workingDirectory: workingDirectory ?? process.cwd(),
            permissionMode: permissionMode ?? 'bypassPermissions',
          };

          return this.manager.startSession(config).then((session) => {
            this.jsonResponse(res, 201, session.getInfo());
          });
        })
        .catch((err: unknown) => {
          this.jsonResponse(res, 500, { error: err instanceof Error ? err.message : String(err) });
        });
      return;
    }

    // Match /api/sessions/:name[/...]
    const sessionMatch = url.match(/^\/api\/sessions\/([^/]+)(\/.*)?$/);
    if (sessionMatch) {
      const name = decodeURIComponent(sessionMatch[1]);
      const sub = sessionMatch[2] ?? '';

      // DELETE /api/sessions/:name
      if (sub === '' && method === 'DELETE') {
        this.manager
          .stopSession(name)
          .then(() => {
            this.jsonResponse(res, 200, { ok: true });
          })
          .catch((err: unknown) => {
            this.jsonResponse(res, 404, { error: err instanceof Error ? err.message : String(err) });
          });
        return;
      }

      // POST /api/sessions/:name/prompt
      if (sub === '/prompt' && method === 'POST') {
        const session = this.manager.getSession(name);
        if (!session) {
          this.jsonResponse(res, 404, { error: `Session '${name}' not found or not running` });
          return;
        }

        this.readBody(req)
          .then((body) => {
            const { prompt } = body as { prompt?: string };
            if (!prompt || typeof prompt !== 'string') {
              this.jsonResponse(res, 400, { error: 'prompt is required' });
              return;
            }
            return session.sendPrompt(prompt).then((response) => {
              this.jsonResponse(res, 200, { response });
            });
          })
          .catch((err: unknown) => {
            this.jsonResponse(res, 500, { error: err instanceof Error ? err.message : String(err) });
          });
        return;
      }

      // GET /api/sessions/:name/history
      if (sub === '/history' && method === 'GET') {
        if (!this.historyStore) {
          this.jsonResponse(res, 200, []);
          return;
        }
        this.historyStore
          .getBySession(name)
          .then((entries) => {
            this.jsonResponse(res, 200, entries);
          })
          .catch((err: unknown) => {
            this.jsonResponse(res, 500, { error: err instanceof Error ? err.message : String(err) });
          });
        return;
      }
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  private readBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf-8');
          resolve(raw ? JSON.parse(raw) : {});
        } catch {
          reject(new Error('Invalid JSON body'));
        }
      });
      req.on('error', reject);
    });
  }

  private jsonResponse(res: http.ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  private broadcast(msg: WsMessage): void {
    if (!this.wss) return;
    const payload = JSON.stringify(msg);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  private sendToClient(client: WebSocket, msg: WsMessage): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(msg));
    }
  }
}
