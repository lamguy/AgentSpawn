import { describe, it, expect, beforeEach } from 'vitest';
import { ExportFormatter, ExportMetadata } from './export.js';
import { PromptHistoryEntry } from '../types.js';

describe('ExportFormatter', () => {
  let sampleEntries: PromptHistoryEntry[];

  beforeEach(() => {
    sampleEntries = [
      {
        index: 0,
        prompt: 'Fix the navigation bug',
        responsePreview: 'I will help you fix the navigation bug.',
        timestamp: '2026-02-15T10:00:00.000Z',
      },
      {
        index: 1,
        prompt: 'Add user authentication',
        responsePreview: 'Let me implement user authentication for you.',
        timestamp: '2026-02-15T11:00:00.000Z',
      },
      {
        index: 2,
        prompt: 'Write tests for the API',
        responsePreview: 'I will write comprehensive tests for the API.',
        timestamp: '2026-02-15T12:00:00.000Z',
      },
    ];
  });

  // ── computeMetadata() ───────────────────────────────────────────────────────

  describe('computeMetadata()', () => {
    it('should compute metadata for non-empty entries', () => {
      const metadata = ExportFormatter.computeMetadata('my-session', sampleEntries);

      expect(metadata.sessionName).toBe('my-session');
      expect(metadata.entryCount).toBe(3);
      expect(metadata.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(metadata.dateRange.oldest).toBe('2026-02-15T10:00:00.000Z');
      expect(metadata.dateRange.newest).toBe('2026-02-15T12:00:00.000Z');
    });

    it('should handle empty entries array', () => {
      const metadata = ExportFormatter.computeMetadata('empty-session', []);

      expect(metadata.sessionName).toBe('empty-session');
      expect(metadata.entryCount).toBe(0);
      expect(metadata.dateRange.oldest).toBeNull();
      expect(metadata.dateRange.newest).toBeNull();
    });

    it('should handle single entry', () => {
      const singleEntry = [sampleEntries[0]];
      const metadata = ExportFormatter.computeMetadata('single', singleEntry);

      expect(metadata.entryCount).toBe(1);
      expect(metadata.dateRange.oldest).toBe('2026-02-15T10:00:00.000Z');
      expect(metadata.dateRange.newest).toBe('2026-02-15T10:00:00.000Z');
    });

    it('should handle entries in reverse chronological order', () => {
      const reversedEntries = [...sampleEntries].reverse();
      const metadata = ExportFormatter.computeMetadata('reversed', reversedEntries);

      // Should still find correct oldest/newest
      expect(metadata.dateRange.oldest).toBe('2026-02-15T10:00:00.000Z');
      expect(metadata.dateRange.newest).toBe('2026-02-15T12:00:00.000Z');
    });

    it('should handle entries in arbitrary order', () => {
      const shuffledEntries = [sampleEntries[1], sampleEntries[2], sampleEntries[0]];
      const metadata = ExportFormatter.computeMetadata('shuffled', shuffledEntries);

      expect(metadata.dateRange.oldest).toBe('2026-02-15T10:00:00.000Z');
      expect(metadata.dateRange.newest).toBe('2026-02-15T12:00:00.000Z');
    });
  });

  // ── toMarkdown() ────────────────────────────────────────────────────────────

  describe('toMarkdown()', () => {
    it('should export entries as valid Markdown', () => {
      const metadata = ExportFormatter.computeMetadata('my-session', sampleEntries);
      const markdown = ExportFormatter.toMarkdown(sampleEntries, metadata);

      // Check header
      expect(markdown).toContain('# my-session');

      // Check metadata section
      expect(markdown).toContain('**Exported:**');
      expect(markdown).toContain('**Entries:** 3');
      expect(markdown).toContain('**Date Range:**');
      expect(markdown).toContain('2026-02-15T10:00:00.000Z to 2026-02-15T12:00:00.000Z');

      // Check separator
      expect(markdown).toContain('---');

      // Check entries
      expect(markdown).toContain('## Prompt #0');
      expect(markdown).toContain('## Prompt #1');
      expect(markdown).toContain('## Prompt #2');

      // Check prompts are present
      expect(markdown).toContain('Fix the navigation bug');
      expect(markdown).toContain('Add user authentication');
      expect(markdown).toContain('Write tests for the API');

      // Check responses are present
      expect(markdown).toContain('I will help you fix the navigation bug.');
      expect(markdown).toContain('Let me implement user authentication for you.');
    });

    it('should wrap prompts and responses in code blocks', () => {
      const metadata = ExportFormatter.computeMetadata('session', sampleEntries);
      const markdown = ExportFormatter.toMarkdown(sampleEntries, metadata);

      // Check for code block markers
      expect(markdown).toContain('**Prompt:**\n\n```\nFix the navigation bug\n```');
      expect(markdown).toContain('**Response:**\n\n```\nI will help you fix the navigation bug.\n```');
    });

    it('should handle empty entries array', () => {
      const metadata = ExportFormatter.computeMetadata('empty', []);
      const markdown = ExportFormatter.toMarkdown([], metadata);

      expect(markdown).toContain('# empty');
      expect(markdown).toContain('**Entries:** 0');
      expect(markdown).toContain('**Date Range:** N/A (empty history)');
      expect(markdown).toContain('*No history entries found.*');
      expect(markdown).not.toContain('## Prompt');
    });

    it('should handle single entry', () => {
      const singleEntry = [sampleEntries[0]];
      const metadata = ExportFormatter.computeMetadata('single', singleEntry);
      const markdown = ExportFormatter.toMarkdown(singleEntry, metadata);

      expect(markdown).toContain('# single');
      expect(markdown).toContain('**Entries:** 1');
      expect(markdown).toContain('## Prompt #0');
      expect(markdown).toContain('Fix the navigation bug');
      expect(markdown).not.toContain('## Prompt #1');
    });

    it('should handle entries with special characters in prompts', () => {
      const specialEntries: PromptHistoryEntry[] = [
        {
          index: 0,
          prompt: 'Fix bug with <script>alert("XSS")</script>',
          responsePreview: 'I will fix that.',
          timestamp: '2026-02-15T10:00:00.000Z',
        },
      ];

      const metadata = ExportFormatter.computeMetadata('special', specialEntries);
      const markdown = ExportFormatter.toMarkdown(specialEntries, metadata);

      // Special characters should be preserved in code blocks
      expect(markdown).toContain('Fix bug with <script>alert("XSS")</script>');
    });

    it('should handle multi-line prompts', () => {
      const multilineEntries: PromptHistoryEntry[] = [
        {
          index: 0,
          prompt: 'Fix the following issues:\n1. Navigation\n2. Authentication\n3. API tests',
          responsePreview: 'I will fix all three issues.',
          timestamp: '2026-02-15T10:00:00.000Z',
        },
      ];

      const metadata = ExportFormatter.computeMetadata('multiline', multilineEntries);
      const markdown = ExportFormatter.toMarkdown(multilineEntries, metadata);

      expect(markdown).toContain('Fix the following issues:\n1. Navigation\n2. Authentication\n3. API tests');
    });

    it('should handle missing response previews', () => {
      const entriesWithoutResponse: PromptHistoryEntry[] = [
        {
          index: 0,
          prompt: 'Test prompt',
          responsePreview: '',
          timestamp: '2026-02-15T10:00:00.000Z',
        },
      ];

      const metadata = ExportFormatter.computeMetadata('no-response', entriesWithoutResponse);
      const markdown = ExportFormatter.toMarkdown(entriesWithoutResponse, metadata);

      expect(markdown).toContain('**Response:**\n\n```\n(no response)\n```');
    });

    it('should include timestamp for each entry', () => {
      const metadata = ExportFormatter.computeMetadata('session', sampleEntries);
      const markdown = ExportFormatter.toMarkdown(sampleEntries, metadata);

      expect(markdown).toContain('**Timestamp:** 2026-02-15T10:00:00.000Z');
      expect(markdown).toContain('**Timestamp:** 2026-02-15T11:00:00.000Z');
      expect(markdown).toContain('**Timestamp:** 2026-02-15T12:00:00.000Z');
    });

    it('should maintain entry order from input array', () => {
      const reversedEntries = [...sampleEntries].reverse();
      const metadata = ExportFormatter.computeMetadata('reversed', reversedEntries);
      const markdown = ExportFormatter.toMarkdown(reversedEntries, metadata);

      const index2Pos = markdown.indexOf('## Prompt #2');
      const index1Pos = markdown.indexOf('## Prompt #1');
      const index0Pos = markdown.indexOf('## Prompt #0');

      // Reversed order should appear in the output
      expect(index2Pos).toBeLessThan(index1Pos);
      expect(index1Pos).toBeLessThan(index0Pos);
    });
  });

  // ── toJSON() ────────────────────────────────────────────────────────────────

  describe('toJSON()', () => {
    it('should export entries as valid JSON', () => {
      const metadata = ExportFormatter.computeMetadata('my-session', sampleEntries);
      const json = ExportFormatter.toJSON(sampleEntries, metadata);

      // Should be parseable
      const parsed = JSON.parse(json);
      expect(parsed).toHaveProperty('metadata');
      expect(parsed).toHaveProperty('entries');
    });

    it('should include metadata in JSON output', () => {
      const metadata = ExportFormatter.computeMetadata('my-session', sampleEntries);
      const json = ExportFormatter.toJSON(sampleEntries, metadata);
      const parsed = JSON.parse(json);

      expect(parsed.metadata.sessionName).toBe('my-session');
      expect(parsed.metadata.entryCount).toBe(3);
      expect(parsed.metadata.dateRange.oldest).toBe('2026-02-15T10:00:00.000Z');
      expect(parsed.metadata.dateRange.newest).toBe('2026-02-15T12:00:00.000Z');
    });

    it('should include entries in JSON output', () => {
      const metadata = ExportFormatter.computeMetadata('my-session', sampleEntries);
      const json = ExportFormatter.toJSON(sampleEntries, metadata);
      const parsed = JSON.parse(json);

      expect(parsed.entries).toHaveLength(3);
      expect(parsed.entries[0].prompt).toBe('Fix the navigation bug');
      expect(parsed.entries[1].prompt).toBe('Add user authentication');
      expect(parsed.entries[2].prompt).toBe('Write tests for the API');
    });

    it('should use 2-space indentation', () => {
      const metadata = ExportFormatter.computeMetadata('my-session', sampleEntries);
      const json = ExportFormatter.toJSON(sampleEntries, metadata);

      // Check for 2-space indentation pattern
      expect(json).toContain('{\n  "metadata"');
      expect(json).toContain('  "entries"');
    });

    it('should handle empty entries array', () => {
      const metadata = ExportFormatter.computeMetadata('empty', []);
      const json = ExportFormatter.toJSON([], metadata);
      const parsed = JSON.parse(json);

      expect(parsed.metadata.entryCount).toBe(0);
      expect(parsed.entries).toEqual([]);
    });

    it('should handle single entry', () => {
      const singleEntry = [sampleEntries[0]];
      const metadata = ExportFormatter.computeMetadata('single', singleEntry);
      const json = ExportFormatter.toJSON(singleEntry, metadata);
      const parsed = JSON.parse(json);

      expect(parsed.entries).toHaveLength(1);
      expect(parsed.entries[0].index).toBe(0);
    });

    it('should handle entries with special characters', () => {
      const specialEntries: PromptHistoryEntry[] = [
        {
          index: 0,
          prompt: 'Fix "quoted" strings and \\ backslashes',
          responsePreview: 'Response with \n newlines \t and tabs',
          timestamp: '2026-02-15T10:00:00.000Z',
        },
      ];

      const metadata = ExportFormatter.computeMetadata('special', specialEntries);
      const json = ExportFormatter.toJSON(specialEntries, metadata);
      const parsed = JSON.parse(json);

      // Special characters should be properly escaped
      expect(parsed.entries[0].prompt).toBe('Fix "quoted" strings and \\ backslashes');
      expect(parsed.entries[0].responsePreview).toBe('Response with \n newlines \t and tabs');
    });

    it('should preserve all entry fields', () => {
      const metadata = ExportFormatter.computeMetadata('session', sampleEntries);
      const json = ExportFormatter.toJSON(sampleEntries, metadata);
      const parsed = JSON.parse(json);

      expect(parsed.entries[0]).toHaveProperty('index');
      expect(parsed.entries[0]).toHaveProperty('prompt');
      expect(parsed.entries[0]).toHaveProperty('responsePreview');
      expect(parsed.entries[0]).toHaveProperty('timestamp');
    });

    it('should handle missing response previews', () => {
      const entriesWithoutResponse: PromptHistoryEntry[] = [
        {
          index: 0,
          prompt: 'Test prompt',
          responsePreview: '',
          timestamp: '2026-02-15T10:00:00.000Z',
        },
      ];

      const metadata = ExportFormatter.computeMetadata('no-response', entriesWithoutResponse);
      const json = ExportFormatter.toJSON(entriesWithoutResponse, metadata);
      const parsed = JSON.parse(json);

      expect(parsed.entries[0].responsePreview).toBe('');
    });

    it('should maintain entry order from input array', () => {
      const reversedEntries = [...sampleEntries].reverse();
      const metadata = ExportFormatter.computeMetadata('reversed', reversedEntries);
      const json = ExportFormatter.toJSON(reversedEntries, metadata);
      const parsed = JSON.parse(json);

      expect(parsed.entries[0].index).toBe(2);
      expect(parsed.entries[1].index).toBe(1);
      expect(parsed.entries[2].index).toBe(0);
    });
  });

  // ── toPlainText() ───────────────────────────────────────────────────────────

  describe('toPlainText()', () => {
    it('should export entries as plain text format', () => {
      const metadata = ExportFormatter.computeMetadata('my-session', sampleEntries);
      const text = ExportFormatter.toPlainText(sampleEntries, metadata);

      // Check header
      expect(text).toContain('SESSION: my-session');
      expect(text).toContain('EXPORTED:');
      expect(text).toContain('ENTRIES: 3');
      expect(text).toContain('DATE RANGE: 2026-02-15T10:00:00.000Z to 2026-02-15T12:00:00.000Z');

      // Check separators
      expect(text).toContain('='.repeat(80));
      expect(text).toContain('-'.repeat(80));

      // Check entries
      expect(text).toContain('[#0] 2026-02-15T10:00:00.000Z');
      expect(text).toContain('[#1] 2026-02-15T11:00:00.000Z');
      expect(text).toContain('[#2] 2026-02-15T12:00:00.000Z');
    });

    it('should use uppercase labels for prompts and responses', () => {
      const metadata = ExportFormatter.computeMetadata('session', sampleEntries);
      const text = ExportFormatter.toPlainText(sampleEntries, metadata);

      expect(text).toContain('PROMPT:');
      expect(text).toContain('RESPONSE:');
    });

    it('should separate entries with 80-character dash separators', () => {
      const metadata = ExportFormatter.computeMetadata('session', sampleEntries);
      const text = ExportFormatter.toPlainText(sampleEntries, metadata);

      const dashSeparator = '-'.repeat(80);
      // Should have one separator per entry
      const separatorCount = (text.match(new RegExp(dashSeparator, 'g')) || []).length;
      expect(separatorCount).toBe(3);
    });

    it('should handle empty entries array', () => {
      const metadata = ExportFormatter.computeMetadata('empty', []);
      const text = ExportFormatter.toPlainText([], metadata);

      expect(text).toContain('SESSION: empty');
      expect(text).toContain('ENTRIES: 0');
      expect(text).toContain('DATE RANGE: N/A (empty history)');
      expect(text).toContain('No history entries found.');
      expect(text).not.toContain('PROMPT:');
    });

    it('should handle single entry', () => {
      const singleEntry = [sampleEntries[0]];
      const metadata = ExportFormatter.computeMetadata('single', singleEntry);
      const text = ExportFormatter.toPlainText(singleEntry, metadata);

      expect(text).toContain('SESSION: single');
      expect(text).toContain('ENTRIES: 1');
      expect(text).toContain('[#0] 2026-02-15T10:00:00.000Z');
      expect(text).toContain('Fix the navigation bug');
      expect(text).not.toContain('[#1]');
    });

    it('should handle multi-line prompts and responses', () => {
      const multilineEntries: PromptHistoryEntry[] = [
        {
          index: 0,
          prompt: 'Fix the following:\n1. Bug A\n2. Bug B',
          responsePreview: 'I will fix:\n- Bug A\n- Bug B',
          timestamp: '2026-02-15T10:00:00.000Z',
        },
      ];

      const metadata = ExportFormatter.computeMetadata('multiline', multilineEntries);
      const text = ExportFormatter.toPlainText(multilineEntries, metadata);

      expect(text).toContain('Fix the following:\n1. Bug A\n2. Bug B');
      expect(text).toContain('I will fix:\n- Bug A\n- Bug B');
    });

    it('should handle missing response previews', () => {
      const entriesWithoutResponse: PromptHistoryEntry[] = [
        {
          index: 0,
          prompt: 'Test prompt',
          responsePreview: '',
          timestamp: '2026-02-15T10:00:00.000Z',
        },
      ];

      const metadata = ExportFormatter.computeMetadata('no-response', entriesWithoutResponse);
      const text = ExportFormatter.toPlainText(entriesWithoutResponse, metadata);

      expect(text).toContain('RESPONSE:\n(no response)');
    });

    it('should handle entries with special characters', () => {
      const specialEntries: PromptHistoryEntry[] = [
        {
          index: 0,
          prompt: 'Fix <html> tags & "quotes"',
          responsePreview: 'Response with $ dollar & ampersand',
          timestamp: '2026-02-15T10:00:00.000Z',
        },
      ];

      const metadata = ExportFormatter.computeMetadata('special', specialEntries);
      const text = ExportFormatter.toPlainText(specialEntries, metadata);

      // Special characters should be preserved as-is in plain text
      expect(text).toContain('Fix <html> tags & "quotes"');
      expect(text).toContain('Response with $ dollar & ampersand');
    });

    it('should be grep-friendly with consistent format', () => {
      const metadata = ExportFormatter.computeMetadata('session', sampleEntries);
      const text = ExportFormatter.toPlainText(sampleEntries, metadata);

      // Check that each entry follows the same pattern
      expect(text).toContain('[#0] 2026-02-15T10:00:00.000Z\n\nPROMPT:\n');
      expect(text).toContain('[#1] 2026-02-15T11:00:00.000Z\n\nPROMPT:\n');
      expect(text).toContain('[#2] 2026-02-15T12:00:00.000Z\n\nPROMPT:\n');
    });

    it('should maintain entry order from input array', () => {
      const reversedEntries = [...sampleEntries].reverse();
      const metadata = ExportFormatter.computeMetadata('reversed', reversedEntries);
      const text = ExportFormatter.toPlainText(reversedEntries, metadata);

      const index2Pos = text.indexOf('[#2]');
      const index1Pos = text.indexOf('[#1]');
      const index0Pos = text.indexOf('[#0]');

      // Reversed order should appear in the output
      expect(index2Pos).toBeLessThan(index1Pos);
      expect(index1Pos).toBeLessThan(index0Pos);
    });

    it('should include all prompts and responses', () => {
      const metadata = ExportFormatter.computeMetadata('session', sampleEntries);
      const text = ExportFormatter.toPlainText(sampleEntries, metadata);

      expect(text).toContain('Fix the navigation bug');
      expect(text).toContain('I will help you fix the navigation bug.');
      expect(text).toContain('Add user authentication');
      expect(text).toContain('Let me implement user authentication for you.');
      expect(text).toContain('Write tests for the API');
      expect(text).toContain('I will write comprehensive tests for the API.');
    });
  });

  // ── Edge cases and integration ──────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle entries with very long prompts', () => {
      const longPrompt = 'a'.repeat(5000);
      const longEntries: PromptHistoryEntry[] = [
        {
          index: 0,
          prompt: longPrompt,
          responsePreview: 'Response',
          timestamp: '2026-02-15T10:00:00.000Z',
        },
      ];

      const metadata = ExportFormatter.computeMetadata('long', longEntries);

      // All formats should handle long content without errors
      const markdown = ExportFormatter.toMarkdown(longEntries, metadata);
      expect(markdown).toContain(longPrompt);

      const json = ExportFormatter.toJSON(longEntries, metadata);
      const parsed = JSON.parse(json);
      expect(parsed.entries[0].prompt).toBe(longPrompt);

      const text = ExportFormatter.toPlainText(longEntries, metadata);
      expect(text).toContain(longPrompt);
    });

    it('should handle entries with unicode characters', () => {
      const unicodeEntries: PromptHistoryEntry[] = [
        {
          index: 0,
          prompt: 'Fix the 🐛 bug with 中文 characters and émojis',
          responsePreview: 'I will fix それ for you 👍',
          timestamp: '2026-02-15T10:00:00.000Z',
        },
      ];

      const metadata = ExportFormatter.computeMetadata('unicode', unicodeEntries);

      const markdown = ExportFormatter.toMarkdown(unicodeEntries, metadata);
      expect(markdown).toContain('Fix the 🐛 bug with 中文 characters and émojis');

      const json = ExportFormatter.toJSON(unicodeEntries, metadata);
      const parsed = JSON.parse(json);
      expect(parsed.entries[0].responsePreview).toBe('I will fix それ for you 👍');

      const text = ExportFormatter.toPlainText(unicodeEntries, metadata);
      expect(text).toContain('Fix the 🐛 bug with 中文 characters and émojis');
    });

    it('should handle entries with only whitespace in prompts', () => {
      const whitespaceEntries: PromptHistoryEntry[] = [
        {
          index: 0,
          prompt: '   \n\t  ',
          responsePreview: 'Response to whitespace',
          timestamp: '2026-02-15T10:00:00.000Z',
        },
      ];

      const metadata = ExportFormatter.computeMetadata('whitespace', whitespaceEntries);

      // Should not crash or lose data
      const markdown = ExportFormatter.toMarkdown(whitespaceEntries, metadata);
      expect(markdown).toContain('```\n   \n\t  \n```');

      const json = ExportFormatter.toJSON(whitespaceEntries, metadata);
      const parsed = JSON.parse(json);
      expect(parsed.entries[0].prompt).toBe('   \n\t  ');

      const text = ExportFormatter.toPlainText(whitespaceEntries, metadata);
      expect(text).toContain('PROMPT:\n   \n\t  ');
    });

    it('should handle large number of entries', () => {
      const largeEntries: PromptHistoryEntry[] = [];
      for (let i = 0; i < 1000; i++) {
        largeEntries.push({
          index: i,
          prompt: `Prompt ${i}`,
          responsePreview: `Response ${i}`,
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
        });
      }

      const metadata = ExportFormatter.computeMetadata('large', largeEntries);
      expect(metadata.entryCount).toBe(1000);

      // Should complete without errors
      const markdown = ExportFormatter.toMarkdown(largeEntries, metadata);
      expect(markdown).toContain('## Prompt #0');
      expect(markdown).toContain('## Prompt #999');

      const json = ExportFormatter.toJSON(largeEntries, metadata);
      const parsed = JSON.parse(json);
      expect(parsed.entries).toHaveLength(1000);

      const text = ExportFormatter.toPlainText(largeEntries, metadata);
      expect(text).toContain('[#0]');
      expect(text).toContain('[#999]');
    });

    it('should handle entries with null-like response previews', () => {
      const nullishEntries: PromptHistoryEntry[] = [
        {
          index: 0,
          prompt: 'Test',
          responsePreview: '',
          timestamp: '2026-02-15T10:00:00.000Z',
        },
      ];

      const metadata = ExportFormatter.computeMetadata('nullish', nullishEntries);

      const markdown = ExportFormatter.toMarkdown(nullishEntries, metadata);
      expect(markdown).toContain('(no response)');

      const text = ExportFormatter.toPlainText(nullishEntries, metadata);
      expect(text).toContain('(no response)');
    });
  });

  // ── Format consistency ──────────────────────────────────────────────────────

  describe('format consistency', () => {
    it('should preserve entry data across all formats', () => {
      const metadata = ExportFormatter.computeMetadata('session', sampleEntries);

      const markdown = ExportFormatter.toMarkdown(sampleEntries, metadata);
      const json = ExportFormatter.toJSON(sampleEntries, metadata);
      const text = ExportFormatter.toPlainText(sampleEntries, metadata);

      // All formats should contain the same core data
      for (const entry of sampleEntries) {
        expect(markdown).toContain(entry.prompt);
        expect(markdown).toContain(entry.responsePreview);
        expect(markdown).toContain(entry.timestamp);

        const parsed = JSON.parse(json);
        const jsonEntry = parsed.entries.find((e: PromptHistoryEntry) => e.index === entry.index);
        expect(jsonEntry.prompt).toBe(entry.prompt);
        expect(jsonEntry.responsePreview).toBe(entry.responsePreview);

        expect(text).toContain(entry.prompt);
        expect(text).toContain(entry.responsePreview);
        expect(text).toContain(entry.timestamp);
      }
    });

    it('should use consistent metadata across all formats', () => {
      const metadata: ExportMetadata = {
        sessionName: 'test-session',
        exportedAt: '2026-02-15T15:00:00.000Z',
        entryCount: 3,
        dateRange: {
          oldest: '2026-02-15T10:00:00.000Z',
          newest: '2026-02-15T12:00:00.000Z',
        },
      };

      const markdown = ExportFormatter.toMarkdown(sampleEntries, metadata);
      const json = ExportFormatter.toJSON(sampleEntries, metadata);
      const text = ExportFormatter.toPlainText(sampleEntries, metadata);

      // Check metadata presence
      expect(markdown).toContain('test-session');
      expect(markdown).toContain('**Entries:** 3');

      const parsed = JSON.parse(json);
      expect(parsed.metadata.sessionName).toBe('test-session');
      expect(parsed.metadata.entryCount).toBe(3);

      expect(text).toContain('SESSION: test-session');
      expect(text).toContain('ENTRIES: 3');
    });
  });
});
