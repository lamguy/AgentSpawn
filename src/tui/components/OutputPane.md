# OutputPane Component

## Overview

The `OutputPane` component displays live output from a selected Claude Code session in the AgentSpawn TUI. It handles streaming output, ANSI escape sequences, tool call formatting, and provides scrollback functionality.

## Features

- **Live output streaming** — Displays output lines captured by `OutputCapture`
- **ANSI escape sequence support** — Terminal colors and formatting are preserved
- **Tool call formatting** — Special symbols for tool calls (⏺) and results (⎿)
- **Scrollback buffer** — Maintains up to N lines of history
- **Auto-scroll** — Automatically scrolls to bottom when new content arrives
- **Session header** — Shows session name with active spinner (⏹)
- **Empty states** — Handles "no session" and "no output" gracefully
- **Error highlighting** — stderr output is displayed in red

## Props

```typescript
interface OutputPaneProps {
  /** The session whose output to display */
  session: SessionInfo | null;
  
  /** Captured output lines from OutputCapture */
  outputLines: OutputLine[];
  
  /** Maximum number of lines to display (scrollback buffer size) */
  maxVisibleLines?: number; // default: 1000
  
  /** Whether to auto-scroll to bottom on new content */
  autoScroll?: boolean; // default: true
}
```

## Usage

### Basic Usage

```tsx
import { OutputPane } from './components/OutputPane.js';

function MyApp({ state, outputCapture }) {
  const selectedSession = state.sessions.find(
    s => s.name === state.selectedSessionName
  ) ?? null;
  
  const outputLines = state.selectedSessionName
    ? outputCapture.getLines(state.selectedSessionName)
    : [];

  return (
    <OutputPane
      session={selectedSession}
      outputLines={outputLines}
    />
  );
}
```

### With Custom Buffer Size

```tsx
<OutputPane
  session={selectedSession}
  outputLines={outputLines}
  maxVisibleLines={500}
  autoScroll={true}
/>
```

### Without Auto-scroll

```tsx
<OutputPane
  session={selectedSession}
  outputLines={outputLines}
  autoScroll={false}
/>
```

## Visual Design

### Session Header

```
> project-a ⏹
```

- Session name prefixed with `>`
- Spinner (⏹) shown when session is running
- Colored cyan (semantic informational color)

### Tool Call Formatting

```
⏺ Bash(npm test)
  ⎿ All 42 tests passed
```

- Tool calls: `⏺` symbol, colored cyan
- Tool results: `⎿` symbol, colored gray (dimmed)
- Follows Claude Code conventions

### Empty States

**No session selected:**
```
No session attached
```

**Session selected but no output:**
```
> session-name
No output yet...
```

### Error Output

Lines from stderr are displayed in red:
```
Error: Module not found
```

## Color Palette (Claude Code)

| Element      | Color | Meaning                |
|--------------|-------|------------------------|
| Header       | Cyan  | Informational metadata |
| Tool calls   | Cyan  | Tool invocation        |
| Tool results | Gray  | Tool output (dimmed)   |
| Errors       | Red   | stderr / error state   |
| Regular text | Default | stdout content       |

## Layout Integration

The OutputPane is designed to fit in the right panel of the TUI split layout:

```
┌─────────────────────────────────────────────────┐
│ AgentSpawn                        [3 sessions]  │
├──────────────────────┬──────────────────────────┤
│ Sessions             │ > project-a ⏹            │ ← Header
│                      │                          │
│ > project-a [running]│ ⏺ Bash(npm test)         │ ← Tool call
│   project-b [running]│   ⎿ All tests passed     │ ← Tool result
│   project-c [stopped]│                          │
│                      │ Claude: Working on...    │ ← Regular output
├──────────────────────┴──────────────────────────┤
│ [Tab] switch  [Enter] attach  [q] quit          │
└─────────────────────────────────────────────────┘
```

## Scrollback Behavior

- By default, the pane auto-scrolls to show the newest output
- The `scrollOffset` state (currently internal) can be exposed for scroll control
- When not at bottom, a scrollback indicator is shown:
  ```
  [15 lines below, scroll to see more]
  ```

## Performance Considerations

- The component uses `React.memo` indirectly via key-based rendering
- Lines are keyed by `timestamp + index` for stable rendering
- Visible lines are sliced from the buffer to avoid rendering thousands of lines
- Buffer is maintained by `OutputCapture`, not by this component

## Future Enhancements

- **Keyboard scrolling** — Arrow keys or Page Up/Down to scroll
- **Search** — Ctrl+F to search output
- **Copy to clipboard** — Select and copy text
- **Line numbers** — Optional line number column
- **Timestamp display** — Toggle to show timestamps per line
- **Filtering** — Filter by tool calls, errors, or keywords
- **Export** — Save output to file

## Testing

See `OutputPane.test.tsx` for unit tests covering:
- Rendering empty states
- Rendering output lines with various formats
- Tool call detection and coloring
- Error line highlighting
- Auto-scroll behavior
- Scrollback indicator

## Related Components

- `SessionList` — Left sidebar showing all sessions
- `StatusBar` — Bottom bar with keyboard shortcuts
- `OutputCapture` — Captures output from sessions (data layer)

## References

- [Designer spec](.claude/agents/designer.md) — Visual design system
- [Claude Code UX patterns](.claude/agents/designer.md#claude-code-ux-reference)
- [TUI types](../types.ts) — TypeScript interfaces
