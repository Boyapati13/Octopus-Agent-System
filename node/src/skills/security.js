'use strict';
const fs = require('fs');

const RISKY_PATTERNS = [
  // 1. Command Injection / OS Execution
  { re: /\beval\s*\(/,                        sev: 'critical', label: 'eval() usage (Arbitrary Code Execution)' },
  { re: /\bexec\s*\(/,                        sev: 'critical', label: 'exec() usage (Command Injection)' },
  { re: /child_process\.exec\s*\(/,           sev: 'critical', label: 'child_process.exec (Command Injection)' },
  { re: /os\.system\s*\(/,                    sev: 'critical', label: 'os.system() call (Command Injection)' },
  { re: /subprocess\.\w+\(.*shell\s*=\s*True/,sev: 'critical', label: 'subprocess shell=True (Command Injection)' },
  { re: /new\s+Function\s*\(/,                sev: 'high',     label: 'new Function() usage (Code Injection)' },

  // 2. Insecure Deserialization
  { re: /pickle\.loads?\s*\(/,                sev: 'critical', label: 'pickle deserialization (Arbitrary Code Execution)' },
  { re: /yaml\.load\s*\(/,                    sev: 'high',     label: 'yaml.load (Insecure Deserialization, use safe_load)' },

  // 3. XSS / Client-Side
  { re: /\.innerHTML\s*=/,                    sev: 'high',     label: 'innerHTML assignment (XSS risk)' },
  { re: /document\.write\s*\(/,               sev: 'high',     label: 'document.write (XSS risk)' },

  // 4. Hardcoded Secrets & Credentials
  { re: /['"]?(api_?key|secret|password|token|aws_access_key_id)['"]?\s*[:=]\s*['"][^'"]+['"]/i, sev: 'critical', label: 'Hardcoded Secret / Credential' },
  { re: /Authorization:\s*Bearer\s+[A-Za-z0-9\-_=\.]{20,}/i, sev: 'critical', label: 'Hardcoded Bearer Token' },

  // 5. Path Traversal
  { re: /fs\.readFile\s*\(\s*req\./,          sev: 'high',     label: 'Unsanitized file read (Path Traversal)' },
  { re: /open\s*\(\s*request\./,              sev: 'high',     label: 'Unsanitized file read (Path Traversal)' },

  // 6. Weak Cryptography
  { re: /crypto\.createHash\s*\(\s*['"]md5['"]/, sev: 'high',  label: 'Weak hashing algorithm (MD5)' },
  { re: /crypto\.createHash\s*\(\s*['"]sha1['"]/,sev: 'high',  label: 'Weak hashing algorithm (SHA1)' },

  // 7. Dynamic Requires
  { re: /require\s*\(\s*[^'"]/,               sev: 'high',     label: 'Dynamic require() (Path Traversal / Execution)' },

  // 8. Environment / System Leakage
  { re: /process\.env\b/,                     sev: 'low',      label: 'Environment variable access' },
  { re: /\binput\s*\(/,                       sev: 'low',      label: 'Unvalidated console input()' }
];

function scanSecurity(filePaths) {
  const findings = [];
  
  for (const f of filePaths) {
    if (!fs.existsSync(f)) continue;
    const content = fs.readFileSync(f, 'utf8');
    
    for (const pattern of RISKY_PATTERNS) {
      if (pattern.re.test(content)) {
        findings.push({ file: f, severity: pattern.sev, issue: pattern.label });
      }
    }
  }
  
  return findings;
}

module.exports = { scanSecurity, RISKY_PATTERNS };
