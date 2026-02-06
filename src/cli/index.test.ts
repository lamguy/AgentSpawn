import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { program } from './index.js';

describe('CLI', () => {
  it('program is a Command instance', () => {
    expect(program).toBeInstanceOf(Command);
  });

  it('start command is registered', () => {
    const cmd = program.commands.find((c) => c.name() === 'start');
    expect(cmd).toBeDefined();
  });

  it('stop command is registered', () => {
    const cmd = program.commands.find((c) => c.name() === 'stop');
    expect(cmd).toBeDefined();
  });

  it('list command is registered', () => {
    const cmd = program.commands.find((c) => c.name() === 'list');
    expect(cmd).toBeDefined();
  });

  it('exec command is registered', () => {
    const cmd = program.commands.find((c) => c.name() === 'exec');
    expect(cmd).toBeDefined();
  });

  it('switch command is registered', () => {
    const cmd = program.commands.find((c) => c.name() === 'switch');
    expect(cmd).toBeDefined();
  });
});
