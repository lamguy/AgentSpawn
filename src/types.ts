import type { ChildProcess } from 'node:child_process';
import type { Writable, Readable } from 'node:stream';
import type { HistoryStore } from './core/history.js';
import type { ExitClassification } from './core/restart-policy.js';

export type SandboxBackend = 'docker' | 'bwrap' | 'sandbox-exec';

/**
 * Isolation level for sandboxed sessions.
 * - permissive: write isolation only, reads and network open (default)
 * - standard: write isolation + credential dir read-blocking + resource limits
 * - strict:   maximum restriction; bwrap additionally blocks network (note: breaks Claude API)
 */
export type SandboxLevel = 'permissive' | 'standard' | 'strict';

export interface SandboxOptions {
  /** Isolation level. Default: 'permissive'. */
  level?: SandboxLevel;
  /** Custom Docker image (e.g. pinned digest). Default: 'debian:12-slim'. */
  image?: string;
  /** Memory limit for Docker/bwrap (e.g. '512m'). */
  memoryLimit?: string;
  /** CPU limit for Docker (e.g. 0.5). */
  cpuLimit?: number;
}

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
  tags?: string[];
  sandboxed?: boolean;
  sandboxBackend?: SandboxBackend;
  sandboxLevel?: SandboxLevel;
  sandboxImage?: string;
  sandboxMemoryLimit?: string;
  sandboxCpuLimit?: number;
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
  tags?: string[];
  /** When present, this session is proxied from a remote AgentSpawn instance. Absent for all local sessions. */
  remoteAlias?: string;
  sandboxed?: boolean;
  sandboxBackend?: SandboxBackend;
  sandboxLevel?: SandboxLevel;
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
  backoffUntil?: string;
  tags?: string[];
  sandboxed?: boolean;
  sandboxBackend?: SandboxBackend;
  sandboxLevel?: SandboxLevel;
  sandboxImage?: string;
  sandboxMemoryLimit?: string;
  sandboxCpuLimit?: number;
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
  /** Directory containing plugins.json (defaults to ~/.agentspawn). */
  pluginsConfigDir?: string;
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
  sandboxed?: boolean;
  sandboxLevel?: SandboxLevel;
  sandboxImage?: string;
}

export interface SandboxTestResult {
  backend: SandboxBackend;
  level: SandboxLevel;
  writeInsideWorkdir: boolean;
  writeOutsideWorkdir: boolean;  // should be false (blocked)
  readCredentialDir: boolean | null;  // null if not tested at this level
  passed: boolean;
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
  remotesPath?: string;
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

export interface SessionMetrics {
  promptCount: number;
  avgResponseTimeMs: number;
  totalResponseChars: number;
  estimatedTokens: number;  // totalResponseChars / 4 (rough approximation)
  uptimeMs: number;
}

export interface RemoteEntry {
  alias: string;
  sshHost: string;
  sshUser: string;
  sshPort: number;
  remotePort: number;
  localPort: number;
  addedAt: string;
}

export interface RemoteData {
  version: number;
  remotes: Record<string, RemoteEntry>;
}

export type TunnelStatus = 'connected' | 'disconnected' | 'error';
