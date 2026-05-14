'use strict';
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const http    = require('http');
const https   = require('https');

const router = express.Router();

const NODE_DIR        = path.join(__dirname, '..');
const ENV_PATH        = path.join(NODE_DIR, '.env');
const ENV_EXAMPLE     = path.join(NODE_DIR, '.env.example');
const SETUP_MARKER    = path.join(NODE_DIR, '.setup-complete');
const SETUP_HTML      = path.join(__dirname, 'setup', 'index.html');

// ── helpers ──────────────────────────────────────────────────────────────────

function isSetupComplete() {
  return fs.existsSync(SETUP_MARKER);
}

function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const result = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    result[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return result;
}

function writeEnv(newVars) {
  // Always read the live .env as base so existing keys are never wiped.
  // Fall back to .env.example only when .env doesn't exist yet (first run).
  const basePath = fs.existsSync(ENV_PATH) ? ENV_PATH
                 : fs.existsSync(ENV_EXAMPLE) ? ENV_EXAMPLE
                 : null;
  let content = basePath ? fs.readFileSync(basePath, 'utf8') : '';

  const applied = new Set();

  // Update lines that already exist in the file
  content = content.replace(/^([A-Z_][A-Z0-9_]*)=(.*)$/gm, (match, key) => {
    if (key in newVars) { applied.add(key); return `${key}=${newVars[key]}`; }
    return match;
  });

  // Append brand-new keys that weren't in the file at all
  for (const [key, val] of Object.entries(newVars)) {
    if (!applied.has(key)) content += `\n${key}=${val}`;
  }

  fs.writeFileSync(ENV_PATH, content, 'utf8');
}

function httpGet(url, ms = 4000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: ms }, (res) => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timed out')); });
  });
}

function httpPost(url, data, headers = {}, ms = 8000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const u    = new URL(url);
    const lib  = u.protocol === 'https:' ? https : http;
    const opts = {
      hostname: u.hostname,
      port:     u.port || (u.protocol === 'https:' ? 443 : 80),
      path:     u.pathname + u.search,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers },
      timeout:  ms,
    };
    const req = lib.request(opts, (res) => {
      let rb = '';
      res.on('data', d => { rb += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: rb }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timed out')); });
    req.write(body);
    req.end();
  });
}

function safeJson(str, fallback = {}) {
  try { return JSON.parse(str); } catch { return fallback; }
}

// ── GET /api/setup/status ─────────────────────────────────────────────────────
router.get('/status', (_req, res) => {
  const c = parseEnv(ENV_PATH);
  res.json({
    setupComplete: isSetupComplete(),
    config: {
      port:               c.PORT                   || '3001',
      provider:           c.LLM_PROVIDER           || '',
      model:              c.LLM_MODEL              || '',
      ollamaUrl:          c.OLLAMA_BASE_URL        || 'http://localhost:11434',
      customHttpUrl:      c.CUSTOM_HTTP_URL        || '',
      customHttpModel:    c.CUSTOM_HTTP_MODEL      || '',
      memoryServiceUrl:   c.MEMORY_SERVICE_URL     || 'http://localhost:5000',
      sovereignFallback:  c.SOVEREIGN_FALLBACK_MODEL || 'gemma4:e2b',
      // Per-role router overrides
      routePlanner:        c.ROUTE_PLANNER        || '',
      routeArchitecture:   c.ROUTE_ARCHITECTURE   || '',
      routeImplementation: c.ROUTE_IMPLEMENTATION || '',
      routeReview:         c.ROUTE_REVIEW         || '',
      routeTesting:        c.ROUTE_TESTING        || '',
      routeSecurity:       c.ROUTE_SECURITY       || '',
      routeVerification:   c.ROUTE_VERIFICATION   || '',
      routeDocumentation:  c.ROUTE_DOCUMENTATION  || '',
      routeResearch:       c.ROUTE_RESEARCH       || '',
      routeAgentic:        c.ROUTE_AGENTIC        || '',
      safeMode:           c.SAFE_MODE              || 'true',
      headlessMode:       c.HEADLESS_MODE          || 'false',
      agentshieldMode:    c.AGENTSHIELD_MODE       || 'advisory',
      maxThinkingTokens:  c.MAX_THINKING_TOKENS    || '10000',
      webhookUrl:         c.OCTOPUS_WEBHOOK_URL    || '',
      redisUrl:           c.REDIS_URL              || '',
      // API key presence only (never send actual keys to browser)
      hasAnthropicKey:    !!c.ANTHROPIC_API_KEY,
      hasOpenAIKey:       !!c.OPENAI_API_KEY,
      hasGoogleKey:       !!c.GOOGLE_API_KEY,
      hasNvidiaKey:       !!c.NVIDIA_API_KEY,
      hasHFToken:         !!c.HF_TOKEN,
      hasOpenRouterKey:   !!c.OPENROUTER_API_KEY,
      hasGitHubToken:     !!c.GITHUB_TOKEN,
      // Gateway presence
      hasTelegramToken:   !!c.TELEGRAM_BOT_TOKEN,
      telegramTokenValid: /^\d+:[A-Za-z0-9_-]{20,}$/.test((c.TELEGRAM_BOT_TOKEN || '').replace(/\s+/g, '')),
      telegramHomeChannel: c.TELEGRAM_HOME_CHANNEL || '',
      hasDiscordToken:    !!c.DISCORD_BOT_TOKEN,
      hasSlackToken:      !!c.SLACK_BOT_TOKEN,
      hasSlackAppToken:   !!c.SLACK_APP_TOKEN,
      hasWhatsappPath:    !!c.WHATSAPP_SESSION_PATH,
      hasSignalPhone:     !!c.SIGNAL_PHONE,
      hasHAUrl:           !!c.HA_URL,
    },
  });
});

// ── POST /api/setup/test-llm ──────────────────────────────────────────────────
router.post('/test-llm', async (req, res) => {
  const { provider, apiKey, model, ollamaUrl, customUrl, customModel } = req.body;

  try {
    if (provider === 'anthropic') {
      const r = await httpPost(
        'https://api.anthropic.com/v1/messages',
        { model: model || 'claude-haiku-4-5-20251001', max_tokens: 16, messages: [{ role: 'user', content: 'PING' }] },
        { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
      );
      const ok  = r.status === 200;
      const err = safeJson(r.body).error?.message;
      return res.json({ ok, hint: ok ? 'Anthropic API connected' : (err || `HTTP ${r.status}`) });
    }

    if (provider === 'openai') {
      const r = await httpPost(
        'https://api.openai.com/v1/chat/completions',
        { model: model || 'gpt-4o-mini', max_tokens: 8, messages: [{ role: 'user', content: 'PING' }] },
        { 'Authorization': `Bearer ${apiKey}` }
      );
      const ok  = r.status === 200;
      const err = safeJson(r.body).error?.message;
      return res.json({ ok, hint: ok ? 'OpenAI API connected' : (err || `HTTP ${r.status}`) });
    }

    if (provider === 'google') {
      const mdl = model || 'gemini-2.0-flash';
      const r   = await httpPost(
        `https://generativelanguage.googleapis.com/v1beta/models/${mdl}:generateContent?key=${apiKey}`,
        { contents: [{ parts: [{ text: 'PING' }] }] }
      );
      const ok  = r.status === 200;
      const err = safeJson(r.body).error?.message;
      return res.json({ ok, hint: ok ? 'Google Gemini connected' : (err || `HTTP ${r.status}`) });
    }

    if (provider === 'ollama') {
      const base = (ollamaUrl || 'http://localhost:11434').replace(/\/$/, '');
      const r    = await httpGet(`${base}/api/tags`, 4000);
      const ok   = r.status === 200;
      const models = ok ? (safeJson(r.body).models || []).map(m => m.name) : [];
      return res.json({ ok, hint: ok ? `Ollama running — models: ${models.join(', ') || 'none pulled'}` : 'Cannot reach Ollama', models });
    }

    if (provider === 'nvidia') {
      const r = await httpPost(
        'https://integrate.api.nvidia.com/v1/chat/completions',
        { model: model || 'meta/llama-3.1-8b-instruct', max_tokens: 8, messages: [{ role: 'user', content: 'PING' }] },
        { 'Authorization': `Bearer ${apiKey}` }
      );
      const ok = r.status === 200;
      return res.json({ ok, hint: ok ? 'NVIDIA NIM connected' : (safeJson(r.body).detail || `HTTP ${r.status}`) });
    }

    if (provider === 'huggingface') {
      const mdl = model || 'google/gemma-3-4b-it';
      const r   = await httpPost(
        `https://api-inference.huggingface.co/models/${mdl}/v1/chat/completions`,
        { model: mdl, max_tokens: 8, messages: [{ role: 'user', content: 'PING' }] },
        { 'Authorization': `Bearer ${apiKey}` }
      );
      const ok = r.status === 200;
      return res.json({ ok, hint: ok ? 'HuggingFace API connected' : `HTTP ${r.status} — check token or model name` });
    }

    if (provider === 'openrouter') {
      const r = await httpPost(
        'https://openrouter.ai/api/v1/chat/completions',
        { model: model || 'nousresearch/hermes-3-llama-3.1-405b', max_tokens: 8, messages: [{ role: 'user', content: 'PING' }] },
        { 'Authorization': `Bearer ${apiKey}` }
      );
      const ok = r.status === 200;
      return res.json({ ok, hint: ok ? 'OpenRouter connected' : `HTTP ${r.status}` });
    }

    if (provider === 'custom_http') {
      if (!customUrl) return res.json({ ok: false, hint: 'No URL configured' });
      const r = await httpPost(
        `${customUrl.replace(/\/$/, '')}/v1/chat/completions`,
        { model: customModel || 'default', max_tokens: 8, messages: [{ role: 'user', content: 'PING' }] }
      );
      const ok = r.status === 200;
      return res.json({ ok, hint: ok ? 'Custom endpoint connected' : `HTTP ${r.status}` });
    }

    if (provider === 'router') {
      return res.json({ ok: true, hint: 'Router mode — uses best available model per task (no test needed)' });
    }

    res.json({ ok: false, hint: `Unknown provider: ${provider}` });
  } catch (err) {
    res.json({ ok: false, hint: err.message });
  }
});

// ── POST /api/setup/test-service ──────────────────────────────────────────────
router.post('/test-service', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.json({ ok: false, hint: 'No URL' });
  try {
    const r = await httpGet(url, 3000);
    res.json({ ok: r.status < 400, hint: `HTTP ${r.status}` });
  } catch (err) {
    res.json({ ok: false, hint: err.message });
  }
});

// ── GET /api/setup/test-service (query-param form for GET requests) ───────────
router.get('/test-service', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.json({ ok: false, hint: 'No URL' });
  try {
    const r = await httpGet(url, 3000);
    res.json({ ok: r.status < 400, hint: `HTTP ${r.status}` });
  } catch (err) {
    res.json({ ok: false, hint: err.message });
  }
});

// ── GET /api/setup/test-telegram — tests saved token without exposing it ──────
router.get('/test-telegram', async (req, res) => {
  const tok = (process.env.TELEGRAM_BOT_TOKEN || '').replace(/\s+/g, '');
  if (!tok) return res.json({ ok: false, hint: 'No token saved in .env' });
  try {
    const r = await httpGet(`https://api.telegram.org/bot${tok}/getMe`, 5000);
    const body = safeJson(r.body);
    if (r.status === 200 && body.ok) {
      res.json({ ok: true, hint: `Bot: @${body.result.username}` });
    } else {
      res.json({ ok: false, hint: body.description || `HTTP ${r.status}` });
    }
  } catch (err) {
    res.json({ ok: false, hint: err.message });
  }
});

// ── POST /api/setup/save ──────────────────────────────────────────────────────
router.post('/save', (req, res) => {
  const { config, complete } = req.body;
  if (!config) return res.status(400).json({ error: 'No config' });

  try {
    const toWrite = {};
    for (const [k, v] of Object.entries(config)) {
      // Skip blank strings — keep the current value in .env unchanged.
      // Skip '***' masked placeholders — they mean "value already saved, don't overwrite".
      if (v !== '' && v !== '***' && v !== undefined && v !== null) toWrite[k] = v;
    }
    writeEnv(toWrite);

    // Hot-apply to current process
    for (const [k, v] of Object.entries(toWrite)) process.env[k] = v;

    if (complete) fs.writeFileSync(SETUP_MARKER, new Date().toISOString(), 'utf8');

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/setup/reset — re-run setup ─────────────────────────────────────
router.post('/reset', (_req, res) => {
  if (fs.existsSync(SETUP_MARKER)) fs.unlinkSync(SETUP_MARKER);
  res.json({ ok: true });
});

module.exports = { router, isSetupComplete, SETUP_HTML };
