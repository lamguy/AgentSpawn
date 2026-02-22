import path from 'node:path';
import os from 'node:os';
import { AgentSpawnConfig } from '../types.js';

export const DEFAULT_WEB_PORT = 7821;

export const DEFAULT_CONFIG: AgentSpawnConfig = {
  registryPath: '~/.agentspawn/sessions.json',
  workspacesPath: path.join(os.homedir(), '.agentspawn', 'workspaces.json'),
  historyDir: path.join(os.homedir(), '.agentspawn', 'history'),
  templatesPath: path.join(os.homedir(), '.agentspawn', 'templates.json'),
  remotesPath: path.join(os.homedir(), '.agentspawn', 'remotes.json'),
  logLevel: 'info',
  shutdownTimeoutMs: 5000,
};
