'use strict';
/**
 * Octopus Voice — Browser Client
 * ================================
 * Connects to the Python voice_service WebSocket, captures mic audio via
 * AudioWorklet (low-latency PCM), plays Gemini audio responses, and
 * reflects state (LISTENING / THINKING / SPEAKING / MUTED / OFFLINE).
 *
 * Loaded by voice.html; shares no globals with app.js.
 */

const VOICE_WS  = 'ws://localhost:8765';
const SAMPLE_RATE_SEND    = 16000;   // mic PCM sent to Gemini
const SAMPLE_RATE_RECEIVE = 24000;   // PCM audio received from Gemini

// ── AudioWorklet processor source (inlined as Blob) ──────────────────────────
// Converts Float32 mic samples → Int16 PCM, batches every 1024 frames, emits.
const WORKLET_SRC = `
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Int16Array(1024);
    this._pos = 0;
  }
  process(inputs) {
    const ch = inputs[0]?.[0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      this._buf[this._pos++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this._pos === 1024) {
        this.port.postMessage(this._buf.buffer, [this._buf.buffer]);
        this._buf = new Int16Array(1024);
        this._pos = 0;
      }
    }
    return true;
  }
}
registerProcessor('pcm-capture', PcmCapture);
`;

// ── State ─────────────────────────────────────────────────────────────────────
let ws            = null;
let audioCtx      = null;
let workletNode   = null;
let micStream     = null;
let isMuted       = false;
let isActive      = false;  // session started
let playQueue     = [];     // pending PCM chunks to play
let isPlaying     = false;
let currentState  = 'OFFLINE';

// ── DOM refs (populated after DOMContentLoaded) ───────────────────────────────
let orbEl, stateEl, logEl, micBtn, muteBtn, textInput, sendBtn, statusPill;

// ── Helpers ───────────────────────────────────────────────────────────────────
function b64ToInt16(b64) {
  const bin  = atob(b64);
  const buf  = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return new Int16Array(buf);
}

function int16ToFloat32(i16) {
  const f32 = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;
  return f32;
}

function bufToB64(buf) {
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function addLog(role, text) {
  if (!logEl) return;
  const ts   = new Date().toLocaleTimeString();
  const div  = document.createElement('div');
  div.className = `vlog-entry vlog-${role}`;
  div.innerHTML =
    `<span class="vlog-ts">${ts}</span>` +
    `<span class="vlog-role">${role === 'you' ? 'You' : role === 'octopus' ? 'Octopus' : role}</span>` +
    `<span class="vlog-text">${escHtml(text)}</span>`;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── State machine ─────────────────────────────────────────────────────────────
const STATE_LABELS = {
  OFFLINE:   'Offline',
  LISTENING: 'Listening',
  THINKING:  'Thinking',
  SPEAKING:  'Speaking',
  MUTED:     'Muted',
};

function setState(s) {
  currentState = s;
  if (!orbEl) return;
  orbEl.dataset.state = s;
  if (stateEl) stateEl.textContent = STATE_LABELS[s] ?? s;
}

// ── Audio playback queue ──────────────────────────────────────────────────────
async function enqueueAudio(pcmB64) {
  if (!audioCtx) {
    audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE_RECEIVE });
  }
  const i16  = b64ToInt16(pcmB64);
  const f32  = int16ToFloat32(i16);
  const buf  = audioCtx.createBuffer(1, f32.length, SAMPLE_RATE_RECEIVE);
  buf.copyToChannel(f32, 0);
  playQueue.push(buf);
  if (!isPlaying) drainQueue();
}

function drainQueue() {
  if (playQueue.length === 0) { isPlaying = false; return; }
  isPlaying = true;
  const buf  = playQueue.shift();
  const src  = audioCtx.createBufferSource();
  src.buffer = buf;
  src.connect(audioCtx.destination);
  src.onended = drainQueue;
  src.start();
}

// ── WebSocket ─────────────────────────────────────────────────────────────────
function connect() {
  if (ws && ws.readyState < 2) return; // already open/connecting

  setState('THINKING');
  ws = new WebSocket(VOICE_WS);

  ws.onopen = () => {
    addLog('sys', '✅ Voice service connected');
    setState(isMuted ? 'MUTED' : 'LISTENING');
    if (statusPill) { statusPill.classList.add('ok'); statusPill.classList.remove('err'); }
  };

  ws.onclose = () => {
    setState('OFFLINE');
    if (statusPill) { statusPill.classList.remove('ok'); statusPill.classList.add('err'); }
    addLog('sys', '⚠️ Disconnected — retrying in 5 s…');
    stopMic();
    if (isActive) setTimeout(connect, 5000);
  };

  ws.onerror = () => {
    addLog('sys', '❌ Cannot reach voice service. Run: python python/services/voice_service.py');
  };

  ws.onmessage = async (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }

    switch (msg.type) {
      case 'connected':
        addLog('sys', `🤖 Octopus Voice ready (${msg.model})`);
        break;

      case 'state':
        setState(isMuted ? 'MUTED' : msg.state);
        break;

      case 'audio':
        await enqueueAudio(msg.data);
        break;

      case 'transcript_in':
        addLog('you', msg.text);
        break;

      case 'transcript_out':
        addLog('octopus', msg.text);
        break;

      case 'tool_call':
        addLog('tool', `🔧 ${msg.name}(${JSON.stringify(msg.args ?? {})})`);
        break;

      case 'tool_result':
        addLog('tool', `📤 ${msg.name} → ${(msg.result ?? '').slice(0, 120)}`);
        break;

      case 'error':
        addLog('sys', `❌ ${msg.message}`);
        setState('OFFLINE');
        break;

      case 'pong':
        break;
    }
  };
}

function disconnect() {
  isActive = false;
  stopMic();
  if (ws) { ws.close(); ws = null; }
  setState('OFFLINE');
}

// ── Microphone ────────────────────────────────────────────────────────────────
async function startMic() {
  if (micStream) return;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: SAMPLE_RATE_SEND, channelCount: 1, echoCancellation: true, noiseSuppression: true }
    });

    if (!audioCtx) audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE_RECEIVE });

    // Load the worklet blob
    const blob    = new Blob([WORKLET_SRC], { type: 'application/javascript' });
    const blobURL = URL.createObjectURL(blob);
    await audioCtx.audioWorklet.addModule(blobURL);
    URL.revokeObjectURL(blobURL);

    const source  = audioCtx.createMediaStreamSource(micStream);
    workletNode   = new AudioWorkletNode(audioCtx, 'pcm-capture');

    workletNode.port.onmessage = (e) => {
      if (isMuted || !ws || ws.readyState !== 1) return;
      ws.send(JSON.stringify({ type: 'audio', data: bufToB64(e.data) }));
    };

    source.connect(workletNode);
    workletNode.connect(audioCtx.destination);

    addLog('sys', '🎤 Microphone active');
  } catch (err) {
    addLog('sys', `❌ Mic error: ${err.message}`);
  }
}

function stopMic() {
  if (workletNode) { workletNode.disconnect(); workletNode = null; }
  if (micStream)   { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
}

// ── Controls ──────────────────────────────────────────────────────────────────
function toggleSession() {
  if (!isActive) {
    isActive = true;
    connect();
    startMic();
    micBtn.textContent   = '⏹ Stop';
    micBtn.classList.add('active');
  } else {
    disconnect();
    micBtn.textContent = '🎙 Start Voice';
    micBtn.classList.remove('active');
  }
}

function toggleMute() {
  isMuted = !isMuted;
  muteBtn.textContent = isMuted ? '🔇 Unmute' : '🔈 Mute';
  muteBtn.classList.toggle('muted', isMuted);
  setState(isMuted ? 'MUTED' : (ws?.readyState === 1 ? 'LISTENING' : 'OFFLINE'));
}

function sendText() {
  const text = textInput?.value.trim();
  if (!text) return;
  if (!ws || ws.readyState !== 1) {
    addLog('sys', 'Not connected. Click Start Voice first.');
    return;
  }
  ws.send(JSON.stringify({ type: 'text', data: text }));
  addLog('you', text);
  textInput.value = '';
}

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  orbEl      = document.getElementById('voice-orb');
  stateEl    = document.getElementById('voice-state-label');
  logEl      = document.getElementById('voice-log');
  micBtn     = document.getElementById('voice-mic-btn');
  muteBtn    = document.getElementById('voice-mute-btn');
  textInput  = document.getElementById('voice-text-input');
  sendBtn    = document.getElementById('voice-send-btn');
  statusPill = document.getElementById('svc-voice');

  if (micBtn)  micBtn.addEventListener('click', toggleSession);
  if (muteBtn) muteBtn.addEventListener('click', toggleMute);
  if (sendBtn) sendBtn.addEventListener('click', sendText);
  if (textInput) {
    textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
    });
  }

  setState('OFFLINE');
});
