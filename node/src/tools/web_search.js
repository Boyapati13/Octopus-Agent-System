'use strict';
/**
 * web_search.js — Multi-engine web search tool
 *
 * Engine priority (auto-selected):
 *   1. SerpAPI        if SERP_API_KEY is set      → Google results
 *   2. Brave Search   if BRAVE_API_KEY is set      → Privacy-first, clean JSON
 *   3. DuckDuckGo     (no key required)            → HTML scrape fallback
 *   4. NVIDIA Solar   if NVIDIA_API_KEY is set     → Built-in LLM web search
 *
 * Usage:
 *   const { search } = require('./tools/web_search');
 *   const results = await search('latest news about octopus agents', { limit: 5 });
 *   // returns [{ title, url, snippet }, ...]
 */

const axios = require('axios');

// ── Helpers ──────────────────────────────────────────────────────────────────

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(str, n = 280) {
  return str.length > n ? str.slice(0, n) + '…' : str;
}

// ── Engine 1: SerpAPI (Google results) ──────────────────────────────────────
async function serpSearch(query, opts = {}) {
  const key    = process.env.SERP_API_KEY;
  const limit  = opts.limit || 8;
  const res    = await axios.get('https://serpapi.com/search', {
    params: { q: query, api_key: key, num: limit, hl: 'en', gl: 'us' },
    timeout: 12000,
  });
  const items = res.data.organic_results || [];
  return items.slice(0, limit).map(r => ({
    title:   r.title || '',
    url:     r.link  || '',
    snippet: truncate(r.snippet || ''),
    source:  'serp',
  }));
}

// ── Engine 2: Brave Search API ───────────────────────────────────────────────
async function braveSearch(query, opts = {}) {
  const key   = process.env.BRAVE_API_KEY;
  const limit = opts.limit || 8;
  const res   = await axios.get('https://api.search.brave.com/res/v1/web/search', {
    params:  { q: query, count: limit, search_lang: 'en', country: 'us' },
    headers: { 'Accept': 'application/json', 'X-Subscription-Token': key },
    timeout: 10000,
  });
  const items = res.data.web?.results || [];
  return items.slice(0, limit).map(r => ({
    title:   r.title       || '',
    url:     r.url         || '',
    snippet: truncate(r.description || ''),
    source:  'brave',
  }));
}

// ── Engine 3: DuckDuckGo (no key required) ──────────────────────────────────
// Uses DDG's Instant Answer API for fast results + HTML scrape for web links
async function duckSearch(query, opts = {}) {
  const limit = opts.limit || 8;

  // First try Instant Answer API (abstract + related topics)
  const iaRes = await axios.get('https://api.duckduckgo.com/', {
    params: {
      q:          query,
      format:     'json',
      no_html:    1,
      no_redirect: 1,
      skip_disambig: 1,
    },
    timeout: 8000,
    headers: { 'User-Agent': 'Octopus-Agent/2.0' },
  });

  const ia = iaRes.data;
  const results = [];

  if (ia.AbstractText) {
    results.push({
      title:   ia.Heading || query,
      url:     ia.AbstractURL || '',
      snippet: truncate(ia.AbstractText),
      source:  'ddg-ia',
    });
  }

  for (const t of ia.RelatedTopics || []) {
    if (results.length >= limit) break;
    if (t.FirstURL && t.Text) {
      results.push({
        title:   t.Text.split(' - ')[0] || t.FirstURL,
        url:     t.FirstURL,
        snippet: truncate(t.Text),
        source:  'ddg-ia',
      });
    }
  }

  // If we don't have enough results, scrape DDG HTML
  if (results.length < 3) {
    try {
      const htmlRes = await axios.get('https://html.duckduckgo.com/html/', {
        params:  { q: query },
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Octopus-Agent/2.0)',
          'Accept':     'text/html',
        },
      });
      const html = htmlRes.data || '';
      // Extract result links and snippets via regex
      const linkRe  = /class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
      const snipRe  = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
      const links   = [];
      const snips   = [];
      let m;
      while ((m = linkRe.exec(html)) !== null) {
        // DDG wraps real URLs: //duckduckgo.com/l/?uddg=<encoded-url>
        let url = m[1];
        if (url.includes('uddg=')) {
          try { url = decodeURIComponent(url.split('uddg=')[1].split('&')[0]); } catch {}
        }
        if (!url.startsWith('http')) url = 'https:' + url;
        links.push({ url, title: stripHtml(m[2]) });
      }
      while ((m = snipRe.exec(html)) !== null) snips.push(stripHtml(m[1]));
      for (let i = 0; i < Math.min(links.length, limit - results.length); i++) {
        results.push({
          title:   links[i].title,
          url:     links[i].url,
          snippet: truncate(snips[i] || ''),
          source:  'ddg-html',
        });
      }
    } catch (_) { /* HTML scrape failed — keep IA results */ }
  }

  return results.slice(0, limit);
}

// ── Engine 4: NVIDIA Solar (LLM with built-in search) ───────────────────────
async function solarSearch(query, opts = {}) {
  const apiKey = process.env.NVIDIA_API_KEY;
  const res    = await axios.post(
    'https://integrate.api.nvidia.com/v1/chat/completions',
    {
      model:      'upstage/solar-pro-preview-with-search',
      messages:   [{ role: 'user', content: `Search the web and answer: ${query}` }],
      max_tokens: opts.maxTokens || 2048,
      stream:     false,
    },
    {
      headers:  { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout:  20000,
    }
  );
  const answer = res.data.choices[0].message.content || '';
  return [{
    title:   'Solar Search Answer',
    url:     '',
    snippet: truncate(answer, 1200),
    source:  'solar',
    full:    answer,
  }];
}

// ── Main dispatcher ──────────────────────────────────────────────────────────

/**
 * Search the web using the best available engine.
 * @param {string} query
 * @param {{ limit?: number, engine?: 'serp'|'brave'|'ddg'|'solar'|'auto' }} opts
 * @returns {Promise<Array<{title:string, url:string, snippet:string, source:string}>>}
 */
async function search(query, opts = {}) {
  if (!query || !query.trim()) return [];

  const engine = (opts.engine || 'auto').toLowerCase();

  if (engine === 'serp' || (engine === 'auto' && process.env.SERP_API_KEY)) {
    return serpSearch(query, opts);
  }
  if (engine === 'brave' || (engine === 'auto' && process.env.BRAVE_API_KEY)) {
    return braveSearch(query, opts);
  }
  if (engine === 'solar' || (engine === 'auto' && process.env.NVIDIA_API_KEY && opts.useSolar)) {
    return solarSearch(query, opts);
  }
  return duckSearch(query, opts);
}

/**
 * Format search results as a compact markdown string for LLM consumption.
 */
function formatResults(results) {
  if (!results.length) return 'No results found.';
  return results.map((r, i) =>
    `[${i + 1}] **${r.title}**\n${r.url ? `URL: ${r.url}\n` : ''}${r.snippet}`
  ).join('\n\n');
}

module.exports = { search, formatResults };
