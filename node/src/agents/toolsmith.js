'use strict';
/**
 * Toolsmith — Skill Synthesiser (Phase 2 of Skill Evolution Pipeline)
 * Reads documentation for a package and uses the LLM to write a working MCP skill.
 * Writes the skill file and registers it with the skill registry (status: sandbox).
 */
const fs       = require('fs');
const path     = require('path');
const axios    = require('axios');
const { complete } = require('../llm');
const registry = require('../skill_registry');

const name = 'Toolsmith';
const role = 'skill-synthesis';
const canApprove = false;

const SKILLS_DIR = path.join(__dirname, '../../skills/auto_generated');

async function fetchDocs(url) {
  try {
    const res = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'OctopusToolsmith/1.0' } });
    const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    // Strip HTML tags if present, keep first 3000 chars
    return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 3000);
  } catch (e) {
    return `Documentation fetch failed: ${e.message}`;
  }
}

async function synthesise(skillName, description, docText) {
  const prompt = `You are Toolsmith, an AI that writes MCP (Model Context Protocol) skill modules for Node.js.

Synthesise a working MCP skill for: "${skillName}"
Description: ${description}

Documentation excerpt:
${docText}

Requirements:
- Export: { name, description, inputSchema, run }
- name: snake_case string matching the skill name
- inputSchema: valid JSON Schema object
- run(args): async function returning { result } or { error }
- Handle errors gracefully — never throw, return { error: message } instead
- Keep it concise (under 80 lines)
- Use only Node.js built-ins or the documented package

Return ONLY valid JavaScript code, no markdown fences:`;

  const code = await complete(prompt, { maxTokens: 800, timeout: 30000 });

  // Extract JSON schema for MCP registration
  const schemaPrompt = `Extract the MCP tool schema from this skill code as JSON only:
${code}

Return JSON: {"name":"...","description":"...","inputSchema":{"type":"object","properties":{},"required":[]}}`;

  const schemaText = await complete(schemaPrompt, { maxTokens: 300, timeout: 15000 });

  let mcpSchema;
  try {
    const cleaned = schemaText.replace(/```json\n?|```\n?/g, '').trim();
    mcpSchema = JSON.parse(cleaned);
  } catch {
    mcpSchema = {
      name: skillName,
      description,
      inputSchema: { type: 'object', properties: {}, required: [] },
    };
  }

  return { code, mcpSchema };
}

async function run(input, memory) {
  const { name: skillName, doc_url, description } = input;

  if (!skillName || !doc_url) {
    return { agent: name, role, approved: false, error: 'name and doc_url are required' };
  }

  const resolvedName = skillName.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
  const resolvedDesc = description || `MCP skill for ${skillName}`;

  // Fetch documentation
  const docText = await fetchDocs(doc_url);

  // Synthesise skill via LLM
  let skillData;
  try {
    skillData = await synthesise(resolvedName, resolvedDesc, docText);
  } catch (e) {
    return { agent: name, role, approved: false, error: `LLM synthesis failed: ${e.message}` };
  }

  // Register in skill registry
  const registeredSkill = registry.propose({
    name:             resolvedName,
    display_name:     skillName,
    doc_url,
    description:      resolvedDesc,
    status:           'sandbox',
    synthesised_from: doc_url,
    ...skillData.mcpSchema,
  });

  // Write skill file
  if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR, { recursive: true });
  const execPath = path.join(SKILLS_DIR, `${resolvedName}.js`);
  fs.writeFileSync(execPath, skillData.code, 'utf8');

  // Update registry with execution path
  const updated = registry.updateSkill(registeredSkill.skill_id, { execution_binary: execPath });

  await memory.writeback(name, {
    decision: {
      title:     `Toolsmith synthesised: ${resolvedName}`,
      rationale: `Skill written from ${doc_url}`,
      tags:      ['skill-synthesis', 'marketplace'],
      risk:      'low',
    },
  });

  return {
    agent: name, role,
    skill_id:     updated.skill_id,
    skill_name:   resolvedName,
    execution_binary: execPath,
    doc_url,
    mcp_schema:   skillData.mcpSchema,
    lines_written: skillData.code.split('\n').length,
    advice: `Skill "${resolvedName}" synthesised and registered (status: sandbox). Pass skill_id to SandboxQA to validate.`,
  };
}

module.exports = { name, role, canApprove, run };
