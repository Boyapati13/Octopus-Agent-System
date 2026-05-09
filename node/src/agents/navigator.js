'use strict';
/**
 * Navigator — Browser
 * Drives agent-browser CLI for web navigation, content capture, and interaction.
 * Cortex spawns this agent when tasks involve URLs, web research, or UI verification.
 *
 * Fix: uses execFile (async, non-blocking) instead of execSync so the Node event
 * loop remains free during browser calls.
 */
const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execFileAsync = promisify(execFile);

const name = 'Navigator';
const role = 'browser';
const canApprove = false;

const BIN_DIR = path.join(__dirname, '../../node_modules/.bin');
const AB = process.platform === 'win32'
  ? path.join(BIN_DIR, 'agent-browser.cmd')
  : path.join(BIN_DIR, 'agent-browser');

// Each call passes an array of args — no shell-escaping needed
async function ab(args, timeoutMs = 30000) {
  try {
    const { stdout } = await execFileAsync(AB, [...args, '--json'], {
      encoding: 'utf8',
      timeout: timeoutMs,
    });
    return JSON.parse(stdout);
  } catch (e) {
    const msg = (e.stderr || e.message || 'agent-browser error').trim();
    return { error: msg };
  }
}

async function run(input, _memory) {
  const { url, action, ref, value, task } = input;

  const steps = [];

  if (url) {
    const openResult = await ab(['open', url]);
    steps.push({ cmd: 'open', result: openResult });
  }

  if (action === 'click' && ref) {
    const clickResult = await ab(['click', ref]);
    steps.push({ cmd: 'click', ref, result: clickResult });
  } else if (action === 'fill' && ref && value != null) {
    const fillResult = await ab(['fill', ref, value]);
    steps.push({ cmd: 'fill', ref, value, result: fillResult });
  } else if (action === 'eval' && value) {
    const evalResult = await ab(['eval', value]);
    steps.push({ cmd: 'eval', result: evalResult });
  }

  const snapshot = await ab(['snapshot']);
  const hasError = snapshot.error || steps.some(s => s.result && s.result.error);

  return {
    agent: name,
    role,
    task: task || url || 'browser task',
    url: url || null,
    steps_executed: steps,
    snapshot,
    approved: !hasError,
    advice: hasError
      ? 'Browser action encountered an error. Ensure agent-browser is installed (npm install) and the daemon is running.'
      : 'Snapshot captured. Use element refs (@e1, @e2 …) for follow-up interactions.',
  };
}

module.exports = { name, role, canApprove, run };
