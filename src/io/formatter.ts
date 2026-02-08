import { SessionInfo, SessionState, WorkspaceEntry } from '../types.js';

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
  return `${info.name} ${coloredState} ${info.workingDirectory} (pid: ${info.pid})`;
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
