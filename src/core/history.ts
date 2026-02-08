import { PromptHistoryEntry } from '../types.js';
import { logger } from '../utils/logger.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_HISTORY_LINES = 10000;
const ROTATION_PERCENT = 0.2;
const RESPONSE_PREVIEW_LENGTH = 200;

export interface HistorySearchResult extends PromptHistoryEntry {
  sessionName: string;
}

export interface HistorySearchOptions {
  sessionName?: string;
  limit?: number;
}

export class HistoryStore {
  private locks: Map<string, Promise<void>> = new Map();

  constructor(private readonly historyDir: string) {}

  private async withSessionLock(sessionName: string, fn: () => Promise<void>): Promise<void> {
    const prev = this.locks.get(sessionName) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.locks.set(sessionName, next);
    return next;
  }

  async record(
    sessionName: string,
    entry: { prompt: string; responsePreview: string },
  ): Promise<void> {
    return this.withSessionLock(sessionName, async () => {
      const filePath = this.getFilePath(sessionName);
      await fs.mkdir(this.historyDir, { recursive: true });

      const existingLines = await this.readLines(filePath);
      const index = existingLines.length;

      const record: PromptHistoryEntry = {
        index,
        prompt: entry.prompt,
        responsePreview: entry.responsePreview.slice(0, RESPONSE_PREVIEW_LENGTH),
        timestamp: new Date().toISOString(),
      };

      await fs.appendFile(filePath, JSON.stringify(record) + '\n', 'utf-8');
      logger.debug(`Recorded history entry ${index} for session "${sessionName}"`);

      // Check line count after append
      const totalLines = index + 1;
      if (totalLines > MAX_HISTORY_LINES) {
        await this.rotate(sessionName);
      }
    });
  }

  async getBySession(
    sessionName: string,
    limit?: number,
  ): Promise<PromptHistoryEntry[]> {
    const filePath = this.getFilePath(sessionName);
    const lines = await this.readLines(filePath);
    const entries = this.parseLines(lines);

    // Return in reverse chronological order
    entries.reverse();

    if (limit !== undefined && limit > 0) {
      return entries.slice(0, limit);
    }
    return entries;
  }

  async search(
    query: string,
    options?: HistorySearchOptions,
  ): Promise<HistorySearchResult[]> {
    const limit = options?.limit ?? 50;
    const lowerQuery = query.toLowerCase();
    const results: HistorySearchResult[] = [];

    if (options?.sessionName) {
      const entries = await this.getBySession(options.sessionName);
      for (const entry of entries) {
        if (entry.prompt.toLowerCase().includes(lowerQuery)) {
          results.push({ ...entry, sessionName: options.sessionName });
        }
      }
    } else {
      // Search all NDJSON files
      let files: string[];
      try {
        files = await fs.readdir(this.historyDir);
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          return [];
        }
        throw err;
      }

      const ndjsonFiles = files.filter((f) => f.endsWith('.ndjson'));

      for (const file of ndjsonFiles) {
        const sessionName = file.replace(/\.ndjson$/, '');
        const entries = await this.getBySession(sessionName);
        for (const entry of entries) {
          if (entry.prompt.toLowerCase().includes(lowerQuery)) {
            results.push({ ...entry, sessionName });
          }
        }
      }
    }

    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return results.slice(0, limit);
  }

  async clear(sessionName: string): Promise<void> {
    const filePath = this.getFilePath(sessionName);
    try {
      await fs.unlink(filePath);
      logger.debug(`Cleared history for session "${sessionName}"`);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw err;
    }
  }

  private async rotate(sessionName: string): Promise<void> {
    const filePath = this.getFilePath(sessionName);
    const lines = await this.readLines(filePath);

    if (lines.length <= MAX_HISTORY_LINES) {
      return;
    }

    const discardCount = Math.floor(lines.length * ROTATION_PERCENT);
    const remaining = lines.slice(discardCount);
    // Re-index entries to maintain sequential indices
    const reindexed = remaining.map((line, i) => {
      try {
        const entry = JSON.parse(line);
        entry.index = i;
        return JSON.stringify(entry);
      } catch {
        return line; // Keep malformed lines as-is
      }
    });

    // Write atomically: write to .tmp then rename
    const tmpPath = filePath + '.tmp';
    await fs.writeFile(tmpPath, reindexed.join('\n') + '\n', 'utf-8');
    await fs.rename(tmpPath, filePath);

    logger.debug(
      `Rotated history for session "${sessionName}": discarded ${discardCount} oldest entries`,
    );
  }

  private getFilePath(sessionName: string): string {
    const sanitized = sessionName.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.historyDir, sanitized + '.ndjson');
  }

  private async readLines(filePath: string): Promise<string[]> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      // Filter out empty lines
      return content.split('\n').filter((line) => line.trim().length > 0);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }

  private parseLines(lines: string[]): PromptHistoryEntry[] {
    const entries: PromptHistoryEntry[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as PromptHistoryEntry;
        entries.push(parsed);
      } catch {
        logger.warn(`Skipping malformed history line: ${line.slice(0, 100)}`);
      }
    }
    return entries;
  }
}
