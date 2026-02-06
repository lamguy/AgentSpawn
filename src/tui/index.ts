import { render } from 'ink';
import React from 'react';
import type { SessionManager } from '../core/manager.js';
import type { Router } from '../io/router.js';
import { SessionManagerAdapter, RouterAdapter } from './adapters.js';
import { OutputCapture } from './output-capture.js';
import type { TUIOptions, TUIState } from './types.js';
import { SessionState } from '../types.js';
import { TUIApp } from './components/TUIApp.js';

/**
 * TUI instance — manages render loop, state updates, and cleanup.
 */
export class TUI {
  private state: TUIState;
  private renderInstance: ReturnType<typeof render> | null = null;
  private updateInterval: NodeJS.Timeout | null = null;
  private resizeHandler: (() => void) | null = null;
  private rawInputHandler: ((data: Buffer) => void) | null = null;

  constructor(
    private readonly manager: SessionManager,
    private readonly router: Router,
    private readonly managerAdapter: SessionManagerAdapter,
    private readonly routerAdapter: RouterAdapter,
    private readonly outputCapture: OutputCapture,
    private readonly options?: TUIOptions,
  ) {
    // Initialize state
    const attachedSessionName = routerAdapter.getActiveSession() ?? null;
    this.state = {
      sessions: managerAdapter.getSessions(),
      selectedSessionName: options?.initialSession ?? null,
      attachedSessionName,
      outputLines: [],
      isShuttingDown: false,
      mode: attachedSessionName ? 'attached' : 'navigation',
    };
  }

  /**
   * Launch the TUI.
   */
  start(): void {
    // Set up raw input handler for stdin forwarding in attached mode
    this.rawInputHandler = (data: Buffer): void => {
      // Only forward input if we're in attached mode
      if (this.state.mode === 'attached' && this.state.attachedSessionName) {
        const session = this.manager.getSession(this.state.attachedSessionName);

        if (session) {
          const handle = session.getHandle();

          if (handle && handle.stdin && !handle.stdin.destroyed) {
            try {
              handle.stdin.write(data);
            } catch (err) {
              // Stdin write failed, detach gracefully
              process.stderr.write(
                `Failed to write to session "${this.state.attachedSessionName}": ${err}\n`,
              );
              this.detachFromSession();
            }
          }
        }
      }
    };

    // Render the app with keyboard handling and exit callback
    this.renderInstance = render(
      React.createElement(TUIApp, {
        initialState: this.state,
        onStateChange: (newState: TUIState) => {
          // Detect mode transitions and handle router attach/detach
          const oldMode = this.state.mode;
          const newMode = newState.mode;

          // Sync external state updates from TUIApp
          this.state = newState;

          // Handle mode transitions
          if (oldMode !== newMode) {
            if (newMode === 'attached' && newState.attachedSessionName) {
              // Transition to attached mode
              this.attachToSession(newState.attachedSessionName);
            } else if (newMode === 'navigation' && oldMode === 'attached') {
              // Transition to navigation mode
              this.detachFromSession();
            }
          }
        },
        onExit: () => {
          // Handle quit signal from keyboard
          this.stop();
          process.exit(0);
        },
        onRawInput: (data: Buffer) => {
          // Forward raw input in attached mode
          if (this.rawInputHandler) {
            this.rawInputHandler(data);
          }
        },
      }),
    );

    // Set up periodic state updates (poll for changes)
    this.updateInterval = setInterval(() => {
      this.updateState();
    }, 500); // Update every 500ms

    // Handle terminal resize events
    this.resizeHandler = (): void => {
      this.forceRerender();
    };
    process.stdout.on('resize', this.resizeHandler);
  }

  /**
   * Stop the TUI and clean up resources.
   */
  stop(): void {
    this.state.isShuttingDown = true;

    // Detach from any attached session before cleanup
    if (this.state.mode === 'attached') {
      this.detachFromSession();
    }

    // Clear update interval
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    // Remove resize handler
    if (this.resizeHandler) {
      process.stdout.removeListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }

    // Clear raw input handler
    this.rawInputHandler = null;

    // Unmount render instance
    if (this.renderInstance) {
      this.renderInstance.unmount();
      this.renderInstance = null;
    }
  }

  /**
   * Update TUI state from adapters.
   */
  private updateState(): void {
    const sessions = this.managerAdapter.getSessions();
    const attachedSessionName = this.routerAdapter.getActiveSession() ?? null;
    const oldMode = this.state.mode;

    // Update sessions
    this.state.sessions = sessions;
    this.state.attachedSessionName = attachedSessionName;

    // Sync mode with attachment state
    // If router detached externally, switch back to navigation mode
    if (!attachedSessionName && this.state.mode === 'attached') {
      this.state.mode = 'navigation';

      // Mode transition detected: attached -> navigation
      if (oldMode === 'attached') {
        // Router was detached externally, no need to call detach again
      }
    }
    // If router attached externally, switch to attached mode
    if (attachedSessionName && this.state.mode === 'navigation') {
      this.state.mode = 'attached';

      // Mode transition detected: navigation -> attached
      if (oldMode === 'navigation') {
        // Router was attached externally, no need to call attach again
      }
    }

    // Auto-select first session if none selected
    if (!this.state.selectedSessionName && sessions.length > 0) {
      this.state.selectedSessionName = sessions[0].name;
    }

    // Update output lines for selected session
    if (this.state.selectedSessionName) {
      const lines = this.outputCapture.getLines(this.state.selectedSessionName);
      this.state.outputLines = lines.map((line) => line.text);
    } else {
      this.state.outputLines = [];
    }

    // Trigger re-render
    this.forceRerender();
  }

  /**
   * Force a re-render with current state.
   */
  private forceRerender(): void {
    if (this.renderInstance && !this.state.isShuttingDown) {
      this.renderInstance.rerender(
        React.createElement(TUIApp, {
          initialState: this.state,
          onStateChange: (newState: TUIState) => {
            // Detect mode transitions and handle router attach/detach
            const oldMode = this.state.mode;
            const newMode = newState.mode;

            // Sync external state updates from TUIApp
            this.state = newState;

            // Handle mode transitions
            if (oldMode !== newMode) {
              if (newMode === 'attached' && newState.attachedSessionName) {
                // Transition to attached mode
                this.attachToSession(newState.attachedSessionName);
              } else if (newMode === 'navigation' && oldMode === 'attached') {
                // Transition to navigation mode
                this.detachFromSession();
              }
            }
          },
          onExit: () => {
            this.stop();
            process.exit(0);
          },
          onRawInput: (data: Buffer) => {
            // Forward raw input in attached mode
            if (this.rawInputHandler) {
              this.rawInputHandler(data);
            }
          },
        }),
      );
    }
  }

  /**
   * Attach to a session via the router.
   * This is called when the TUI transitions to attached mode.
   *
   * NOTE: We don't use router.attach() directly because that manages its own
   * stdin/stdout piping which conflicts with Ink's rendering. Instead, we only
   * use the router to track which session is attached, and we handle stdin
   * forwarding directly via the rawInputHandler.
   *
   * @param sessionName - The name of the session to attach to
   */
  private attachToSession(sessionName: string): void {
    try {
      const session = this.manager.getSession(sessionName);
      if (!session) {
        process.stderr.write(`Cannot attach: session "${sessionName}" not found.\n`);
        // Revert to navigation mode
        this.state.mode = 'navigation';
        this.state.attachedSessionName = null;
        this.forceRerender();
        return;
      }

      const handle = session.getHandle();
      if (!handle) {
        process.stderr.write(
          `Cannot attach: session "${sessionName}" is not running.\n`,
        );
        // Revert to navigation mode
        this.state.mode = 'navigation';
        this.state.attachedSessionName = null;
        this.forceRerender();
        return;
      }

      // In TUI mode, we DON'T call router.attach() because that would
      // set up its own stdin/stdout piping which conflicts with Ink.
      // Instead, we just track the attachment ourselves and forward
      // stdin manually via rawInputHandler.

      // Note: If we add a tuiMode option to Router in the future, we would call:
      // this.router.attach(session, { tuiMode: true });
    } catch (err) {
      process.stderr.write(`Failed to attach to session "${sessionName}": ${err}\n`);
      // Revert to navigation mode
      this.state.mode = 'navigation';
      this.state.attachedSessionName = null;
      this.forceRerender();
    }
  }

  /**
   * Detach from the currently attached session.
   * This is called when the TUI transitions to navigation mode.
   */
  private detachFromSession(): void {
    // In TUI mode, we don't actually call router.detach() because we never
    // called router.attach() in the first place. We just clear our local
    // attachment tracking.

    // If we were using router.attach() with tuiMode, we would call:
    // if (this.routerAdapter.getActiveSession()) {
    //   this.router.detach();
    // }

    // For now, just clear the attachment in state
    this.state.attachedSessionName = null;
    this.state.mode = 'navigation';
  }
}

/**
 * Launch the TUI for AgentSpawn.
 *
 * @param manager - The SessionManager instance
 * @param router - The Router instance
 * @param options - Optional TUI configuration
 * @returns A TUI instance
 */
export function launchTUI(
  manager: SessionManager,
  router: Router,
  options?: TUIOptions,
): TUI {
  // Create adapters
  const managerAdapter = new SessionManagerAdapter(manager);
  const routerAdapter = new RouterAdapter(router);

  // Create output capture
  const outputCapture = new OutputCapture({
    maxLinesPerSession: 1000,
    captureStderr: true,
  });

  // Capture output from all running sessions
  const sessions = manager.listSessions();
  for (const sessionInfo of sessions) {
    if (sessionInfo.state === SessionState.Running) {
      const session = manager.getSession(sessionInfo.name);
      if (session) {
        outputCapture.captureSession(sessionInfo.name, session);
      }
    }
  }

  // Create and start TUI
  const tui = new TUI(
    manager,
    router,
    managerAdapter,
    routerAdapter,
    outputCapture,
    options,
  );
  tui.start();

  return tui;
}
