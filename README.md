# AgentSpawn

Manage multiple Claude Code instances from a single terminal. Start, stop, switch between, and send commands to independent Claude Code sessions — like tmux for AI.

## Screenshots

### Interactive TUI

<p align="center">
  <img src="docs/screenshots/tui-navigation.gif" alt="TUI navigation mode with session list and output pane" width="700">
</p>

### Keyboard Shortcuts

<p align="center">
  <img src="docs/screenshots/tui-help.gif" alt="TUI help overlay showing keybindings" width="700">
</p>

### CLI

<p align="center">
  <img src="docs/screenshots/cli-help.gif" alt="agentspawn --help" width="700">
</p>

### Test Suite (268 tests)

<p align="center">
  <img src="docs/screenshots/tests.gif" alt="Test suite — 268 tests passing" width="700">
</p>

## Install

```bash
git clone https://github.com/lamguy/AgentSpawn.git
cd AgentSpawn
npm install
npm run build
```

To make the `agentspawn` command available globally:

```bash
npm link
```

## Quick Start

### Interactive TUI (recommended)

```bash
agentspawn tui                           # Launch the interactive terminal UI
```

Then use keyboard shortcuts to manage sessions:

| Key | Action |
|-----|--------|
| `n` | Create new session |
| `Enter` | Attach to selected session |
| `Esc` | Detach from session |
| `Tab` / `j`/`k` | Navigate between sessions |
| `x` | Stop selected session |
| `:` | Open action menu |
| `?` | Show help |
| `q` | Quit |

In attached mode, type prompts and press `Enter` to send them to Claude.

### CLI Commands

```bash
agentspawn start project-a                # Start a session
agentspawn start project-b --dir ~/work   # Start with a working directory
agentspawn list                           # See all sessions
agentspawn list --json                    # Machine-readable JSON output
agentspawn exec project-a "fix the bug"   # Send a prompt to a session
agentspawn stop project-a                 # Stop a session
agentspawn stop --all                     # Stop everything
```

## Commands

| Command | Description |
|---------|-------------|
| `agentspawn tui` | Launch interactive terminal UI for managing sessions |
| `agentspawn start <name>` | Start a new Claude Code session |
| `agentspawn stop [name]` | Stop a session (or `--all` to stop everything) |
| `agentspawn list` | Show all sessions with status |
| `agentspawn exec <name> <cmd>` | Send a prompt to a session |
| `agentspawn switch <name>` | Attach to a session (interactive prompt mode) |

Every command supports `--help` for detailed usage.

## Features

- **Interactive TUI** — split-pane terminal UI with session list, output viewer, and prompt input
- **Overlay system** — help, action menu, session creation, and confirmation dialogs
- **Prompt-based sessions** — uses `claude --print` per prompt, keeping the TUI in control at all times
- **Conversation persistence** — session IDs and prompt counts survive TUI restarts
- **Cross-process discovery** — TUI polls the registry to discover sessions started by other processes
- **Persistent registry** — session state persists via `~/.agentspawn/sessions.json`
- **Stale PID detection** — validates registry PIDs on startup, marks dead sessions as crashed
- **Graceful shutdown** — SIGTERM first, SIGKILL after configurable timeout (default 5s)
- **Real-time output** — streaming response display with timestamps and error highlighting
- **Scriptable** — `--json` flag, proper exit codes (0 success, 1 user error, 2 system error)

## Development

### Prerequisites

- Node.js >= 20
- npm
- `claude` CLI installed (for running actual sessions)

### Setup

```bash
npm install
```

### Build & Run

```bash
npm run build          # Compile TypeScript to dist/
npm run dev            # Watch mode — rebuilds on changes
node dist/index.js     # Run the CLI directly
node dist/index.js tui # Launch the TUI
```

### Test

```bash
npm test               # Run all 268 tests (mocked — no real Claude needed)
```

### Lint & Format

```bash
npm run lint           # ESLint check
npm run format         # Auto-format with Prettier
npm run format:check   # Check formatting without changing files
npm run typecheck      # TypeScript strict mode type checking
```

## Project Structure

```
src/
  cli/              Command definitions and argument parsing
    commands/       start, stop, list, exec, switch, tui
    index.ts        CLI entry point
  core/             Session lifecycle management
    session.ts      Prompt-based sessions using claude --print
    manager.ts      Session orchestration, registry polling, adoption
    registry.ts     JSON file persistence with corruption detection
  io/               I/O multiplexing
    router.ts       Attaches/detaches terminal I/O to sessions
    formatter.ts    ANSI colored output, session table formatting
  tui/              Interactive terminal UI (Ink + React)
    components/     TUIApp, SessionListPane, OutputPane, StatusBar,
                    InputBar, HelpOverlay, ActionMenu, dialogs
    keybindings.ts  Mode-aware keyboard dispatch
    output-capture.ts  EventEmitter-based output streaming
    overlay-helpers.ts Overlay stack management
    types.ts        TUI state, actions, overlay types
  config/           Configuration defaults and validation
  utils/            Custom error hierarchy and structured logging
  types.ts          Shared TypeScript interfaces
tests/
  integration/      TUI integration tests
```

## Architecture

Sessions use `claude --print` per prompt instead of persistent child processes. Conversation continuity is maintained via `--session-id` (first prompt) and `--resume` (subsequent prompts) flags. The TUI stays mounted at all times.

```
agentspawn tui    ──> TUI (Ink/React) ──> SessionManager ──> claude --print per prompt
agentspawn start  ──> SessionManager.startSession() ──> Registry.addEntry()
agentspawn stop   ──> SessionManager.stopSession()  ──> Registry.removeEntry()
agentspawn list   ──> SessionManager.listSessions() ──> in-memory + Registry merge
agentspawn exec   ──> Session.sendPrompt()          ──> spawn claude --print
```

### Session Lifecycle

```
STOPPED ──start()──> RUNNING ──stop()──> STOPPED
                        │
                   (unexpected exit)
                        │
                        ▼
                     CRASHED
```

### TUI Modes

```
NAVIGATION ──Enter──> ATTACHED ──Esc──> NAVIGATION
     │                    │
     └── overlays ────────┘
         (help, action menu, dialogs)
```

## License

[GPL-3.0](LICENSE)
