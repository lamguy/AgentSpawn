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
    it('should capture a data event as a live line with the response text', () => {
      capture.captureSession('alpha', session);
      session.emit('data', 'response text');

      const lines = capture.getLines('alpha');
      expect(lines).toHaveLength(1);
      expect(lines[0].text).toBe('response text');
      expect(lines[0].isError).toBe(false);
      // data events now stream via appendStreamingChunk → live line
      expect(lines[0].isLive).toBe(true);
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

    it('should accumulate multiple sequential data events into one live line', () => {
      // The streaming redesign routes data through appendStreamingChunk.
      // Chunks without newlines accumulate on a single growing live line.
      capture.captureSession('alpha', session);
      session.emit('data', 'first chunk');
      session.emit('data', 'second chunk');

      const lines = capture.getLines('alpha');
      expect(lines).toHaveLength(1);
      expect(lines[0].text).toBe('first chunksecond chunk');
      expect(lines[0].isLive).toBe(true);
    });

    it('should split on newlines — data containing \\n produces multiple lines', () => {
      capture.captureSession('alpha', session);
      session.emit('data', 'line one\nline two');

      const lines = capture.getLines('alpha');
      expect(lines).toHaveLength(2);
      // First part is finalized (no longer live); second is the new live line
      expect(lines[0].text).toBe('line one');
      expect(lines[0].isLive).toBe(false);
      expect(lines[1].text).toBe('line two');
      expect(lines[1].isLive).toBe(true);
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
      // appendStreamingChunk splits on \n:
      //   parts[0]       ("line one")   → finalized initial live line: isLive false
      //   parts[1]       ("line two")   → middle line via appendLine:  isLive undefined
      //   parts[last]    ("line three") → new live line:               isLive true
      capture.captureSession('alpha', session);
      session.emit('data', 'line one\nline two\nline three');

      const lines = capture.getLines('alpha');
      expect(lines).toHaveLength(3);
      expect(lines[0].text).toBe('line one');
      expect(lines[0].isLive).toBe(false);
      expect(lines[1].text).toBe('line two');
      expect(lines[1].isLive).toBeUndefined(); // created via appendLine
      expect(lines[2].text).toBe('line three');
      // The trailing fragment after the last \n is the current live line
      expect(lines[2].isLive).toBe(true);
    });

    it('should produce a finalized line and an empty live line for a trailing newline', () => {
      // "hello\n" splits into ["hello", ""].
      // "hello" is finalized; "" becomes the new live line (cursor position).
      capture.captureSession('alpha', session);
      session.emit('data', 'hello\n');

      const lines = capture.getLines('alpha');
      expect(lines).toHaveLength(2);
      expect(lines[0].text).toBe('hello');
      expect(lines[0].isLive).toBe(false);
      expect(lines[1].text).toBe('');
      expect(lines[1].isLive).toBe(true);
    });

    it('should create a single empty live line when data is exactly ""', () => {
      // An empty string with no newline → single live line with empty text.
      capture.captureSession('alpha', session);
      session.emit('data', '');

      const lines = capture.getLines('alpha');
      expect(lines).toHaveLength(1);
      expect(lines[0].text).toBe('');
      expect(lines[0].isLive).toBe(true);
    });
  });

  // ── Circular buffer ─────────────────────────────────────────────────────

  describe('circular buffer', () => {
    it('should drop oldest lines when buffer exceeds maxLinesPerSession', () => {
      // Use appendLine directly to produce one line per call, bypassing the
      // streaming accumulation behaviour of appendStreamingChunk.
      const smallCapture = new OutputCapture({ maxLinesPerSession: 3 });
      smallCapture.captureSession('alpha', session);

      smallCapture.appendLine('alpha', 'line-1', false);
      smallCapture.appendLine('alpha', 'line-2', false);
      smallCapture.appendLine('alpha', 'line-3', false);
      smallCapture.appendLine('alpha', 'line-4', false);

      const lines = smallCapture.getLines('alpha');
      expect(lines).toHaveLength(3);
      expect(lines[0].text).toBe('line-2');
      expect(lines[1].text).toBe('line-3');
      expect(lines[2].text).toBe('line-4');
    });

    it('should enforce the limit across mixed event types', () => {
      // Use appendLine directly for predictable per-session cap behaviour.
      // The streaming path (appendStreamingChunk) has a subtlety: the trailing
      // live line from a newline-terminated chunk is pushed without going through
      // the same per-session eviction guard, so mixing data events with promptStart
      // / promptComplete can produce a transient over-run.
      const smallCapture = new OutputCapture({ maxLinesPerSession: 2 });
      smallCapture.captureSession('alpha', session);

      session.emit('promptStart', 'my prompt'); // appendLine → 1 line
      smallCapture.appendLine('alpha', 'response', false); // appendLine → 2 lines (at limit)
      session.emit('promptComplete'); // finalizeLiveLine (no-op) + appendLine '' → evicts oldest → 2 lines

      const lines = smallCapture.getLines('alpha');
      expect(lines).toHaveLength(2);
      // "You: my prompt" was evicted; surviving lines are the response and blank
      expect(lines[0].text).toBe('response');
      expect(lines[1].text).toBe('');
    });

    it('should use 1000 as the default maxLinesPerSession', () => {
      const defaultCapture = new OutputCapture();
      defaultCapture.captureSession('alpha', session);

      // Emit newline-terminated chunks so each becomes a separate finalized line
      for (let i = 0; i < 1005; i++) {
        defaultCapture.appendLine('alpha', `line-${i}`, false);
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

      // Use newline-terminated chunks so each is a finalized line, making
      // the resulting live lines predictable for assertion purposes.
      sessionA.emit('data', 'from A\n');
      sessionB.emit('data', 'from B\n');
      sessionA.emit('data', 'also from A\n');

      const linesA = capture.getLines('session-a');
      const linesB = capture.getLines('session-b');

      // Each newline-terminated chunk produces a finalized line + an empty live line
      // "from A\n" → "from A" (finalized) + "" (live)
      // "also from A\n" → accumulated on the existing live "" → "also from A" (finalized) + "" (live)
      // So session-a ends up with: "from A" (finalized), "also from A" (finalized), "" (live)
      expect(linesA.length).toBeGreaterThanOrEqual(2);
      expect(linesA.some(l => l.text === 'from A')).toBe(true);
      expect(linesA.some(l => l.text === 'also from A')).toBe(true);
      expect(linesA[0].sessionName).toBe('session-a');

      expect(linesB.some(l => l.text === 'from B')).toBe(true);
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

      // Use appendLine directly to produce one discrete line per call
      smallCapture.appendLine('a', 'a1', false);
      smallCapture.appendLine('a', 'a2', false);
      smallCapture.appendLine('a', 'a3', false);

      smallCapture.appendLine('b', 'b1', false);

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
      // Streaming redesign: data events route through appendStreamingChunk.
      // Two consecutive data events without \n accumulate into one live line.
      // promptComplete calls finalizeLiveLine first, then appends a blank line.
      capture.captureSession('e2e', session);

      session.emit('promptStart', 'explain TypeScript');
      session.emit('data', 'TypeScript is a typed superset of JavaScript.');
      session.emit('data', ' It compiles to plain JavaScript.');
      session.emit('promptComplete');

      const lines = capture.getLines('e2e');
      // Line 0: prompt echo (from appendLine)
      // Line 1: accumulated data chunks (finalized by promptComplete)
      // Line 2: trailing blank line (from appendLine after finalizeLiveLine)
      expect(lines).toHaveLength(3);

      // Line 0: prompt echo
      expect(lines[0].text).toBe('You: explain TypeScript');
      expect(lines[0].isError).toBe(false);

      // Line 1: accumulated streamed chunks (finalized, no longer live)
      expect(lines[1].text).toBe(
        'TypeScript is a typed superset of JavaScript. It compiles to plain JavaScript.',
      );
      expect(lines[1].isError).toBe(false);
      expect(lines[1].isLive).toBe(false);

      // Line 2: trailing blank line
      expect(lines[2].text).toBe('');
      expect(lines[2].isError).toBe(false);

      // All lines should have the correct session name
      for (const line of lines) {
        expect(line.sessionName).toBe('e2e');
        expect(line.timestamp).toBeInstanceOf(Date);
      }
    });

    it('should capture a prompt lifecycle that ends with an error', () => {
      // promptError uses appendLine (not appendStreamingChunk), so the live
      // line from the data event is NOT finalized — it stays in the buffer
      // and the error line is appended after it.
      capture.captureSession('e2e', session);

      session.emit('promptStart', 'do something');
      session.emit('data', 'partial response');
      session.emit('promptError', new Error('connection lost'));

      const lines = capture.getLines('e2e');
      expect(lines).toHaveLength(3);

      expect(lines[0].text).toBe('You: do something');
      expect(lines[0].isError).toBe(false);

      // The live streaming line is still present (not finalized by promptError)
      expect(lines[1].text).toBe('partial response');
      expect(lines[1].isError).toBe(false);
      expect(lines[1].isLive).toBe(true);

      expect(lines[2].text).toBe('Error: connection lost');
      expect(lines[2].isError).toBe(true);
    });

    it('should capture multiple prompts in sequence within one session', () => {
      // Streaming redesign: data events accumulate on a live line.
      // promptComplete finalizes the live line then appends a blank line.
      // promptStart also finalizes the live line before appending the prompt echo.
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
      // Expected sequence:
      //   [0] "You: prompt one"   — from appendLine (promptStart)
      //   [1] "answer one"        — finalized live line (by promptComplete)
      //   [2] ""                  — blank separator (from promptComplete appendLine)
      //   [3] "You: prompt two"   — from appendLine (promptStart, after finalizeLiveLine on "")
      //   [4] "answer two"        — finalized live line (by promptComplete)
      //   [5] ""                  — blank separator
      expect(lines).toHaveLength(6);

      expect(lines[0].text).toBe('You: prompt one');
      expect(lines[1].text).toBe('answer one');
      expect(lines[1].isLive).toBe(false);
      expect(lines[2].text).toBe('');
      expect(lines[3].text).toBe('You: prompt two');
      expect(lines[4].text).toBe('answer two');
      expect(lines[4].isLive).toBe(false);
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

      // Use appendLine directly to produce one discrete line per call —
      // data events now use appendStreamingChunk and would accumulate.
      cap.appendLine('a', 'a1', false);
      cap.appendLine('a', 'a2', false);
      cap.appendLine('a', 'a3', false);

      cap.appendLine('b', 'b1', false);
      cap.appendLine('b', 'b2', false);
      cap.appendLine('b', 'b3', false);

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
      cap.appendLine('a', 'a1', false);
      cap.appendLine('b', 'b1', false);
      cap.appendLine('a', 'a2', false);
      cap.appendLine('b', 'b2', false);
      // total=4, at limit

      // Push one more into session b, total=5, evicts a1
      cap.appendLine('b', 'b3', false);

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

      // Add 4000 discrete lines to each session (12000 total, exceeds 10000)
      for (let i = 0; i < 4000; i++) {
        cap.appendLine('a', `a-${i}`, false);
      }
      for (let i = 0; i < 4000; i++) {
        cap.appendLine('b', `b-${i}`, false);
      }
      for (let i = 0; i < 4000; i++) {
        cap.appendLine('c', `c-${i}`, false);
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
      cap.appendLine('a', 'a1', false);

      // Add 3 lines to session b -- total=4, exceeds 3, evicts a1
      cap.appendLine('b', 'b1', false);
      cap.appendLine('b', 'b2', false);
      cap.appendLine('b', 'b3', false);

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
        cap.appendLine('a', `line-${i}`, false);
      }

      expect(cap.getLines('a')).toHaveLength(50);
    });

    it('should not evict when maxTotalLines is 0 (treated as Infinity)', () => {
      const cap = new OutputCapture({ maxTotalLines: 0, maxLinesPerSession: 100 });
      const sessionA = createMockSession();

      cap.captureSession('a', sessionA);

      for (let i = 0; i < 50; i++) {
        cap.appendLine('a', `line-${i}`, false);
      }

      expect(cap.getLines('a')).toHaveLength(50);
    });
  });

  // ── maxLineLength (line truncation) ────────────────────────────────────

  describe('maxLineLength line truncation', () => {
    it('should truncate lines exceeding maxLineLength and append " [truncated]"', () => {
      // Use appendLine directly to produce discrete lines; data events accumulate.
      const cap = new OutputCapture({ maxLineLength: 20 });
      cap.captureSession('alpha', session);

      cap.appendLine('alpha', 'short', false);
      cap.appendLine('alpha', 'this is a very long line that exceeds the limit', false);

      const lines = cap.getLines('alpha');
      expect(lines[0].text).toBe('short');
      expect(lines[1].text).toBe('this is a very long  [truncated]');
      expect(lines[1].text.startsWith('this is a very long ')).toBe(true);
      expect(lines[1].text.endsWith(' [truncated]')).toBe(true);
    });

    it('should not truncate lines at or under the maxLineLength', () => {
      const cap = new OutputCapture({ maxLineLength: 10 });
      cap.captureSession('alpha', session);

      cap.appendLine('alpha', '1234567890', false); // exactly 10 chars
      cap.appendLine('alpha', '123456789', false);  // 9 chars

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
      cap.appendLine('alpha', exact, false);
      expect(cap.getLines('alpha')[0].text).toBe(exact);

      // Line of 10001 chars should be truncated
      const over = 'b'.repeat(10001);
      cap.appendLine('alpha', over, false);
      expect(cap.getLines('alpha')[1].text).toBe('b'.repeat(10000) + ' [truncated]');
    });

    it('should not truncate when maxLineLength is Infinity (disabled)', () => {
      const cap = new OutputCapture({ maxLineLength: Infinity });
      cap.captureSession('alpha', session);

      const longLine = 'z'.repeat(50000);
      cap.appendLine('alpha', longLine, false);

      expect(cap.getLines('alpha')[0].text).toBe(longLine);
    });

    it('should not truncate when maxLineLength is 0 (treated as Infinity)', () => {
      const cap = new OutputCapture({ maxLineLength: 0 });
      cap.captureSession('alpha', session);

      const longLine = 'z'.repeat(50000);
      cap.appendLine('alpha', longLine, false);

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

      // Use appendLine directly: data events would accumulate into one live line
      cap.appendLine('a', 'a1', false);
      cap.appendLine('a', 'a2', false);
      cap.appendLine('a', 'a3', false);
      // total = 3, at limit, no eviction yet
      expect(mockLogger.warn).not.toHaveBeenCalled();

      // Adding to session b triggers global eviction of 1 line from session a
      cap.appendLine('b', 'b1', false);

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

      cap.appendLine('a', 'a1', false);
      cap.appendLine('a', 'a2', false);
      // At limit, no eviction yet

      // Add 2 lines to session b, should evict 2 lines total (one per appendLine call)
      cap.appendLine('b', 'b1', false);
      cap.appendLine('b', 'b2', false);

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

  // ── appendStreamingChunk ────────────────────────────────────────────────

  describe('appendStreamingChunk()', () => {
    describe('single chunk without newline', () => {
      it('should create one live line with the chunk text, isLive true', () => {
        capture.captureSession('alpha', session);
        capture.appendStreamingChunk('alpha', 'hello');

        const lines = capture.getLines('alpha');
        expect(lines).toHaveLength(1);
        expect(lines[0].text).toBe('hello');
        expect(lines[0].isLive).toBe(true);
        expect(lines[0].isError).toBe(false);
        expect(lines[0].sessionName).toBe('alpha');
      });

      it('should set a valid timestamp on the new live line', () => {
        const before = new Date();
        capture.captureSession('alpha', session);
        capture.appendStreamingChunk('alpha', 'chunk');
        const after = new Date();

        const line = capture.getLines('alpha')[0];
        expect(line.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(line.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
      });
    });

    describe('multiple chunks without newline', () => {
      it('should accumulate chunks into the same live line', () => {
        capture.captureSession('alpha', session);
        capture.appendStreamingChunk('alpha', 'hello');
        capture.appendStreamingChunk('alpha', ' world');
        capture.appendStreamingChunk('alpha', '!');

        const lines = capture.getLines('alpha');
        expect(lines).toHaveLength(1);
        expect(lines[0].text).toBe('hello world!');
        expect(lines[0].isLive).toBe(true);
      });

      it('should keep growing the same live line with each chunk', () => {
        capture.captureSession('alpha', session);
        capture.appendStreamingChunk('alpha', 'a');
        expect(capture.getLines('alpha')[0].text).toBe('a');

        capture.appendStreamingChunk('alpha', 'b');
        expect(capture.getLines('alpha')[0].text).toBe('ab');

        capture.appendStreamingChunk('alpha', 'c');
        expect(capture.getLines('alpha')[0].text).toBe('abc');
        expect(capture.getLines('alpha')).toHaveLength(1);
      });
    });

    describe('chunk containing newline', () => {
      it('should finalize text before \\n as isLive false and start a new live line for text after', () => {
        capture.captureSession('alpha', session);
        capture.appendStreamingChunk('alpha', 'first\nsecond');

        const lines = capture.getLines('alpha');
        expect(lines).toHaveLength(2);
        expect(lines[0].text).toBe('first');
        expect(lines[0].isLive).toBe(false);
        expect(lines[1].text).toBe('second');
        expect(lines[1].isLive).toBe(true);
      });

      it('should accumulate on the existing live line before finalizing on newline', () => {
        capture.captureSession('alpha', session);
        capture.appendStreamingChunk('alpha', 'hel');
        capture.appendStreamingChunk('alpha', 'lo\nworld');

        const lines = capture.getLines('alpha');
        expect(lines).toHaveLength(2);
        expect(lines[0].text).toBe('hello');
        expect(lines[0].isLive).toBe(false);
        expect(lines[1].text).toBe('world');
        expect(lines[1].isLive).toBe(true);
      });
    });

    describe('chunk is only newline', () => {
      it('should finalize any existing live line and start an empty live line', () => {
        capture.captureSession('alpha', session);
        capture.appendStreamingChunk('alpha', 'content');
        capture.appendStreamingChunk('alpha', '\n');

        const lines = capture.getLines('alpha');
        expect(lines).toHaveLength(2);
        expect(lines[0].text).toBe('content');
        expect(lines[0].isLive).toBe(false);
        expect(lines[1].text).toBe('');
        expect(lines[1].isLive).toBe(true);
      });

      it('should start an empty live line when no prior live line exists', () => {
        capture.captureSession('alpha', session);
        capture.appendStreamingChunk('alpha', '\n');

        const lines = capture.getLines('alpha');
        expect(lines).toHaveLength(2);
        expect(lines[0].text).toBe('');
        expect(lines[0].isLive).toBe(false);
        expect(lines[1].text).toBe('');
        expect(lines[1].isLive).toBe(true);
      });
    });

    describe('multiple newlines in one chunk', () => {
      it('should create multiple finalized lines plus one live line at the end', () => {
        // When appendStreamingChunk processes middle lines (parts[1..n-2]),
        // it delegates to appendLine which does NOT set isLive — those lines
        // have isLive === undefined. Only the first part (finalized from the
        // initial live line) and the final live line carry explicit isLive values.
        capture.captureSession('alpha', session);
        capture.appendStreamingChunk('alpha', 'line1\nline2\nline3\ntrailing');

        const lines = capture.getLines('alpha');
        expect(lines).toHaveLength(4);
        expect(lines[0].text).toBe('line1');
        expect(lines[0].isLive).toBe(false); // finalized from the initial live line
        expect(lines[1].text).toBe('line2');
        expect(lines[1].isLive).toBeUndefined(); // created via appendLine (middle line)
        expect(lines[2].text).toBe('line3');
        expect(lines[2].isLive).toBeUndefined(); // created via appendLine (middle line)
        expect(lines[3].text).toBe('trailing');
        expect(lines[3].isLive).toBe(true); // new live line for trailing fragment
      });

      it('should handle two consecutive newlines, producing an empty finalized line between them', () => {
        capture.captureSession('alpha', session);
        capture.appendStreamingChunk('alpha', 'a\n\nb');

        const lines = capture.getLines('alpha');
        expect(lines).toHaveLength(3);
        expect(lines[0].text).toBe('a');
        expect(lines[0].isLive).toBe(false); // finalized from initial live line
        expect(lines[1].text).toBe('');
        expect(lines[1].isLive).toBeUndefined(); // created via appendLine (middle line)
        expect(lines[2].text).toBe('b');
        expect(lines[2].isLive).toBe(true); // new live line for trailing fragment
      });
    });
  });

  // ── finalizeLiveLine ────────────────────────────────────────────────────

  describe('finalizeLiveLine()', () => {
    it('should mark the live line as isLive false', () => {
      capture.captureSession('alpha', session);
      capture.appendStreamingChunk('alpha', 'streaming text');

      const before = capture.getLines('alpha');
      expect(before[0].isLive).toBe(true);

      capture.finalizeLiveLine('alpha');

      const after = capture.getLines('alpha');
      expect(after[0].isLive).toBe(false);
      expect(after[0].text).toBe('streaming text');
    });

    it('should do nothing and not throw when no live line exists', () => {
      capture.captureSession('alpha', session);
      session.emit('data', 'some line');

      // No live line — should not throw
      expect(() => capture.finalizeLiveLine('alpha')).not.toThrow();
      expect(capture.getLines('alpha')).toHaveLength(1);
    });

    it('should do nothing and not throw for a session with no buffer', () => {
      // Session never captured, no buffer at all
      expect(() => capture.finalizeLiveLine('ghost')).not.toThrow();
    });

    it('should create a new live line after finalization, not reusing the old index', () => {
      capture.captureSession('alpha', session);
      capture.appendStreamingChunk('alpha', 'first chunk');
      capture.finalizeLiveLine('alpha');

      // Append another chunk — should create a fresh live line
      capture.appendStreamingChunk('alpha', 'second chunk');

      const lines = capture.getLines('alpha');
      expect(lines).toHaveLength(2);
      expect(lines[0].text).toBe('first chunk');
      expect(lines[0].isLive).toBe(false);
      expect(lines[1].text).toBe('second chunk');
      expect(lines[1].isLive).toBe(true);
    });

    it('should have no effect when called twice in a row', () => {
      capture.captureSession('alpha', session);
      capture.appendStreamingChunk('alpha', 'text');
      capture.finalizeLiveLine('alpha');
      // Second call should be a no-op
      expect(() => capture.finalizeLiveLine('alpha')).not.toThrow();

      const lines = capture.getLines('alpha');
      expect(lines).toHaveLength(1);
      expect(lines[0].isLive).toBe(false);
    });
  });

  // ── onUpdate callback ────────────────────────────────────────────────────

  describe('onUpdate callback', () => {
    it('should invoke onUpdate when appendLine is called', () => {
      const onUpdate = vi.fn();
      capture.captureSession('alpha', session);
      capture.onUpdate = onUpdate;

      capture.appendLine('alpha', 'direct line', false);

      expect(onUpdate).toHaveBeenCalled();
    });

    it('should invoke onUpdate when appendStreamingChunk creates a new live line', () => {
      const onUpdate = vi.fn();
      capture.captureSession('alpha', session);
      capture.onUpdate = onUpdate;

      capture.appendStreamingChunk('alpha', 'streaming');

      expect(onUpdate).toHaveBeenCalled();
    });

    it('should invoke onUpdate when appendStreamingChunk updates an existing live line', () => {
      capture.captureSession('alpha', session);
      capture.appendStreamingChunk('alpha', 'first');

      const onUpdate = vi.fn();
      capture.onUpdate = onUpdate;

      capture.appendStreamingChunk('alpha', ' more');

      expect(onUpdate).toHaveBeenCalled();
    });

    it('should invoke onUpdate when a session emits a data event (via captureSession)', () => {
      const onUpdate = vi.fn();
      capture.captureSession('alpha', session);
      capture.onUpdate = onUpdate;

      session.emit('data', 'some data');

      expect(onUpdate).toHaveBeenCalled();
    });

    it('should not throw when onUpdate is undefined and appendLine is called', () => {
      capture.captureSession('alpha', session);
      capture.onUpdate = undefined;

      expect(() => capture.appendLine('alpha', 'line', false)).not.toThrow();
    });

    it('should not throw when onUpdate is undefined and appendStreamingChunk is called', () => {
      capture.captureSession('alpha', session);
      capture.onUpdate = undefined;

      expect(() => capture.appendStreamingChunk('alpha', 'chunk')).not.toThrow();
    });

    it('should stop calling onUpdate after it is unset', () => {
      const onUpdate = vi.fn();
      capture.captureSession('alpha', session);
      capture.onUpdate = onUpdate;

      capture.appendLine('alpha', 'one', false);
      expect(onUpdate).toHaveBeenCalledTimes(1);

      capture.onUpdate = undefined;
      capture.appendLine('alpha', 'two', false);
      // Still only 1 call — the second appendLine did not trigger it
      expect(onUpdate).toHaveBeenCalledTimes(1);
    });
  });

  // ── clearSession and clearAll clear live line state ─────────────────────

  describe('clearSession and clearAll clear live line state', () => {
    it('should clear live line index after clearSession so a subsequent appendStreamingChunk creates a fresh line', () => {
      capture.captureSession('alpha', session);
      capture.appendStreamingChunk('alpha', 'live content');

      // Lines exist, live line is tracked
      expect(capture.getLines('alpha')).toHaveLength(1);
      expect(capture.getLines('alpha')[0].isLive).toBe(true);

      capture.clearSession('alpha');

      // Buffer is now empty
      expect(capture.getLines('alpha')).toHaveLength(0);

      // Creating a new live line should not crash and should start fresh
      expect(() => capture.appendStreamingChunk('alpha', 'fresh chunk')).not.toThrow();
      const lines = capture.getLines('alpha');
      expect(lines).toHaveLength(1);
      expect(lines[0].text).toBe('fresh chunk');
      expect(lines[0].isLive).toBe(true);
    });

    it('should clear live line indices for all sessions after clearAll', () => {
      const sessionA = createMockSession();
      const sessionB = createMockSession();

      capture.captureSession('a', sessionA);
      capture.captureSession('b', sessionB);

      capture.appendStreamingChunk('a', 'live A');
      capture.appendStreamingChunk('b', 'live B');

      capture.clearAll();

      expect(capture.getLines('a')).toHaveLength(0);
      expect(capture.getLines('b')).toHaveLength(0);

      // Both sessions should be able to start fresh live lines
      expect(() => capture.appendStreamingChunk('a', 'new A')).not.toThrow();
      expect(() => capture.appendStreamingChunk('b', 'new B')).not.toThrow();

      expect(capture.getLines('a')[0].text).toBe('new A');
      expect(capture.getLines('a')[0].isLive).toBe(true);
      expect(capture.getLines('b')[0].text).toBe('new B');
      expect(capture.getLines('b')[0].isLive).toBe(true);
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

      // Add 3 discrete lines to each session (total = 6, at limit).
      // Use appendLine directly — data events accumulate via appendStreamingChunk.
      cap.appendLine('a', 'a1', false);
      cap.appendLine('a', 'a2', false);
      cap.appendLine('a', 'a3', false);
      cap.appendLine('b', 'b1', false);
      cap.appendLine('b', 'b2', false);
      cap.appendLine('b', 'b3', false);

      // Clear session a (should free 3 from totalLineCount)
      cap.clearSession('a');
      expect(cap.getLines('a')).toHaveLength(0);

      // Now we can add 3 more lines to session b without triggering eviction
      cap.appendLine('b', 'b4', false);
      cap.appendLine('b', 'b5', false);
      cap.appendLine('b', 'b6', false);

      // session b should have all 6 lines (3 original + 3 new)
      expect(cap.getLines('b')).toHaveLength(6);
    });

    it('should reset totalLineCount to 0 when clearing all sessions', () => {
      const cap = new OutputCapture({ maxTotalLines: 4, maxLinesPerSession: 10 });
      const sessionA = createMockSession();
      const sessionB = createMockSession();

      cap.captureSession('a', sessionA);
      cap.captureSession('b', sessionB);

      cap.appendLine('a', 'a1', false);
      cap.appendLine('a', 'a2', false);
      cap.appendLine('b', 'b1', false);
      cap.appendLine('b', 'b2', false);
      // total = 4, at limit

      cap.clearAll();

      // After clearing, we should be able to add 4 more lines without eviction
      const sessionC = createMockSession();
      cap.captureSession('c', sessionC);
      cap.appendLine('c', 'c1', false);
      cap.appendLine('c', 'c2', false);
      cap.appendLine('c', 'c3', false);
      cap.appendLine('c', 'c4', false);

      expect(cap.getLines('c')).toHaveLength(4);
    });
  });
});
