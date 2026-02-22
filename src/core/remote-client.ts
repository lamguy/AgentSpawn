import { SessionConfig, SessionInfo } from '../types.js';
import { TunnelError } from '../utils/errors.js';

export class RemoteClient {
  constructor(
    private readonly baseUrl: string,
    private readonly alias: string,
  ) {}

  async listSessions(): Promise<SessionInfo[]> {
    const response = await fetch(`${this.baseUrl}/api/sessions`);
    if (!response.ok) {
      let reason = response.statusText;
      try {
        const body = (await response.json()) as { error?: string };
        reason = body.error ?? reason;
      } catch {
        // ignore JSON parse failure; use statusText
      }
      throw new TunnelError(this.alias, reason);
    }
    const sessions = (await response.json()) as SessionInfo[];
    return sessions.map((s) => ({ ...s, remoteAlias: this.alias }));
  }

  async startSession(config: SessionConfig): Promise<SessionInfo> {
    const response = await fetch(`${this.baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!response.ok) {
      let reason = response.statusText;
      try {
        const body = (await response.json()) as { error?: string };
        reason = body.error ?? reason;
      } catch {
        // ignore JSON parse failure; use statusText
      }
      throw new TunnelError(this.alias, reason);
    }
    const session = (await response.json()) as SessionInfo;
    return { ...session, remoteAlias: this.alias };
  }

  async stopSession(name: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/sessions/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      let reason = response.statusText;
      try {
        const body = (await response.json()) as { error?: string };
        reason = body.error ?? reason;
      } catch {
        // ignore JSON parse failure; use statusText
      }
      throw new TunnelError(this.alias, reason);
    }
  }

  async sendPrompt(sessionName: string, prompt: string): Promise<string> {
    const response = await fetch(
      `${this.baseUrl}/api/sessions/${encodeURIComponent(sessionName)}/prompt`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      },
    );
    if (!response.ok) {
      let reason = response.statusText;
      try {
        const body = (await response.json()) as { error?: string };
        reason = body.error ?? reason;
      } catch {
        // ignore JSON parse failure; use statusText
      }
      throw new TunnelError(this.alias, reason);
    }
    const body = (await response.json()) as { response: string };
    return body.response;
  }
}
