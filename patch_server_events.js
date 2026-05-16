const fs = require('fs');

const path = "node/src/server.js";
let content = fs.readFileSync(path, "utf-8");

// Insert internal events endpoint
content = content.replace(
    `// ── Setup wizard ──────────────────────────────────────────────────────────────`,
    `// ── Internal Events ────────────────────────────────────────────────────────────
app.post('/api/events/internal', (req, res) => {
  const { type, data } = req.body || {};
  if (type === 'agent_spawned' && data) {
    broadcastEvent('agent_spawned', data);
  }
  res.json({ ok: true });
});

// ── Setup wizard ──────────────────────────────────────────────────────────────`
);

fs.writeFileSync(path, content, "utf-8");
