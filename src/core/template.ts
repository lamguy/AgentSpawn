import { TemplateData, TemplateEntry } from '../types.js';
import {
  TemplateAlreadyExistsError,
  TemplateCorruptError,
  TemplateLockError,
  TemplateNotFoundError,
} from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { lock } from 'proper-lockfile';

const LOCK_OPTIONS = {
  retries: { retries: 5, factor: 2, minTimeout: 100, maxTimeout: 2000 },
  stale: 10_000,
  realpath: false,
};

function emptyData(): TemplateData {
  return { version: 1, templates: {} };
}

export class TemplateManager {
  constructor(private readonly filePath: string) {}

  getFilePath(): string {
    return this.filePath;
  }

  async load(): Promise<TemplateData> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        logger.error(`Template file is corrupt: ${this.filePath}`);
        throw new TemplateCorruptError(this.filePath);
      }

      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        typeof (parsed as Record<string, unknown>).version !== 'number' ||
        typeof (parsed as Record<string, unknown>).templates !== 'object' ||
        (parsed as Record<string, unknown>).templates === null
      ) {
        logger.error(`Template file has invalid structure: ${this.filePath}`);
        throw new TemplateCorruptError(this.filePath);
      }

      return parsed as TemplateData;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return emptyData();
      }
      throw err;
    }
  }

  async save(data: TemplateData): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tmpPath, this.filePath);
    logger.debug(`Templates saved to ${this.filePath}`);
  }

  async withLock(mutator: (data: TemplateData) => void): Promise<void> {
    // Ensure the file exists before locking (proper-lockfile requires it)
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    try {
      await fs.access(this.filePath);
    } catch {
      await fs.writeFile(
        this.filePath,
        JSON.stringify(emptyData(), null, 2),
        'utf-8',
      );
    }

    let release: (() => Promise<void>) | undefined;
    try {
      release = await lock(this.filePath, LOCK_OPTIONS);
    } catch (err: unknown) {
      throw new TemplateLockError(this.filePath, err instanceof Error ? err : undefined);
    }

    try {
      const data = await this.load();
      mutator(data);
      await this.save(data);
    } finally {
      try {
        await release();
      } catch {
        // Lock may already be released if the file was removed
      }
    }
  }

  async create(
    name: string,
    config: {
      workingDirectory?: string;
      permissionMode?: string;
      systemPrompt?: string;
      env?: Record<string, string>;
    },
  ): Promise<void> {
    await this.withLock((data) => {
      if (data.templates[name]) {
        throw new TemplateAlreadyExistsError(name);
      }
      const entry: TemplateEntry = {
        name,
        createdAt: new Date().toISOString(),
      };
      if (config.workingDirectory !== undefined) {
        entry.workingDirectory = config.workingDirectory;
      }
      if (config.permissionMode !== undefined) {
        entry.permissionMode = config.permissionMode;
      }
      if (config.systemPrompt !== undefined) {
        entry.systemPrompt = config.systemPrompt;
      }
      if (config.env !== undefined) {
        entry.env = config.env;
      }
      data.templates[name] = entry;
    });
  }

  async delete(name: string): Promise<void> {
    await this.withLock((data) => {
      if (!data.templates[name]) {
        throw new TemplateNotFoundError(name);
      }
      delete data.templates[name];
    });
  }

  async list(): Promise<TemplateEntry[]> {
    const data = await this.load();
    return Object.values(data.templates);
  }

  async get(name: string): Promise<TemplateEntry> {
    const data = await this.load();
    const template = data.templates[name];
    if (!template) {
      throw new TemplateNotFoundError(name);
    }
    return template;
  }
}
