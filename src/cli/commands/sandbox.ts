import { Command } from 'commander';
import { mkdir, rm, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { SessionManager } from '../../core/manager.js';
import { SandboxManager } from '../../core/sandbox.js';
import type { SandboxBackend, SandboxLevel } from '../../types.js';

const execFileAsync = promisify(execFile);

export function registerSandboxCommand(program: Command, manager: SessionManager): void {
  const sandbox = program
    .command('sandbox')
    .description('Manage and inspect session sandboxes');

  // agentspawn sandbox test [--backend <backend>] [--level <level>]
  sandbox
    .command('test')
    .description('Verify sandbox isolation is working correctly')
    .option('-b, --backend <backend>', 'Backend to test: docker, bwrap, sandbox-exec (auto-detects if omitted)')
    .option('-l, --level <level>', 'Isolation level to test: permissive, standard, strict', 'permissive')
    .action(async (options: { backend?: string; level: string }) => {
      const level = options.level as SandboxLevel;
      if (!['permissive', 'standard', 'strict'].includes(level)) {
        console.error('Error: --level must be permissive, standard, or strict');
        process.exitCode = 1;
        return;
      }

      let backend: SandboxBackend | null;
      if (options.backend) {
        if (!['docker', 'bwrap', 'sandbox-exec'].includes(options.backend)) {
          console.error('Error: --backend must be docker, bwrap, or sandbox-exec');
          process.exitCode = 1;
          return;
        }
        backend = options.backend as SandboxBackend;
      } else {
        backend = await SandboxManager.detectBackend();
        if (!backend) {
          console.error('Error: No sandbox backend available. Install Docker or bubblewrap.');
          process.exitCode = 1;
          return;
        }
        console.log(`Auto-detected backend: ${backend}`);
      }

      console.log(`Testing ${backend} sandbox at level "${level}"...`);

      const testWorkdir = path.join(os.tmpdir(), `agentspawn-sandbox-test-${Date.now()}`);
      await mkdir(testWorkdir, { recursive: true });

      const sbManager = new SandboxManager('__sandbox-test__', testWorkdir, backend, { level });

      try {
        await sbManager.start();
        const result = await sbManager.runIsolationTest();
        await sbManager.stop();

        console.log('');
        console.log(`Write inside workdir:   ${result.writeInsideWorkdir ? 'PASS' : 'FAIL'}`);
        console.log(`Write outside workdir:  ${!result.writeOutsideWorkdir ? 'PASS (blocked)' : 'FAIL (not blocked)'}`);
        if (result.readCredentialDir !== null) {
          console.log(`Read credential dirs:   ${!result.readCredentialDir ? 'PASS (blocked)' : 'FAIL (not blocked)'}`);
        }
        console.log('');
        console.log(result.passed ? 'Sandbox isolation verified.' : 'Sandbox isolation test FAILED.');
        if (!result.passed) process.exitCode = 1;
      } catch (e) {
        await sbManager.stop().catch(() => {});
        console.error(`Error: Sandbox test failed: ${(e as Error).message}`);
        process.exitCode = 1;
      } finally {
        await rm(testWorkdir, { recursive: true, force: true });
      }
    });

  // agentspawn sandbox diff <session>
  sandbox
    .command('diff <session>')
    .description('Show files changed in a session sandbox since it started')
    .action(async (sessionName: string) => {
      const info = manager.getSessionInfo(sessionName);
      if (!info) {
        console.error(`Error: Session not found: ${sessionName}`);
        process.exitCode = 1;
        return;
      }
      if (!info.sandboxed || !info.sandboxBackend) {
        console.error(`Error: Session "${sessionName}" is not sandboxed`);
        process.exitCode = 1;
        return;
      }

      // For Docker: use docker diff via the running container name
      // For bwrap/sandbox-exec: find files modified after session start in workdir
      if (info.sandboxBackend === 'docker') {
        try {
          const { stdout } = await execFileAsync('docker', ['diff', `agentspawn-${sessionName}`]);
          const lines = stdout.trim().split('\n').filter(Boolean);
          if (lines.length === 0) {
            console.log('No filesystem changes.');
          } else {
            console.log(lines.join('\n'));
          }
        } catch (e) {
          console.error(`Error: Could not get diff: ${(e as Error).message}`);
          process.exitCode = 1;
        }
      } else {
        // bwrap / sandbox-exec: find files modified after session start
        if (!info.startedAt) {
          console.error('Error: Session start time not available');
          process.exitCode = 1;
          return;
        }
        const startTime = info.startedAt.getTime();
        try {
          const lines = await findModifiedFiles(info.workingDirectory, startTime);
          if (lines.length === 0) {
            console.log('No filesystem changes detected.');
          } else {
            console.log(lines.join('\n'));
          }
        } catch (e) {
          console.error(`Error: Could not scan workdir: ${(e as Error).message}`);
          process.exitCode = 1;
        }
      }
    });
}

async function findModifiedFiles(dir: string, sinceMs: number): Promise<string[]> {
  const results: string[] = [];

  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        const s = await stat(full);
        if (s.mtimeMs > sinceMs) {
          results.push(`M ${full}`);
        }
      }
    }
  }

  await walk(dir);
  return results;
}
