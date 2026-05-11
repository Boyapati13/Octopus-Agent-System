#!/usr/bin/env node
'use strict';
/**
 * vault_login.js — Interactive Zero-Key login menu for Octopus.
 *
 * Spawned by the octopus_login MCP tool in a new terminal window.
 * Uses enquirer for a proper select + password prompt.
 *
 * Run directly: node src/vault_login.js
 */
const path     = require('path');
const { spawnSync } = require('child_process');
const chalk    = require('chalk');
const { prompt } = require('enquirer');

const VAULT_SET = path.join(__dirname, 'vault_set.js');

const PROVIDERS = [
  {
    name:  'Anthropic  (claude-sonnet-4-6 · claude-opus-4-7)',
    value: 'anthropic',
    url:   'https://console.anthropic.com/settings/keys',
    hint:  'Generate a key at console.anthropic.com → Settings → API Keys',
  },
  {
    name:  'OpenAI     (gpt-4o · gpt-4.1)',
    value: 'openai',
    url:   'https://platform.openai.com/api-keys',
    hint:  'Generate a key at platform.openai.com → API Keys',
  },
  {
    name:  'Google     (gemini-2.0-flash · gemini-2.5-pro)',
    value: 'google',
    url:   'https://aistudio.google.com/app/apikey',
    hint:  'Generate a key at aistudio.google.com → Get API Key',
  },
  {
    name:  'Vertex AI / AWS Bedrock  (show setup instructions)',
    value: 'enterprise',
    url:   null,
    hint:  null,
  },
];

async function main() {
  console.log(chalk.cyan('\n  🐙 Octopus Authorize — Zero-Key Setup'));
  console.log(chalk.dim('  Keys are stored in the OS Vault (Credential Manager / Keychain / Secret Service)\n'));

  const { provider } = await prompt({
    type:    'select',
    name:    'provider',
    message: 'Choose provider to authorize:',
    choices: PROVIDERS.map(p => ({ message: p.name, value: p.value })),
  });

  // ── Enterprise / Vertex / Bedrock ─────────────────────────────────────────
  if (provider === 'enterprise') {
    console.log(chalk.yellow('\n  Enterprise Provider Setup\n'));
    console.log(chalk.bold('  Vertex AI (Google Cloud):'));
    console.log('    1. Install gcloud CLI: https://cloud.google.com/sdk/docs/install');
    console.log('    2. Run: gcloud auth application-default login');
    console.log('    3. In node/.env: LLM_PROVIDER=google  LLM_MODEL=gemini-2.0-flash');
    console.log('    4. The SDK uses GOOGLE_APPLICATION_CREDENTIALS automatically.\n');
    console.log(chalk.bold('  AWS Bedrock:'));
    console.log('    1. Install AWS CLI: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html');
    console.log('    2. Run: aws configure');
    console.log('    3. A Bedrock adapter is required — see DEPLOYMENT.md for details.\n');
    console.log(chalk.dim('  Press Enter to exit.'));
    await prompt({ type: 'invisible', name: 'x', message: '' }).catch(() => {});
    return;
  }

  // ── API Key flow ──────────────────────────────────────────────────────────
  const info = PROVIDERS.find(p => p.value === provider);
  console.log(chalk.dim(`\n  ${info.hint}`));
  console.log(chalk.cyan(`  Open: ${info.url}\n`));

  const { apiKey } = await prompt({
    type:    'password',
    name:    'apiKey',
    message: `Paste ${info.name.split(' ')[0]} API key:`,
  });

  if (!apiKey || !apiKey.trim()) {
    console.log(chalk.yellow('\n  No key entered — cancelled.\n'));
    process.exit(0);
  }

  // Pipe key to vault_set.js via stdin
  const result = spawnSync('node', [VAULT_SET, provider], {
    input:    apiKey.trim(),
    encoding: 'utf8',
    stdio:    ['pipe', 'inherit', 'inherit'],
  });

  if (result.status !== 0) {
    console.log(chalk.red('\n  Failed to store key in vault. Check that keytar is installed.\n'));
    process.exit(1);
  }

  console.log(chalk.green('\n  Restart the MCP server to use the new key immediately.\n'));

  await prompt({ type: 'invisible', name: 'x', message: 'Press Enter to close' }).catch(() => {});
}

main().catch(err => {
  console.error(chalk.red('\n  ' + err.message + '\n'));
  process.exit(1);
});
