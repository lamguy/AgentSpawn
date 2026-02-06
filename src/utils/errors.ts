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

export class SpawnFailedError extends AgentSpawnError {
  constructor(name: string, reason: string) {
    super(`Failed to spawn session ${name}: ${reason}`, 'SPAWN_FAILED');
    this.name = 'SpawnFailedError';
  }
}
