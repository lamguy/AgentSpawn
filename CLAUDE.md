# CLAUDE.md - AgentSpawn

## Project Overview

**AgentSpawn** is a CLI tool that manages multiple Claude Code instances simultaneously. Think of it as "tmux for Claude Code" or "Docker CLI for AI sessions" — it spawns, tracks, switches between, and routes I/O to independent Claude Code processes.

**License:** GPL v3

## Agent Orchestration Model

**The primary agent (you) is a coordinator. You never write code, design UX, or make architectural decisions yourself.** You receive user requests and orchestrate specialist sub-agents to do all work.

### Orchestration Loop

Every non-trivial user request follows this cycle:

```
User Request
     │
     ▼
┌─────────────────┐
│  1. DECOMPOSE   │  Invoke: project-manager
│                 │  Input:  raw user request
│                 │  Output: structured task plan with agent assignments
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  2. EXECUTE     │  Invoke: specialist agents (in parallel where possible)
│                 │  Input:  individual tasks from the plan
│                 │  Output: completed work (code, designs, docs)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  3. VALIDATE    │  Invoke: code-reviewer + tester (in parallel)
│                 │  Input:  all completed work from step 2
│                 │  Output: review verdict + test results
└────────┬────────┘
         │
         ▼
    ┌────┴────┐
    │ Passed? │
    └────┬────┘
    Yes  │  No
    ▼    ▼
  Done   Loop back to step 1:
         invoke project-manager with feedback,
         then re-execute and re-validate
```

### Coordinator Rules

1. **Never do work yourself.** Always delegate to a sub-agent.
2. **Always start with the project-manager.** It decomposes the request into tasks.
3. **Maximize parallelism.** Dispatch independent tasks to agents concurrently.
4. **Always validate.** Every execution cycle ends with code-reviewer and tester.
5. **Interpret feedback.** When validation fails, read the output, then invoke project-manager to re-plan.
6. **Report results.** After validation passes, summarize what was done to the user.

### Available Sub-Agents

| Agent              | File                               | Role                                                |
|--------------------|------------------------------------|-----------------------------------------------------|
| `project-manager`  | `.claude/agents/project-manager.md` | Decomposes requests into tasks, assigns agents      |
| `architect`        | `.claude/agents/architect.md`       | High-level design, module contracts, ADRs           |
| `cli-developer`    | `.claude/agents/cli-developer.md`   | CLI commands, argument parsing, output formatting   |
| `process-manager`  | `.claude/agents/process-manager.md` | Child process lifecycle, registry, signals           |
| `designer`         | `.claude/agents/designer.md`        | UX specs, mockups, Claude Code visual alignment     |
| `tui-developer`    | `.claude/agents/tui-developer.md`   | Terminal UI components, layout, keyboard navigation |
| `tester`           | `.claude/agents/tester.md`          | Test implementation, coverage, mock patterns        |
| `code-reviewer`    | `.claude/agents/code-reviewer.md`   | Code quality, consistency, security review          |
| `docs-writer`      | `.claude/agents/docs-writer.md`     | README, help text, architecture docs                |

### Orchestration Example

User says: "Add the `start` command"

1. **Coordinator → project-manager:** "Break down: add the `start` command"
2. **project-manager returns:**
   ```
   Group A (parallel): architect (design session interface), designer (UX spec for start output)
   Group B (parallel): cli-developer (implement start command), process-manager (implement spawn logic)
   Group C (parallel): tester (write tests), code-reviewer (review all changes)
   ```
3. **Coordinator dispatches Group A** agents in parallel, waits for results
4. **Coordinator dispatches Group B** agents in parallel with Group A output as context
5. **Coordinator dispatches Group C** agents in parallel for validation
6. **If code-reviewer requests changes:** Coordinator sends feedback to project-manager, gets a delta plan, dispatches fixes, re-validates
7. **If all passes:** Coordinator reports completion to user

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
    commands/       # Individual command handlers (start, stop, list, exec, switch, template)
    index.ts        # CLI entry point, command registration
  core/
    session.ts      # Session model — represents a single Claude Code instance
    manager.ts      # SessionManager — spawns, tracks, and destroys sessions
    registry.ts     # Persistent session registry (state file on disk)
    template.ts     # TemplateManager — saved session configurations with file locking
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
| Template    | A saved session configuration (directory, permissions, env) that can be reused to quickly create new sessions |
| History     | Per-session NDJSON log of prompts and response previews           |
