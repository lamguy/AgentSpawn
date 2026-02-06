import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');

describe('Project Scaffold', () => {
  it('package.json exists and has "agentspawn" in bin', async () => {
    const raw = await fs.readFile(path.join(ROOT, 'package.json'), 'utf-8');
    const pkg = JSON.parse(raw);
    expect(pkg.bin).toBeDefined();
    expect(pkg.bin).toHaveProperty('agentspawn');
  });

  it('tsconfig.json has strict: true', async () => {
    const raw = await fs.readFile(path.join(ROOT, 'tsconfig.json'), 'utf-8');
    const tsconfig = JSON.parse(raw);
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });

  it('all planned source directories exist', async () => {
    const dirs = [
      'src/cli',
      'src/cli/commands',
      'src/core',
      'src/io',
      'src/config',
      'src/utils',
    ];

    for (const dir of dirs) {
      const fullPath = path.join(ROOT, dir);
      const stat = await fs.stat(fullPath);
      expect(stat.isDirectory(), `${dir} should be a directory`).toBe(true);
    }
  });

  it('src/types.ts exports SessionState', async () => {
    const { SessionState } = await import('../../src/types.js');
    expect(SessionState).toBeDefined();
  });

  it('src/index.ts exists', async () => {
    await expect(
      fs.access(path.join(ROOT, 'src', 'index.ts'))
    ).resolves.toBeUndefined();
  });
});
