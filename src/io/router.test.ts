import { describe, it, expect } from 'vitest';
import { Router } from './router.js';
import { SessionState } from '../types.js';

describe('Router', () => {
  it('getActiveSession returns undefined initially', () => {
    const router = new Router();
    expect(router.getActiveSession()).toBeUndefined();
  });

  it('attach sets active session', () => {
    const router = new Router();
    router.attach({
      name: 'agent-1',
      pid: 1234,
      state: SessionState.Running,
      startedAt: new Date(),
      workingDirectory: '/tmp/work',
    });
    expect(router.getActiveSession()).toBe('agent-1');
  });

  it('detach clears active session', () => {
    const router = new Router();
    router.attach({
      name: 'agent-1',
      pid: 1234,
      state: SessionState.Running,
      startedAt: new Date(),
      workingDirectory: '/tmp/work',
    });
    router.detach();
    expect(router.getActiveSession()).toBeUndefined();
  });
});
