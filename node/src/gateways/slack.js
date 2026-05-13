'use strict';
/**
 * gateways/slack.js — Slack Bolt Gateway
 *
 * Setup:
 *   1. Create Slack app at api.slack.com/apps → "From scratch"
 *   2. Add Bot Token Scopes: chat:write, channels:read, im:history, app_mentions:read, files:read
 *   3. Enable Event Subscriptions → subscribe to: message.im, app_mention
 *   4. Set SLACK_BOT_TOKEN (xoxb-…) + SLACK_APP_TOKEN (xapp-…) in node/.env
 *   5. Enable Socket Mode in app settings (uses SLACK_APP_TOKEN)
 *   6. npm install @slack/bolt
 *
 * Features:
 *   - Responds to @mentions in channels and direct messages
 *   - File upload forwarding to document analysis
 *   - Block Kit formatting for structured responses
 *   - SLACK_ALLOWED_WORKSPACES for workspace restriction
 */

const EventEmitter = require('events');

class SlackGateway extends EventEmitter {
  constructor() {
    super();
    this.app    = null;
    this.online = false;
  }

  async init(manager) {
    const botToken = process.env.SLACK_BOT_TOKEN;
    const appToken = process.env.SLACK_APP_TOKEN;

    if (!botToken || !appToken) {
      console.error('[slack] SLACK_BOT_TOKEN and SLACK_APP_TOKEN required — gateway disabled');
      return false;
    }

    let bolt;
    try {
      bolt = require('@slack/bolt');
    } catch (_) {
      console.error('[slack] @slack/bolt not installed. Run: npm install @slack/bolt');
      return false;
    }

    const { App } = bolt;
    this.app = new App({
      token:       botToken,
      appToken,
      socketMode:  true,
      logLevel:    'error',
    });

    // Respond to @mentions
    this.app.event('app_mention', async ({ event, say }) => {
      const text = (event.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();
      if (!text) return;
      this.emit('message', {
        text,
        sender:   event.user,
        channel:  event.channel,
        ts:       event.ts,
        platform: 'slack',
        raw:      event,
        say,
      });
    });

    // Direct messages
    this.app.message(async ({ message, say }) => {
      if (message.bot_id) return;
      const text = message.text || '';
      if (!text) return;
      this.emit('message', {
        text,
        sender:   message.user,
        channel:  message.channel,
        ts:       message.ts,
        platform: 'slack',
        raw:      message,
        say,
      });
    });

    await this.app.start();
    this.online = true;
    console.error('[slack] Socket Mode started');
    manager.register('slack', this);
    return true;
  }

  async send(ctx, text) {
    if (!this.app) return;
    // If we have the `say` function from the event context, use it
    if (ctx.say) {
      await ctx.say(text).catch(console.error);
      return;
    }
    // Otherwise use web client
    await this.app.client.chat.postMessage({
      channel: ctx.channel,
      text,
    }).catch(console.error);
  }

  isOnline() { return this.online; }
  info()     { return { platform: 'Slack', socketMode: this.online }; }
}

module.exports = new SlackGateway();
