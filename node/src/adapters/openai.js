'use strict';
/**
 * OpenAI function-calling adapter.
 * Converts Octopus tool definitions to OpenAI's { type: 'function', function: {...} } shape.
 * Usage: pass the returned array as the `tools` field in any OpenAI chat completion request.
 */
const { TOOLS } = require('../tools');

function toOpenAI(tools) {
  return tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
}

module.exports = { tools: toOpenAI(TOOLS), toOpenAI };
