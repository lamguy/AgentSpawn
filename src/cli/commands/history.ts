import { Command } from 'commander';
import { SessionManager } from '../../core/manager.js';
import { HistoryStore } from '../../core/history.js';
import { SessionState } from '../../types.js';
import { formatHistoryTable } from '../../io/formatter.js';
import {
  HistoryNotFoundError,
  HistoryEntryNotFoundError,
} from '../../utils/errors.js';

export function registerHistoryCommand(
  program: Command,
  manager: SessionManager,
  historyStore: HistoryStore,
): void {
  program
    .command('history [session]')
    .description('Show prompt history for a session or search across sessions')
    .option('-l, --limit <n>', 'Maximum entries to show', '20')
    .option('-s, --search <query>', 'Search prompts by keyword')
    .action(
      async (
        session: string | undefined,
        opts: { limit: string; search?: string },
      ) => {
        const limit = parseInt(opts.limit, 10);
        if (isNaN(limit) || limit <= 0) {
          console.error('Error: --limit must be a positive integer.');
          process.exitCode = 1;
          return;
        }

        try {
          if (session && !opts.search) {
            // List history for a specific session
            const allEntries = await historyStore.getBySession(session);
            const total = allEntries.length;
            if (total === 0) {
              console.log(`No history found for session "${session}".`);
              return;
            }
            const entries = allEntries.slice(0, limit);
            console.log(
              `HISTORY: ${session} (showing ${entries.length} of ${total} entries)\n`,
            );
            console.log(formatHistoryTable(entries));
          } else if (opts.search) {
            // Search within a session or across all sessions
            const results = await historyStore.search(opts.search, {
              sessionName: session,
              limit,
            });
            if (results.length === 0) {
              console.log(`No results found for "${opts.search}".`);
              return;
            }
            const scope = session
              ? `session "${session}"`
              : 'all sessions';
            console.log(
              `SEARCH: "${opts.search}" in ${scope} (${results.length} results)\n`,
            );
            const showSession = !session;
            console.log(
              formatHistoryTable(
                results.map((r) => ({
                  index: r.index,
                  prompt: r.prompt,
                  responsePreview: r.responsePreview,
                  timestamp: r.timestamp,
                  sessionName: showSession ? r.sessionName : undefined,
                })),
              ),
            );
          } else {
            console.error(
              'Error: Please specify a session name or use --search <query>.',
            );
            process.exitCode = 1;
          }
        } catch (err) {
          if (err instanceof HistoryNotFoundError) {
            console.error(`Error: ${err.message}`);
            process.exitCode = 1;
            return;
          }
          throw err;
        }
      },
    );

  program
    .command('replay <session> <index>')
    .description('Replay a prompt from history in a running session')
    .action(async (session: string, indexStr: string) => {
      const index = parseInt(indexStr, 10);
      if (isNaN(index) || index < 0) {
        console.error('Error: Index must be a non-negative integer.');
        process.exitCode = 1;
        return;
      }

      try {
        const entries = await historyStore.getBySession(session);
        const entry = entries.find((e) => e.index === index);
        if (!entry) {
          throw new HistoryEntryNotFoundError(session, index);
        }

        const sessionObj = manager.getSession(session);
        if (!sessionObj) {
          console.error(`Error: Session '${session}' not found.`);
          process.exitCode = 1;
          return;
        }
        if (sessionObj.getState() !== SessionState.Running) {
          console.error(`Error: Session '${session}' is not running.`);
          process.exitCode = 1;
          return;
        }

        console.log(`Replaying prompt #${index}: "${entry.prompt}"`);
        const response = await sessionObj.sendPrompt(entry.prompt);
        console.log(response);
      } catch (err) {
        if (
          err instanceof HistoryNotFoundError ||
          err instanceof HistoryEntryNotFoundError
        ) {
          console.error(`Error: ${err.message}`);
          process.exitCode = 1;
          return;
        }
        console.error(
          `Error: ${err instanceof Error ? err.message : err}`,
        );
        process.exitCode = 1;
      }
    });
}
