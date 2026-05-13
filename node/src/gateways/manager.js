'use strict';
/**
 * gateways/manager.js — Octopus Messaging Gateway Manager
 *
 * Bridges external messaging platforms to the Octopus task pipeline.
 * Each gateway registers here and receives/sends messages via a common interface.
 *
 * Supported gateways (enable by setting the relevant env vars):
 *   Telegram     TELEGRAM_BOT_TOKEN         npm install node-telegram-bot-api
 *   Discord      DISCORD_BOT_TOKEN          npm install discord.js
 *   Slack        SLACK_BOT_TOKEN            npm install @slack/bolt
 *   WhatsApp     WHATSAPP_SESSION_PATH      npm install @whiskeysockets/baileys
 *   Signal       SIGNAL_CLI_PATH            signal-cli installed + configured
 *   Home Assist  HA_URL + HA_TOKEN          built-in (uses ws module already present)
 *   MCP          automatic (built-in)
 *
 * Message flow:
 *   Platform → Gateway → manager.dispatchIncoming(msg)
 *                      → runTask(text, platformCtx)
 *                      → broadcastEvent('gateway_reply', reply)
 *                      → gateway.send(platformCtx, reply)
 */

const EventEmitter = require('events');

class GatewayManager extends EventEmitter {
  constructor() {
    super();
    this.gateways    = new Map();  // name → GatewayInstance
    this.taskHandler = null;       // set by server.js: async (text, ctx) => string
    this.broadcastFn = null;       // set by server.js: (type, data) => void
  }

  /** Register a task handler — called when a message arrives on any gateway */
  setTaskHandler(fn) { this.taskHandler = fn; }

  /** Register the WS broadcast function for live dashboard events */
  setBroadcast(fn)   { this.broadcastFn = fn; }

  /** Register a gateway adapter */
  register(name, gateway) {
    this.gateways.set(name, gateway);
    gateway.on('message', (ctx) => this._onIncoming(name, ctx));
    console.error(`[gateway] Registered: ${name}`);
  }

  /** Called when any gateway receives a message */
  async _onIncoming(gatewayName, ctx) {
    const { text, sender, channel, raw } = ctx;
    if (!text || !text.trim()) return;

    this._broadcast('gateway_message', {
      gateway: gatewayName,
      sender:  sender || 'unknown',
      channel: channel || '',
      text:    text.slice(0, 400),
    });

    console.error(`[gateway:${gatewayName}] ${sender}: ${text.slice(0, 120)}`);

    if (!this.taskHandler) {
      await this._reply(gatewayName, ctx, 'Octopus task handler not ready yet.');
      return;
    }

    try {
      const reply = await this.taskHandler(text, { gateway: gatewayName, ...ctx });
      if (reply) {
        await this._reply(gatewayName, ctx, reply);
        this._broadcast('gateway_reply', { gateway: gatewayName, reply: reply.slice(0, 400) });
      }
    } catch (err) {
      console.error(`[gateway:${gatewayName}] Task error: ${err.message}`);
      await this._reply(gatewayName, ctx, `Error: ${err.message}`);
    }
  }

  async _reply(gatewayName, ctx, text) {
    const gw = this.gateways.get(gatewayName);
    if (gw && typeof gw.send === 'function') {
      try { await gw.send(ctx, text); } catch (e) {
        console.error(`[gateway:${gatewayName}] Send error: ${e.message}`);
      }
    }
  }

  _broadcast(type, data) {
    if (this.broadcastFn) this.broadcastFn(type, data);
    this.emit(type, data);
  }

  /** Return status of all registered gateways */
  status() {
    const result = {};
    for (const [name, gw] of this.gateways) {
      result[name] = {
        online: typeof gw.isOnline === 'function' ? gw.isOnline() : true,
        info:   typeof gw.info    === 'function' ? gw.info()    : {},
      };
    }
    return result;
  }

  /** Send a message to a specific gateway channel */
  async sendTo(gatewayName, channelId, text) {
    const gw = this.gateways.get(gatewayName);
    if (!gw) throw new Error(`Gateway not found: ${gatewayName}`);
    return gw.send({ channel: channelId }, text);
  }
}

const manager = new GatewayManager();
module.exports = manager;
