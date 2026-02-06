# AgentSpawn TUI Showcase

## Interactive Terminal UI

AgentSpawn now includes a fully functional Terminal User Interface (TUI) for managing multiple Claude Code sessions interactively.

### Launch Command

```bash
agentspawn tui
```

### TUI Layout

The TUI features a three-panel split-screen layout:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ AgentSpawn                                                       [3 sessions] │
└──────────────────────────────────────────────────────────────────────────────┘
┌──────────────────────┬───────────────────────────────────────────────────────┐
│                      │                                                       │
│ Sessions             │  > frontend                                           │
│                      │                                                       │
│ > frontend [running] │  ⏺ Bash(npm test)                                     │
│   • ~/dev/frontend   │    ⎿ All 42 tests passed                              │
│   • pid 12345        │                                                       │
│   • 23m 14s          │  ⏺ Read(src/index.ts, src/utils.ts)                  │
│                      │    ⎿ Read 2 files                                     │
│   backend [running]  │                                                       │
│   • ~/dev/backend    │  Working on authentication module...                 │
│   • pid 12346        │                                                       │
│   • 12m 03s          │  ⏹                                                    │
│                      │                                                       │
│   api [stopped]      │                                                       │
│   • ~/dev/api        │                                                       │
│   • --               │                                                       │
│                      │                                                       │
└──────────────────────┴───────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Tab] switch   [Enter] attach   [q] quit   [?] help          3 sessions      │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Features

#### 1. Session List (Left Panel - 30%)
- **Real-time status** with color coding:
  - 🟢 `[running]` - Active session (green)
  - ⚫ `[stopped]` - Stopped session (gray)
  - 🔴 `[crashed]` - Crashed session (red)
  - 🟡 `[starting]` - Starting up (yellow)
- **Selection marker** (`>`) shows currently selected session
- **Session details** for selected session:
  - Working directory
  - Process ID (for running sessions)
  - Uptime (for running sessions)
- **Scrollable** for more than 20 sessions

#### 2. Output Pane (Right Panel - 70%)
- **Live output streaming** from the attached session
- **Tool call formatting**:
  - `⏺` (cyan) - Tool call indicator
  - `⎿` (gray) - Tool result indicator
- **Spinner** (`⏹`) when session is actively working
- **Session prompt** shows which session you're viewing (`> session-name`)
- **Auto-scroll** to bottom as new output arrives
- **Scrollback buffer** for viewing history

#### 3. Status Bar (Bottom)
- **Keyboard shortcuts** (cyan) for quick reference
- **Session count** showing total sessions
- **Always visible** for easy navigation

### Keyboard Shortcuts

| Key          | Action                          |
|--------------|---------------------------------|
| `Tab`        | Switch to next session          |
| `Shift+Tab`  | Switch to previous session      |
| `↑` or `k`   | Move selection up               |
| `↓` or `j`   | Move selection down             |
| `Enter`      | Attach to selected session      |
| `q`          | Quit TUI                        |
| `Ctrl+C`     | Quit TUI                        |
| `n`          | New session (coming soon)       |
| `x`          | Stop session (coming soon)      |
| `?`          | Toggle help (coming soon)       |

### Design Philosophy

The TUI follows **Claude Code's design language**:

- **Semantic colors**: Cyan for informational, green for success, red for errors
- **Minimal UI**: No decorative elements, function-first design
- **Keyboard-driven**: Every action has a keyboard shortcut
- **Tool call formatting**: Matches Claude Code's terminal output exactly
- **Progressive disclosure**: Shows relevant info, hides unnecessary details

### Technical Architecture

- **React + Ink**: Built with React components rendered to the terminal
- **Read-only adapters**: TUI never mutates core session state directly
- **Output capture**: Non-invasive circular buffer for session output
- **Real-time updates**: Polls session state every 500ms
- **Graceful degradation**: Works on terminals as small as 80x20

### Usage Examples

#### Launch TUI
```bash
agentspawn tui
```

#### Launch TUI with initial session selected
```bash
agentspawn tui --session frontend
```

#### Navigate between sessions
Press `Tab` or `↓` to move through sessions, then `Enter` to attach.

#### View output from a specific session
Use arrow keys to select the session, and its output will appear in the right pane.

#### Quit TUI
Press `q` or `Ctrl+C` to exit and return to your shell.

### Current Status

✅ **Implemented:**
- Split-pane layout with session list and output pane
- Real-time session status updates
- Color-coded status indicators
- Keyboard navigation (Tab, arrows, Enter)
- Live output streaming
- Tool call formatting matching Claude Code
- Status bar with shortcuts

🚧 **Coming Soon:**
- Interactive session creation (`n` key)
- Interactive session stopping (`x` key)
- Help overlay (`?` key)
- Output pane scrolling with keyboard
- Multiplex mode (view all sessions at once)
- Search in output (`/` key)

### Screenshots

The TUI successfully renders with:
- Three-panel layout (header, split body, status bar)
- Bordered boxes with proper spacing
- Session list showing running/stopped status
- Output pane (currently shows "No session attached" until Enter is pressed)
- Keyboard shortcuts visible in status bar

All components are functional and the UI updates in real-time as sessions start, stop, or produce output.
