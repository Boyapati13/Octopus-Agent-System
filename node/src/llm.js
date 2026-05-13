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
  claude:       { provider: 'anthropic',    model: 'claude-sonnet-4-6'                          },
  openai:       { provider: 'openai',       model: 'gpt-4o'                                     },
  gemini:       { provider: 'google',       model: 'gemini-2.5-pro'                             },
  ollama:       { provider: 'ollama',       model: 'gemma4:e2b'                                 },
  // NVIDIA NIM — free trial at build.nvidia.com, OpenAI-compatible
  nvidia:       { provider: 'nvidia',       model: 'meta/llama-3.1-405b-instruct'               },
  nemotron:     { provider: 'nvidia',       model: 'nvidia/llama-3.1-nemotron-ultra-253b-v1'    },
  deepseek:     { provider: 'nvidia',       model: 'deepseek-ai/deepseek-v4-pro'                },
  deepseek_r1:  { provider: 'nvidia',       model: 'deepseek-ai/deepseek-r1'                    },
  kimi:         { provider: 'nvidia',       model: 'moonshotai/kimi-k2-thinking'                },
  qwen_coder:   { provider: 'nvidia',       model: 'qwen/qwen3-coder-480b-a35b-instruct'        },
  llama4:       { provider: 'nvidia',       model: 'meta/llama-4-maverick-17b-128e-instruct'    },
  // Hermes models via OpenRouter (NousResearch agentic specialist)
  hermes3:      { provider: 'openrouter',   model: 'nousresearch/hermes-3-llama-3.1-405b'       },
  hermes4:      { provider: 'openrouter',   model: 'nousresearch/hermes-4-405b'                 },
  hermes4_70b:  { provider: 'openrouter',   model: 'nousresearch/hermes-4-llama-3.1-70b'        },
  // Hugging Face free inference
  huggingface:  { provider: 'huggingface',  model: 'google/gemma-3-4b-it'                       },
  // Custom OpenAI-compatible endpoint (LM Studio, vLLM, llamafile, etc.)
  custom:       { provider: 'custom_http',  model: process.env.CUSTOM_HTTP_MODEL || 'default'   },
  // cursor/windsurf/continue defer to LLM_PROVIDER/LLM_MODEL env vars
};
const preset = CALLER_PRESETS[CALLER] || null;

// MODEL_DEFAULTS — used when LLM_MODEL is not set
const MODEL_DEFAULTS = {
  anthropic:    'claude-sonnet-4-6',
  openai:       'gpt-4o',
  google:       'gemini-2.0-flash',
  ollama:       'gemma4:e2b',
  nvidia:       'meta/llama-3.1-405b-instruct',
  openrouter:   'nousresearch/hermes-3-llama-3.1-405b',
  huggingface:  'google/gemma-3-4b-it',
  custom_http:  '',
  router:       '',
};

// Dynamic — re-read process.env every call so setup-wizard hot-reload works
// without a server restart.  CALLER presets still override everything.
function getDynamicProvider() {
  if (CALLER && preset) {
    return { provider: preset.provider, model: process.env.LLM_MODEL || preset.model };
  }
  const p = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase();
  const m = process.env.LLM_MODEL || MODEL_DEFAULTS[p] || 'claude-sonnet-4-6';
  return { provider: p, model: m };
}

// Kept for backward-compat (activeProvider export, log lines, etc.)
const PROVIDER = getDynamicProvider().provider;
const MODEL    = getDynamicProvider().model;

if (CALLER && preset) {
  console.error(`[llm] Caller preset: OCTOPUS_CALLER=${CALLER} → ${PROVIDER}/${MODEL}`);
}

const MAX_THINKING_TOKENS = parseInt(process.env.MAX_THINKING_TOKENS) || Infinity;
const MAX_RETRIES = 2;

const VAULT_SERVICE  = 'Octopus_Vault';
const SESSION_FILE   = path.join(os.homedir(), '.octopus', 'sessions.json');
const ENV_KEY_MAP    = {
  anthropic:   'ANTHROPIC_API_KEY',
  openai:      'OPENAI_API_KEY',
  google:      'GOOGLE_API_KEY',
  nvidia:      'NVIDIA_API_KEY',
  openrouter:  'OPENROUTER_API_KEY',
  huggingface: 'HF_TOKEN',
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
        const status = err.response?.status;
        const detail = status ? ` (HTTP ${status})` : '';
        if (attempt < MAX_RETRIES) {
          const delay = 500 * (attempt + 1);
          console.error(`[llm] Attempt ${attempt + 1} failed${detail}: ${err.message} — retrying in ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
        } else {
          console.error(`[llm] All ${MAX_RETRIES + 1} attempts failed${detail}: ${err.message}`);
        }
      }
    }
    throw lastErr;
  })();
}

// All completers support opts._model to allow per-call model overrides from the task router

async function completeAnthropic(prompt, opts = {}) {
  const model  = opts._model || MODEL;
  const apiKey = await getSecureKey('anthropic');
  return withRetry(async () => {
    const res = await axios.post(
      'https://api.anthropic.com/v1/messages',
      { model, max_tokens: opts.maxTokens || 1024, messages: [{ role: 'user', content: prompt }] },
      {
        headers: { 'x-api-key': apiKey || '', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        timeout: opts.timeout || 30000,
      }
    );
    return res.data.content[0].text;
  });
}

async function completeOpenAI(prompt, opts = {}) {
  const model  = opts._model || MODEL;
  const apiKey = await getSecureKey('openai');
  return withRetry(async () => {
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      { model, max_tokens: opts.maxTokens || 1024, messages: [{ role: 'user', content: prompt }] },
      { headers: { Authorization: `Bearer ${apiKey || ''}`, 'content-type': 'application/json' }, timeout: opts.timeout || 30000 }
    );
    return res.data.choices[0].message.content;
  });
}

async function completeGoogle(prompt, opts = {}) {
  const model  = opts._model || MODEL;
  const apiKey = await getSecureKey('google');
  return withRetry(async () => {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey || ''}`,
      { contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: opts.maxTokens || 1024 } },
      { timeout: opts.timeout || 30000 }
    );
    return res.data.candidates[0].content.parts[0].text;
  });
}

// Hugging Face Inference API — free tier, Gemma + 100k models
// Sign up at huggingface.co → Settings → Access Tokens (read, free)
async function completeHuggingFace(prompt, opts = {}) {
  const model  = opts._model || MODEL;
  const apiKey = await getSecureKey('huggingface');
  return withRetry(async () => {
    const res = await axios.post(
      `https://router.huggingface.co/hf-inference/models/${model}/v1/chat/completions`,
      { model, messages: [{ role: 'user', content: prompt }], max_tokens: opts.maxTokens || 1024, stream: false },
      { headers: { Authorization: `Bearer ${apiKey || ''}`, 'content-type': 'application/json' }, timeout: opts.timeout || 60000 }
    );
    return res.data.choices[0].message.content;
  });
}

// OpenRouter — unified gateway for 200+ models including Hermes, DeepSeek, Llama, etc.
// Sign up at openrouter.ai → API Keys (free tier available)
// Set OPENROUTER_API_KEY in node/.env or OS Vault.
// Hermes-3/4 are the best agentic / tool-use models via this endpoint.
async function completeOpenRouter(prompt, opts = {}) {
  const model  = opts._model || MODEL;
  const apiKey = await getSecureKey('openrouter');
  return withRetry(async () => {
    const res = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model,
        max_tokens: opts.maxTokens || 4096,
        messages:   [{ role: 'user', content: prompt }],
        stream:     false,
      },
      {
        headers: {
          Authorization:  `Bearer ${apiKey || ''}`,
          'Content-Type': 'application/json',
          'HTTP-Referer':  'https://octopus-agent.local',
          'X-Title':       'Octopus Agent System',
        },
        timeout: opts.timeout || 60000,
      }
    );
    return res.data.choices[0].message.content;
  });
}

// NVIDIA NIM — OpenAI-compatible, free trial at build.nvidia.com
// Reasoning models (nemotron-*-reasoning, kimi-k2-thinking, deepseek-*-thinking)
// require stream:true and return chunks with delta.content.
// Standard models work with stream:false.
// Extra opts: opts.reasoningBudget (default 16384 for reasoning models)
//             opts.enableThinking  (default true for reasoning models)
const NVIDIA_REASONING_RE = /reasoning|thinking|r1|nemotron.*omni/i;

async function completeNvidia(prompt, opts = {}) {
  const model  = opts._model || MODEL;
  const apiKey = await getSecureKey('nvidia');
  const isReasoning = NVIDIA_REASONING_RE.test(model);

  return withRetry(async () => {
    if (isReasoning) {
      // Reasoning models need SSE streaming — accumulate all chunks
      const body = {
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: opts.maxTokens || 65536,
        temperature: 0.6,
        top_p: 0.95,
        reasoning_budget: opts.reasoningBudget || 16384,
        chat_template_kwargs: { enable_thinking: opts.enableThinking !== false },
        stream: true,
      };
      const res = await axios.post(
        'https://integrate.api.nvidia.com/v1/chat/completions',
        body,
        {
          headers: { Authorization: `Bearer ${apiKey || ''}`, 'content-type': 'application/json', Accept: 'text/event-stream' },
          timeout: opts.timeout || 120000,
          responseType: 'text',
        }
      );
      // Parse SSE stream — collect delta.content pieces, skip <think>…</think> tags
      let fullText = '';
      for (const line of String(res.data).split('\n')) {
        if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
        try {
          const chunk = JSON.parse(line.slice(6));
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) fullText += delta;
        } catch { /* malformed chunk — skip */ }
      }
      // Strip <think>…</think> blocks from output (keep only the answer)
      return fullText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    }

    // Standard non-reasoning NVIDIA models
    const res = await axios.post(
      'https://integrate.api.nvidia.com/v1/chat/completions',
      { model, max_tokens: opts.maxTokens || 1024, messages: [{ role: 'user', content: prompt }], stream: false },
      { headers: { Authorization: `Bearer ${apiKey || ''}`, 'content-type': 'application/json' }, timeout: opts.timeout || 60000 }
    );
    return res.data.choices[0].message.content;
  });
}

// Custom HTTP backend — generic OpenAI-compatible endpoint.
// Set CUSTOM_HTTP_URL and CUSTOM_HTTP_MODEL to point at any local or remote server
// that speaks the OpenAI /v1/chat/completions API (e.g., a JAX/Gemma HTTP server,
// LM Studio, text-generation-webui, llamafile, vLLM, etc.).
//
// Example .env:
//   LLM_PROVIDER=custom_http
//   CUSTOM_HTTP_URL=http://localhost:8080
//   CUSTOM_HTTP_MODEL=gemma-3-4b-it
async function completeCustomHttp(prompt, opts = {}) {
  const base  = process.env.CUSTOM_HTTP_URL;
  if (!base) throw new Error('CUSTOM_HTTP_URL is not set — required for LLM_PROVIDER=custom_http');
  const model = opts._model || MODEL;
  return withRetry(async () => {
    const res = await axios.post(
      `${base}/v1/chat/completions`,
      { model, max_tokens: opts.maxTokens || 1024, messages: [{ role: 'user', content: prompt }], stream: false },
      { headers: { 'content-type': 'application/json' }, timeout: opts.timeout || 60000 }
    );
    return res.data.choices[0].message.content;
  });
}

async function completeOllama(prompt, opts = {}) {
  const base  = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const { model: dynModel } = getDynamicProvider();
  const model = opts._model || dynModel;

  // Fast connectivity check before committing to a long generation timeout
  try {
    await axios.get(`${base}/api/tags`, { timeout: 3000 });
  } catch (_) {
    throw new Error('Ollama is not running — start it with: ollama serve');
  }

  return withRetry(async () => {
    const res = await axios.post(
      `${base}/api/generate`,
      { model, prompt, stream: false, options: { num_predict: opts.maxTokens || 1024 } },
      { timeout: opts.timeout || 120000 }  // 120s: large models need time to cold-load
    );
    return res.data.response;
  });
}

const COMPLETERS = {
  anthropic:   completeAnthropic,
  openai:      completeOpenAI,
  google:      completeGoogle,
  ollama:      completeOllama,
  nvidia:      completeNvidia,
  openrouter:  completeOpenRouter,
  huggingface: completeHuggingFace,
  custom_http: completeCustomHttp,
};

// Read sovereign model dynamically so env changes take effect without restart
function getSovereignModel() { return process.env.SOVEREIGN_FALLBACK_MODEL || 'gemma4:e2b'; }

async function complete(prompt, opts = {}) {
  const { provider: PROVIDER, model: MODEL } = getDynamicProvider();
  const cappedOpts = { ...opts, maxTokens: Math.min(opts.maxTokens || 1024, MAX_THINKING_TOKENS) };

  // ── Task Router: LLM_PROVIDER=router routes per agent role ───────────────
  if (PROVIDER === 'router' && opts.role) {
    const taskRouter = require('./task_router');
    const route = taskRouter.getRoute(opts.role);
    console.error(`[llm] router: ${opts.role} → ${route.provider}/${route.model}`);

    const routedKey = route.provider !== 'ollama' ? await getSecureKey(route.provider) : 'local';
    if (!routedKey) {
      console.error(`[llm] No key for ${route.provider} — sovereign fallback to Ollama`);
      return completeOllama(prompt, { ...cappedOpts, _model: getSovereignModel() });
    }
    const routedFn = COMPLETERS[route.provider];
    if (!routedFn) throw new Error(`Router: unknown provider "${route.provider}"`);
    return routedFn(prompt, { ...cappedOpts, _model: route.model });
  }

  const fn = COMPLETERS[PROVIDER];
  if (!fn) throw new Error(`Unknown LLM_PROVIDER "${PROVIDER}". Valid: ${Object.keys(COMPLETERS).concat('router').join(', ')}.`);

  // ── Sovereign Fallback: no cloud key → local Ollama ───────────────────────
  if (PROVIDER !== 'ollama' && PROVIDER !== 'custom_http') {
    const key = await getSecureKey(PROVIDER);
    if (!key) {
      const envHint = {
        anthropic:   'ANTHROPIC_API_KEY',
        openai:      'OPENAI_API_KEY',
        google:      'GOOGLE_API_KEY',
        nvidia:      'NVIDIA_API_KEY',
        openrouter:  'OPENROUTER_API_KEY',
        huggingface: 'HF_TOKEN',
      }[PROVIDER] || 'API_KEY';
      console.error(
        `[llm] ⚠  No key for "${PROVIDER}" (${envHint} not set). ` +
        `Sovereign Fallback: routing to local Ollama (${getSovereignModel()}). ` +
        `To fix: set ${envHint} in node/.env or run octopus_login.`
      );
      return completeOllama(prompt, { ...cappedOpts, _model: getSovereignModel() });
    }
  }

  return fn(prompt, cappedOpts);
}

function activeProvider() {
  return getDynamicProvider();
}

module.exports = { complete, activeProvider, getSecureKey };
