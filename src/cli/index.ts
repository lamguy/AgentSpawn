import { Command } from 'commander';
import { SessionManager } from '../core/manager.js';
import { Router } from '../io/router.js';
import { WorkspaceManager } from '../core/workspace.js';
import { TemplateManager } from '../core/template.js';
import { HistoryStore } from '../core/history.js';
import { DEFAULT_CONFIG } from '../config/defaults.js';
import { registerStartCommand } from './commands/start.js';
import { registerStopCommand } from './commands/stop.js';
import { registerListCommand } from './commands/list.js';
import { registerExecCommand } from './commands/exec.js';
import { registerSwitchCommand } from './commands/switch.js';
import { registerTUICommand } from './commands/tui.js';
import { registerWorkspaceCommand } from './commands/workspace.js';
import { registerHistoryCommand } from './commands/history.js';
import { registerTemplateCommand } from './commands/template.js';
import { registerExportCommand } from './commands/export.js';
import { registerStatsCommand } from './commands/stats.js';
import { registerPipeCommand } from './commands/pipe.js';
import { registerWebCommand } from './commands/web.js';
import { registerRemoteCommand } from './commands/remote.js';
import { registerSandboxCommand } from './commands/sandbox.js';
import { RemoteManager } from '../core/remote.js';

export const program: Command = new Command()
  .name('agentspawn')
  .version('0.1.0')
  .description('Manage multiple Claude Code instances');

export async function run(argv: string[]): Promise<void> {
  const historyStore = new HistoryStore(DEFAULT_CONFIG.historyDir!);
  const manager = new SessionManager({
    registryPath: DEFAULT_CONFIG.registryPath,
    shutdownTimeoutMs: DEFAULT_CONFIG.shutdownTimeoutMs,
    historyStore,
  });
  const router = new Router();

  const workspaceManager = new WorkspaceManager(
    DEFAULT_CONFIG.workspacesPath!,
  );

  const templateManager = new TemplateManager(
    DEFAULT_CONFIG.templatesPath!,
  );

  const remoteManager = new RemoteManager(DEFAULT_CONFIG.remotesPath!);

  await manager.init();

  registerStartCommand(program, manager, router, templateManager);
  registerStopCommand(program, manager, router);
  registerListCommand(program, manager, router, remoteManager);
  registerExecCommand(program, manager, router, workspaceManager, historyStore);
  registerSwitchCommand(program, manager, router);
  registerTUICommand(program, manager, router, historyStore, templateManager);
  registerWorkspaceCommand(program, manager, router, workspaceManager);
  registerHistoryCommand(program, manager, historyStore);
  registerTemplateCommand(program, templateManager, manager);
  registerExportCommand(program, historyStore);
  registerStatsCommand(program, manager);
  registerPipeCommand(program, manager);
  registerWebCommand(program, manager, historyStore);
  registerRemoteCommand(program, remoteManager);
  registerSandboxCommand(program, manager);

  await program.parseAsync(argv);
}
