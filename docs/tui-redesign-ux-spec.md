# AgentSpawn TUI Redesign -- UX Specification

**Version:** 1.0
**Author:** Lead Designer
**Date:** 2026-02-06
**Status:** Ready for Implementation

---

## Table of Contents

1. [Design Goals](#1-design-goals)
2. [Design Language](#2-design-language)
3. [Color System](#3-color-system)
4. [Typography & Text Styling](#4-typography--text-styling)
5. [Border System](#5-border-system)
6. [Spacing Constants](#6-spacing-constants)
7. [Unicode Symbol System](#7-unicode-symbol-system)
8. [Layout Architecture](#8-layout-architecture)
9. [Component Specifications](#9-component-specifications)
10. [New Components](#10-new-components)
11. [Interaction Design](#11-interaction-design)
12. [State Machine & Mode Transitions](#12-state-machine--mode-transitions)
13. [Keyboard Shortcut Reference](#13-keyboard-shortcut-reference)
14. [Focus Management](#14-focus-management)
15. [Responsive Behavior](#15-responsive-behavior)
16. [Implementation Notes](#16-implementation-notes)

---

## 1. Design Goals

**Primary objectives for the redesign:**

- **Professional polish:** Transition from a functional prototype to a tool that feels as refined as lazygit, k9s, or zellij.
- **Visual hierarchy:** Make the most important information (session status, active output) immediately scannable.
- **Mode clarity:** The user must always know what mode they are in (navigation, attached, help, menu) through strong visual cues.
- **Discoverability:** New users can find all actions through help overlay and action menu without memorizing shortcuts upfront.
- **Consistency:** Every component follows the same color, spacing, and typography rules.

**Inspirational references:**

- **lazygit** -- Panel-based layout with strong focus indicators and colored status badges.
- **k9s** -- Information-dense panels with clear header bars and mode indicators.
- **zellij** -- Clean tab/pane metaphor with a prominent mode-aware status bar.
- **Claude Code** -- Semantic coloring (cyan for informational, green for success, red for errors), minimal chrome, tool-call formatting.

---

## 2. Design Language

The AgentSpawn TUI design language is built on three pillars:

1. **Terminal-native:** Uses only capabilities available in modern terminal emulators (Unicode box-drawing, ANSI 16-color palette via Ink color names). No true-color dependency.
2. **Information density:** Maximize useful information per screen line while maintaining readability through whitespace and grouping.
3. **Keyboard-first:** Every interaction is reachable via keyboard. Mouse support is not a goal for v1.

---

## 3. Color System

All colors use Ink's named color primitives. This guarantees compatibility across terminal themes (dark and light).

### Semantic Color Assignments

| Role              | Color       | Ink Value     | Usage                                                      |
|-------------------|-------------|---------------|------------------------------------------------------------|
| **Primary**       | Cyan        | `"cyan"`      | Brand color, active elements, focused borders, key hints   |
| **Secondary**     | Blue        | `"blue"`      | Secondary panels, informational badges                     |
| **Accent**        | Magenta     | `"magenta"`   | Highlights, attached-session pill, special indicators      |
| **Success**       | Green       | `"green"`     | Running status, successful operations                      |
| **Warning**       | Yellow      | `"yellow"`    | Starting/pending states, processing indicators             |
| **Error**         | Red         | `"red"`       | Crashed status, error output, destructive action warnings  |
| **Muted**         | Gray        | `"gray"`      | Stopped status, dim labels, secondary text, timestamps     |
| **Default text**  | White       | `"white"`     | Primary body text                                          |
| **Inverse**       | Black on bg | `"black"`     | Text on colored backgrounds (status bar in attached mode)  |

### Background Color Usage

Background colors are used sparingly for high-signal elements only:

| Element                         | Background     | Foreground  |
|---------------------------------|----------------|-------------|
| Status bar (navigation mode)    | none (default) | cyan/white  |
| Status bar (attached mode)      | `"cyan"`       | `"black"`   |
| Mode badge: NAV                 | none           | `"cyan"`    |
| Mode badge: ATTACHED            | `"magenta"`    | `"black"`   |
| Mode badge: HELP                | `"yellow"`     | `"black"`   |
| Mode badge: MENU                | `"blue"`       | `"black"`   |
| Selected session row            | none           | `"cyan"` bold |
| Help overlay background         | none (default) | white       |

---

## 4. Typography & Text Styling

Ink provides these text decorations: `bold`, `dimColor`, `italic`, `underline`, `strikethrough`, `inverse`. We use a subset for clarity.

### Text Style Hierarchy

| Purpose                    | Style                          | Example                     |
|----------------------------|--------------------------------|-----------------------------|
| **App title**              | bold, cyan                     | `AgentSpawn`                |
| **Pane titles**            | bold, white                    | `Sessions`, `Output`        |
| **Section headers**        | bold, white                    | `Navigation`, `Actions`     |
| **Selected item name**     | bold, cyan                     | `frontend`                  |
| **Unselected item name**   | normal, white                  | `backend`                   |
| **Status labels**          | normal, semantic color         | (green) running             |
| **Secondary detail text**  | dimColor                       | `~/dev/frontend`            |
| **Keyboard shortcut keys** | bold, cyan                     | `Tab`                       |
| **Shortcut descriptions**  | normal, gray                   | `next session`              |
| **Timestamps**             | dimColor                       | `14:32:01`                  |
| **Hints / placeholders**   | dimColor                       | `Type a prompt...`          |
| **Error messages**         | bold, red                      | `Session crashed`           |
| **Mode badge text**        | bold, inverse on bg color      | ` NAV `                     |
| **Active prompt prefix**   | bold, cyan                     | `demo >`                    |
| **Version string**         | dimColor                       | `v0.1.0`                    |
| **Character count**        | dimColor                       | `42/500`                    |

### Rules

- Never combine more than two decorations (e.g., bold + color is fine; bold + dim + underline is not).
- `underline` is reserved for help-overlay section headers only.
- `inverse` is reserved for the cursor character in the input bar and mode badges on colored backgrounds.
- `italic` is not used (terminal support is inconsistent).
- `strikethrough` is not used.

---

## 5. Border System

Ink supports these border styles via the `borderStyle` prop: `single`, `double`, `round`, `bold`, `singleDouble`, `doubleSingle`, `classic`.

### Border Assignment

| Element                  | Border Style | Border Color (focused) | Border Color (unfocused) |
|--------------------------|--------------|------------------------|--------------------------|
| **Header bar**           | `"single"`   | `"cyan"`               | `"gray"`                 |
| **Session list pane**    | `"single"`   | `"cyan"`               | `"gray"`                 |
| **Output pane**          | `"single"`   | `"cyan"`               | `"gray"`                 |
| **Input bar**            | `"round"`    | `"cyan"`               | `"gray"`                 |
| **Status bar**           | `"single"`   | `"cyan"`               | `"gray"`                 |
| **Help overlay**         | `"double"`   | `"yellow"`             | n/a                      |
| **Action menu**          | `"round"`    | `"blue"`               | n/a                      |
| **Session creation form**| `"round"`    | `"cyan"`               | n/a                      |
| **Confirmation dialog**  | `"double"`   | `"red"`                | n/a                      |

### Focus Behavior

When the TUI is in **navigation mode**, the session list pane border uses the focused color (`"cyan"`), and the output pane border uses the unfocused color (`"gray"`).

When in **attached mode**, the output pane border uses the focused color (`"cyan"`), and the session list pane border uses the unfocused color (`"gray"`).

Overlays (help, menu, dialog) always use their own border color regardless of mode.

---

## 6. Spacing Constants

Define these as exported constants in a `theme.ts` file for consistency:

```typescript
export const SPACING = {
  /** Horizontal padding inside bordered boxes */
  PANE_PADDING_X: 1,
  /** Vertical padding inside bordered boxes */
  PANE_PADDING_Y: 0,
  /** Gap between session list items */
  SESSION_ITEM_GAP: 0,
  /** Left indent for detail lines under a session */
  DETAIL_INDENT: 3,
  /** Gap between shortcut groups in status bar */
  SHORTCUT_GAP: 2,
  /** Margin above/below overlay modals */
  OVERLAY_MARGIN_Y: 2,
  /** Horizontal margin for overlay modals */
  OVERLAY_MARGIN_X: 4,
  /** Gap between form fields in dialogs */
  FORM_FIELD_GAP: 1,
} as const;
```

---

## 7. Unicode Symbol System

Replace all bracket-based status indicators with Unicode symbols for a cleaner, more professional appearance.

### Status Symbols

| State        | Symbol | Unicode   | Color    | Description              |
|--------------|--------|-----------|----------|--------------------------|
| Running      | `●`    | U+25CF    | green    | Filled circle            |
| Stopped      | `○`    | U+25CB    | gray     | Empty circle             |
| Crashed      | `▲`    | U+25B2    | red      | Warning triangle         |
| Starting     | `◐`    | U+25D0    | yellow   | Half-filled circle       |

### Navigation Symbols

| Purpose          | Symbol | Unicode   | Color    |
|------------------|--------|-----------|----------|
| Selection cursor | `>`    | U+003E    | cyan     |
| Expanded detail  | `  `   | (indent)  | --       |
| Breadcrumb sep   | `/`    | U+002F    | gray     |
| Prompt prefix    | `>`    | U+003E    | cyan     |

### Output Symbols

| Purpose           | Symbol | Unicode   | Color    |
|-------------------|--------|-----------|----------|
| Tool call         | `*`    | U+002A    | cyan     |
| Tool result       | `|`    | U+007C    | gray     |
| User prompt       | `>`    | U+003E    | magenta  |
| Error line        | `!`    | U+0021    | red      |
| Scroll indicator  | `...`  | U+2026    | gray     |

### Miscellaneous

| Purpose           | Symbol | Unicode   | Color    |
|-------------------|--------|-----------|----------|
| Processing/spinner| `...`  | U+2026    | yellow   |
| Check mark        | `+`    | U+002B    | green    |
| Cross mark        | `x`    | U+0078    | red      |
| Arrow right       | `->`   | U+002D+3E| gray     |
| Separator         | `|`    | U+007C    | gray     |

---

## 8. Layout Architecture

### Overall Structure

The TUI occupies the full terminal viewport and is divided into four vertical zones:

```
+---------------------------------------------------------------------+
| HEADER                                                              |
+---------------------------+-----------------------------------------+
|                           |                                         |
| SESSION LIST              | OUTPUT PANE                             |
| (30% width)               | (70% width)                            |
|                           |                                         |
+---------------------------+-----------------------------------------+
| INPUT BAR (visible in attached mode only)                           |
+---------------------------------------------------------------------+
| STATUS BAR                                                          |
+---------------------------------------------------------------------+
```

### Zone Heights

- **Header:** 1 line of content + border = 3 lines total
- **Body (session list + output):** fills all remaining vertical space
- **Input bar:** 1 line of content + border top = 2 lines (only in attached mode)
- **Status bar:** 1 line of content + border = 3 lines total

### Width Allocation

- **Session list pane:** 30% of terminal width (minimum 24 columns)
- **Output pane:** 70% of terminal width (remaining space)

---

## 9. Component Specifications

### 9.1 Header

The header is a single-line bar at the top of the screen.

**Content layout:**

```
Left:    [icon] AgentSpawn [version]
Center:  (empty)
Right:   [attached-pill] [session-count]
```

**ASCII mockup -- navigation mode:**

```
+---------------------------------------------------------------------+
|  AgentSpawn v0.1.0                                    3 sessions    |
+---------------------------------------------------------------------+
```

**ASCII mockup -- attached mode:**

```
+---------------------------------------------------------------------+
|  AgentSpawn v0.1.0                        ATTACHED:demo  3 sessions |
+---------------------------------------------------------------------+
```

**Specification:**

| Element         | Style                        | Notes                                    |
|-----------------|------------------------------|------------------------------------------|
| Icon            | `"*"` or `"@"`, bold cyan   | Static character before app name         |
| App name        | bold, cyan                   | Always `AgentSpawn`                      |
| Version         | dimColor                     | e.g., `v0.1.0`                           |
| Attached pill   | bold magenta bg, black text  | Only visible when attached; format: ` ATTACHED:name ` |
| Session count   | cyan                         | Format: `N sessions` or `N session`      |

**Ink implementation notes:**

- Use `<Box flexDirection="row" justifyContent="space-between" paddingX={1} borderStyle="single" borderColor="cyan">`.
- The attached pill uses `<Text backgroundColor="magenta" color="black" bold>{" ATTACHED:" + name + " "}</Text>`.

---

### 9.2 Session List Pane

The session list occupies the left 30% of the body area.

**ASCII mockup -- navigation mode, 3 sessions, "frontend" selected:**

```
+-------------------------+
| Sessions            3   |
|                         |
| > frontend          ●   |
|     ~/dev/frontend      |
|     PID 12345  23m      |
|                         |
|   backend             ●   |
|   api                 ○   |
|                         |
+-------------------------+
```

**Row structure (unselected):**

```
  {name}                {status-symbol}
```

**Row structure (selected / expanded):**

```
> {name}                {status-symbol}
    {working-directory-truncated}
    PID {pid}  {uptime}
```

**Row structure (selected + attached):**

```
> {name}                {status-symbol}
    {working-directory-truncated}
    PID {pid}  {uptime}  ATTACHED
```

**Specification:**

| Element              | Style                           | Notes                                       |
|----------------------|---------------------------------|---------------------------------------------|
| Pane title           | bold, white                     | "Sessions"                                  |
| Pane title count     | dimColor                        | Right-aligned session count                 |
| Cursor `>`           | bold, cyan                      | Only on selected row                        |
| Session name (sel)   | bold, cyan                      | Selected session is bold cyan               |
| Session name (unsel) | white                           | Normal weight                               |
| Session name (att)   | bold, magenta                   | Attached session has magenta name           |
| Status symbol        | Semantic color per state table  | Right-aligned in the row                    |
| Working directory    | dimColor                        | Truncated to pane width minus indent        |
| PID                  | dimColor                        | Format: `PID {number}`                      |
| Uptime               | dimColor                        | Format: `{Nm}`, `{Nh Nm}`, `{Nd Nh}`       |
| ATTACHED label       | bold, magenta                   | Only shown for the attached session         |
| Scroll indicator     | dimColor                        | Format: `{visible}/{total}` at bottom       |
| Empty state          | dimColor                        | "No sessions. Press n to create one."       |

**Border:**
- `borderStyle="single"`
- `borderColor="cyan"` when pane is focused (navigation mode)
- `borderColor="gray"` when pane is unfocused (attached mode)

---

### 9.3 Output Pane

The output pane occupies the right 70% of the body area.

**ASCII mockup -- session "frontend" selected and running:**

```
+-----------------------------------------+
| Output: frontend  ●  running    [1/42]  |
|                                         |
| > fix the authentication bug            |
|                                         |
| * Bash(npm test)                        |
| |   All 42 tests passed                 |
|                                         |
| * Read(src/index.ts)                    |
| |   Read 1 file (245 lines)             |
|                                         |
| Working on authentication module...     |
|                                         |
+-----------------------------------------+
```

**ASCII mockup -- no session selected:**

```
+-----------------------------------------+
| Output                                  |
|                                         |
|                                         |
|    Select a session to view output      |
|    or press n to create a new one       |
|                                         |
|                                         |
+-----------------------------------------+
```

**Pane header layout:**

```
Output: {session-name}  {status-symbol}  {state-label}    [{scroll-position}]
```

**Specification:**

| Element              | Style                           | Notes                                        |
|----------------------|---------------------------------|----------------------------------------------|
| Pane header label    | bold, white                     | "Output:"                                    |
| Session name         | bold, cyan                      | Name of the displayed session                |
| Status symbol        | Semantic color per state        | Same symbols as session list                 |
| State label          | Semantic color, normal weight   | "running", "stopped", "crashed"              |
| Scroll position      | dimColor                        | `[line/total]` or `[END]` at bottom          |
| User prompt lines    | magenta, prefixed with `>`      | Lines the user typed                         |
| Tool call lines      | cyan, prefixed with `*`         | Tool invocations from Claude                 |
| Tool result lines    | dimColor, prefixed with `|`     | Results/output from tool calls               |
| Error lines          | red                             | stderr or error output                       |
| Regular output       | white (default)                 | Normal Claude response text                  |
| Timestamp (optional) | dimColor                        | `HH:MM:SS` prefix, only when toggled on      |
| Empty state          | dimColor, centered              | "Select a session to view output"            |
| Scroll-up indicator  | dimColor                        | `... N more lines above` at top              |
| Scroll-down indicator| dimColor                        | `... N more lines below` at bottom           |

**Border:**
- `borderStyle="single"`
- `borderColor="cyan"` when pane is focused (attached mode)
- `borderColor="gray"` when pane is unfocused (navigation mode)

**Output line classification logic:**

```typescript
function classifyLine(text: string): 'user-prompt' | 'tool-call' | 'tool-result' | 'error' | 'normal' {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('>')) return 'user-prompt';
  if (trimmed.startsWith('*')) return 'tool-call';
  if (trimmed.startsWith('|')) return 'tool-result';
  // isError flag from OutputLine metadata takes precedence
  return 'normal';
}
```

---

### 9.4 Input Bar

The input bar appears between the body and the status bar, only visible in attached mode.

**ASCII mockup -- typing:**

```
(~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~)
( frontend > hello world_                                    11/500   )
(~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~)
```

**ASCII mockup -- processing:**

```
(~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~)
( frontend > ...  Processing                                         )
(~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~)
```

**Specification:**

| Element              | Style                           | Notes                                        |
|----------------------|---------------------------------|----------------------------------------------|
| Session name prefix  | bold, cyan                      | Format: `{session-name} > `                  |
| Input text           | white                           | User-typed text                              |
| Cursor               | inverse                         | Block cursor at current position             |
| Character count      | dimColor                        | Right-aligned, format: `{len}/{max}`         |
| Processing indicator | yellow                          | `...  Processing`                            |
| Max characters       | 500                             | Soft limit; dimColor turns yellow when > 400 |
| Placeholder          | dimColor                        | "Type a prompt..." when empty                |

**Border:**
- `borderStyle="round"` (rounded corners for visual distinction from panes)
- `borderColor="cyan"`

**Behavior:**
- Input bar receives all keyboard input in attached mode except Escape.
- Enter submits; the buffer is cleared after submission.
- Ctrl+C clears the buffer.
- Ctrl+A moves to start, Ctrl+E moves to end.
- Ctrl+U clears from cursor to start.
- Left/Right arrows for cursor movement.
- Backspace for deletion.

---

### 9.5 Status Bar

The status bar is permanently visible at the bottom of the screen.

**ASCII mockup -- navigation mode:**

```
+---------------------------------------------------------------------+
|  NAV  | Tab next  Enter attach  n new  x stop  ? help  : menu  | 3 sessions  v0.1.0 |
+---------------------------------------------------------------------+
```

**ASCII mockup -- attached mode:**

```
+---------------------------------------------------------------------+
|  ATTACHED  | Esc detach  Ctrl+C clear                    | 3 sessions  v0.1.0 |
+---------------------------------------------------------------------+
```

**ASCII mockup -- help overlay active:**

```
+---------------------------------------------------------------------+
|  HELP  | Esc/? close                                    | 3 sessions  v0.1.0 |
+---------------------------------------------------------------------+
```

**Layout:**

```
[mode-badge] | {shortcuts}                              | {metadata}
```

**Mode Badge Specification:**

| Mode     | Badge text   | Background    | Foreground | Bold |
|----------|-------------|---------------|------------|------|
| NAV      | ` NAV `     | none          | cyan       | yes  |
| ATTACHED | ` ATTACHED `| magenta       | black      | yes  |
| HELP     | ` HELP `    | yellow        | black      | yes  |
| MENU     | ` MENU `    | blue          | black      | yes  |

**Shortcuts -- context-sensitive:**

| Mode     | Displayed Shortcuts                                                              |
|----------|----------------------------------------------------------------------------------|
| NAV      | `Tab` next  `Enter` attach  `n` new  `x` stop  `?` help  `:` menu              |
| ATTACHED | `Esc` detach  `Ctrl+C` clear                                                   |
| HELP     | `Esc` close  `?` close                                                          |
| MENU     | `Up/Down` navigate  `Enter` select  `Esc` close                                    |

**Shortcut rendering:**

- Key name: bold, cyan (or bold black on colored status bar background)
- Description: dimColor (or normal black on colored status bar background)
- Separator between groups: 2 spaces

**Metadata (right side):**

- Session count: `N sessions` in cyan
- Version: dimColor
- Separator: `|` in gray between shortcut area and metadata

**Border:**
- `borderStyle="single"`
- `borderColor` matches mode badge color (cyan for NAV, magenta for ATTACHED, etc.)

---

## 10. New Components

### 10.1 Help Overlay

**Trigger:** `?` key in navigation mode

**ASCII mockup:**

```
+=====================================================+
||                                                   ||
||              AgentSpawn Keyboard Shortcuts         ||
||                                                   ||
||  NAVIGATION                                       ||
||  -----------------------------------------------  ||
||  Up/Down, j/k     Move selection                  ||
||  Tab               Next session                   ||
||  Shift+Tab         Previous session               ||
||  Enter             Attach to session               ||
||  n                 New session                     ||
||  x                 Stop selected session           ||
||  :  or  Ctrl+P     Open action menu               ||
||  q                 Quit                            ||
||  Ctrl+C            Quit                            ||
||                                                   ||
||  ATTACHED MODE                                    ||
||  -----------------------------------------------  ||
||  Esc               Detach from session             ||
||  Enter             Send prompt                     ||
||  Ctrl+C            Clear input                     ||
||  Ctrl+A            Move to start of line           ||
||  Ctrl+E            Move to end of line             ||
||  Ctrl+U            Clear to start of line          ||
||                                                   ||
||  GLOBAL                                           ||
||  -----------------------------------------------  ||
||  ?                 Toggle this help                ||
||                                                   ||
||            Press Esc or ? to close                 ||
||                                                   ||
+=====================================================+
```

**Specification:**

| Property            | Value                                              |
|---------------------|----------------------------------------------------|
| Position            | Centered overlay on top of all panes               |
| Width               | 60 columns (or terminal width - 8, whichever is smaller) |
| Height              | Fits content, max terminal height - 4              |
| Border              | `"double"`, color: `"yellow"`                      |
| Title               | bold, white, centered: "AgentSpawn Keyboard Shortcuts" |
| Section headers     | bold, underline, white                             |
| Key column          | bold, cyan, left-aligned, 20 chars wide            |
| Description column  | normal, white                                      |
| Footer hint         | dimColor, centered: "Press Esc or ? to close"      |
| Dismiss keys        | Escape, `?`                                        |
| Background behavior | Panes behind are still visible but do not update   |
| Z-order             | Renders after all other components                 |

**Implementation approach:**

Render the help overlay as a conditionally rendered `<Box>` with `position="absolute"` (if supported by Ink) or as a top-level conditional in TUIApp that replaces the body content. Recommended approach: render help as a full-screen replacement of the body section, keeping header and status bar visible.

---

### 10.2 Action Menu (Command Palette)

**Trigger:** `:` or `Ctrl+P` in navigation mode

**ASCII mockup:**

```
                    (~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~)
                    (  Actions                      )
                    (                               )
                    (  > New Session           n    )
                    (    Stop Session          x    )
                    (    Stop All Sessions     X    )
                    (    Restart Session       r    )
                    (    Clear Output          c    )
                    (    Toggle Timestamps     t    )
                    (    Toggle Details        d    )
                    (                               )
                    (  Up/Down to navigate          )
                    (  Enter to select, Esc close   )
                    (~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~)
```

**Specification:**

| Property            | Value                                              |
|---------------------|----------------------------------------------------|
| Position            | Horizontally centered, vertically offset 2 from top |
| Width               | 36 columns                                         |
| Height              | Fits content (number of items + chrome)            |
| Border              | `"round"`, color: `"blue"`                         |
| Title               | bold, white: "Actions"                             |
| Selected item       | `>` cursor + bold cyan text                        |
| Unselected item     | Normal white text, 2-space indent                  |
| Shortcut hint       | dimColor, right-aligned                            |
| Footer hint         | dimColor: navigation instructions                  |
| Dismiss keys        | Escape, `:`, Ctrl+P                                |

**Menu items:**

| Label                | Shortcut | Action                                           |
|----------------------|----------|--------------------------------------------------|
| New Session          | `n`      | Opens session creation dialog                    |
| Stop Session         | `x`      | Stops the selected session (with confirmation)   |
| Stop All Sessions    | `X`      | Stops all sessions (with confirmation)           |
| Restart Session      | `r`      | Restarts the selected session                    |
| Clear Output         | `c`      | Clears the output buffer for selected session    |
| Toggle Timestamps    | `t`      | Toggles timestamp display in output pane         |
| Toggle Details       | `d`      | Toggles expanded details in session list         |

**Navigation:**
- Up/Down arrows move the selection cursor
- Enter executes the selected action
- Pressing the shortcut letter directly executes that action
- Escape closes without action

---

### 10.3 Session Creation Dialog

**Trigger:** `n` key in navigation mode, or "New Session" from action menu

**ASCII mockup:**

```
                    (~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~)
                    (  New Session                  )
                    (                               )
                    (  Name:                        )
                    (  [my-session             ]    )
                    (                               )
                    (  Directory:                   )
                    (  [~/dev/my-project       ]    )
                    (                               )
                    (  Tab to switch fields         )
                    (  Enter to create, Esc cancel  )
                    (~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~)
```

**Specification:**

| Property            | Value                                              |
|---------------------|----------------------------------------------------|
| Position            | Horizontally centered, vertically centered         |
| Width               | 40 columns                                         |
| Border              | `"round"`, color: `"cyan"`                         |
| Title               | bold, white: "New Session"                         |
| Field labels        | bold, white                                        |
| Field input         | white text, dimColor placeholder                   |
| Active field        | cyan border highlight or underline                 |
| Inactive field      | gray                                               |
| Footer hint         | dimColor: "Tab switch  Enter create  Esc cancel"   |

**Fields:**

| Field     | Default Value | Validation                        | Placeholder            |
|-----------|---------------|-----------------------------------|------------------------|
| Name      | (empty)       | Required, alphanumeric + hyphens  | `session-name`         |
| Directory | `"."`         | Must be valid path                | `~/path/to/project`    |

**Behavior:**
- Tab cycles between fields
- Enter submits the form (both fields populated)
- Escape cancels and returns to navigation mode
- Validation errors shown in red below the field
- Name field is auto-focused on open

---

### 10.4 Confirmation Dialog

**Trigger:** Destructive actions (stop session, stop all)

**ASCII mockup:**

```
              +===================================+
              ||                                 ||
              ||  Stop session "frontend"?       ||
              ||                                 ||
              ||  This will send SIGTERM to the  ||
              ||  running process.               ||
              ||                                 ||
              ||          [y] Yes  [n] No        ||
              ||                                 ||
              +===================================+
```

**Specification:**

| Property            | Value                                              |
|---------------------|----------------------------------------------------|
| Position            | Centered                                           |
| Width               | 40 columns                                         |
| Border              | `"double"`, color: `"red"`                         |
| Title message       | bold, white                                        |
| Detail text         | dimColor                                           |
| Action keys         | `y` = confirm (bold green), `n` or Esc = cancel (bold red) |
| Default             | No (pressing Enter without y/n cancels)            |

**Confirmation messages per action:**

| Action          | Title                              | Detail                                        |
|-----------------|------------------------------------|-----------------------------------------------|
| Stop session    | `Stop session "{name}"?`           | `This will send SIGTERM to the running process.` |
| Stop all        | `Stop all {N} sessions?`           | `This will send SIGTERM to all running processes.` |
| Restart session | `Restart session "{name}"?`        | `This will stop and restart the session.`        |

---

## 11. Interaction Design

### Mode System

The TUI operates in one of four modes at any time:

1. **NAV (Navigation):** Default mode. Session list is focused. All navigation shortcuts are active.
2. **ATTACHED:** Attached to a session. Input bar is visible and focused. Only Escape exits.
3. **HELP:** Help overlay is displayed. Only Escape or `?` dismisses it.
4. **MENU:** Action menu is displayed. Arrow keys navigate, Enter selects, Escape dismisses.

Additionally, two sub-states exist as modal dialogs:

5. **DIALOG:CREATE:** Session creation form is displayed.
6. **DIALOG:CONFIRM:** Confirmation dialog is displayed.

---

## 12. State Machine & Mode Transitions

```
                    +-------+
                    | START |
                    +---+---+
                        |
                        v
               +--------+--------+
               |                 |
          +--->+      NAV        +<---+
          |    |  (default mode) |    |
          |    +---+---+---+----+    |
          |        |   |   |         |
          |   Enter|   |?  |:/Ctrl+P |
          |        v   v   v         |
          |  +-----++ ++-+ ++------+ |
          |  |ATTACH| |HELP| |MENU | |
          |  |ED    | |    | |     | |
          |  +--+---+ +-+--+ +-+---+ |
          |     |        |      |     |
          |  Esc|   Esc/?|  Esc |     |
          +-----+--------+------+     |
          |                           |
          |    n (from NAV or MENU)   |
          |        v                  |
          |  +-----+------+          |
          |  |DIALOG:      |          |
          |  |CREATE       |          |
          |  +------+------+          |
          |    Esc  |  Enter          |
          +---------+  (creates       |
                       session,       |
                       returns to NAV)|

     x/X/r (from NAV or MENU, if destructive)
              v
       +------+------+
       |DIALOG:      |
       |CONFIRM      |
       +------+------+
         y    |  n/Esc
         |    +---------> NAV
         v
     (execute action)
         |
         +--------------> NAV
```

### Transition Table

| From       | Trigger            | To              | Side Effect                       |
|------------|--------------------|-----------------|-----------------------------------|
| NAV        | Enter              | ATTACHED        | Attach to selected session        |
| NAV        | `?`                | HELP            | Show help overlay                 |
| NAV        | `:` or Ctrl+P     | MENU            | Show action menu                  |
| NAV        | `n`                | DIALOG:CREATE   | Show session creation form        |
| NAV        | `x`               | DIALOG:CONFIRM  | Show stop-session confirmation    |
| NAV        | `q` or Ctrl+C     | EXIT            | Quit the application              |
| ATTACHED   | Escape             | NAV             | Detach from session               |
| HELP       | Escape or `?`      | NAV             | Close help overlay                |
| MENU       | Escape or `:` or Ctrl+P | NAV        | Close action menu                 |
| MENU       | Enter              | varies          | Execute selected action           |
| MENU       | shortcut letter    | varies          | Execute that action directly      |
| DIALOG:CREATE | Escape          | NAV             | Cancel creation                   |
| DIALOG:CREATE | Enter           | NAV             | Create session, select it         |
| DIALOG:CONFIRM | `y`            | NAV             | Execute destructive action        |
| DIALOG:CONFIRM | `n` or Escape  | NAV             | Cancel                            |

---

## 13. Keyboard Shortcut Reference

### Navigation Mode (NAV)

| Key          | Action                              |
|--------------|-------------------------------------|
| `Up` / `k`   | Move selection up                  |
| `Down` / `j` | Move selection down                |
| `Tab`        | Next session (wraps)                |
| `Shift+Tab`  | Previous session (wraps)            |
| `Enter`      | Attach to selected session          |
| `n`          | New session dialog                  |
| `x`          | Stop selected session               |
| `X`          | Stop all sessions                   |
| `r`          | Restart selected session            |
| `d`          | Toggle expanded details             |
| `t`          | Toggle output timestamps            |
| `c`          | Clear output for selected session   |
| `:`          | Open action menu                    |
| `Ctrl+P`     | Open action menu                    |
| `?`          | Toggle help overlay                 |
| `q`          | Quit                                |
| `Ctrl+C`     | Quit                                |

### Attached Mode (ATTACHED)

| Key          | Action                              |
|--------------|-------------------------------------|
| `Escape`     | Detach, return to NAV               |
| `Enter`      | Send prompt                         |
| `Backspace`  | Delete character before cursor      |
| `Left`       | Move cursor left                    |
| `Right`      | Move cursor right                   |
| `Ctrl+A`     | Move cursor to start                |
| `Ctrl+E`     | Move cursor to end                  |
| `Ctrl+U`     | Clear from cursor to start          |
| `Ctrl+C`     | Clear entire input                  |

### Help Overlay (HELP)

| Key          | Action                              |
|--------------|-------------------------------------|
| `Escape`     | Close help                          |
| `?`          | Close help                          |

### Action Menu (MENU)

| Key          | Action                              |
|--------------|-------------------------------------|
| `Up` / `k`   | Move selection up                  |
| `Down` / `j` | Move selection down                |
| `Enter`      | Execute selected action             |
| `Escape`     | Close menu                          |
| `:`          | Close menu                          |
| `Ctrl+P`     | Close menu                          |
| `n`          | Direct: New Session                 |
| `x`          | Direct: Stop Session                |
| `X`          | Direct: Stop All                    |
| `r`          | Direct: Restart Session             |
| `c`          | Direct: Clear Output                |
| `t`          | Direct: Toggle Timestamps           |
| `d`          | Direct: Toggle Details              |

### Session Creation Dialog (DIALOG:CREATE)

| Key          | Action                              |
|--------------|-------------------------------------|
| `Tab`        | Move to next field                  |
| `Shift+Tab`  | Move to previous field              |
| `Enter`      | Submit form                         |
| `Escape`     | Cancel and close                    |
| (text input) | Type into active field              |

### Confirmation Dialog (DIALOG:CONFIRM)

| Key          | Action                              |
|--------------|-------------------------------------|
| `y`          | Confirm action                      |
| `n`          | Cancel                              |
| `Escape`     | Cancel                              |

---

## 14. Focus Management

### Rules

1. **Only one element receives keyboard input at a time.** The focused element is determined by the current mode.
2. **Focus order by mode:**
   - NAV: Session list pane
   - ATTACHED: Input bar
   - HELP: Help overlay (captures Esc and ?)
   - MENU: Action menu (captures arrows, Enter, Esc, shortcut letters)
   - DIALOG:CREATE: Form fields (Tab cycles between them)
   - DIALOG:CONFIRM: Confirmation prompt (y/n/Esc)
3. **Visual focus indicator:** The focused pane has a cyan border; unfocused panes have gray borders.
4. **Overlays capture all input.** When help, menu, or a dialog is open, no keys reach the panes beneath.
5. **Mode transitions always reset focus** to the default element for the target mode.

---

## 15. Responsive Behavior

### Minimum Terminal Size

- Width: 80 columns
- Height: 20 rows

Below these thresholds, display the existing "Terminal too small" warning.

### Narrow Terminals (80-99 columns)

- Session list pane: fixed 24 columns (not percentage-based)
- Output pane: remaining space
- Status bar: abbreviate shortcut descriptions (e.g., `Tab` nxt instead of `Tab` next session)
- Action menu: reduce width to 30 columns

### Standard Terminals (100-159 columns)

- Session list pane: 30% width
- Output pane: 70% width
- Full shortcut descriptions in status bar

### Wide Terminals (160+ columns)

- Session list pane: fixed 40 columns (no need to grow further)
- Output pane: remaining space
- Additional metadata in status bar (model, cost)

### Short Terminals (20-29 rows)

- Help overlay: scrollable with Up/Down
- Session details: collapse to single-line per session (name + status only, no expanded details)
- Output pane: reduce max visible lines accordingly

### Tall Terminals (30+ rows)

- Session details: always show 2-line expansion for selected session
- Output pane: natural content height

---

## 16. Implementation Notes

### TUI State Model Updates

The `TUIMode` type must be extended:

```typescript
export type TUIMode =
  | 'navigation'
  | 'attached'
  | 'help'
  | 'menu'
  | 'dialog:create'
  | 'dialog:confirm';
```

The `TUIState` interface must gain new fields:

```typescript
export interface TUIState {
  // ... existing fields ...

  /** Currently active mode */
  mode: TUIMode;

  /** Action menu state */
  menuSelectedIndex: number;

  /** Whether to show timestamps in output pane */
  showTimestamps: boolean;

  /** Whether to show expanded details for all sessions */
  showExpandedDetails: boolean;

  /** Session creation form state */
  createForm: {
    name: string;
    directory: string;
    activeField: 'name' | 'directory';
    error: string | null;
  } | null;

  /** Confirmation dialog state */
  confirmDialog: {
    action: 'stop' | 'stopAll' | 'restart';
    sessionName: string | null;
    message: string;
  } | null;
}
```

### Keybinding Architecture

The keybinding system should be restructured as a mode-aware dispatch table:

```typescript
type ModeBindings = Record<string, (state: TUIState) => KeyHandlerResult>;

const bindings: Record<TUIMode, ModeBindings> = {
  navigation: { /* NAV shortcuts */ },
  attached: { /* ATTACHED shortcuts */ },
  help: { /* HELP shortcuts */ },
  menu: { /* MENU shortcuts */ },
  'dialog:create': { /* form input handling */ },
  'dialog:confirm': { /* y/n/Esc handling */ },
};

export function handleKeypress(state: TUIState, key: string): KeyHandlerResult {
  const modeBindings = bindings[state.mode];
  const handler = modeBindings?.[key];
  if (handler) return handler(state);
  return state; // unhandled key
}
```

### Theme File

Create `src/tui/theme.ts` exporting all design tokens:

```typescript
export const COLORS = {
  primary: 'cyan',
  secondary: 'blue',
  accent: 'magenta',
  success: 'green',
  warning: 'yellow',
  error: 'red',
  muted: 'gray',
  text: 'white',
  inverse: 'black',
} as const;

export const STATUS_SYMBOLS = {
  running: { symbol: '\u25CF', color: COLORS.success },   // filled circle
  stopped: { symbol: '\u25CB', color: COLORS.muted },     // empty circle
  crashed: { symbol: '\u25B2', color: COLORS.error },     // triangle
  starting: { symbol: '\u25D0', color: COLORS.warning },  // half circle
} as const;

export const BORDERS = {
  pane: 'single',
  input: 'round',
  helpOverlay: 'double',
  actionMenu: 'round',
  createDialog: 'round',
  confirmDialog: 'double',
} as const;

export const SPACING = {
  PANE_PADDING_X: 1,
  PANE_PADDING_Y: 0,
  DETAIL_INDENT: 3,
  SHORTCUT_GAP: 2,
  OVERLAY_MARGIN_Y: 2,
  OVERLAY_MARGIN_X: 4,
  FORM_FIELD_GAP: 1,
} as const;
```

### Component Tree

```
TUIApp
  +-- Header
  +-- Body (flexDirection="row")
  |     +-- SessionListPane
  |     +-- OutputPane
  +-- InputBar (conditional: attached mode only)
  +-- StatusBar
  +-- HelpOverlay (conditional: help mode only)
  +-- ActionMenu (conditional: menu mode only)
  +-- SessionCreationDialog (conditional: dialog:create mode only)
  +-- ConfirmationDialog (conditional: dialog:confirm mode only)
```

Overlays render after the main layout in the JSX tree. In Ink, this means they will appear below the main content unless absolute positioning is used. Recommended approach: when an overlay is active, render it in place of the Body section (between Header and StatusBar), keeping the overall layout intact but replacing the pane content with the overlay content.

### New Callback Props for TUIApp

```typescript
export interface TUIAppProps {
  // ... existing props ...

  /** Callback when user creates a new session */
  onCreateSession?: (name: string, directory: string) => void;

  /** Callback when user stops a session */
  onStopSession?: (sessionName: string) => void;

  /** Callback when user stops all sessions */
  onStopAll?: () => void;

  /** Callback when user restarts a session */
  onRestartSession?: (sessionName: string) => void;

  /** Callback when user clears output */
  onClearOutput?: (sessionName: string) => void;
}
```

---

## Appendix A: Full Screen Mockup -- Navigation Mode

```
+---------------------------------------------------------------------+
|  * AgentSpawn v0.1.0                                    3 sessions  |
+-------------------------+-------------------------------------------+
| Sessions            3   | Output: frontend  ●  running      [END]  |
|                         |                                           |
| > frontend          ●   | > fix the authentication bug              |
|     ~/dev/frontend      |                                           |
|     PID 12345  23m      | * Bash(npm test)                          |
|                         | |   All 42 tests passed                   |
|   backend           ●   |                                           |
|   api               ○   | * Read(src/index.ts)                      |
|                         | |   Read 1 file (245 lines)               |
|                         |                                           |
|                         | Working on authentication module...       |
|                         |                                           |
|                         |                                           |
|                         |                                           |
|                         |                                           |
|                         |                                           |
+-------------------------+-------------------------------------------+
|  NAV  | Tab next  Enter attach  n new  ? help  : menu   | 3 sessions  v0.1.0 |
+---------------------------------------------------------------------+
```

## Appendix B: Full Screen Mockup -- Attached Mode

```
+---------------------------------------------------------------------+
|  * AgentSpawn v0.1.0                      ATTACHED:frontend  3 sessions |
+-------------------------+-------------------------------------------+
| Sessions            3   | Output: frontend  ●  running      [END]  |
|                         |                                           |
| > frontend          ●   | > fix the authentication bug              |
|     ~/dev/frontend      |                                           |
|     PID 12345  23m      | * Bash(npm test)                          |
|       ATTACHED          | |   All 42 tests passed                   |
|                         |                                           |
|   backend           ●   | * Read(src/index.ts)                      |
|   api               ○   | |   Read 1 file (245 lines)               |
|                         |                                           |
|                         | Working on authentication module...       |
|                         |                                           |
|                         |                                           |
|                         |                                           |
|                         |                                           |
+-------------------------+-------------------------------------------+
( frontend > hello world_                                    11/500   )
+---------------------------------------------------------------------+
|  ATTACHED  | Esc detach  Ctrl+C clear                    | 3 sessions  v0.1.0 |
+---------------------------------------------------------------------+
```

## Appendix C: Full Screen Mockup -- Help Overlay

```
+---------------------------------------------------------------------+
|  * AgentSpawn v0.1.0                                    3 sessions  |
+---------------------------------------------------------------------+
|                                                                     |
|   +=====================================================+          |
|   ||                                                   ||          |
|   ||              AgentSpawn Keyboard Shortcuts         ||          |
|   ||                                                   ||          |
|   ||  NAVIGATION                                       ||          |
|   ||  -----------------------------------------------  ||          |
|   ||  Up/Down, j/k     Move selection                  ||          |
|   ||  Tab               Next session                   ||          |
|   ||  Shift+Tab         Previous session               ||          |
|   ||  Enter             Attach to session              ||          |
|   ||  n                 New session                    ||          |
|   ||  x                 Stop session                   ||          |
|   ||  :  or  Ctrl+P     Open action menu              ||          |
|   ||  q                 Quit                           ||          |
|   ||                                                   ||          |
|   ||  ATTACHED MODE                                    ||          |
|   ||  -----------------------------------------------  ||          |
|   ||  Esc               Detach from session            ||          |
|   ||  Enter             Send prompt                    ||          |
|   ||  Ctrl+C            Clear input                    ||          |
|   ||                                                   ||          |
|   ||            Press Esc or ? to close                ||          |
|   +=====================================================+          |
|                                                                     |
+---------------------------------------------------------------------+
|  HELP  | Esc/? close                                    | 3 sessions  v0.1.0 |
+---------------------------------------------------------------------+
```

## Appendix D: Full Screen Mockup -- Action Menu

```
+---------------------------------------------------------------------+
|  * AgentSpawn v0.1.0                                    3 sessions  |
+-------------------------+-------------------------------------------+
| Sessions            3   | Output: frontend  ●  running      [END]  |
|                         |                                           |
| > frontend          ●   | > fix the authentication bug              |
|     ~/dev/frontend      |                                           |
|     PID 12345  23m   (~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~)              |
|                      (  Actions                      )              |
|   backend           (                               )               |
|   api               (  > New Session           n    )               |
|                      (    Stop Session          x    )              |
|                      (    Stop All Sessions     X    )              |
|                      (    Restart Session       r    )              |
|                      (    Clear Output          c    )              |
|                      (    Toggle Timestamps     t    )              |
|                      (    Toggle Details        d    )              |
|                      (                               )              |
|                      (  Up/Down navigate             )              |
|                      (  Enter select, Esc close      )              |
|                      (~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~)              |
+-------------------------+-------------------------------------------+
|  MENU  | Up/Down navigate  Enter select  Esc close   | 3 sessions  v0.1.0 |
+---------------------------------------------------------------------+
```

## Appendix E: Full Screen Mockup -- Session Creation Dialog

```
+---------------------------------------------------------------------+
|  * AgentSpawn v0.1.0                                    3 sessions  |
+-------------------------+-------------------------------------------+
| Sessions            3   | Output: frontend  ●  running      [END]  |
|                         |                                           |
| > frontend          ●   |                                           |
|     ~/dev/frontend      |                                           |
|     PID 12345  23m      |  (~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~)       |
|                         |  (  New Session                  )       |
|   backend           ●   |  (                               )       |
|   api               ○   |  (  Name:                        )       |
|                         |  (  [my-session             ]    )       |
|                         |  (                               )       |
|                         |  (  Directory:                   )       |
|                         |  (  [.                       ]    )       |
|                         |  (                               )       |
|                         |  (  Tab switch  Enter create     )       |
|                         |  (  Esc cancel                   )       |
|                         |  (~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~)       |
|                         |                                           |
+-------------------------+-------------------------------------------+
|  NAV  | Tab next  Enter attach  n new  ? help  : menu   | 3 sessions  v0.1.0 |
+---------------------------------------------------------------------+
```

## Appendix F: Full Screen Mockup -- Confirmation Dialog

```
+---------------------------------------------------------------------+
|  * AgentSpawn v0.1.0                                    3 sessions  |
+-------------------------+-------------------------------------------+
| Sessions            3   | Output: frontend  ●  running      [END]  |
|                         |                                           |
| > frontend          ●   |                                           |
|     ~/dev/frontend      |                                           |
|     PID 12345  23m      |                                           |
|                         |   +===================================+   |
|   backend           ●   |   ||                                 ||   |
|   api               ○   |   ||  Stop session "frontend"?       ||   |
|                         |   ||                                 ||   |
|                         |   ||  This will send SIGTERM to the  ||   |
|                         |   ||  running process.               ||   |
|                         |   ||                                 ||   |
|                         |   ||          [y] Yes  [n] No        ||   |
|                         |   ||                                 ||   |
|                         |   +===================================+   |
|                         |                                           |
+-------------------------+-------------------------------------------+
|  NAV  | y confirm  n cancel                              | 3 sessions  v0.1.0 |
+---------------------------------------------------------------------+
```

---

**End of Specification**

This document is intended as the single source of truth for the TUI redesign implementation. All visual decisions, interaction patterns, component structures, and keyboard shortcuts are defined here. TUI developers should implement directly from this spec without needing to make design decisions.
