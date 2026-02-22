import { useState, useEffect } from 'react';

/**
 * useBlink — toggles a boolean at the given interval.
 * Returns true/false alternating for arcade-style blinking text.
 * When disabled, always returns true (fully visible).
 */
export function useBlink(intervalMs = 800, enabled = true): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setVisible(true);
      return;
    }
    const timer = setInterval(() => setVisible((v) => !v), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, enabled]);

  return visible;
}
