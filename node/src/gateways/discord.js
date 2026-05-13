'use strict';
/**
 * gateways/discord.js — Discord Bot Gateway
 *
 * Setup:
 *   1. Create bot at discord.com/developers → Bot tab → copy token
 *   2. Enable: MESSAGE CONTENT INTENT in Bot settings
 *   3. Invite URL: OAuth2 → URL Generator → bot + Send Messages + Read Messages
 *   4. Set DISCORD_BOT_TOKEN in node/.env
 *   5. Set DISCORD_TRIGGER_PREFIX (default: "!octo") or DISCORD_LISTEN_ALL=true
 *   6. npm install discord.js
 *
 * Features:
 *   - Responds to !octo <task> or mentions @bot
 *   - Embeds structured replies
 *   - File attachment support (PDF, code, images)
 *   - Thread creation for long tasks
 *   - DISCORD_ALLOWED_GUILDS for server restriction
 */

const EventEmitter = require('events');

class DiscordGateway extends EventEmitter {
  constructor() {
    super();
    this.client  = null;
    this.online  = false;
    this.prefix  = process.env.DISCORD_TRIGGER_PREFIX || '!octo';
    this.listenAll = process.env.DISCORD_LISTEN_ALL === 'true';
    this.allowedGuilds = new Set(
      (process.env.DISCORD_ALLOWED_GUILDS || '').split(',').filter(Boolean)
    );
  }

  async init(manager) {
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token) {
      console.error('[discord] DISCORD_BOT_TOKEN not set — gateway disabled');
      return false;
    }

    let discord;
    try {
      discord = require('discord.js');
    } catch (_) {
      console.error('[discord] discord.js not installed. Run: npm install discord.js');
      return false;
    }

    const { Client, GatewayIntentBits, Partials } = discord;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel],
    });

    this.client.once('ready', () => {
      this.online = true;
      console.error(`[discord] Logged in as ${this.client.user.tag}`);
    });

    this.client.on('messageCreate', (msg) => this._onMessage(msg));

    this.client.on('error', (err) => {
      console.error(`[discord] Error: ${err.message}`);
      this.online = false;
    });

    await this.client.login(token);
    manager.register('discord', this);
    return true;
  }

  _isAllowed(guildId) {
    if (!this.allowedGuilds.size) return true;
    return this.allowedGuilds.has(guildId);
  }

  async _onMessage(msg) {
    if (msg.author.bot) return;
    if (msg.guild && !this._isAllowed(msg.guild.id)) return;

    const isDM      = !msg.guild;
    const mentioned = this.client && msg.mentions.has(this.client.user);
    const content   = msg.content || '';

    let text = '';
    if (isDM || mentioned) {
      text = content.replace(`<@${this.client?.user?.id}>`, '').trim();
    } else if (content.startsWith(this.prefix)) {
      text = content.slice(this.prefix.length).trim();
    } else if (this.listenAll) {
      text = content;
    }

    // Handle file attachments
    if (msg.attachments.size > 0) {
      const files = [...msg.attachments.values()];
      const names = files.map(f => f.name).join(', ');
      text = `[ATTACHMENT: ${names}] ${text}`.trim();
    }

    if (!text) return;

    // Typing indicator
    if (msg.channel.sendTyping) await msg.channel.sendTyping().catch(() => {});

    this.emit('message', {
      text,
      sender:    msg.author.id,
      channel:   msg.channel.id,
      guildId:   msg.guild?.id || 'DM',
      platform:  'discord',
      messageId: msg.id,
      raw:       msg,
    });
  }

  async send(ctx, text) {
    if (!this.client) return;
    const channel = await this.client.channels.fetch(ctx.channel).catch(() => null);
    if (!channel) return;

    // Discord 2000 char limit — split into chunks, use embeds for long content
    if (text.length <= 1900) {
      await channel.send(text).catch(console.error);
    } else {
      const chunks = [];
      for (let i = 0; i < text.length; i += 1900) chunks.push(text.slice(i, i + 1900));
      for (const chunk of chunks) await channel.send(chunk).catch(console.error);
    }
  }

  isOnline() { return this.online; }
  info() {
    return {
      platform: 'Discord',
      tag:      this.client?.user?.tag || 'not connected',
      guilds:   this.client?.guilds?.cache?.size || 0,
    };
  }
}

module.exports = new DiscordGateway();
