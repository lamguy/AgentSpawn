import { Command } from 'commander';

export function registerSwitchCommand(program: Command): void {
  program
    .command('switch <name>')
    .description('Switch to an agent session')
    .action(() => {
      console.log('switch: not yet implemented');
    });
}
