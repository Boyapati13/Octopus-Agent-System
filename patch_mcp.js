const fs = require('fs');

const path = "node/src/mcp.js";
let content = fs.readFileSync(path, "utf-8");

content = content.replace(
    `        injectAgent(sanitizedName);
        return { content: [{ type: 'text', text: \`Agent \${args.agentName} created and injected successfully.\` }] };`,
    `        injectAgent(sanitizedName);
        try {
          const axios = require('axios');
          axios.post('http://localhost:3001/api/events/internal', {
            type: 'agent_spawned',
            data: { agent: sanitizedName }
          }).catch(() => {});
        } catch(e) {}
        return { content: [{ type: 'text', text: \`Agent \${args.agentName} created and injected successfully.\` }] };`
);

fs.writeFileSync(path, content, "utf-8");
