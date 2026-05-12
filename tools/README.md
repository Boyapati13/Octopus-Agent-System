# Octopus Tool Plugins

This directory contains tool plugins that extend Octopus with custom capabilities.
Plugins are auto-loaded on server startup and become available via:

- MCP stdio (`octopus_plugin_call`)  
- REST API (`POST /api/plugins/call/:name`)

---

## Included Plugins

| Plugin | Name | Safety | Description |
|---|---|---|---|
| `hello-world/` | `hello_world` | read-only | Example — echoes a greeting |
| `http-fetch/` | `http_fetch` | read-only | Safe HTTP GET with SSRF guard |

---

## Adding a New Plugin

1. Create a directory: `tools/<your-plugin>/`

2. Create `tool.json`:
```json
{
  "name": "my_tool",
  "display_name": "My Tool",
  "description": "What this tool does in one sentence",
  "safety_tier": "read-only",
  "input_schema": {
    "type": "object",
    "properties": {
      "input_param": { "type": "string", "description": "What this parameter does" }
    },
    "required": ["input_param"]
  },
  "output_schema": {
    "type": "object",
    "properties": {
      "result": { "type": "string" }
    }
  },
  "version": "1.0.0",
  "author": "your-name"
}
```

3. Create `index.js`:
```js
'use strict';
// module.exports must be an async function that takes input and returns output
module.exports = async function run(input) {
  // input is validated against input_schema by the caller
  return { result: `Processed: ${input.input_param}` };
};
```

4. Restart the Octopus server. The plugin auto-loads.

---

## Safety Tiers

| Tier | Effect | When to use |
|---|---|---|
| `read-only` | Always available | Lookups, searches, reads |
| `mutating` | Blocked when `SAFE_MODE=true` | File writes, API calls with side effects |
| `high-risk` | Blocked when `SAFE_MODE=true`; needs gate approval | Destructive ops, privileged access |

---

## Security Rules

All plugins must follow [OCTOPUS.md](../OCTOPUS.md) security rules:

- **Never hardcode secrets** — use `process.env` 
- **Never use `eval()` or `new Function()`**
- **Always validate and sanitize all inputs** — plugins receive untrusted data
- **SSRF protection** — the `http_fetch` plugin shows the required pattern: validate URL scheme, block private IP ranges, strip credentials
- **No shell commands** without parameterized execution (never string concat into `exec`)

---

## Testing a Plugin

```js
// Quick test from node/
const { callTool } = require('./src/tool_loader');

callTool('hello_world', { name: 'Alice' })
  .then(console.log)
  .catch(console.error);
// → { greeting: 'Hello, Alice! Octopus tool plugins are working.' }
```
