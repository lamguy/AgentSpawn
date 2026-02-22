export class AgentSpawnError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'AgentSpawnError';
  }
}

export class SessionNotFoundError extends AgentSpawnError {
  constructor(name: string) {
    super(`Session not found: ${name}`, 'SESSION_NOT_FOUND');
    this.name = 'SessionNotFoundError';
  }
}

export class SessionAlreadyExistsError extends AgentSpawnError {
  constructor(name: string) {
    super(`Session already exists: ${name}`, 'SESSION_EXISTS');
    this.name = 'SessionAlreadyExistsError';
  }
}

export class RegistryCorruptError extends AgentSpawnError {
  constructor(path: string) {
    super(`Registry file is corrupt: ${path}`, 'REGISTRY_CORRUPT');
    this.name = 'RegistryCorruptError';
  }
}

export class RegistryLockError extends AgentSpawnError {
  constructor(path: string, cause?: Error) {
    super(`Failed to acquire lock on registry file: ${path}`, 'REGISTRY_LOCK_FAILED');
    this.name = 'RegistryLockError';
    if (cause) {
      this.cause = cause;
    }
  }
}

export class SpawnFailedError extends AgentSpawnError {
  constructor(name: string, reason: string) {
    super(`Failed to spawn session ${name}: ${reason}`, 'SPAWN_FAILED');
    this.name = 'SpawnFailedError';
  }
}

export class WorkspaceNotFoundError extends AgentSpawnError {
  constructor(name: string) {
    super(`Workspace not found: ${name}`, 'WORKSPACE_NOT_FOUND');
    this.name = 'WorkspaceNotFoundError';
  }
}

export class WorkspaceAlreadyExistsError extends AgentSpawnError {
  constructor(name: string) {
    super(`Workspace already exists: ${name}`, 'WORKSPACE_ALREADY_EXISTS');
    this.name = 'WorkspaceAlreadyExistsError';
  }
}

export class WorkspaceCorruptError extends AgentSpawnError {
  constructor(path: string) {
    super(`Workspace file is corrupt: ${path}`, 'WORKSPACE_CORRUPT');
    this.name = 'WorkspaceCorruptError';
  }
}

export class WorkspaceLockError extends AgentSpawnError {
  constructor(path: string, cause?: Error) {
    super(`Failed to acquire lock on workspace file: ${path}`, 'WORKSPACE_LOCK_FAILED');
    this.name = 'WorkspaceLockError';
    if (cause) {
      this.cause = cause;
    }
  }
}

export class HistoryNotFoundError extends AgentSpawnError {
  constructor(sessionName: string) {
    super(`History not found for session: ${sessionName}`, 'HISTORY_NOT_FOUND');
    this.name = 'HistoryNotFoundError';
  }
}

export class HistoryEntryNotFoundError extends AgentSpawnError {
  constructor(sessionName: string, index: number) {
    super(`History entry ${index} not found for session: ${sessionName}`, 'HISTORY_ENTRY_NOT_FOUND');
    this.name = 'HistoryEntryNotFoundError';
  }
}

export class TemplateNotFoundError extends AgentSpawnError {
  constructor(name: string) {
    super(`Template not found: ${name}`, 'TEMPLATE_NOT_FOUND');
    this.name = 'TemplateNotFoundError';
  }
}

export class TemplateAlreadyExistsError extends AgentSpawnError {
  constructor(name: string) {
    super(`Template already exists: ${name}`, 'TEMPLATE_ALREADY_EXISTS');
    this.name = 'TemplateAlreadyExistsError';
  }
}

export class TemplateCorruptError extends AgentSpawnError {
  constructor(path: string) {
    super(`Template file is corrupt: ${path}`, 'TEMPLATE_CORRUPT');
    this.name = 'TemplateCorruptError';
  }
}

export class TemplateLockError extends AgentSpawnError {
  constructor(path: string, cause?: Error) {
    super(`Failed to acquire lock on template file: ${path}`, 'TEMPLATE_LOCK_FAILED');
    this.name = 'TemplateLockError';
    if (cause) {
      this.cause = cause;
    }
  }
}

export class PromptTimeoutError extends AgentSpawnError {
  constructor(
    public readonly sessionName: string,
    public readonly timeoutMs: number,
    public readonly promptText: string,
  ) {
    super(`Prompt timed out after ${timeoutMs}ms in session "${sessionName}"`, 'PROMPT_TIMEOUT');
    this.name = 'PromptTimeoutError';
  }
}

export class RemoteCorruptError extends AgentSpawnError {
  constructor(path: string) {
    super(`Remotes file is corrupt: ${path}`, 'REMOTE_CORRUPT');
    this.name = 'RemoteCorruptError';
  }
}

export class RemoteLockError extends AgentSpawnError {
  constructor(path: string, cause?: Error) {
    super(`Failed to acquire lock on remotes file: ${path}`, 'REMOTE_LOCK_FAILED');
    this.name = 'RemoteLockError';
    if (cause) {
      this.cause = cause;
    }
  }
}

export class RemoteNotFoundError extends AgentSpawnError {
  constructor(alias: string) {
    super(`Remote not found: ${alias}`, 'REMOTE_NOT_FOUND');
    this.name = 'RemoteNotFoundError';
  }
}

export class RemoteAlreadyExistsError extends AgentSpawnError {
  constructor(alias: string) {
    super(`Remote already exists: ${alias}`, 'REMOTE_ALREADY_EXISTS');
    this.name = 'RemoteAlreadyExistsError';
  }
}

export class TunnelError extends AgentSpawnError {
  constructor(alias: string, reason: string) {
    super(`Tunnel error for remote "${alias}": ${reason}`, 'TUNNEL_ERROR');
    this.name = 'TunnelError';
  }
}

export class SandboxNotAvailableError extends AgentSpawnError {
  constructor() {
    super(
      'No sandbox backend available. Install Docker (all platforms) or bubblewrap/bwrap (Linux).',
      'SANDBOX_NOT_AVAILABLE',
    );
    this.name = 'SandboxNotAvailableError';
  }
}

export class SandboxStartError extends AgentSpawnError {
  constructor(sessionName: string, reason: string) {
    super(`Failed to start sandbox for session "${sessionName}": ${reason}`, 'SANDBOX_START_FAILED');
    this.name = 'SandboxStartError';
  }
}
