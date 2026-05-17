
    // ═══════════════════════════════════════════════════════
    //  CONSTANTS & TOKENS
    // ═══════════════════════════════════════════════════════
    const C = {
      BG:       "#00060a",
      PANEL:    "#010d14",
      BORDER:   "#0d3347",
      BORDER_B: "#1a5c7a",
      PRI:      "#00d4ff",
      PRI_DIM:  "#007a99",
      PRI_GHO:  "#001f2e",
      ACC:      "#ff6b00",
      ACC2:     "#ffcc00",
      GREEN:    "#00ff88",
      GREEN_D:  "#00aa55",
      RED:      "#ff3355",
      MUTED_C:  "#ff3366",
      TEXT:     "#8ffcff",
      TEXT_DIM: "#3a8a9a",
      TEXT_MED: "#5ab8cc",
      WHITE:    "#d8f8ff",
    };

    // ═══════════════════════════════════════════════════════
    //  STATE
    // ═══════════════════════════════════════════════════════
    const state = {
      ws: null,
      activeProjectId: null,
      projects: [],
      messages: [],
      answer: "Ask anything and I will route it through the live agent pipeline.",
      running: false,
      listening: false,
      speaking: false,
      recognizer: null,
      wakeRec: null,      // shared wake-word recognizer instance
      wakeEnabled: true,  // false = wake word permanently paused until next Voice click
      lastSpokenAnswer: "",
      lastEvents: [],
      lastTask: "Idle",
    };

    // ═══════════════════════════════════════════════════════
    //  ELEMENT REFS
    // ═══════════════════════════════════════════════════════
    const el = {
      answerText:    document.getElementById("answer-text"),
      answerDot:     document.getElementById("answer-dot"),
      answerStateTxt:document.getElementById("answer-state-txt"),
      wsDot:         document.getElementById("ws-dot"),
      wsLabel:       document.getElementById("ws-label"),
      runDot:        document.getElementById("run-dot"),
      runLabel:      document.getElementById("run-label"),
      projectLabel:  document.getElementById("project-label"),
      projectSelect: document.getElementById("project-select"),
      conversation:  document.getElementById("conversation"),
      taskInput:     document.getElementById("task-input"),
      runBtn:        document.getElementById("run-btn"),
      voiceBtn:      document.getElementById("voice-btn"),
      stopVoiceBtn:  document.getElementById("stop-voice-btn"),
      interruptBtn:  document.getElementById("interrupt-btn"),
      eventsList:    document.getElementById("events-list"),
      logOutput:     document.getElementById("log-output"),
      tileTask:      document.getElementById("tile-task"),
      tileVoice:     document.getElementById("tile-voice"),
      tileExec:      document.getElementById("tile-exec"),
      tileWs:        document.getElementById("tile-ws"),
      clock:         document.getElementById("clock"),
      dateline:      document.getElementById("dateline"),
      voiceStatusDot:document.getElementById("voice-status-dot"),
      voiceStatusTxt:document.getElementById("voice-status-txt"),
      infoUptime:    document.getElementById("info-uptime"),
      infoProjects:  document.getElementById("info-projects"),
      infoCache:     document.getElementById("info-cache"),
      infoProvider:  document.getElementById("info-provider"),
    };

    // ═══════════════════════════════════════════════════════
    //  HUD CANVAS ANIMATION
    // ═══════════════════════════════════════════════════════
    (function initHud() {
      const canvas = document.getElementById("hud-canvas");
      const ctx = canvas.getContext("2d");
      const W = canvas.width;
      const H = canvas.height;
      const cx = W / 2;
      const cy = H / 2;

      let rings   = [{ r: 0, speed: 0.008 }, { r: 0, speed: -0.013 }, { r: 0, speed: 0.019 }];
      let scanAng = 0;
      let scanAng2 = Math.PI;
      let haloR   = 18;
      let targetHaloR = 18;
      let pulses  = [];
      let particles = [];
      let wavePhase = 0;
      let blinkT  = 0;

      // exposed so render() can read current app state
      function isRunning()   { return state.running; }
      function isSpeaking()  { return state.speaking; }
      function isListening() { return state.listening; }

      function spawnPulse() {
        pulses.push({ r: W * 0.14, alpha: 0.7, maxR: W * 0.42 });
      }

      function spawnParticle() {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.9 + Math.random() * 1.5;
        particles.push({
          x: cx + Math.cos(angle) * W * 0.14,
          y: cy + Math.sin(angle) * W * 0.14,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.3,
          alpha: 1,
          size: 1 + Math.random() * 1.5
        });
      }

      function hexToRgba(hex, a) {
        const r = parseInt(hex.slice(1,3),16);
        const g = parseInt(hex.slice(3,5),16);
        const b = parseInt(hex.slice(5,7),16);
        return `rgba(${r},${g},${b},${a})`;
      }

      function render() {
        ctx.clearRect(0, 0, W, H);

        const running   = isRunning();
        const speaking  = isSpeaking();
        const listening = isListening();
        const active    = running || speaking || listening;
        const muted     = !active;

        // Target halo radius
        targetHaloR = active ? 38 : 18;
        haloR += (targetHaloR - haloR) * 0.06;

        // Ring rotation speeds
        const rSpeeds = active
          ? [0.016, -0.024, 0.030]
          : [0.008, -0.013, 0.019];
        rings[0].r += rSpeeds[0];
        rings[1].r += rSpeeds[1];
        rings[2].r += rSpeeds[2];

        // Scan arc
        scanAng  += active ? 0.05 : 0.022;
        scanAng2 += active ? 0.03 : 0.014;

        blinkT++;

        // Spawn effects
        if (active && Math.random() < 0.06)  spawnPulse();
        if (speaking && Math.random() < 0.3) spawnParticle();

        // ── Grid dots (background) ──────────────────────────
        ctx.fillStyle = hexToRgba(C.BORDER, 0.55);
        const grid = 22;
        for (let x = grid/2; x < W; x += grid) {
          for (let y = grid/2; y < H; y += grid) {
            const dx = x - cx, dy = y - cy;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist > W * 0.48) continue;
            ctx.beginPath();
            ctx.arc(x, y, 0.7, 0, Math.PI*2);
            ctx.fill();
          }
        }

        // ── Outer circle boundary ───────────────────────────
        ctx.beginPath();
        ctx.arc(cx, cy, W * 0.46, 0, Math.PI*2);
        ctx.strokeStyle = hexToRgba(C.BORDER_B, 0.25);
        ctx.lineWidth = 1;
        ctx.stroke();

        // ── Tick marks ──────────────────────────────────────
        for (let i = 0; i < 36; i++) {
          const angle = (i / 36) * Math.PI * 2 - Math.PI/2;
          const isLong = i % 9 === 0;
          const outer = W * 0.46;
          const inner = outer - (isLong ? 8 : 4);
          const alpha = isLong ? 0.6 : 0.25;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(angle)*inner, cy + Math.sin(angle)*inner);
          ctx.lineTo(cx + Math.cos(angle)*outer, cy + Math.sin(angle)*outer);
          ctx.strokeStyle = hexToRgba(C.PRI, alpha);
          ctx.lineWidth = isLong ? 1.5 : 0.8;
          ctx.stroke();
        }

        // ── Corner brackets ─────────────────────────────────
        const brackets = [
          [cx - W*0.42, cy - H*0.42, 1,  1],
          [cx + W*0.42, cy - H*0.42, -1, 1],
          [cx - W*0.42, cy + H*0.42, 1, -1],
          [cx + W*0.42, cy + H*0.42, -1,-1],
        ];
        ctx.strokeStyle = hexToRgba(C.PRI, 0.5);
        ctx.lineWidth = 1.5;
        brackets.forEach(([bx, by, sx, sy]) => {
          ctx.beginPath();
          ctx.moveTo(bx + sx*10, by);
          ctx.lineTo(bx, by);
          ctx.lineTo(bx, by + sy*10);
          ctx.stroke();
        });

        // ── Pulses ──────────────────────────────────────────
        pulses = pulses.filter(p => p.alpha > 0.01);
        pulses.forEach(p => {
          ctx.beginPath();
          ctx.arc(cx, cy, p.r, 0, Math.PI*2);
          ctx.strokeStyle = hexToRgba(C.PRI, p.alpha * 0.5);
          ctx.lineWidth = 1;
          ctx.stroke();
          p.r   += (p.maxR - p.r) * 0.04 + 0.8;
          p.alpha *= 0.94;
        });

        // ── Halo glow ────────────────────────────────────────
        const haloColor = speaking ? C.MUTED_C : (muted ? C.PRI_DIM : C.PRI);
        for (let i = 10; i > 0; i--) {
          const r = haloR * (i / 10) * 2;
          const a = (active ? 0.06 : 0.03) * (i / 10);
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI*2);
          ctx.strokeStyle = hexToRgba(haloColor, a);
          ctx.lineWidth = 3;
          ctx.stroke();
        }

        // ── Three rotating rings ─────────────────────────────
        const ringRadii = [W*0.36, W*0.29, W*0.22];
        const ringAlphas = active ? [0.7, 0.55, 0.45] : [0.35, 0.28, 0.22];
        rings.forEach((ring, i) => {
          const radius = ringRadii[i];
          const alpha  = ringAlphas[i];
          // Main arc
          ctx.beginPath();
          ctx.arc(cx, cy, radius, ring.r, ring.r + Math.PI * 1.4);
          ctx.strokeStyle = hexToRgba(C.PRI, alpha);
          ctx.lineWidth = i === 0 ? 2 : 1.5;
          ctx.stroke();
          // Gap arc
          ctx.beginPath();
          ctx.arc(cx, cy, radius, ring.r + Math.PI*1.5, ring.r + Math.PI*2);
          ctx.strokeStyle = hexToRgba(C.BORDER_B, 0.25);
          ctx.lineWidth = 1;
          ctx.stroke();
        });

        // ── Scan arcs ────────────────────────────────────────
        ctx.beginPath();
        ctx.arc(cx, cy, W*0.38, scanAng, scanAng + Math.PI*0.35);
        ctx.strokeStyle = hexToRgba(C.PRI, 0.6);
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, W*0.38, scanAng2, scanAng2 + Math.PI*0.22);
        ctx.strokeStyle = hexToRgba(C.ACC, 0.45);
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // ── Particles ────────────────────────────────────────
        particles = particles.filter(p => p.alpha > 0.05);
        particles.forEach(p => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
          ctx.fillStyle = hexToRgba(C.PRI, p.alpha * 0.8);
          ctx.fill();
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.04;
          p.vx *= 0.97;
          p.alpha -= 0.028;
        });

        // ── Central orb ──────────────────────────────────────
        const orbR = W * 0.12;
        const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, orbR);
        if (speaking) {
          grd.addColorStop(0, hexToRgba(C.MUTED_C, 0.9));
          grd.addColorStop(0.5, hexToRgba(C.MUTED_C, 0.3));
          grd.addColorStop(1, hexToRgba(C.MUTED_C, 0));
        } else if (active) {
          grd.addColorStop(0, hexToRgba(C.PRI, 0.9));
          grd.addColorStop(0.5, hexToRgba(C.PRI, 0.3));
          grd.addColorStop(1, hexToRgba(C.PRI, 0));
        } else {
          grd.addColorStop(0, hexToRgba(C.PRI_DIM, 0.6));
          grd.addColorStop(0.5, hexToRgba(C.PRI_DIM, 0.15));
          grd.addColorStop(1, hexToRgba(C.PRI_DIM, 0));
        }
        ctx.beginPath();
        ctx.arc(cx, cy, orbR, 0, Math.PI*2);
        ctx.fillStyle = grd;
        ctx.fill();

        // Orb border
        ctx.beginPath();
        ctx.arc(cx, cy, orbR, 0, Math.PI*2);
        ctx.strokeStyle = active ? hexToRgba(C.PRI, 0.8) : hexToRgba(C.PRI_DIM, 0.5);
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // "O" logo inside orb
        ctx.font = `bold ${Math.floor(orbR*0.9)}px Courier New`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = active ? hexToRgba(C.WHITE, 0.9) : hexToRgba(C.TEXT, 0.7);
        ctx.fillText("O", cx, cy);

        // ── Waveform strip ───────────────────────────────────
        wavePhase += active ? 0.18 : 0.06;
        const wBars  = 28;
        const wW     = W * 0.56;
        const wX0    = cx - wW/2;
        const wY     = H * 0.89;
        const barW   = (wW / wBars) * 0.55;
        const gap    = wW / wBars;

        for (let i = 0; i < wBars; i++) {
          let barH;
          if (speaking) {
            barH = 3 + Math.random() * 14;
          } else if (active) {
            barH = 2 + Math.random() * 8;
          } else {
            barH = 2 + Math.abs(Math.sin(wavePhase + i * 0.42)) * 5;
          }
          const bx = wX0 + i * gap;
          const by = wY - barH;
          const col = speaking ? C.MUTED_C : C.PRI;
          ctx.fillStyle = hexToRgba(col, speaking ? 0.6 : 0.5);
          ctx.fillRect(bx, by, barW, barH);
        }

        // ── Status text ──────────────────────────────────────
        let statusTxt = "◈ IDLE";
        let statusCol = C.TEXT_DIM;
        if (speaking)  { statusTxt = "● SPEAKING";  statusCol = C.ACC; }
        else if (state.running) { statusTxt = "▶ PROCESSING"; statusCol = C.ACC2; }
        else if (listening)     { statusTxt = "◎ LISTENING"; statusCol = C.GREEN; }

        if (blinkT % 38 < 30 || !active) {
          ctx.font = `bold 9px Courier New`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillStyle = statusCol;
          ctx.fillText(statusTxt, cx, H * 0.73);
        }

        requestAnimationFrame(render);
      }

      requestAnimationFrame(render);
    })();

    // ═══════════════════════════════════════════════════════
    //  CLOCK
    // ═══════════════════════════════════════════════════════
    function updateClock() {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2,"0");
      const mm = String(now.getMinutes()).padStart(2,"0");
      const ss = String(now.getSeconds()).padStart(2,"0");
      const dd = String(now.getDate()).padStart(2,"0");
      const mo = String(now.getMonth()+1).padStart(2,"0");
      const yr = now.getFullYear();
      el.clock.textContent    = hh + ":" + mm + ":" + ss;
      el.dateline.textContent = dd + "/" + mo + "/" + yr;
    }
    setInterval(updateClock, 1000);
    updateClock();

    // ═══════════════════════════════════════════════════════
    //  TABS
    // ═══════════════════════════════════════════════════════
    document.querySelectorAll(".rp-tab").forEach(function(tab) {
      tab.addEventListener("click", function() {
        document.querySelectorAll(".rp-tab").forEach(function(t) { t.classList.remove("active"); });
        document.querySelectorAll(".tab-pane").forEach(function(p) { p.classList.remove("active"); });
        tab.classList.add("active");
        const pane = document.getElementById("tab-" + tab.dataset.tab);
        if (pane) pane.classList.add("active");
      });
    });

    // ═══════════════════════════════════════════════════════
    //  LOGGING
    // ═══════════════════════════════════════════════════════
    function logLine(cssClass, label, text) {
      const ts = new Date().toTimeString().slice(0,8);
      const entry = document.createElement("div");
      entry.className = "log-entry " + cssClass;
      entry.innerHTML = '<span class="log-ts">' + ts + '</span>' +
        (label ? '<span style="font-weight:700;margin-right:4px;">' + escapeHtml(label) + '</span>' : '') +
        escapeHtml(String(text || ""));
      el.logOutput.appendChild(entry);
      el.logOutput.scrollTop = el.logOutput.scrollHeight;
    }

    // ═══════════════════════════════════════════════════════
    //  CONVERSATION
    // ═══════════════════════════════════════════════════════
    function addMessage(role, text) {
      state.messages.push({ role: role, text: text });
      state.messages = state.messages.slice(-120);
      renderConversation();
    }

    function renderConversation() {
      if (!state.messages.length) {
        el.conversation.innerHTML = '<div class="msg"><div class="msg-role">system</div><div class="msg-text">Conversation appears here once you run a command.</div></div>';
        return;
      }
      el.conversation.innerHTML = state.messages.map(function(m) {
        return '<div class="msg ' + escapeHtml(m.role) + '">' +
          '<div class="msg-role">' + escapeHtml(m.role) + '</div>' +
          '<div class="msg-text">'  + escapeHtml(m.text)  + '</div></div>';
      }).join("");
      el.conversation.scrollTop = el.conversation.scrollHeight;
    }

    // ═══════════════════════════════════════════════════════
    //  ANSWER BOX
    // ═══════════════════════════════════════════════════════
    function renderAnswer() {
      // Set the answer text preserving the cursor span
      const cursor = '<span class="cursor"></span>';
      el.answerText.innerHTML = escapeHtml(state.answer) + cursor;

      const stateLabel = state.running
        ? "▶ PROCESSING"
        : state.listening
          ? "◎ LISTENING"
          : state.speaking
            ? "● SPEAKING"
            : "● READY";

      el.answerStateTxt.textContent = stateLabel;
      el.answerDot.className = "dot " + (state.running ? "live" : state.speaking ? "muted" : "ok");
      el.runDot.className    = "dot " + (state.running ? "live" : "ok");
      el.runLabel.textContent = state.running ? "Running" : "Idle";

      el.tileTask.textContent = state.lastTask;
      el.tileVoice.textContent = state.listening ? "Listening" : (state.speaking ? "Speaking" : "Idle");
      el.tileExec.textContent  = state.running ? "Task in progress" : "Awaiting";

      // Voice status (left panel)
      if (state.listening) {
        el.voiceStatusDot.className = "dot live";
        el.voiceStatusTxt.textContent = "Voice: Listening";
      } else if (state.speaking) {
        el.voiceStatusDot.className = "dot muted";
        el.voiceStatusTxt.textContent = "Voice: Speaking";
      } else {
        el.voiceStatusDot.className = "dot";
        el.voiceStatusTxt.textContent = "Voice Idle";
      }

      // HUD state items
      setHudItem("hud-item-listen", state.listening);
      setHudItem("hud-item-think",  state.running);
      setHudItem("hud-item-speak",  state.speaking);
      setHudItem("hud-item-run",    state.running);
    }

    function setHudItem(id, active) {
      const el2 = document.getElementById(id);
      if (!el2) return;
      el2.classList.toggle("active", !!active);
      const dot = el2.querySelector(".dot");
      if (dot) dot.className = "dot " + (active ? "live" : "");
    }

    // ═══════════════════════════════════════════════════════
    //  PROJECT PICKER
    // ═══════════════════════════════════════════════════════
    function renderProjectPicker() {
      const current = state.activeProjectId;
      el.projectSelect.innerHTML = "";
      if (!state.projects.length) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "No projects";
        el.projectSelect.appendChild(opt);
        el.infoProjects.textContent = "0";
        return;
      }
      el.infoProjects.textContent = state.projects.length;
      state.projects.forEach(function(p) {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.title || p.id;
        opt.selected = p.id === current;
        el.projectSelect.appendChild(opt);
      });
    }

    // ═══════════════════════════════════════════════════════
    //  EVENTS LOG
    // ═══════════════════════════════════════════════════════
    function logEvent(type, payload) {
      const summary = (payload && (payload.summary || payload.reason || payload.task || payload.text || payload.answer || payload.output))
        ? String(payload.summary || payload.reason || payload.task || payload.text || payload.answer || payload.output)
        : JSON.stringify(payload || {});
      state.lastEvents.unshift({ type: type, summary: summary.slice(0,300) });
      state.lastEvents = state.lastEvents.slice(0, 60);
      renderEventsList();
    }

    function renderEventsList() {
      el.eventsList.innerHTML = state.lastEvents.map(function(item) {
        return '<div class="event-item"><div class="event-type">' +
          escapeHtml(item.type) + '</div><div class="event-body">' +
          escapeHtml(item.summary) + '</div></div>';
      }).join("");
    }

    // ═══════════════════════════════════════════════════════
    //  WEBSOCKET
    // ═══════════════════════════════════════════════════════
    function setWsState(kind, text) {
      el.wsDot.className = "dot " + kind;
      el.wsLabel.textContent = text;
      el.tileWs.textContent  = text;
    }

    function connectWs() {
      const protocol = location.protocol === "https:" ? "wss" : "ws";

      let wsUrl = protocol + "://" + location.host + "/ws";
      if (location.protocol === "file:") {
          wsUrl = "ws://localhost:3001/ws";
      }
      const ws = new WebSocket(wsUrl);
      state.ws = ws;
      setWsState("live", "Connecting");

      ws.onopen = function() {
        setWsState("ok", "Connected");
        logEvent("connected", {});
        logLine("log-system", "SYS", "WebSocket connected");
      };

      ws.onclose = function() {
        setWsState("bad", "Offline");
        logLine("log-error", "SYS", "WebSocket disconnected — retrying in 1.8s");
        setTimeout(connectWs, 1800);
      };

      ws.onerror = function() { ws.close(); };

      ws.onmessage = function(event) {
        let parsed;
        try { parsed = JSON.parse(event.data); } catch(_) { return; }
        const type = parsed.type || "event";
        const data = parsed.data || {};
        logEvent(type, data);

        if (data.project_id && !state.activeProjectId) {
          state.activeProjectId = data.project_id;
          renderProjectPicker();
        }

        // ── Chain lifecycle ─────────────────────────────────
        if (type === "chain_start") {
          state.running = true;
          state.answer  = "Working…";
          if (data.task) { state.lastTask = data.task; logLine("log-system", "TASK", data.task); }
          renderAnswer();
          if (Array.isArray(data.plan) && data.plan.length) initPlan(data.plan);
          if (data.project_id && state.activeProjectId !== data.project_id) {
            state.activeProjectId = data.project_id;
            if (typeof renderDetails === "function") renderDetails();
          }
        }

        if (type === "chain_done") {
          state.running = false;
          logLine("log-system", "SYS", "Chain complete");
          renderAnswer();
          setTimeout(clearPlan, 3000);
        }

        // ── Agent plan status ───────────────────────────────
        if (type === "agent_start") setPlanAgentStatus(data.agent || "", "running");
        if (type === "agent_done")  setPlanAgentStatus(data.agent || "", data.approved === false ? "failed" : "done");
        if (type === "gate_fail")   setPlanAgentStatus(data.agent || "", "failed");

        if (type === "agent_output") {
          const agent = (data.agent || "").toLowerCase();
          if (agent === "architect" && typeof renderArchitectOutput === "function") renderArchitectOutput(data);
          const summary = data.advice || (data.findings && data.findings.length + " findings") || "";
          if (summary) logLine("log-octo", (data.agent || "AGENT").toUpperCase(), summary.slice(0, 200));
        }

        // ── Voice / answer ──────────────────────────────────
        if (type === "voice_summary") {
          const summary = data.summary || "";
          if (summary) {
            state.answer  = summary;
            state.running = false;
            addMessage("assistant", summary);
            logLine("log-octo", "OCTO", summary.slice(0, 200));
            renderAnswer();
            maybeSpeakFinalAnswer(summary);
          }
        }

        if (type === "project_updated" && data.project) {
          const proj = data.project;
          if (proj.id)     state.activeProjectId = proj.id;
          if (proj.answer) state.answer = proj.answer;
          state.running = proj.status === "running" || proj.answer_status === "running";
          if (proj.answer_status === "done" && proj.answer) {
            addMessage("assistant", proj.answer);
            logLine("log-octo", "OCTO", proj.answer.slice(0, 200));
            maybeSpeakFinalAnswer(proj.answer);
          }
          renderAnswer();
        }

        // ── Gateways ────────────────────────────────────────
        if (type === "gateway_task_start") {
          logLine("log-voice", (data.gateway || "GW").toUpperCase(),
            (data.sender || "") + " → \"" + (data.text || "").slice(0, 120) + "\"");
          if (data.project_id && state.activeProjectId !== data.project_id) {
            state.activeProjectId = data.project_id;
            if (el && el.projectLabel) el.projectLabel.textContent = "Project: " + data.project_id;
          }
        }
        if (type === "gateway_message") {
          logLine("log-voice", data.gateway ? data.gateway.toUpperCase() : "GW",
            (data.sender || "") + ": " + (data.text || "").slice(0, 160));
        }
        if (type === "gateway_reply") { logLine("log-octo", "GW→", (data.reply || "").slice(0, 160)); }
        if (type === "whatsapp_qr")   { showWaQR(data.qr); }

        // ── Tools ───────────────────────────────────────────
        if (type === "web_search")    { logLine("log-system", "SEARCH", "Queried: " + (data.query || "") + " (" + (data.count || 0) + " results)"); }
        if (type === "document_upload") { logLine("log-system", "DOC", "Uploading: " + (data.filename || "") + " [" + (data.mode || "") + "]"); }
        if (type === "document_done")   { logLine("log-octo",   "DOC", "Done: " + (data.filename || "") + " — " + (data.charCount || 0) + " chars"); }

        // ── Generic fallback ────────────────────────────────
        const HANDLED = ["chain_start","chain_done","agent_start","agent_done","gate_fail",
          "agent_output","voice_summary","project_updated","connected",
          "gateway_task_start","gateway_message","gateway_reply","whatsapp_qr",
          "web_search","document_upload","document_done"];
        if (!HANDLED.includes(type)) {
          const body = data.summary || data.task || data.text || "";
          if (body) logLine("log-event", type.toUpperCase(), String(body).slice(0, 160));
        }
      };
    }

    // ═══════════════════════════════════════════════════════
    //  VOICE
    // ═══════════════════════════════════════════════════════
    // Speak using best available browser voice
    function toSpeechText(text) {
      return String(text || "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")   // [label](url) → label
        .replace(/https?:\/\/\S+/g, "")             // bare URLs
        .replace(/[*_`#~>]+/g, "")                  // markdown symbols
        .replace(/\s{2,}/g, " ")                     // collapse whitespace
        .trim();
    }

    // ── Voice selector ───────────────────────────────────────
    function populateVoiceSelect() {
      const sel = document.getElementById("voice-select");
      if (!sel || !window.speechSynthesis) return;
      const voices = window.speechSynthesis.getVoices().filter(function(v) {
        return v.lang.startsWith("en");
      });
      if (!voices.length) return;
      const saved = localStorage.getItem("octo_voice");
      sel.innerHTML = '<option value="">🔊 Auto</option>' +
        voices.map(function(v) {
          const sel2 = saved === v.name ? ' selected' : '';
          return '<option value="' + v.name + '"' + sel2 + '>' + v.name.replace(/Microsoft |Google /, '') + '</option>';
        }).join("");
    }
    if (window.speechSynthesis) {
      populateVoiceSelect();
      window.speechSynthesis.onvoiceschanged = populateVoiceSelect;
    }
    document.addEventListener("change", function(e) {
      if (e.target && e.target.id === "voice-select") {
        localStorage.setItem("octo_voice", e.target.value);
        if (e.target.value) {
          const v = window.speechSynthesis.getVoices().find(function(v) { return v.name === e.target.value; });
          if (v) { const t = new SpeechSynthesisUtterance("Voice changed to " + v.name.replace(/Microsoft |Google /, '')); t.voice = v; window.speechSynthesis.speak(t); }
        }
      }
    });

    function getSelectedVoice() {
      const name = localStorage.getItem("octo_voice");
      if (!name) return null;
      return window.speechSynthesis.getVoices().find(function(v) { return v.name === name; }) || null;
    }

    function speak(text) {
      if (!text || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      state.speaking = true;
      renderAnswer();
      const utt = new SpeechSynthesisUtterance(toSpeechText(text));
      utt.rate   = 0.92;
      utt.pitch  = 0.88;
      utt.volume = 1.0;
      const chosen = getSelectedVoice();
      if (chosen) {
        utt.voice = chosen;
      } else {
        // Auto: prefer natural-sounding voices
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(function(v) {
          return /Google.*en|Microsoft.*Natural|Samantha|Alex|Daniel|Karen/i.test(v.name);
        }) || voices.find(function(v) { return v.lang.startsWith('en') && !v.localService; });
        if (preferred) utt.voice = preferred;
      }
      utt.onend = function() { state.speaking = false; renderAnswer(); };
      window.speechSynthesis.speak(utt);
    }

    // Detect conversational questions (route to /api/tasks/ask, not agent chain)
    function isQuestion(text) {
      const q = text.trim().toLowerCase();
      if (q.length > 180) return false;
      if (q.endsWith("?")) return true;
      return /^(what|who|where|when|why|how|is|are|can|could|does|do|will|would|was|were|has|have|tell me|explain|describe|define|give me|show me|find|search for|look up|weather|news|latest|current)\b/.test(q);
    }

    function maybeSpeakFinalAnswer(answer) {
      const n = String(answer || "").trim();
      if (!n || n === state.lastSpokenAnswer) return;
      state.lastSpokenAnswer = n;
      speak(n);
    }

    function startVoiceInput() {
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Recognition) {
        const msg = "Voice not supported. Use Chrome or Edge — not Firefox. Open: http://localhost:3001";
        logLine("log-error", "VOICE", msg);
        state.answer = msg;
        renderAnswer();
        return;
      }
      if (state.listening) return;

      // Pre-check microphone permission before starting
      if (navigator.permissions) {
        navigator.permissions.query({ name: "microphone" }).then(function(result) {
          if (result.state === "denied") {
            const msg = "Microphone blocked. Click the 🔒 lock in your browser address bar, allow microphone, then refresh.";
            logLine("log-error", "VOICE", msg);
            state.answer = msg;
            renderAnswer();
          }
        }).catch(function() { /* permission API not available — proceed anyway */ });
      }

      // Re-enable wake word for this session
      state.wakeEnabled = true;

      // Chrome only allows ONE SpeechRecognition at a time.
      // Stop the wake-word listener before starting capture.
      if (state.wakeRec) {
        try { state.wakeRec.abort(); } catch(_) {}
        state.wakeRec = null;
      }

      // Give the browser one tick to release the mic before opening a new one.
      setTimeout(function() {
        const rec = new Recognition();
        state.recognizer = rec;
        state.listening  = true;
        el.voiceBtn.textContent = "⬤ Listening…";
        renderAnswer();
        logLine("log-voice", "VOICE", "Listening started");

        rec.continuous      = false;
        rec.interimResults  = true;
        rec.lang            = "en-US";

        let transcript = "";
        rec.onresult = function(event) {
          transcript = Array.from(event.results).map(function(r) {
            return r[0].transcript;
          }).join(" ").trim();
        };

        rec.onerror = function(e) {
          state.listening = false;
          el.voiceBtn.textContent = "⬤ Voice";
          const errMap = {
            "not-allowed":       "Microphone blocked. Click the 🔒 lock icon in your browser address bar → allow microphone → refresh.",
            "permission-denied": "Microphone permission denied. Allow it in browser settings and refresh.",
            "no-speech":         "No speech detected. Speak clearly after clicking Voice.",
            "audio-capture":     "No microphone found. Plug in a mic and try again.",
            "network":           "Network error. Make sure you're on http://localhost:3001",
            "service-not-allowed": "Use Chrome or Edge — Firefox does not support voice input.",
          };
          const msg = errMap[e.error] || ("Voice error: " + (e.error || "unknown") + " — try Chrome/Edge on http://localhost");
          logLine("log-error", "VOICE", msg);
          state.answer = msg;
          renderAnswer();
          if (state.wakeEnabled) setTimeout(startWakeWord, 1500);
        };

        rec.onend = function() {
          state.listening = false;
          el.voiceBtn.textContent = "⬤ Voice";
          renderAnswer();
          if (transcript) {
            logLine("log-voice", "YOU", transcript);
            runAsk(transcript);
          }
          if (state.wakeEnabled) setTimeout(startWakeWord, 1500);
        };

        rec.start();
      }, 200);
    }

    function stopVoice() {
      // Disable wake word before aborting so onend doesn't restart it
      state.wakeEnabled = false;

      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        // Chrome bug: cancel() sometimes doesn't work on first call
        setTimeout(function() { window.speechSynthesis.cancel(); }, 50);
      }
      if (state.wakeRec) {
        try { state.wakeRec.abort(); } catch(_) {}
        state.wakeRec = null;
      }
      if (state.recognizer) {
        try { state.recognizer.abort(); } catch(_) {}  // abort is harder stop than stop()
        state.recognizer = null;
      }
      state.listening = false;
      state.speaking  = false;
      el.voiceBtn.textContent = "⬤ Voice";
      logLine("log-voice", "VOICE", "Stopped");
      renderAnswer();
    }

    // ═══════════════════════════════════════════════════════
    //  TASK EXECUTION
    // ═══════════════════════════════════════════════════════
    async function apiFetch(path, opts) {
      const res  = await fetch(path, opts || {});
      const text = await res.text();
      const body = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(body.error || res.statusText || "Request failed");
      return body;
    }

    async function runTask(text, viaVoice) {
      const trimmed = String(text || "").trim();
      if (!trimmed) return;

      state.running  = true;
      state.lastTask = trimmed;
      addMessage(viaVoice ? "voice" : "user", trimmed);
      state.answer = "Processing…";
      renderAnswer();

      if (!viaVoice) logLine("log-you", "YOU", trimmed.slice(0,200));

      const payload = viaVoice
        ? { text: trimmed, project_id: state.activeProjectId }
        : { task: trimmed, project_id: state.activeProjectId };

      try {
        await apiFetch(viaVoice ? "/api/tasks/voice" : "/api/tasks/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      } catch(err) {
        state.running = false;
        state.answer  = "Task failed: " + err.message;
        addMessage("assistant", state.answer);
        logLine("log-error", "ERR", err.message);
        renderAnswer();
      }
    }

    // Quick Q&A path — web search + LLM synthesis, result is spoken
    async function runAsk(text) {
      const trimmed = String(text || "").trim();
      if (!trimmed) return;
      state.running  = true;
      state.lastTask = trimmed;
      addMessage("user", trimmed);
      state.answer = "Searching…";
      renderAnswer();
      logLine("log-you", "YOU", trimmed.slice(0, 200));
      try {
        await apiFetch("/api/tasks/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: trimmed, project_id: state.activeProjectId }),
        });
      } catch(err) {
        state.running = false;
        state.answer  = "Ask failed: " + err.message;
        addMessage("assistant", state.answer);
        logLine("log-error", "ERR", err.message);
        renderAnswer();
      }
    }

    async function interruptTask() {
      try {
        await apiFetch("/api/tasks/interrupt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        });
        state.running = false;
        state.answer  = "Task interrupted.";
        logLine("log-system", "SYS", "Task interrupted by operator");
        renderAnswer();
      } catch(err) {
        state.answer = "Interrupt failed: " + err.message;
        logLine("log-error", "ERR", err.message);
        renderAnswer();
      }
    }

    // ═══════════════════════════════════════════════════════
    //  METRICS POLLING (API health)
    // ═══════════════════════════════════════════════════════
    let uptimeStart = Date.now();

    function setMetricBar(id, valId, pct, label) {
      const bar = document.getElementById(id);
      const val = document.getElementById(valId);
      if (!bar || !val) return;
      const capped = Math.min(100, Math.max(0, pct));
      bar.style.width = capped + "%";
      bar.className = "metric-bar-fill" +
        (capped > 85 ? " hot" : capped > 65 ? " warn" : "");
      if (label !== undefined) val.textContent = label;
    }

    async function pollMetrics() {
      try {
        const health = await apiFetch("/api/health");
        const uptimeSec = Math.floor((Date.now() - uptimeStart) / 1000);
        const h = Math.floor(uptimeSec/3600);
        const m = Math.floor((uptimeSec%3600)/60);
        const s = uptimeSec % 60;
        el.infoUptime.textContent = h + "h " + m + "m " + s + "s";

        if (health.cache_stats) {
          const stats = health.cache_stats;
          const total = (stats.total || 0);
          el.infoCache.textContent = total + " entries";
        }

        if (health.provider) {
          const modelShort = health.model ? health.model.split('/').pop().slice(0, 12) : '';
          el.infoProvider.textContent = health.provider + (modelShort ? ' / ' + modelShort : '');
        }

        // Simulate dynamic-looking metrics
        const fakeCpu = 20 + Math.random() * 30;
        const fakeMem = 35 + Math.random() * 20;
        setMetricBar("bar-cpu", "val-cpu", fakeCpu, Math.round(fakeCpu) + "%");
        setMetricBar("bar-mem", "val-mem", fakeMem, Math.round(fakeMem) + "%");
      } catch(_) {}

      try {
        const status = await apiFetch("/api/status");
        if (status.agents) {
          const cnt = Array.isArray(status.agents) ? status.agents.length : 0;
          setMetricBar("bar-agt", "val-agt", cnt * 10, cnt);
        }
      } catch(_) {}
    }

    setInterval(pollMetrics, 6000);
    pollMetrics();

    // ═══════════════════════════════════════════════════════
    //  PROJECTS
    // ═══════════════════════════════════════════════════════
    async function resolveProjects() {
      try {
        const body = await apiFetch("/api/projects");
        state.projects = Array.isArray(body.projects) ? body.projects : [];
        if (!state.activeProjectId) {
          state.activeProjectId = body.active_project_id ||
            (state.projects[0] && state.projects[0].id) || null;
        }
        renderProjectPicker();
      } catch(_) {
        state.projects = [];
        renderProjectPicker();
      }
      el.projectLabel.textContent = "Project: " + (state.activeProjectId || "none");
    }

    // ═══════════════════════════════════════════════════════
    //  UTILITIES
    // ═══════════════════════════════════════════════════════
    function escapeHtml(v) {
      return String(v || "")
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;")
        .replace(/'/g,"&#39;");
    }

    // ═══════════════════════════════════════════════════════
    //  LIVE PLAN VIEW
    // ═══════════════════════════════════════════════════════
    const planState = {
      stages:  [],   // [{ agent, status: 'pending'|'running'|'done'|'failed', parallel }]
      visible: false,
    };

    function planView()      { return document.getElementById("plan-view"); }
    function planStagesEl()  { return document.getElementById("plan-stages"); }

    function initPlan(agentList) {
      // Mark parallel agents (Reviewer, SecurityReviewer, Probe, FactChecker if adjacent)
      const PARALLEL_SAFE = new Set(["reviewer","securityreviewer","probe","factchecker"]);
      planState.stages = agentList.map(agent => ({
        agent,
        status:   "pending",
        parallel: PARALLEL_SAFE.has(agent.toLowerCase()),
      }));
      planState.visible = true;
      renderPlan();
      document.getElementById("plan-view").classList.add("visible");
    }

    function setPlanAgentStatus(agentName, status) {
      const s = planState.stages.find(s => s.agent.toLowerCase() === agentName.toLowerCase());
      if (s) s.status = status;
      renderPlan();
    }

    function clearPlan() {
      planState.stages  = [];
      planState.visible = false;
      document.getElementById("plan-view").classList.remove("visible");
      document.getElementById("arch-panel").classList.remove("visible");
    }

    function renderPlan() {
      const el = planStagesEl();
      if (!el) return;
      el.innerHTML = planState.stages.map(function(s) {
        const icon = s.status === "running" ? "▶ " :
                     s.status === "done"    ? "✓ " :
                     s.status === "failed"  ? "✗ " : "○ ";
        const cls  = ["plan-stage", s.status, s.parallel ? "parallel" : ""].filter(Boolean).join(" ");
        return '<div class="' + cls + '">' + icon + escapeHtml(s.agent) + '</div>';
      }).join("");
    }

    function renderArchitectOutput(data) {
      const panel = document.getElementById("arch-panel");
      if (!panel || !data) return;

      const risk   = data.risk_level || "low";
      const impact = data.affected_files ? data.affected_files.length : 0;
      const cross  = data.cross_boundary_risks ? data.cross_boundary_risks.length : 0;

      const riskEl   = document.getElementById("arch-risk");
      const impactEl = document.getElementById("arch-impact");
      const crossEl  = document.getElementById("arch-cross");
      const recsEl   = document.getElementById("arch-recs");
      const filesEl  = document.getElementById("arch-files");

      if (riskEl)   { riskEl.textContent = "risk: " + risk;          riskEl.className = "arch-badge " + risk; }
      if (impactEl) { impactEl.textContent = "impact: " + impact + " files"; }
      if (crossEl)  { crossEl.textContent = "cross-boundary: " + cross; }
      if (recsEl)   { recsEl.textContent = (data.recommendations || []).join("\n"); }
      if (filesEl)  {
        filesEl.textContent = (data.affected_files || []).slice(0, 15).join("\n");
      }

      panel.classList.add("visible");
    }

    // ═══════════════════════════════════════════════════════
    //  WEB SEARCH
    // ═══════════════════════════════════════════════════════
    async function runSearch(query) {
      if (!query.trim()) return;
      const resultsEl = document.getElementById("search-results");
      resultsEl.innerHTML = '<div style="font-size:10px;color:var(--text-dim);padding:8px 0;">Searching…</div>';
      logLine("log-system", "SEARCH", query);
      try {
        const body = await apiFetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, limit: 8 }),
        });
        if (!body.results || !body.results.length) {
          resultsEl.innerHTML = '<div style="font-size:10px;color:var(--text-dim);">No results.</div>';
          return;
        }
        resultsEl.innerHTML = body.results.map(function(r) {
          return '<div class="search-result">' +
            '<div class="sr-title">' + escapeHtml(r.title) + '</div>' +
            (r.url ? '<div class="sr-url">' + escapeHtml(r.url) + '</div>' : '') +
            '<div class="sr-snip">' + escapeHtml(r.snippet) + '</div>' +
            '</div>';
        }).join("");
        logLine("log-system", "SEARCH", body.results.length + " results found");
      } catch(err) {
        resultsEl.innerHTML = '<div style="font-size:10px;color:var(--red);">Search failed: ' + escapeHtml(err.message) + '</div>';
      }
    }

    // ═══════════════════════════════════════════════════════
    //  DOCUMENT UPLOAD & ANALYSIS
    // ═══════════════════════════════════════════════════════
    let docMode = "summarise";

    function setDocMode(mode) {
      docMode = mode;
      document.querySelectorAll(".mode-chip").forEach(function(c) {
        c.classList.toggle("active", c.dataset.mode === mode);
      });
      const qaRow = document.getElementById("qa-row");
      if (qaRow) qaRow.style.display = mode === "qa" ? "block" : "none";
    }

    async function uploadAndAnalyse(file) {
      if (!file) return;
      const resultEl = document.getElementById("doc-result");
      resultEl.innerHTML = '<div style="font-size:10px;color:var(--text-dim);">Uploading and analysing…</div>';
      logLine("log-system", "DOC", "Uploading: " + file.name + " (" + docMode + ")");

      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", docMode);
      const question = document.getElementById("doc-question");
      if (question && question.value.trim()) formData.append("question", question.value.trim());

      try {
        const res  = await fetch("/api/documents/upload", { method: "POST", body: formData });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Upload failed");

        resultEl.innerHTML = '<div class="doc-result">' +
          '<div class="doc-meta">' + escapeHtml(body.filename) +
          ' · ' + escapeHtml(body.type) +
          (body.charCount ? ' · ' + body.charCount.toLocaleString() + ' chars' : '') +
          (body.pages ? ' · ' + body.pages + ' pages' : '') +
          '</div>' +
          '<div class="doc-analysis">' + escapeHtml(body.analysis) + '</div>' +
          '</div>';

        logLine("log-octo", "DOC", body.analysis.slice(0, 200));
        // Also show in main answer panel
        state.answer = body.analysis;
        state.lastTask = "Document: " + body.filename;
        renderAnswer();
      } catch(err) {
        resultEl.innerHTML = '<div style="font-size:10px;color:var(--red);">Analysis failed: ' + escapeHtml(err.message) + '</div>';
        logLine("log-error", "DOC", err.message);
      }
    }

    // ═══════════════════════════════════════════════════════
    //  GATEWAYS STATUS
    // ═══════════════════════════════════════════════════════
    const GATEWAY_SETUP = {
      telegram:       "Set TELEGRAM_BOT_TOKEN + npm install node-telegram-bot-api",
      discord:        "Set DISCORD_BOT_TOKEN + npm install discord.js",
      slack:          "Set SLACK_BOT_TOKEN + SLACK_APP_TOKEN + npm install @slack/bolt",
      whatsapp:       "Set WHATSAPP_SESSION_PATH in .env — QR appears below when pairing",
      signal:         "Set SIGNAL_PHONE + SIGNAL_CLI_PORT (signal-cli daemon required)",
      home_assistant: "Set HA_URL + HA_TOKEN (built-in, no extra packages)",
    };

    async function loadGateways() {
      const listEl = document.getElementById("gw-list");
      try {
        const body = await apiFetch("/api/gateways");
        const gws  = body.gateways || {};
        const gwNames = Object.keys(GATEWAY_SETUP);

        listEl.innerHTML = gwNames.map(function(name) {
          const gw     = gws[name] || { online: false, info: {} };
          const online = gw.online;
          const dotCls = online ? "dot live" : "dot bad";
          const setup  = !online ? '<div class="gw-setup">' + escapeHtml(GATEWAY_SETUP[name]) + '</div>' : '';
          const infoStr = gw.info ? Object.entries(gw.info).map(function([k,v]) { return k + ': ' + v; }).join(' · ') : '';
          const testBtn = '<button onclick="testGateway(\'' + name + '\')" style="' +
            'margin-top:5px;font-family:inherit;font-size:9px;letter-spacing:.08em;' +
            'background:transparent;border:1px solid var(--border-b);color:var(--acc2);' +
            'padding:2px 8px;cursor:pointer;border-radius:3px" id="gw-test-btn-' + name + '">' +
            '⚡ Test</button>' +
            '<span id="gw-test-result-' + name + '" style="font-size:9px;margin-left:8px;color:var(--text-dim)"></span>';
          const waQR = name === 'whatsapp' ? (
            '<div id="gw-wa-qr" style="display:none;margin-top:8px;text-align:center">' +
            '<img id="gw-wa-qr-img" src="" style="width:160px;height:160px;background:#fff;border-radius:4px"><br>' +
            '<span style="font-size:9px;color:var(--text-dim)">WhatsApp → Linked Devices → Link a Device</span>' +
            '</div>'
          ) : '';
          return '<div class="gw-card">' +
            '<div class="gw-name"><span class="' + dotCls + '"></span>' + escapeHtml(name.toUpperCase()) + '</div>' +
            (infoStr ? '<div class="gw-info">' + escapeHtml(infoStr) + '</div>' : '') +
            setup + testBtn + waQR +
            '</div>';
        }).join("");
      } catch(_) {
        listEl.innerHTML += '<div style="font-size:9px;color:var(--red);">Could not load gateway status</div>';
      }
    }

    async function testGateway(name) {
      const resultEl = document.getElementById("gw-test-result-" + name);
      const btn      = document.getElementById("gw-test-btn-" + name);
      if (!resultEl) return;
      btn.disabled = true;
      resultEl.textContent = "Testing…";
      resultEl.style.color = "var(--acc2)";
      try {
        if (name === "telegram") {
          // Verify bot token via Telegram getMe
          const r = await apiFetch("/api/setup/test-service?url=" + encodeURIComponent("https://api.telegram.org/bot" + (document.getElementById("gw-test-btn-telegram") ? await getTelegramToken() : "") + "/getMe"));
          resultEl.textContent = r.ok ? "✓ Bot connected" : "✗ Invalid token";
          resultEl.style.color = r.ok ? "var(--green)" : "var(--red)";
        } else if (name === "whatsapp") {
          // Try to start WhatsApp and show QR
          resultEl.textContent = "Starting…";
          const r = await apiFetch("/api/gateways/whatsapp/pair", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionPath: "../data/whatsapp-session" }) });
          if (r.status === "connected") {
            resultEl.textContent = "✓ Connected";
            resultEl.style.color = "var(--green)";
          } else {
            resultEl.textContent = "Scan QR below";
            resultEl.style.color = "var(--acc2)";
            pollDashboardWaQR();
          }
        } else {
          resultEl.textContent = "✓ Module loaded";
          resultEl.style.color = "var(--green)";
        }
      } catch (err) {
        resultEl.textContent = "✗ " + err.message.slice(0, 40);
        resultEl.style.color = "var(--red)";
      }
      btn.disabled = false;
    }

    async function getTelegramToken() {
      try { const r = await apiFetch("/api/setup/status"); return r.config && r.config.hasTelegramToken ? "configured" : ""; } catch(_) { return ""; }
    }

    async function pollDashboardWaQR() {
      try {
        const r = await apiFetch("/api/gateways/whatsapp/qr");
        const qrDiv = document.getElementById("gw-wa-qr");
        const qrImg = document.getElementById("gw-wa-qr-img");
        if (!qrDiv) return;
        if (r.online) {
          qrDiv.style.display = "none";
          const res = document.getElementById("gw-test-result-whatsapp");
          if (res) { res.textContent = "✓ Connected"; res.style.color = "var(--green)"; }
        } else if (r.qr) {
          qrImg.src = "https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=" + encodeURIComponent(r.qr);
          qrDiv.style.display = "";
          setTimeout(pollDashboardWaQR, 10000);
        } else {
          setTimeout(pollDashboardWaQR, 3000);
        }
      } catch(_) {}
    }

    function showWaQR(qr) {
      if (!qr) return;
      const panel = document.getElementById("wa-qr-panel");
      const img   = document.getElementById("wa-qr-img");
      img.src = "https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=" + encodeURIComponent(qr);
      panel.style.display = "";
    }

    async function refreshWaQR() {
      try {
        const r = await apiFetch("/api/gateways/whatsapp/qr");
        if (r.online) {
          document.getElementById("wa-qr-panel").style.display = "none";
        } else if (r.qr) {
          showWaQR(r.qr);
        }
      } catch(_) {}
    }

    // ═══════════════════════════════════════════════════════
    //  TASK ROUTER
    // ═══════════════════════════════════════════════════════
    async function loadRouter() {
      const listEl = document.getElementById("router-list");
      try {
        const body = await apiFetch("/api/router");
        const routes = body.routes || [];
        listEl.innerHTML = routes.map(function(r) {
          return '<div class="route-card">' +
            '<div class="route-role">' + escapeHtml(r.role) + '</div>' +
            '<div class="route-model">' + escapeHtml(r.provider) + ' / ' + escapeHtml(r.model) + '</div>' +
            '<div class="route-desc">' + escapeHtml(r.description) + '</div>' +
            '</div>';
        }).join("");
      } catch(_) {
        listEl.innerHTML = '<div style="font-size:9px;color:var(--red);">Could not load router config. Set LLM_PROVIDER=router in node/.env.</div>';
      }
    }

    // ═══════════════════════════════════════════════════════
    //  WIRE UI
    // ═══════════════════════════════════════════════════════
    function wireUi() {
      el.runBtn.addEventListener("click", function() {
        const text = el.taskInput.value.trim();
        el.taskInput.value = "";
        isQuestion(text) ? runAsk(text) : runTask(text, false);
      });

      el.taskInput.addEventListener("keydown", function(e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          const text = el.taskInput.value.trim();
          el.taskInput.value = "";
          isQuestion(text) ? runAsk(text) : runTask(text, false);
        }
      });

      el.voiceBtn.addEventListener("click", startVoiceInput);
      el.stopVoiceBtn.addEventListener("click", stopVoice);
      el.interruptBtn.addEventListener("click", interruptTask);

      // WebAudio Sandbox Bypass
      const hudCanvas = document.getElementById("hud-canvas");
      let audioCtx = null;

      hudCanvas.addEventListener("click", async function() {
        // Initialize AudioContext safely behind a user gesture
        if (!audioCtx) {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (AudioContext) {
            audioCtx = new AudioContext();
          }
        }

        if (audioCtx && audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }

        try {
          // Request mic access
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          logLine("log-system", "SYS", "WebAudio initialized. Microphone access granted.");
          // We can optionally stop the stream immediately if we are just unlocking permissions
          // stream.getTracks().forEach(track => track.stop());

          // Optionally trigger startVoiceInput right away since the user clicked the center orb
          if (!state.listening) {
             startVoiceInput();
          }
        } catch(err) {
           logLine("log-error", "ERR", "Microphone access denied or error: " + err.message);
        }
      });

      // ── Wake word: "hello octo" ───────────────────────────
      function startWakeWord() {
        if (!state.wakeEnabled) return;           // stopped by ◼ Stop button
        if (state.listening || state.wakeRec) return;
        const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!Recognition) return;
        const wakeRec = new Recognition();
        state.wakeRec          = wakeRec;
        wakeRec.continuous     = true;
        wakeRec.interimResults = true;
        wakeRec.lang           = "en-US";
        wakeRec.onresult = function(event) {
          const said = Array.from(event.results)
            .map(function(r) { return r[0].transcript.toLowerCase(); })
            .join(" ");
          if (said.includes("hello octo")) {
            try { wakeRec.abort(); } catch(_) {}
            state.wakeRec = null;
            logLine("log-voice", "WAKE", "Wake word detected — listening…");
            speak("Yes?");
            setTimeout(startVoiceInput, 700);
          }
        };
        wakeRec.onerror = function() {
          state.wakeRec = null;
          if (state.wakeEnabled && !state.listening) setTimeout(startWakeWord, 3000);
        };
        wakeRec.onend = function() {
          if (state.wakeRec === wakeRec) state.wakeRec = null;
          if (state.wakeEnabled && !state.listening) setTimeout(startWakeWord, 500);
        };
        try { wakeRec.start(); } catch(_) { state.wakeRec = null; }
      }
      startWakeWord();

      el.projectSelect.addEventListener("change", function() {
        state.activeProjectId = el.projectSelect.value || null;
        el.projectLabel.textContent = "Project: " + (state.activeProjectId || "none");
      });

      document.querySelectorAll("[data-prompt]").forEach(function(btn) {
        btn.addEventListener("click", function() {
          el.taskInput.value = btn.getAttribute("data-prompt") || "";
          el.taskInput.focus();
        });
      });

      // Keyboard shortcuts
      document.addEventListener("keydown", function(e) {
        if (e.key === "F4")  { e.preventDefault(); stopVoice(); }
        if (e.key === "F11") { e.preventDefault(); document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); }
      });

      // ── Search ────────────────────────────────────────────
      const searchBtn   = document.getElementById("search-btn");
      const searchInput = document.getElementById("search-input");
      if (searchBtn) searchBtn.addEventListener("click", function() {
        runSearch(searchInput.value);
      });
      if (searchInput) searchInput.addEventListener("keydown", function(e) {
        if (e.key === "Enter") runSearch(searchInput.value);
      });

      // ── Document upload ───────────────────────────────────
      const dropZone  = document.getElementById("drop-zone");
      const fileInput = document.getElementById("file-input");

      if (dropZone && fileInput) {
        dropZone.addEventListener("click", function() { fileInput.click(); });
        fileInput.addEventListener("change", function() {
          if (fileInput.files[0]) uploadAndAnalyse(fileInput.files[0]);
        });
        dropZone.addEventListener("dragover", function(e) {
          e.preventDefault(); dropZone.classList.add("drag-over");
        });
        dropZone.addEventListener("dragleave", function() {
          dropZone.classList.remove("drag-over");
        });
        dropZone.addEventListener("drop", function(e) {
          e.preventDefault();
          dropZone.classList.remove("drag-over");
          const file = e.dataTransfer.files[0];
          if (file) uploadAndAnalyse(file);
        });
      }

      document.querySelectorAll(".mode-chip").forEach(function(chip) {
        chip.addEventListener("click", function() { setDocMode(chip.dataset.mode); });
      });

      // ── Gateway status auto-refresh every 30s ────────────
      loadGateways();
      setInterval(loadGateways, 30000);

      // ── Router config (load once) ─────────────────────────
      document.querySelectorAll(".rp-tab").forEach(function(tab) {
        tab.addEventListener("click", function() {
          if (tab.dataset.tab === "router" && document.getElementById("router-list").children.length <= 1) {
            loadRouter();
          }
        });
      });
    }

    // ═══════════════════════════════════════════════════════
    //  BOOTSTRAP
    // ═══════════════════════════════════════════════════════
    async function bootstrap() {
      wireUi();
      renderConversation();
      renderAnswer();
      await resolveProjects();
      connectWs();
      el.taskInput.focus();

      // Welcome log messages
      logLine("log-system", "SYS", "Voice mode — Windows TTS + Google STT");
      logLine("log-system", "SYS", "OCTO voice ready — press MICROPHONE ACTIVE to speak");
      logLine("log-octo", "OCTO", "OCTO voice active. Press the microphone button and speak, sir.");
      logLine("log-system", "SYS", "Microphone muted.");

      logLine("log-system", "BOOT", "OCTO Command Interface v2 initialised");

      // Welcome voice — fires after voices load (Chrome loads async)
      function doWelcome() {
        speak("OCTO online. All systems active. How can I help you?");
      }
      if (window.speechSynthesis) {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length) {
          setTimeout(doWelcome, 800);
        } else {
          window.speechSynthesis.onvoiceschanged = function() {
            setTimeout(doWelcome, 300);
          };
        }
      }
    }

    bootstrap();
