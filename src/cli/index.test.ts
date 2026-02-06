import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { program, run } from './index.js';

describe('CLI', () => {
  it('program is a Command instance', () => {
    expect(program).toBeInstanceOf(Command);
  });

  it('program has name "agentspawn"', () => {
    expect(program.name()).toBe('agentspawn');
  });

  it('run is an async function', () => {
    expect(typeof run).toBe('function');
  });
});
