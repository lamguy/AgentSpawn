import { describe, it, expect } from 'vitest';
import { validateConfig } from './schema.js';
import { AgentSpawnError } from '../utils/errors.js';
import { DEFAULT_CONFIG } from './defaults.js';

describe('validateConfig', () => {
  it('valid full config returns the config as-is', () => {
    const input = {
      registryPath: '/custom/path.json',
      workspacesPath: '/custom/workspaces.json',
      logLevel: 'debug',
      shutdownTimeoutMs: 10000,
    };
    const result = validateConfig(input);
    expect(result).toEqual(input);
  });

  it('partial config falls back to defaults for missing fields', () => {
    const input = { registryPath: '/my/registry.json' };
    const result = validateConfig(input);
    expect(result).toEqual({
      registryPath: '/my/registry.json',
      workspacesPath: DEFAULT_CONFIG.workspacesPath,
      logLevel: DEFAULT_CONFIG.logLevel,
      shutdownTimeoutMs: DEFAULT_CONFIG.shutdownTimeoutMs,
    });
  });

  it('null input throws AgentSpawnError', () => {
    expect(() => validateConfig(null)).toThrowError(AgentSpawnError);
  });

  it('non-object input (string) throws AgentSpawnError', () => {
    expect(() => validateConfig('hello')).toThrowError(AgentSpawnError);
  });

  it('non-object input (number) throws AgentSpawnError', () => {
    expect(() => validateConfig(42)).toThrowError(AgentSpawnError);
  });

  it('empty object returns all defaults', () => {
    const result = validateConfig({});
    expect(result).toEqual(DEFAULT_CONFIG);
  });
});
