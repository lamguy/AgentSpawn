/**
 * Library entry point for AgentSpawn.
 * Exports core classes for programmatic use and testing.
 */
export { Session } from './core/session.js';
export { SessionManager } from './core/manager.js';
export { Registry } from './core/registry.js';
export { RegistryWatcher } from './core/registry-watcher.js';
export { WorkspaceManager } from './core/workspace.js';
export { TemplateManager } from './core/template.js';
export { HistoryStore } from './core/history.js';
export { Router } from './io/router.js';
export type {
  SessionState,
  SessionConfig,
  SessionInfo,
  SessionHandle,
  RegistryEntry,
  RegistryData,
  ManagerOptions,
  RouterOptions,
  AgentSpawnConfig,
  PromptHistoryEntry,
  WorkspaceEntry,
  WorkspaceData,
  TemplateEntry,
  TemplateData,
} from './types.js';
