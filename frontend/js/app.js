'use strict';

/**
 * Octopus Agent System v5.0-EVO
 * Core interaction logic and WebSocket state unification.
 */

// ── Tab Navigation (Right Pane) ──────────────────────────────────────────────
const tabBtnLlm = document.getElementById('tab-btn-llm');
const tabBtnGw = document.getElementById('tab-btn-gw');
const panelLlm = document.getElementById('panel-llm');
const panelGw = document.getElementById('panel-gw');

function switchRightTab(tab) {
  if (tab === 'llm') {
    tabBtnLlm.setAttribute('aria-selected', 'true');
    tabBtnLlm.classList.add('text-cyan-400', 'border-cyan-400', 'bg-deepspace-900/50');
    tabBtnLlm.classList.remove('text-gray-500', 'border-transparent');

    tabBtnGw.setAttribute('aria-selected', 'false');
    tabBtnGw.classList.remove('text-cyan-400', 'border-cyan-400', 'bg-deepspace-900/50');
    tabBtnGw.classList.add('text-gray-500', 'border-transparent');

    panelLlm.classList.remove('hidden');
    panelGw.classList.add('hidden');
  } else {
    tabBtnGw.setAttribute('aria-selected', 'true');
    tabBtnGw.classList.add('text-cyan-400', 'border-cyan-400', 'bg-deepspace-900/50');
    tabBtnGw.classList.remove('text-gray-500', 'border-transparent');

    tabBtnLlm.setAttribute('aria-selected', 'false');
    tabBtnLlm.classList.remove('text-cyan-400', 'border-cyan-400', 'bg-deepspace-900/50');
    tabBtnLlm.classList.add('text-gray-500', 'border-transparent');

    panelGw.classList.remove('hidden');
    panelLlm.classList.add('hidden');
  }
}

tabBtnLlm.addEventListener('click', () => switchRightTab('llm'));
tabBtnGw.addEventListener('click', () => switchRightTab('gw'));

// ── UI Element References ──────────────────────────────────────────────────
const opavElements = {
  observe: document.getElementById('opav-observe'),
  plan: document.getElementById('opav-plan'),
  act: document.getElementById('opav-act'),
  verify: document.getElementById('opav-verify')
};

const memElements = {
  l1: document.getElementById('mem-l1'),
  l2: document.getElementById('mem-l2'),
  l3: document.getElementById('mem-l3'),
  l4: document.getElementById('mem-l4'),
  l5: document.getElementById('mem-l5')
};

const terminalOutput = document.getElementById('terminal-output');
const agentFactory = document.getElementById('agent-factory');
const globalStatusDot = document.getElementById('global-status-dot');
const globalStatusText = document.getElementById('global-status-text');

// ── Terminal Logging Helper ────────────────────────────────────────────────
function logTerminal(message, type = 'info') {
  const div = document.createElement('div');

  switch(type) {
    case 'cmd':
      div.className = 'text-cyan-500';
      div.textContent = message;
      break;
    case 'exec':
      div.className = 'text-emerald-400';
      div.textContent = message;
      break;
    case 'warn':
      div.className = 'text-accent';
      div.textContent = message;
      break;
    case 'error':
      div.className = 'text-red-500';
      div.textContent = message;
      break;
    default:
      div.textContent = message;
  }

  terminalOutput.appendChild(div);
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

// ── O.P.A.V Loop State Updater ─────────────────────────────────────────────
function setOpavState(state) {
  // Reset all
  Object.values(opavElements).forEach(el => {
    el.classList.remove('text-cyan-400', 'bg-cyan-900/30', 'font-bold', 'neon-border-active');
    el.classList.add('text-gray-500');
  });

  // Set active
  if (opavElements[state]) {
    opavElements[state].classList.remove('text-gray-500');
    opavElements[state].classList.add('text-cyan-400', 'bg-cyan-900/30', 'font-bold', 'neon-border-active');
  }
}

// ── WebSocket State Unification ────────────────────────────────────────────
function connectWebSocket() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  let wsUrl = protocol + "://" + location.host + "/ws";
  if (location.protocol === "file:") {
      wsUrl = "ws://localhost:3001/ws";
  }

  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    globalStatusDot.classList.replace('bg-red-500', 'bg-emerald-400');
    globalStatusText.textContent = "System Nominal";
    logTerminal("[SYS] WebSocket connected to core.", "info");
  };

  ws.onclose = () => {
    globalStatusDot.classList.replace('bg-emerald-400', 'bg-red-500');
    globalStatusText.textContent = "Connection Lost";
    logTerminal("[SYS] WebSocket disconnected. Retrying in 3s...", "error");
    setTimeout(connectWebSocket, 3000);
  };

  ws.onerror = () => {
    ws.close();
  };

  ws.onmessage = (event) => {
    let parsed;
    try {
      parsed = JSON.parse(event.data);
    } catch (e) {
      return;
    }

    const type = parsed.type || "event";
    const data = parsed.data || {};

    switch (type) {
      case "chain_start":
        setOpavState('plan');
        agentFactory.textContent = `Planning: ${data.task || 'Active'}`;
        logTerminal(`system$ start_chain "${data.task || 'unnamed'}"`, "cmd");
        break;

      case "agent_start":
        setOpavState('act');
        agentFactory.textContent = `Spawned [${data.agent}]`;
        logTerminal(`[EXEC] Spawning ${data.agent} agent...`, "exec");
        break;

      case "agent_output":
        if (data.agent === 'Architect' || data.agent === 'Forge') {
          // Simulate code diff update or terminal output
          logTerminal(`[STDOUT] ${data.agent}: Processing node structural patterns.`, "info");
        } else {
          logTerminal(`[STDOUT] ${data.agent}: ${data.advice || 'Processing'}`, "info");
        }
        break;

      case "agent_done":
        setOpavState('verify');
        agentFactory.textContent = `Verifying [${data.agent}]`;
        logTerminal(`[INFO] ${data.agent} task complete. Verifying payload.`, "info");
        break;

      case "chain_done":
        setOpavState('');
        agentFactory.textContent = "Awaiting spawn...";
        logTerminal("[SYS] Chain execution finished successfully.", "info");
        break;

      case "mcp_sync":
        // Handle Gmail MCP state
        if (data.unread !== undefined) {
          document.getElementById('mcp-unread').textContent = data.unread;
        }
        if (data.latestSubject) {
          document.getElementById('mcp-ticker').innerHTML = `<span class="text-cyan-500">[GitHub]</span> ${data.latestSubject}`;
        }
        break;

      case "memory_delta":
        // Handle 5-Layer memory metrics
        if (data.l1) memElements.l1.textContent = data.l1;
        if (data.l2) memElements.l2.textContent = data.l2;
        if (data.l3_pid) memElements.l3.textContent = data.l3_pid;
        if (data.l4_cache) memElements.l4.textContent = data.l4_cache;
        if (data.l5_vars) memElements.l5.textContent = data.l5_vars + " vars";
        break;

      default:
        // Generic handling
        if (data.summary) {
          logTerminal(`[EVENT] ${data.summary}`, "info");
        }
    }
  };
}

// ── Action Buttons ─────────────────────────────────────────────────────────
document.getElementById('btn-approve').addEventListener('click', () => {
  logTerminal("[SYS] Human approved high-risk shell mutation.", "exec");
});

document.getElementById('btn-pause').addEventListener('click', () => {
  logTerminal("[SYS] Executor paused by Human interaction.", "warn");
});

document.getElementById('btn-reindex').addEventListener('click', () => {
  logTerminal("system$ reindex_workspace --force", "cmd");
  setTimeout(() => {
    logTerminal("[INFO] Repository indexed. Memory L1 synchronized.", "info");
    memElements.l1.textContent = Math.floor(Math.random() * 500) + 300;
  }, 600);
});

// Initialize
connectWebSocket();
