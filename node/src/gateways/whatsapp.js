'use strict';
/**
 * gateways/whatsapp.js — WhatsApp Gateway (via Baileys)
 *
 * Uses @whiskeysockets/baileys — the most complete free WA library.
 * No paid API needed. Uses WhatsApp Web protocol.
 *
 * Setup:
 *   1. npm install @whiskeysockets/baileys qrcode-terminal
 *   2. Set WHATSAPP_SESSION_PATH (default: ~/.octopus/wa_session)
 *   3. Set WHATSAPP_ALLOWED_NUMBERS (comma-sep phone numbers with country code, e.g. 447700123456)
 *      Leave empty to allow all numbers.
 *   4. First run: scan the QR code shown in terminal
 *   5. Session is saved — subsequent starts reconnect automatically
 *
 * Features:
 *   - QR code scan on first run
 *   - Auto-reconnect on disconnect
 *   - Image/document forwarding to analysis pipeline
 *   - WHATSAPP_TRIGGER_WORD (default: "octo") — message must start with this word
 */

const EventEmitter = require('events');
const path         = require('path');
const os           = require('os');

class WhatsAppGateway extends EventEmitter {
  constructor() {
    super();
    this.sock           = null;
    this.online         = false;
    this.qrData         = null;   // latest QR string — exposed via /api/gateways/whatsapp/qr
    this.sessionPath    = process.env.WHATSAPP_SESSION_PATH
      || path.join(os.homedir(), '.octopus', 'wa_session');
    this.triggerWord    = (process.env.WHATSAPP_TRIGGER_WORD || 'octo').toLowerCase();
    this.allowedNumbers = new Set(
      (process.env.WHATSAPP_ALLOWED_NUMBERS || '').split(',').filter(Boolean)
    );
  }

  async init(manager) {
    let baileys;
    try {
      baileys = require('@whiskeysockets/baileys');
    } catch (_) {
      console.error('[whatsapp] @whiskeysockets/baileys not installed.\nRun: npm install @whiskeysockets/baileys qrcode-terminal');
      return false;
    }

    const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = baileys;

    const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);

    const connect = async () => {
      const noop = () => {};
      const silentLog = { level: 'silent', info: noop, warn: noop, error: noop, debug: noop, trace: noop, fatal: noop };
      silentLog.child = () => silentLog;
      this.sock = makeWASocket({
        auth:             state,
        logger:           silentLog,
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
        if (qr) {
          this.qrData = qr;
          this.emit('qr', qr);
          console.error('[whatsapp] QR ready — scan in dashboard Gateways tab or terminal above');
        }
        if (connection === 'open') {
          this.online = true;
          console.error('[whatsapp] Connected');
        }
        if (connection === 'close') {
          this.online = false;
          const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
          console.error(`[whatsapp] Disconnected. Reconnect: ${shouldReconnect}`);
          if (shouldReconnect) setTimeout(connect, 5000);
        }
      });

      this.sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const msg of messages) {
          if (!msg.message || msg.key.fromMe) continue;
          await this._onMessage(msg);
        }
      });
    };

    await connect();
    manager.register('whatsapp', this);
    return true;
  }

  _getNumber(jid) {
    return jid.replace('@s.whatsapp.net', '').replace('@g.us', '');
  }

  _isAllowed(jid) {
    if (!this.allowedNumbers.size) return true;
    return this.allowedNumbers.has(this._getNumber(jid));
  }

  async _onMessage(msg) {
    const from    = msg.key.remoteJid || '';
    const content = msg.message?.conversation
      || msg.message?.extendedTextMessage?.text
      || msg.message?.imageMessage?.caption
      || msg.message?.documentMessage?.caption
      || '';

    if (!this._isAllowed(from)) return;

    const lower = content.toLowerCase();
    let text = content;

    // Require trigger word unless it's a private chat and WHATSAPP_TRIGGER_WORD is empty
    if (this.triggerWord && from.includes('@g.us')) {
      if (!lower.startsWith(this.triggerWord)) return;
      text = content.slice(this.triggerWord.length).trim();
    }

    if (!text) return;

    this.emit('message', {
      text,
      sender:   this._getNumber(from),
      channel:  from,
      platform: 'whatsapp',
      raw:      msg,
    });
  }

  async send(ctx, text) {
    if (!this.sock || !ctx.channel) return;
    // WA has no practical length limit but split at 4000 for readability
    const chunks = [];
    for (let i = 0; i < text.length; i += 3800) chunks.push(text.slice(i, i + 3800));
    for (const chunk of chunks) {
      await this.sock.sendMessage(ctx.channel, { text: chunk }).catch(console.error);
    }
  }

  isOnline() { return this.online; }
  info()     { return { platform: 'WhatsApp', connected: this.online }; }
}

module.exports = new WhatsAppGateway();
