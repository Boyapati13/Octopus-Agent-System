'use strict';
/**
 * gateways/home_assistant.js — Home Assistant Integration
 *
 * Connects to Home Assistant via WebSocket API (no extra packages — uses `ws`).
 * Triggers Octopus tasks from HA automations, and updates HA entities/sensors
 * with Octopus results.
 *
 * Setup:
 *   1. HA: Settings → Profile → Long-lived access tokens → Create token
 *   2. Set in node/.env:
 *        HA_URL=http://homeassistant.local:8123
 *        HA_TOKEN=your_long_lived_token
 *        HA_TRIGGER_EVENT=octopus_task     (HA event type that triggers tasks)
 *        HA_RESULT_ENTITY=input_text.octopus_result  (entity to write result to)
 *
 * Features:
 *   - Listens for HA events of type HA_TRIGGER_EVENT
 *   - event.data.task → runs as Octopus task
 *   - Result is written back to HA_RESULT_ENTITY (input_text)
 *   - Exposes /api/ha/trigger endpoint for HA webhooks too
 *   - Fires HA events on chain_start, chain_done with result
 *   - Auto-reconnect on disconnect
 *
 * Home Assistant automation example (YAML):
 *   automation:
 *     trigger:
 *       platform: state
 *       entity_id: input_text.octopus_command
 *     action:
 *       event: octopus_task
 *       event_data:
 *         task: "{{ trigger.to_state.state }}"
 */

const EventEmitter = require('events');
const WebSocket    = require('ws');

class HomeAssistantGateway extends EventEmitter {
  constructor() {
    super();
    this.ws           = null;
    this.online       = false;
    this.authenticated = false;
    this.url          = process.env.HA_URL || '';
    this.token        = process.env.HA_TOKEN || '';
    this.triggerEvent = process.env.HA_TRIGGER_EVENT || 'octopus_task';
    this.resultEntity = process.env.HA_RESULT_ENTITY || '';
    this._msgId       = 1;
    this._pending     = new Map();
    this._subId       = null;
  }

  async init(manager) {
    if (!this.url || !this.token) {
      console.error('[ha] HA_URL and HA_TOKEN required — gateway disabled');
      return false;
    }
    this._connect();
    manager.register('home_assistant', this);
    return true;
  }

  _connect() {
    const wsUrl = this.url
      .replace(/^https?:\/\//, (m) => m === 'https://' ? 'wss://' : 'ws://')
      .replace(/\/$/, '') + '/api/websocket';

    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      console.error('[ha] WebSocket connected, authenticating…');
    });

    this.ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch (_) { return; }
      this._onMessage(msg);
    });

    this.ws.on('error', (err) => {
      console.error(`[ha] WS error: ${err.message}`);
      this.online = false;
    });

    this.ws.on('close', () => {
      this.online       = false;
      this.authenticated = false;
      console.error('[ha] Disconnected. Retrying in 15s…');
      setTimeout(() => this._connect(), 15000);
    });
  }

  _onMessage(msg) {
    switch (msg.type) {
      case 'auth_required':
        this.ws.send(JSON.stringify({ type: 'auth', access_token: this.token }));
        break;

      case 'auth_ok':
        this.authenticated = true;
        this.online        = true;
        console.error('[ha] Authenticated. Subscribing to events…');
        this._subscribeEvents();
        break;

      case 'auth_invalid':
        console.error('[ha] Authentication failed — check HA_TOKEN');
        this.ws.close();
        break;

      case 'event':
        if (msg.id === this._subId) this._onHaEvent(msg.event);
        break;

      case 'result':
        if (this._pending.has(msg.id)) {
          const { resolve, reject } = this._pending.get(msg.id);
          this._pending.delete(msg.id);
          if (msg.success) resolve(msg.result);
          else reject(new Error(msg.error?.message || 'HA command failed'));
        }
        break;
    }
  }

  _subscribeEvents() {
    const id = this._msgId++;
    this._subId = id;
    this.ws.send(JSON.stringify({
      id,
      type:       'subscribe_events',
      event_type: this.triggerEvent,
    }));
  }

  _call(type, payload = {}) {
    return new Promise((resolve, reject) => {
      const id = this._msgId++;
      this._pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, type, ...payload }));
      setTimeout(() => {
        if (this._pending.has(id)) {
          this._pending.delete(id);
          reject(new Error('HA call timeout'));
        }
      }, 15000);
    });
  }

  _onHaEvent(event) {
    const task = event?.data?.task || event?.data?.message || '';
    if (!task) return;

    console.error(`[ha] Event received: ${task.slice(0, 80)}`);

    this.emit('message', {
      text:     task,
      sender:   'home_assistant',
      channel:  'ha',
      platform: 'home_assistant',
      raw:      event,
    });
  }

  /** Write a result string to a Home Assistant input_text entity */
  async writeResult(entityId, value) {
    if (!this.authenticated || !entityId) return;
    try {
      await this._call('call_service', {
        domain:       'input_text',
        service:      'set_value',
        service_data: { entity_id: entityId, value: String(value).slice(0, 255) },
      });
    } catch (e) {
      console.error(`[ha] writeResult error: ${e.message}`);
    }
  }

  /** Fire a custom HA event */
  async fireEvent(eventType, eventData = {}) {
    if (!this.authenticated) return;
    try {
      await this._call('fire_event', { event_type: eventType, event_data: eventData });
    } catch (e) {
      console.error(`[ha] fireEvent error: ${e.message}`);
    }
  }

  async send(ctx, text) {
    if (this.resultEntity) {
      await this.writeResult(this.resultEntity, text);
    }
    await this.fireEvent('octopus_reply', { text: text.slice(0, 255), channel: ctx.channel });
  }

  isOnline() { return this.online; }
  info() {
    return {
      platform:      'Home Assistant',
      url:           this.url,
      authenticated: this.authenticated,
      triggerEvent:  this.triggerEvent,
    };
  }
}

module.exports = new HomeAssistantGateway();
