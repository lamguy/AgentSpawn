# AgentSpawn

Manage multiple Claude Code instances from a single terminal. Start, stop, switch between, and send commands to independent Claude Code sessions — like tmux for AI.

## Screenshots

### Main Help

<p align="center">
  <img src="docs/screenshots/help.svg" alt="agentspawn --help" width="700">
</p>

### Command Help

<p align="center">
  <img src="docs/screenshots/start-help.svg" alt="agentspawn start --help" width="700">
</p>

<p align="center">
  <img src="docs/screenshots/stop-help.svg" alt="agentspawn stop --help" width="700">
</p>

<p align="center">
  <img src="docs/screenshots/list-help.svg" alt="agentspawn list --help" width="700">
</p>

### Session List

<p align="center">
  <img src="docs/screenshots/list.svg" alt="agentspawn list" width="700">
</p>

### Error Handling

<p align="center">
  <img src="docs/screenshots/errors.svg" alt="Error handling" width="700">
</p>

### Test Suite (60 tests)

<p align="center">
  <img src="docs/screenshots/tests.svg" alt="Test suite — 60 tests passing" width="700">
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

```bash
agentspawn start project-a                # Start a session
agentspawn start project-b --dir ~/work   # Start with a working directory
agentspawn list                           # See all sessions (colored table)
agentspawn list --json                    # Machine-readable JSON output
agentspawn exec project-a "fix the bug"   # Send a command to a session
agentspawn switch project-a               # Attach terminal I/O (Ctrl+C to detach)
agentspawn stop project-a                 # Gracefully stop a session
agentspawn stop --all                     # Stop everything
```

## Commands

| Command | Description |
|---------|-------------|
| `agentspawn start <name>` | Spawn a new Claude Code child process with a name |
| `agentspawn stop [name]` | Gracefully stop a session (SIGTERM, then SIGKILL after timeout) |
| `agentspawn stop --all` | Stop all running sessions |
| `agentspawn list` | Show all sessions with colored status table |
| `agentspawn list --json` | Output session info as JSON for scripting |
| `agentspawn exec <name> <cmd>` | Write a command to a session's stdin pipe |
| `agentspawn switch <name>` | Attach terminal I/O to a session (Ctrl+C to detach) |

Every command supports `--help` for detailed usage.

## Features

- **Process isolation** — each session is a separate `child_process.spawn` with its own working directory and environment
- **Persistent registry** — session state survives CLI restarts via `~/.agentspawn/sessions.json`
- **Stale PID detection** — on startup, validates all registry PIDs and marks dead sessions as crashed
- **Graceful shutdown** — SIGTERM first, SIGKILL after configurable timeout (default 5s)
- **Crash recovery** — sessions that exit unexpectedly are automatically marked as crashed
- **I/O multiplexing** — attach/detach terminal to any running session with proper stream cleanup
- **Colored output** — green for running, red for crashed, gray for stopped
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
```

### Test

```bash
npm test               # Run all 60 tests (mocked — no real Claude needed)
```

### Lint & Format

```bash
npm run lint           # ESLint check (no-explicit-any enforced as error)
npm run format         # Auto-format with Prettier
npm run format:check   # Check formatting without changing files
npm run typecheck      # TypeScript strict mode type checking
```

## Project Structure

```
src/
  cli/              Command definitions and argument parsing
    commands/       start, stop, list, exec, switch
    index.ts        CLI entry point — wires manager + router to commands
  core/             Session lifecycle management
    session.ts      Spawns Claude Code, tracks PID, handles exit/crash
    manager.ts      Orchestrates sessions, validates PIDs, persists to registry
    registry.ts     JSON file persistence with corruption detection
  io/               I/O multiplexing
    router.ts       Attaches/detaches terminal I/O to sessions
    formatter.ts    ANSI colored output, session table formatting
  config/           Configuration defaults and validation
  utils/            Custom error hierarchy and structured logging
  types.ts          Shared TypeScript interfaces (SessionHandle, SessionInfo, etc.)
tests/
  integration/      End-to-end scaffold tests
```

## Architecture

Each Claude Code session runs as an isolated child process spawned via `child_process.spawn('claude')` with piped stdio. A registry file at `~/.agentspawn/sessions.json` persists session metadata across CLI invocations. On startup, the manager validates stored PIDs and marks dead ones as crashed.

```
agentspawn start  ──> SessionManager.startSession() ──> spawn("claude") + Registry.addEntry()
agentspawn stop   ──> SessionManager.stopSession()  ──> SIGTERM → 5s → SIGKILL + Registry.removeEntry()
agentspawn list   ──> SessionManager.listSessions()  ──> in-memory + Registry merge
agentspawn exec   ──> Session.getHandle().stdin.write() ──> piped to child process
agentspawn switch ──> Router.attach()                ──> terminal ↔ session I/O bridge
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

## License

[GPL-3.0](LICENSE)
