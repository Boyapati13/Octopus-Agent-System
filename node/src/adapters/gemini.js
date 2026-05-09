'use strict';
/**
 * Google Gemini function-calling adapter.
 * Converts Octopus tool definitions to Gemini's { function_declarations: [...] } shape.
 * Usage: pass the returned object as an element in the `tools` array of a Gemini request.
 */
const { TOOLS } = require('../tools');

function toGemini(tools) {
  return {
    function_declarations: tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    })),
  };
}

module.exports = { tools: toGemini(TOOLS), toGemini };
