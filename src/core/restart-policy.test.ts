import { describe, it, expect } from 'vitest';
import { classifyExitCode, calculateBackoff } from './restart-policy.js';

describe('classifyExitCode', () => {
  describe('Success cases', () => {
    it('should classify exit code 0 as Success', () => {
      const result = classifyExitCode(0, null);
      expect(result.classification).toBe('Success');
      expect(result.reason).toBe('Normal termination');
    });
  });

  describe('Signal-based termination', () => {
    it('should classify SIGTERM as Retryable', () => {
      const result = classifyExitCode(null, 'SIGTERM');
      expect(result.classification).toBe('Retryable');
      expect(result.reason).toContain('SIGTERM');
    });

    it('should classify SIGINT as Retryable', () => {
      const result = classifyExitCode(null, 'SIGINT');
      expect(result.classification).toBe('Retryable');
      expect(result.reason).toContain('SIGINT');
    });

    it('should classify SIGKILL as Retryable', () => {
      const result = classifyExitCode(null, 'SIGKILL');
      expect(result.classification).toBe('Retryable');
      expect(result.reason).toContain('SIGKILL');
    });

    it('should classify SIGSEGV as Permanent', () => {
      const result = classifyExitCode(null, 'SIGSEGV');
      expect(result.classification).toBe('Permanent');
      expect(result.reason).toContain('SIGSEGV');
    });

    it('should classify SIGABRT as Permanent', () => {
      const result = classifyExitCode(null, 'SIGABRT');
      expect(result.classification).toBe('Permanent');
      expect(result.reason).toContain('SIGABRT');
    });

    it('should classify unknown signals as Retryable', () => {
      const result = classifyExitCode(null, 'SIGHUP');
      expect(result.classification).toBe('Retryable');
      expect(result.reason).toContain('SIGHUP');
    });
  });

  describe('Exit code classification', () => {
    it('should classify exit code 1 as Retryable', () => {
      const result = classifyExitCode(1, null);
      expect(result.classification).toBe('Retryable');
      expect(result.reason).toContain('General error');
    });

    it('should classify exit code 2 as Permanent', () => {
      const result = classifyExitCode(2, null);
      expect(result.classification).toBe('Permanent');
      expect(result.reason).toContain('Misuse of shell command');
    });

    it('should classify exit code 126 as Permanent', () => {
      const result = classifyExitCode(126, null);
      expect(result.classification).toBe('Permanent');
      expect(result.reason).toContain('not executable');
    });

    it('should classify exit code 127 as Permanent', () => {
      const result = classifyExitCode(127, null);
      expect(result.classification).toBe('Permanent');
      expect(result.reason).toContain('not found');
    });

    it('should classify exit code 128 as Permanent', () => {
      const result = classifyExitCode(128, null);
      expect(result.classification).toBe('Permanent');
      expect(result.reason).toContain('Invalid exit argument');
    });

    it('should classify exit codes 129-192 as Retryable (signal-based)', () => {
      const result130 = classifyExitCode(130, null);
      expect(result130.classification).toBe('Retryable');
      expect(result130.reason).toContain('signal 2');

      const result143 = classifyExitCode(143, null);
      expect(result143.classification).toBe('Retryable');
      expect(result143.reason).toContain('signal 15');
    });

    it('should classify unknown exit codes as Retryable', () => {
      const result = classifyExitCode(42, null);
      expect(result.classification).toBe('Retryable');
      expect(result.reason).toBe('Exit code 42');
    });
  });

  describe('Edge cases', () => {
    it('should handle null code and null signal', () => {
      const result = classifyExitCode(null, null);
      expect(result.classification).toBe('Retryable');
      expect(result.reason).toBe('Unknown termination');
    });

    it('should prefer signal over exit code when both are present', () => {
      // In practice, signal-based termination typically has null code,
      // but the function should handle signal first
      const result = classifyExitCode(1, 'SIGTERM');
      expect(result.classification).toBe('Retryable');
      expect(result.reason).toContain('SIGTERM');
    });
  });
});

describe('calculateBackoff', () => {
  it('should calculate exponential backoff for attempt 0', () => {
    const delay = calculateBackoff(0);
    expect(delay).toBeGreaterThanOrEqual(1000); // base delay
    expect(delay).toBeLessThan(1000 + 500); // base + jitter
  });

  it('should calculate exponential backoff for attempt 1', () => {
    const delay = calculateBackoff(1);
    expect(delay).toBeGreaterThanOrEqual(2000); // base * 2^1
    expect(delay).toBeLessThan(2000 + 500); // base * 2 + jitter
  });

  it('should calculate exponential backoff for attempt 2', () => {
    const delay = calculateBackoff(2);
    expect(delay).toBeGreaterThanOrEqual(4000); // base * 2^2
    expect(delay).toBeLessThan(4000 + 500); // base * 4 + jitter
  });

  it('should cap delay at maxDelayMs', () => {
    const delay = calculateBackoff(10, 1000, 5000, 500);
    expect(delay).toBeGreaterThanOrEqual(5000);
    expect(delay).toBeLessThan(5000 + 500); // capped + jitter
  });

  it('should support custom base delay', () => {
    const delay = calculateBackoff(0, 500, 30000, 0);
    expect(delay).toBe(500);
  });

  it('should support custom max delay', () => {
    const delay = calculateBackoff(10, 1000, 10000, 0);
    expect(delay).toBe(10000);
  });

  it('should apply jitter', () => {
    // Run multiple times to check jitter variance
    const delays = Array.from({ length: 10 }, () => calculateBackoff(0, 1000, 30000, 500));
    const uniqueDelays = new Set(delays);
    // With random jitter, we expect some variance
    expect(uniqueDelays.size).toBeGreaterThan(1);
  });

  it('should return integer values', () => {
    const delay = calculateBackoff(2, 1000, 30000, 500);
    expect(delay).toBe(Math.floor(delay));
  });

  it('should handle zero jitter', () => {
    const delay = calculateBackoff(2, 1000, 30000, 0);
    expect(delay).toBe(4000); // Exactly base * 2^2
  });

  it('should handle large attempt numbers gracefully', () => {
    const delay = calculateBackoff(100, 1000, 60000, 1000);
    expect(delay).toBeGreaterThanOrEqual(60000);
    expect(delay).toBeLessThan(60000 + 1000);
  });
});
