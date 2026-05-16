const fs = require('fs');

const path = "node/src/setup-api.js";
let content = fs.readFileSync(path, "utf-8");

content = content.replace(
    `  // Append brand-new keys that weren't in the file at all
  for (const [key, val] of Object.entries(newVars)) {
    if (!applied.has(key)) content += \`\\n\${key}=\${val}\`;
  }

  fs.writeFileSync(ENV_PATH, content, 'utf8');
}`,
    `  // Append brand-new keys that weren't in the file at all
  for (const [key, val] of Object.entries(newVars)) {
    if (!applied.has(key)) {
      if (content && !content.endsWith('\\n')) content += '\\n';
      content += \`\${key}=\${val}\\n\`;
    }
  }

  // Ensure file writes are restricted to owner (0600) for security
  fs.writeFileSync(ENV_PATH, content, { encoding: 'utf8', mode: 0o600 });
}`
);

fs.writeFileSync(path, content, "utf-8");
