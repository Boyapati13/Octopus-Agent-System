---
name: Universal OS-Vault Authentication — Zero-Key Architecture
description: Full Zero-Key standardization across installers, docs, llm.js, mcp.js, vault helpers, and start scripts
type: project
---

Octopus 2.0 is now a "Zero-Key First" system. API keys never live in `.env`.

**Why:** Plain-text keys in .env are a security risk, CI leak vector, and poor UX. The OS Vault approach mirrors Claude Code's own auth model.

**4-tier getSecureKey cascade (llm.js):**
1. OS Vault — keytar (Windows CM / macOS Keychain / Linux Secret Service)
2. CLI Session — ~/.octopus/sessions.json (written by octopus_login; cross-platform fallback)
3. Process env — externally set vars
4. .env file — last-resort plain-text parse

**New / updated files (v2.0.1):**
- `node/src/llm.js` — 4-tier getSecureKey, exports it
- `node/src/vault_set.js` — reads from stdin (pipe or TTY masked), writes vault → session file
- `node/src/vault_preflight.js` — vault+session presence check for start scripts
- `node/src/mcp.js` — octopus_login: cross-platform (Win=PS window, macOS=osascript, Linux=instructions)
- `node/src/tools.js` — octopus_login description updated (21 tools total)
- `node/tests/mcp.test.js` — tool count updated to 21
- `node/tests/vault_fallback.test.js` — 9 tests for cascade + Gemma 4 fallback
- `install.sh` — libsecret check, Claude Code + Continue.dev registration, Zero-Key "Done" steps, fixed REPO_URL= bug
- `install.ps1` — Claude Code + Continue.dev registration, Zero-Key "Done" steps
- `start_mcp.sh` — vault pre-flight check (mirrors start_mcp.ps1)
- `start_mcp.ps1` — vault pre-flight check (already done in v2.0.0)
- `README.md` — Zero-Key badge + section, 21 tools, 72 tests, octopus_login in MCP table
- `DEPLOYMENT.md` — fully rewritten as Zero-Key guide, no API key env var instructions
- `CHANGELOG.md` — v2.0.1 entry

**Test status:** 72/72 passing (6 suites)

**How to apply:** All cloud provider auth should go through octopus_login. Never suggest adding ANTHROPIC_API_KEY etc. to .env or MCP env blocks for local use. CI secrets are the only valid exception.
