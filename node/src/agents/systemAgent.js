'use strict';
/**
 * SystemAgent — Windows desktop automation specialist
 *
 * Translates natural-language system control requests into
 * precise windows-control plugin calls.
 * Capabilities: mouse, keyboard, screenshots, processes,
 * window management, clipboard, notifications, system info.
 */
const { complete } = require('../llm');

const name       = 'SystemAgent';
const role       = 'Windows system and desktop automation';
const canApprove = false;

// Lazy-load the windows-control plugin so unit tests on non-Windows don't crash
function getWinCtrl() {
  return require('../../../tools/windows-control/index.js');
}

const REQUIRED_SKILLS = ['getContext', 'writeback'];

// ── Intent parser ─────────────────────────────────────────────────────────────
// Maps natural-language task phrases to structured action objects
function parseIntent(task) {
  const t = task.toLowerCase();

  if (/screenshot|screen.?shot|capture screen|take.?a.?picture/.test(t))
    return { action: 'screenshot' };

  if (/system.?info|cpu|memory|ram|disk.?space|uptime|computer.?name/.test(t))
    return { action: 'system_info' };

  if (/clipboard/.test(t) && /get|read|copy|what/.test(t))
    return { action: 'get_clipboard' };

  if (/list.?process|running.?process|what.*running|processes/.test(t))
    return { action: 'list_processes' };

  if (/list.?window|open.?window|what.?windows/.test(t))
    return { action: 'list_windows' };

  if (/notify|notification|toast|alert/.test(t)) {
    const msgMatch = task.match(/(?:say|message|notify|alert)[:\s]+["']?(.+?)["']?$/i);
    return { action: 'send_notification', message: msgMatch ? msgMatch[1] : task, heading: 'Octopus' };
  }

  if (/volume/.test(t)) {
    const vol = task.match(/\b(\d{1,3})\b/);
    if (vol) return { action: 'set_volume', volume: parseInt(vol[1]) };
    if (/mute/.test(t)) return { action: 'set_volume', volume: 0 };
    if (/max|full/.test(t)) return { action: 'set_volume', volume: 100 };
  }

  if (/open|launch|start/.test(t) && !/window/.test(t)) {
    const appMatch = task.match(/(?:open|launch|start)\s+(.+)/i);
    if (appMatch) return { action: 'start_process', process: appMatch[1].trim() };
  }

  if (/kill|close|stop|end process/.test(t)) {
    const procMatch = task.match(/(?:kill|close|stop|end)\s+(?:process\s+)?(.+)/i);
    if (procMatch) return { action: 'kill_process', process: procMatch[1].trim() };
  }

  if (/focus|bring.?up|switch.?to|activate/.test(t)) {
    const winMatch = task.match(/(?:focus|bring.?up|switch.?to|activate)\s+(.+)/i);
    if (winMatch) return { action: 'focus_window', title: winMatch[1].trim() };
  }

  if (/minimize/.test(t)) {
    const winMatch = task.match(/minimize\s+(.+)/i);
    return { action: 'minimize_window', title: winMatch ? winMatch[1].trim() : '' };
  }

  if (/maximize/.test(t)) {
    const winMatch = task.match(/maximize\s+(.+)/i);
    return { action: 'maximize_window', title: winMatch ? winMatch[1].trim() : '' };
  }

  if (/type|type.?in|enter.?text|write/.test(t)) {
    const textMatch = task.match(/(?:type|enter|write)\s+(?:text\s+)?["']?(.+?)["']?$/i);
    if (textMatch) return { action: 'type_text', text: textMatch[1] };
  }

  if (/press|hotkey|shortcut|key.?combo/.test(t)) {
    const keyMatch = task.match(/(?:press|hotkey|shortcut)\s+(.+)/i);
    if (keyMatch) return { action: 'key_press', keys: keyMatch[1].trim() };
  }

  if (/move.?mouse/.test(t)) {
    const coords = task.match(/(\d+)[,\s]+(\d+)/);
    if (coords) return { action: 'mouse_move', x: parseInt(coords[1]), y: parseInt(coords[2]) };
  }

  if (/click/.test(t)) {
    const coords = task.match(/(\d+)[,\s]+(\d+)/);
    const btn    = /right/.test(t) ? 'right' : /double/.test(t) ? 'double' : 'left';
    if (coords) return { action: 'mouse_click', x: parseInt(coords[1]), y: parseInt(coords[2]), button: btn };
  }

  if (/copy.?clipboard|clipboard.*=|set.?clipboard/.test(t)) {
    const textMatch = task.match(/(?:set|copy).+clipboard.+["'](.+?)["']/i)
                   || task.match(/clipboard.*=\s*["']?(.+?)["']?$/i);
    if (textMatch) return { action: 'set_clipboard', text: textMatch[1] };
  }

  if (/open.?file|open.?document|open.?folder/.test(t)) {
    const fileMatch = task.match(/open\s+(?:file\s+)?["']?([^'"]+)["']?$/i);
    if (fileMatch) return { action: 'open_file', file: fileMatch[1].trim() };
  }

  return null;
}

// ── LLM fallback — for complex/ambiguous system tasks ─────────────────────────
async function llmPlan(task) {
  const prompt = `You are a Windows desktop automation agent. The user wants to: "${task}"

Respond with a JSON object describing the action to take. Use this schema:
{
  "action": "screenshot|mouse_move|mouse_click|type_text|key_press|get_clipboard|set_clipboard|list_processes|start_process|kill_process|list_windows|focus_window|system_info|send_notification|run_powershell|open_file|set_volume|minimize_window|maximize_window",
  "x": <number, for mouse actions>,
  "y": <number, for mouse actions>,
  "button": "left|right|double",
  "text": "<text to type or clipboard>",
  "keys": "<key combo, e.g. CTRL+C>",
  "process": "<process name>",
  "pid": <pid number>,
  "args": "<args>",
  "title": "<window title>",
  "message": "<notification text>",
  "volume": <0-100>,
  "file": "<file path>",
  "script": "<powershell script>"
}

Respond with ONLY valid JSON. No explanation.`;

  const raw = await complete(prompt, { maxTokens: 300 });
  const clean = (raw || '').replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim();
  return JSON.parse(clean);
}

// ── Agent run ─────────────────────────────────────────────────────────────────
async function run(input, memory) {
  const task = input.task || input.query || '';

  if (!task) return { advice: 'No task provided.', action: null, result: null };

  // Try quick parse first, fall back to LLM for complex requests
  let actionObj = parseIntent(task);
  if (!actionObj) {
    try {
      actionObj = await llmPlan(task);
    } catch {
      actionObj = { action: 'run_powershell', script: `# Could not parse: ${task}` };
    }
  }

  const winCtrl = getWinCtrl();
  let result;
  try {
    result = await winCtrl(actionObj);
  } catch (err) {
    result = { ok: false, error: err.message };
  }

  // Don't include full screenshot base64 in the agent summary
  const summary = result.ok
    ? (actionObj.action === 'screenshot'
        ? `Screenshot captured (${result.base64 ? result.base64.length + ' bytes base64' : 'no data'})`
        : JSON.stringify(result).slice(0, 400))
    : `Error: ${result.error}`;

  // Write back to memory
  try {
    if (memory && typeof memory.writeback === 'function') {
      await memory.writeback('systemagent', {
        task, action: actionObj.action, success: result.ok, summary,
      });
    }
  } catch { /* non-fatal */ }

  return {
    advice:  summary,
    action:  actionObj,
    result:  result.action === 'screenshot' ? { ok: result.ok, format: result.format } : result,
    screenshot_b64: actionObj.action === 'screenshot' ? result.base64 : undefined,
  };
}

module.exports = { name, role, canApprove, run };
