'use strict';
/**
 * Multi-LLM gateway — routes completion requests to Anthropic, OpenAI, or Google.
 * Uses axios (already installed) — no provider SDKs needed.
 * Controlled by LLM_PROVIDER and LLM_MODEL env vars.
 */
const axios = require('axios');

const PROVIDER = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase();

const DEFAULTS = {
  anthropic: 'claude-opus-4-7',
  openai:    'gpt-4o',
  google:    'gemini-2.0-flash',
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

const COMPLETERS = { anthropic: completeAnthropic, openai: completeOpenAI, google: completeGoogle };

async function complete(prompt, opts = {}) {
  const fn = COMPLETERS[PROVIDER];
  if (!fn) throw new Error(`Unknown LLM_PROVIDER "${PROVIDER}". Valid: anthropic, openai, google`);
  return fn(prompt, opts);
}

function activeProvider() {
  return { provider: PROVIDER, model: MODEL };
}

module.exports = { complete, activeProvider };
