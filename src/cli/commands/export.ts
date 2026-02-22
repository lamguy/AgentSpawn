import { Command } from 'commander';
import { HistoryStore } from '../../core/history.js';
import { ExportFormatter } from '../../core/export.js';
import fs from 'node:fs/promises';
import path from 'node:path';

type ExportFormat = 'markdown' | 'json' | 'text';

export function registerExportCommand(
  program: Command,
  historyStore: HistoryStore,
): void {
  program
    .command('export <session>')
    .description('Export session history to a file')
    .option('-f, --format <type>', 'export format (markdown, json, text)', 'markdown')
    .option('-o, --output <path>', 'output file path (default: <session>-history.<ext>)')
    .addHelpText(
      'after',
      `
Examples:
  $ agentspawn export my-session
  $ agentspawn export my-session --format json
  $ agentspawn export my-session --format text --output ./logs/session.txt

Export Formats:
  markdown  Human-readable with headers and code blocks (default)
  json      Machine-readable structured format
  text      Grep-friendly plain text with separators

Use Cases:
  - Audit trails for compliance and review
  - Documentation and knowledge sharing
  - Integration with analysis tools
  - Debugging and offline analysis`,
    )
    .action(
      async (
        session: string,
        opts: { format: string; output?: string },
      ) => {
        // Validate format
        const format = opts.format.toLowerCase();
        if (!['markdown', 'json', 'text'].includes(format)) {
          console.error(
            `Error: Invalid format "${opts.format}". Must be one of: markdown, json, text.`,
          );
          process.exitCode = 1;
          return;
        }

        try {
          // Fetch history entries
          const entries = await historyStore.getBySession(session);

          if (entries.length === 0) {
            console.error(`Error: No history found for session "${session}".`);
            process.exitCode = 1;
            return;
          }

          // Reverse to chronological order (getBySession returns reverse chronological)
          const chronologicalEntries = [...entries].reverse();

          // Compute metadata for export
          const metadata = ExportFormatter.computeMetadata(session, chronologicalEntries);

          // Generate output based on format
          let content: string;
          let extension: string;

          switch (format as ExportFormat) {
            case 'markdown':
              content = ExportFormatter.toMarkdown(chronologicalEntries, metadata);
              extension = 'md';
              break;
            case 'json':
              content = ExportFormatter.toJSON(chronologicalEntries, metadata);
              extension = 'json';
              break;
            case 'text':
              content = ExportFormatter.toPlainText(chronologicalEntries, metadata);
              extension = 'txt';
              break;
          }

          // Determine output path
          const outputPath = opts.output || `${session}-history.${extension}`;
          const absolutePath = path.resolve(outputPath);

          // Write to file
          await fs.writeFile(absolutePath, content, 'utf-8');

          console.log(
            `Exported ${entries.length} history entries for session "${session}" to ${absolutePath}`,
          );
        } catch (err) {
          console.error(
            `Error: Failed to export history: ${err instanceof Error ? err.message : err}`,
          );
          process.exitCode = 1;
        }
      },
    );
}
