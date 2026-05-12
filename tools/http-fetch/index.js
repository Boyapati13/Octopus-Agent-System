'use strict';
/**
 * HTTP Fetch — safe read-only tool plugin.
 * Only allows GET requests to HTTPS URLs or localhost.
 * Strips credentials, limits response size, and rejects private IP ranges.
 */
const https = require('https');
const http  = require('http');

const MAX_BYTES_DEFAULT = 8192;
const MAX_BYTES_HARD    = 32768;

// SSRF guard: block private/link-local ranges
const BLOCKED_PATTERNS = [
  /^https?:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|127\.(?!0\.0\.1)|169\.254\.)/i,
  /^https?:\/\/(?:0\.0\.0\.0|metadata\.google\.internal|169\.254\.169\.254)/i,
];

function isBlockedUrl(url) {
  for (const re of BLOCKED_PATTERNS) {
    if (re.test(url)) return true;
  }
  return false;
}

/**
 * @param {{ url: string, max_bytes?: number }} input
 * @returns {{ status: number, content_type: string, body: string, truncated: boolean }}
 */
module.exports = async function run(input) {
  const rawUrl = String((input && input.url) || '').trim();
  const maxBytes = Math.min(Number(input && input.max_bytes) || MAX_BYTES_DEFAULT, MAX_BYTES_HARD);

  // Validate URL scheme: only https or http://localhost
  if (!/^https:\/\//i.test(rawUrl) && !/^http:\/\/localhost(?::\d+)?/i.test(rawUrl)) {
    throw new Error('http_fetch only allows https:// URLs or http://localhost. Use HTTPS for external URLs.');
  }

  if (isBlockedUrl(rawUrl)) {
    throw new Error('http_fetch: URL resolves to a blocked private/metadata address (SSRF guard).');
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`http_fetch: invalid URL: ${rawUrl}`);
  }

  // Strip any embedded credentials
  parsed.username = '';
  parsed.password = '';
  const cleanUrl = parsed.toString();

  return new Promise((resolve, reject) => {
    const lib = cleanUrl.startsWith('https') ? https : http;
    const req = lib.get(cleanUrl, { timeout: 10000 }, (res) => {
      const chunks = [];
      let total = 0;
      let truncated = false;

      res.on('data', (chunk) => {
        if (total >= maxBytes) {
          truncated = true;
          return;
        }
        const remaining = maxBytes - total;
        chunks.push(chunk.slice(0, remaining));
        total += Math.min(chunk.length, remaining);
        if (total >= maxBytes) truncated = true;
      });

      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          content_type: res.headers['content-type'] || '',
          body: Buffer.concat(chunks).toString('utf8'),
          truncated,
        });
      });

      res.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('http_fetch: request timed out (10s)'));
    });
  });
};
