import { describe, it, expect, beforeEach } from 'vitest';
import { Session } from './session.js';
import { SessionState, SessionConfig } from '../types.js';

describe('Session', () => {
  let config: SessionConfig;
  let session: Session;

  beforeEach(() => {
    config = {
      name: 'test-session',
      workingDirectory: '/tmp/test',
    };
    session = new Session(config);
  });

  it('can be instantiated with a SessionConfig', () => {
    expect(session).toBeInstanceOf(Session);
  });

  it('getState() returns SessionState.Stopped initially', () => {
    expect(session.getState()).toBe(SessionState.Stopped);
  });

  it('start() changes state to Running', async () => {
    await session.start();
    expect(session.getState()).toBe(SessionState.Running);
  });

  it('stop() changes state to Stopped', async () => {
    await session.start();
    expect(session.getState()).toBe(SessionState.Running);
    await session.stop();
    expect(session.getState()).toBe(SessionState.Stopped);
  });

  it('getInfo() returns correct SessionInfo shape', async () => {
    await session.start();
    const info = session.getInfo();

    expect(info).toHaveProperty('name', 'test-session');
    expect(info).toHaveProperty('pid');
    expect(typeof info.pid).toBe('number');
    expect(info).toHaveProperty('state', SessionState.Running);
    expect(info).toHaveProperty('startedAt');
    expect(info.startedAt).toBeInstanceOf(Date);
    expect(info).toHaveProperty('workingDirectory', '/tmp/test');
  });

  it('getInfo() returns null startedAt before start()', () => {
    const info = session.getInfo();

    expect(info.startedAt).toBeNull();
  });
});
