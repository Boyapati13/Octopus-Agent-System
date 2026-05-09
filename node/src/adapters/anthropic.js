'use strict';
/**
 * Anthropic tool-use adapter.
 * Converts Octopus tool definitions to Anthropic's { name, description, input_schema } shape.
 * Usage: pass the returned array as the `tools` field in any Anthropic messages request.
 */
const { TOOLS } = require('../tools');

function toAnthropic(tools) {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
}

module.exports = { tools: toAnthropic(TOOLS), toAnthropic };
