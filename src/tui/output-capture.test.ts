import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OutputCapture } from './output-capture.js';
import type { Session } from '../core/session.js';
import type { Logger } from '../utils/logger.js';

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

  // ── maxTotalLines (global eviction) ────────────────────────────────────

  describe('maxTotalLines global eviction', () => {
    it('should evict oldest lines across all sessions when totalLineCount exceeds maxTotalLines', () => {
      const cap = new OutputCapture({ maxTotalLines: 5, maxLinesPerSession: 10 });
      const sessionA = createMockSession();
      const sessionB = createMockSession();

      cap.captureSession('a', sessionA);
      cap.captureSession('b', sessionB);

      // Add 3 lines to session a (timestamps earlier)
      sessionA.emit('data', 'a1');
      sessionA.emit('data', 'a2');
      sessionA.emit('data', 'a3');

      // Add 3 lines to session b (timestamps later) -- total = 6, exceeds 5
      sessionB.emit('data', 'b1');
      sessionB.emit('data', 'b2');
      sessionB.emit('data', 'b3');

      // Should have evicted the oldest line (a1) to get back to 5
      const linesA = cap.getLines('a');
      const linesB = cap.getLines('b');

      expect(linesA.length + linesB.length).toBe(5);
      // a1 was the oldest, so it should be evicted
      expect(linesA[0].text).toBe('a2');
      expect(linesB).toHaveLength(3);
    });

    it('should evict from the session with the oldest line first', () => {
      const cap = new OutputCapture({ maxTotalLines: 4, maxLinesPerSession: 10 });
      const sessionA = createMockSession();
      const sessionB = createMockSession();

      cap.captureSession('a', sessionA);
      cap.captureSession('b', sessionB);

      // Interleave so that oldest is always in session a
      sessionA.emit('data', 'a1');
      sessionB.emit('data', 'b1');
      sessionA.emit('data', 'a2');
      sessionB.emit('data', 'b2');
      // total=4, at limit

      // Push one more into session b, total=5, evicts a1
      sessionB.emit('data', 'b3');

      const linesA = cap.getLines('a');
      expect(linesA).toHaveLength(1);
      expect(linesA[0].text).toBe('a2');

      const linesB = cap.getLines('b');
      expect(linesB).toHaveLength(3);
    });

    it('should use default maxTotalLines of 10000 when not specified', () => {
      const cap = new OutputCapture({ maxLinesPerSession: 5000 });
      const sessionA = createMockSession();
      const sessionB = createMockSession();
      const sessionC = createMockSession();

      cap.captureSession('a', sessionA);
      cap.captureSession('b', sessionB);
      cap.captureSession('c', sessionC);

      // Add 4000 lines to each session (12000 total, exceeds 10000)
      for (let i = 0; i < 4000; i++) {
        sessionA.emit('data', `a-${i}`);
      }
      for (let i = 0; i < 4000; i++) {
        sessionB.emit('data', `b-${i}`);
      }
      for (let i = 0; i < 4000; i++) {
        sessionC.emit('data', `c-${i}`);
      }

      const total =
        cap.getLines('a').length +
        cap.getLines('b').length +
        cap.getLines('c').length;

      expect(total).toBe(10000);
    });

    it('should remove empty session buffer from map after global eviction', () => {
      const cap = new OutputCapture({ maxTotalLines: 3, maxLinesPerSession: 10 });
      const sessionA = createMockSession();
      const sessionB = createMockSession();

      cap.captureSession('a', sessionA);
      cap.captureSession('b', sessionB);

      // Add 1 line to session a
      sessionA.emit('data', 'a1');

      // Add 3 lines to session b -- total=4, exceeds 3, evicts a1
      sessionB.emit('data', 'b1');
      sessionB.emit('data', 'b2');
      sessionB.emit('data', 'b3');

      // Session a buffer should be removed from the map since it's empty
      expect(cap.getSessionNames()).not.toContain('a');
      expect(cap.getLines('a')).toEqual([]);
      expect(cap.getLines('b')).toHaveLength(3);
    });

    it('should not evict when maxTotalLines is Infinity (disabled)', () => {
      const cap = new OutputCapture({ maxTotalLines: Infinity, maxLinesPerSession: 100 });
      const sessionA = createMockSession();

      cap.captureSession('a', sessionA);

      for (let i = 0; i < 50; i++) {
        sessionA.emit('data', `line-${i}`);
      }

      expect(cap.getLines('a')).toHaveLength(50);
    });

    it('should not evict when maxTotalLines is 0 (treated as Infinity)', () => {
      const cap = new OutputCapture({ maxTotalLines: 0, maxLinesPerSession: 100 });
      const sessionA = createMockSession();

      cap.captureSession('a', sessionA);

      for (let i = 0; i < 50; i++) {
        sessionA.emit('data', `line-${i}`);
      }

      expect(cap.getLines('a')).toHaveLength(50);
    });
  });

  // ── maxLineLength (line truncation) ────────────────────────────────────

  describe('maxLineLength line truncation', () => {
    it('should truncate lines exceeding maxLineLength and append " [truncated]"', () => {
      const cap = new OutputCapture({ maxLineLength: 20 });
      cap.captureSession('alpha', session);

      session.emit('data', 'short');
      session.emit('data', 'this is a very long line that exceeds the limit');

      const lines = cap.getLines('alpha');
      expect(lines[0].text).toBe('short');
      expect(lines[1].text).toBe('this is a very long  [truncated]');
      expect(lines[1].text.startsWith('this is a very long ')).toBe(true);
      expect(lines[1].text.endsWith(' [truncated]')).toBe(true);
    });

    it('should not truncate lines at or under the maxLineLength', () => {
      const cap = new OutputCapture({ maxLineLength: 10 });
      cap.captureSession('alpha', session);

      session.emit('data', '1234567890'); // exactly 10 chars
      session.emit('data', '123456789');  // 9 chars

      const lines = cap.getLines('alpha');
      expect(lines[0].text).toBe('1234567890');
      expect(lines[1].text).toBe('123456789');
    });

    it('should truncate promptStart lines that exceed maxLineLength', () => {
      const longPrompt = 'x'.repeat(50);
      const cap = new OutputCapture({ maxLineLength: 20 });
      cap.captureSession('alpha', session);

      session.emit('promptStart', longPrompt);

      const lines = cap.getLines('alpha');
      // The text is "You: " + 50 x's = 54 chars, truncated to 20 + " [truncated]"
      expect(lines[0].text).toBe('You: ' + 'x'.repeat(15) + ' [truncated]');
    });

    it('should use default maxLineLength of 10000 when not specified', () => {
      const cap = new OutputCapture();
      cap.captureSession('alpha', session);

      // Line of exactly 10000 chars should not be truncated
      const exact = 'a'.repeat(10000);
      session.emit('data', exact);
      expect(cap.getLines('alpha')[0].text).toBe(exact);

      // Line of 10001 chars should be truncated
      const over = 'b'.repeat(10001);
      session.emit('data', over);
      expect(cap.getLines('alpha')[1].text).toBe('b'.repeat(10000) + ' [truncated]');
    });

    it('should not truncate when maxLineLength is Infinity (disabled)', () => {
      const cap = new OutputCapture({ maxLineLength: Infinity });
      cap.captureSession('alpha', session);

      const longLine = 'z'.repeat(50000);
      session.emit('data', longLine);

      expect(cap.getLines('alpha')[0].text).toBe(longLine);
    });

    it('should not truncate when maxLineLength is 0 (treated as Infinity)', () => {
      const cap = new OutputCapture({ maxLineLength: 0 });
      cap.captureSession('alpha', session);

      const longLine = 'z'.repeat(50000);
      session.emit('data', longLine);

      expect(cap.getLines('alpha')[0].text).toBe(longLine);
    });
  });

  // ── Eviction warning logging ───────────────────────────────────────────

  describe('eviction warning logging', () => {
    it('should log a warning when global eviction occurs', () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as unknown as Logger;

      // Use two sessions so per-session cap does not interfere with global cap
      const cap = new OutputCapture({ maxTotalLines: 3, maxLinesPerSession: 3 }, mockLogger);
      const sessionA = createMockSession();
      const sessionB = createMockSession();

      cap.captureSession('a', sessionA);
      cap.captureSession('b', sessionB);

      sessionA.emit('data', 'a1');
      sessionA.emit('data', 'a2');
      sessionA.emit('data', 'a3');
      // total = 3, at limit, no eviction yet
      expect(mockLogger.warn).not.toHaveBeenCalled();

      // Adding to session b triggers global eviction of 1 line from session a
      sessionB.emit('data', 'b1');

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('evicted 1 line(s)'),
      );
    });

    it('should report the number of evicted lines in the warning', () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as unknown as Logger;

      const cap = new OutputCapture({ maxTotalLines: 2, maxLinesPerSession: 2 }, mockLogger);
      const sessionA = createMockSession();
      const sessionB = createMockSession();

      cap.captureSession('a', sessionA);
      cap.captureSession('b', sessionB);

      sessionA.emit('data', 'a1');
      sessionA.emit('data', 'a2');
      // At limit, no eviction yet

      // Add 2 lines to session b, should evict 2 lines total (one per appendLine call)
      sessionB.emit('data', 'b1');
      sessionB.emit('data', 'b2');

      // Each appendLine that triggers eviction logs separately
      expect(mockLogger.warn).toHaveBeenCalled();
      // All warn calls should mention eviction
      for (const call of (mockLogger.warn as ReturnType<typeof vi.fn>).mock.calls) {
        expect(call[0]).toContain('evicted');
        expect(call[0]).toContain('global limit of 2');
      }
    });

    it('should log a warning when maxTotalLines is less than maxLinesPerSession', () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as unknown as Logger;

      // maxTotalLines (5) < maxLinesPerSession (10), should warn and clamp
      new OutputCapture({ maxTotalLines: 5, maxLinesPerSession: 10 }, mockLogger);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('maxTotalLines (5) is less than maxLinesPerSession (10)'),
      );
    });
  });

  // ── clearSession / clearAll with totalLineCount ────────────────────────

  describe('clearSession and clearAll with totalLineCount tracking', () => {
    it('should correctly decrement totalLineCount when clearing a session', () => {
      const cap = new OutputCapture({ maxTotalLines: 6, maxLinesPerSession: 10 });
      const sessionA = createMockSession();
      const sessionB = createMockSession();

      cap.captureSession('a', sessionA);
      cap.captureSession('b', sessionB);

      // Add 3 lines to each session (total = 6, at limit)
      sessionA.emit('data', 'a1');
      sessionA.emit('data', 'a2');
      sessionA.emit('data', 'a3');
      sessionB.emit('data', 'b1');
      sessionB.emit('data', 'b2');
      sessionB.emit('data', 'b3');

      // Clear session a (should free 3 from totalLineCount)
      cap.clearSession('a');
      expect(cap.getLines('a')).toHaveLength(0);

      // Now we can add 3 more lines to session b without triggering eviction
      sessionB.emit('data', 'b4');
      sessionB.emit('data', 'b5');
      sessionB.emit('data', 'b6');

      // session b should have all 6 lines (3 original + 3 new)
      expect(cap.getLines('b')).toHaveLength(6);
    });

    it('should reset totalLineCount to 0 when clearing all sessions', () => {
      const cap = new OutputCapture({ maxTotalLines: 4, maxLinesPerSession: 10 });
      const sessionA = createMockSession();
      const sessionB = createMockSession();

      cap.captureSession('a', sessionA);
      cap.captureSession('b', sessionB);

      sessionA.emit('data', 'a1');
      sessionA.emit('data', 'a2');
      sessionB.emit('data', 'b1');
      sessionB.emit('data', 'b2');
      // total = 4, at limit

      cap.clearAll();

      // After clearing, we should be able to add 4 more lines without eviction
      const sessionC = createMockSession();
      cap.captureSession('c', sessionC);
      sessionC.emit('data', 'c1');
      sessionC.emit('data', 'c2');
      sessionC.emit('data', 'c3');
      sessionC.emit('data', 'c4');

      expect(cap.getLines('c')).toHaveLength(4);
    });
  });
});
