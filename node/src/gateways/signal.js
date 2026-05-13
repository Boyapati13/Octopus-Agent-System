'use strict';
/**
 * gateways/signal.js — Signal Messenger Gateway (via signal-cli JSON-RPC)
 *
 * Uses signal-cli in daemon mode with JSON-RPC over stdio or TCP.
 * Signal-cli is a Java application — no npm package needed.
 *
 * Setup:
 *   1. Install Java 17+ and signal-cli from github.com/AsamK/signal-cli
 *   2. Register: signal-cli -u +<PHONE> register && signal-cli -u +<PHONE> verify <CODE>
 *   3. Start daemon: signal-cli -u +<PHONE> daemon --tcp 7583
 *   4. Set in node/.env:
 *        SIGNAL_PHONE=+447700123456
 *        SIGNAL_CLI_HOST=127.0.0.1
 *        SIGNAL_CLI_PORT=7583
 *        SIGNAL_ALLOWED_SENDERS=+447700000001,+447700000002  (leave empty for all)
 *
 * Features:
 *   - Connects to signal-cli TCP JSON-RPC daemon
 *   - Receives and sends text messages
 *   - Auto-reconnect on disconnect
 */

const EventEmitter = require('events');
const net          = require('net');

class SignalGateway extends EventEmitter {
  constructor() {
    super();
    this.socket         = null;
    this.online         = false;
    this.phone          = process.env.SIGNAL_PHONE || '';
    this.host           = process.env.SIGNAL_CLI_HOST || '127.0.0.1';
    this.port           = parseInt(process.env.SIGNAL_CLI_PORT || '7583', 10);
    this.allowedSenders = new Set(
      (process.env.SIGNAL_ALLOWED_SENDERS || '').split(',').filter(Boolean)
    );
    this._buf           = '';
    this._reqId         = 1;
    this._pending       = new Map();
  }

  async init(manager) {
    if (!this.phone) {
      console.error('[signal] SIGNAL_PHONE not set — gateway disabled');
      return false;
    }
    await this._connect();
    manager.register('signal', this);
    return true;
  }

  _connect() {
    return new Promise((resolve) => {
      this.socket = net.createConnection({ host: this.host, port: this.port }, () => {
        this.online = true;
        console.error(`[signal] Connected to signal-cli at ${this.host}:${this.port}`);
        // Subscribe to receive messages
        this._call('subscribeReceive', {}).catch(() => {});
        resolve();
      });

      this.socket.on('data', (data) => {
        this._buf += data.toString('utf8');
        const lines = this._buf.split('\n');
        this._buf = lines.pop(); // keep incomplete line
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);
            this._onRpc(json);
          } catch (_) {}
        }
      });

      this.socket.on('error', (err) => {
        console.error(`[signal] Socket error: ${err.message}`);
        this.online = false;
      });

      this.socket.on('close', () => {
        this.online = false;
        console.error('[signal] Disconnected. Retrying in 10s…');
        setTimeout(() => this._connect(), 10000);
      });

      // If connection fails within 5s, resolve anyway (non-fatal)
      setTimeout(resolve, 5000);
    });
  }

  _call(method, params) {
    return new Promise((resolve, reject) => {
      const id = this._reqId++;
      this._pending.set(id, { resolve, reject });
      const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
      this.socket?.write(payload);
      setTimeout(() => {
        if (this._pending.has(id)) {
          this._pending.delete(id);
          reject(new Error('Timeout'));
        }
      }, 30000);
    });
  }

  _onRpc(json) {
    // Response to a pending call
    if (json.id && this._pending.has(json.id)) {
      const { resolve, reject } = this._pending.get(json.id);
      this._pending.delete(json.id);
      if (json.error) reject(new Error(json.error.message));
      else            resolve(json.result);
      return;
    }

    // Incoming message notification
    if (json.method === 'receive') {
      const params = json.params || {};
      const env    = params.envelope || {};
      const dm     = env.dataMessage;
      if (!dm || !dm.message) return;

      const sender = env.source || env.sourceNumber || '';
      if (this.allowedSenders.size && !this.allowedSenders.has(sender)) return;

      this.emit('message', {
        text:     dm.message,
        sender,
        channel:  sender,
        platform: 'signal',
        raw:      json,
      });
    }
  }

  async send(ctx, text) {
    if (!this.socket || !this.online) return;
    const chunks = [];
    for (let i = 0; i < text.length; i += 3800) chunks.push(text.slice(i, i + 3800));
    for (const chunk of chunks) {
      await this._call('send', { recipient: [ctx.channel], message: chunk }).catch(console.error);
    }
  }

  isOnline() { return this.online; }
  info()     { return { platform: 'Signal', phone: this.phone, connected: this.online }; }
}

module.exports = new SignalGateway();
