import type { ChildProcess } from 'node:child_process';
import type { Writable, Readable } from 'node:stream';

export enum SessionState {
  Running = 'running',
  Stopped = 'stopped',
  Crashed = 'crashed',
}

export interface SessionHandle {
  childProcess: ChildProcess;
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
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
  exitCode?: number | null;
}

export interface RegistryEntry {
  name: string;
  pid: number;
  state: SessionState;
  startedAt: string;
  workingDirectory: string;
  exitCode?: number | null;
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
