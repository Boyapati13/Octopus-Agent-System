'use strict';
/**
 * CLI entry point — kept for backward compatibility.
 * Pass --serve to start the API server instead.
 */
const fs     = require('fs');
const memory = require('./memory');
const { runAgent } = require('./agents');

async function main() {
  const command = process.argv[2];
  const arg     = process.argv[3] || '';

  if (command === '--serve') {
    require('./server');
    return;
  }

  let result;
  switch (command) {
    case '/onboard': {
      const files = await memory.searchStructural('');
      result = {
        command, indexed_files: files.length,
        sample: files.slice(0, 5).map(f => f.path),
        advice: 'Memory loaded. Query Atlas before opening any files.',
      };
      break;
    }
    case '/plan-feature':
      result = await runAgent('cortex', { task: arg || 'feature', query: arg }, memory);
      break;
    case '/release-check':
      result = await runAgent('releaseKeeper', { task: 'release check' }, memory);
      break;
    case '/run-agent': {
      const name  = arg;
      const input = process.argv[4] ? JSON.parse(process.argv[4]) : {};
      result = await runAgent(name, input, memory);
      break;
    }
    default:
      result = {
        error: 'Unknown command',
        supported: ['/onboard', '/plan-feature', '/release-check', '/run-agent <name> <json>', '--serve'],
      };
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => { console.error(err.message); process.exit(1); });
