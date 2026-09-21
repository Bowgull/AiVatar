// The real connections: discord.js to Discord, and a WebSocket to Aang's own Core. Deliberately thin - the
// decisions live in discord-logic.ts and discord.ts, where they are tested without a network.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { WebSocket } from 'ws';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, Events, GatewayIntentBits, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { DiscordAdapter } from './discord.ts';
import type { Button, ButtonPress, CoreLink, Gateway, Incoming, OutMsg } from './discord.ts';
import { LAYOUT, NEEDED, FORBIDDEN, slug } from './discord-logic.ts';

const STYLE = { primary: ButtonStyle.Primary, secondary: ButtonStyle.Secondary, success: ButtonStyle.Success, danger: ButtonStyle.Danger } as const;

export class DiscordGateway implements Gateway {
  private readonly client: Client;
  private guild: any = null;
  private readonly token: string;
  constructor(token: string) {
    this.token = token;
    this.client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
  }

  async login(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.client.once(Events.ClientReady, () => resolve());
      this.client.login(this.token).catch(reject);
    });
    const guilds = [...this.client.guilds.cache.values()];
    if (guilds.length !== 1) throw new Error(`Aang should be in exactly one Discord server; he is in ${guilds.length}.`);
    this.guild = guilds[0];
  }

  close(): void { void this.client.destroy(); }

  private map(m: any): Incoming {
    return { id: m.id, channelId: m.channelId, channelName: m.channel?.name ?? '', authorId: m.author?.id ?? '', isBot: !!m.author?.bot || !!m.webhookId, content: m.content ?? '', createdAt: m.createdTimestamp ?? 0 };
  }

  onMessage(cb: (m: Incoming) => void): void { this.client.on(Events.MessageCreate, m => cb(this.map(m))); }

  onButton(cb: (b: ButtonPress) => void): void {
    this.client.on(Events.InteractionCreate, (i: any) => {
      if (!i.isButton()) return;
      cb({
        customId: i.customId, userId: i.user.id, channelId: i.channelId,
        ack: async (note: string) => { await i.update({ content: `${i.message.content}\n${note}`, components: [] }); },
        keep: async () => { await i.deferUpdate(); },
      });
    });
  }

  async ensureLayout(): Promise<Record<string, string>> {
    const channels = await this.guild.channels.fetch();
    const out: Record<string, string> = {};
    for (const cat of LAYOUT) {
      let parent: any = [...channels.values()].find((c: any) => c && c.type === ChannelType.GuildCategory && c.name.toLowerCase() === cat.name.toLowerCase());
      if (!parent) parent = await this.guild.channels.create({ name: cat.name, type: ChannelType.GuildCategory });
      for (const def of cat.channels) {
        let ch: any = [...channels.values()].find((c: any) => c && c.name === slug(def.name) && c.parentId === parent.id);
        if (!ch) ch = await this.guild.channels.create({ name: slug(def.name), type: def.kind === 'forum' ? ChannelType.GuildForum : ChannelType.GuildText, parent: parent.id, topic: def.topic });
        out[def.name] = ch.id;
      }
    }
    return out;
  }

  private rows(msg: OutMsg) {
    return msg.buttons?.length ? [new ActionRowBuilder<ButtonBuilder>().addComponents(msg.buttons.map((b: Button) => new ButtonBuilder().setCustomId(b.id).setLabel(b.label).setStyle(STYLE[b.style])))] : [];
  }

  async send(channelId: string, msg: OutMsg): Promise<string> {
    const channel: any = await this.client.channels.fetch(channelId);
    const files = msg.files?.map(f => ({ attachment: f.data, name: f.name }));
    const sent = await channel.send({ content: msg.content, components: this.rows(msg), ...(files ? { files } : {}), ...(msg.silent ? { flags: MessageFlags.SuppressNotifications } : {}) });
    return sent.id;
  }

  async edit(channelId: string, messageId: string, msg: OutMsg): Promise<void> {
    const channel: any = await this.client.channels.fetch(channelId);
    const m = await channel.messages.fetch(messageId);
    await m.edit({ content: msg.content, components: this.rows(msg) });
  }

  async pin(channelId: string, messageId: string): Promise<void> {
    const channel: any = await this.client.channels.fetch(channelId);
    const m = await channel.messages.fetch(messageId);
    await m.pin();
  }

  async typing(channelId: string): Promise<void> { const c: any = await this.client.channels.fetch(channelId); await c.sendTyping(); }

  async fetchSince(channelId: string, afterId: string | null, limit: number): Promise<Incoming[]> {
    const c: any = await this.client.channels.fetch(channelId);
    const got = await c.messages.fetch(afterId ? { after: afterId, limit } : { limit: 1 });
    return [...got.values()].map((m: any) => this.map(m)).sort((a, b) => a.createdAt - b.createdAt);
  }

  async permissions(): Promise<string[]> {
    const me = await this.guild.members.fetchMe();
    return [...NEEDED, ...FORBIDDEN, 'Administrator'].filter((n, i, a) => a.indexOf(n) === i)
      .filter(n => (PermissionFlagsBits as any)[n] !== undefined && me.permissions.has((PermissionFlagsBits as any)[n]));
  }
}

/** Aang's own Core, as a client of its local connection - the same one the desktop Body uses. */
export class WsCoreLink implements CoreLink {
  private ws: WebSocket | null = null;
  private readonly cbs: ((m: any) => void)[] = [];
  private closed = false;
  private readonly port: number;
  constructor(port: number) { this.port = port; this.connect(); }
  private connect() {
    const ws = new WebSocket(`ws://127.0.0.1:${this.port}/body`);
    this.ws = ws;
    // Say who this is, so the Core sends Discord only what belongs here (see Core.whereHeIs).
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', v: 1, client: 'discord' })));
    ws.on('message', d => { let m: any; try { m = JSON.parse(String(d)); } catch { return; } for (const cb of this.cbs) cb(m); });
    ws.on('close', () => { if (!this.closed) setTimeout(() => this.connect(), 2000).unref?.(); });
    ws.on('error', () => { /* close follows */ });
  }
  private send(o: object) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(o)); }
  submit(id: string, text: string) { this.send({ t: 'submit', id, text, mode: 'auto' }); }
  permission(id: string, allow: boolean) { this.send({ t: 'permission.reply', id, allow }); }
  stop() { this.send({ t: 'stop' }); }
  status() { this.send({ t: 'status' }); }
  onEvent(cb: (m: any) => void) { this.cbs.push(cb); }
  close() { this.closed = true; this.ws?.close(); }
}

/** Start Discord if Joshua has set it up (a token file exists). Never throws: Aang runs without it. */
export async function startDiscord(stateDir: string, port: number, log: (s: string) => void = console.log): Promise<DiscordAdapter | null> {
  const tokenFile = path.join(stateDir, 'discord.token');
  if (process.env.AANG_DISCORD === '0' || !existsSync(tokenFile)) return null;
  try {
    const token = readFileSync(tokenFile, 'utf8').trim();
    if (!token) return null;
    const gw = new DiscordGateway(token);
    await gw.login();
    const adapter = new DiscordAdapter(gw, new WsCoreLink(port), stateDir, { log });
    await adapter.start();
    log('discord: connected');
    return adapter;
  } catch (e) { log('discord: could not start: ' + (e as Error).message); return null; }
}
