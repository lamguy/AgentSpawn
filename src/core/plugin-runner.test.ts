import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PluginRunner } from './plugin-runner.js';
import * as fs from 'node:fs/promises';
import * as childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';

vi.mock('node:fs/promises');
vi.mock('node:child_process');

const mockFs = vi.mocked(fs);
const mockChildProcess = vi.mocked(childProcess);

function makeMockChild(exitCode: number = 0): childProcess.ChildProcess {
  const child = new EventEmitter() as childProcess.ChildProcess;
  // Simulate async close on next tick
  setTimeout(() => child.emit('close', exitCode), 0);
  return child;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PluginRunner.empty()', () => {
  it('returns a runner that fires no scripts', async () => {
    const runner = PluginRunner.empty();
    mockChildProcess.spawn.mockReturnValue(makeMockChild());
    await runner.fire('my-session', 'onStart', { workingDirectory: '/tmp' });
    expect(mockChildProcess.spawn).not.toHaveBeenCalled();
  });
});

describe('PluginRunner.load()', () => {
  it('returns an empty runner when plugins.json does not exist', async () => {
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    mockFs.readFile.mockRejectedValue(err);

    const runner = await PluginRunner.load('/tmp/test-config');
    mockChildProcess.spawn.mockReturnValue(makeMockChild());
    await runner.fire('session', 'onStart', {});
    expect(mockChildProcess.spawn).not.toHaveBeenCalled();
  });

  it('returns an empty runner when plugins.json is malformed JSON', async () => {
    mockFs.readFile.mockResolvedValue('not-valid-json' as unknown as Buffer);

    const runner = await PluginRunner.load('/tmp/test-config');
    mockChildProcess.spawn.mockReturnValue(makeMockChild());
    await runner.fire('session', 'onStart', {});
    expect(mockChildProcess.spawn).not.toHaveBeenCalled();
  });

  it('returns an empty runner when plugins.json has invalid structure', async () => {
    mockFs.readFile.mockResolvedValue('{"version": 1}' as unknown as Buffer);

    const runner = await PluginRunner.load('/tmp/test-config');
    mockChildProcess.spawn.mockReturnValue(makeMockChild());
    await runner.fire('session', 'onStart', {});
    expect(mockChildProcess.spawn).not.toHaveBeenCalled();
  });

  it('loads plugins from valid plugins.json', async () => {
    const pluginsJson = JSON.stringify({
      plugins: [
        { event: 'onStart', script: './plugins/setup.sh' },
        { event: 'onStop', script: './plugins/cleanup.sh' },
      ],
    });
    mockFs.readFile.mockResolvedValue(pluginsJson as unknown as Buffer);

    const runner = await PluginRunner.load('/tmp/test-config');
    mockChildProcess.spawn.mockReturnValue(makeMockChild());
    await runner.fire('session', 'onStart', { workingDirectory: '/tmp' });
    expect(mockChildProcess.spawn).toHaveBeenCalledTimes(1);
    expect(mockChildProcess.spawn).toHaveBeenCalledWith(
      './plugins/setup.sh',
      [],
      expect.objectContaining({ shell: true }),
    );
  });

  it('uses ~/.agentspawn/plugins.json as default path', async () => {
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    mockFs.readFile.mockRejectedValue(err);

    await PluginRunner.load();

    expect(mockFs.readFile).toHaveBeenCalledWith(
      expect.stringContaining('plugins.json'),
      'utf-8',
    );
    expect(mockFs.readFile).toHaveBeenCalledWith(
      expect.stringContaining('.agentspawn'),
      'utf-8',
    );
  });
});

describe('PluginRunner.fire()', () => {
  async function makeRunner(scripts: string[], event = 'onStart'): Promise<PluginRunner> {
    const plugins = scripts.map((script) => ({ event, script }));
    const pluginsJson = JSON.stringify({ plugins });
    mockFs.readFile.mockResolvedValue(pluginsJson as unknown as Buffer);
    return PluginRunner.load('/tmp/test-config');
  }

  it('executes matching scripts with correct environment variables', async () => {
    const runner = await makeRunner(['./notify.sh'], 'onResponse');
    mockChildProcess.spawn.mockReturnValue(makeMockChild());

    await runner.fire('my-session', 'onResponse', { response: 'hello', responseTimeMs: 123 });

    expect(mockChildProcess.spawn).toHaveBeenCalledWith(
      './notify.sh',
      [],
      expect.objectContaining({
        shell: true,
        stdio: 'ignore',
        env: expect.objectContaining({
          AGENTSPAWN_SESSION: 'my-session',
          AGENTSPAWN_EVENT: 'onResponse',
          AGENTSPAWN_DATA: JSON.stringify({ response: 'hello', responseTimeMs: 123 }),
        }),
      }),
    );
  });

  it('only fires scripts matching the event', async () => {
    const pluginsJson = JSON.stringify({
      plugins: [
        { event: 'onStart', script: './setup.sh' },
        { event: 'onStop', script: './cleanup.sh' },
        { event: 'onPrompt', script: './log.sh' },
      ],
    });
    mockFs.readFile.mockResolvedValue(pluginsJson as unknown as Buffer);
    const runner = await PluginRunner.load('/tmp/test-config');

    mockChildProcess.spawn.mockReturnValue(makeMockChild());
    await runner.fire('session', 'onStop', {});

    expect(mockChildProcess.spawn).toHaveBeenCalledTimes(1);
    expect(mockChildProcess.spawn).toHaveBeenCalledWith('./cleanup.sh', [], expect.any(Object));
  });

  it('fires multiple scripts for the same event', async () => {
    const runner = await makeRunner(['./a.sh', './b.sh'], 'onCrash');
    mockChildProcess.spawn.mockReturnValue(makeMockChild());

    await runner.fire('session', 'onCrash', { exitCode: 1, retryCount: 2 });

    expect(mockChildProcess.spawn).toHaveBeenCalledTimes(2);
  });

  it('does not throw when a script exits with a non-zero code', async () => {
    const runner = await makeRunner(['./fail.sh'], 'onStart');
    mockChildProcess.spawn.mockReturnValue(makeMockChild(1));

    await expect(runner.fire('session', 'onStart', {})).resolves.toBeUndefined();
  });

  it('does not throw when a script emits an error event', async () => {
    const runner = await makeRunner(['./fail.sh'], 'onStart');

    const child = new EventEmitter() as childProcess.ChildProcess;
    setTimeout(() => child.emit('error', new Error('spawn EACCES')), 0);
    mockChildProcess.spawn.mockReturnValue(child);

    await expect(runner.fire('session', 'onStart', {})).resolves.toBeUndefined();
  });

  it('does not throw when spawn itself throws synchronously', async () => {
    const runner = await makeRunner(['./fail.sh'], 'onStart');
    mockChildProcess.spawn.mockImplementation(() => {
      throw new Error('spawn failed');
    });

    await expect(runner.fire('session', 'onStart', {})).resolves.toBeUndefined();
  });

  it('passes all env vars from process.env plus AGENTSPAWN_* vars', async () => {
    const runner = await makeRunner(['./script.sh'], 'onPrompt');
    mockChildProcess.spawn.mockReturnValue(makeMockChild());

    await runner.fire('session', 'onPrompt', { prompt: 'hello' });

    const call = mockChildProcess.spawn.mock.calls[0];
    const spawnEnv = (call[2] as { env: Record<string, string> }).env;

    // Should include existing process.env vars
    expect(spawnEnv).toMatchObject({
      AGENTSPAWN_SESSION: 'session',
      AGENTSPAWN_EVENT: 'onPrompt',
      AGENTSPAWN_DATA: JSON.stringify({ prompt: 'hello' }),
    });
  });

  it('does nothing when no plugins match the event', async () => {
    const runner = await makeRunner(['./setup.sh'], 'onStart');
    mockChildProcess.spawn.mockReturnValue(makeMockChild());

    await runner.fire('session', 'onStop', {});

    expect(mockChildProcess.spawn).not.toHaveBeenCalled();
  });
});
