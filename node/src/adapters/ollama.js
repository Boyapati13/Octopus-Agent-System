'use strict';
/**
 * Ollama function-calling adapter.
 * Converts Octopus tool definitions to Ollama's OpenAI-compatible tool shape.
 * Requires a model that supports tool use (llama3.1, llama3.2, mistral-nemo, qwen2.5, etc.)
 *
 * Ollama tool call API (POST /api/chat):
 *   { model, messages, tools: [{type:'function', function:{name, description, parameters}}], stream:false }
 *
 * Set OLLAMA_BASE_URL (default: http://localhost:11434) and LLM_MODEL to your local model.
 * Usage: pass the returned array as the `tools` field in a chat request to Ollama.
 */
const { TOOLS } = require('../tools');

function toOllama(tools) {
  // Ollama uses the same schema as OpenAI function calling
  return tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
}

module.exports = { tools: toOllama(TOOLS), toOllama };
