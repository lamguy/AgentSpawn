import { RegistryData, RegistryEntry } from '../types.js';
import { RegistryCorruptError, RegistryLockError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { lock } from 'proper-lockfile';

const LOCK_OPTIONS = {
  retries: { retries: 5, factor: 2, minTimeout: 100, maxTimeout: 2000 },
  stale: 10_000,
  realpath: false,
};

export class Registry {
  constructor(private readonly filePath: string) {}

  getFilePath(): string {
    return this.filePath;
  }

  async load(): Promise<RegistryData> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        logger.error(`Registry file is corrupt: ${this.filePath}`);
        throw new RegistryCorruptError(this.filePath);
      }

      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        typeof (parsed as Record<string, unknown>).version !== 'number' ||
        typeof (parsed as Record<string, unknown>).sessions !== 'object' ||
        (parsed as Record<string, unknown>).sessions === null
      ) {
        logger.error(`Registry file has invalid structure: ${this.filePath}`);
        throw new RegistryCorruptError(this.filePath);
      }

      return parsed as RegistryData;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { version: 1, sessions: {} };
      }
      throw err;
    }
  }

  async save(data: RegistryData): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tmpPath, this.filePath);
    logger.debug(`Registry saved to ${this.filePath}`);
  }

  async withLock(mutator: (data: RegistryData) => void): Promise<void> {
    // Ensure the file exists before locking (proper-lockfile requires it)
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    try {
      await fs.access(this.filePath);
    } catch {
      await fs.writeFile(
        this.filePath,
        JSON.stringify({ version: 1, sessions: {} }, null, 2),
        'utf-8',
      );
    }

    let release: (() => Promise<void>) | undefined;
    try {
      release = await lock(this.filePath, LOCK_OPTIONS);
    } catch (err: unknown) {
      throw new RegistryLockError(this.filePath, err instanceof Error ? err : undefined);
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

  async addEntry(entry: RegistryEntry): Promise<void> {
    await this.withLock((data) => {
      data.sessions[entry.name] = entry;
    });
  }

  async removeEntry(name: string): Promise<void> {
    await this.withLock((data) => {
      delete data.sessions[name];
    });
  }

  async getAll(): Promise<RegistryData> {
    return this.load();
  }
}
