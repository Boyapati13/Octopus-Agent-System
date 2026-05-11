#!/usr/bin/env node
'use strict';
/**
 * vault_preflight.js — vault presence check for start_mcp scripts.
 *
 * Usage:
 *   node vault_preflight.js check <provider>
 *   Outputs '1' if key exists in vault or session file, '0' if not.
 *   Exits 0 in both cases; exits 1 only on hard errors.
 */
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const SESSION_FILE = path.join(os.homedir(), '.octopus', 'sessions.json');
const [,, action, provider] = process.argv;

async function main() {
  if (!provider) {
    process.stderr.write('Usage: vault_preflight.js check <provider>\n');
    process.exit(1);
  }

  if (action === 'check') {
    // Check OS Vault
    let keytar;
    try { keytar = require('keytar'); } catch { /* not available */ }
    if (keytar) {
      try {
        const val = await keytar.getPassword('Octopus_Vault', provider);
        if (val) { process.stdout.write('1'); return; }
      } catch { /* vault unavailable */ }
    }

    // Check CLI session file
    try {
      const sessions = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      if (sessions[provider]) { process.stdout.write('1'); return; }
    } catch { /* session file absent */ }

    process.stdout.write('0');
    return;
  }

  process.stderr.write(`Unknown action: ${action}\n`);
  process.exit(1);
}

main().catch(err => { process.stderr.write(err.message + '\n'); process.exit(1); });
