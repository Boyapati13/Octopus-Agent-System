'use strict';
/**
 * AgentShield — 5-Category Static Security Scanner
 *
 * Ported from ECC's AgentShield (102 rules) into Octopus's skill layer.
 * Runs synchronously on file content strings or path arrays.
 *
 * Categories:
 *   AS-S  Secrets detection       (14 rules)
 *   AS-P  Permission auditing     (20 rules)
 *   AS-H  Hook injection          (15 rules)
 *   AS-M  MCP risk profiling      (15 rules)
 *   AS-A  Agent config review     (15 rules)
 *   AS-Q  Code quality gates      (23 rules — ECC coding-standards + verification-loop)
 */
const fs   = require('fs');
const path = require('path');

// ── Rule definitions ──────────────────────────────────────────────────────────

const RULES = {

  secrets: [
    { re: /sk-[a-zA-Z0-9]{32,}/,                                      sev: 'critical', rule: 'AS-S01', label: 'OpenAI API key exposed' },
    { re: /sk-ant-api\d{2}-[A-Za-z0-9_-]{93,}/,                       sev: 'critical', rule: 'AS-S02', label: 'Anthropic API key exposed' },
    { re: /AIza[0-9A-Za-z\-_]{35}/,                                    sev: 'critical', rule: 'AS-S03', label: 'Google API key exposed' },
    { re: /ghp_[A-Za-z0-9]{36}/,                                       sev: 'critical', rule: 'AS-S04', label: 'GitHub PAT (classic) exposed' },
    { re: /github_pat_[A-Za-z0-9_]{82}/,                               sev: 'critical', rule: 'AS-S05', label: 'GitHub fine-grained token exposed' },
    { re: /xox[baprs]-[0-9A-Za-z]{10,}/,                              sev: 'critical', rule: 'AS-S06', label: 'Slack token exposed' },
    { re: /AKIA[0-9A-Z]{16}/,                                          sev: 'critical', rule: 'AS-S07', label: 'AWS Access Key ID exposed' },
    { re: /aws_secret_access_key\s*=\s*["']?[A-Za-z0-9/+=]{40}/i,    sev: 'critical', rule: 'AS-S08', label: 'AWS Secret Access Key exposed' },
    { re: /mongodb\+srv:\/\/[^:]+:[^@]+@/,                             sev: 'critical', rule: 'AS-S09', label: 'MongoDB URI with credentials' },
    { re: /postgres(?:ql)?:\/\/[^:]+:[^@]+@/,                         sev: 'critical', rule: 'AS-S10', label: 'PostgreSQL URI with credentials' },
    { re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,        sev: 'critical', rule: 'AS-S11', label: 'Private key material in source' },
    { re: /npm_[A-Za-z0-9]{36}/,                                       sev: 'critical', rule: 'AS-S12', label: 'npm automation token exposed' },
    { re: /sk_live_[A-Za-z0-9]{24,}/,                                  sev: 'critical', rule: 'AS-S13', label: 'Stripe live key exposed' },
    { re: /bearer\s+[a-zA-Z0-9._\-]{20,}/i,                           sev: 'warning',  rule: 'AS-S14', label: 'Hardcoded bearer token' },
  ],

  permissions: [
    { re: /SAFE_MODE\s*[=:]\s*['"]?false['"]?/i,                      sev: 'warning',  rule: 'AS-P01', label: 'SAFE_MODE explicitly disabled' },
    { re: /--no-verify/,                                                sev: 'warning',  rule: 'AS-P02', label: 'Git hook bypass via --no-verify' },
    { re: /sudo\s+(?:chmod|chown|rm|mv|cp)\b/,                        sev: 'critical', rule: 'AS-P03', label: 'Privileged file op via sudo' },
    { re: /chmod\s+(?:0o)?[67][67][67]/,                               sev: 'warning',  rule: 'AS-P04', label: 'World-writable permission (7xx/6xx)' },
    { re: /process\.env\.SAFE_MODE\s*=\s*['"]false['"]/,              sev: 'critical', rule: 'AS-P05', label: 'Runtime SAFE_MODE override via process.env' },
    { re: /allowedTools.*['"]\*['"]/,                                  sev: 'warning',  rule: 'AS-P06', label: 'Wildcard tool permission in allowedTools' },
    { re: /permission.*bypass|bypass.*permission/i,                    sev: 'critical', rule: 'AS-P07', label: 'Permission bypass pattern detected' },
    { re: /fs\.chmod.*0o?777/,                                         sev: 'critical', rule: 'AS-P08', label: 'Node.js chmod 777' },
    { re: /skipHooks?\s*[:=]\s*true/i,                                 sev: 'warning',  rule: 'AS-P09', label: 'Hook skip flag enabled' },
    { re: /new Function\s*\([^)]*\)/,                                  sev: 'critical', rule: 'AS-P10', label: 'Dynamic Function() constructor (eval-equivalent)' },
    { re: /vm\.runInNewContext|vm\.runInThisContext/,                  sev: 'warning',  rule: 'AS-P11', label: 'Node.js vm sandbox — escape risk' },
    { re: /require\s*\(\s*process\.env\./,                             sev: 'critical', rule: 'AS-P12', label: 'Dynamic require via env var (path injection)' },
    { re: /process\.setuid\s*\(|process\.setgid\s*\(/,                sev: 'critical', rule: 'AS-P13', label: 'Process privilege escalation attempt' },
    { re: /cors.*origin:\s*['"]?\*/,                                   sev: 'warning',  rule: 'AS-P14', label: 'CORS wildcard origin' },
    { re: /(?:unsafe-inline|unsafe-eval)/,                             sev: 'warning',  rule: 'AS-P15', label: 'CSP unsafe directive' },
    { re: /Object\.assign\s*\(\s*global[,)]/,                         sev: 'critical', rule: 'AS-P16', label: 'Global object mutation' },
    { re: /child_process\.exec\s*\([^,)]+\+/,                         sev: 'critical', rule: 'AS-P17', label: 'String concatenation in exec() call' },
    { re: /prototype\[['"]?\w+['"]?\]\s*=/,                           sev: 'critical', rule: 'AS-P18', label: 'Prototype pollution attempt' },
    { re: /__proto__\s*[:=]/,                                          sev: 'critical', rule: 'AS-P19', label: '__proto__ assignment (prototype pollution)' },
    { re: /constructor\s*\[['"]prototype['"]\]/,                       sev: 'critical', rule: 'AS-P20', label: 'Constructor prototype chain manipulation' },
  ],

  hookInjection: [
    { re: /\$\([^)]+\).*hook|hook.*\$\([^)]+\)/i,                    sev: 'critical', rule: 'AS-H01', label: 'Command substitution $() in hook context' },
    { re: /hook.*\|\s*(?:sh|bash|cmd\.exe|powershell)/i,              sev: 'critical', rule: 'AS-H02', label: 'Hook output piped to shell interpreter' },
    { re: /PreToolUse.*eval\s*\(/i,                                    sev: 'critical', rule: 'AS-H03', label: 'eval() in PreToolUse hook' },
    { re: /PostToolUse.*spawn\s*\(.*process\.env/,                    sev: 'warning',  rule: 'AS-H04', label: 'Env var injected into PostToolUse spawn' },
    { re: /execSync\s*\(`[^`]*\$\{(?!__dirname|path\.|filePath)[^}]+\}/,  sev: 'warning',  rule: 'AS-H05', label: 'Unescaped template literal in execSync' },
    { re: /child_process.*\$\{args\./,                                 sev: 'critical', rule: 'AS-H06', label: 'Direct args interpolation in child_process call' },
    { re: /SessionStart.*curl.*["']\s*\+/,                             sev: 'warning',  rule: 'AS-H07', label: 'String concat in SessionStart curl call' },
    { re: /hook.*require\s*\([^)]*\)\s*\(\s*args/,                   sev: 'warning',  rule: 'AS-H08', label: 'Dynamic module invocation in hook' },
    { re: /process\.exit\s*\(\s*[2-9]\d*\s*\)/,                      sev: 'warning',  rule: 'AS-H09', label: 'Non-standard exit code from hook' },
    { re: /hook.*writeFileSync.*args\./,                               sev: 'warning',  rule: 'AS-H10', label: 'Unsanitized write path in hook' },
    { re: /ECC_DISABLED_HOOKS.*['"]\w/i,                               sev: 'info',     rule: 'AS-H11', label: 'ECC hooks selectively disabled' },
    { re: /setTimeout\s*\([^,]+,\s*0\s*\).*hook/i,                   sev: 'info',     rule: 'AS-H12', label: 'Async escape (setTimeout 0) in synchronous hook' },
    { re: /hook.*JSON\.parse\s*\(\s*fs\.readFileSync/,                sev: 'info',     rule: 'AS-H13', label: 'Hook reads+parses file without error guard' },
    { re: /PreToolUse.*fetch\s*\(/i,                                   sev: 'warning',  rule: 'AS-H14', label: 'Network call in synchronous PreToolUse hook' },
    { re: /onStop.*\+\s*(?:user|input|args)\./i,                      sev: 'warning',  rule: 'AS-H15', label: 'User-controlled data in onStop webhook payload' },
  ],

  mcpRisk: [
    { re: /command:\s*["'](?:bash|sh|cmd\.exe|powershell|pwsh)['"]/i, sev: 'warning',  rule: 'AS-M01', label: 'MCP server uses raw shell as transport' },
    { re: /"type":\s*"any"/,                                           sev: 'warning',  rule: 'AS-M02', label: 'MCP tool schema uses untyped "any"' },
    { re: /"alwaysAllow":\s*\[[^\]]*\*[^\]]*\]/i,                    sev: 'critical', rule: 'AS-M03', label: 'MCP alwaysAllow contains wildcard entry' },
    { re: /env:\s*\{[^}]*(?:API_KEY|SECRET|TOKEN)/i,                  sev: 'critical', rule: 'AS-M04', label: 'Sensitive env var forwarded to MCP subprocess' },
    { re: /url:\s*['"]http:\/\//i,                                     sev: 'warning',  rule: 'AS-M05', label: 'MCP server over plain HTTP (no TLS)' },
    { re: /npx.*(?:--yes|-y)/i,                                        sev: 'warning',  rule: 'AS-M06', label: 'npx --yes bypasses MCP package audit' },
    { re: /"timeout":\s*0\b/,                                          sev: 'warning',  rule: 'AS-M07', label: 'MCP server has no timeout (DoS risk)' },
    { re: /"autoApprove":\s*true/i,                                    sev: 'critical', rule: 'AS-M08', label: 'MCP server auto-approve enabled' },
    { re: /filesystem.*root.*["']\/(?:etc|var|usr|home|root)["']/i,  sev: 'critical', rule: 'AS-M09', label: 'MCP filesystem server exposes system directory' },
    { re: /capabilities.*sampling.*true/i,                             sev: 'warning',  rule: 'AS-M10', label: 'MCP server requests sampling capability' },
    { re: /args:\s*\[[^\]]*process\.env\.[A-Z]/,                     sev: 'critical', rule: 'AS-M11', label: 'Env var interpolated into MCP args array' },
    { re: /localhost.*password.*mcp|mcp.*password.*localhost/i,       sev: 'critical', rule: 'AS-M12', label: 'Password in MCP localhost configuration' },
    { re: /mcpServers.*"disabled":\s*false.*"risky"/i,                sev: 'warning',  rule: 'AS-M13', label: 'Risky MCP server is not disabled' },
    { re: /command:.*curl.*-d.*["']\s*\+/i,                           sev: 'warning',  rule: 'AS-M14', label: 'String concat in MCP curl command arg' },
    { re: /npx\s+@(?!modelcontextprotocol|anthropic)[a-z]/i,         sev: 'info',     rule: 'AS-M15', label: 'Third-party npx MCP server — verify provenance' },
  ],

  agentConfig: [
    { re: /canApprove\s*=\s*false/,                                    sev: 'info',     rule: 'AS-A01', label: 'Agent has canApprove=false — verify not a gate' },
    { re: /approved:\s*true(?!\s*&&)/,                                 sev: 'info',     rule: 'AS-A02', label: 'Unconditional approved=true in agent return' },
    { re: /injectAgent\s*\([^)]*JSON\.parse/,                         sev: 'critical', rule: 'AS-A03', label: 'Agent injection from parsed (potentially untrusted) JSON' },
    { re: /writeFileSync.*agentPath.*args\./,                          sev: 'critical', rule: 'AS-A04', label: 'Agent file path built from unsanitized args' },
    { re: /eval\s*\([^)]*input\./,                                     sev: 'critical', rule: 'AS-A05', label: 'eval() with agent input data' },
    { re: /delete\s+require\.cache\[/,                                 sev: 'warning',  rule: 'AS-A06', label: 'Manual require cache invalidation' },
    { re: /REQUIRED_SKILLS.*['"]compact/,                              sev: 'warning',  rule: 'AS-A07', label: 'Non-Cortex agent requests compaction skill' },
    { re: /process\.exit\s*\(.*run\s*\(/,                             sev: 'warning',  rule: 'AS-A08', label: 'process.exit() in agent run() context' },
    { re: /role\s*=\s*['"]admin['"]/i,                                 sev: 'warning',  rule: 'AS-A09', label: 'Agent declared with "admin" role' },
    { re: /auto.synth.*stub.*canApprove\s*=\s*true/i,                 sev: 'warning',  rule: 'AS-A10', label: 'Auto-synthesised stub with canApprove=true' },
    { re: /Object\.assign\s*\(\s*module\.exports/,                    sev: 'info',     rule: 'AS-A11', label: 'Dynamic module.exports assignment' },
    { re: /listAgents\s*\(\s*\).*filter.*\bname\b/,                  sev: 'info',     rule: 'AS-A12', label: 'Agent registry filtered by name — verify exact match' },
    { re: /agentName.*replace.*\/\.\.\//,                              sev: 'critical', rule: 'AS-A13', label: 'Path traversal in agentName' },
    { re: /canApprove.*&&.*approved.*!==.*true/,                      sev: 'info',     rule: 'AS-A14', label: 'Complex gate logic — review approval condition' },
    { re: /skills\.writeback.*approval.*approved:\s*true.*findings/,  sev: 'info',     rule: 'AS-A15', label: 'Agent approves despite findings — check intent' },
  ],

  quality: [
    { re: /console\.log\s*\(/,                                         sev: 'info',     rule: 'AS-Q01', label: 'console.log() in production code — use console.error for debug' },
    { re: /\bvar\s+/,                                                  sev: 'info',     rule: 'AS-Q02', label: 'var declaration — prefer const/let' },
    { re: /:\s*any\b/,                                                 sev: 'warning',  rule: 'AS-Q03', label: 'TypeScript "any" type — use explicit interface or generic' },
    { re: /TODO|FIXME|HACK/,                                           sev: 'info',     rule: 'AS-Q04', label: 'Unresolved TODO/FIXME/HACK comment' },
    { re: /catch\s*\([^)]*\)\s*\{\s*\}/,                              sev: 'warning',  rule: 'AS-Q05', label: 'Empty catch block silences errors' },
    { re: /catch\s*\([^)]*\)\s*\{\s*\/\//,                           sev: 'info',     rule: 'AS-Q06', label: 'Error swallowed with only a comment' },
    { re: /\.innerHTML\s*=/,                                           sev: 'critical', rule: 'AS-Q07', label: 'Unsanitized innerHTML assignment (XSS risk)' },
    { re: /document\.write\s*\(/,                                      sev: 'warning',  rule: 'AS-Q08', label: 'document.write() usage' },
    { re: /setTimeout\s*\([^,)]*["'`]/,                               sev: 'warning',  rule: 'AS-Q09', label: 'setTimeout with string arg (implicit eval)' },
    { re: /JSON\.parse\s*\([^)]*\)(?!\s*catch|\s*\?|\s*\|\|)/,       sev: 'info',     rule: 'AS-Q10', label: 'JSON.parse without error guard' },
    { re: /\bObject\.keys\b.*forEach\b.*\bdelete\b/,                  sev: 'warning',  rule: 'AS-Q11', label: 'Mutating object while iterating its keys' },
    { re: /import\s+\*\s+as/,                                         sev: 'info',     rule: 'AS-Q12', label: 'Namespace import — may bloat bundle' },
    { re: /require\s*\(\s*['"]\.\//,                                   sev: 'info',     rule: 'AS-Q13', label: 'Relative require — confirm path is correct' },
    { re: /async\s+function[^{]+\{(?:(?!await).)*\}/s,               sev: 'info',     rule: 'AS-Q14', label: 'Async function with no await — probably sync' },
    { re: /new Promise\s*\(\s*(?:resolve|_)\s*=>/,                    sev: 'info',     rule: 'AS-Q15', label: 'Unnecessary Promise wrapping — prefer async/await' },
    { re: /\.then\s*\([^)]+\)\s*\.catch\s*\([^)]+\)\s*\.then/,      sev: 'info',     rule: 'AS-Q16', label: 'Complex promise chain — consider async/await' },
    { re: /SELECT\s+\*/i,                                              sev: 'info',     rule: 'AS-Q17', label: 'SELECT * — prefer explicit column list' },
    { re: /password.*md5|md5.*password/i,                              sev: 'critical', rule: 'AS-Q18', label: 'MD5 used for password hashing (insecure)' },
    { re: /createHash\s*\(\s*['"](?:md5|sha1)['"]\s*\)/i,            sev: 'warning',  rule: 'AS-Q19', label: 'Weak hash algorithm (MD5/SHA1)' },
    { re: /Math\.random\s*\(\s*\)/,                                    sev: 'warning',  rule: 'AS-Q20', label: 'Math.random() — not cryptographically secure' },
    { re: /http\.createServer|express\(\)(?!.*https)/,                sev: 'info',     rule: 'AS-Q21', label: 'HTTP server without TLS wrapper — ensure prod uses HTTPS' },
    { re: /app\.use\s*\(\s*express\.static/,                          sev: 'info',     rule: 'AS-Q22', label: 'express.static — ensure directory traversal protection' },
    { re: /res\.json\s*\(\s*err\s*\)/,                                sev: 'warning',  rule: 'AS-Q23', label: 'Raw error object sent to client (OWASP A09)' },
  ],
};

// ── Scanner ───────────────────────────────────────────────────────────────────

/**
 * Scan a string of content against all 102 AgentShield rules.
 * Returns findings sorted by severity (critical → warning → info).
 */
function scanContent(content, filePath = '<buffer>') {
  const findings = [];
  const lines    = content.split('\n');

  for (const [category, rules] of Object.entries(RULES)) {
    for (const { re, sev, rule, label } of rules) {
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) {
          findings.push({
            file:     filePath,
            line:     i + 1,
            severity: sev,
            rule,
            category,
            issue:    label,
            snippet:  lines[i].trim().slice(0, 120),
          });
          break; // one finding per rule per file
        }
      }
    }
  }

  return findings.sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
  });
}

/**
 * Scan an array of file paths. Silently skips unreadable files.
 */
function scanFiles(filePaths = []) {
  const findings = [];
  for (const fp of filePaths) {
    try {
      const content = fs.readFileSync(fp, 'utf8');
      findings.push(...scanContent(content, fp));
    } catch {
      // File gone or unreadable — skip
    }
  }
  return findings;
}

/**
 * Scan MCP config files (.mcp.json, mcp-configs/).
 */
function scanMcpConfigs(rootDir = process.cwd()) {
  const candidates = [
    path.join(rootDir, '.mcp.json'),
    path.join(rootDir, 'mcp.json'),
  ];
  return scanFiles(candidates.filter(p => { try { fs.accessSync(p); return true; } catch { return false; } }));
}

/**
 * Summarise findings by severity and category.
 */
function summarise(findings) {
  const bySev = findings.reduce((acc, f) => { acc[f.severity] = (acc[f.severity] || 0) + 1; return acc; }, {});
  const byCat = findings.reduce((acc, f) => { acc[f.category] = (acc[f.category] || 0) + 1; return acc; }, {});
  return { bySeverity: bySev, byCategory: byCat, total: findings.length };
}

module.exports = { scanContent, scanFiles, scanMcpConfigs, summarise, RULES };
