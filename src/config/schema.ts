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
    logLevel: typeof config.logLevel === 'string' ? config.logLevel : DEFAULT_CONFIG.logLevel,
    shutdownTimeoutMs:
      typeof config.shutdownTimeoutMs === 'number'
        ? config.shutdownTimeoutMs
        : DEFAULT_CONFIG.shutdownTimeoutMs,
  };
}
