'use strict';
/**
 * Multi-LLM Gateway — Cross-Market Router
 * Routes completions to Anthropic, OpenAI, Google, or Ollama.
 *
 * Caller-aware routing via OCTOPUS_CALLER env var (set per MCP client):
 *   OCTOPUS_CALLER=claude   → anthropic / claude-sonnet-4-6  (default)
 *   OCTOPUS_CALLER=openai   → openai    / gpt-4o
 *   OCTOPUS_CALLER=gemini   → google    / gemini-2.5-pro
 *   OCTOPUS_CALLER=ollama   → ollama    / gemma4:e2b  (local, no key needed)
 *   OCTOPUS_CALLER=nvidia   → nvidia    / meta/llama-3.1-405b-instruct (free tier)
 *   OCTOPUS_CALLER=cursor   → uses LLM_PROVIDER/LLM_MODEL (no override)
 *   (unset)                 → uses LLM_PROVIDER/LLM_MODEL env vars
 *
 * Sovereign Fallback: if selected provider has no key, auto-routes to
 * local Ollama (SOVEREIGN_FALLBACK_MODEL, default: gemma4:e2b).
 *
 * Key retrieval — 4-tier Cascade Resolver (getSecureKey):
 *   1. OS Vault    — keytar → Windows Credential Manager / macOS Keychain / Linux Secret Service
 *   2. CLI Session — ~/.octopus/sessions.json (written by octopus_login; cross-platform fallback)
 *   3. Process Env — externally set, parent shell, or dotenv-sourced before start
 *   4. .env file   — node/.env direct parse (plain-text last resort)
 */
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const axios = require('axios');

// Caller-aware provider + model presets
// OCTOPUS_CALLER is set in the MCP client's env block — MCP stdio has no built-in caller identity
const CALLER = (process.env.OCTOPUS_CALLER || '').toLowerCase();
const CALLER_PRESETS = {
  claude:    { provider: 'anthropic', model: 'claude-sonnet-4-6'          },
  openai:    { provider: 'openai',    model: 'gpt-4o'                     },
  gemini:    { provider: 'google',    model: 'gemini-2.5-pro'             },
  ollama:    { provider: 'ollama',    model: 'gemma4:e2b'                 },
  nvidia:    { provider: 'nvidia',    model: 'meta/llama-3.1-405b-instruct' },
  // cursor/windsurf/continue defer to LLM_PROVIDER/LLM_MODEL env vars
};
const preset = CALLER_PRESETS[CALLER] || null;

const PROVIDER = preset
  ? preset.provider
  : (process.env.LLM_PROVIDER || 'anthropic').toLowerCase();

const MODEL = process.env.LLM_MODEL || (preset ? preset.model : {
  anthropic: 'claude-sonnet-4-6',
  openai:    'gpt-4o',
  google:    'gemini-2.0-flash',
  ollama:    'llama3.2',
  nvidia:    'meta/llama-3.1-405b-instruct',
}[PROVIDER]) || 'claude-sonnet-4-6';

if (CALLER && preset) {
  console.error(`[llm] Caller preset: OCTOPUS_CALLER=${CALLER} → ${PROVIDER}/${MODEL}`);
}

const MAX_THINKING_TOKENS = parseInt(process.env.MAX_THINKING_TOKENS) || Infinity;
const MAX_RETRIES = 2;

const VAULT_SERVICE  = 'Octopus_Vault';
const SESSION_FILE   = path.join(os.homedir(), '.octopus', 'sessions.json');
const ENV_KEY_MAP    = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai:    'OPENAI_API_KEY',
  google:    'GOOGLE_API_KEY',
  nvidia:    'NVIDIA_API_KEY',
};

/**
 * 4-tier Cascade Resolver:
 *   1. OS Vault  (keytar — Windows CM / macOS Keychain / Linux Secret Service)
 *   2. CLI Session  (~/.octopus/sessions.json — written by octopus_login)
 *   3. Process env  (externally set or parent shell)
 *   4. .env file    (node/.env plain-text last resort)
 */
async function getSecureKey(provider) {
  const envVar = ENV_KEY_MAP[provider];
  if (!envVar) return null;

  // Tier 1 — OS Vault
  let keytar;
  try { keytar = require('keytar'); } catch { /* native module not available */ }
  if (keytar) {
    try {
      const vaultKey = await keytar.getPassword(VAULT_SERVICE, provider);
      if (vaultKey) return vaultKey;
    } catch { /* vault read failed — fall through */ }
  }

  // Tier 2 — CLI Session file
  try {
    const raw = fs.readFileSync(SESSION_FILE, 'utf8');
    const sessions = JSON.parse(raw);
    if (sessions[provider]) return sessions[provider];
  } catch { /* session file absent or malformed */ }

  // Tier 3 — Process environment
  if (process.env[envVar]) return process.env[envVar];

  // Tier 4 — .env file direct parse
  try {
    const envPath = path.join(__dirname, '..', '.env');
    const raw = fs.readFileSync(envPath, 'utf8');
    const match = raw.match(new RegExp(`^${envVar}=(.+)$`, 'm'));
    if (match && match[1].trim()) return match[1].trim();
  } catch { /* .env absent */ }

  return null;
}

function withRetry(fn) {
  let lastErr;
  return (async () => {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    throw lastErr;
  })();
}

async function completeAnthropic(prompt, opts = {}) {
  const apiKey = await getSecureKey('anthropic');
  return withRetry(async () => {
    const res = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: MODEL,
        max_tokens: opts.maxTokens || 1024,
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          'x-api-key':         apiKey || '',
          'anthropic-version': '2023-06-01',
          'content-type':      'application/json',
        },
        timeout: opts.timeout || 30000,
      }
    );
    return res.data.content[0].text;
  });
}

async function completeOpenAI(prompt, opts = {}) {
  const apiKey = await getSecureKey('openai');
  return withRetry(async () => {
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: MODEL,
        max_tokens: opts.maxTokens || 1024,
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          Authorization:  `Bearer ${apiKey || ''}`,
          'content-type': 'application/json',
        },
        timeout: opts.timeout || 30000,
      }
    );
    return res.data.choices[0].message.content;
  });
}

async function completeGoogle(prompt, opts = {}) {
  const apiKey = await getSecureKey('google');
  return withRetry(async () => {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey || ''}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: opts.maxTokens || 1024 },
      },
      { timeout: opts.timeout || 30000 }
    );
    return res.data.candidates[0].content.parts[0].text;
  });
}

// NVIDIA NIM — OpenAI-compatible endpoint, free tier via build.nvidia.com
// Free plan: 40 req/min, 50+ models including Llama, Mistral, GLM, Nemotron
async function completeNvidia(prompt, opts = {}) {
  const apiKey = await getSecureKey('nvidia');
  return withRetry(async () => {
    const res = await axios.post(
      'https://integrate.api.nvidia.com/v1/chat/completions',
      {
        model: MODEL,
        max_tokens: opts.maxTokens || 1024,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
      },
      {
        headers: {
          Authorization:  `Bearer ${apiKey || ''}`,
          'content-type': 'application/json',
        },
        timeout: opts.timeout || 60000,
      }
    );
    return res.data.choices[0].message.content;
  });
}

async function completeOllama(prompt, opts = {}) {
  const base  = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  // opts._model lets Sovereign Fallback override the module-level MODEL constant
  const model = opts._model || MODEL;
  return withRetry(async () => {
    const res = await axios.post(
      `${base}/api/generate`,
      { model, prompt, stream: false, options: { num_predict: opts.maxTokens || 1024 } },
      { timeout: opts.timeout || 60000 }
    );
    return res.data.response;
  });
}

const COMPLETERS = {
  anthropic: completeAnthropic,
  openai:    completeOpenAI,
  google:    completeGoogle,
  ollama:    completeOllama,
  nvidia:    completeNvidia,
};

const SOVEREIGN_MODEL = process.env.SOVEREIGN_FALLBACK_MODEL || 'gemma4:e2b';

async function complete(prompt, opts = {}) {
  const fn = COMPLETERS[PROVIDER];
  if (!fn) throw new Error(`Unknown LLM_PROVIDER "${PROVIDER}". Valid: ${Object.keys(COMPLETERS).join(', ')}`);
  const cappedOpts = { ...opts, maxTokens: Math.min(opts.maxTokens || 1024, MAX_THINKING_TOKENS) };

  // Sovereign Fallback: if a cloud provider is active but no key is present,
  // automatically route to local Ollama rather than failing with an auth error.
  if (PROVIDER !== 'ollama') {
    const key = await getSecureKey(PROVIDER);
    if (!key) {
      console.error(`[llm] No key for "${PROVIDER}" — sovereign fallback to Ollama (${SOVEREIGN_MODEL})`);
      return completeOllama(prompt, { ...cappedOpts, _model: SOVEREIGN_MODEL });
    }
  }

  return fn(prompt, cappedOpts);
}

function activeProvider() {
  return { provider: PROVIDER, model: MODEL };
}

module.exports = { complete, activeProvider, getSecureKey };
