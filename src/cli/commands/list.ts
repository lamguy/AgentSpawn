import { Command } from 'commander';

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .description('List agent sessions')
    .option('--json', 'Output as JSON')
    .action(() => {
      console.log('list: not yet implemented');
    });
}
