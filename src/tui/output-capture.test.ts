import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach } from 'vitest';
import { OutputCapture } from './output-capture.js';
import type { Session } from '../core/session.js';

/**
 * Create a mock Session as a plain EventEmitter.
 * OutputCapture only uses the EventEmitter interface (on / removeListener),
 * so a bare EventEmitter is sufficient.
 */
function createMockSession(): Session {
  return new EventEmitter() as unknown as Session;
}

describe('OutputCapture', () => {
  let capture: OutputCapture;
  let session: Session;

  beforeEach(() => {
    capture = new OutputCapture();
    session = createMockSession();
  });

  // ── promptStart ──────────────────────────────────────────────────────────

  describe('promptStart events', () => {
    it('should capture a promptStart event as "You: <prompt>"', () => {
      capture.captureSession('alpha', session);
      session.emit('promptStart', 'my prompt');

      const lines = capture.getLines('alpha');
      expect(lines).toHaveLength(1);
      expect(lines[0].text).toBe('You: my prompt');
      expect(lines[0].isError).toBe(false);
      expect(lines[0].sessionName).toBe('alpha');
    });

    it('should record a valid timestamp on promptStart lines', () => {
      const before = new Date();
      capture.captureSession('alpha', session);
      session.emit('promptStart', 'hello');
      const after = new Date();

      const line = capture.getLines('alpha')[0];
      expect(line.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(line.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  // ── data events ──────────────────────────────────────────────────────────

  describe('data events', () => {
    it('should capture a data event with the response text', () => {
      capture.captureSession('alpha', session);
      session.emit('data', 'response text');

      const lines = capture.getLines('alpha');
      expect(lines).toHaveLength(1);
      expect(lines[0].text).toBe('response text');
      expect(lines[0].isError).toBe(false);
    });

    it('should record correct timestamps on data lines', () => {
      const before = new Date();
      capture.captureSession('alpha', session);
      session.emit('data', 'chunk');
      const after = new Date();

      const line = capture.getLines('alpha')[0];
      expect(line.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(line.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should capture multiple sequential data events as separate lines', () => {
      capture.captureSession('alpha', session);
      session.emit('data', 'first chunk');
      session.emit('data', 'second chunk');

      const lines = capture.getLines('alpha');
      expect(lines).toHaveLength(2);
      expect(lines[0].text).toBe('first chunk');
      expect(lines[1].text).toBe('second chunk');
    });
  });

  // ── promptComplete events ────────────────────────────────────────────────

  describe('promptComplete events', () => {
    it('should append a blank line on promptComplete', () => {
      capture.captureSession('alpha', session);
      session.emit('promptComplete');

      const lines = capture.getLines('alpha');
      expect(lines).toHaveLength(1);
      expect(lines[0].text).toBe('');
      expect(lines[0].isError).toBe(false);
    });
  });

  // ── promptError events ───────────────────────────────────────────────────

  describe('promptError events', () => {
    it('should capture a promptError event with isError true', () => {
      capture.captureSession('alpha', session);
      session.emit('promptError', new Error('test error'));

      const lines = capture.getLines('alpha');
      expect(lines).toHaveLength(1);
      expect(lines[0].text).toBe('Error: test error');
      expect(lines[0].isError).toBe(true);
      expect(lines[0].sessionName).toBe('alpha');
    });
  });

  // ── Multi-line data ─────────────────────────────────────────────────────

  describe('multi-line data handling', () => {
    it('should split data containing newlines into multiple OutputLine objects', () => {
      capture.captureSession('alpha', session);
      session.emit('data', 'line one\nline two\nline three');

      const lines = capture.getLines('alpha');
      expect(lines).toHaveLength(3);
      expect(lines[0].text).toBe('line one');
      expect(lines[1].text).toBe('line two');
      expect(lines[2].text).toBe('line three');
    });

    it('should skip empty strings produced by splitting (trailing newline)', () => {
      capture.captureSession('alpha', session);
      // "hello\n" splits into ["hello", ""] -- the empty line is skipped
      // because lines.length > 1 and line === ''
      session.emit('data', 'hello\n');

      const lines = capture.getLines('alpha');
      expect(lines).toHaveLength(1);
      expect(lines[0].text).toBe('hello');
    });

    it('should preserve a single empty string when data is exactly ""', () => {
      // A single empty string has only one element after split, so the
      // empty-skip guard (lines.length > 1) does not apply.
      capture.captureSession('alpha', session);
      session.emit('data', '');

      const lines = capture.getLines('alpha');
      expect(lines).toHaveLength(1);
      expect(lines[0].text).toBe('');
    });
  });

  // ── Circular buffer ─────────────────────────────────────────────────────

  describe('circular buffer', () => {
    it('should drop oldest lines when buffer exceeds maxLinesPerSession', () => {
      const smallCapture = new OutputCapture({ maxLinesPerSession: 3 });
      smallCapture.captureSession('alpha', session);

      session.emit('data', 'line-1');
      session.emit('data', 'line-2');
      session.emit('data', 'line-3');
      session.emit('data', 'line-4');

      const lines = smallCapture.getLines('alpha');
      expect(lines).toHaveLength(3);
      expect(lines[0].text).toBe('line-2');
      expect(lines[1].text).toBe('line-3');
      expect(lines[2].text).toBe('line-4');
    });

    it('should enforce the limit across mixed event types', () => {
      const smallCapture = new OutputCapture({ maxLinesPerSession: 2 });
      smallCapture.captureSession('alpha', session);

      session.emit('promptStart', 'my prompt');
      session.emit('data', 'response');
      session.emit('promptComplete');

      const lines = smallCapture.getLines('alpha');
      expect(lines).toHaveLength(2);
      // The first line ("You: my prompt") should have been evicted
      expect(lines[0].text).toBe('response');
      expect(lines[1].text).toBe('');
    });

    it('should use 1000 as the default maxLinesPerSession', () => {
      const defaultCapture = new OutputCapture();
      defaultCapture.captureSession('alpha', session);

      for (let i = 0; i < 1005; i++) {
        session.emit('data', `line-${i}`);
      }

      const lines = defaultCapture.getLines('alpha');
      expect(lines).toHaveLength(1000);
      expect(lines[0].text).toBe('line-5');
      expect(lines[999].text).toBe('line-1004');
    });
  });

  // ── Multiple sessions ───────────────────────────────────────────────────

  describe('multiple sessions', () => {
    it('should store output from different sessions separately', () => {
      const sessionA = createMockSession();
      const sessionB = createMockSession();

      capture.captureSession('session-a', sessionA);
      capture.captureSession('session-b', sessionB);

      sessionA.emit('data', 'from A');
      sessionB.emit('data', 'from B');
      sessionA.emit('data', 'also from A');

      const linesA = capture.getLines('session-a');
      const linesB = capture.getLines('session-b');

      expect(linesA).toHaveLength(2);
      expect(linesA[0].text).toBe('from A');
      expect(linesA[1].text).toBe('also from A');
      expect(linesA[0].sessionName).toBe('session-a');

      expect(linesB).toHaveLength(1);
      expect(linesB[0].text).toBe('from B');
      expect(linesB[0].sessionName).toBe('session-b');
    });

    it('should list all captured session names', () => {
      const sessionA = createMockSession();
      const sessionB = createMockSession();

      capture.captureSession('alpha', sessionA);
      capture.captureSession('beta', sessionB);

      sessionA.emit('data', 'hello');

      const names = capture.getSessionNames();
      expect(names).toContain('alpha');
      expect(names).toContain('beta');
    });

    it('should apply circular buffer limits independently per session', () => {
      const smallCapture = new OutputCapture({ maxLinesPerSession: 2 });
      const sessionA = createMockSession();
      const sessionB = createMockSession();

      smallCapture.captureSession('a', sessionA);
      smallCapture.captureSession('b', sessionB);

      sessionA.emit('data', 'a1');
      sessionA.emit('data', 'a2');
      sessionA.emit('data', 'a3');

      sessionB.emit('data', 'b1');

      expect(smallCapture.getLines('a')).toHaveLength(2);
      expect(smallCapture.getLines('a')[0].text).toBe('a2');
      expect(smallCapture.getLines('b')).toHaveLength(1);
    });
  });

  // ── releaseSession ──────────────────────────────────────────────────────

  describe('releaseSession', () => {
    it('should stop capturing events after release', () => {
      capture.captureSession('alpha', session);
      session.emit('data', 'before release');

      capture.releaseSession('alpha');

      session.emit('data', 'after release');
      session.emit('promptStart', 'ignored prompt');
      session.emit('promptComplete');
      session.emit('promptError', new Error('ignored'));

      const lines = capture.getLines('alpha');
      expect(lines).toHaveLength(1);
      expect(lines[0].text).toBe('before release');
    });

    it('should be a no-op when called for an uncaptured session', () => {
      // Should not throw
      expect(() => capture.releaseSession('nonexistent')).not.toThrow();
    });

    it('should not affect other sessions when one is released', () => {
      const sessionA = createMockSession();
      const sessionB = createMockSession();

      capture.captureSession('a', sessionA);
      capture.captureSession('b', sessionB);

      capture.releaseSession('a');

      sessionA.emit('data', 'should be ignored');
      sessionB.emit('data', 'should be captured');

      expect(capture.getLines('a')).toHaveLength(0);
      expect(capture.getLines('b')).toHaveLength(1);
      expect(capture.getLines('b')[0].text).toBe('should be captured');
    });
  });

  // ── captureSession idempotency ──────────────────────────────────────────

  describe('captureSession idempotency', () => {
    it('should not register duplicate listeners when called twice', () => {
      capture.captureSession('alpha', session);
      capture.captureSession('alpha', session);

      session.emit('data', 'only once');

      const lines = capture.getLines('alpha');
      expect(lines).toHaveLength(1);
    });
  });

  // ── Full pipeline (E2E) ─────────────────────────────────────────────────

  describe('full output streaming pipeline', () => {
    it('should capture a complete prompt lifecycle in order', () => {
      capture.captureSession('e2e', session);

      session.emit('promptStart', 'explain TypeScript');
      session.emit('data', 'TypeScript is a typed superset of JavaScript.');
      session.emit('data', 'It compiles to plain JavaScript.');
      session.emit('promptComplete');

      const lines = capture.getLines('e2e');
      expect(lines).toHaveLength(4);

      // Line 0: prompt echo
      expect(lines[0].text).toBe('You: explain TypeScript');
      expect(lines[0].isError).toBe(false);

      // Lines 1-2: streamed response chunks
      expect(lines[1].text).toBe('TypeScript is a typed superset of JavaScript.');
      expect(lines[1].isError).toBe(false);
      expect(lines[2].text).toBe('It compiles to plain JavaScript.');
      expect(lines[2].isError).toBe(false);

      // Line 3: trailing blank line
      expect(lines[3].text).toBe('');
      expect(lines[3].isError).toBe(false);

      // All lines should have the correct session name
      for (const line of lines) {
        expect(line.sessionName).toBe('e2e');
        expect(line.timestamp).toBeInstanceOf(Date);
      }
    });

    it('should capture a prompt lifecycle that ends with an error', () => {
      capture.captureSession('e2e', session);

      session.emit('promptStart', 'do something');
      session.emit('data', 'partial response');
      session.emit('promptError', new Error('connection lost'));

      const lines = capture.getLines('e2e');
      expect(lines).toHaveLength(3);

      expect(lines[0].text).toBe('You: do something');
      expect(lines[0].isError).toBe(false);

      expect(lines[1].text).toBe('partial response');
      expect(lines[1].isError).toBe(false);

      expect(lines[2].text).toBe('Error: connection lost');
      expect(lines[2].isError).toBe(true);
    });

    it('should capture multiple prompts in sequence within one session', () => {
      capture.captureSession('e2e', session);

      // First prompt
      session.emit('promptStart', 'prompt one');
      session.emit('data', 'answer one');
      session.emit('promptComplete');

      // Second prompt
      session.emit('promptStart', 'prompt two');
      session.emit('data', 'answer two');
      session.emit('promptComplete');

      const lines = capture.getLines('e2e');
      expect(lines).toHaveLength(6);

      expect(lines[0].text).toBe('You: prompt one');
      expect(lines[1].text).toBe('answer one');
      expect(lines[2].text).toBe('');
      expect(lines[3].text).toBe('You: prompt two');
      expect(lines[4].text).toBe('answer two');
      expect(lines[5].text).toBe('');
    });
  });

  // ── clearSession / clearAll ─────────────────────────────────────────────

  describe('clearing output', () => {
    it('should clear output for a specific session', () => {
      capture.captureSession('alpha', session);
      session.emit('data', 'some data');

      capture.clearSession('alpha');

      expect(capture.getLines('alpha')).toHaveLength(0);
    });

    it('should clear all sessions at once', () => {
      const sessionA = createMockSession();
      const sessionB = createMockSession();

      capture.captureSession('a', sessionA);
      capture.captureSession('b', sessionB);

      sessionA.emit('data', 'data a');
      sessionB.emit('data', 'data b');

      capture.clearAll();

      expect(capture.getLines('a')).toHaveLength(0);
      expect(capture.getLines('b')).toHaveLength(0);
      expect(capture.getSessionNames()).toHaveLength(0);
    });
  });

  // ── getLines for unknown session ────────────────────────────────────────

  describe('getLines for unknown session', () => {
    it('should return an empty array for a session that was never captured', () => {
      expect(capture.getLines('nonexistent')).toEqual([]);
    });
  });
});
