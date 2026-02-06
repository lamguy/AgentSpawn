import { RegistryData, RegistryEntry } from '../types.js';
import { RegistryCorruptError } from '../utils/errors.js';
import fs from 'node:fs/promises';
import path from 'node:path';

export class Registry {
  constructor(private readonly filePath: string) {}

  async load(): Promise<RegistryData> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new RegistryCorruptError(this.filePath);
      }

      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        typeof (parsed as Record<string, unknown>).version !== 'number' ||
        typeof (parsed as Record<string, unknown>).sessions !== 'object' ||
        (parsed as Record<string, unknown>).sessions === null
      ) {
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
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async addEntry(entry: RegistryEntry): Promise<void> {
    const data = await this.load();
    data.sessions[entry.name] = entry;
    await this.save(data);
  }

  async removeEntry(name: string): Promise<void> {
    const data = await this.load();
    delete data.sessions[name];
    await this.save(data);
  }

  async getAll(): Promise<RegistryData> {
    return this.load();
  }
}
