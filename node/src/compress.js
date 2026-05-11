'use strict';
/**
 * Prose compression + Strategic Compaction (ECC-port)
 *
 * Two modes:
 *   compressProse()       — caveman strip (~65-75% reduction, always-on)
 *   strategicCompact()    — milestone-aware aggressive compaction
 *
 * Strategic Compaction (from ECC's strategic-compact skill):
 *   - Suggested after 50 tool calls (COMPACT_THRESHOLD)
 *   - Reminded every 25 calls thereafter
 *   - Strips resolved context, keeps live decision trail
 *   - Never triggers mid-implementation; only at logical boundaries
 */

// ── Caveman compression ───────────────────────────────────────────────────────

const PROTECTED_PATTERNS = [
  /```[\s\S]*?```/g,
  /`[^`]+`/g,
  /https?:\/\/\S+/g,
  /[\w./-]*[/\\][\w./-]+/g,
  /\b[A-Z][A-Z0-9_]{2,}\b/g,
  /\w+\.\w+\(/g,
  /\w+\(\)/g,
  /\d+\.\d+\.\d+/g,
];

const LEADERS      = /\b(I'll|I will|you can|we will|let me)\b\s*/gi;
const PLEASANTRIES = /\b(please|thanks|certainly|of course)\b\s*/gi;
const HEDGES       = /\b(perhaps|maybe|might|could potentially)\b\s*/gi;
const FILLERS      = /\b(just|really|basically|actually|simply|quite|very)\b\s*/gi;
const ARTICLES     = /\b(a|an|the)\b\s*/gi;

function withProtectedSegments(text, transform) {
  const saved = [];
  let idx = 0;
  let guarded = text;
  for (const re of PROTECTED_PATTERNS) {
    guarded = guarded.replace(new RegExp(re.source, re.flags), match => {
      saved.push(match);
      return `\x00${idx++}\x00`;
    });
  }
  const transformed = transform(guarded);
  return transformed.replace(/\x00(\d+)\x00/g, (_, i) => saved[+i] || '');
}

function compressProse(text) {
  if (typeof text !== 'string' || !text) return text;
  return withProtectedSegments(text, t =>
    t
      .replace(LEADERS, '')
      .replace(PLEASANTRIES, '')
      .replace(HEDGES, '')
      .replace(FILLERS, '')
      .replace(ARTICLES, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  );
}

function compress(text) {
  const before     = typeof text === 'string' ? text.length : 0;
  const compressed = compressProse(text);
  const after      = typeof compressed === 'string' ? compressed.length : 0;
  return { compressed, before, after, saved: before - after };
}

function compressDescriptionsInPlace(obj, fieldNames = ['description']) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    obj.forEach(item => compressDescriptionsInPlace(item, fieldNames));
    return obj;
  }
  for (const key of Object.keys(obj)) {
    if (fieldNames.includes(key) && typeof obj[key] === 'string') {
      obj[key] = compressProse(obj[key]);
    } else if (typeof obj[key] === 'object') {
      compressDescriptionsInPlace(obj[key], fieldNames);
    }
  }
  return obj;
}

// ── Strategic Compaction (ECC strategic-compact skill) ────────────────────────

const COMPACT_THRESHOLD          = parseInt(process.env.COMPACT_THRESHOLD) || 50;
const COMPACT_REMINDER_INTERVAL  = parseInt(process.env.COMPACT_REMINDER_INTERVAL) || 25;

// Milestones indicate safe compaction points (from ECC's strategic-compact docs)
const MILESTONE_PATTERNS = [
  /research.*complete|exploration.*done/i,
  /milestone.*complete|phase.*complete/i,
  /tests.*pass(?:ing|ed)?/i,
  /implementation.*done|feature.*shipped/i,
  /debugging.*resolved|bug.*fixed/i,
];

function isAtMilestone(text = '') {
  return MILESTONE_PATTERNS.some(re => re.test(text));
}

/**
 * Aggressive context reduction for milestone boundaries.
 * Removes resolved sections while preserving decision trail.
 */
function strategicCompact(text, milestone = false) {
  if (typeof text !== 'string' || !text) return text;

  // Always apply base compression first
  let result = compressProse(text);

  if (!milestone) return result;

  // At milestones: also strip resolved/completed markers
  const RESOLVED_MARKERS = [
    /✅[^\n]*/g,                          // completed checkboxes
    /DONE:[^\n]*/gi,                       // done markers
    /\[x\][^\n]*/gi,                       // checked items
    /previously.*(?:decided|resolved|fixed)[^\n]*/gi,
    /\(already implemented\)[^\n]*/gi,
  ];

  for (const re of RESOLVED_MARKERS) {
    result = result.replace(re, '');
  }

  return result.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Determine whether a compaction should be suggested.
 * @param {number} toolCallCount — total tool calls in current session
 * @param {string} [lastNote]    — last agent advice string (milestone detection)
 * @returns {{ suggest: boolean, reason: string }}
 */
function shouldSuggestCompaction(toolCallCount, lastNote = '') {
  const atMilestone = isAtMilestone(lastNote);

  if (toolCallCount >= COMPACT_THRESHOLD && atMilestone) {
    return { suggest: true, reason: `${toolCallCount} tool calls + milestone detected — ideal compaction point` };
  }
  if (toolCallCount >= COMPACT_THRESHOLD && toolCallCount % COMPACT_REMINDER_INTERVAL === 0) {
    return { suggest: true, reason: `${toolCallCount} tool calls — consider compacting before next phase` };
  }
  return { suggest: false, reason: '' };
}

module.exports = {
  compress, compressProse, compressDescriptionsInPlace, withProtectedSegments,
  strategicCompact, shouldSuggestCompaction, isAtMilestone,
  COMPACT_THRESHOLD, COMPACT_REMINDER_INTERVAL,
};
