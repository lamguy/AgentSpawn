import { Command } from 'commander';
import { registerStartCommand } from './commands/start.js';
import { registerStopCommand } from './commands/stop.js';
import { registerListCommand } from './commands/list.js';
import { registerExecCommand } from './commands/exec.js';
import { registerSwitchCommand } from './commands/switch.js';

export const program: Command = new Command()
  .name('agentspawn')
  .version('0.1.0')
  .description('Manage multiple Claude Code instances');

registerStartCommand(program);
registerStopCommand(program);
registerListCommand(program);
registerExecCommand(program);
registerSwitchCommand(program);

export function run(argv: string[]): void {
  program.parse(argv);
}
