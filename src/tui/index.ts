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
      // Call router.detach() if attached
      if (this.routerAdapter.getActiveSession()) {
        this.router.detach();
      }
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

    // Unmount render instance (only if still mounted)
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
        }),
      );
    }
  }

  /**
   * Attach to a session by unmounting the TUI and giving the session direct terminal control.
   * This is called when the TUI transitions to attached mode.
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

      // Step 1: Unmount Ink TUI to release terminal control
      if (this.renderInstance) {
        this.renderInstance.unmount();
        this.renderInstance = null;
      }

      // Step 2: Clear update interval (no need to poll while attached)
      if (this.updateInterval) {
        clearInterval(this.updateInterval);
        this.updateInterval = null;
      }

      // Step 3: Call router.attach() to forward session I/O to terminal
      // When user presses Escape, router will call our callback to detach
      this.router.attach(session, {
        onDetachRequest: () => {
          // User pressed Escape - detach and restore TUI
          this.detachFromSession();
        }
      });
    } catch (err) {
      process.stderr.write(`Failed to attach to session "${sessionName}": ${err}\n`);
      // Revert to navigation mode
      this.state.mode = 'navigation';
      this.state.attachedSessionName = null;
      this.forceRerender();
    }
  }

  /**
   * Detach from the currently attached session and restore the TUI.
   * This is called when the user presses Escape in attached mode.
   */
  private detachFromSession(): void {
    // Step 1: Detach from router (restores TTY state, removes listeners)
    if (this.routerAdapter.getActiveSession()) {
      this.router.detach();
    }

    // Step 2: Update state
    this.state.attachedSessionName = null;
    this.state.mode = 'navigation';

    // Step 3: Restart update interval
    this.updateInterval = setInterval(() => {
      this.updateState();
    }, 500);

    // Step 4: Re-render Ink TUI
    this.start();
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
