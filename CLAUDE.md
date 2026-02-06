# CLAUDE.md - AgentSpawn

## Project Overview

**AgentSpawn** is a CLI tool that manages multiple Claude Code instances simultaneously. Think of it as "tmux for Claude Code" or "Docker CLI for AI sessions" — it spawns, tracks, switches between, and routes I/O to independent Claude Code processes.

**License:** GPL v3

## Project Vision

AgentSpawn solves the problem of running multiple Claude Code sessions in parallel. Users can:

- Start named sessions scoped to different projects or tasks
- List, switch between, and inspect running sessions
- Send commands to any session without switching context
- View multiplexed output from multiple sessions simultaneously

### Target CLI UX

```bash
agentspawn start project-a          # Start a named session
agentspawn start project-b --dir .  # Start with a working directory
agentspawn list                     # Show all sessions with status
agentspawn switch project-a         # Attach to a session
agentspawn exec project-b "fix bug" # Send command to a session
agentspawn stop project-a           # Gracefully stop a session
agentspawn stop --all               # Stop everything
```

## Architecture

### Tech Stack (Planned)

- **Language:** TypeScript (Node.js)
- **Process management:** `child_process` (spawn/fork)
- **CLI framework:** Commander.js or yargs
- **TUI (optional):** Ink (React for CLI) or blessed
- **Testing:** Vitest
- **Build:** tsup or tsc
- **Linting:** ESLint + Prettier
- **Package manager:** npm

### Core Modules (Planned)

```
src/
  cli/              # Command definitions and argument parsing
    commands/       # Individual command handlers (start, stop, list, exec, switch)
    index.ts        # CLI entry point, command registration
  core/
    session.ts      # Session model — represents a single Claude Code instance
    manager.ts      # SessionManager — spawns, tracks, and destroys sessions
    registry.ts     # Persistent session registry (state file on disk)
  io/
    router.ts       # I/O multiplexer — routes stdin/stdout to active session
    formatter.ts    # Output formatting, session-prefixed lines
  tui/              # Optional TUI layer (split panes, status bar)
    app.ts
  config/
    defaults.ts     # Default config values
    schema.ts       # Config validation
  utils/
    logger.ts       # Structured logging
    errors.ts       # Custom error types
  index.ts          # Main entry point
```

### Key Design Decisions

1. **Each session is an isolated child process.** Claude Code is spawned via `child_process.spawn` with its own working directory, env, and stdio pipes.
2. **A registry file persists session state.** Stored at `~/.agentspawn/sessions.json` so the CLI can survive restarts and discover running sessions.
3. **I/O routing is explicit.** Only the "attached" session gets stdin. All sessions can emit to stdout, prefixed with their session name.
4. **Graceful lifecycle.** Sessions receive SIGTERM first, SIGKILL after a timeout. Crash recovery detects stale PIDs on startup.

## Development Workflow

### Getting Started (Once Scaffolded)

```bash
npm install
npm run build
npm run dev          # Watch mode
npm test             # Run tests
npm run lint         # Lint + format check
```

### Commands

| Command          | Description                    |
|------------------|--------------------------------|
| `npm run build`  | Compile TypeScript to dist/    |
| `npm run dev`    | Watch mode for development     |
| `npm test`       | Run Vitest test suite          |
| `npm run lint`   | ESLint check                   |
| `npm run format` | Prettier format                |

### Branch Strategy

- `main` — stable releases
- `claude/*` — AI-assisted feature branches
- Feature branches merge to `main` via PR

## Coding Conventions

### TypeScript

- **Strict mode** enabled (`strict: true` in tsconfig)
- Use `interface` for object shapes, `type` for unions/intersections
- Prefer `async/await` over raw Promises
- No `any` — use `unknown` and narrow with type guards
- Explicit return types on exported functions

### Naming

- Files: `kebab-case.ts`
- Classes: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Interfaces: `PascalCase` (no `I` prefix)
- Types: `PascalCase`

### Error Handling

- Use custom error classes extending `Error` (defined in `src/utils/errors.ts`)
- CLI commands should catch errors and print user-friendly messages
- Process management errors must never crash the parent — always handle gracefully

### Testing

- Co-locate test files: `src/core/manager.test.ts` next to `src/core/manager.ts`
- Use descriptive `describe`/`it` blocks
- Mock child processes in unit tests — do not spawn real Claude Code instances
- Integration tests live in `tests/integration/`

### Git Commits

- Use conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
- Keep commits atomic — one logical change per commit

## Key Domain Concepts

| Term        | Definition                                                        |
|-------------|-------------------------------------------------------------------|
| Session     | A single managed Claude Code child process with a name and state  |
| Manager     | The singleton that owns and orchestrates all sessions             |
| Registry    | On-disk JSON file tracking session metadata across CLI invocations|
| Router      | The I/O multiplexer that connects terminal stdin/stdout to sessions|
| Attached    | The currently active session receiving user input                 |

## Agent Conventions

When working on this codebase as an AI assistant:

1. **Read before writing.** Always read existing files before modifying them.
2. **Follow the module structure.** Place code in the correct directory per the architecture above.
3. **Use the sub-agents.** Specialized agents exist under `.claude/agents/` for architecture, CLI, process management, TUI, testing, and documentation tasks. Delegate appropriately.
4. **Don't over-engineer.** This is a CLI tool, not a distributed system. Keep it simple.
5. **Test process management carefully.** Spawning child processes has sharp edges — always handle errors, timeouts, and cleanup.
6. **Prefer composition over inheritance.** Use dependency injection for testability.
7. **Never spawn real Claude Code in tests.** Always mock the child process layer.
