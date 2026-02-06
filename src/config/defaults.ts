import { AgentSpawnConfig } from '../types.js';

export const DEFAULT_CONFIG: AgentSpawnConfig = {
  registryPath: '~/.agentspawn/sessions.json',
  logLevel: 'info',
  shutdownTimeoutMs: 5000,
};
