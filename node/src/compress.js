'use strict';
/**
 * Caveman-style prose compression — ported from JuliusBrussee/caveman (MIT).
 * Strips filler words/articles/leaders while preserving code, URLs, paths, identifiers.
 * ~65-75% token reduction on prose fields.
 */

const PROTECTED_PATTERNS = [
  /```[\s\S]*?```/g,            // fenced code blocks
  /`[^`]+`/g,                   // inline code
  /https?:\/\/\S+/g,            // URLs
  /[\w./-]*[/\\][\w./-]+/g,    // file paths
  /\b[A-Z][A-Z0-9_]{2,}\b/g,   // CONST_CASE identifiers
  /\w+\.\w+\(/g,                // dotted method calls
  /\w+\(\)/g,                   // bare function calls
  /\d+\.\d+\.\d+/g,            // version numbers (x.y.z)
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
  const before = typeof text === 'string' ? text.length : 0;
  const compressed = compressProse(text);
  const after = typeof compressed === 'string' ? compressed.length : 0;
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

module.exports = { compress, compressProse, compressDescriptionsInPlace, withProtectedSegments };
