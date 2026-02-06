export enum SessionState {
  Running = 'running',
  Stopped = 'stopped',
  Crashed = 'crashed',
}

export interface SessionConfig {
  name: string;
  workingDirectory: string;
  env?: Record<string, string>;
}

export interface SessionInfo {
  name: string;
  pid: number;
  state: SessionState;
  startedAt: Date | null;
  workingDirectory: string;
}

export interface RegistryEntry {
  name: string;
  pid: number;
  state: SessionState;
  startedAt: string;
  workingDirectory: string;
}

export interface RegistryData {
  version: number;
  sessions: Record<string, RegistryEntry>;
}

export interface ManagerOptions {
  registryPath?: string;
  shutdownTimeoutMs?: number;
}

export interface RouterOptions {
  prefixOutput?: boolean;
}

export interface AgentSpawnConfig {
  registryPath: string;
  logLevel: string;
  shutdownTimeoutMs: number;
}
