---
description: Node.js standards (ECC-aligned, always-loaded)
alwaysApply: true
---
- CommonJS only (no ESM unless .mjs)
- const over let, never var
- console.error for diagnostics, never console.log in MCP stdio paths
- All PreToolUse hooks must complete in under 200ms
