import { Command } from 'commander';

export function registerExecCommand(program: Command): void {
  program
    .command('exec <name> <command>')
    .description('Execute a command in an agent session')
    .action(() => {
      console.log('exec: not yet implemented');
    });
}
