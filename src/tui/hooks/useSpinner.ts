import { useState, useEffect } from 'react';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * useSpinner — cycles through braille spinner frames at the given interval.
 *
 * Returns the current frame character. Unlike a blink, the spinner is always
 * visible — only the character changes. Use instead of BlinkText for a
 * non-distracting "active" indicator.
 */
export function useSpinner(intervalMs: number = 80): string {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return FRAMES[frame];
}
