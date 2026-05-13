'use strict';
/**
 * document.js — Document upload, extraction, and LLM analysis tool
 *
 * Supported file types (native, no extra deps):
 *   Text:    .txt .md .csv .log .yaml .yml .toml .ini .env
 *   Code:    .js .ts .py .java .go .rs .cpp .c .h .sh .ps1 .rb .php .lua
 *   Data:    .json .xml .html .css .sql
 *   Config:  .gitignore .dockerignore Dockerfile Makefile
 *
 * Optional enhanced extraction (install separately):
 *   PDF:     npm install pdf-parse          → set ENABLE_PDF=true
 *   DOCX:    npm install mammoth            → set ENABLE_DOCX=true
 *   XLSX:    npm install xlsx               → set ENABLE_XLSX=true
 *   Images:  pass to NVIDIA Nemotron Omni via analyseWithVision()
 *
 * Routes analysis to the document-analysis route in task_router
 * (nvidia/nemotron-3-nano-omni-9b by default — vision + text).
 */

const path   = require('path');
const { complete } = require('../llm');

// ── Text extraction ───────────────────────────────────────────────────────────

const TEXT_EXTS = new Set([
  '.txt','.md','.markdown','.csv','.log','.yaml','.yml','.toml','.ini','.env',
  '.js','.mjs','.cjs','.ts','.tsx','.jsx','.py','.java','.go','.rs','.cpp',
  '.c','.h','.hpp','.sh','.bash','.ps1','.rb','.php','.lua','.swift','.kt',
  '.json','.xml','.html','.htm','.css','.scss','.sass','.sql','.graphql',
  '.gitignore','.dockerignore','.editorconfig',
]);

const IMAGE_EXTS = new Set(['.png','.jpg','.jpeg','.gif','.webp','.bmp','.svg']);

/**
 * Extract plain text from a file buffer.
 * @param {Buffer} buffer
 * @param {string} filename
 * @returns {Promise<{text: string, type: string, pages?: number}>}
 */
async function extractText(buffer, filename) {
  const ext = path.extname(filename).toLowerCase();
  const base = path.basename(filename).toLowerCase();

  // Named files without extension (Dockerfile, Makefile, etc.)
  if (!ext && /^(dockerfile|makefile|rakefile|gemfile|procfile|jenkinsfile)$/i.test(base)) {
    return { text: buffer.toString('utf8'), type: 'code' };
  }

  if (TEXT_EXTS.has(ext)) {
    const text = buffer.toString('utf8');
    return { text, type: ext === '.json' ? 'json' : 'text' };
  }

  if (IMAGE_EXTS.has(ext)) {
    return { text: '', type: 'image', imageBase64: buffer.toString('base64'), mimeType: mimeForExt(ext) };
  }

  // Optional: PDF
  if (ext === '.pdf' && process.env.ENABLE_PDF === 'true') {
    try {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      return { text: data.text, type: 'pdf', pages: data.numpages };
    } catch (e) {
      return { text: `[PDF extraction failed: ${e.message} — install pdf-parse]`, type: 'pdf-error' };
    }
  }

  // Optional: DOCX
  if (ext === '.docx' && process.env.ENABLE_DOCX === 'true') {
    try {
      const mammoth = require('mammoth');
      const result  = await mammoth.extractRawText({ buffer });
      return { text: result.value, type: 'docx' };
    } catch (e) {
      return { text: `[DOCX extraction failed: ${e.message} — install mammoth]`, type: 'docx-error' };
    }
  }

  // Optional: XLSX
  if ((ext === '.xlsx' || ext === '.xls') && process.env.ENABLE_XLSX === 'true') {
    try {
      const XLSX   = require('xlsx');
      const wb     = XLSX.read(buffer, { type: 'buffer' });
      const sheets = wb.SheetNames.map(name => {
        const ws  = wb.Sheets[name];
        const csv = XLSX.utils.sheet_to_csv(ws);
        return `=== Sheet: ${name} ===\n${csv}`;
      });
      return { text: sheets.join('\n\n'), type: 'xlsx' };
    } catch (e) {
      return { text: `[XLSX extraction failed: ${e.message} — install xlsx]`, type: 'xlsx-error' };
    }
  }

  return {
    text: `[Unsupported file type: ${ext || 'no extension'}. Supported: text, code, JSON, CSV, XML, HTML]`,
    type: 'unsupported',
  };
}

function mimeForExt(ext) {
  const map = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
  return map[ext] || 'image/png';
}

// ── LLM analysis ─────────────────────────────────────────────────────────────

const DEFAULT_PROMPTS = {
  summarise:  'Provide a concise summary of this document. Cover: main topics, key facts, important numbers, and any action items.',
  analyse:    'Analyse this document thoroughly. Identify: structure, key insights, patterns, anomalies, recommendations.',
  extract:    'Extract all structured data from this document as JSON. Include: entities, dates, numbers, lists, relationships.',
  qa:         (question) => `Answer this question based only on the document content: "${question}"`,
  code_review:'Review this code. Identify: bugs, security issues, performance problems, style violations, and improvements.',
  explain:    'Explain this document in simple terms a non-technical person can understand.',
};

/**
 * Analyse a document with an LLM.
 * @param {string} text  — extracted document text
 * @param {string} mode  — 'summarise' | 'analyse' | 'extract' | 'qa' | 'code_review' | 'explain' | custom prompt string
 * @param {{ question?: string, maxTokens?: number }} opts
 * @returns {Promise<string>}
 */
async function analyseText(text, mode = 'summarise', opts = {}) {
  if (!text || !text.trim()) return 'No text content to analyse.';

  const MAX_CHARS = 120000; // ~30K tokens — safe limit for most models
  const truncatedText = text.length > MAX_CHARS
    ? text.slice(0, MAX_CHARS) + `\n\n[... truncated — ${text.length - MAX_CHARS} chars omitted ...]`
    : text;

  let instruction;
  if (DEFAULT_PROMPTS[mode]) {
    instruction = typeof DEFAULT_PROMPTS[mode] === 'function'
      ? DEFAULT_PROMPTS[mode](opts.question || '')
      : DEFAULT_PROMPTS[mode];
  } else {
    instruction = mode; // custom prompt string
  }

  const prompt = `${instruction}\n\n--- DOCUMENT START ---\n${truncatedText}\n--- DOCUMENT END ---`;

  return complete(prompt, {
    maxTokens: opts.maxTokens || 4096,
    role:      'document-analysis',
    timeout:   opts.timeout  || 90000,
  });
}

/**
 * Analyse an image document using a vision-capable model.
 * Routes to nvidia/nemotron-3-nano-omni-9b via NVIDIA NIM.
 */
async function analyseWithVision(imageBase64, mimeType, prompt, opts = {}) {
  const axios  = require('axios');
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return 'Vision analysis requires NVIDIA_API_KEY. Set it in node/.env.';
  }

  const model = 'nvidia/nemotron-3-nano-omni-9b';
  const instruction = prompt || 'Describe this image in detail. Extract any text, data, or structured information visible.';

  const res = await axios.post(
    'https://integrate.api.nvidia.com/v1/chat/completions',
    {
      model,
      messages: [{
        role:    'user',
        content: [
          { type: 'text',      text: instruction },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
        ],
      }],
      max_tokens: opts.maxTokens || 2048,
      stream:     false,
    },
    {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: opts.timeout || 60000,
    }
  );
  return res.data.choices[0].message.content;
}

/**
 * Full pipeline: extract text from buffer + analyse with LLM.
 * @param {Buffer}  buffer
 * @param {string}  filename
 * @param {string}  mode
 * @param {object}  opts
 * @returns {Promise<{filename, type, charCount, pages?, analysis: string}>}
 */
async function processDocument(buffer, filename, mode = 'summarise', opts = {}) {
  const extracted = await extractText(buffer, filename);

  if (extracted.type === 'image') {
    const analysis = await analyseWithVision(
      extracted.imageBase64, extracted.mimeType,
      opts.question || 'Describe and extract all information from this image.',
      opts
    );
    return { filename, type: 'image', charCount: buffer.length, analysis };
  }

  if (extracted.type === 'unsupported') {
    return { filename, type: 'unsupported', charCount: 0, analysis: extracted.text };
  }

  const analysis = await analyseText(extracted.text, mode, opts);
  return {
    filename,
    type:      extracted.type,
    charCount: extracted.text.length,
    pages:     extracted.pages,
    analysis,
  };
}

module.exports = { extractText, analyseText, analyseWithVision, processDocument };
