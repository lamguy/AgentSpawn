import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  formatSessionOutput,
  formatStatusLine,
  colorForState,
  formatSessionTable,
  formatWorkspaceTable,
  formatSessionsSummary,
  formatRelativeDate,
  formatTemplateTable,
} from './formatter.js';
import { SessionState, WorkspaceEntry, TemplateEntry } from '../types.js';

describe('Formatter', () => {
  it('formatSessionOutput prefixes with session name', () => {
    const result = formatSessionOutput('agent-1', 'hello world');
    expect(result).toBe('[agent-1] hello world');
  });

  it('formatStatusLine returns formatted string with ANSI codes', () => {
    const result = formatStatusLine({
      name: 'agent-1',
      pid: 1234,
      state: SessionState.Running,
      startedAt: new Date(),
      workingDirectory: '/tmp/work',
      promptCount: 0,
    });
    expect(result).toContain('agent-1');
    expect(result).toContain('running');
    expect(result).toContain('/tmp/work');
    expect(result).toContain('1234');
  });

  it('colorForState returns GREEN for Running', () => {
    expect(colorForState(SessionState.Running)).toBe('\x1b[32m');
  });

  it('colorForState returns RED for Crashed', () => {
    expect(colorForState(SessionState.Crashed)).toBe('\x1b[31m');
  });

  it('colorForState returns GRAY for Stopped', () => {
    expect(colorForState(SessionState.Stopped)).toBe('\x1b[90m');
  });

  it('formatSessionTable returns "No sessions." for empty array', () => {
    expect(formatSessionTable([])).toBe('No sessions.');
  });

  it('formatSessionTable returns table containing both session names and states', () => {
    const sessions = [
      {
        name: 'agent-1',
        pid: 1234,
        state: SessionState.Running,
        startedAt: new Date('2025-01-01T00:00:00Z'),
        workingDirectory: '/tmp/a',
        promptCount: 0,
      },
      {
        name: 'agent-2',
        pid: 5678,
        state: SessionState.Crashed,
        startedAt: null,
        workingDirectory: '/tmp/b',
        promptCount: 0,
      },
    ];
    const result = formatSessionTable(sessions);
    expect(result).toContain('agent-1');
    expect(result).toContain('agent-2');
    expect(result).toContain('running');
    expect(result).toContain('crashed');
    expect(result).toContain('--');
  });
});

describe('formatWorkspaceTable', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return "No workspaces." for empty array', () => {
    expect(formatWorkspaceTable([])).toBe('No workspaces.');
  });

  it('should render correct columns (NAME, SESSIONS, CREATED)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));

    const workspaces: WorkspaceEntry[] = [
      {
        name: 'project-a',
        sessionNames: ['s1', 's2'],
        createdAt: '2025-06-15T11:55:00Z',
      },
    ];

    const result = formatWorkspaceTable(workspaces);
    expect(result).toContain('NAME');
    expect(result).toContain('SESSIONS');
    expect(result).toContain('CREATED');
    expect(result).toContain('project-a');
    expect(result).toContain('2 (s1, s2)');
    expect(result).toContain('5m ago');
  });

  it('should render multiple workspaces as rows', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));

    const workspaces: WorkspaceEntry[] = [
      {
        name: 'alpha',
        sessionNames: [],
        createdAt: '2025-06-15T12:00:00Z',
      },
      {
        name: 'beta',
        sessionNames: ['x'],
        createdAt: '2025-06-15T10:00:00Z',
      },
    ];

    const result = formatWorkspaceTable(workspaces);
    expect(result).toContain('alpha');
    expect(result).toContain('beta');
    expect(result).toContain('0');
    expect(result).toContain('1 (x)');
  });
});

describe('formatSessionsSummary', () => {
  it('should return "0" for empty array', () => {
    expect(formatSessionsSummary([])).toBe('0');
  });

  it('should show count and all names for 1-3 sessions', () => {
    expect(formatSessionsSummary(['a'])).toBe('1 (a)');
    expect(formatSessionsSummary(['a', 'b'])).toBe('2 (a, b)');
    expect(formatSessionsSummary(['a', 'b', 'c'])).toBe('3 (a, b, c)');
  });

  it('should truncate with "..." for 4+ sessions', () => {
    const result = formatSessionsSummary(['a', 'b', 'c', 'd']);
    expect(result).toBe('4 (a, b, c, ...)');
  });

  it('should truncate with "..." for many sessions', () => {
    const result = formatSessionsSummary(['s1', 's2', 's3', 's4', 's5', 's6']);
    expect(result).toBe('6 (s1, s2, s3, ...)');
  });
});

describe('formatTemplateTable', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return "No templates." for empty array', () => {
    expect(formatTemplateTable([])).toBe('No templates.');
  });

  it('should render correct columns (NAME, DIRECTORY, PERMISSION MODE, CREATED)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));

    const templates: TemplateEntry[] = [
      {
        name: 'backend',
        workingDirectory: '/projects/backend',
        permissionMode: 'bypassPermissions',
        createdAt: '2025-06-15T11:55:00Z',
      },
    ];

    const result = formatTemplateTable(templates);
    expect(result).toContain('NAME');
    expect(result).toContain('DIRECTORY');
    expect(result).toContain('PERMISSION MODE');
    expect(result).toContain('CREATED');
    expect(result).toContain('backend');
    expect(result).toContain('/projects/backend');
    expect(result).toContain('bypassPermissions');
    expect(result).toContain('5m ago');
  });

  it('should display "--" for undefined workingDirectory and permissionMode', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));

    const templates: TemplateEntry[] = [
      {
        name: 'minimal',
        createdAt: '2025-06-15T12:00:00Z',
      },
    ];

    const result = formatTemplateTable(templates);
    expect(result).toContain('minimal');
    // The "--" placeholders should appear for missing directory and permission mode
    const lines = result.split('\n');
    // The data row (second line) should contain "--" twice
    const dataLine = lines[1];
    const dashMatches = dataLine.match(/--/g);
    expect(dashMatches).not.toBeNull();
    expect(dashMatches!.length).toBeGreaterThanOrEqual(2);
  });

  it('should render multiple templates as rows', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));

    const templates: TemplateEntry[] = [
      {
        name: 'alpha',
        workingDirectory: '/alpha',
        createdAt: '2025-06-15T12:00:00Z',
      },
      {
        name: 'beta',
        permissionMode: 'default',
        createdAt: '2025-06-15T10:00:00Z',
      },
    ];

    const result = formatTemplateTable(templates);
    expect(result).toContain('alpha');
    expect(result).toContain('beta');
    expect(result).toContain('/alpha');
    expect(result).toContain('default');
    // Should have header + 2 data rows = 3 lines
    const lines = result.split('\n');
    expect(lines).toHaveLength(3);
  });
});

describe('formatRelativeDate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return "just now" for dates less than 60 seconds ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:30Z'));

    expect(formatRelativeDate('2025-06-15T12:00:00Z')).toBe('just now');
  });

  it('should return "Xm ago" for dates minutes ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:05:00Z'));

    expect(formatRelativeDate('2025-06-15T12:00:00Z')).toBe('5m ago');
  });

  it('should return "Xh ago" for dates hours ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T15:00:00Z'));

    expect(formatRelativeDate('2025-06-15T12:00:00Z')).toBe('3h ago');
  });

  it('should return "Xd ago" for dates days ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-20T12:00:00Z'));

    expect(formatRelativeDate('2025-06-15T12:00:00Z')).toBe('5d ago');
  });

  it('should return locale date string for dates 30+ days ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-08-15T12:00:00Z'));

    const result = formatRelativeDate('2025-06-15T12:00:00Z');
    // Should be a locale date string, not "Xd ago"
    expect(result).not.toContain('d ago');
    expect(result).not.toContain('just now');
  });
});
