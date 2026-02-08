import { WorkspaceData, WorkspaceEntry } from '../types.js';
import {
  WorkspaceAlreadyExistsError,
  WorkspaceCorruptError,
  WorkspaceLockError,
  WorkspaceNotFoundError,
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

function emptyData(): WorkspaceData {
  return { version: 1, workspaces: {} };
}

export class WorkspaceManager {
  constructor(private readonly filePath: string) {}

  getFilePath(): string {
    return this.filePath;
  }

  async load(): Promise<WorkspaceData> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        logger.error(`Workspace file is corrupt: ${this.filePath}`);
        throw new WorkspaceCorruptError(this.filePath);
      }

      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        typeof (parsed as Record<string, unknown>).version !== 'number' ||
        typeof (parsed as Record<string, unknown>).workspaces !== 'object' ||
        (parsed as Record<string, unknown>).workspaces === null
      ) {
        logger.error(`Workspace file has invalid structure: ${this.filePath}`);
        throw new WorkspaceCorruptError(this.filePath);
      }

      return parsed as WorkspaceData;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return emptyData();
      }
      throw err;
    }
  }

  async save(data: WorkspaceData): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tmpPath, this.filePath);
    logger.debug(`Workspaces saved to ${this.filePath}`);
  }

  async withLock(mutator: (data: WorkspaceData) => void): Promise<void> {
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
      throw new WorkspaceLockError(this.filePath, err instanceof Error ? err : undefined);
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

  async create(name: string): Promise<void> {
    await this.withLock((data) => {
      if (data.workspaces[name]) {
        throw new WorkspaceAlreadyExistsError(name);
      }
      data.workspaces[name] = {
        name,
        sessionNames: [],
        createdAt: new Date().toISOString(),
      };
    });
  }

  async delete(name: string): Promise<void> {
    await this.withLock((data) => {
      if (!data.workspaces[name]) {
        throw new WorkspaceNotFoundError(name);
      }
      delete data.workspaces[name];
    });
  }

  async addSessions(workspaceName: string, sessionNames: string[]): Promise<string[]> {
    const added: string[] = [];
    await this.withLock((data) => {
      const workspace = data.workspaces[workspaceName];
      if (!workspace) {
        throw new WorkspaceNotFoundError(workspaceName);
      }
      const existing = new Set(workspace.sessionNames);
      for (const name of sessionNames) {
        if (!existing.has(name)) {
          workspace.sessionNames.push(name);
          existing.add(name);
          added.push(name);
        }
      }
    });
    return added;
  }

  async removeSessions(workspaceName: string, sessionNames: string[]): Promise<string[]> {
    const removed: string[] = [];
    await this.withLock((data) => {
      const workspace = data.workspaces[workspaceName];
      if (!workspace) {
        throw new WorkspaceNotFoundError(workspaceName);
      }
      const toRemove = new Set(sessionNames);
      const original = workspace.sessionNames;
      workspace.sessionNames = [];
      for (const name of original) {
        if (toRemove.has(name)) {
          removed.push(name);
        } else {
          workspace.sessionNames.push(name);
        }
      }
    });
    return removed;
  }

  async list(): Promise<WorkspaceEntry[]> {
    const data = await this.load();
    return Object.values(data.workspaces);
  }

  async get(name: string): Promise<WorkspaceEntry> {
    const data = await this.load();
    const workspace = data.workspaces[name];
    if (!workspace) {
      throw new WorkspaceNotFoundError(name);
    }
    return workspace;
  }

  async getSessionNames(name: string): Promise<string[]> {
    const workspace = await this.get(name);
    return workspace.sessionNames;
  }
}
