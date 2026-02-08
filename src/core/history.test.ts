import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HistoryStore } from './history.js';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

function tmpDir(): string {
  return path.join(
    os.tmpdir(),
    `history-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
}

describe('HistoryStore', () => {
  let historyDir: string;
  let store: HistoryStore;

  beforeEach(() => {
    historyDir = tmpDir();
    store = new HistoryStore(historyDir);
  });

  afterEach(async () => {
    await fs.rm(historyDir, { recursive: true, force: true }).catch(() => {});
  });

  // ── record() ────────────────────────────────────────────────────────────────

  describe('record()', () => {
    it('should create directory and append an NDJSON entry', async () => {
      await store.record('my-session', {
        prompt: 'hello',
        responsePreview: 'world',
      });

      const filePath = path.join(historyDir, 'my-session.ndjson');
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(1);

      const entry = JSON.parse(lines[0]);
      expect(entry.index).toBe(0);
      expect(entry.prompt).toBe('hello');
      expect(entry.responsePreview).toBe('world');
      expect(entry.timestamp).toBeDefined();
    });

    it('should assign incrementing indices', async () => {
      await store.record('sess', { prompt: 'first', responsePreview: 'r1' });
      await store.record('sess', { prompt: 'second', responsePreview: 'r2' });
      await store.record('sess', { prompt: 'third', responsePreview: 'r3' });

      const entries = await store.getBySession('sess');
      // getBySession returns in reverse order; check all indices exist
      const indices = entries.map((e) => e.index).sort();
      expect(indices).toEqual([0, 1, 2]);
    });

    it('should truncate responsePreview to 200 characters', async () => {
      const longResponse = 'a'.repeat(500);
      await store.record('sess', {
        prompt: 'test',
        responsePreview: longResponse,
      });

      const entries = await store.getBySession('sess');
      expect(entries[0].responsePreview.length).toBe(200);
    });

    it('should create the history directory if it does not exist', async () => {
      const nestedDir = path.join(historyDir, 'nested', 'deep');
      const nestedStore = new HistoryStore(nestedDir);

      await nestedStore.record('sess', {
        prompt: 'test',
        responsePreview: 'resp',
      });

      const stat = await fs.stat(nestedDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it('should store entries for different sessions in separate files', async () => {
      await store.record('alpha', { prompt: 'a1', responsePreview: 'ra1' });
      await store.record('beta', { prompt: 'b1', responsePreview: 'rb1' });

      const alphaEntries = await store.getBySession('alpha');
      const betaEntries = await store.getBySession('beta');

      expect(alphaEntries).toHaveLength(1);
      expect(alphaEntries[0].prompt).toBe('a1');
      expect(betaEntries).toHaveLength(1);
      expect(betaEntries[0].prompt).toBe('b1');
    });

    it('should auto-rotate when exceeding MAX_HISTORY_LINES (10000)', async () => {
      // Write 10001 lines directly to trigger rotation on the next record()
      const filePath = path.join(historyDir, 'big-session.ndjson');
      await fs.mkdir(historyDir, { recursive: true });

      const lines: string[] = [];
      for (let i = 0; i < 10001; i++) {
        lines.push(
          JSON.stringify({
            index: i,
            prompt: `prompt-${i}`,
            responsePreview: `resp-${i}`,
            timestamp: new Date().toISOString(),
          }),
        );
      }
      await fs.writeFile(filePath, lines.join('\n') + '\n', 'utf-8');

      // This record call should trigger rotation (10002 > 10000)
      await store.record('big-session', {
        prompt: 'trigger-rotation',
        responsePreview: 'resp',
      });

      // After rotation, 20% of oldest lines should be discarded
      // Original: 10001 lines + 1 appended = 10002
      // Rotation discards 20% of 10002 = 2000 oldest entries
      // Remaining should be ~8002
      const entries = await store.getBySession('big-session');
      expect(entries.length).toBeLessThan(10001);
      expect(entries.length).toBeGreaterThan(7000);
    });
  });

  // ── getBySession() ──────────────────────────────────────────────────────────

  describe('getBySession()', () => {
    it('should return entries in reverse chronological order', async () => {
      await store.record('sess', { prompt: 'first', responsePreview: 'r1' });
      await store.record('sess', { prompt: 'second', responsePreview: 'r2' });
      await store.record('sess', { prompt: 'third', responsePreview: 'r3' });

      const entries = await store.getBySession('sess');
      expect(entries).toHaveLength(3);
      expect(entries[0].prompt).toBe('third');
      expect(entries[1].prompt).toBe('second');
      expect(entries[2].prompt).toBe('first');
    });

    it('should respect the limit parameter', async () => {
      await store.record('sess', { prompt: 'p1', responsePreview: 'r1' });
      await store.record('sess', { prompt: 'p2', responsePreview: 'r2' });
      await store.record('sess', { prompt: 'p3', responsePreview: 'r3' });
      await store.record('sess', { prompt: 'p4', responsePreview: 'r4' });

      const entries = await store.getBySession('sess', 2);
      expect(entries).toHaveLength(2);
      // Should return the 2 most recent (reverse order)
      expect(entries[0].prompt).toBe('p4');
      expect(entries[1].prompt).toBe('p3');
    });

    it('should return empty array for non-existent session', async () => {
      const entries = await store.getBySession('does-not-exist');
      expect(entries).toEqual([]);
    });

    it('should return empty array when history dir does not exist', async () => {
      const nonExistentDir = path.join(os.tmpdir(), 'no-such-dir-' + Math.random());
      const otherStore = new HistoryStore(nonExistentDir);
      const entries = await otherStore.getBySession('anything');
      expect(entries).toEqual([]);
    });

    it('should return all entries when limit is not provided', async () => {
      for (let i = 0; i < 5; i++) {
        await store.record('sess', { prompt: `p${i}`, responsePreview: `r${i}` });
      }

      const entries = await store.getBySession('sess');
      expect(entries).toHaveLength(5);
    });
  });

  // ── search() ────────────────────────────────────────────────────────────────

  describe('search()', () => {
    it('should perform case-insensitive substring matching', async () => {
      await store.record('sess', { prompt: 'Fix the BUG', responsePreview: 'r1' });
      await store.record('sess', { prompt: 'add feature', responsePreview: 'r2' });

      const results = await store.search('bug');
      expect(results).toHaveLength(1);
      expect(results[0].prompt).toBe('Fix the BUG');
    });

    it('should search within a specific session when sessionName is provided', async () => {
      await store.record('alpha', { prompt: 'fix bug in alpha', responsePreview: 'r1' });
      await store.record('beta', { prompt: 'fix bug in beta', responsePreview: 'r2' });

      const results = await store.search('fix bug', { sessionName: 'alpha' });
      expect(results).toHaveLength(1);
      expect(results[0].sessionName).toBe('alpha');
      expect(results[0].prompt).toBe('fix bug in alpha');
    });

    it('should search across all sessions when no sessionName is provided', async () => {
      await store.record('alpha', { prompt: 'fix bug in alpha', responsePreview: 'r1' });
      await store.record('beta', { prompt: 'fix bug in beta', responsePreview: 'r2' });
      await store.record('gamma', { prompt: 'add feature', responsePreview: 'r3' });

      const results = await store.search('fix bug');
      expect(results).toHaveLength(2);

      const sessionNames = results.map((r) => r.sessionName).sort();
      expect(sessionNames).toEqual(['alpha', 'beta']);
    });

    it('should respect the limit option', async () => {
      for (let i = 0; i < 10; i++) {
        await store.record('sess', {
          prompt: `fix issue number ${i}`,
          responsePreview: `r${i}`,
        });
      }

      const results = await store.search('fix issue', { limit: 3 });
      expect(results).toHaveLength(3);
    });

    it('should default limit to 50', async () => {
      for (let i = 0; i < 60; i++) {
        await store.record('sess', {
          prompt: `repeated prompt ${i}`,
          responsePreview: `r${i}`,
        });
      }

      const results = await store.search('repeated prompt');
      expect(results).toHaveLength(50);
    });

    it('should return empty array when no matches are found', async () => {
      await store.record('sess', { prompt: 'hello world', responsePreview: 'r1' });

      const results = await store.search('nonexistent');
      expect(results).toEqual([]);
    });

    it('should return empty array when history dir does not exist', async () => {
      const nonExistentDir = path.join(os.tmpdir(), 'no-such-dir-' + Math.random());
      const otherStore = new HistoryStore(nonExistentDir);
      const results = await otherStore.search('anything');
      expect(results).toEqual([]);
    });

    it('should sort results by timestamp descending', async () => {
      await store.record('sess', { prompt: 'match first', responsePreview: 'r1' });
      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));
      await store.record('sess', { prompt: 'match second', responsePreview: 'r2' });

      const results = await store.search('match');
      expect(results[0].prompt).toBe('match second');
      expect(results[1].prompt).toBe('match first');
    });

    it('should include sessionName in each result', async () => {
      await store.record('my-session', {
        prompt: 'test prompt',
        responsePreview: 'resp',
      });

      const results = await store.search('test');
      expect(results[0].sessionName).toBe('my-session');
    });
  });

  // ── clear() ─────────────────────────────────────────────────────────────────

  describe('clear()', () => {
    it('should delete the history file for a session', async () => {
      await store.record('sess', { prompt: 'hello', responsePreview: 'world' });

      const filePath = path.join(historyDir, 'sess.ndjson');
      const existsBefore = await fs
        .access(filePath)
        .then(() => true)
        .catch(() => false);
      expect(existsBefore).toBe(true);

      await store.clear('sess');

      const existsAfter = await fs
        .access(filePath)
        .then(() => true)
        .catch(() => false);
      expect(existsAfter).toBe(false);
    });

    it('should return empty entries after clearing', async () => {
      await store.record('sess', { prompt: 'hello', responsePreview: 'world' });
      await store.clear('sess');

      const entries = await store.getBySession('sess');
      expect(entries).toEqual([]);
    });

    it('should be a no-op for non-existent session', async () => {
      // Should not throw
      await expect(store.clear('no-such-session')).resolves.toBeUndefined();
    });
  });

  // ── getFilePath() / sanitization ────────────────────────────────────────────

  describe('getFilePath() sanitization', () => {
    it('should sanitize session names by replacing non-alphanumeric chars', async () => {
      await store.record('my session/with:special!chars', {
        prompt: 'test',
        responsePreview: 'resp',
      });

      const files = await fs.readdir(historyDir);
      expect(files).toHaveLength(1);
      // Non-alphanumeric characters (except _ and -) should be replaced with _
      expect(files[0]).toBe('my_session_with_special_chars.ndjson');
    });

    it('should preserve hyphens and underscores in session names', async () => {
      await store.record('my_session-name', {
        prompt: 'test',
        responsePreview: 'resp',
      });

      const files = await fs.readdir(historyDir);
      expect(files[0]).toBe('my_session-name.ndjson');
    });

    it('should handle purely alphanumeric session names unchanged', async () => {
      await store.record('session123', {
        prompt: 'test',
        responsePreview: 'resp',
      });

      const files = await fs.readdir(historyDir);
      expect(files[0]).toBe('session123.ndjson');
    });
  });

  // ── Malformed NDJSON handling ───────────────────────────────────────────────

  describe('malformed NDJSON handling', () => {
    it('should skip malformed lines and parse valid ones', async () => {
      const filePath = path.join(historyDir, 'corrupt.ndjson');
      await fs.mkdir(historyDir, { recursive: true });

      const validEntry = JSON.stringify({
        index: 0,
        prompt: 'valid prompt',
        responsePreview: 'valid response',
        timestamp: new Date().toISOString(),
      });

      const content = [
        'not valid json {{{',
        validEntry,
        '}{invalid}',
        '',
      ].join('\n');

      await fs.writeFile(filePath, content, 'utf-8');

      const entries = await store.getBySession('corrupt');
      expect(entries).toHaveLength(1);
      expect(entries[0].prompt).toBe('valid prompt');
    });

    it('should return empty array when all lines are malformed', async () => {
      const filePath = path.join(historyDir, 'all-bad.ndjson');
      await fs.mkdir(historyDir, { recursive: true });

      await fs.writeFile(
        filePath,
        'not json\nalso not json\n{bad\n',
        'utf-8',
      );

      const entries = await store.getBySession('all-bad');
      expect(entries).toEqual([]);
    });

    it('should handle empty file gracefully', async () => {
      const filePath = path.join(historyDir, 'empty.ndjson');
      await fs.mkdir(historyDir, { recursive: true });
      await fs.writeFile(filePath, '', 'utf-8');

      const entries = await store.getBySession('empty');
      expect(entries).toEqual([]);
    });

    it('should handle file with only whitespace and newlines', async () => {
      const filePath = path.join(historyDir, 'whitespace.ndjson');
      await fs.mkdir(historyDir, { recursive: true });
      await fs.writeFile(filePath, '\n\n  \n\n', 'utf-8');

      const entries = await store.getBySession('whitespace');
      expect(entries).toEqual([]);
    });
  });

  // ── Rotation behavior ──────────────────────────────────────────────────────

  describe('rotation behavior', () => {
    it('should not rotate when at or below MAX_HISTORY_LINES', async () => {
      // Record a modest number of entries -- no rotation should occur
      for (let i = 0; i < 5; i++) {
        await store.record('sess', {
          prompt: `prompt-${i}`,
          responsePreview: `resp-${i}`,
        });
      }

      const entries = await store.getBySession('sess');
      expect(entries).toHaveLength(5);
    });

    it('should discard oldest 20% when rotation triggers', async () => {
      // Create a file with exactly 10001 lines (just over the limit)
      const filePath = path.join(historyDir, 'rotate-test.ndjson');
      await fs.mkdir(historyDir, { recursive: true });

      const lineCount = 10001;
      const lines: string[] = [];
      for (let i = 0; i < lineCount; i++) {
        lines.push(
          JSON.stringify({
            index: i,
            prompt: `prompt-${i}`,
            responsePreview: `resp-${i}`,
            timestamp: new Date().toISOString(),
          }),
        );
      }
      await fs.writeFile(filePath, lines.join('\n') + '\n', 'utf-8');

      // Trigger record which will see 10001 existing lines, append 1 = 10002,
      // then rotate: discard 20% of 10002 = 2000 lines
      await store.record('rotate-test', {
        prompt: 'trigger',
        responsePreview: 'resp',
      });

      const content = await fs.readFile(filePath, 'utf-8');
      const remainingLines = content
        .split('\n')
        .filter((l) => l.trim().length > 0);

      // 10002 total - 2000 discarded = 8002 remaining
      expect(remainingLines.length).toBeLessThanOrEqual(8002);
      expect(remainingLines.length).toBeGreaterThan(7000);
    });
  });
});
