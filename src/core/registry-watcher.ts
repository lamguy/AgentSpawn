import fs from 'node:fs';
import { logger } from '../utils/logger.js';

export interface RegistryWatcherOptions {
  registryPath: string;
  debounceMs?: number;
  fallbackIntervalMs?: number;
}

export type RegistryChangeCallback = () => void;

const DEFAULT_DEBOUNCE_MS = 100;
const DEFAULT_FALLBACK_INTERVAL_MS = 30_000;
const WATCH_RETRY_INTERVAL_MS = 500;
const WATCH_MAX_RETRIES = 10;

/**
 * Watches the registry file for changes using fs.watch with a debounce,
 * plus a fallback polling interval for platforms where fs.watch is unreliable.
 */
export class RegistryWatcher {
  private readonly registryPath: string;
  private readonly debounceMs: number;
  private readonly fallbackIntervalMs: number;

  private callback: RegistryChangeCallback | null = null;
  private watcher: fs.FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private fallbackInterval: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private retryCount = 0;
  private lastMtimeMs = 0;
  private suppressUntil = 0;

  constructor(options: RegistryWatcherOptions) {
    this.registryPath = options.registryPath;
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.fallbackIntervalMs = options.fallbackIntervalMs ?? DEFAULT_FALLBACK_INTERVAL_MS;
  }

  /**
   * Start watching the registry file. The callback fires whenever a change
   * is detected (after debounce).
   */
  watch(callback: RegistryChangeCallback): void {
    this.callback = callback;
    this.initWatcher();
    this.startFallbackPolling();
  }

  /**
   * Stop watching and release all resources.
   */
  unwatch(): void {
    this.callback = null;
    this.closeWatcher();

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.fallbackInterval) {
      clearInterval(this.fallbackInterval);
      this.fallbackInterval = null;
    }

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /**
   * Notify the watcher that a local write just happened. Bypasses debounce
   * and invokes the callback synchronously, then suppresses the resulting
   * fs.watch event.
   */
  notifyWrite(): void {
    // Cancel any pending debounce — the local write supersedes it
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Suppress the fs.watch event that will fire for this write
    this.suppressUntil = Date.now() + this.debounceMs;

    // Invoke callback synchronously
    if (this.callback) {
      this.callback();
    }
  }

  private initWatcher(): void {
    this.closeWatcher();
    this.retryCount = 0;

    try {
      this.watcher = fs.watch(this.registryPath, (eventType) => {
        if (eventType === 'rename') {
          // File was replaced (atomic write via rename) — re-establish watcher
          this.handleWatcherLost();
          return;
        }

        this.scheduleDebounce();
      });

      this.watcher.on('error', () => {
        this.handleWatcherLost();
      });
    } catch {
      // File may not exist yet — rely on fallback polling
      logger.debug(`Could not watch registry file: ${this.registryPath}`);
    }
  }

  private closeWatcher(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  private handleWatcherLost(): void {
    this.closeWatcher();

    // Fire change notification promptly — the rename means a write happened
    this.scheduleDebounce();

    if (this.retryCount >= WATCH_MAX_RETRIES) {
      logger.debug('Max watcher retries reached, relying on fallback polling');
      return;
    }

    this.retryCount++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.initWatcher();
    }, WATCH_RETRY_INTERVAL_MS);
  }

  private scheduleDebounce(): void {
    // Suppress events caused by our own writes
    if (Date.now() < this.suppressUntil) {
      return;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      if (this.callback) {
        this.callback();
      }
    }, this.debounceMs);
  }

  private startFallbackPolling(): void {
    // Capture initial mtime
    try {
      const stat = fs.statSync(this.registryPath);
      this.lastMtimeMs = stat.mtimeMs;
    } catch {
      this.lastMtimeMs = 0;
    }

    this.fallbackInterval = setInterval(() => {
      try {
        const stat = fs.statSync(this.registryPath);
        if (stat.mtimeMs !== this.lastMtimeMs) {
          this.lastMtimeMs = stat.mtimeMs;
          this.scheduleDebounce();
        }
      } catch {
        // File may not exist yet — ignore
      }
    }, this.fallbackIntervalMs);

    // Don't block process exit
    if (this.fallbackInterval.unref) {
      this.fallbackInterval.unref();
    }
  }
}
