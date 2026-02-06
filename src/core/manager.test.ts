import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from './manager.js';
import { Session } from './session.js';
import { SessionConfig, SessionState } from '../types.js';
import { SessionAlreadyExistsError, SessionNotFoundError } from '../utils/errors.js';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
  });

  it('can be instantiated', () => {
    expect(manager).toBeInstanceOf(SessionManager);
  });

  it('listSessions() returns empty array when no sessions', () => {
    const sessions = manager.listSessions();
    expect(sessions).toEqual([]);
  });

  it('startSession() creates and returns a session', async () => {
    const config: SessionConfig = {
      name: 'my-session',
      workingDirectory: '/tmp/work',
    };
    const session = await manager.startSession(config);

    expect(session).toBeInstanceOf(Session);
    expect(session.getState()).toBe(SessionState.Running);
    expect(manager.listSessions()).toHaveLength(1);
    expect(manager.listSessions()[0].name).toBe('my-session');
  });

  it('startSession() throws SessionAlreadyExistsError if name already exists', async () => {
    const config: SessionConfig = {
      name: 'dup-session',
      workingDirectory: '/tmp/work',
    };
    await manager.startSession(config);

    await expect(manager.startSession(config)).rejects.toThrow(SessionAlreadyExistsError);
    await expect(manager.startSession(config)).rejects.toThrow(
      'Session already exists: dup-session',
    );
  });

  it('stopSession() removes the session', async () => {
    const config: SessionConfig = {
      name: 'remove-me',
      workingDirectory: '/tmp/work',
    };
    await manager.startSession(config);
    expect(manager.listSessions()).toHaveLength(1);

    await manager.stopSession('remove-me');
    expect(manager.listSessions()).toHaveLength(0);
  });

  it('stopSession() throws SessionNotFoundError if name not found', async () => {
    await expect(manager.stopSession('nonexistent')).rejects.toThrow(SessionNotFoundError);
    await expect(manager.stopSession('nonexistent')).rejects.toThrow(
      'Session not found: nonexistent',
    );
  });

  it('stopAll() stops all sessions', async () => {
    await manager.startSession({ name: 'a', workingDirectory: '/tmp/a' });
    await manager.startSession({ name: 'b', workingDirectory: '/tmp/b' });
    await manager.startSession({ name: 'c', workingDirectory: '/tmp/c' });
    expect(manager.listSessions()).toHaveLength(3);

    await manager.stopAll();
    expect(manager.listSessions()).toHaveLength(0);
  });
});
