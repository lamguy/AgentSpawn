import { describe, it, expect, beforeEach } from 'vitest';
import { Registry } from './registry.js';
import { RegistryData, RegistryEntry, SessionState } from '../types.js';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

function tmpFile(): string {
  return path.join(
    os.tmpdir(),
    `registry-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
}

function makeEntry(name: string): RegistryEntry {
  return {
    name,
    pid: 1234,
    state: SessionState.Running,
    startedAt: new Date().toISOString(),
    workingDirectory: '/tmp/work',
  };
}

describe('Registry', () => {
  let filePath: string;
  let registry: Registry;

  beforeEach(() => {
    filePath = tmpFile();
    registry = new Registry(filePath);
  });

  it('can be instantiated with a file path', () => {
    expect(registry).toBeInstanceOf(Registry);
  });

  it('load() returns default data when file does not exist', async () => {
    const data = await registry.load();
    expect(data).toEqual({ version: 1, sessions: {} });
  });

  it('save() and load() round-trip', async () => {
    const data: RegistryData = {
      version: 1,
      sessions: {
        'sess-1': makeEntry('sess-1'),
      },
    };

    await registry.save(data);
    const loaded = await registry.load();
    expect(loaded).toEqual(data);

    // cleanup
    await fs.unlink(filePath).catch(() => {});
  });

  it('addEntry() persists an entry', async () => {
    const entry = makeEntry('new-entry');
    await registry.addEntry(entry);

    const data = await registry.load();
    expect(data.sessions['new-entry']).toEqual(entry);

    // cleanup
    await fs.unlink(filePath).catch(() => {});
  });

  it('removeEntry() removes an entry', async () => {
    const entry = makeEntry('to-remove');
    await registry.addEntry(entry);

    let data = await registry.load();
    expect(data.sessions['to-remove']).toBeDefined();

    await registry.removeEntry('to-remove');

    data = await registry.load();
    expect(data.sessions['to-remove']).toBeUndefined();

    // cleanup
    await fs.unlink(filePath).catch(() => {});
  });
});
