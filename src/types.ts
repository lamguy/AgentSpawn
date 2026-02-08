import type { ChildProcess } from 'node:child_process';
import type { Writable, Readable } from 'node:stream';
import type { HistoryStore } from './core/history.js';

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
  permissionMode?: string;
  promptTimeoutMs?: number;
}

export interface SessionInfo {
  name: string;
  pid: number;
  state: SessionState;
  startedAt: Date | null;
  workingDirectory: string;
  exitCode?: number | null;
  /** Number of prompts sent in this session (0 if not yet interacted) */
  promptCount: number;
  permissionMode?: string;
}

export interface RegistryEntry {
  name: string;
  pid: number;
  state: SessionState;
  startedAt: string;
  workingDirectory: string;
  exitCode?: number | null;
  claudeSessionId?: string;
  promptCount?: number;
  permissionMode?: string;
}

export interface RegistryData {
  version: number;
  sessions: Record<string, RegistryEntry>;
}

export interface ManagerOptions {
  registryPath?: string;
  shutdownTimeoutMs?: number;
  historyStore?: HistoryStore;
}

export interface RouterOptions {
  prefixOutput?: boolean;
}

export interface WorkspaceEntry {
  name: string;
  sessionNames: string[];
  createdAt: string;
}

export interface WorkspaceData {
  version: number;
  workspaces: Record<string, WorkspaceEntry>;
}

export interface PromptHistoryEntry {
  index: number;
  prompt: string;
  responsePreview: string;
  timestamp: string;
}

export interface AgentSpawnConfig {
  registryPath: string;
  workspacesPath?: string;
  historyDir?: string;
  logLevel: string;
  shutdownTimeoutMs: number;
}
