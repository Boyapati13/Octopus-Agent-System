---
description: Node.js coding standards (ECC-aligned)
alwaysApply: true
---
- CommonJS only (no ESM unless .mjs)
- Use const over let, never var
- Hook scripts must exit 0 on non-critical errors
- console.error for diagnostics — never console.log in MCP stdio paths
- All PreToolUse hooks must complete in under 200ms
- Relative imports preferred; no path.join with user input without sanitization
