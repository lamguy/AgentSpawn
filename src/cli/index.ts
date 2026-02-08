import { Command } from 'commander';
import { SessionManager } from '../core/manager.js';
import { Router } from '../io/router.js';
import { WorkspaceManager } from '../core/workspace.js';
import { DEFAULT_CONFIG } from '../config/defaults.js';
import { registerStartCommand } from './commands/start.js';
import { registerStopCommand } from './commands/stop.js';
import { registerListCommand } from './commands/list.js';
import { registerExecCommand } from './commands/exec.js';
import { registerSwitchCommand } from './commands/switch.js';
import { registerTUICommand } from './commands/tui.js';
import { registerWorkspaceCommand } from './commands/workspace.js';

export const program: Command = new Command()
  .name('agentspawn')
  .version('0.1.0')
  .description('Manage multiple Claude Code instances');

export async function run(argv: string[]): Promise<void> {
  const manager = new SessionManager({
    registryPath: DEFAULT_CONFIG.registryPath,
    shutdownTimeoutMs: DEFAULT_CONFIG.shutdownTimeoutMs,
  });
  const router = new Router();

  const workspaceManager = new WorkspaceManager(
    DEFAULT_CONFIG.workspacesPath!,
  );

  await manager.init();

  registerStartCommand(program, manager, router);
  registerStopCommand(program, manager, router);
  registerListCommand(program, manager, router);
  registerExecCommand(program, manager, router);
  registerSwitchCommand(program, manager, router);
  registerTUICommand(program, manager, router);
  registerWorkspaceCommand(program, manager, router, workspaceManager);

  await program.parseAsync(argv);
}
