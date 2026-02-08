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
