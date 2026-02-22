import { Command } from 'commander';
import { SessionManager } from '../../core/manager.js';
import { WebServer } from '../../web/server.js';
import { HistoryStore } from '../../core/history.js';
import { DEFAULT_WEB_PORT } from '../../config/defaults.js';

export function registerWebCommand(
  program: Command,
  manager: SessionManager,
  historyStore?: HistoryStore,
): void {
  program
    .command('web')
    .description('Start the web dashboard')
    .option('-p, --port <port>', 'Port to listen on', String(DEFAULT_WEB_PORT))
    .action(async (options: { port: string }) => {
      const port = parseInt(options.port, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        console.error('Error: --port must be a valid port number (1-65535)');
        process.exitCode = 1;
        return;
      }

      const server = new WebServer(manager, port, historyStore);

      try {
        await server.start();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Error: Failed to start web server — ${message}`);
        process.exitCode = 1;
        return;
      }

      console.log(`Dashboard running at http://localhost:${port}`);

      // Keep process alive until Ctrl+C
      process.on('SIGINT', async () => {
        await server.stop();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        await server.stop();
        process.exit(0);
      });
    });
}
