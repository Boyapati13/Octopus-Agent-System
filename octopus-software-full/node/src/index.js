const fs = require('fs');
const path = require('path');
const { onboard, planFeature, releaseCheck } = require('./commands');

function main() {
  const command = process.argv[2];
  const dataDir = process.argv[3] || './data';
  const arg = process.argv[4] || '';

  if (!fs.existsSync(dataDir)) {
    console.error(`Data dir not found: ${dataDir}`);
    process.exit(1);
  }

  let result;
  switch (command) {
    case '/onboard':
      result = onboard(dataDir);
      break;
    case '/plan-feature':
      result = planFeature(dataDir, arg || 'feature');
      break;
    case '/release-check':
      result = releaseCheck(dataDir);
      break;
    default:
      result = {
        error: 'Unknown command',
        supported: ['/onboard', '/plan-feature', '/release-check']
      };
  }

  console.log(JSON.stringify(result, null, 2));
}

main();
