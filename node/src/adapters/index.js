'use strict';
/**
 * Unified adapter registry.
 * Returns Octopus tools formatted for any supported LLM provider.
 */
const { TOOLS } = require('../tools');
const { toOpenAI }    = require('./openai');
const { toAnthropic } = require('./anthropic');
const { toGemini }    = require('./gemini');

const FORMATS = {
  openai:    () => toOpenAI(TOOLS),
  anthropic: () => toAnthropic(TOOLS),
  gemini:    () => toGemini(TOOLS),
  mcp:       () => TOOLS,   // raw MCP inputSchema format
};

function getTools(format = 'mcp') {
  const fn = FORMATS[format.toLowerCase()];
  if (!fn) throw new Error(`Unknown format "${format}". Valid: ${Object.keys(FORMATS).join(', ')}`);
  return fn();
}

module.exports = { getTools, SUPPORTED_FORMATS: Object.keys(FORMATS) };
