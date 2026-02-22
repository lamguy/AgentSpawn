import { Command } from 'commander';
import { SessionManager } from '../../core/manager.js';
import { Router } from '../../io/router.js';
import { WorkspaceManager } from '../../core/workspace.js';
import { HistoryStore } from '../../core/history.js';
import { SessionState } from '../../types.js';
import { formatBroadcastResults } from '../../io/formatter.js';

const SESSION_REF_MAX_CHARS = 4000;

/**
 * Resolve @session-name references in a prompt string.
 * Each @word token is replaced with the latest response preview for that session.
 * If the session has no history, the reference is left as-is and a warning is printed.
 */
export async function resolveSessionRefs(
  prompt: string,
  historyStore: HistoryStore,
): Promise<string> {
  const pattern = /@([\w-]+)/g;
  const matches = [...prompt.matchAll(pattern)];

  if (matches.length === 0) {
    return prompt;
  }

  let resolved = prompt;

  for (const match of matches) {
    const sessionName = match[1];
    const entries = await historyStore.getBySession(sessionName, 1);

    if (entries.length === 0) {
      console.warn(`Warning: No history found for session '@${sessionName}', leaving reference as-is.`);
      continue;
    }

    const latestResponse = entries[0].responsePreview;
    const truncated = latestResponse.length > SESSION_REF_MAX_CHARS
      ? latestResponse.slice(0, SESSION_REF_MAX_CHARS) + '...[truncated]'
      : latestResponse;

    resolved = resolved.replace(match[0], truncated);
  }

  return resolved;
}

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    // If stdin is a TTY (interactive terminal), there's nothing to pipe
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });
}

export function registerExecCommand(
  program: Command,
  manager: SessionManager,
  _router: Router,
  workspaceManager: WorkspaceManager,
  historyStore?: HistoryStore,
): void {
  program
    .command('exec [name] [command]')
    .description('Execute a command in an agent session (or broadcast to multiple)')
    .option('--all', 'Broadcast to all running sessions')
    .option('--group <name>', 'Broadcast to all sessions in a workspace')
    .option('--pipe', 'Read prompt from stdin when no command argument is provided')
    .option('--format <format>', 'Output format: text (default) or ndjson', 'text')
    .action(async (nameOrCommand: string, commandOrUndefined: string | undefined, opts: { all?: boolean; group?: string; pipe?: boolean; format?: string }) => {
      if (opts.all && opts.group) {
        console.error('Error: --all and --group are mutually exclusive.');
        process.exitCode = 1;
        return;
      }

      // When --all or --group is used, the first positional arg is the command
      // (since <name> is optional in that case)
      if (opts.all || opts.group) {
        const prompt = commandOrUndefined ? `${nameOrCommand} ${commandOrUndefined}` : nameOrCommand;
        let sessionNames: string[];

        if (opts.all) {
          const running = manager.listSessions().filter((s) => s.state === SessionState.Running);
          sessionNames = running.map((s) => s.name);
        } else {
          let workspaceSessionNames: string[];
          try {
            workspaceSessionNames = await workspaceManager.getSessionNames(opts.group!);
          } catch (err) {
            console.error(`Error: ${err instanceof Error ? err.message : err}`);
            process.exitCode = 1;
            return;
          }
          const runningSessions = manager.listSessions().filter((s) => s.state === SessionState.Running);
          const runningNames = new Set(runningSessions.map((s) => s.name));
          sessionNames = workspaceSessionNames.filter((n) => runningNames.has(n));
        }

        if (sessionNames.length === 0) {
          console.error(opts.all ? 'Error: No running sessions found.' : `Error: No running sessions in workspace '${opts.group}'.`);
          process.exitCode = 1;
          return;
        }

        try {
          const results = await manager.broadcastPrompt(sessionNames, prompt);
          console.log(formatBroadcastResults(results));
          const failed = results.filter((r) => r.status === 'rejected');
          if (failed.length > 0) {
            process.exitCode = 1;
          }
        } catch (err) {
          console.error(`Error: ${err instanceof Error ? err.message : err}`);
          process.exitCode = 1;
        }
        return;
      }

      // Standard single-session exec
      const name = nameOrCommand;
      let command = commandOrUndefined;

      // If --pipe is set and no command arg provided, read from stdin
      if (opts.pipe && !command) {
        command = await readStdin();
        command = command.trim();
      }

      if (!command) {
        console.error('Error: Missing required argument <command>.');
        process.exitCode = 1;
        return;
      }

      const session = manager.getSession(name);
      if (!session) {
        console.error(`Error: Session '${name}' not found.`);
        process.exitCode = 1;
        return;
      }
      if (session.getState() !== SessionState.Running) {
        console.error(`Error: Session '${name}' is not running.`);
        process.exitCode = 1;
        return;
      }

      // Resolve @session-name references before sending
      if (historyStore) {
        command = await resolveSessionRefs(command, historyStore);
      }

      const useNdjson = opts.format === 'ndjson';

      try {
        if (useNdjson) {
          // Stream chunks as NDJSON and emit a final done event
          session.on('data', (chunk: string) => {
            process.stdout.write(JSON.stringify({ type: 'chunk', text: chunk }) + '\n');
          });
          const response = await session.sendPrompt(command);
          process.stdout.write(JSON.stringify({ type: 'done', response, sessionName: name }) + '\n');
        } else {
          console.log(`Sending to [${name}]: ${command}`);
          const response = await session.sendPrompt(command);
          console.log(response);
        }
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exitCode = 1;
      }
    });
}
