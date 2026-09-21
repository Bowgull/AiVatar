// Aang on Discord. A thin translation layer between a private Discord server and the Core.
//
// It speaks to the Core exactly as the desktop Body does - over the Core's own local connection - so replies,
// permission questions, reminders and "Need input in Claude" all reach Discord with no special cases inside
// the Core. Everything that touches the network sits behind two small interfaces (Gateway, CoreLink), which is
// how it is tested without a token.
//
// Rules Joshua set (2026-09-21): only he can speak to Aang; anything that acts is approved with a button on that
// exact thing; missed messages are read back when Shadow next starts; and quiet hours make messages silent,
// never lost.
import path from 'node:path';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { writeFileAtomic } from './atomic.ts';
import { Budget, LAYOUT, LISTEN_CHANNELS, NEEDED, FORBIDDEN, chunkMessage, kindOf, newPairing, tryPair } from './discord-logic.ts';
import type { Pairing } from './discord-logic.ts';

export interface Incoming { id: string; channelId: string; channelName: string; authorId: string; isBot: boolean; content: string; createdAt: number }
export interface Button { id: string; label: string; style: 'primary' | 'secondary' | 'success' | 'danger' }
export interface OutMsg { content?: string; silent?: boolean; buttons?: Button[] }
export interface ButtonPress { customId: string; userId: string; ack: (note: string) => Promise<void> }

export interface Gateway {
  onMessage(cb: (m: Incoming) => void): void;
  onButton(cb: (b: ButtonPress) => void): void;
  /** Make sure every category and channel exists; returns channel name -> id. Idempotent. */
  ensureLayout(): Promise<Record<string, string>>;
  send(channelId: string, msg: OutMsg): Promise<string>;
  typing(channelId: string): Promise<void>;
  /** Messages newer than `afterId`, oldest first. With no marker, returns just the newest one. */
  fetchSince(channelId: string, afterId: string | null, limit: number): Promise<Incoming[]>;
  /** The bot's own permissions in the server, by discord.js name. */
  permissions(): Promise<string[]>;
}

export interface CoreLink {
  submit(id: string, text: string): void;
  permission(id: string, allow: boolean): void;
  stop(): void;
  onEvent(cb: (m: any) => void): void;
}

export interface State { ownerId: string | null; channels: Record<string, string>; lastSeen: Record<string, string> }

export class DiscordAdapter {
  state: State = { ownerId: null, channels: {}, lastSeen: {} };
  pairing: Pairing | null = null;
  private readonly pending = new Map<string, { channelId: string; timer: ReturnType<typeof setInterval> | null }>();
  private readonly asked = new Map<string, string>();      // permission id -> channel it was asked in

  private readonly gw: Gateway;
  private readonly link: CoreLink;
  private readonly dir: string;
  private readonly opts: { budget?: Budget; now?: () => Date; log?: (s: string) => void; typingMs?: number };
  private readonly budget: Budget;

  constructor(gw: Gateway, link: CoreLink, dir: string, opts: { budget?: Budget; now?: () => Date; log?: (s: string) => void; typingMs?: number } = {}) {
    this.gw = gw; this.link = link; this.dir = dir; this.opts = opts;
    this.budget = opts.budget ?? new Budget();
  }
  private get stateFile() { return path.join(this.dir, 'discord.json'); }
  private get pairFile() { return path.join(this.dir, 'discord-pairing.txt'); }
  private log(s: string) { (this.opts.log ?? (() => {}))(s); }
  private save() { try { writeFileAtomic(this.stateFile, JSON.stringify(this.state, null, 2)); } catch { /* best effort */ } }
  private now() { return (this.opts.now ?? (() => new Date()))(); }

  async start(): Promise<void> {
    try { const s = JSON.parse(readFileSync(this.stateFile, 'utf8')); this.state = { ownerId: s.ownerId ?? null, channels: s.channels ?? {}, lastSeen: s.lastSeen ?? {} }; }
    catch { /* first run */ }
    this.gw.onMessage(m => { void this.handle(m).catch(e => this.log('discord: message failed: ' + (e as Error).message)); });
    this.gw.onButton(b => { void this.press(b).catch(e => this.log('discord: button failed: ' + (e as Error).message)); });
    this.link.onEvent(ev => { void this.fromCore(ev).catch(e => this.log('discord: core event failed: ' + (e as Error).message)); });

    this.state.channels = await this.gw.ensureLayout();
    this.save();
    await this.selfCheck();
    if (!this.state.ownerId) {
      this.pairing = newPairing(this.now().getTime());
      try { writeFileAtomic(this.pairFile, this.pairing.code); } catch { /* shown in the log instead */ }
      this.log(`discord: not paired yet. Send the code ${this.pairing.code} to Aang in #aang within 10 minutes.`);
    } else {
      await this.catchUp();
    }
    await this.say('log', this.state.ownerId ? 'Shadow is on. Aang is back.' : 'Aang is online and waiting to be paired.', true);
  }

  /** Tell #log if the permissions he was given are wrong, in either direction. */
  private async selfCheck(): Promise<void> {
    const has = new Set(await this.gw.permissions());
    const missing = NEEDED.filter(p => !has.has(p));
    const extra = FORBIDDEN.filter(p => has.has(p));
    if (missing.length) await this.say('log', `Missing permissions: ${missing.join(', ')}. Add them under Server Settings, Roles, Aang.`, false);
    if (extra.length) await this.say('log', `Permissions Aang does not need and should not have: ${extra.join(', ')}. Please switch them off.`, false);
  }

  /** Read back what he said while Shadow was off, in order. */
  private async catchUp(): Promise<void> {
    for (const name of LISTEN_CHANNELS) {
      const id = this.state.channels[name]; if (!id) continue;
      const last = this.state.lastSeen[id] ?? null;
      const found = await this.gw.fetchSince(id, last, 50);
      if (last === null) { if (found.at(-1)) { this.state.lastSeen[id] = found.at(-1)!.id; this.save(); } continue; }   // no replay of old history
      for (const m of found) await this.handle(m);
    }
  }

  // ---------------------------------------------------------------- him to Aang

  async handle(m: Incoming): Promise<void> {
    if (m.isBot) return;
    if (!this.state.ownerId) {
      if (!this.pairing) return;
      const r = tryPair(this.pairing, m.content, this.now().getTime());
      if (r === 'paired') {
        this.state.ownerId = m.authorId; this.save();
        this.pairing = null; try { rmSync(this.pairFile, { force: true }); } catch { /* gone */ }
        await this.gw.send(m.channelId, { content: 'Paired. I only answer you from now on.' });
        this.log('discord: paired.');
      } else if (r === 'expired') { this.pairing = newPairing(this.now().getTime()); try { writeFileAtomic(this.pairFile, this.pairing.code); } catch { /* */ } this.log(`discord: pairing code expired; new code ${this.pairing.code}`); }
      return;
    }
    if (m.authorId !== this.state.ownerId) { this.log(`discord: ignored a message from someone else (${m.authorId})`); return; }
    if (!(LISTEN_CHANNELS as readonly string[]).includes(m.channelName)) return;

    this.state.lastSeen[m.channelId] = m.id; this.save();
    const text = m.content.trim();
    if (!text) return;
    if (/^(stop|\/stop)$/i.test(text)) { this.link.stop(); await this.gw.send(m.channelId, { content: 'Stopped.' }); return; }

    const id = 'd' + m.id;
    const entry = { channelId: m.channelId, timer: null as ReturnType<typeof setInterval> | null };
    this.pending.set(id, entry);
    void this.gw.typing(m.channelId).catch(() => {});
    entry.timer = setInterval(() => { void this.gw.typing(m.channelId).catch(() => {}); }, this.opts.typingMs ?? 8000);
    entry.timer.unref?.();
    this.link.submit(id, text);
  }

  // ---------------------------------------------------------------- Aang to him

  private async say(channel: string, text: string, silent: boolean): Promise<void> {
    const id = this.state.channels[channel]; if (!id) return;
    for (const part of chunkMessage(text)) await this.gw.send(id, { content: part, silent });
  }

  private finish(id: string): { channelId: string } | null {
    const p = this.pending.get(id); if (!p) return null;
    if (p.timer) clearInterval(p.timer);
    this.pending.delete(id);
    return { channelId: p.channelId };
  }

  private async fromCore(ev: any): Promise<void> {
    if (ev?.t === 'bubble' && typeof ev.text === 'string') {
      if (ev.id && this.pending.has(ev.id)) {
        if (ev.stream === true) return;                          // wait for the finished reply
        const done = this.finish(ev.id)!;
        for (const part of chunkMessage(ev.text)) await this.gw.send(done.channelId, { content: part });
        return;
      }
      if (ev.proactive) {
        // Something Aang says on his own: a reminder, a Claude job that needs him or finished, a warning.
        const kind = kindOf(ev);
        const loud = this.budget.loud(kind, this.now());
        const channel = kind === 'asked' && /^Need input/i.test(ev.text) ? 'needs-you' : 'aang';
        await this.say(channel, ev.text, !loud);
      }
      return;
    }
    if (ev?.t === 'error' && ev.id && this.pending.has(ev.id)) {
      const done = this.finish(ev.id)!;
      await this.gw.send(done.channelId, { content: [ev.message, ev.next].filter(Boolean).join(' ') });
      return;
    }
    if (ev?.t === 'permission' && ev.id) {
      // The Core only sends a question here when it belongs here: something he asked in Discord, or something
      // that needs him while he is away from the PC. The second kind goes to #needs-you.
      const channelId = [...this.pending.values()].at(-1)?.channelId ?? this.state.channels['needs-you'];
      if (!channelId) return;
      this.asked.set(ev.id, channelId);
      const sub = ev.remembers ? ` Yes means I can ${ev.remembers} from now on.` : '';
      await this.gw.send(channelId, {
        content: `Can I ${ev.question}?${sub}`,
        buttons: [{ id: `perm:${ev.id}:yes`, label: 'Yes', style: 'success' }, { id: `perm:${ev.id}:no`, label: 'No', style: 'danger' }],
      });
    }
  }

  private async press(b: ButtonPress): Promise<void> {
    if (b.userId !== this.state.ownerId) { await b.ack('That is not yours to answer.'); return; }
    const m = /^perm:([^:]+):(yes|no)$/.exec(b.customId);
    if (!m) return;
    if (!this.asked.has(m[1]!)) { await b.ack('That question has already been answered.'); return; }
    this.asked.delete(m[1]!);
    this.link.permission(m[1]!, m[2] === 'yes');
    await b.ack(m[2] === 'yes' ? 'Answered: yes.' : 'Answered: no.');
  }

  get pairingCode(): string | null { return this.pairing?.code ?? (existsSync(this.pairFile) ? readFileSync(this.pairFile, 'utf8').trim() : null); }
}
