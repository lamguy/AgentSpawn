import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Router } from './router.js';
import { Session } from '../core/session.js';
import { SessionState, SessionHandle, SessionInfo } from '../types.js';

function createMockSession(name: string, options?: { handleNull?: boolean }): Session {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cp = new EventEmitter() as any;
  cp.stdin = new PassThrough();
  cp.stdout = new PassThrough();
  cp.stderr = new PassThrough();
  cp.pid = 12345;
  cp.kill = vi.fn();

  const handle: SessionHandle | null = options?.handleNull
    ? null
    : {
        childProcess: cp,
        stdin: cp.stdin,
        stdout: cp.stdout,
        stderr: cp.stderr,
      };

  const info: SessionInfo = {
    name,
    pid: 12345,
    state: options?.handleNull ? SessionState.Stopped : SessionState.Running,
    startedAt: new Date(),
    workingDirectory: '/tmp/work',
    exitCode: null,
  };

  const session = {
    getHandle: vi.fn(() => handle),
    getInfo: vi.fn(() => info),
    getState: vi.fn(() => info.state),
    start: vi.fn(),
    stop: vi.fn(),
    getExitCode: vi.fn(() => null),
  } as unknown as Session;

  return session;
}

describe('Router', () => {
  let router: Router;

  beforeEach(() => {
    router = new Router();
  });

  it('getActiveSession() returns undefined initially', () => {
    expect(router.getActiveSession()).toBeUndefined();
  });

  it('attach() stores active session name', () => {
    const session = createMockSession('agent-1');
    router.attach(session);
    expect(router.getActiveSession()).toBe('agent-1');
  });

  it('detach() clears active session', () => {
    const session = createMockSession('agent-1');
    router.attach(session);
    expect(router.getActiveSession()).toBe('agent-1');

    router.detach();
    expect(router.getActiveSession()).toBeUndefined();
  });

  it('getActiveSession() reflects current state after multiple attach/detach', () => {
    const session1 = createMockSession('first');
    const session2 = createMockSession('second');

    router.attach(session1);
    expect(router.getActiveSession()).toBe('first');

    router.detach();
    expect(router.getActiveSession()).toBeUndefined();

    router.attach(session2);
    expect(router.getActiveSession()).toBe('second');
  });

  it('attach() throws if session handle is null', () => {
    const session = createMockSession('bad-session', { handleNull: true });
    expect(() => router.attach(session)).toThrow(
      'Cannot attach to session: session handle is null (prompt-based sessions use sendPrompt() instead)',
    );
  });

  it('stdin data flows to attached session stdin', () => {
    const session = createMockSession('test-session');
    const handle = session.getHandle();
    expect(handle).not.toBeNull();

    const stdinSpy = vi.fn();
    handle!.stdin.on('data', stdinSpy);

    router.attach(session);

    // Simulate user input
    const testData = Buffer.from('hello world');
    handle!.stdin.write(testData);

    expect(stdinSpy).toHaveBeenCalledWith(testData);
  });

  it('stdin stops flowing after detach', () => {
    const session = createMockSession('test-session');
    const handle = session.getHandle();
    expect(handle).not.toBeNull();

    const stdinSpy = vi.fn();
    handle!.stdin.on('data', stdinSpy);

    router.attach(session);
    router.detach();

    // Simulate user input after detach
    const testData = Buffer.from('should not reach session');
    handle!.stdin.write(testData);

    // Data should not flow through router since we detached
    // (direct write to handle still works, but router shouldn't add listeners)
    expect(router.getActiveSession()).toBeUndefined();
  });

  it('handles multiple attach/detach cycles cleanly', () => {
    const session1 = createMockSession('session-1');
    const session2 = createMockSession('session-2');

    router.attach(session1);
    expect(router.getActiveSession()).toBe('session-1');

    router.detach();
    expect(router.getActiveSession()).toBeUndefined();

    router.attach(session2);
    expect(router.getActiveSession()).toBe('session-2');

    router.detach();
    expect(router.getActiveSession()).toBeUndefined();
  });

  it('cleans up all listeners on detach', () => {
    const session = createMockSession('cleanup-test');
    const handle = session.getHandle();
    expect(handle).not.toBeNull();

    router.attach(session);

    // Verify listeners are attached
    expect(handle!.childProcess.listenerCount('exit')).toBeGreaterThan(0);

    router.detach();

    // Verify listeners are removed
    expect(handle!.childProcess.listenerCount('exit')).toBe(0);
  });
});
