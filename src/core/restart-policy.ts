/**
 * Restart policy utilities for crash detection and retry logic.
 */

export type ExitClassification = 'Success' | 'Retryable' | 'Permanent';

/**
 * Classify an exit code to determine retry behavior.
 *
 * - Success: exit code 0 (normal termination)
 * - Retryable: temporary failures like SIGTERM, network errors, resource limits
 * - Permanent: configuration errors, invalid arguments, access denied
 *
 * @param code - Process exit code (null if killed by signal)
 * @param signal - Signal that killed the process (null if exited normally)
 */
export function classifyExitCode(
  code: number | null,
  signal: NodeJS.Signals | null,
): { classification: ExitClassification; reason: string } {
  // Success
  if (code === 0) {
    return { classification: 'Success', reason: 'Normal termination' };
  }

  // Signal-based termination
  if (signal) {
    switch (signal) {
      case 'SIGTERM':
      case 'SIGINT':
        return { classification: 'Retryable', reason: `Killed by ${signal}` };
      case 'SIGKILL':
        return { classification: 'Retryable', reason: 'Force killed (SIGKILL)' };
      case 'SIGSEGV':
      case 'SIGABRT':
        return { classification: 'Permanent', reason: `Fatal signal: ${signal}` };
      default:
        return { classification: 'Retryable', reason: `Signal: ${signal}` };
    }
  }

  // Exit code classification
  if (code !== null) {
    // Common exit codes
    if (code === 1) {
      return { classification: 'Retryable', reason: 'General error (exit code 1)' };
    }
    if (code === 2) {
      return { classification: 'Permanent', reason: 'Misuse of shell command (exit code 2)' };
    }
    if (code === 126) {
      return { classification: 'Permanent', reason: 'Command not executable (exit code 126)' };
    }
    if (code === 127) {
      return { classification: 'Permanent', reason: 'Command not found (exit code 127)' };
    }
    if (code === 128) {
      return { classification: 'Permanent', reason: 'Invalid exit argument (exit code 128)' };
    }
    if (code >= 129 && code <= 192) {
      // 128 + signal number (e.g., 130 = 128 + SIGINT = 2)
      const sigNum = code - 128;
      return { classification: 'Retryable', reason: `Terminated by signal ${sigNum} (exit code ${code})` };
    }

    // Default for unknown exit codes
    return { classification: 'Retryable', reason: `Exit code ${code}` };
  }

  // Fallback (shouldn't reach here)
  return { classification: 'Retryable', reason: 'Unknown termination' };
}

/**
 * Calculate exponential backoff with jitter.
 *
 * Formula: min(maxDelay, baseDelay * 2^attempt) + random jitter
 *
 * @param attempt - Retry attempt number (0-indexed)
 * @param baseDelayMs - Base delay in milliseconds (default: 1000)
 * @param maxDelayMs - Maximum delay cap in milliseconds (default: 30000)
 * @param jitterMs - Random jitter range in milliseconds (default: 500)
 */
export function calculateBackoff(
  attempt: number,
  baseDelayMs: number = 1000,
  maxDelayMs: number = 30000,
  jitterMs: number = 500,
): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
  const jitter = Math.random() * jitterMs;
  return Math.floor(cappedDelay + jitter);
}
