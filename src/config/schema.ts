import { AgentSpawnConfig } from '../types.js';
import { AgentSpawnError } from '../utils/errors.js';
import { DEFAULT_CONFIG } from './defaults.js';

export function validateConfig(input: unknown): AgentSpawnConfig {
  if (typeof input !== 'object' || input === null) {
    throw new AgentSpawnError('Config must be an object', 'INVALID_CONFIG');
  }

  const config = input as Record<string, unknown>;

  return {
    registryPath:
      typeof config.registryPath === 'string' ? config.registryPath : DEFAULT_CONFIG.registryPath,
    workspacesPath:
      typeof config.workspacesPath === 'string' ? config.workspacesPath : DEFAULT_CONFIG.workspacesPath,
    historyDir:
      typeof config.historyDir === 'string' ? config.historyDir : DEFAULT_CONFIG.historyDir,
    templatesPath:
      typeof config.templatesPath === 'string' ? config.templatesPath : DEFAULT_CONFIG.templatesPath,
    remotesPath:
      typeof config.remotesPath === 'string' ? config.remotesPath : DEFAULT_CONFIG.remotesPath,
    logLevel: typeof config.logLevel === 'string' ? config.logLevel : DEFAULT_CONFIG.logLevel,
    shutdownTimeoutMs:
      typeof config.shutdownTimeoutMs === 'number'
        ? config.shutdownTimeoutMs
        : DEFAULT_CONFIG.shutdownTimeoutMs,
  };
}
