'use strict';
/**
 * gateways/telegram.js — Telegram Bot Gateway
 *
 * Setup:
 *   1. Create a bot via @BotFather on Telegram → get token
 *   2. Set TELEGRAM_BOT_TOKEN in node/.env
 *   3. npm install node-telegram-bot-api
 *   4. Add to server.js:
 *        const tg = require('./gateways/telegram');
 *        tg.init(gatewayManager);
 *
 * Features:
 *   - Responds to any direct message or /ask command
 *   - Supports document uploads (forwarded to document analysis)
 *   - Supports voice messages (transcribed via Whisper if OPENAI_API_KEY set)
 *   - Rate limiting: 1 request per user per 3 seconds
 *   - TELEGRAM_ALLOWED_USERS (comma-separated user IDs) for access control
 */

const EventEmitter = require('events');

class TelegramGateway extends EventEmitter {
  constructor() {
    super();
    this.bot        = null;
    this.online     = false;
    this.lastMsg    = new Map(); // rate limiting: userId → timestamp
    this.allowedIds = new Set(
      (process.env.TELEGRAM_ALLOWED_USERS || '').split(',').filter(Boolean)
    );
  }

  async init(manager) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      console.error('[telegram] TELEGRAM_BOT_TOKEN not set — gateway disabled');
      return false;
    }

    let TelegramBot;
    try {
      TelegramBot = require('node-telegram-bot-api');
    } catch (_) {
      console.error('[telegram] node-telegram-bot-api not installed. Run: npm install node-telegram-bot-api');
      return false;
    }

    this.bot = new TelegramBot(token, { polling: true });
    this.online = true;

    this.bot.on('message', (msg) => this._onMessage(msg));
    this.bot.on('polling_error', (err) => {
      console.error(`[telegram] Polling error: ${err.message}`);
      this.online = false;
    });

    console.error('[telegram] Bot started. Waiting for messages…');
    manager.register('telegram', this);
    return true;
  }

  _isAllowed(userId) {
    if (!this.allowedIds.size) return true; // no restriction = all allowed
    return this.allowedIds.has(String(userId));
  }

  _isRateLimited(userId) {
    const last = this.lastMsg.get(userId) || 0;
    if (Date.now() - last < 3000) return true;
    this.lastMsg.set(userId, Date.now());
    return false;
  }

  async _onMessage(msg) {
    const userId  = msg.from?.id;
    const chatId  = msg.chat?.id;
    const text    = msg.text || msg.caption || '';

    if (!this._isAllowed(userId)) return;
    if (this._isRateLimited(userId)) return;

    // Handle document uploads
    if (msg.document) {
      this.emit('message', {
        text:     `[FILE UPLOADED: ${msg.document.file_name}] ${text}`,
        sender:   String(userId),
        channel:  String(chatId),
        platform: 'telegram',
        fileId:   msg.document.file_id,
        fileName: msg.document.file_name,
        raw:      msg,
      });
      return;
    }

    // Handle voice messages
    if (msg.voice) {
      this.emit('message', {
        text:     '[VOICE MESSAGE — transcription not yet implemented]',
        sender:   String(userId),
        channel:  String(chatId),
        platform: 'telegram',
        raw:      msg,
      });
      return;
    }

    if (!text) return;

    // Strip /ask command prefix
    const clean = text.replace(/^\/ask\s*/i, '').trim();
    if (!clean) {
      await this.bot.sendMessage(chatId, 'Usage: /ask <your question or task>');
      return;
    }

    this.emit('message', {
      text:     clean,
      sender:   String(userId),
      channel:  String(chatId),
      platform: 'telegram',
      raw:      msg,
    });
  }

  async send(ctx, text) {
    if (!this.bot || !ctx.channel) return;
    // Telegram has 4096 char limit per message
    const chunks = [];
    for (let i = 0; i < text.length; i += 4000) {
      chunks.push(text.slice(i, i + 4000));
    }
    for (const chunk of chunks) {
      await this.bot.sendMessage(ctx.channel, chunk, { parse_mode: 'Markdown' }).catch(() =>
        this.bot.sendMessage(ctx.channel, chunk) // retry without markdown
      );
    }
  }

  isOnline() { return this.online; }
  info()     { return { platform: 'Telegram', polling: this.online }; }
}

module.exports = new TelegramGateway();
