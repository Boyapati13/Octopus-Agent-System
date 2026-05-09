'use strict';
/**
 * Multi-LLM gateway — routes completion requests to Anthropic, OpenAI, Google, or Ollama.
 * Uses axios (already installed) — no provider SDKs needed.
 * Controlled by LLM_PROVIDER and LLM_MODEL env vars.
 *
 * Supported providers: anthropic | openai | google | ollama
 */
const axios = require('axios');

const PROVIDER = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase();

const DEFAULTS = {
  anthropic: 'claude-sonnet-4-6',
  openai:    'gpt-4o',
  google:    'gemini-2.0-flash',
  ollama:    'llama3.2',
};

const MODEL = process.env.LLM_MODEL || DEFAULTS[PROVIDER] || DEFAULTS.anthropic;

async function completeAnthropic(prompt, opts) {
  const res = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: MODEL,
      max_tokens: opts.maxTokens || 1024,
      messages: [{ role: 'user', content: prompt }],
    },
    {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      timeout: opts.timeout || 30000,
    }
  );
  return res.data.content[0].text;
}

async function completeOpenAI(prompt, opts) {
  const res = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: MODEL,
      max_tokens: opts.maxTokens || 1024,
      messages: [{ role: 'user', content: prompt }],
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY || ''}`,
        'content-type': 'application/json',
      },
      timeout: opts.timeout || 30000,
    }
  );
  return res.data.choices[0].message.content;
}

async function completeGoogle(prompt, opts) {
  const apiKey = process.env.GOOGLE_API_KEY || '';
  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: opts.maxTokens || 1024 },
    },
    { timeout: opts.timeout || 30000 }
  );
  return res.data.candidates[0].content.parts[0].text;
}

async function completeOllama(prompt, opts) {
  const base = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const res = await axios.post(
    `${base}/api/generate`,
    {
      model: MODEL,
      prompt,
      stream: false,
      options: { num_predict: opts.maxTokens || 1024 },
    },
    { timeout: opts.timeout || 60000 }
  );
  return res.data.response;
}

const COMPLETERS = { anthropic: completeAnthropic, openai: completeOpenAI, google: completeGoogle, ollama: completeOllama };

async function complete(prompt, opts = {}) {
  const fn = COMPLETERS[PROVIDER];
  if (!fn) throw new Error(`Unknown LLM_PROVIDER "${PROVIDER}". Valid: anthropic, openai, google, ollama`);
  return fn(prompt, opts);
}

function activeProvider() {
  return { provider: PROVIDER, model: MODEL };
}

module.exports = { complete, activeProvider };
