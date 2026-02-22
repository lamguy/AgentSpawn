import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager, HistoryStore } from '../../src/lib.js';
import { ExportFormatter } from '../../src/core/export.js';
import { PromptHistoryEntry } from '../../src/types.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

/**
 * Integration tests for the export command.
 *
 * These tests verify the complete end-to-end export workflow:
 * - Creating sessions with real history data
 * - Exporting history in all three formats (Markdown, JSON, text)
 * - Verifying exported file contents match session history
 * - Testing error cases (empty history, invalid sessions)
 * - Testing file output and path resolution
 *
 * Uses real filesystem operations with temp directories for isolation.
 */

describe('Export Command Integration Tests', () => {
  let tempDir: string;
  let registryPath: string;
  let historyDir: string;
  let manager: SessionManager;
  let historyStore: HistoryStore;

  beforeEach(async () => {
    // Create isolated temp directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentspawn-export-test-'));
    registryPath = path.join(tempDir, 'sessions.json');
    historyDir = path.join(tempDir, 'history');

    // Initialize manager and history store
    historyStore = new HistoryStore(historyDir);
    manager = new SessionManager({
      registryPath,
      historyStore,
    });

    await manager.init();
  });

  afterEach(async () => {
    // Stop all sessions and cleanup
    await manager.stopAll();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Happy Path - Export with Real History', () => {
    it('should export session history in Markdown format', async () => {
      const sessionName = 'test-session-md';

      // Create history entries
      await historyStore.record(sessionName, {
        prompt: 'Write a hello world function',
        responsePreview: 'Here is a hello world function:\nfunction hello() { console.log("Hello"); }',
      });

      await historyStore.record(sessionName, {
        prompt: 'Add error handling',
        responsePreview: 'Updated with try-catch:\nfunction hello() { try { ... } catch(e) { ... } }',
      });

      await historyStore.record(sessionName, {
        prompt: 'Write tests',
        responsePreview: 'Here are the tests:\ndescribe("hello", () => { ... });',
      });

      // Fetch history (reverse chronological by default)
      const entries = await historyStore.getBySession(sessionName);
      expect(entries.length).toBe(3);

      // Reverse to chronological order for export
      const chronologicalEntries = [...entries].reverse();

      // Generate metadata and export
      const metadata = ExportFormatter.computeMetadata(sessionName, chronologicalEntries);
      const markdown = ExportFormatter.toMarkdown(chronologicalEntries, metadata);

      // Write to file
      const outputPath = path.join(tempDir, `${sessionName}-history.md`);
      await fs.writeFile(outputPath, markdown, 'utf-8');

      // Verify file exists
      const stat = await fs.stat(outputPath);
      expect(stat.isFile()).toBe(true);

      // Read and verify content
      const content = await fs.readFile(outputPath, 'utf-8');

      // Verify header
      expect(content).toContain(`# ${sessionName}`);
      expect(content).toContain('**Exported:**');
      expect(content).toContain('**Entries:** 3');
      expect(content).toContain('**Date Range:**');

      // Verify all prompts are present in chronological order
      expect(content).toContain('## Prompt #0');
      expect(content).toContain('Write a hello world function');
      expect(content).toContain('Here is a hello world function');

      expect(content).toContain('## Prompt #1');
      expect(content).toContain('Add error handling');
      expect(content).toContain('Updated with try-catch');

      expect(content).toContain('## Prompt #2');
      expect(content).toContain('Write tests');
      expect(content).toContain('Here are the tests');

      // Verify code blocks are present
      expect(content).toMatch(/```[\s\S]*?Write a hello world function[\s\S]*?```/);
      expect(content).toMatch(/```[\s\S]*?Here is a hello world function[\s\S]*?```/);
    });

    it('should export session history in JSON format', async () => {
      const sessionName = 'test-session-json';

      // Create history entries
      await historyStore.record(sessionName, {
        prompt: 'First prompt',
        responsePreview: 'First response with details',
      });

      await historyStore.record(sessionName, {
        prompt: 'Second prompt',
        responsePreview: 'Second response with more details',
      });

      // Fetch and export
      const entries = await historyStore.getBySession(sessionName);
      const chronologicalEntries = [...entries].reverse();

      const metadata = ExportFormatter.computeMetadata(sessionName, chronologicalEntries);
      const json = ExportFormatter.toJSON(chronologicalEntries, metadata);

      // Write to file
      const outputPath = path.join(tempDir, `${sessionName}-history.json`);
      await fs.writeFile(outputPath, json, 'utf-8');

      // Read and parse JSON
      const content = await fs.readFile(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      // Verify structure
      expect(parsed).toHaveProperty('metadata');
      expect(parsed).toHaveProperty('entries');

      // Verify metadata
      expect(parsed.metadata.sessionName).toBe(sessionName);
      expect(parsed.metadata.entryCount).toBe(2);
      expect(parsed.metadata.exportedAt).toBeDefined();
      expect(parsed.metadata.dateRange.oldest).toBeDefined();
      expect(parsed.metadata.dateRange.newest).toBeDefined();

      // Verify entries
      expect(parsed.entries).toHaveLength(2);
      expect(parsed.entries[0].index).toBe(0);
      expect(parsed.entries[0].prompt).toBe('First prompt');
      expect(parsed.entries[0].responsePreview).toBe('First response with details');
      expect(parsed.entries[0].timestamp).toBeDefined();

      expect(parsed.entries[1].index).toBe(1);
      expect(parsed.entries[1].prompt).toBe('Second prompt');
      expect(parsed.entries[1].responsePreview).toBe('Second response with more details');
    });

    it('should export session history in plain text format', async () => {
      const sessionName = 'test-session-txt';

      // Create history entries
      await historyStore.record(sessionName, {
        prompt: 'Implement feature X',
        responsePreview: 'Feature X implementation:\nconst x = () => { ... }',
      });

      await historyStore.record(sessionName, {
        prompt: 'Fix bug Y',
        responsePreview: 'Bug fix applied:\nif (condition) { ... }',
      });

      // Fetch and export
      const entries = await historyStore.getBySession(sessionName);
      const chronologicalEntries = [...entries].reverse();

      const metadata = ExportFormatter.computeMetadata(sessionName, chronologicalEntries);
      const text = ExportFormatter.toPlainText(chronologicalEntries, metadata);

      // Write to file
      const outputPath = path.join(tempDir, `${sessionName}-history.txt`);
      await fs.writeFile(outputPath, text, 'utf-8');

      // Read and verify content
      const content = await fs.readFile(outputPath, 'utf-8');

      // Verify header with uppercase labels
      expect(content).toContain(`SESSION: ${sessionName}`);
      expect(content).toContain('EXPORTED:');
      expect(content).toContain('ENTRIES: 2');
      expect(content).toContain('DATE RANGE:');

      // Verify separators (80 chars)
      expect(content).toContain('='.repeat(80));
      expect(content).toContain('-'.repeat(80));

      // Verify entries in chronological order
      expect(content).toContain('[#0]');
      expect(content).toContain('PROMPT:');
      expect(content).toContain('Implement feature X');
      expect(content).toContain('RESPONSE:');
      expect(content).toContain('Feature X implementation');

      expect(content).toContain('[#1]');
      expect(content).toContain('Fix bug Y');
      expect(content).toContain('Bug fix applied');
    });
  });

  describe('Export with Different History Sizes', () => {
    it('should handle single entry export', async () => {
      const sessionName = 'single-entry';

      await historyStore.record(sessionName, {
        prompt: 'Only one prompt',
        responsePreview: 'Only one response',
      });

      const entries = await historyStore.getBySession(sessionName);
      const chronologicalEntries = [...entries].reverse();

      const metadata = ExportFormatter.computeMetadata(sessionName, chronologicalEntries);
      const markdown = ExportFormatter.toMarkdown(chronologicalEntries, metadata);

      expect(markdown).toContain('**Entries:** 1');
      expect(markdown).toContain('## Prompt #0');
      expect(markdown).toContain('Only one prompt');
      expect(markdown).toContain('Only one response');

      // Date range should show same timestamp for oldest and newest
      expect(metadata.dateRange.oldest).toBe(metadata.dateRange.newest);
    });

    it('should handle large history export (100+ entries)', async () => {
      const sessionName = 'large-history';
      const entryCount = 150;

      // Create many history entries
      for (let i = 0; i < entryCount; i++) {
        await historyStore.record(sessionName, {
          prompt: `Prompt number ${i}`,
          responsePreview: `Response for prompt ${i} with some details`,
        });
      }

      const entries = await historyStore.getBySession(sessionName);
      expect(entries.length).toBe(entryCount);

      const chronologicalEntries = [...entries].reverse();
      const metadata = ExportFormatter.computeMetadata(sessionName, chronologicalEntries);

      // Export as JSON for easy verification
      const json = ExportFormatter.toJSON(chronologicalEntries, metadata);
      const parsed = JSON.parse(json);

      expect(parsed.metadata.entryCount).toBe(entryCount);
      expect(parsed.entries).toHaveLength(entryCount);

      // Verify first and last entries
      expect(parsed.entries[0].prompt).toBe('Prompt number 0');
      expect(parsed.entries[entryCount - 1].prompt).toBe(`Prompt number ${entryCount - 1}`);
    });

    it('should handle empty history gracefully', async () => {
      const sessionName = 'empty-session';
      const entries: PromptHistoryEntry[] = [];

      const metadata = ExportFormatter.computeMetadata(sessionName, entries);
      expect(metadata.entryCount).toBe(0);
      expect(metadata.dateRange.oldest).toBeNull();
      expect(metadata.dateRange.newest).toBeNull();

      // Markdown format
      const markdown = ExportFormatter.toMarkdown(entries, metadata);
      expect(markdown).toContain('**Entries:** 0');
      expect(markdown).toContain('**Date Range:** N/A (empty history)');
      expect(markdown).toContain('*No history entries found.*');

      // JSON format
      const json = ExportFormatter.toJSON(entries, metadata);
      const parsed = JSON.parse(json);
      expect(parsed.metadata.entryCount).toBe(0);
      expect(parsed.entries).toHaveLength(0);

      // Text format
      const text = ExportFormatter.toPlainText(entries, metadata);
      expect(text).toContain('ENTRIES: 0');
      expect(text).toContain('DATE RANGE: N/A (empty history)');
      expect(text).toContain('No history entries found.');
    });
  });

  describe('Content Preservation and Formatting', () => {
    it('should preserve multiline prompts and responses', async () => {
      const sessionName = 'multiline-test';

      const multilinePrompt = `This is a prompt
with multiple lines
and various formatting:
- bullet point 1
- bullet point 2`;

      const multilineResponse = `Response with code:

function example() {
  const x = 1;
  return x + 2;
}

And some explanation after.`;

      await historyStore.record(sessionName, {
        prompt: multilinePrompt,
        responsePreview: multilineResponse,
      });

      const entries = await historyStore.getBySession(sessionName);
      const chronologicalEntries = [...entries].reverse();

      // Test Markdown
      const markdown = ExportFormatter.toMarkdown(chronologicalEntries, ExportFormatter.computeMetadata(sessionName, chronologicalEntries));
      expect(markdown).toContain(multilinePrompt);
      expect(markdown).toContain('function example()');
      expect(markdown).toContain('const x = 1');

      // Test JSON (should preserve exact content)
      const json = ExportFormatter.toJSON(chronologicalEntries, ExportFormatter.computeMetadata(sessionName, chronologicalEntries));
      const parsed = JSON.parse(json);
      expect(parsed.entries[0].prompt).toBe(multilinePrompt);
      expect(parsed.entries[0].responsePreview).toBe(multilineResponse);

      // Test plain text
      const text = ExportFormatter.toPlainText(chronologicalEntries, ExportFormatter.computeMetadata(sessionName, chronologicalEntries));
      expect(text).toContain(multilinePrompt);
      expect(text).toContain('function example()');
    });

    it('should handle special characters and escape sequences', async () => {
      const sessionName = 'special-chars';

      const specialPrompt = 'Test with "quotes", \'apostrophes\', and \n newlines \t tabs';
      const specialResponse = 'Response with $special @chars #and & symbols % * () [] {}';

      await historyStore.record(sessionName, {
        prompt: specialPrompt,
        responsePreview: specialResponse,
      });

      const entries = await historyStore.getBySession(sessionName);
      const chronologicalEntries = [...entries].reverse();

      // JSON should handle all special chars correctly
      const json = ExportFormatter.toJSON(chronologicalEntries, ExportFormatter.computeMetadata(sessionName, chronologicalEntries));
      const parsed = JSON.parse(json);
      expect(parsed.entries[0].prompt).toBe(specialPrompt);
      expect(parsed.entries[0].responsePreview).toBe(specialResponse);

      // Markdown should preserve content in code blocks
      const markdown = ExportFormatter.toMarkdown(chronologicalEntries, ExportFormatter.computeMetadata(sessionName, chronologicalEntries));
      expect(markdown).toContain(specialPrompt);
      expect(markdown).toContain(specialResponse);
    });

    it('should truncate long responses to preview length', async () => {
      const sessionName = 'long-response';

      // Create a response longer than 200 chars (RESPONSE_PREVIEW_LENGTH)
      const longResponse = 'A'.repeat(300);

      await historyStore.record(sessionName, {
        prompt: 'Generate long text',
        responsePreview: longResponse,
      });

      const entries = await historyStore.getBySession(sessionName);
      expect(entries[0].responsePreview.length).toBe(200); // Should be truncated

      const chronologicalEntries = [...entries].reverse();
      const markdown = ExportFormatter.toMarkdown(chronologicalEntries, ExportFormatter.computeMetadata(sessionName, chronologicalEntries));

      // Should contain truncated version
      expect(markdown).toContain('A'.repeat(200));
      expect(markdown).not.toContain('A'.repeat(201));
    });
  });

  describe('File Path Resolution', () => {
    it('should write to absolute path when provided', async () => {
      const sessionName = 'abs-path-test';

      await historyStore.record(sessionName, {
        prompt: 'Test prompt',
        responsePreview: 'Test response',
      });

      const entries = await historyStore.getBySession(sessionName);
      const chronologicalEntries = [...entries].reverse();
      const metadata = ExportFormatter.computeMetadata(sessionName, chronologicalEntries);
      const markdown = ExportFormatter.toMarkdown(chronologicalEntries, metadata);

      // Write to explicit absolute path
      const absolutePath = path.join(tempDir, 'exports', 'custom-name.md');
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, markdown, 'utf-8');

      // Verify file exists at absolute path
      const content = await fs.readFile(absolutePath, 'utf-8');
      expect(content).toContain('Test prompt');
    });

    it('should handle relative paths correctly', async () => {
      const sessionName = 'rel-path-test';

      await historyStore.record(sessionName, {
        prompt: 'Test prompt',
        responsePreview: 'Test response',
      });

      const entries = await historyStore.getBySession(sessionName);
      const chronologicalEntries = [...entries].reverse();
      const metadata = ExportFormatter.computeMetadata(sessionName, chronologicalEntries);
      const json = ExportFormatter.toJSON(chronologicalEntries, metadata);

      // Simulate relative path (would be resolved to cwd in real CLI)
      const relativePath = 'export-output.json';
      const resolvedPath = path.resolve(tempDir, relativePath);

      await fs.writeFile(resolvedPath, json, 'utf-8');

      const content = await fs.readFile(resolvedPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.metadata.sessionName).toBe(sessionName);
    });
  });

  describe('Error Cases', () => {
    it('should handle non-existent session gracefully', async () => {
      const sessionName = 'non-existent';

      // Try to fetch history for session that doesn't exist
      const entries = await historyStore.getBySession(sessionName);
      expect(entries.length).toBe(0);

      // Export should still work with empty entries
      const metadata = ExportFormatter.computeMetadata(sessionName, entries);
      const markdown = ExportFormatter.toMarkdown(entries, metadata);

      expect(markdown).toContain('*No history entries found.*');
    });

    it('should handle invalid session names in metadata', async () => {
      const sessionName = 'session-with-special/chars\\and:stuff';
      const entries: PromptHistoryEntry[] = [];

      const metadata = ExportFormatter.computeMetadata(sessionName, entries);
      expect(metadata.sessionName).toBe(sessionName);

      const markdown = ExportFormatter.toMarkdown(entries, metadata);
      expect(markdown).toContain(sessionName);
    });
  });

  describe('Metadata Accuracy', () => {
    it('should compute correct date range for multiple entries', async () => {
      const sessionName = 'date-range-test';

      // Create entries with slight delays to ensure different timestamps
      await historyStore.record(sessionName, {
        prompt: 'First',
        responsePreview: 'First response',
      });

      // Wait a bit to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));

      await historyStore.record(sessionName, {
        prompt: 'Second',
        responsePreview: 'Second response',
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      await historyStore.record(sessionName, {
        prompt: 'Third',
        responsePreview: 'Third response',
      });

      const entries = await historyStore.getBySession(sessionName);
      const chronologicalEntries = [...entries].reverse();

      const metadata = ExportFormatter.computeMetadata(sessionName, chronologicalEntries);

      expect(metadata.entryCount).toBe(3);
      expect(metadata.dateRange.oldest).toBeDefined();
      expect(metadata.dateRange.newest).toBeDefined();

      // Oldest should be less than newest
      const oldest = new Date(metadata.dateRange.oldest!);
      const newest = new Date(metadata.dateRange.newest!);
      expect(oldest.getTime()).toBeLessThanOrEqual(newest.getTime());
    });

    it('should handle unsorted entries correctly', async () => {
      const sessionName = 'unsorted-test';

      // Create entries
      await historyStore.record(sessionName, {
        prompt: 'Entry 1',
        responsePreview: 'Response 1',
      });

      await historyStore.record(sessionName, {
        prompt: 'Entry 2',
        responsePreview: 'Response 2',
      });

      await historyStore.record(sessionName, {
        prompt: 'Entry 3',
        responsePreview: 'Response 3',
      });

      // Get entries (already reverse chronological from getBySession)
      const reverseEntries = await historyStore.getBySession(sessionName);

      // Compute metadata should still work correctly regardless of order
      const metadata = ExportFormatter.computeMetadata(sessionName, reverseEntries);
      expect(metadata.entryCount).toBe(3);

      // Should find correct oldest/newest regardless of input order
      const oldest = new Date(metadata.dateRange.oldest!);
      const newest = new Date(metadata.dateRange.newest!);
      expect(oldest.getTime()).toBeLessThanOrEqual(newest.getTime());
    });

    it('should include correct export timestamp', async () => {
      const sessionName = 'timestamp-test';
      const entries: PromptHistoryEntry[] = [];

      const beforeExport = new Date();
      const metadata = ExportFormatter.computeMetadata(sessionName, entries);
      const afterExport = new Date();

      const exportedAt = new Date(metadata.exportedAt);
      expect(exportedAt.getTime()).toBeGreaterThanOrEqual(beforeExport.getTime());
      expect(exportedAt.getTime()).toBeLessThanOrEqual(afterExport.getTime());
    });
  });

  describe('Format-Specific Features', () => {
    it('should use proper Markdown heading levels', async () => {
      const sessionName = 'md-headings';

      await historyStore.record(sessionName, {
        prompt: 'Test',
        responsePreview: 'Response',
      });

      const entries = await historyStore.getBySession(sessionName);
      const chronologicalEntries = [...entries].reverse();
      const markdown = ExportFormatter.toMarkdown(chronologicalEntries, ExportFormatter.computeMetadata(sessionName, chronologicalEntries));

      // Should have exactly one H1 (session name)
      const h1Count = (markdown.match(/^# /gm) || []).length;
      expect(h1Count).toBe(1);

      // Should have H2 for each prompt
      const h2Count = (markdown.match(/^## Prompt #/gm) || []).length;
      expect(h2Count).toBe(1);
    });

    it('should use proper JSON indentation', async () => {
      const sessionName = 'json-indent';

      await historyStore.record(sessionName, {
        prompt: 'Test',
        responsePreview: 'Response',
      });

      const entries = await historyStore.getBySession(sessionName);
      const chronologicalEntries = [...entries].reverse();
      const json = ExportFormatter.toJSON(chronologicalEntries, ExportFormatter.computeMetadata(sessionName, chronologicalEntries));

      // Should be 2-space indented
      expect(json).toContain('  "metadata"');
      expect(json).toContain('  "entries"');

      // Should be valid JSON
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should use uppercase labels in plain text format', async () => {
      const sessionName = 'text-labels';

      await historyStore.record(sessionName, {
        prompt: 'Test',
        responsePreview: 'Response',
      });

      const entries = await historyStore.getBySession(sessionName);
      const chronologicalEntries = [...entries].reverse();
      const text = ExportFormatter.toPlainText(chronologicalEntries, ExportFormatter.computeMetadata(sessionName, chronologicalEntries));

      // Should have uppercase labels
      expect(text).toContain('SESSION:');
      expect(text).toContain('EXPORTED:');
      expect(text).toContain('ENTRIES:');
      expect(text).toContain('DATE RANGE:');
      expect(text).toContain('PROMPT:');
      expect(text).toContain('RESPONSE:');
    });
  });

  describe('Full Workflow Simulation', () => {
    it('should export history from a session with realistic prompts', async () => {
      const sessionName = 'realistic-workflow';

      // Simulate a realistic session workflow
      const prompts = [
        {
          prompt: 'Create a new React component for user profile',
          responsePreview: 'I\'ll create a UserProfile component with the following structure:\n\nimport React from \'react\';\n\nexport const UserProfile = ({ user }) => {...}',
        },
        {
          prompt: 'Add TypeScript types',
          responsePreview: 'I\'ve added TypeScript types:\n\ninterface User {\n  id: string;\n  name: string;\n  email: string;\n}\n\nexport const UserProfile: React.FC<{ user: User }> = ({ user }) => {...}',
        },
        {
          prompt: 'Write unit tests',
          responsePreview: 'Here are the unit tests using Jest and React Testing Library:\n\nimport { render, screen } from \'@testing-library/react\';\nimport { UserProfile } from \'./UserProfile\';\n\ndescribe(\'UserProfile\', () => {...}',
        },
        {
          prompt: 'Add styling with Tailwind CSS',
          responsePreview: 'I\'ve added Tailwind CSS classes:\n\nexport const UserProfile: React.FC<{ user: User }> = ({ user }) => (\n  <div className="p-4 bg-white rounded-lg shadow-md">...',
        },
      ];

      // Record all prompts
      for (const p of prompts) {
        await historyStore.record(sessionName, p);
      }

      // Export in all three formats
      const entries = await historyStore.getBySession(sessionName);
      const chronologicalEntries = [...entries].reverse();
      const metadata = ExportFormatter.computeMetadata(sessionName, chronologicalEntries);

      // Test Markdown export
      const markdown = ExportFormatter.toMarkdown(chronologicalEntries, metadata);
      const mdPath = path.join(tempDir, `${sessionName}.md`);
      await fs.writeFile(mdPath, markdown, 'utf-8');
      const mdContent = await fs.readFile(mdPath, 'utf-8');
      expect(mdContent).toContain('Create a new React component');
      expect(mdContent).toContain('Add TypeScript types');
      expect(mdContent).toContain('Write unit tests');
      expect(mdContent).toContain('Add styling with Tailwind CSS');

      // Test JSON export
      const json = ExportFormatter.toJSON(chronologicalEntries, metadata);
      const jsonPath = path.join(tempDir, `${sessionName}.json`);
      await fs.writeFile(jsonPath, json, 'utf-8');
      const jsonContent = await fs.readFile(jsonPath, 'utf-8');
      const parsed = JSON.parse(jsonContent);
      expect(parsed.metadata.entryCount).toBe(4);
      expect(parsed.entries[0].prompt).toBe('Create a new React component for user profile');
      expect(parsed.entries[3].prompt).toBe('Add styling with Tailwind CSS');

      // Test text export
      const text = ExportFormatter.toPlainText(chronologicalEntries, metadata);
      const txtPath = path.join(tempDir, `${sessionName}.txt`);
      await fs.writeFile(txtPath, text, 'utf-8');
      const txtContent = await fs.readFile(txtPath, 'utf-8');
      expect(txtContent).toContain('[#0]');
      expect(txtContent).toContain('[#1]');
      expect(txtContent).toContain('[#2]');
      expect(txtContent).toContain('[#3]');
      expect(txtContent).toContain('PROMPT:');
      expect(txtContent).toContain('RESPONSE:');
    });

    it('should handle concurrent exports to different files', async () => {
      const session1 = 'concurrent-1';
      const session2 = 'concurrent-2';

      // Create history for two sessions
      await historyStore.record(session1, {
        prompt: 'Session 1 prompt',
        responsePreview: 'Session 1 response',
      });

      await historyStore.record(session2, {
        prompt: 'Session 2 prompt',
        responsePreview: 'Session 2 response',
      });

      // Export both sessions concurrently
      const [entries1, entries2] = await Promise.all([
        historyStore.getBySession(session1),
        historyStore.getBySession(session2),
      ]);

      const chrono1 = [...entries1].reverse();
      const chrono2 = [...entries2].reverse();

      const [markdown1, markdown2] = [
        ExportFormatter.toMarkdown(chrono1, ExportFormatter.computeMetadata(session1, chrono1)),
        ExportFormatter.toMarkdown(chrono2, ExportFormatter.computeMetadata(session2, chrono2)),
      ];

      // Write both files concurrently
      await Promise.all([
        fs.writeFile(path.join(tempDir, 'session1.md'), markdown1, 'utf-8'),
        fs.writeFile(path.join(tempDir, 'session2.md'), markdown2, 'utf-8'),
      ]);

      // Verify both files exist and have correct content
      const content1 = await fs.readFile(path.join(tempDir, 'session1.md'), 'utf-8');
      const content2 = await fs.readFile(path.join(tempDir, 'session2.md'), 'utf-8');

      expect(content1).toContain('Session 1 prompt');
      expect(content1).not.toContain('Session 2 prompt');

      expect(content2).toContain('Session 2 prompt');
      expect(content2).not.toContain('Session 1 prompt');
    });

    it('should preserve chronological order across multiple exports', async () => {
      const sessionName = 'order-preservation';

      // Create entries with known order
      for (let i = 0; i < 5; i++) {
        await historyStore.record(sessionName, {
          prompt: `Prompt ${i}`,
          responsePreview: `Response ${i}`,
        });
      }

      // Export multiple times
      for (let exportNum = 0; exportNum < 3; exportNum++) {
        const entries = await historyStore.getBySession(sessionName);
        const chronologicalEntries = [...entries].reverse();

        // Verify order is preserved
        for (let i = 0; i < chronologicalEntries.length; i++) {
          expect(chronologicalEntries[i].index).toBe(i);
          expect(chronologicalEntries[i].prompt).toBe(`Prompt ${i}`);
        }

        const markdown = ExportFormatter.toMarkdown(
          chronologicalEntries,
          ExportFormatter.computeMetadata(sessionName, chronologicalEntries),
        );

        // Verify entries appear in correct order in export
        const prompt0Index = markdown.indexOf('Prompt 0');
        const prompt4Index = markdown.indexOf('Prompt 4');
        expect(prompt0Index).toBeLessThan(prompt4Index);
      }
    });
  });
});
