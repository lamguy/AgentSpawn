import { Command } from 'commander';
import path from 'node:path';
import { TemplateManager } from '../../core/template.js';
import { SessionManager } from '../../core/manager.js';
import { formatTemplateTable } from '../../io/formatter.js';
import {
  TemplateAlreadyExistsError,
  TemplateNotFoundError,
  SessionNotFoundError,
} from '../../utils/errors.js';

export function registerTemplateCommand(
  program: Command,
  templateManager: TemplateManager,
  manager?: SessionManager,
): void {
  const tpl = program
    .command('template')
    .description('Manage session templates');

  tpl
    .command('create <name>')
    .description('Create a new session template')
    .option('-d, --dir <path>', 'Default working directory')
    .option(
      '--permission-mode <mode>',
      'Permission mode for Claude (bypassPermissions, acceptEdits, default, plan, delegate, dontAsk)',
    )
    .option('--system-prompt <text>', 'System prompt for sessions')
    .option('-e, --env <pairs...>', 'Environment variables as KEY=VALUE pairs')
    .option('--restart-enabled', 'Enable automatic restart on crash')
    .option('--restart-max-retries <count>', 'Maximum number of restart attempts', '3')
    .action(
      async (
        name: string,
        options: {
          dir?: string;
          permissionMode?: string;
          systemPrompt?: string;
          env?: string[];
          restartEnabled?: boolean;
          restartMaxRetries?: string;
        },
      ) => {
        try {
          let env: Record<string, string> | undefined;
          if (options.env) {
            env = {};
            for (const pair of options.env) {
              const eqIndex = pair.indexOf('=');
              if (eqIndex === -1) {
                console.error(
                  `Error: Invalid environment variable format: "${pair}". Expected KEY=VALUE.`,
                );
                process.exitCode = 1;
                return;
              }
              const key = pair.slice(0, eqIndex);
              const value = pair.slice(eqIndex + 1);
              env[key] = value;
            }
          }

          let restartPolicy;
          if (options.restartEnabled !== undefined) {
            const maxRetries = parseInt(options.restartMaxRetries ?? '3', 10);
            if (isNaN(maxRetries) || maxRetries < 0) {
              console.error('Error: restart-max-retries must be a non-negative number');
              process.exitCode = 1;
              return;
            }
            restartPolicy = {
              enabled: options.restartEnabled,
              maxRetries,
            };
          }

          await templateManager.create(name, {
            workingDirectory: options.dir ? path.resolve(options.dir) : undefined,
            permissionMode: options.permissionMode,
            systemPrompt: options.systemPrompt,
            env,
            restartPolicy,
          });
          console.log(`Template "${name}" created`);
        } catch (e) {
          if (e instanceof TemplateAlreadyExistsError) {
            console.error(`Error: ${e.message}`);
            process.exitCode = 1;
            return;
          }
          throw e;
        }
      },
    );

  tpl
    .command('save <session-name> <template-name>')
    .description('Save a running session as a template')
    .action(async (sessionName: string, templateName: string) => {
      if (!manager) {
        console.error('Error: Session manager is not available.');
        process.exitCode = 2;
        return;
      }

      try {
        // Get the session info from the registry
        const registryData = await manager.registry.load();
        const registryEntry = registryData.sessions[sessionName];

        if (!registryEntry) {
          throw new SessionNotFoundError(sessionName);
        }

        // Create template from session's configuration
        await templateManager.create(templateName, {
          workingDirectory: registryEntry.workingDirectory,
          permissionMode: registryEntry.permissionMode,
          restartPolicy: registryEntry.restartPolicy,
        });

        console.log(`Template "${templateName}" created from session "${sessionName}"`);
      } catch (e) {
        if (e instanceof SessionNotFoundError) {
          console.error(`Error: ${e.message}`);
          process.exitCode = 1;
          return;
        }
        if (e instanceof TemplateAlreadyExistsError) {
          console.error(`Error: ${e.message}`);
          process.exitCode = 1;
          return;
        }
        throw e;
      }
    });

  tpl
    .command('list')
    .description('List all templates')
    .option('--json', 'Output as JSON')
    .action(async (options: { json?: boolean }) => {
      const templates = await templateManager.list();
      if (options.json) {
        console.log(JSON.stringify(templates, null, 2));
        return;
      }
      if (templates.length === 0) {
        console.log(
          'No templates found. Create one with: agentspawn template create <name>',
        );
        return;
      }
      console.log(formatTemplateTable(templates));
    });

  tpl
    .command('show <name>')
    .description('Show details of a template')
    .option('--json', 'Output as JSON')
    .action(async (name: string, options: { json?: boolean }) => {
      try {
        const template = await templateManager.get(name);
        if (options.json) {
          console.log(JSON.stringify(template, null, 2));
          return;
        }
        console.log(`Name: ${template.name}`);
        console.log(`Directory: ${template.workingDirectory ?? '--'}`);
        console.log(`Permission Mode: ${template.permissionMode ?? '--'}`);
        console.log(`System Prompt: ${template.systemPrompt ?? '--'}`);
        if (template.restartPolicy) {
          console.log(`Restart Policy: ${template.restartPolicy.enabled ? 'enabled' : 'disabled'} (max retries: ${template.restartPolicy.maxRetries})`);
        } else {
          console.log('Restart Policy: --');
        }
        if (template.env && Object.keys(template.env).length > 0) {
          console.log('Environment:');
          for (const [key, value] of Object.entries(template.env)) {
            console.log(`  ${key}=${value}`);
          }
        } else {
          console.log('Environment: --');
        }
        console.log(`Created: ${template.createdAt}`);
      } catch (e) {
        if (e instanceof TemplateNotFoundError) {
          console.error(`Error: ${e.message}`);
          process.exitCode = 1;
          return;
        }
        throw e;
      }
    });

  tpl
    .command('delete <name>')
    .description('Delete a template')
    .action(async (name: string) => {
      try {
        await templateManager.delete(name);
        console.log(`Template "${name}" deleted`);
      } catch (e) {
        if (e instanceof TemplateNotFoundError) {
          console.error(`Error: ${e.message}`);
          process.exitCode = 1;
          return;
        }
        throw e;
      }
    });
}
