'use strict';
const fs   = require('fs');
const path = require('path');

const DATA_DIR   = path.join(__dirname, '..', '..', 'data');
const MEMORY_FILE = path.join(DATA_DIR, 'octo_memory.json');

function load() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(MEMORY_FILE)) return [];
    return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
  } catch (_) { return []; }
}

function save(memories) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memories, null, 2), 'utf8');
  } catch (err) {
    console.error('[memory] save failed:', err.message);
  }
}

function add(text, context) {
  const memories = load();
  memories.push({ id: Date.now(), text: text.trim(), context: context || '', created_at: new Date().toISOString() });
  // keep last 200 memories
  if (memories.length > 200) memories.splice(0, memories.length - 200);
  save(memories);
  return memories[memories.length - 1];
}

function all() { return load(); }

function remove(id) {
  const memories = load().filter(m => m.id !== Number(id));
  save(memories);
}

// Format most recent N memories as a context block for prompt injection
function format(limit) {
  const recent = load().slice(-(limit || 10));
  if (!recent.length) return '';
  return 'OCTO memory (things I know):\n' + recent.map(m => `- ${m.text}`).join('\n');
}

// Detect if text is a "remember X" command
// Returns the thing to remember, or null
function detectRemember(text) {
  const t = text.trim();
  const m = t.match(/^(?:octo[,]?\s+)?(?:please\s+)?remember\s+(?:that\s+)?(.+)$/i)
         || t.match(/^(?:please\s+)?remember\s+(?:that\s+)?(.+)$/i);
  return m ? m[1].trim() : null;
}

module.exports = { add, all, remove, format, detectRemember };
