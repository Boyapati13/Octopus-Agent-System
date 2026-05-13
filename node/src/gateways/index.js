'use strict';
/**
 * gateways/index.js — Gateway auto-loader
 *
 * Initialises all gateways whose required env vars are present.
 * Called once from server.js after broadcastEvent and taskHandler are wired.
 *
 * To add a new gateway:
 *   1. Create gateways/<name>.js following the pattern in existing files
 *   2. Add an entry to GATEWAY_LOADERS below
 */

const manager = require('./manager');

const GATEWAY_LOADERS = [
  {
    name:     'telegram',
    envCheck: 'TELEGRAM_BOT_TOKEN',
    load:     () => require('./telegram'),
  },
  {
    name:     'discord',
    envCheck: 'DISCORD_BOT_TOKEN',
    load:     () => require('./discord'),
  },
  {
    name:     'slack',
    envCheck: 'SLACK_BOT_TOKEN',
    load:     () => require('./slack'),
  },
  {
    name:     'whatsapp',
    envCheck: 'WHATSAPP_SESSION_PATH',
    load:     () => require('./whatsapp'),
    optional: true, // doesn't need env var to attempt (will QR scan)
  },
  {
    name:     'signal',
    envCheck: 'SIGNAL_PHONE',
    load:     () => require('./signal'),
  },
  {
    name:     'home_assistant',
    envCheck: 'HA_URL',
    load:     () => require('./home_assistant'),
  },
];

/**
 * Initialise all gateways that have their required env var set.
 * @param {Function} taskHandler  async (text, ctx) => string — runs an Octopus task
 * @param {Function} broadcastFn  (type, data) => void — WS broadcast
 */
async function initGateways(taskHandler, broadcastFn) {
  manager.setTaskHandler(taskHandler);
  manager.setBroadcast(broadcastFn);

  const results = [];
  for (const { name, envCheck, load, optional } of GATEWAY_LOADERS) {
    if (!optional && !process.env[envCheck]) {
      results.push({ name, status: 'skipped', reason: `${envCheck} not set` });
      continue;
    }
    try {
      const gateway = load();
      const ok = await gateway.init(manager);
      results.push({ name, status: ok ? 'started' : 'failed' });
    } catch (err) {
      console.error(`[gateways] Failed to load ${name}: ${err.message}`);
      results.push({ name, status: 'error', reason: err.message });
    }
  }

  const started = results.filter(r => r.status === 'started').map(r => r.name);
  console.error(`[gateways] Started: [${started.join(', ') || 'none'}]`);
  return results;
}

module.exports = { initGateways, manager };
