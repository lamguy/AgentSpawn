import { BroadcastResult, PromptHistoryEntry, SessionInfo, SessionState, TemplateEntry, WorkspaceEntry } from '../types.js';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const GRAY = '\x1b[90m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

export function colorForState(state: SessionState): string {
  switch (state) {
    case SessionState.Running:
      return GREEN;
    case SessionState.Crashed:
      return RED;
    case SessionState.Stopped:
      return GRAY;
  }
}

export function formatSessionOutput(sessionName: string, line: string): string {
  return `[${sessionName}] ${line}`;
}

export function formatStatusLine(info: SessionInfo): string {
  const coloredState = `${colorForState(info.state)}[${info.state}]${RESET}`;
  const sandboxBadge = info.sandboxed && info.sandboxBackend
    ? ` ${BOLD}[sandbox: ${info.sandboxBackend}${info.sandboxLevel && info.sandboxLevel !== 'permissive' ? '/' + info.sandboxLevel : ''}]${RESET}`
    : '';
  return `${info.name} ${coloredState} ${info.workingDirectory} (pid: ${info.pid})${sandboxBadge}`;
}

export function formatSessionTable(sessions: SessionInfo[]): string {
  if (sessions.length === 0) {
    return 'No sessions.';
  }

  const headers = ['NAME', 'STATE', 'PID', 'DIRECTORY', 'STARTED'];

  const rows = sessions.map((s) => {
    const started = s.startedAt ? s.startedAt.toLocaleString() : '--';
    return [s.name, s.state, String(s.pid), s.workingDirectory, started];
  });

  const colWidths = headers.map((h, i) => {
    const maxRow = rows.reduce((max, row) => Math.max(max, row[i].length), 0);
    return Math.max(h.length, maxRow);
  });

  const pad = (str: string, width: number) => str.padEnd(width);

  const headerLine = headers.map((h, i) => `${BOLD}${pad(h, colWidths[i])}${RESET}`).join('  ');

  const bodyLines = rows.map((row) => {
    return row
      .map((cell, i) => {
        if (i === 1) {
          const color = colorForState(cell as SessionState);
          return `${color}${pad(cell, colWidths[i])}${RESET}`;
        }
        return pad(cell, colWidths[i]);
      })
      .join('  ');
  });

  return [headerLine, ...bodyLines].join('\n');
}

export function formatSessionsSummary(sessionNames: string[]): string {
  const count = sessionNames.length;
  if (count === 0) return '0';
  const preview = sessionNames.slice(0, 3).join(', ');
  if (count <= 3) return `${count} (${preview})`;
  return `${count} (${preview}, ...)`;
}

export function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

export function formatWorkspaceTable(workspaces: WorkspaceEntry[]): string {
  if (workspaces.length === 0) {
    return 'No workspaces.';
  }

  const headers = ['NAME', 'SESSIONS', 'CREATED'];

  const rows = workspaces.map((w) => {
    return [
      w.name,
      formatSessionsSummary(w.sessionNames),
      formatRelativeDate(w.createdAt),
    ];
  });

  const colWidths = headers.map((h, i) => {
    const maxRow = rows.reduce((max, row) => Math.max(max, row[i].length), 0);
    return Math.max(h.length, maxRow);
  });

  const pad = (str: string, width: number) => str.padEnd(width);

  const headerLine = headers.map((h, i) => `${BOLD}${pad(h, colWidths[i])}${RESET}`).join('  ');

  const bodyLines = rows.map((row) => {
    return row.map((cell, i) => pad(cell, colWidths[i])).join('  ');
  });

  return [headerLine, ...bodyLines].join('\n');
}

export function formatTemplateTable(templates: TemplateEntry[]): string {
  if (templates.length === 0) {
    return 'No templates.';
  }

  const headers = ['NAME', 'DIRECTORY', 'PERMISSION MODE', 'CREATED'];

  const rows = templates.map((t) => {
    return [
      t.name,
      t.workingDirectory ?? '--',
      t.permissionMode ?? '--',
      formatRelativeDate(t.createdAt),
    ];
  });

  const colWidths = headers.map((h, i) => {
    const maxRow = rows.reduce((max, row) => Math.max(max, row[i].length), 0);
    return Math.max(h.length, maxRow);
  });

  const pad = (str: string, width: number) => str.padEnd(width);

  const headerLine = headers.map((h, i) => `${BOLD}${pad(h, colWidths[i])}${RESET}`).join('  ');

  const bodyLines = rows.map((row) => {
    return row.map((cell, i) => pad(cell, colWidths[i])).join('  ');
  });

  return [headerLine, ...bodyLines].join('\n');
}

export interface HistoryTableEntry extends PromptHistoryEntry {
  sessionName?: string;
}

export function formatHistoryTable(entries: HistoryTableEntry[]): string {
  if (entries.length === 0) {
    return 'No history entries.';
  }

  const maxPromptWidth = Math.min(process.stdout.columns || 80, 80) - 30;

  const lines: string[] = [];
  for (const entry of entries) {
    const time = formatRelativeDate(entry.timestamp);
    const promptText =
      entry.prompt.length > maxPromptWidth
        ? entry.prompt.slice(0, maxPromptWidth - 3) + '...'
        : entry.prompt;
    const prefix = entry.sessionName
      ? `  ${GRAY}[${entry.sessionName}]${RESET} #${entry.index}`
      : `  #${entry.index}`;
    const responseLine = entry.responsePreview
      ? `${GRAY}${entry.responsePreview.slice(0, maxPromptWidth)}${RESET}`
      : '';

    lines.push(`${prefix}  ${GRAY}${time}${RESET}   "${promptText}"`);
    if (responseLine) {
      const indent = entry.sessionName ? '                  ' : '              ';
      lines.push(`${indent}Response: ${responseLine}`);
    }
  }

  return lines.join('\n');
}

export function formatBroadcastResults(results: BroadcastResult[]): string {
  const lines: string[] = [];
  let succeeded = 0;
  let failed = 0;

  for (const result of results) {
    if (result.status === 'fulfilled') {
      succeeded++;
      const preview = result.response
        ? result.response.length > 200
          ? result.response.slice(0, 200) + '...'
          : result.response
        : '';
      lines.push(`${GREEN}[${result.sessionName}] OK:${RESET} ${preview}`);
    } else {
      failed++;
      lines.push(`${RED}[${result.sessionName}] FAILED: ${result.error ?? 'Unknown error'}${RESET}`);
    }
  }

  lines.push('');
  lines.push(`Broadcast complete: ${succeeded} succeeded, ${failed} failed`);

  return lines.join('\n');
}
