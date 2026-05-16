const fs = require('fs');

const path = "node/src/setup-api.js";
let content = fs.readFileSync(path, "utf-8");

content = content.replace(
    `function writeEnv(newVars) {
  // Always read the live .env as base so existing keys are never wiped.
  // Fall back to .env.example only when .env doesn't exist yet (first run).
  const basePath = fs.existsSync(ENV_PATH) ? ENV_PATH
                 : fs.existsSync(ENV_EXAMPLE) ? ENV_EXAMPLE
                 : null;
  let content = basePath ? fs.readFileSync(basePath, 'utf8') : '';

  const applied = new Set();

  // Update lines that already exist in the file
  content = content.replace(/^([A-Z_][A-Z0-9_]*)=(.*)$/gm, (match, key) => {
    if (key in newVars) { applied.add(key); return \`\${key}=\${newVars[key]}\`; }
    return match;
  });

  // Append new lines that weren't in the template
  const newLines = [];
  for (const [k, v] of Object.entries(newVars)) {
    if (!applied.has(k)) newLines.push(\`\${k}=\${v}\`);
  }
  if (newLines.length > 0) {
    if (!content.endsWith('\\n')) content += '\\n';
    content += newLines.join('\\n') + '\\n';
  }

  fs.writeFileSync(ENV_PATH, content, 'utf8');
}`,
    `function writeEnv(newVars) {
  // Always read the live .env as base so existing keys are never wiped.
  // Fall back to .env.example only when .env doesn't exist yet (first run).
  const basePath = fs.existsSync(ENV_PATH) ? ENV_PATH
                 : fs.existsSync(ENV_EXAMPLE) ? ENV_EXAMPLE
                 : null;
  let content = basePath ? fs.readFileSync(basePath, 'utf8') : '';

  const applied = new Set();

  // Update lines that already exist in the file
  content = content.replace(/^([A-Z_][A-Z0-9_]*)=(.*)$/gm, (match, key) => {
    if (key in newVars) { applied.add(key); return \`\${key}=\${newVars[key]}\`; }
    return match;
  });

  // Append new lines that weren't in the template
  const newLines = [];
  for (const [k, v] of Object.entries(newVars)) {
    if (!applied.has(k)) newLines.push(\`\${k}=\${v}\`);
  }
  if (newLines.length > 0) {
    if (content && !content.endsWith('\\n')) content += '\\n';
    content += newLines.join('\\n') + '\\n';
  }

  // Ensure file writes are restricted to owner (0600) for security
  fs.writeFileSync(ENV_PATH, content, { encoding: 'utf8', mode: 0o600 });
}`
);

fs.writeFileSync(path, content, "utf-8");
