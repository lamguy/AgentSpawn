import { Command } from 'commander';
import { SessionManager } from '../../core/manager.js';
import { SessionState } from '../../types.js';

function formatUptime(ms: number): string {
  if (ms <= 0) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(' ');
}

function formatResponseTime(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

export function registerStatsCommand(
  program: Command,
  manager: SessionManager,
): void {
  program
    .command('stats <name>')
    .description('Show resource metrics for a session')
    .option('--json', 'Output as JSON')
    .action(async (name: string, options: { json?: boolean }) => {
      const session = manager.getSession(name);
      const sessions = manager.listSessions();
      const info = sessions.find((s) => s.name === name);

      if (!info) {
        console.error(`Error: Session '${name}' not found.`);
        process.exitCode = 1;
        return;
      }

      if (options.json) {
        const output: Record<string, unknown> = { ...info };
        if (session) {
          const metrics = session.getMetrics();
          Object.assign(output, { metrics });
        }
        console.log(JSON.stringify(output, null, 2));
        return;
      }

      // Human-readable output
      const stateLabel = info.state === SessionState.Running ? 'running'
        : info.state === SessionState.Stopped ? 'stopped'
        : 'crashed';

      console.log(`Session:             ${info.name}`);
      console.log(`State:               ${stateLabel}`);

      if (session) {
        const metrics = session.getMetrics();
        console.log(`Prompts:             ${metrics.promptCount}`);
        console.log(`Avg Response Time:   ${formatResponseTime(metrics.avgResponseTimeMs)}`);
        console.log(`Total Response Chars:${formatNumber(metrics.totalResponseChars)}`);
        console.log(`Est. Tokens:         ~${formatNumber(metrics.estimatedTokens)}`);
        console.log(`Uptime:              ${formatUptime(metrics.uptimeMs)}`);
      } else {
        console.log(`Prompts:             ${info.promptCount}`);
        console.log(`Avg Response Time:   n/a`);
        console.log(`Total Response Chars:n/a`);
        console.log(`Est. Tokens:         n/a`);
        const uptimeMs = info.startedAt ? Date.now() - new Date(info.startedAt).getTime() : 0;
        console.log(`Uptime:              ${formatUptime(uptimeMs)}`);
      }

      console.log(`Working Dir:         ${info.workingDirectory}`);
    });
}
