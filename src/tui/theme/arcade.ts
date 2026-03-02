/**
 * Arcade Theme Constants
 * Retro 1980s arcade cabinet aesthetic for the AgentSpawn TUI.
 */

// ── Colors ──────────────────────────────────────────────────────────
export const ARCADE_COLORS = {
  neonCyan:       '#89B4FA',
  electricPurple: '#B4BEFE',
  hotPink:        '#CBA6F7',
  acidYellow:     '#F9E2AF',
  neonGreen:      '#A6E3A1',
  laserRed:       '#F38BA8',
  arcadeOrange:   '#FAB387',
  phosphorGray:   '#585B70',
  ghostWhite:     '#CDD6F4',
  scanlineGray:   '#9399B2',
} as const;

// ── Status config ───────────────────────────────────────────────────
export const ARCADE_STATUS = {
  running: { symbol: '[+]', color: ARCADE_COLORS.neonGreen,   label: 'RUNNING' },
  stopped: { symbol: '[-]', color: ARCADE_COLORS.phosphorGray, label: 'OFFLINE' },
  crashed: { symbol: '[X]', color: ARCADE_COLORS.laserRed,    label: 'CRASHED' },
} as const;

// ── Mode badges ─────────────────────────────────────────────────────
export const ARCADE_MODES = {
  navigation:      { label: '[SESSIONS]',    bg: undefined,                       fg: ARCADE_COLORS.neonCyan },
  attached:        { label: '[ONLINE]',      bg: ARCADE_COLORS.hotPink,           fg: '#000000' },
  split:           { label: '[SPLIT VIEW]',  bg: ARCADE_COLORS.electricPurple,    fg: '#000000' },
  help:            { label: '[HELP]',        bg: ARCADE_COLORS.acidYellow,        fg: '#000000' },
  actionMenu:      { label: '[ACTIONS]',     bg: ARCADE_COLORS.neonCyan,          fg: '#000000' },
  sessionCreation: { label: '[NEW SESSION]', bg: ARCADE_COLORS.acidYellow,        fg: '#000000' },
  confirmation:    { label: '[CONFIRM]',     bg: ARCADE_COLORS.laserRed,          fg: '#000000' },
} as const;

// ── Action menu label overrides ──────────────────────────────────────
export const ARCADE_MENU_LABELS: Record<string, string> = {
  'new-session':     'NEW SESSION',
  'attach':          'ATTACH',
  'stop-session':    'TERMINATE',
  'restart-session': 'RESTART',
  'stop-all':        'STOP ALL',
  'help':            'HELP',
  'quit':            'QUIT',
};

// ── Decorative helpers ───────────────────────────────────────────────
export const ARCADE_DECOR = {
  sectionTitle:   (text: string): string => `── ${text} ──`,
  scanline:       '─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─',
  separator:      ' :: ',
  cursorSelected: '[>]',
  cursorBlank:    '   ',
  scrollUp:       (n: number): string => `^^ ${n} MORE ABOVE ^^`,
  scrollDown:     (n: number): string => `vv ${n} MORE BELOW vv`,
} as const;

// ── Blink intervals (ms) ────────────────────────────────────────────
export const ARCADE_BLINK = {
  insertCoin: 800,
  processing: 600,
  cursor:     500,
  modeBadge:  1000,
  errorFlash: 400,
} as const;

// ── ASCII art header (compact 3-line, ~48 chars wide) ───────────────
export const ARCADE_HEADER_COMPACT: readonly string[] = [
  ' ▄▄ ▄▄ ▄▄▄ ▄▄▄ ▄  ▄ ▄▄▄  ▄▄  ▄▄▄  ▄▄  ▄ ▄  ▄',
  '▄▄█  █  ▄▄ █ ▄ █▄▄█  █  ▄▄█  █▄█  █ █ █ █▄▄█',
  '█  █ █ ▄▄▄ █▄▄ █  █  █ ▄▄▄   █    ▄▄▀ █ █  █',
];

// ── Terminology map ──────────────────────────────────────────────────
export const ARCADE_TERMS = {
  sessions:   'SESSIONS',
  navigation: 'SESSION LIST',
  attached:   'ONLINE',
  running:    'RUNNING',
  stopped:    'OFFLINE',
  crashed:    'CRASHED',
  newSession: 'NEW SESSION',
  stopSession: 'TERMINATE',
  stopAll:    'STOP ALL',
  restart:    'RESTART?',
  attach:     'ATTACH',
  detach:     'DETACH',
  help:       'HELP',
  actions:    'ACTIONS',
  quit:       'QUIT',
  prompts:    'PROMPTS',
  pid:        'PID',
  uptime:     'UPTIME',
  output:     'OUTPUT',
  directory:  'DIR',
  creating:   'SPAWNING...',
  thinking:   'PROCESSING...',
  noSessions: 'NO SESSIONS',
  insertCoin: 'READY :: PRESS [N] TO SPAWN',
} as const;
