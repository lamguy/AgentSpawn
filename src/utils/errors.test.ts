import { describe, it, expect } from 'vitest';
import {
  AgentSpawnError,
  SessionNotFoundError,
  SessionAlreadyExistsError,
  RegistryCorruptError,
  SpawnFailedError,
} from './errors.js';

describe('Custom Errors', () => {
  it('AgentSpawnError has correct message and code', () => {
    const err = new AgentSpawnError('test message', 'TEST_CODE');
    expect(err.message).toBe('test message');
    expect(err.code).toBe('TEST_CODE');
  });

  it('AgentSpawnError is instanceof Error', () => {
    const err = new AgentSpawnError('test', 'CODE');
    expect(err).toBeInstanceOf(Error);
  });

  it('SessionNotFoundError has code SESSION_NOT_FOUND', () => {
    const err = new SessionNotFoundError('my-session');
    expect(err.code).toBe('SESSION_NOT_FOUND');
    expect(err.message).toBe('Session not found: my-session');
  });

  it('SessionAlreadyExistsError has code SESSION_EXISTS', () => {
    const err = new SessionAlreadyExistsError('my-session');
    expect(err.code).toBe('SESSION_EXISTS');
    expect(err.message).toBe('Session already exists: my-session');
  });

  it('RegistryCorruptError has code REGISTRY_CORRUPT', () => {
    const err = new RegistryCorruptError('/tmp/registry.json');
    expect(err.code).toBe('REGISTRY_CORRUPT');
    expect(err.message).toBe('Registry file is corrupt: /tmp/registry.json');
  });

  it('SpawnFailedError has code SPAWN_FAILED', () => {
    const err = new SpawnFailedError('my-session', 'timeout');
    expect(err.code).toBe('SPAWN_FAILED');
    expect(err.message).toBe('Failed to spawn session my-session: timeout');
  });
});
