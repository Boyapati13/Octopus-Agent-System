'use strict';
/**
 * Hello World — example tool plugin.
 * Shows the minimal structure for a tool plugin handler.
 */

/**
 * @param {{ name?: string }} input
 * @returns {{ greeting: string }}
 */
module.exports = async function run(input) {
  const name = (input && input.name) ? String(input.name).slice(0, 64) : 'World';
  return { greeting: `Hello, ${name}! Octopus tool plugins are working.` };
};
