#!/usr/bin/env node
'use strict';
/**
 * vault_set.js — OS-Vault credential writer for Octopus.
 *
 * Stores an API key for the given provider using a 2-tier write strategy:
 *   1. OS Vault (keytar) — Windows Credential Manager / macOS Keychain / Linux Secret Service
 *   2. CLI Session file  (~/.octopus/sessions.json, mode 0600) — fallback when keytar unavailable
 *
 * Two calling conventions:
 *
 *   Pipe mode  (MCP login window / migration):
 *     echo "<key>" | node vault_set.js <provider>
 *
 *   Interactive TTY mode  (direct CLI use):
 *     node vault_set.js <provider>
 *     → masked prompt appears; input not echoed
 */
const fs       = require('fs');
const os       = require('os');
const path     = require('path');
const readline = require('readline');

const SERVICE      = 'Octopus_Vault';
const SESSION_DIR  = path.join(os.homedir(), '.octopus');
const SESSION_FILE = path.join(SESSION_DIR, 'sessions.json');

const LABELS = {
  anthropic: 'Anthropic',
  openai:    'OpenAI',
  google:    'Google',
};

function readStdin() {
  return new Promise((resolve) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { buf += chunk; });
    process.stdin.on('end', () => resolve(buf.trim()));
    process.stdin.resume();
  });
}

function readMaskedTTY(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl._writeToOutput = (str) => {
      if (str === '\r\n' || str === '\n' || str === '\r') {
        rl.output.write('\n');
      } else if (str.charCodeAt(0) === 127) {
        rl.output.write('\b \b');
      } else if (str.charCodeAt(0) >= 32) {
        rl.output.write('*');
      }
    };
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function storeKey(provider, key) {
  // Try OS Vault first
  let keytar;
  try { keytar = require('keytar'); } catch { /* not available */ }
  if (keytar) {
    try {
      await keytar.setPassword(SERVICE, provider, key);
      process.stdout.write(`✅ ${LABELS[provider]} linked via OS Vault. No .env required.\n`);
      return;
    } catch { /* vault write failed — fall through */ }
  }

  // Fallback: CLI session file (~/.octopus/sessions.json, mode 0600)
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  let sessions = {};
  try { sessions = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')); } catch { /* no existing file */ }
  sessions[provider] = key;
  fs.writeFileSync(SESSION_FILE, JSON.stringify(sessions, null, 2), { mode: 0o600 });
  process.stdout.write(`✅ ${LABELS[provider]} linked via CLI Session (~/.octopus/sessions.json). No .env required.\n`);
}

async function main() {
  const provider = process.argv[2];
  if (!provider || !LABELS[provider]) {
    process.stderr.write(`Usage: node vault_set.js <provider>\nProviders: ${Object.keys(LABELS).join(', ')}\n`);
    process.exit(1);
  }

  let key;
  if (process.stdin.isTTY) {
    process.stdout.write(`\nOctopus Login — ${LABELS[provider]}\n`);
    process.stdout.write('──────────────────────────────\n');
    key = await readMaskedTTY('Enter API key (hidden): ');
  } else {
    key = await readStdin();
  }

  if (!key) {
    process.stderr.write('No key provided — aborted.\n');
    process.exit(1);
  }

  await storeKey(provider, key);
}

main().catch(err => { process.stderr.write(err.message + '\n'); process.exit(1); });
