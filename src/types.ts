import type { ChildProcess } from 'node:child_process';
import type { Writable, Readable } from 'node:stream';
import type { HistoryStore } from './core/history.js';
import type { ExitClassification } from './core/restart-policy.js';

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

export interface RestartPolicy {
  enabled: boolean;
  maxRetries: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  retryableExitCodes?: number[];
  replayPrompt?: boolean;
}

export interface SessionConfig {
  name: string;
  workingDirectory: string;
  env?: Record<string, string>;
  permissionMode?: string;
  promptTimeoutMs?: number;
  restartPolicy?: RestartPolicy;
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
  restartPolicy?: RestartPolicy;
}

export interface RegistryData {
  version: number;
  sessions: Record<string, RegistryEntry>;
}

export interface ManagerOptions {
  registryPath?: string;
  shutdownTimeoutMs?: number;
  historyStore?: HistoryStore;
  /** Override the backoff calculation (e.g. `() => 0` in tests for instant restarts). */
  backoffFn?: (attempt: number) => number;
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

export interface TemplateEntry {
  name: string;
  workingDirectory?: string;
  permissionMode?: string;
  /**
   * Reserved for future use. Stored in templates but not yet passed to
   * SessionConfig or the Claude CLI. Will be wired up once Claude Code
   * supports a --system-prompt flag or equivalent.
   */
  systemPrompt?: string;
  env?: Record<string, string>;
  restartPolicy?: RestartPolicy;
  createdAt: string;
}

export interface TemplateData {
  version: number;
  templates: Record<string, TemplateEntry>;
}

export interface BroadcastResult {
  sessionName: string;
  status: 'fulfilled' | 'rejected';
  response?: string;
  error?: string;
}

export interface AgentSpawnConfig {
  registryPath: string;
  workspacesPath?: string;
  historyDir?: string;
  templatesPath?: string;
  logLevel: string;
  shutdownTimeoutMs: number;
}

export interface SessionCrashedEvent {
  sessionName: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  classification: ExitClassification;
  reason: string;
  promptText: string | null;
  retryCount: number;
}
