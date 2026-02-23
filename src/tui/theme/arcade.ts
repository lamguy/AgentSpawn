/**
 * Arcade Theme Constants
 * Retro 1980s arcade cabinet aesthetic for the AgentSpawn TUI.
 */

// ── Colors ──────────────────────────────────────────────────────────
export const ARCADE_COLORS = {
  neonCyan:       '#00F5FF',
  electricPurple: '#B026FF',
  hotPink:        '#FF3CAC',
  acidYellow:     '#FFDD00',
  neonGreen:      '#2BFF88',
  laserRed:       '#FF2450',
  arcadeOrange:   '#FF9A00',
  phosphorGray:   '#4A4A5A',
  ghostWhite:     '#E8E8FF',
  scanlineGray:   '#8888AA',
} as const;

// ── Status config ───────────────────────────────────────────────────
export const ARCADE_STATUS = {
  running: { symbol: '[+]', color: ARCADE_COLORS.neonGreen,   label: 'IN PLAY' },
  stopped: { symbol: '[-]', color: ARCADE_COLORS.phosphorGray, label: 'GAME OVER' },
  crashed: { symbol: '[X]', color: ARCADE_COLORS.laserRed,    label: 'DESTROYED' },
} as const;

// ── Mode badges ─────────────────────────────────────────────────────
export const ARCADE_MODES = {
  navigation:      { label: '[SELECT PLAYER]', bg: undefined,                       fg: ARCADE_COLORS.neonCyan },
  attached:        { label: '[IN GAME]',        bg: ARCADE_COLORS.hotPink,          fg: '#000000' },
  split:           { label: '[VERSUS MODE]',    bg: ARCADE_COLORS.electricPurple,   fg: '#000000' },
  help:            { label: '[HOW TO PLAY]',    bg: ARCADE_COLORS.acidYellow,       fg: '#000000' },
  actionMenu:      { label: '[COMMAND CENTER]', bg: ARCADE_COLORS.neonCyan,         fg: '#000000' },
  sessionCreation: { label: '[INSERT COIN]',    bg: ARCADE_COLORS.acidYellow,       fg: '#000000' },
  confirmation:    { label: '[CONTINUE?]',      bg: ARCADE_COLORS.laserRed,         fg: '#000000' },
} as const;

// ── Action menu label overrides ──────────────────────────────────────
export const ARCADE_MENU_LABELS: Record<string, string> = {
  'new-session':     'INSERT COIN',
  'attach':          'PRESS START',
  'stop-session':    'PULL PLUG',
  'restart-session': 'CONTINUE?',
  'stop-all':        'GAME RESET',
  'help':            'HOW TO PLAY',
  'quit':            'POWER OFF',
};

// ── Decorative helpers ───────────────────────────────────────────────
export const ARCADE_DECOR = {
  sectionTitle:   (text: string): string => `-=[ ${text} ]=-`,
  scanline:       '~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~',
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
  sessions:   'PLAYERS',
  navigation: 'SELECT PLAYER',
  attached:   'IN GAME',
  running:    'IN PLAY',
  stopped:    'GAME OVER',
  crashed:    'DESTROYED',
  newSession: 'INSERT COIN',
  stopSession: 'PULL PLUG',
  stopAll:    'GAME RESET',
  restart:    'CONTINUE?',
  attach:     'PRESS START',
  detach:     'PAUSE GAME',
  help:       'HOW TO PLAY',
  actions:    'COMMAND CENTER',
  quit:       'POWER OFF',
  prompts:    'MOVES',
  pid:        'CHIP#',
  uptime:     'PLAY TIME',
  output:     'GAME FEED',
  directory:  'ARENA',
  creating:   'LOADING PLAYER...',
  thinking:   'PROCESSING MOVE...',
  noSessions: 'NO PLAYERS DETECTED',
  insertCoin: 'INSERT COIN TO BEGIN',
} as const;
