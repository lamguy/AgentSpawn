import { Command } from 'commander';
import { SessionManager } from '../../core/manager.js';
import { Router } from '../../io/router.js';
import { WorkspaceManager } from '../../core/workspace.js';
import { formatWorkspaceTable } from '../../io/formatter.js';
import { SessionState } from '../../types.js';
import {
  WorkspaceAlreadyExistsError,
  WorkspaceNotFoundError,
} from '../../utils/errors.js';

export function registerWorkspaceCommand(
  program: Command,
  manager: SessionManager,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _router: Router,
  workspaceManager: WorkspaceManager,
): void {
  const ws = program
    .command('workspace')
    .description('Manage workspaces (groups of sessions)');

  ws.command('create <name>')
    .description('Create a new workspace')
    .action(async (name: string) => {
      try {
        await workspaceManager.create(name);
        console.log(`Workspace "${name}" created`);
      } catch (e) {
        if (e instanceof WorkspaceAlreadyExistsError) {
          console.error(`Error: ${e.message}`);
          process.exitCode = 1;
          return;
        }
        throw e;
      }
    });

  ws.command('delete <name>')
    .description('Delete a workspace')
    .action(async (name: string) => {
      try {
        await workspaceManager.delete(name);
        console.log(`Workspace "${name}" deleted`);
      } catch (e) {
        if (e instanceof WorkspaceNotFoundError) {
          console.error(`Error: ${e.message}`);
          process.exitCode = 1;
          return;
        }
        throw e;
      }
    });

  ws.command('add <workspace> <sessions...>')
    .description('Add sessions to a workspace')
    .action(async (workspace: string, sessions: string[]) => {
      try {
        const added = await workspaceManager.addSessions(workspace, sessions);
        const skipped = sessions.filter((s) => !added.includes(s));
        if (added.length > 0) {
          console.log(
            `Added ${added.length} session(s) to workspace "${workspace}": ${added.join(', ')}`,
          );
        }
        if (skipped.length > 0) {
          console.log(
            `Skipped ${skipped.length} session(s) already in workspace: ${skipped.join(', ')}`,
          );
        }
        if (added.length === 0 && skipped.length > 0) {
          console.log('No new sessions were added.');
        }
      } catch (e) {
        if (e instanceof WorkspaceNotFoundError) {
          console.error(`Error: ${e.message}`);
          process.exitCode = 1;
          return;
        }
        throw e;
      }
    });

  ws.command('remove <workspace> <sessions...>')
    .description('Remove sessions from a workspace')
    .action(async (workspace: string, sessions: string[]) => {
      try {
        const removed = await workspaceManager.removeSessions(workspace, sessions);
        if (removed.length > 0) {
          console.log(
            `Removed ${removed.length} session(s) from workspace "${workspace}": ${removed.join(', ')}`,
          );
        } else {
          console.log(`No matching sessions found in workspace "${workspace}".`);
        }
      } catch (e) {
        if (e instanceof WorkspaceNotFoundError) {
          console.error(`Error: ${e.message}`);
          process.exitCode = 1;
          return;
        }
        throw e;
      }
    });

  ws.command('list')
    .description('List all workspaces')
    .option('--json', 'Output as JSON')
    .action(async (options: { json?: boolean }) => {
      const workspaces = await workspaceManager.list();
      if (options.json) {
        console.log(JSON.stringify(workspaces, null, 2));
        return;
      }
      if (workspaces.length === 0) {
        console.log(
          'No workspaces found. Create one with: agentspawn workspace create <name>',
        );
        return;
      }
      console.log(formatWorkspaceTable(workspaces));
    });

  ws.command('switch <name>')
    .description('Show session status for a workspace')
    .action(async (name: string) => {
      try {
        const sessionNames = await workspaceManager.getSessionNames(name);
        if (sessionNames.length === 0) {
          console.log(`Workspace "${name}" has no sessions.`);
          return;
        }
        console.log(`Workspace "${name}" sessions:`);
        for (const sessionName of sessionNames) {
          const info = manager.getSessionInfo(sessionName);
          if (info) {
            const stateLabel =
              info.state === SessionState.Running ? 'running' : info.state;
            console.log(`  ${sessionName}: ${stateLabel}`);
          } else {
            console.log(`  ${sessionName}: unknown`);
          }
        }
      } catch (e) {
        if (e instanceof WorkspaceNotFoundError) {
          console.error(`Error: ${e.message}`);
          process.exitCode = 1;
          return;
        }
        throw e;
      }
    });
}
