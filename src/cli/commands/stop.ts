import { Command } from 'commander';

export function registerStopCommand(program: Command): void {
  program
    .command('stop [name]')
    .description('Stop an agent session')
    .option('--all', 'Stop all sessions')
    .action(() => {
      console.log('stop: not yet implemented');
    });
}
