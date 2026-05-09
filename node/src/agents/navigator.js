'use strict';
/**
 * Navigator — Browser
 * Drives agent-browser CLI for web navigation, content capture, and interaction.
 * Cortex spawns this agent when tasks involve URLs, web research, or UI verification.
 */
const { execSync } = require('child_process');
const path = require('path');

const name = 'Navigator';
const role = 'browser';
const canApprove = false;

const BIN_DIR = path.join(__dirname, '../../node_modules/.bin');
const AB = process.platform === 'win32'
  ? path.join(BIN_DIR, 'agent-browser.cmd')
  : path.join(BIN_DIR, 'agent-browser');

function ab(args, timeoutMs = 30000) {
  try {
    const raw = execSync(`"${AB}" ${args} --json`, {
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: 'pipe',
    });
    return JSON.parse(raw);
  } catch (e) {
    const msg = e.stderr || e.message || 'agent-browser error';
    return { error: msg.trim() };
  }
}

async function run(input, _memory) {
  const { url, action, ref, value, task } = input;

  const steps = [];

  if (url) {
    const openResult = ab(`open "${url}"`);
    steps.push({ cmd: 'open', result: openResult });
  }

  if (action === 'click' && ref) {
    const clickResult = ab(`click ${ref}`);
    steps.push({ cmd: 'click', ref, result: clickResult });
  } else if (action === 'fill' && ref && value != null) {
    const fillResult = ab(`fill ${ref} "${value}"`);
    steps.push({ cmd: 'fill', ref, value, result: fillResult });
  } else if (action === 'eval' && value) {
    const evalResult = ab(`eval "${value.replace(/"/g, '\\"')}"`);
    steps.push({ cmd: 'eval', result: evalResult });
  }

  const snapshot = ab('snapshot');
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
      : `Snapshot captured. Use element refs (@e1, @e2 …) for follow-up interactions.`,
  };
}

module.exports = { name, role, canApprove, run };
