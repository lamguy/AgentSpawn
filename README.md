# AgentSpawn

Manage multiple Claude Code instances from a single terminal. Start, stop, switch between, and send commands to independent Claude Code sessions — like tmux for AI.

## Screenshots

### Help & Commands

<p align="center">
  <img src="docs/screenshots/help.svg" alt="agentspawn --help" width="700">
</p>

### Running Commands

<p align="center">
  <img src="docs/screenshots/commands.svg" alt="CLI commands demo" width="700">
</p>

### Subcommand Help

<p align="center">
  <img src="docs/screenshots/start-help.svg" alt="agentspawn start --help" width="700">
</p>

### Error Handling

<p align="center">
  <img src="docs/screenshots/errors.svg" alt="Error handling" width="700">
</p>

### Test Suite

<p align="center">
  <img src="docs/screenshots/tests.svg" alt="Test suite — 50 tests passing" width="700">
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
agentspawn list                           # See all sessions
agentspawn exec project-a "fix the bug"   # Send a command to a session
agentspawn switch project-a               # Attach to a session
agentspawn stop project-a                 # Stop a session
agentspawn stop --all                     # Stop everything
```

## Commands

| Command | Description |
|---------|-------------|
| `agentspawn start <name>` | Start a new named Claude Code session |
| `agentspawn stop [name]` | Stop a session (or `--all` to stop everything) |
| `agentspawn list` | List all sessions with status (`--json` for machine output) |
| `agentspawn exec <name> <cmd>` | Send a command to a specific session |
| `agentspawn switch <name>` | Attach your terminal to a session |

Every command supports `--help` for detailed usage.

## Development

### Prerequisites

- Node.js >= 20
- npm

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
npm test               # Run all 50 tests
```

### Lint & Format

```bash
npm run lint           # ESLint check
npm run format         # Auto-format with Prettier
npm run format:check   # Check formatting without changing files
npm run typecheck      # TypeScript type checking
```

## Project Structure

```
src/
  cli/              Command definitions and argument parsing
    commands/       start, stop, list, exec, switch
    index.ts        CLI entry point
  core/             Session lifecycle management
    session.ts      Single Claude Code instance wrapper
    manager.ts      Orchestrates all sessions
    registry.ts     Persists session state to disk
  io/               I/O multiplexing
    router.ts       Routes stdin/stdout to active session
    formatter.ts    Output formatting with session prefixes
  config/           Configuration defaults and validation
  utils/            Error classes and logging
  types.ts          Shared TypeScript interfaces
tests/
  integration/      End-to-end scaffold tests
```

## Architecture

Each Claude Code session runs as an isolated child process. A registry file at `~/.agentspawn/sessions.json` persists session state across CLI invocations. Only the "attached" session receives stdin; all sessions can emit to stdout with session-name prefixes.

```
agentspawn start ──> SessionManager.startSession() ──> child_process.spawn("claude")
agentspawn stop  ──> SessionManager.stopSession()  ──> SIGTERM → timeout → SIGKILL
agentspawn list  ──> SessionManager.listSessions()  ──> Registry.load()
agentspawn exec  ──> Router.attach() + stdin.write() ──> session.stdin pipe
```

## License

[GPL-3.0](LICENSE)
