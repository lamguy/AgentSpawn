import { Command } from 'commander';

export function registerStartCommand(program: Command): void {
  program
    .command('start <name>')
    .description('Start a new agent session')
    .option('-d, --dir <path>', 'Working directory', process.cwd())
    .action((name: string, options: { dir: string }) => {
      console.log(`Starting session: ${name}`);
      console.log(`Working directory: ${options.dir}`);
      console.log('start: not yet implemented');
    });
}
