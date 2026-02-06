# TUI Session Attachment and Stdin Routing

## Overview

AgentSpawn TUI now supports **full interactive stdin routing** to sessions. You can attach to a session and type prompts directly within the TUI, just like using `agentspawn switch` but without leaving the visual interface.

## How It Works

### Two Modes

The TUI operates in two distinct modes:

#### 1. Navigation Mode (Default)

In navigation mode, you control the TUI with keyboard shortcuts:
- **Tab/Shift+Tab**: Cycle through sessions
- **↑/↓**: Navigate session list
- **Enter**: Attach to the selected session
- **q**: Quit TUI

**Visual indicators:**
- Normal status bar with cyan shortcuts
- No attachment indicator in header

#### 2. Attached Mode

In attached mode, your keyboard input goes directly to the Claude Code session:
- **All keys** are forwarded to the session (except Esc)
- **Esc**: Detach and return to navigation mode
- Type your prompts and press Enter to send them to Claude

**Visual indicators:**
- Header shows: `[ATTACHED: session-name]` in green
- Status bar has cyan background with bold text
- Status bar shows: `[Esc] detach  Type your prompt and press Enter`

## Usage Guide

### Step-by-Step: Sending a Prompt to a Session

1. **Launch the TUI:**
   ```bash
   agentspawn tui
   ```

2. **Navigate to your desired session:**
   - Use `↑`/`↓` arrows or `Tab` to select a session
   - The selected session is marked with `>`

3. **Attach to the session:**
   - Press `Enter` on the selected session
   - The header will show `[ATTACHED: session-name]` in green
   - The status bar background turns cyan

4. **Type your prompt:**
   - All keyboard input now goes to the session
   - Type naturally as if you were in a terminal
   - Example: `implement user authentication with JWT`
   - Press `Enter` to send the prompt

5. **Watch the response:**
   - The output pane (right side) shows the session's response in real-time
   - Tool calls appear with `⏺` (cyan)
   - Tool results appear with `⎿` (gray)
   - Regular responses appear as text

6. **Send follow-up prompts:**
   - While still attached, type additional prompts
   - Press `Enter` to send each one
   - The conversation continues naturally

7. **Detach when done:**
   - Press `Esc` to return to navigation mode
   - You can now navigate to other sessions
   - The session continues running in the background

### Visual Example

**Before Attaching (Navigation Mode):**
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ AgentSpawn                                                       [3 sessions] │
└──────────────────────────────────────────────────────────────────────────────┘
┌──────────────────────┬───────────────────────────────────────────────────────┐
│ Sessions             │  > frontend                                           │
│                      │                                                       │
│ > frontend [running] │  ⏺ Bash(npm test)                                     │
│   backend [running]  │    ⎿ All 42 tests passed                              │
│   api [stopped]      │                                                       │
└──────────────────────┴───────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Tab] switch   [Enter] attach   [q] quit   [?] help          3 sessions      │
└──────────────────────────────────────────────────────────────────────────────┘
```

**After Pressing Enter (Attached Mode):**
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ AgentSpawn    [ATTACHED: frontend]                           [3 sessions]    │
└──────────────────────────────────────────────────────────────────────────────┘
┌──────────────────────┬───────────────────────────────────────────────────────┐
│ Sessions             │  > frontend                                           │
│                      │                                                       │
│ ► frontend [running] │  ⏺ Bash(npm test)                                     │
│   backend [running]  │    ⎿ All 42 tests passed                              │
│   api [stopped]      │                                                       │
│                      │  [Typing prompt here...]                              │
└──────────────────────┴───────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Esc] detach  Type your prompt and press Enter                3 sessions     │
│ (Cyan background with bold text)                                             │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Technical Details

### Architecture

```
User Keypress
     │
     ▼
  Ink useInput
     │
     ├─── Mode: Navigation ──→ TUI Keyboard Shortcuts
     │                          (Tab, arrows, Enter, q)
     │
     └─── Mode: Attached ────→ onRawInput callback
                                     │
                                     ▼
                              Session.stdin.write()
                                     │
                                     ▼
                              Claude Code Process
```

### Stdin Forwarding

When attached:
1. TUI captures all keyboard input via Ink's `useInput` hook
2. Input is **NOT** processed as TUI shortcuts (except Esc)
3. Raw input is forwarded directly to the session's stdin stream
4. The session's stdout/stderr flows back through OutputCapture
5. Output appears in real-time in the OutputPane

### Error Handling

The implementation includes robust error handling:
- If a session stops while attached, TUI automatically detaches
- If stdin write fails, TUI reverts to navigation mode
- Invalid attachment attempts (to stopped sessions) show an error and stay in navigation mode
- Cleanup is guaranteed even if the TUI crashes

### Session State

- **Running sessions**: Can be attached
- **Stopped sessions**: Cannot be attached (Enter key has no effect)
- **Crashed sessions**: Cannot be attached
- **Starting sessions**: Wait until they reach "running" state before attaching

## Comparison with CLI Commands

| Feature | `agentspawn exec` | `agentspawn switch` | TUI Attach Mode |
|---------|-------------------|---------------------|-----------------|
| Send prompt | ✅ One command | ✅ Interactive | ✅ Interactive |
| See output | ❌ Not directly | ✅ Real-time | ✅ Real-time |
| Switch sessions | ✅ Easy | ❌ Must exit | ✅ Instant (Esc) |
| Visual context | ❌ None | ❌ None | ✅ Full TUI |
| Multi-session view | ❌ No | ❌ No | ✅ Yes |

## Keyboard Reference

### Navigation Mode
| Key | Action |
|-----|--------|
| `↑` or `k` | Move selection up |
| `↓` or `j` | Move selection down |
| `Tab` | Next session |
| `Shift+Tab` | Previous session |
| `Enter` | Attach to selected session |
| `q` | Quit TUI |
| `Ctrl+C` | Quit TUI |

### Attached Mode
| Key | Action |
|-----|--------|
| `Esc` | Detach (return to navigation) |
| All other keys | Forwarded to session |

## Best Practices

### When to Use Attach Mode

✅ **Good use cases:**
- Sending complex multi-line prompts
- Having a back-and-forth conversation with a session
- Monitoring output while working with a session
- Quickly switching between sessions to check status

❌ **Not ideal for:**
- One-off commands (use `agentspawn exec` instead)
- Long-running autonomous tasks (use `agentspawn start` and check back later)
- Working with multiple sessions simultaneously (use multiple terminal windows with `switch`)

### Tips

1. **Use Tab before Enter**: Navigate with Tab to preview session output before attaching
2. **Quick detach with Esc**: Press Esc to detach instantly - much faster than quitting and switching
3. **Multiple sessions**: Keep the TUI open while working with multiple sessions - detach/attach as needed
4. **Background work**: Detach from a session and it continues working - attach later to check progress

## Troubleshooting

### "Session not available for attachment"
- The session is stopped or crashed
- Start the session first: `agentspawn start <name>` or navigate to it and press `s` (when implemented)

### Input doesn't appear in output pane
- Ensure you're attached (check for green `[ATTACHED: ...]` in header)
- Ensure the session is running (status shows `[running]` in green)
- The session might be processing - wait for the spinner to stop

### Can't detach
- Try pressing `Esc` again
- If stuck, press `Ctrl+C` to quit the TUI
- The session will continue running in the background

### TUI freezes
- The underlying session may have crashed
- Press `q` to quit the TUI
- Check session status with: `agentspawn list`
- Restart the session if needed

## Implementation Status

✅ **Implemented:**
- Full stdin routing to attached sessions
- Mode switching (navigation ↔ attached)
- Visual indicators (header, status bar)
- Error handling and cleanup
- Esc key to detach
- Real-time output streaming

🚧 **Coming Soon:**
- `e` key to send one-off commands without full attachment
- Better error messages in the TUI
- Session restart from TUI
- Multi-line prompt input

## Related Documentation

- [TUI Showcase](./TUI_SHOWCASE.md) - Complete TUI feature overview
- [README](../README.md) - General AgentSpawn usage
- [CLI Commands](../README.md#commands) - `exec` and `switch` command reference
