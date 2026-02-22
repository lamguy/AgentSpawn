import { describe, it, expect, vi, beforeEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';

// ── Stable fs mock (vi.hoisted so it's available before vi.mock is evaluated) ─

const fsMock = vi.hoisted(() => ({ readFile: vi.fn<[string, string], Promise<string>>() }));

vi.mock('node:fs/promises', () => ({ default: fsMock }));

import { loadKeybindings, matchesKey, parseBinding, DEFAULT_KEYBINDINGS } from './keybindings.js';

// ── loadKeybindings ───────────────────────────────────────────────────────────

describe('loadKeybindings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns defaults when keybindings.json does not exist', async () => {
    fsMock.readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const result = await loadKeybindings();
    expect(result).toEqual(DEFAULT_KEYBINDINGS);
  });

  it('returns defaults when keybindings.json contains invalid JSON', async () => {
    fsMock.readFile.mockResolvedValue('not valid json {{{');
    const result = await loadKeybindings();
    expect(result).toEqual(DEFAULT_KEYBINDINGS);
  });

  it('returns defaults when keybindings.json contains a non-object (null)', async () => {
    fsMock.readFile.mockResolvedValue('null');
    const result = await loadKeybindings();
    expect(result).toEqual(DEFAULT_KEYBINDINGS);
  });

  it('merges user config over defaults for known keys', async () => {
    const userConfig = { nextSession: 'down', prevSession: 'up', quit: 'ctrl+q' };
    fsMock.readFile.mockResolvedValue(JSON.stringify(userConfig));
    const result = await loadKeybindings();
    expect(result.nextSession).toBe('down');
    expect(result.prevSession).toBe('up');
    expect(result.quit).toBe('ctrl+q');
    // Unspecified keys fall back to defaults
    expect(result.attachSession).toBe(DEFAULT_KEYBINDINGS.attachSession);
    expect(result.toggleHelp).toBe(DEFAULT_KEYBINDINGS.toggleHelp);
  });

  it('ignores unknown keys in user config', async () => {
    const userConfig = { unknownKey: 'something', nextSession: 'g' };
    fsMock.readFile.mockResolvedValue(JSON.stringify(userConfig));
    const result = await loadKeybindings();
    expect(result.nextSession).toBe('g');
    expect((result as Record<string, unknown>)['unknownKey']).toBeUndefined();
  });

  it('ignores non-string values in user config', async () => {
    const userConfig = { nextSession: 42, quit: true };
    fsMock.readFile.mockResolvedValue(JSON.stringify(userConfig));
    const result = await loadKeybindings();
    expect(result.nextSession).toBe(DEFAULT_KEYBINDINGS.nextSession);
    expect(result.quit).toBe(DEFAULT_KEYBINDINGS.quit);
  });

  it('reads from ~/.agentspawn/keybindings.json', async () => {
    const expectedPath = path.join(os.homedir(), '.agentspawn', 'keybindings.json');
    fsMock.readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    await loadKeybindings();
    expect(fsMock.readFile).toHaveBeenCalledWith(expectedPath, 'utf8');
  });
});

// ── parseBinding ──────────────────────────────────────────────────────────────

describe('parseBinding', () => {
  it('parses "return" to carriage return', () => {
    expect(parseBinding('return')).toBe('\r');
  });

  it('parses "enter" to carriage return', () => {
    expect(parseBinding('enter')).toBe('\r');
  });

  it('parses "escape" to escape byte', () => {
    expect(parseBinding('escape')).toBe('\x1b');
  });

  it('parses "esc" to escape byte', () => {
    expect(parseBinding('esc')).toBe('\x1b');
  });

  it('parses "up" to ANSI up arrow sequence', () => {
    expect(parseBinding('up')).toBe('\x1b[A');
  });

  it('parses "down" to ANSI down arrow sequence', () => {
    expect(parseBinding('down')).toBe('\x1b[B');
  });

  it('parses "tab" to tab character', () => {
    expect(parseBinding('tab')).toBe('\t');
  });

  it('parses "ctrl+n" to the correct control code', () => {
    expect(parseBinding('ctrl+n')).toBe('\x0e');
  });

  it('parses "ctrl+r" to the correct control code', () => {
    expect(parseBinding('ctrl+r')).toBe('\x12');
  });

  it('parses "ctrl+a" to the correct control code', () => {
    expect(parseBinding('ctrl+a')).toBe('\x01');
  });

  it('parses "ctrl+c" to the correct control code', () => {
    expect(parseBinding('ctrl+c')).toBe('\x03');
  });

  it('is case-insensitive for ctrl+letter', () => {
    expect(parseBinding('CTRL+N')).toBe('\x0e');
    expect(parseBinding('Ctrl+R')).toBe('\x12');
  });

  it('passes through a single printable character', () => {
    expect(parseBinding('j')).toBe('j');
    expect(parseBinding('k')).toBe('k');
    expect(parseBinding('?')).toBe('?');
    expect(parseBinding('q')).toBe('q');
  });

  it('returns null for multi-character strings that are not keywords', () => {
    expect(parseBinding('jk')).toBeNull();
    expect(parseBinding('ctrl+')).toBeNull();
  });

  it('returns null for ctrl+non-alpha', () => {
    expect(parseBinding('ctrl+1')).toBeNull();
    expect(parseBinding('ctrl+!')).toBeNull();
  });
});

// ── matchesKey ────────────────────────────────────────────────────────────────

describe('matchesKey', () => {
  it('matches "j" raw key against "j" binding', () => {
    expect(matchesKey('j', 'j')).toBe(true);
  });

  it('does not match "j" against "k"', () => {
    expect(matchesKey('j', 'k')).toBe(false);
  });

  it('matches carriage return against "return"', () => {
    expect(matchesKey('\r', 'return')).toBe(true);
  });

  it('matches carriage return against "enter"', () => {
    expect(matchesKey('\r', 'enter')).toBe(true);
  });

  it('matches escape byte against "escape"', () => {
    expect(matchesKey('\x1b', 'escape')).toBe(true);
  });

  it('matches ctrl+n raw code against "ctrl+n"', () => {
    expect(matchesKey('\x0e', 'ctrl+n')).toBe(true);
  });

  it('does not match ctrl+n against "n"', () => {
    expect(matchesKey('\x0e', 'n')).toBe(false);
  });

  it('returns false for unrecognised binding', () => {
    expect(matchesKey('j', 'ctrl+1')).toBe(false);
    expect(matchesKey('\x0e', 'jk')).toBe(false);
  });

  it('matches "?" against "?" binding', () => {
    expect(matchesKey('?', '?')).toBe(true);
  });

  it('does not match "?" against "escape"', () => {
    expect(matchesKey('?', 'escape')).toBe(false);
  });
});
