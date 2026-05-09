'use strict';
/**
 * Toolsmith — Dynamic Skill Synthesis (Phase 2 of Skill Evolution Pipeline)
 * Reads API/library documentation via browser, uses LLM to synthesize a working
 * MCP tool (code + schema), and writes it to skills/auto_generated/.
 */
const fs      = require('fs');
const path    = require('path');
const { complete } = require('../llm');
const registry     = require('../skill_registry');

const name = 'Toolsmith';
const role = 'skill-synthesis';
const canApprove = false;

const SKILLS_DIR = path.join(__dirname, '../../skills/auto_generated');

function ensureSkillsDir() {
  fs.mkdirSync(SKILLS_DIR, { recursive: true });
}

function buildPrompt(skillName, description, docContent, errorFeedback) {
  const retrySection = errorFeedback
    ? `\n\nPREVIOUS ATTEMPT FAILED WITH:\n${errorFeedback}\nFix the issue in this new version.\n`
    : '';

  return `You are the Toolsmith agent in the Octopus System. Synthesize a working MCP tool from this documentation.

SKILL NAME: ${skillName}
TASK: ${description}${retrySection}

DOCUMENTATION (truncated to 4000 chars):
${docContent.slice(0, 4000)}

Output ONLY a valid JSON object with exactly these fields — no markdown, no explanation:
{
  "mcp_schema": {
    "name": "${skillName}",
    "description": "One-sentence description of what the tool does.",
    "inputSchema": {
      "type": "object",
      "properties": {},
      "required": []
    }
  },
  "implementation": "/* Full Node.js module */\\n'use strict';\\nconst axios = require('axios');\\nasync function run(args) {\\n  // implementation using axios or built-ins only\\n  return { result: '...' };\\n}\\nmodule.exports = { run };"
}

Rules:
- Use only axios (pre-installed) and Node.js built-ins
- Wrap all API calls in try/catch, return { error: message } on failure
- implementation must be valid JS that can be written to a .js file and require()'d
- Output raw JSON only — no code fences`;
}

async function fetchDocContent(docUrl, memory) {
  try {
    // Use Navigator agent if available, else raw axios
    const navigator = require('./navigator');
    const result = await navigator.run({ url: docUrl, task: 'read documentation' }, memory);
    const snap = result.snapshot;
    if (snap && !snap.error) {
      return JSON.stringify(snap).slice(0, 6000);
    }
  } catch {
    // fall through
  }
  // Fallback: raw HTTP fetch
  try {
    const axios = require('axios');
    const res = await axios.get(docUrl, { timeout: 10000 });
    return String(res.data).slice(0, 6000);
  } catch (e) {
    return `Could not fetch documentation from ${docUrl}: ${e.message}`;
  }
}

async function run(input, memory) {
  const { skill_id, name: skillName, doc_url, description, error: errorFeedback, retry = 0 } = input;

  ensureSkillsDir();

  // Resolve skill details from registry if skill_id provided
  let resolvedName = skillName;
  let resolvedUrl  = doc_url;
  let resolvedDesc = description;

  if (skill_id) {
    const existing = registry.getSkill(skill_id);
    if (existing) {
      resolvedName = existing.name;
      resolvedUrl  = existing.doc_url;
      resolvedDesc = existing.description;
    }
  }

  if (!resolvedName || !resolvedUrl) {
    return { agent: name, role, approved: false, error: 'name and doc_url are required' };
  }

  // 1. Fetch documentation
  const docContent = await fetchDocContent(resolvedUrl, memory);

  // 2. Synthesize via LLM
  const prompt = buildPrompt(resolvedName, resolvedDesc || 'Interact with this API', docContent, errorFeedback);
  let llmOutput;
  try {
    llmOutput = await complete(prompt, { maxTokens: 2048 });
  } catch (e) {
    return { agent: name, role, approved: false, error: `LLM call failed: ${e.message}` };
  }

  // 3. Parse LLM JSON output
  let synthesized;
  try {
    const jsonStr = llmOutput.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonStr) throw new Error('No JSON found in LLM output');
    synthesized = JSON.parse(jsonStr);
  } catch (e) {
    return { agent: name, role, approved: false, error: `LLM output parse failed: ${e.message}`, raw: llmOutput };
  }

  // 4. Write implementation file
  const filePath = path.join(SKILLS_DIR, `${resolvedName}.js`);
  fs.writeFileSync(filePath, synthesized.implementation, 'utf8');

  // 5. Update or create registry entry
  const skillData = {
    status: 'sandbox',
    mcp_schema: synthesized.mcp_schema,
    execution_binary: filePath,
    market_alignment: resolvedDesc || '',
    synthesis_attempts: retry + 1,
  };

  let registeredSkill;
  if (skill_id) {
    registeredSkill = registry.updateSkill(skill_id, skillData);
  } else {
    registeredSkill = registry.propose({
      name: resolvedName,
      doc_url: resolvedUrl,
      description: resolvedDesc,
      ...skillData,
    });
  }

  return {
    agent: name,
    role,
    skill_id: registeredSkill.skill_id,
    skill_name: resolvedName,
    mcp_schema: synthesized.mcp_schema,
    execution_binary: filePath,
    retry_attempt: retry,
    advice: `Skill "${resolvedName}" synthesized. SandboxQA will now validate it.`,
  };
}

module.exports = { name, role, canApprove, run };
