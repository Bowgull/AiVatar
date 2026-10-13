// The Discord connection itself (discord.js), split out 2026-10-13 for M3 so the MacBook can run exactly this and
// nothing else of Aang's: it holds the one connection to Discord that never sleeps, and Shadow's brain drives it over
// Tailscale (frontdesk.ts on the Mac, frontdesk-link.ts here). Only types come from discord.ts, so the Mac needs
// discord.js and discord-logic.ts and nothing more.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, EmbedBuilder, Events, GatewayIntentBits, MessageFlags, PermissionFlagsBits } from 'discord.js';
import type { Button, ButtonPress, Gateway, Incoming, OutMsg, PostInfo } from './discord.ts';
import type { ChannelInfo } from './discord-logic.ts';
import { LAYOUT, NEEDED, FORBIDDEN, noPreview, slug } from './discord-logic.ts';

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
    const attachments = [...(m.attachments?.values?.() ?? [])].map((a: any) => ({ name: String(a.name ?? 'file'), url: String(a.url), size: Number(a.size ?? 0) }));
    return { id: m.id, channelId: m.channelId, channelName: m.channel?.name ?? '', authorId: m.author?.id ?? '', isBot: !!m.author?.bot || !!m.webhookId, content: m.content ?? '', createdAt: m.createdTimestamp ?? 0, ...(attachments.length ? { attachments } : {}), ...(m.reference?.messageId ? { replyTo: String(m.reference.messageId) } : {}), ...(m.channel?.isThread?.() && m.channel?.parentId ? { parentId: String(m.channel.parentId) } : {}) };
  }

  /** Fetch an attachment Discord is hosting for a message he sent. Only Discord's own hosts are ever fetched. */
  async download(url: string): Promise<Buffer> {
    const host = new URL(url).hostname;
    if (!/(^|\.)(discordapp\.com|discordapp\.net|discord\.com)$/.test(host)) throw new Error('not a Discord attachment link');
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`download failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }

  onMessage(cb: (m: Incoming) => void): void { this.client.on(Events.MessageCreate, m => cb(this.map(m))); }

  onButton(cb: (b: ButtonPress) => void): void {
    this.client.on(Events.InteractionCreate, (i: any) => {
      if (!i.isButton()) return;
      cb({
        customId: i.customId, userId: i.user.id, channelId: i.channelId, messageId: i.message?.id,
        // A press must be answered within 3 seconds. The front desk may already have said "wait" (deferred) while
        // Shadow decides, so the answer then edits the message instead of answering the press a second time.
        ack: async (note: string) => {
          const body = { content: `${i.message.content}\n${note}`, components: [] };
          if (i.deferred || i.replied) await i.editReply(body); else await i.update(body);
        },
        keep: async () => { if (!i.deferred && !i.replied) await i.deferUpdate(); },
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

  /** Discord allows 5 buttons to a row and 5 rows to a message. */
  private rows(msg: OutMsg) {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i = 0; i < (msg.buttons?.length ?? 0) && rows.length < 5; i += 5) {
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(msg.buttons!.slice(i, i + 5).map((b: Button) => {
        const btn = new ButtonBuilder().setLabel(b.label.slice(0, 80));
        return b.url ? btn.setStyle(ButtonStyle.Link).setURL(b.url) : btn.setCustomId(b.id).setStyle(STYLE[b.style]).setDisabled(b.disabled === true);
      })));
    }
    return rows;
  }

  private embeds(msg: OutMsg): EmbedBuilder[] {
    if (!msg.embed) return [];
    const e = msg.embed;
    const b = new EmbedBuilder();
    if (e.title) b.setTitle(e.title.slice(0, 256));
    if (e.description) b.setDescription(e.description.slice(0, 4096));
    if (e.color !== undefined) b.setColor(e.color);
    if (e.footer) b.setFooter({ text: e.footer.slice(0, 2048) });
    if (e.image && /^attachment:\/\/[\w.-]+$/.test(e.image)) b.setImage(e.image);
    if (e.fields?.length) b.addFields(e.fields.slice(0, 25).map(f => ({ name: f.name.slice(0, 256), value: f.value.slice(0, 1024) || '​', inline: f.inline === true })));
    return [b];
  }

  async createPost(forumId: string, title: string, content: string, tags: string[] = []): Promise<string> {
    const forum: any = await this.client.channels.fetch(forumId);
    const applied = tagIds(forum, tags);
    const post = await forum.threads.create({ name: title.slice(0, 100), message: { content, flags: MessageFlags.SuppressEmbeds, allowedMentions: { parse: [] } }, ...(applied.length ? { appliedTags: applied } : {}) });
    return post.id;
  }

  // ---- 9.D: plain channel operations; the layout decisions are made on Shadow (planLayout)
  async channelList(): Promise<ChannelInfo[]> {
    const all = await this.guild.channels.fetch();
    return [...all.values()].filter(Boolean).map((c: any) => ({
      id: c.id, name: c.name,
      kind: c.type === ChannelType.GuildCategory ? 'category' : c.type === ChannelType.GuildText ? 'text' : c.type === ChannelType.GuildForum ? 'forum' : 'other',
      parentId: c.parentId ?? null,
      ...(c.type === ChannelType.GuildForum ? { tags: (c.availableTags ?? []).map((t: any) => t.name) } : {}),
    }));
  }
  async createChannel(spec: { name: string; kind: 'category' | 'text' | 'forum'; parentId?: string | null; topic?: string; tags?: string[] }): Promise<string> {
    const type = spec.kind === 'category' ? ChannelType.GuildCategory : spec.kind === 'forum' ? ChannelType.GuildForum : ChannelType.GuildText;
    const ch = await this.guild.channels.create({
      name: spec.name, type, ...(spec.parentId ? { parent: spec.parentId } : {}), ...(spec.topic ? { topic: spec.topic } : {}),
      ...(spec.kind === 'forum' && spec.tags?.length ? { availableTags: spec.tags.slice(0, 20).map(name => ({ name: name.slice(0, 20) })) } : {}),
    });
    return ch.id;
  }
  async editChannel(id: string, spec: { name?: string; parentId?: string | null; topic?: string; addTags?: string[] }): Promise<void> {
    const ch: any = await this.client.channels.fetch(id);
    if (spec.name && spec.name !== ch.name) await ch.setName(spec.name);
    if (spec.parentId !== undefined && spec.parentId !== ch.parentId) await ch.setParent(spec.parentId, { lockPermissions: false });
    if (spec.topic !== undefined && ch.topic !== spec.topic && typeof ch.setTopic === 'function') await ch.setTopic(spec.topic);
    if (spec.addTags?.length && ch.type === ChannelType.GuildForum) {
      const have = (ch.availableTags ?? []) as any[];
      const add = spec.addTags.filter(n => !have.some(t => t.name === n)).map(name => ({ name: name.slice(0, 20) }));
      if (add.length) await ch.setAvailableTags([...have, ...add].slice(0, 20));
    }
  }
  async deleteChannel(id: string): Promise<void> {
    const ch: any = await this.client.channels.fetch(id);
    if (ch.guildId !== this.guild.id) throw new Error('not a channel in his server');
    await ch.delete('Joshua said yes to removing the old channels');
  }
  async postsOf(forumId: string, limit: number): Promise<PostInfo[]> {
    const forum: any = await this.client.channels.fetch(forumId);
    const active = await forum.threads.fetchActive();
    const archived = await forum.threads.fetchArchived({ limit: Math.min(100, limit) });
    const threads = [...active.threads.values(), ...archived.threads.values()].sort((a: any, b: any) => (b.createdTimestamp ?? 0) - (a.createdTimestamp ?? 0)).slice(0, limit);
    const out: PostInfo[] = [];
    for (const t of threads as any[]) {
      let content = '';
      try { const first = await t.fetchStarterMessage(); content = first?.content ?? ''; } catch { /* the opening message was deleted */ }
      out.push({ id: t.id, title: t.name, content, createdAt: t.createdTimestamp ?? 0 });
    }
    return out;
  }
  async setPostTags(postId: string, tags: string[]): Promise<void> {
    const t: any = await this.client.channels.fetch(postId);
    const forum: any = t.parentId ? await this.client.channels.fetch(t.parentId) : null;
    if (!forum) return;
    await t.setAppliedTags(tagIds(forum, tags));
  }

  async send(channelId: string, msg: OutMsg): Promise<string> {
    const channel: any = await this.client.channels.fetch(channelId);
    const files = msg.files?.map(f => ({ attachment: f.data, name: f.name }));
    // Nothing Aang posts may ping anyone: card text comes from web pages, and "@everyone" in a job title must stay text.
    // S2 2.9: no link previews. A planted link in a message Aang sends would otherwise be fetched by Discord
    // the moment it posts, with whatever the address carries, and nobody has to click. A message with our own
    // card keeps the card, and its links are wrapped in <> instead, which Discord never previews.
    const own = this.embeds(msg);
    const flags = (msg.silent ? MessageFlags.SuppressNotifications : 0) | (own.length ? 0 : MessageFlags.SuppressEmbeds);
    const sent = await channel.send({ content: own.length ? noPreview(msg.content) : msg.content, embeds: own, components: this.rows(msg), allowedMentions: { parse: [] }, ...(files ? { files } : {}), ...(flags ? { flags } : {}) });
    return sent.id;
  }

  async edit(channelId: string, messageId: string, msg: OutMsg): Promise<void> {
    const channel: any = await this.client.channels.fetch(channelId);
    const m = await channel.messages.fetch(messageId);
    const own = this.embeds(msg);
    await m.edit({ content: own.length ? noPreview(msg.content ?? '') : msg.content ?? '', embeds: own, components: this.rows(msg), allowedMentions: { parse: [] }, ...(own.length ? {} : { flags: MessageFlags.SuppressEmbeds }) });
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

/** A forum's tag ids for these tag names; names it does not have are left out. */
function tagIds(forum: any, names: string[]): string[] {
  const all = (forum?.availableTags ?? []) as any[];
  return names.map(n => all.find(t => t.name.toLowerCase() === n.toLowerCase())?.id).filter(Boolean).slice(0, 5);
}
