'use strict';
/**
 * Multi-LLM Gateway
 * Routes completions to Anthropic, OpenAI, Google, or Ollama.
 * Controlled by LLM_PROVIDER + LLM_MODEL env vars.
 * All providers share the same complete(prompt, opts) interface.
 *
 * Providers:  anthropic | openai | google | ollama
 * Model defaults:
 *   anthropic → claude-sonnet-4-6
 *   openai    → gpt-4o
 *   google    → gemini-2.0-flash
 *   ollama    → llama3.2
 */
const axios = require('axios');

const PROVIDER = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase();
const MODEL    = process.env.LLM_MODEL || {
  anthropic: 'claude-sonnet-4-6',
  openai:    'gpt-4o',
  google:    'gemini-2.0-flash',
  ollama:    'llama3.2',
}[PROVIDER] || 'claude-sonnet-4-6';

const MAX_RETRIES = 2;

async function withRetry(fn) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

async function completeAnthropic(prompt, opts = {}) {
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
          'x-api-key':         process.env.ANTHROPIC_API_KEY || '',
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
          Authorization:  `Bearer ${process.env.OPENAI_API_KEY || ''}`,
          'content-type': 'application/json',
        },
        timeout: opts.timeout || 30000,
      }
    );
    return res.data.choices[0].message.content;
  });
}

async function completeGoogle(prompt, opts = {}) {
  return withRetry(async () => {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GOOGLE_API_KEY || ''}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: opts.maxTokens || 1024 },
      },
      { timeout: opts.timeout || 30000 }
    );
    return res.data.candidates[0].content.parts[0].text;
  });
}

async function completeOllama(prompt, opts = {}) {
  const base = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  return withRetry(async () => {
    const res = await axios.post(
      `${base}/api/generate`,
      { model: MODEL, prompt, stream: false, options: { num_predict: opts.maxTokens || 1024 } },
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
};

async function complete(prompt, opts = {}) {
  const fn = COMPLETERS[PROVIDER];
  if (!fn) throw new Error(`Unknown LLM_PROVIDER "${PROVIDER}". Valid: ${Object.keys(COMPLETERS).join(', ')}`);
  return fn(prompt, opts);
}

function activeProvider() {
  return { provider: PROVIDER, model: MODEL };
}

module.exports = { complete, activeProvider };
