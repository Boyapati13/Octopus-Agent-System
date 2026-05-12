---
description: Security guardrails (AgentShield-aligned, always-loaded)
alwaysApply: true
---
- Never hardcode secrets - all credentials via OS Vault or environment variables
- Validate agentName: /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/ before path construction
- No eval(), new Function(), or __proto__ assignments
- All database queries through the memory/repository layer
- AGENTSHIELD_MODE=gate for production deployments
