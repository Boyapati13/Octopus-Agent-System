'use strict';
/**
 * Single source of truth for all Octopus tool definitions.
 * Consumed by: MCP server, REST /api/tools/:format, and LLM adapters.
 * Format: MCP inputSchema (JSON Schema) — adapters convert to provider-specific shapes.
 */

const TOOLS = [
  {
    name: 'octopus_plan_task',
    description: 'Ask Cortex to break down a complex task into an execution plan of specialized agents.',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'The task description' },
      },
      required: ['task'],
    },
  },
  {
    name: 'octopus_run_task_chain',
    description: 'Run the entire dynamic Octopus agent chain (Cortex planning + all needed agents + gate verification + session compact).',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'The task description' },
      },
      required: ['task'],
    },
  },
  {
    name: 'octopus_search_memory',
    description: 'Query the L1 structural graph memory to find relevant indexed files and their architectural context.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term (e.g. file name or symbol)' },
        limit: { type: 'number', description: 'Max results to return' },
      },
      required: ['query'],
    },
  },
  {
    name: 'octopus_get_decisions',
    description: 'Retrieve past architectural decisions and risk flags from L2 memory.',
    inputSchema: {
      type: 'object',
      properties: {
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags to filter by' },
      },
    },
  },
  {
    name: 'octopus_compact_session',
    description: 'Compress current workspace context into long-term memory at the end of an LLM session.',
    inputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Summary of what was achieved' },
        facts: { type: 'array', items: { type: 'string' }, description: 'Array of factual string outcomes' },
      },
      required: ['summary', 'facts'],
    },
  },
  {
    name: 'octopus_execute_command',
    description: 'Execute arbitrary OS commands in the workspace (e.g., npm run test).',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to run' },
        cwd: { type: 'string', description: 'Optional working directory' },
      },
      required: ['command'],
    },
  },
  {
    name: 'octopus_write_file',
    description: 'Write raw content to a file in the workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or relative path to the file' },
        content: { type: 'string', description: 'The file contents to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'octopus_read_file',
    description: 'Read the contents of a file in the workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or relative path to the file' },
      },
      required: ['path'],
    },
  },
  {
    name: 'octopus_create_agent',
    description: 'Dynamically create and hot-reload a new Octopus agent into the active registry.',
    inputSchema: {
      type: 'object',
      properties: {
        agentName: { type: 'string', description: 'Name of the new agent in camelCase (e.g. frontendDeveloper)' },
        role: { type: 'string', description: 'Role of the new agent' },
        javascriptLogic: { type: 'string', description: 'Full Node.js module source for the agent' },
      },
      required: ['agentName', 'role', 'javascriptLogic'],
    },
  },
  {
    name: 'octopus_scan_security',
    description: 'Scan an array of file paths for cyberthreats and vulnerabilities (OWASP Top 10).',
    inputSchema: {
      type: 'object',
      properties: {
        paths: { type: 'array', items: { type: 'string' }, description: 'File paths to scan' },
      },
      required: ['paths'],
    },
  },
  {
    name: 'octopus_llm_complete',
    description: 'Send a prompt to the active LLM provider (Anthropic, OpenAI, Google, or Ollama) and return the completion.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt:    { type: 'string', description: 'Prompt to send to the LLM' },
        maxTokens: { type: 'number', description: 'Max tokens in response (default 1024)' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'octopus_browser_navigate',
    description: 'Open a URL in the agent-browser and return a page snapshot with element refs.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Fully-qualified URL to navigate to' },
      },
      required: ['url'],
    },
  },
  {
    name: 'octopus_browser_snapshot',
    description: 'Capture accessibility tree snapshot from the active browser session. Returns element refs (@e1, @e2 …).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  // ── Skill Evolution Pipeline ──────────────────────────────────────────────
  {
    name: 'octopus_skill_scout',
    description: 'Trigger MarketScout to scan GitHub, npm, and PyPI for skill opportunities and deprecations.',
    inputSchema: {
      type: 'object',
      properties: {
        topics: { type: 'array', items: { type: 'string' }, description: 'Technology topics to scan (e.g. ["vector-search", "llm", "mcp"])' },
      },
    },
  },
  {
    name: 'octopus_skill_synthesize',
    description: 'Toolsmith reads a documentation URL and synthesizes a new MCP skill (code + schema). Deploys to sandbox for QA.',
    inputSchema: {
      type: 'object',
      properties: {
        name:        { type: 'string', description: 'Skill identifier (snake_case, e.g. github_graphql_v4)' },
        doc_url:     { type: 'string', description: 'URL of the API or library documentation to read' },
        description: { type: 'string', description: 'What this skill should do' },
      },
      required: ['name', 'doc_url', 'description'],
    },
  },
  {
    name: 'octopus_skill_validate',
    description: 'Run SandboxQA on a synthesized skill. Self-corrects via Toolsmith on failure (up to 3 attempts).',
    inputSchema: {
      type: 'object',
      properties: {
        skill_id: { type: 'string', description: 'Skill ID from the registry' },
      },
      required: ['skill_id'],
    },
  },
  {
    name: 'octopus_skill_deploy',
    description: 'CEO deploys a sandbox-validated skill to the active registry. Retires any skill it supersedes.',
    inputSchema: {
      type: 'object',
      properties: {
        skill_id:    { type: 'string', description: 'Skill ID to deploy (must have passed QA)' },
        retires:     { type: 'string', description: 'Optional skill_id to retire when this one activates' },
      },
      required: ['skill_id'],
    },
  },
  {
    name: 'octopus_skill_retire',
    description: 'Retire an active skill from the marketplace registry.',
    inputSchema: {
      type: 'object',
      properties: {
        skill_id: { type: 'string', description: 'Skill ID to retire' },
        reason:   { type: 'string', description: 'Reason for retirement (e.g. "Deprecated by provider")' },
      },
      required: ['skill_id'],
    },
  },
  {
    name: 'octopus_skill_list',
    description: 'List all skills in the marketplace registry with their status and QA results.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['proposed', 'sandbox', 'active', 'deprecated'], description: 'Filter by status' },
      },
    },
  },
  {
    name: 'octopus_browser_interact',
    description: 'Interact with the active browser page: click, fill, type, or eval JavaScript.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['click', 'fill', 'type', 'eval'],
          description: 'Action to perform',
        },
        ref:   { type: 'string', description: 'Element ref from snapshot (e.g. @e3) or CSS selector' },
        value: { type: 'string', description: 'Text to fill/type, or JS expression to evaluate' },
      },
      required: ['action'],
    },
  },
  {
    name: 'octopus_login',
    description: 'Zero-Key authentication: opens an interactive terminal menu (enquirer) to authorize a provider. Three paths: Anthropic API key, OpenAI API key, Google API key, or Vertex AI/Bedrock setup instructions. Keys are stored in the OS Vault (Windows Credential Manager / macOS Keychain / Linux Secret Service) — no .env editing required.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: {
          type: 'string',
          enum: ['anthropic', 'openai', 'google', 'nvidia', 'huggingface', 'enterprise'],
          description: 'Provider to authorize: anthropic | openai | google | nvidia (free) | huggingface (free, Gemma) | enterprise',
        },
      },
    },
  },
  {
    name: 'octopus_vault_check',
    description: 'Diagnostic: check which LLM providers have keys stored in the OS Vault or session file, and whether local Ollama is running. Reports the active provider and whether Sovereign Fallback is engaged.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'octopus_memory_status',
    description: 'Diagnostic: ping the Python memory service (port 5000) and return its health status. Use this to verify the service is running before running agent task chains.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'octopus_task_routes',
    description: 'Show the Smart Task Router configuration — which model and provider each agent uses. When LLM_PROVIDER=router, each agent automatically uses the best free model for its specific task (coding, planning, testing, security, finance, etc.).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'octopus_plugin_list',
    description: 'List all loaded Octopus tool plugins from the tools/ directory. Returns plugin names, descriptions, and safety tiers.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'octopus_plugin_call',
    description: 'Call a named Octopus tool plugin by name. Plugins are loaded from tools/<name>/index.js with a manifest at tools/<name>/tool.json.',
    inputSchema: {
      type: 'object',
      properties: {
        name:  { type: 'string', description: 'Plugin name (from octopus_plugin_list)' },
        input: { type: 'object', description: 'Input arguments for the plugin (see plugin manifest for schema)' },
      },
      required: ['name'],
    },
  },
];

module.exports = { TOOLS };
