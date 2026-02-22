import fs from 'node:fs/promises';
import path from 'node:path';
import { lock } from 'proper-lockfile';
import { RemoteData, RemoteEntry } from '../types.js';
import { RemoteAlreadyExistsError, RemoteCorruptError, RemoteLockError, RemoteNotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const LOCK_OPTIONS = {
  retries: { retries: 5, factor: 2, minTimeout: 100, maxTimeout: 2000 },
  stale: 10_000,
  realpath: false,
};

function emptyData(): RemoteData {
  return { version: 1, remotes: {} };
}

export class RemoteManager {
  constructor(private readonly filePath: string) {}

  getFilePath(): string {
    return this.filePath;
  }

  async load(): Promise<RemoteData> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        logger.error(`Remotes file is corrupt: ${this.filePath}`);
        throw new RemoteCorruptError(this.filePath);
      }

      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        typeof (parsed as Record<string, unknown>).version !== 'number' ||
        typeof (parsed as Record<string, unknown>).remotes !== 'object' ||
        (parsed as Record<string, unknown>).remotes === null
      ) {
        logger.error(`Remotes file has invalid structure: ${this.filePath}`);
        throw new RemoteCorruptError(this.filePath);
      }

      return parsed as RemoteData;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return emptyData();
      }
      throw err;
    }
  }

  async save(data: RemoteData): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tmpPath, this.filePath);
    logger.debug(`Remotes saved to ${this.filePath}`);
  }

  async withLock(mutator: (data: RemoteData) => void): Promise<void> {
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
      throw new RemoteLockError(this.filePath, err instanceof Error ? err : undefined);
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

  async addRemote(entry: RemoteEntry): Promise<void> {
    await this.withLock((data) => {
      if (data.remotes[entry.alias]) {
        throw new RemoteAlreadyExistsError(entry.alias);
      }
      data.remotes[entry.alias] = entry;
    });
  }

  async removeRemote(alias: string): Promise<void> {
    await this.withLock((data) => {
      if (!data.remotes[alias]) {
        throw new RemoteNotFoundError(alias);
      }
      delete data.remotes[alias];
    });
  }

  async getRemote(alias: string): Promise<RemoteEntry | undefined> {
    const data = await this.load();
    return data.remotes[alias];
  }

  async listRemotes(): Promise<RemoteEntry[]> {
    const data = await this.load();
    return Object.values(data.remotes);
  }
}
