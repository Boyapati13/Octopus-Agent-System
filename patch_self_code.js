const fs = require('fs');
const path = "node/src/server.js";

let content = fs.readFileSync(path, "utf-8");

content = content.replace(
    /const allowed = \['server.js', 'llm.js', 'octo_memory.js', 'setup-api.js', 'tools\/web_search.js'\];/g,
    `const allowed = fs.readdirSync(SRC).filter(f => f.endsWith('.js')).concat(
    fs.readdirSync(path.join(SRC, 'agents')).filter(f => f.endsWith('.js')).map(f => 'agents/' + f),
    fs.readdirSync(path.join(SRC, 'gateways')).filter(f => f.endsWith('.js')).map(f => 'gateways/' + f),
    fs.readdirSync(path.join(SRC, 'tools')).filter(f => f.endsWith('.js')).map(f => 'tools/' + f)
  );`
);

fs.writeFileSync(path, content, "utf-8");
