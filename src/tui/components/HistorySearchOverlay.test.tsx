import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { HistorySearchOverlay } from './HistorySearchOverlay.js';
import type { HistorySearchOverlayProps } from './HistorySearchOverlay.js';
import type { PromptHistoryEntry } from '../../types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeResult(
  overrides: Partial<PromptHistoryEntry & { sessionName: string }> = {},
): PromptHistoryEntry & { sessionName: string } {
  return {
    index: 0,
    prompt: 'test prompt',
    responsePreview: 'test response',
    timestamp: new Date().toISOString(),
    sessionName: 'my-session',
    ...overrides,
  };
}

function defaultProps(
  overrides: Partial<HistorySearchOverlayProps> = {},
): HistorySearchOverlayProps {
  return {
    query: '',
    results: [],
    selectedIndex: 0,
    isLoading: false,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HistorySearchOverlay', () => {
  it('should render the title "History Search (Ctrl+R)"', () => {
    const { lastFrame } = render(
      <HistorySearchOverlay {...defaultProps()} />,
    );
    expect(lastFrame()).toContain('REPLAY SEARCH');
  });

  it('should show "Type to search prompt history" when query is empty and no results', () => {
    const { lastFrame } = render(
      <HistorySearchOverlay {...defaultProps({ query: '' })} />,
    );
    expect(lastFrame()).toContain('TYPE TO SEARCH PAST MOVES');
  });

  it('should not show "Type to search" when query is non-empty', () => {
    const { lastFrame } = render(
      <HistorySearchOverlay {...defaultProps({ query: 'fix' })} />,
    );
    expect(lastFrame()).not.toContain('TYPE TO SEARCH PAST MOVES');
  });

  it('should show "No results" when query has no matches', () => {
    const { lastFrame } = render(
      <HistorySearchOverlay
        {...defaultProps({ query: 'nonexistent', results: [] })}
      />,
    );
    const output = lastFrame() || '';
    expect(output).toContain('NO REPLAYS FOUND');
    expect(output).toContain('nonexistent');
  });

  it('should not show "No results" when isLoading is true', () => {
    const { lastFrame } = render(
      <HistorySearchOverlay
        {...defaultProps({ query: 'loading', results: [], isLoading: true })}
      />,
    );
    const output = lastFrame() || '';
    expect(output).not.toContain('No results');
  });

  it('should render results with selection highlight', () => {
    const results = [
      makeResult({ index: 0, prompt: 'first result', sessionName: 's1' }),
      makeResult({ index: 1, prompt: 'second result', sessionName: 's2' }),
    ];
    const { lastFrame } = render(
      <HistorySearchOverlay
        {...defaultProps({ query: 'result', results, selectedIndex: 0 })}
      />,
    );
    const output = lastFrame() || '';
    expect(output).toContain('first result');
    expect(output).toContain('second result');
    // The selected entry gets a '>' indicator
    expect(output).toContain('>');
  });

  it('should show result count', () => {
    const results = [
      makeResult({ index: 0, prompt: 'match one' }),
      makeResult({ index: 1, prompt: 'match two' }),
      makeResult({ index: 2, prompt: 'match three' }),
    ];
    const { lastFrame } = render(
      <HistorySearchOverlay
        {...defaultProps({ query: 'match', results })}
      />,
    );
    expect(lastFrame()).toContain('3 results');
  });

  it('should show singular "result" for exactly 1 result', () => {
    const results = [makeResult({ prompt: 'only match' })];
    const { lastFrame } = render(
      <HistorySearchOverlay
        {...defaultProps({ query: 'only', results })}
      />,
    );
    const output = lastFrame() || '';
    expect(output).toContain('1 result');
    // Should NOT say "1 results"
    expect(output).not.toContain('1 results');
  });

  it('should show "searching..." when isLoading is true', () => {
    const { lastFrame } = render(
      <HistorySearchOverlay
        {...defaultProps({ query: 'test', isLoading: true })}
      />,
    );
    expect(lastFrame()).toContain('searching...');
  });

  it('should not show "searching..." when isLoading is false', () => {
    const { lastFrame } = render(
      <HistorySearchOverlay
        {...defaultProps({ query: 'test', isLoading: false })}
      />,
    );
    expect(lastFrame()).not.toContain('searching...');
  });

  it('should truncate long prompts', () => {
    const longPrompt = 'A'.repeat(100);
    const results = [makeResult({ prompt: longPrompt })];
    const { lastFrame } = render(
      <HistorySearchOverlay
        {...defaultProps({ query: 'A', results })}
      />,
    );
    const output = lastFrame() || '';
    // MAX_PROMPT_LENGTH is 60, so the full 100-char prompt should NOT appear.
    // The truncated version (57 A's + '...') may be split across lines by Ink
    // layout, so we just verify the full prompt is absent.
    expect(output).not.toContain(longPrompt);
    // The truncated portion (first 57 chars) should be present
    expect(output).toContain('A'.repeat(57));
  });

  it('should not truncate short prompts', () => {
    const shortPrompt = 'short prompt text';
    const results = [makeResult({ prompt: shortPrompt })];
    const { lastFrame } = render(
      <HistorySearchOverlay
        {...defaultProps({ query: 'short', results })}
      />,
    );
    expect(lastFrame()).toContain(shortPrompt);
  });

  it('should show relative time for results', () => {
    // Create a timestamp from 5 minutes ago
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const results = [makeResult({ timestamp: fiveMinAgo })];
    const { lastFrame } = render(
      <HistorySearchOverlay
        {...defaultProps({ query: 'test', results })}
      />,
    );
    expect(lastFrame()).toContain('5m ago');
  });

  it('should show seconds for very recent entries', () => {
    const tenSecAgo = new Date(Date.now() - 10 * 1000).toISOString();
    const results = [makeResult({ timestamp: tenSecAgo })];
    const { lastFrame } = render(
      <HistorySearchOverlay
        {...defaultProps({ query: 'test', results })}
      />,
    );
    expect(lastFrame()).toContain('10s ago');
  });

  it('should show hours for older entries', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const results = [makeResult({ timestamp: threeHoursAgo })];
    const { lastFrame } = render(
      <HistorySearchOverlay
        {...defaultProps({ query: 'test', results })}
      />,
    );
    expect(lastFrame()).toContain('3h ago');
  });

  it('should show days for entries older than 24 hours', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const results = [makeResult({ timestamp: twoDaysAgo })];
    const { lastFrame } = render(
      <HistorySearchOverlay
        {...defaultProps({ query: 'test', results })}
      />,
    );
    expect(lastFrame()).toContain('2d ago');
  });

  it('should render the query text in the search input', () => {
    const { lastFrame } = render(
      <HistorySearchOverlay {...defaultProps({ query: 'my query' })} />,
    );
    expect(lastFrame()).toContain('my query');
  });

  it('should render footer navigation hints', () => {
    const { lastFrame } = render(
      <HistorySearchOverlay {...defaultProps()} />,
    );
    const output = lastFrame() || '';
    expect(output).toContain('navigate');
    expect(output).toContain('Enter');
    expect(output).toContain('Esc');
  });

  it('should render the search prompt indicator', () => {
    const { lastFrame } = render(
      <HistorySearchOverlay {...defaultProps()} />,
    );
    expect(lastFrame()).toContain('>');
  });
});
