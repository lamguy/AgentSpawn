import { render } from 'ink';
import React from 'react';
import type { SessionManager } from '../core/manager.js';
import { RegistryWatcher } from '../core/registry-watcher.js';
import type { HistoryStore } from '../core/history.js';
import type { TemplateManager } from '../core/template.js';
import type { Router } from '../io/router.js';
import { logger } from '../utils/logger.js';
import { SessionManagerAdapter, RouterAdapter } from './adapters.js';
import { OutputCapture } from './output-capture.js';
import type { TUIOptions, TUIState, TUIAction, StatusMessage, HistorySearchOverlayState, OutputLine } from './types.js';
import { TUIApp } from './components/TUIApp.js';
import { type KeybindingConfig, DEFAULT_KEYBINDINGS, loadKeybindings } from '../config/keybindings.js';
import type { RemotePoller, RemoteSessionsEvent, RemoteErrorEvent } from './remote-poller.js';

/** How long status messages persist before auto-clearing (ms). */
const STATUS_MESSAGE_TTL = 5000;

/**
 * TUI instance — manages render loop, state updates, and cleanup.
 */
export class TUI {
  private state: TUIState;
  private renderInstance: ReturnType<typeof render> | null = null;
  private registryWatcher: RegistryWatcher | null = null;
  private resizeHandler: (() => void) | null = null;
  private keybindings: Required<KeybindingConfig> = DEFAULT_KEYBINDINGS;

  constructor(
    private readonly manager: SessionManager,
    private readonly router: Router,
    private readonly managerAdapter: SessionManagerAdapter,
    private readonly routerAdapter: RouterAdapter,
    private readonly outputCapture: OutputCapture,
    private readonly historyStore: HistoryStore | null,
    private readonly templateManager: TemplateManager | null,
    private readonly options?: TUIOptions,
    private readonly remotePoller?: RemotePoller,
  ) {
    const attachedSessionName = routerAdapter.getActiveSession() ?? null;
    this.state = {
      sessions: managerAdapter.getSessions(),
      selectedSessionName: options?.initialSession ?? null,
      attachedSessionName,
      outputLines: [],
      isShuttingDown: false,
      isProcessing: false,
      mode: attachedSessionName ? 'attached' : 'navigation',
      overlayStack: [],
      statusMessage: null,
      splitMode: false,
      splitPaneSessions: [null, null],
      activePaneIndex: 0,
      splitOutputLines: new Map(),
      remoteSessions: [],
      remoteErrors: [],
    };
  }

  /**
   * Build the common TUIApp props (shared between start() and forceRerender()).
   */
  private buildAppProps() {
    return {
      initialState: this.state,
      isProcessing: this.state.isProcessing,
      keybindings: this.keybindings,
      onStateChange: (newState: TUIState) => {
        const oldMode = this.state.mode;
        const newMode = newState.mode;
        const oldSplitPanes = this.state.splitPaneSessions;
        this.state = newState;

        if (oldMode !== newMode) {
          if (newMode === 'attached' && newState.attachedSessionName) {
            this.attachToSession(newState.attachedSessionName);
          } else if (newMode === 'navigation' && oldMode === 'attached') {
            this.detachFromSession();
          }
        }

        // When split pane assignments change, ensure output is captured for new sessions
        if (newState.splitMode) {
          for (let i = 0; i < 2; i++) {
            const sessionName = newState.splitPaneSessions[i];
            if (sessionName && sessionName !== oldSplitPanes[i]) {
              this.ensureSession(sessionName).then((session) => {
                if (session) {
                  this.outputCapture.captureSession(sessionName, session);
                }
              }).catch(() => {
                // Non-fatal: output just won't be captured for this session
              });
            }
          }
        }
      },
      onExit: () => {
        this.stop();
        process.exit(0);
      },
      onSendPrompt: (sessionName: string, prompt: string) => {
        this.handleSendPrompt(sessionName, prompt);
      },
      onAction: (action: TUIAction) => {
        this.executeAction(action);
      },
    };
  }

  /**
   * Launch the TUI.
   */
  start(): void {
    this.renderInstance = render(
      React.createElement(TUIApp, this.buildAppProps()),
    );

    // Load keybindings from disk asynchronously; re-render once loaded
    loadKeybindings().then((kb) => {
      this.keybindings = kb;
      this.forceRerender();
    }).catch(() => {
      // Silently keep defaults if loading fails
    });

    // Watch registry for changes instead of fixed-interval polling
    this.registryWatcher = new RegistryWatcher({
      registryPath: this.manager.registry.getFilePath(),
    });
    this.registryWatcher.watch(() => {
      this.updateState();
    });

    // Handle terminal resize
    this.resizeHandler = (): void => {
      this.forceRerender();
    };
    process.stdout.on('resize', this.resizeHandler);

    // Start remote polling if a poller was provided
    if (this.remotePoller) {
      this.remotePoller.on('sessions', (event: RemoteSessionsEvent) => {
        // Replace all entries for this alias with fresh data
        const other = this.state.remoteSessions.filter(
          (s) => s.remoteAlias !== event.alias,
        );
        this.state.remoteSessions = [...other, ...event.sessions];

        // Clear any existing error for this alias (it's now reachable)
        this.state.remoteErrors = this.state.remoteErrors.filter(
          (e) => e.alias !== event.alias,
        );

        this.forceRerender();
      });

      this.remotePoller.on('remoteError', (event: RemoteErrorEvent) => {
        // Drop stale sessions for this alias when it becomes unreachable
        this.state.remoteSessions = this.state.remoteSessions.filter(
          (s) => s.remoteAlias !== event.alias,
        );

        // Upsert the error entry
        const without = this.state.remoteErrors.filter(
          (e) => e.alias !== event.alias,
        );
        this.state.remoteErrors = [
          ...without,
          { alias: event.alias, error: event.error },
        ];

        this.forceRerender();
      });

      this.remotePoller.start();
    }
  }

  /**
   * Stop the TUI and clean up resources.
   */
  stop(): void {
    this.state.isShuttingDown = true;

    if (this.registryWatcher) {
      this.registryWatcher.unwatch();
      this.registryWatcher = null;
    }

    if (this.resizeHandler) {
      process.stdout.removeListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }

    if (this.renderInstance) {
      this.renderInstance.unmount();
      this.renderInstance = null;
    }

    // Stop remote poller and close all tunnels
    if (this.remotePoller) {
      this.remotePoller.stop().catch(() => {
        // Non-fatal — tunnels may already be closed
      });
    }
  }

  /**
   * Update TUI state from adapters.
   */
  private updateState(): void {
    // Re-read disk registry to discover sessions started by other processes
    this.manager.refreshRegistry().catch(() => {
      // Ignore registry read errors — stale data is acceptable
    });

    const sessions = this.managerAdapter.getSessions();
    this.state.sessions = sessions;

    // Auto-select first session if none selected
    if (!this.state.selectedSessionName && sessions.length > 0) {
      this.state.selectedSessionName = sessions[0].name;
    }

    // Update output lines — in attached mode, show attached session's output;
    // otherwise show selected session's output
    const outputSessionName =
      this.state.mode === 'attached' && this.state.attachedSessionName
        ? this.state.attachedSessionName
        : this.state.selectedSessionName;

    if (outputSessionName) {
      this.state.outputLines = this.outputCapture.getLines(outputSessionName);
    } else {
      this.state.outputLines = [];
    }

    // Update split-pane output if split mode is active
    if (this.state.splitMode) {
      const splitMap = new Map<string, OutputLine[]>();
      for (const sessionName of this.state.splitPaneSessions) {
        if (sessionName) {
          splitMap.set(sessionName, this.outputCapture.getLines(sessionName));
        }
      }
      this.state.splitOutputLines = splitMap;
    }

    // Auto-clear expired status messages
    if (this.state.statusMessage && Date.now() > this.state.statusMessage.expiresAt) {
      this.state.statusMessage = null;
    }

    this.forceRerender();
  }

  /**
   * Force a re-render with current state.
   */
  private forceRerender(): void {
    if (this.renderInstance && !this.state.isShuttingDown) {
      this.renderInstance.rerender(
        React.createElement(TUIApp, this.buildAppProps()),
      );
    }
  }

  /**
   * Execute a TUI action (async side effect from keybinding handlers).
   */
  private executeAction(action: TUIAction): void {
    switch (action.kind) {
      case 'create-session':
        this.handleCreateSession(action.name, action.directory, action.permissionMode);
        break;
      case 'create-session-from-template':
        this.handleCreateSessionFromTemplate(action.name, action.templateName, action.directory, action.permissionMode);
        break;
      case 'stop-session':
        this.handleStopSession(action.sessionName);
        break;
      case 'restart-session':
        this.handleRestartSession(action.sessionName);
        break;
      case 'stop-all':
        this.handleStopAll();
        break;
      case 'send-prompt':
        this.handleSendPrompt(action.sessionName, action.prompt);
        break;
      case 'history-search-load':
        this.handleHistorySearchLoad(action.sessionName, action.query);
        break;
      case 'history-insert':
        this.handleHistoryInsert(action.prompt);
        break;
    }
  }

  /**
   * Create a new session from the session-creation overlay.
   */
  private async handleCreateSession(name: string, directory: string, permissionMode: string, env?: Record<string, string>): Promise<void> {
    try {
      const session = await this.manager.startSession({
        name,
        workingDirectory: directory || process.cwd(),
        permissionMode: permissionMode || 'bypassPermissions',
        env,
      });
      this.outputCapture.captureSession(name, session);

      // Pop the session-creation overlay, select the new session
      this.state.overlayStack = [];
      this.state.selectedSessionName = name;
      this.setStatusMessage(`Session "${name}" created`, 'success');
      this.registryWatcher?.notifyWrite();
      this.forceRerender();
    } catch (err) {
      // Show error in the session-creation overlay
      const top = this.state.overlayStack[this.state.overlayStack.length - 1];
      if (top?.kind === 'session-creation') {
        const message = err instanceof Error ? err.message : 'Failed to create session';
        this.state.overlayStack = [
          ...this.state.overlayStack.slice(0, -1),
          {
            ...top,
            isSubmitting: false,
            errors: { ...top.errors, name: message },
          },
        ];
      } else {
        this.setStatusMessage(
          err instanceof Error ? err.message : 'Failed to create session',
          'error',
        );
      }
      this.forceRerender();
    }
  }

  /**
   * Create a new session from a template, merging template values with form fields.
   * Form fields override template values when non-empty/non-default.
   */
  private async handleCreateSessionFromTemplate(
    name: string,
    templateName: string,
    directory: string,
    permissionMode: string,
  ): Promise<void> {
    if (!this.templateManager) {
      this.setStatusMessage('Template manager not available', 'error');
      this.forceRerender();
      return;
    }

    try {
      const template = await this.templateManager.get(templateName);

      // Merge: form fields override template values when non-empty/non-default
      const mergedDirectory = (directory && directory !== '.') ? directory : (template.workingDirectory ?? '.');
      const mergedPermissionMode = (permissionMode && permissionMode !== 'bypassPermissions')
        ? permissionMode
        : (template.permissionMode ?? 'bypassPermissions');

      await this.handleCreateSession(name, mergedDirectory, mergedPermissionMode, template.env);
    } catch (err) {
      const message = err instanceof Error ? err.message : `Template "${templateName}" not found`;
      this.setStatusMessage(message, 'error');
      this.forceRerender();
    }
  }

  /**
   * Stop a session.
   */
  private async handleStopSession(sessionName: string): Promise<void> {
    try {
      await this.manager.stopSession(sessionName);
      this.setStatusMessage(`Session "${sessionName}" stopped`, 'success');
      this.registryWatcher?.notifyWrite();
    } catch (err) {
      this.setStatusMessage(
        err instanceof Error ? err.message : `Failed to stop "${sessionName}"`,
        'error',
      );
    }
    this.forceRerender();
  }

  /**
   * Restart a session (stop then start with same config).
   */
  private async handleRestartSession(sessionName: string): Promise<void> {
    try {
      // Get session info before stopping
      const info = this.manager.getSession(sessionName)?.getInfo();
      const workingDirectory = info?.workingDirectory ?? process.cwd();
      const permissionMode = info?.permissionMode ?? 'bypassPermissions';

      await this.manager.stopSession(sessionName);

      const session = await this.manager.startSession({
        name: sessionName,
        workingDirectory,
        permissionMode,
      });
      this.outputCapture.captureSession(sessionName, session);
      this.setStatusMessage(`Session "${sessionName}" restarted`, 'success');
      this.registryWatcher?.notifyWrite();
    } catch (err) {
      this.setStatusMessage(
        err instanceof Error ? err.message : `Failed to restart "${sessionName}"`,
        'error',
      );
    }
    this.forceRerender();
  }

  /**
   * Stop all sessions.
   */
  private async handleStopAll(): Promise<void> {
    try {
      await this.manager.stopAll();
      this.setStatusMessage('All sessions stopped', 'success');
      this.registryWatcher?.notifyWrite();
    } catch (err) {
      this.setStatusMessage(
        err instanceof Error ? err.message : 'Failed to stop all sessions',
        'error',
      );
    }
    this.forceRerender();
  }

  /**
   * Handle history search: query the HistoryStore and update overlay results.
   */
  private async handleHistorySearchLoad(sessionName: string | undefined, query: string): Promise<void> {
    if (!this.historyStore) {
      // No history store available — clear loading state
      const top = this.state.overlayStack[this.state.overlayStack.length - 1];
      if (top?.kind === 'history-search') {
        this.state.overlayStack = [
          ...this.state.overlayStack.slice(0, -1),
          { ...top, isLoading: false, results: [] },
        ];
      }
      this.forceRerender();
      return;
    }

    try {
      const results = query.length > 0
        ? await this.historyStore.search(query, { sessionName, limit: 50 })
        : [];

      const top = this.state.overlayStack[this.state.overlayStack.length - 1];
      if (top?.kind === 'history-search') {
        this.state.overlayStack = [
          ...this.state.overlayStack.slice(0, -1),
          {
            ...top,
            results,
            isLoading: false,
            selectedIndex: 0,
          } satisfies HistorySearchOverlayState,
        ];
      }
    } catch (err) {
      logger.warn(`History search failed: ${err instanceof Error ? err.message : String(err)}`);
      const top = this.state.overlayStack[this.state.overlayStack.length - 1];
      if (top?.kind === 'history-search') {
        this.state.overlayStack = [
          ...this.state.overlayStack.slice(0, -1),
          { ...top, isLoading: false, results: [] },
        ];
      }
    }

    this.forceRerender();
  }

  /**
   * Handle history insert: set pendingInput so InputBar picks it up.
   */
  private handleHistoryInsert(prompt: string): void {
    this.state.pendingInput = prompt;
    this.forceRerender();
  }

  /**
   * Set a transient status message that auto-clears.
   */
  private setStatusMessage(text: string, level: StatusMessage['level']): void {
    this.state.statusMessage = {
      text,
      level,
      expiresAt: Date.now() + STATUS_MESSAGE_TTL,
    };
  }

  /**
   * Enter attached mode for a session. TUI stays rendered.
   */
  private attachToSession(sessionName: string): void {
    // Adopt session if not in memory (started by another process)
    this.ensureSession(sessionName).then((session) => {
      if (session) {
        this.outputCapture.captureSession(sessionName, session);
      }
    }).catch(() => {
      // If adoption fails, revert to navigation
      this.state.mode = 'navigation';
      this.state.attachedSessionName = null;
      this.setStatusMessage(`Failed to attach to "${sessionName}"`, 'error');
      this.forceRerender();
    });
  }

  /**
   * Exit attached mode, return to navigation.
   */
  private detachFromSession(): void {
    this.state.attachedSessionName = null;
    this.state.mode = 'navigation';
    this.state.isProcessing = false;
  }

  /**
   * Handle a prompt submission from the InputBar.
   */
  private async handleSendPrompt(sessionName: string, prompt: string): Promise<void> {
    const session = await this.ensureSession(sessionName);
    if (!session) {
      this.outputCapture.appendLine(sessionName, 'Error: Session not found', true);
      this.forceRerender();
      return;
    }

    // Set processing state
    this.state.isProcessing = true;
    this.forceRerender();

    try {
      await session.sendPrompt(prompt);
    } catch {
      // Error already emitted by session and captured by OutputCapture
    } finally {
      this.state.isProcessing = false;
      this.forceRerender();
    }
  }

  /**
   * Get or adopt a session by name.
   */
  private async ensureSession(sessionName: string) {
    let session = this.manager.getSession(sessionName);
    if (!session) {
      try {
        session = await this.manager.adoptSession(sessionName);
        this.outputCapture.captureSession(sessionName, session);
      } catch {
        return null;
      }
    }
    return session;
  }
}

/**
 * Launch the TUI for AgentSpawn.
 */
export function launchTUI(
  manager: SessionManager,
  router: Router,
  options?: TUIOptions & { historyStore?: HistoryStore; templateManager?: TemplateManager; remotePoller?: RemotePoller },
): TUI {
  const managerAdapter = new SessionManagerAdapter(manager);
  const routerAdapter = new RouterAdapter(router);

  const outputCapture = new OutputCapture({
    maxLinesPerSession: 1000,
    maxTotalLines: 10000,
    maxLineLength: 10000,
  }, logger);

  const tui = new TUI(
    manager,
    router,
    managerAdapter,
    routerAdapter,
    outputCapture,
    options?.historyStore ?? null,
    options?.templateManager ?? null,
    options,
    options?.remotePoller,
  );
  tui.start();

  return tui;
}
