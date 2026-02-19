import { PromptHistoryEntry } from '../types.js';

export interface ExportMetadata {
  sessionName: string;
  exportedAt: string;
  entryCount: number;
  dateRange: {
    oldest: string | null;
    newest: string | null;
  };
}

/**
 * ExportFormatter provides static methods to export prompt history
 * in multiple formats (Markdown, JSON, plain text).
 */
export class ExportFormatter {
  /**
   * Compute metadata from a list of history entries.
   *
   * @param sessionName - Name of the session being exported
   * @param entries - Array of prompt history entries (chronological or reverse)
   * @returns Metadata object with session name, export timestamp, entry count, and date range
   */
  static computeMetadata(
    sessionName: string,
    entries: PromptHistoryEntry[],
  ): ExportMetadata {
    const entryCount = entries.length;

    let oldest: string | null = null;
    let newest: string | null = null;

    if (entryCount > 0) {
      // Entries may be in any order, so we need to find min/max timestamps
      const timestamps = entries.map((e) => e.timestamp).sort();
      oldest = timestamps[0];
      newest = timestamps[timestamps.length - 1];
    }

    return {
      sessionName,
      exportedAt: new Date().toISOString(),
      entryCount,
      dateRange: { oldest, newest },
    };
  }

  /**
   * Export history entries as Markdown format.
   *
   * Format:
   * - Level 1 heading with session name
   * - Metadata section (exported timestamp, entry count, date range)
   * - Level 2 headings per prompt (indexed)
   * - Full prompt and response content preserved
   *
   * @param entries - Array of prompt history entries (should be in chronological order for export)
   * @param metadata - Metadata object (computed via computeMetadata)
   * @returns Markdown-formatted string
   */
  static toMarkdown(entries: PromptHistoryEntry[], metadata: ExportMetadata): string {
    const lines: string[] = [];

    // Header
    lines.push(`# ${metadata.sessionName}`);
    lines.push('');

    // Metadata
    lines.push(`**Exported:** ${metadata.exportedAt}`);
    lines.push(`**Entries:** ${metadata.entryCount}`);

    if (metadata.dateRange.oldest && metadata.dateRange.newest) {
      lines.push(
        `**Date Range:** ${metadata.dateRange.oldest} to ${metadata.dateRange.newest}`,
      );
    } else if (metadata.entryCount === 0) {
      lines.push(`**Date Range:** N/A (empty history)`);
    }

    lines.push('');
    lines.push('---');
    lines.push('');

    if (entries.length === 0) {
      lines.push('*No history entries found.*');
      lines.push('');
      return lines.join('\n');
    }

    // Entries (chronological order for readability)
    for (const entry of entries) {
      lines.push(`## Prompt #${entry.index}`);
      lines.push('');
      lines.push(`**Timestamp:** ${entry.timestamp}`);
      lines.push('');
      lines.push('**Prompt:**');
      lines.push('');
      lines.push('```');
      lines.push(entry.prompt);
      lines.push('```');
      lines.push('');
      lines.push('**Response:**');
      lines.push('');
      lines.push('```');
      lines.push(entry.responsePreview || '(no response)');
      lines.push('```');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Export history entries as JSON format.
   *
   * Format:
   * - Root object with `metadata` and `entries` keys
   * - 2-space indentation
   * - ISO 8601 timestamps
   * - Full content preservation
   *
   * @param entries - Array of prompt history entries
   * @param metadata - Metadata object (computed via computeMetadata)
   * @returns JSON-formatted string with 2-space indentation
   */
  static toJSON(entries: PromptHistoryEntry[], metadata: ExportMetadata): string {
    const output = {
      metadata,
      entries,
    };

    return JSON.stringify(output, null, 2);
  }

  /**
   * Export history entries as plain text format.
   *
   * Format:
   * - Session header with uppercase labels
   * - 80-character separators
   * - Entry blocks with `[#index] timestamp`, `PROMPT:`, `RESPONSE:`
   * - Grep-friendly format
   *
   * @param entries - Array of prompt history entries
   * @param metadata - Metadata object (computed via computeMetadata)
   * @returns Plain text formatted string
   */
  static toPlainText(entries: PromptHistoryEntry[], metadata: ExportMetadata): string {
    const lines: string[] = [];
    const separator = '='.repeat(80);

    // Header
    lines.push(separator);
    lines.push(`SESSION: ${metadata.sessionName}`);
    lines.push(`EXPORTED: ${metadata.exportedAt}`);
    lines.push(`ENTRIES: ${metadata.entryCount}`);

    if (metadata.dateRange.oldest && metadata.dateRange.newest) {
      lines.push(
        `DATE RANGE: ${metadata.dateRange.oldest} to ${metadata.dateRange.newest}`,
      );
    } else if (metadata.entryCount === 0) {
      lines.push(`DATE RANGE: N/A (empty history)`);
    }

    lines.push(separator);
    lines.push('');

    if (entries.length === 0) {
      lines.push('No history entries found.');
      lines.push('');
      return lines.join('\n');
    }

    // Entries
    for (const entry of entries) {
      lines.push(`[#${entry.index}] ${entry.timestamp}`);
      lines.push('');
      lines.push('PROMPT:');
      lines.push(entry.prompt);
      lines.push('');
      lines.push('RESPONSE:');
      lines.push(entry.responsePreview || '(no response)');
      lines.push('');
      lines.push('-'.repeat(80));
      lines.push('');
    }

    return lines.join('\n');
  }
}
