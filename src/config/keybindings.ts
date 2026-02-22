import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

/**
 * User-configurable keybinding settings.
 * All fields are optional — missing fields fall back to defaults.
 *
 * Binding string formats:
 *   "j"          — single printable character
 *   "ctrl+n"     — ctrl modifier + character
 *   "return"     — Enter key
 *   "escape"     — Escape key
 *   "up"         — Up arrow
 *   "down"       — Down arrow
 */
export interface KeybindingConfig {
  nextSession?: string;
  prevSession?: string;
  attachSession?: string;
  detachSession?: string;
  stopSession?: string;
  newSession?: string;
  toggleHelp?: string;
  quit?: string;
}

export const DEFAULT_KEYBINDINGS: Required<KeybindingConfig> = {
  nextSession: 'j',
  prevSession: 'k',
  attachSession: 'return',
  detachSession: 'escape',
  stopSession: 'x',
  newSession: 'n',
  toggleHelp: '?',
  quit: 'q',
};

const KEYBINDINGS_PATH = path.join(os.homedir(), '.agentspawn', 'keybindings.json');

/**
 * Load keybindings from ~/.agentspawn/keybindings.json, merging with defaults.
 * If the file does not exist or cannot be parsed, returns defaults silently.
 */
export async function loadKeybindings(): Promise<Required<KeybindingConfig>> {
  try {
    const raw = await fs.readFile(KEYBINDINGS_PATH, 'utf8');
    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed !== 'object' || parsed === null) {
      return { ...DEFAULT_KEYBINDINGS };
    }

    const user = parsed as Record<string, unknown>;
    const merged: Required<KeybindingConfig> = { ...DEFAULT_KEYBINDINGS };

    for (const key of Object.keys(DEFAULT_KEYBINDINGS) as (keyof KeybindingConfig)[]) {
      if (typeof user[key] === 'string') {
        merged[key] = user[key] as string;
      }
    }

    return merged;
  } catch {
    // File missing or unparseable — silently use defaults
    return { ...DEFAULT_KEYBINDINGS };
  }
}

/**
 * Parse a binding string into the raw key code used by the terminal/Ink.
 *
 * Supported formats:
 *   "ctrl+<char>"  — e.g. "ctrl+n" → '\x0e', "ctrl+r" → '\x12'
 *   "return"       — '\r'
 *   "escape"       — '\x1b'
 *   "up"           — '\x1b[A'
 *   "down"         — '\x1b[B'
 *   "tab"          — '\t'
 *   "<char>"       — single printable character passed through
 *
 * Returns null for unrecognised bindings.
 */
export function parseBinding(binding: string): string | null {
  const lower = binding.toLowerCase().trim();

  if (lower.startsWith('ctrl+')) {
    const char = lower.slice(5);
    if (char.length === 1 && char >= 'a' && char <= 'z') {
      // Ctrl+A = 0x01, Ctrl+B = 0x02, …
      return String.fromCharCode(char.charCodeAt(0) - 96);
    }
    return null;
  }

  switch (lower) {
    case 'return':
    case 'enter':
      return '\r';
    case 'escape':
    case 'esc':
      return '\x1b';
    case 'up':
      return '\x1b[A';
    case 'down':
      return '\x1b[B';
    case 'tab':
      return '\t';
    default:
      // Single printable character
      if (binding.length === 1) {
        return binding;
      }
      return null;
  }
}

/**
 * Test whether a raw terminal key code matches a keybinding string.
 *
 * @param rawKey   - the raw key code received from the terminal (e.g. '\r', 'j')
 * @param binding  - the binding string from KeybindingConfig (e.g. 'return', 'j')
 */
export function matchesKey(rawKey: string, binding: string): boolean {
  const parsed = parseBinding(binding);
  if (parsed === null) return false;
  return rawKey === parsed;
}
