#!/usr/bin/env node

import { run } from './cli/index.js';
import { AgentSpawnError } from './utils/errors.js';

try {
  await run(process.argv);
} catch (e) {
  if (e instanceof AgentSpawnError) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
  console.error('An unexpected error occurred');
  process.exit(2);
}
