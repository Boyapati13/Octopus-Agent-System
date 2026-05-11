---
description: Security guardrails (ECC AgentShield-aligned, always-loaded)
alwaysApply: true
---
- Never hardcode secrets — all credentials via environment variables only
- Run AgentShield scan before every deploy; use AGENTSHIELD_MODE=gate for production
- Validate agentName: /^[a-zA-Z][a-zA-Z0-9_]{0,63}\$/ before path construction (AS-A04)
- No eval(), new Function(), or __proto__ assignments anywhere in agent code
- All database queries through the repository/memory layer — no raw SQL in controllers
- DELETE FROM requires a WHERE clause — unguarded deletes are blocked by PreToolUse
- MCP server autoApprove must never be set to true
