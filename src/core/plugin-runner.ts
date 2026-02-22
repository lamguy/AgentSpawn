import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { logger } from '../utils/logger.js';

export interface PluginConfig {
  event: 'onPrompt' | 'onResponse' | 'onCrash' | 'onStart' | 'onStop';
  script: string;
}

export interface PluginsFile {
  plugins: PluginConfig[];
}

export class PluginRunner {
  private constructor(private readonly plugins: PluginConfig[]) {}

  /**
   * Create a no-op PluginRunner with no registered plugins.
   */
  static empty(): PluginRunner {
    return new PluginRunner([]);
  }

  /**
   * Load plugin configuration from ~/.agentspawn/plugins.json.
   * Returns a PluginRunner with an empty plugin list if the file doesn't exist.
   */
  static async load(configDir?: string): Promise<PluginRunner> {
    const dir = configDir ?? path.join(os.homedir(), '.agentspawn');
    const filePath = path.join(dir, 'plugins.json');

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        logger.warn(`plugins.json is not valid JSON, ignoring plugins: ${filePath}`);
        return new PluginRunner([]);
      }

      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !Array.isArray((parsed as Record<string, unknown>).plugins)
      ) {
        logger.warn(`plugins.json has invalid structure, ignoring plugins: ${filePath}`);
        return new PluginRunner([]);
      }

      const pluginsFile = parsed as PluginsFile;
      return new PluginRunner(pluginsFile.plugins);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        // No plugins file — that's fine
        return new PluginRunner([]);
      }
      logger.warn(`Failed to load plugins.json: ${(err as Error).message}`);
      return new PluginRunner([]);
    }
  }

  /**
   * Execute all plugins registered for the given event.
   * Fire-and-forget: errors in plugin scripts never throw to the caller.
   */
  async fire(
    sessionName: string,
    event: PluginConfig['event'],
    data: Record<string, unknown>,
  ): Promise<void> {
    const matching = this.plugins.filter((p) => p.event === event);
    if (matching.length === 0) return;

    const env: Record<string, string> = {
      ...Object.fromEntries(
        Object.entries(process.env).filter(([, v]) => v !== undefined) as [string, string][],
      ),
      AGENTSPAWN_SESSION: sessionName,
      AGENTSPAWN_EVENT: event,
      AGENTSPAWN_DATA: JSON.stringify(data),
    };

    const executions = matching.map((plugin) => this.runScript(plugin.script, env));
    await Promise.allSettled(executions);
  }

  private runScript(script: string, env: Record<string, string>): Promise<void> {
    return new Promise<void>((resolve) => {
      try {
        const child = spawn(script, [], {
          env,
          stdio: 'ignore',
          shell: true,
        });

        child.on('error', (err) => {
          logger.warn(`Plugin script "${script}" failed to start: ${err.message}`);
          resolve();
        });

        child.on('close', (code) => {
          if (code !== 0) {
            logger.warn(`Plugin script "${script}" exited with code ${code}`);
          }
          resolve();
        });
      } catch (err) {
        logger.warn(`Plugin script "${script}" threw during spawn: ${(err as Error).message}`);
        resolve();
      }
    });
  }
}
