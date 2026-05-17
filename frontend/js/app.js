'use strict';
const API  = 'http://localhost:3001';
const ICONS = {
  Cortex:'🎯', Atlas:'🧠', Architect:'🏗️', Forge:'🔨',
  Reviewer:'👁️', SecurityReviewer:'🔐', Probe:'🧪',
  Scribe:'📝', ReleaseKeeper:'🚢',
};

// ── Tabs ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab,.tab-panel').forEach(el => el.classList.remove('active'));
    t.classList.add('active');
    document.getElementById('tab-' + t.dataset.tab).classList.add('active');
    if (t.dataset.tab === 'memory') refreshLayers();
  });
});
document.querySelectorAll('.etab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.etab').forEach(e => e.classList.remove('active'));
    t.classList.add('active');
    loadExplorer(t.dataset.etab);
  });
});

// ── Feed ──────────────────────────────────────────────────────────────────────
const feedList = document.getElementById('feed-list');
function addFeedItem(agent, msg) {
  const ts = new Date().toLocaleTimeString();
  const item = document.createElement('div');
  item.className = 'feed-item';
  item.innerHTML = `<span class="feed-ts">${ts}</span><div class="feed-body"><div class="feed-agent">${agent}</div><div class="feed-msg">${msg}</div></div>`;
  feedList.querySelector('.feed-empty')?.remove();
  feedList.prepend(item);
}
document.getElementById('feed-clear').addEventListener('click', () => {
  feedList.innerHTML = '<div class="feed-empty">No activity yet. Run a command to see events.</div>';
});

// ── JSON syntax highlight ─────────────────────────────────────────────────────
function highlight(json) {
  return JSON.stringify(json, null, 2)
    .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(?=\s*:))/g, '<span class="json-key">$1</span>')
    .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*")/g, '<span class="json-str">$1</span>')
    .replace(/\b(\d+\.?\d*)\b/g, '<span class="json-num">$1</span>')
    .replace(/\b(true|false)\b/g, '<span class="json-bool">$1</span>')
    .replace(/\bnull\b/g, '<span class="json-null">null</span>');
}

// ── API helpers ───────────────────────────────────────────────────────────────
async function apiFetch(url, opts = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  return res.json();
}

// ── Health checks ─────────────────────────────────────────────────────────────
async function checkHealth() {
  // Node API
  try {
    const d = await apiFetch(`${API}/api/health`);
    setStatus('svc-node', d.status === 'ok');
    setStatus('svc-cache', d.cache?.backend === 'redis');
  } catch { setStatus('svc-node', false); setStatus('svc-cache', false); }
  // Python memory service
  try {
    const d = await apiFetch('http://localhost:5000/health');
    setStatus('svc-python', d.status === 'ok');
  } catch { setStatus('svc-python', false); }
}
function setStatus(id, ok) {
  const el = document.getElementById(id);
  el.classList.toggle('ok', ok);
  el.classList.toggle('err', !ok);
}

// ── Agent roster ──────────────────────────────────────────────────────────────
async function loadAgents() {
  try {
    const agents = await apiFetch(`${API}/api/agents`);
    const list = document.getElementById('agent-list');
    list.innerHTML = '';
    agents.forEach(a => {
      const card = document.createElement('div');
      card.className = 'agent-card';
      card.id = `agent-${a.name.toLowerCase()}`;
      card.innerHTML = `
        <div class="agent-icon">${ICONS[a.name] || '🤖'}</div>
        <div class="agent-info">
          <div class="agent-name">${a.name}</div>
          <div class="agent-role">${a.role}</div>
        </div>
        <div class="agent-approve ${a.canApprove ? 'yes' : 'no'}">${a.canApprove ? '✓' : '—'}</div>`;
      card.addEventListener('click', () => {
        document.querySelectorAll('.agent-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        // Switch to console and pre-select agent
        document.querySelectorAll('.tab,.tab-panel').forEach(el => el.classList.remove('active'));
        document.querySelector('[data-tab="console"]').classList.add('active');
        document.getElementById('tab-console').classList.add('active');
        const sel = document.getElementById('cmd-select');
        const opt = [...sel.options].find(o => o.text.toLowerCase().includes(a.name.toLowerCase()));
        if (opt) sel.value = opt.value;
      });
      list.appendChild(card);
    });
  } catch (e) {
    document.getElementById('agent-list').innerHTML = '<div style="padding:12px;font-size:.78rem;color:var(--text-2)">API offline</div>';
  }
}

// ── Console ───────────────────────────────────────────────────────────────────
document.getElementById('cmd-query').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey || !event.shiftKey)) {
    event.preventDefault();
    const btn = document.getElementById('cmd-run');
    if (!btn.disabled) {
      btn.classList.add('scale-95', 'opacity-80');
      setTimeout(() => btn.classList.remove('scale-95', 'opacity-80'), 100);
      btn.click();
    }
  }
});

document.getElementById('cmd-run').addEventListener('click', async () => {
  const sel    = document.getElementById('cmd-select');
  const query  = document.getElementById('cmd-query').value.trim();
  const url    = `${API}${sel.value}`;
  const out    = document.getElementById('console-output');
  const btn    = document.getElementById('cmd-run');
  const name   = sel.options[sel.selectedIndex].text.replace(/^.+? /, '');

  btn.disabled = true;
  btn.textContent = 'Running…';
  out.innerHTML = '<span class="output-placeholder">⏳ Running…</span>';

  try {
    const body = query ? JSON.stringify({ task: query, query }) : '{}';
    const data = await apiFetch(url, { method: 'POST', body });
    out.innerHTML = highlight(data);
    addFeedItem(name, `Returned ${Object.keys(data).length} fields`);
  } catch (e) {
    out.innerHTML = `<span style="color:var(--danger)">${e.message}</span>`;
    addFeedItem(name, `Error: ${e.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run ▶';
  }
});

// ── Memory Explorer ───────────────────────────────────────────────────────────
async function loadExplorer(tab) {
  const body = document.getElementById('explorer-body');
  body.innerHTML = '<span class="output-placeholder">Loading…</span>';
  try {
    let data;
    if (tab === 'structural') data = await apiFetch(`${API}/api/memory/structural?limit=20`);
    else if (tab === 'decisions') data = await apiFetch(`${API}/api/memory/decisions`);
    else if (tab === 'run')       data = await apiFetch(`${API}/api/memory/run`);
    else if (tab === 'cache')     data = await apiFetch(`${API}/api/memory/cache-stats`);
    body.innerHTML = highlight(data);
  } catch (e) {
    body.innerHTML = `<span style="color:var(--danger)">Failed: ${e.message}</span>`;
  }
}

// ── Layer stats ───────────────────────────────────────────────────────────────
async function refreshLayers() {
  try {
    const run  = await apiFetch(`${API}/api/memory/run`);
    const dec  = await apiFetch(`${API}/api/memory/decisions`);
    const stru = await apiFetch(`${API}/api/memory/structural?limit=1`);
    const cache = await apiFetch(`${API}/api/memory/cache-stats`);
    document.getElementById('l3-status').textContent = run?.status || '—';
    document.getElementById('l3-files').textContent  = (run?.changed_files || []).length;
    document.getElementById('l2-count').textContent  = Array.isArray(dec) ? dec.length : '—';
    document.getElementById('l1-count').textContent  = stru?.length ?? '—';
    document.getElementById('l4-backend').textContent = cache?.backend || '—';
    document.getElementById('l4-hitrate').textContent = cache?.hit_rate != null ? (cache.hit_rate * 100).toFixed(1) + '%' : '—';
  } catch {}
}

// ── Boot ──────────────────────────────────────────────────────────────────────
checkHealth();
loadAgents();
refreshLayers();
setInterval(checkHealth, 10000);
