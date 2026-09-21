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
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { writeFileAtomic } from './atomic.ts';
import { Budget, LAYOUT, LISTEN_CHANNELS, NEEDED, FORBIDDEN, chunkMessage, kindOf, newPairing, tryPair } from './discord-logic.ts';
import type { Pairing } from './discord-logic.ts';
import { Grocery, looksLikeRecipe, parseListCommand, parseRecipe } from './lists.ts';
import { Jobs, SWEEP_REQUEST, applyPrompt, extractUrls, fileStamp, parseVerdict, readShortlist, renderCard, vetPrompt } from './jobs.ts';
import type { Card } from './jobs.ts';
import { attachmentProblem, safeAttachmentName } from './phone.ts';

export interface Attachment { name: string; url: string; size: number }
export interface Incoming { id: string; channelId: string; channelName: string; authorId: string; isBot: boolean; content: string; createdAt: number; attachments?: Attachment[] }
/** With `url` it is a link button that opens the page and needs no answer from us. */
export interface Button { id: string; label: string; style: 'primary' | 'secondary' | 'success' | 'danger'; url?: string }
export interface OutMsg { content?: string; silent?: boolean; buttons?: Button[]; files?: { name: string; data: Buffer }[] }
export interface ButtonPress {
  customId: string; userId: string; channelId: string;
  /** Answer a one-off question: the message is updated and its buttons removed. */
  ack: (note: string) => Promise<void>;
  /** Acknowledge a press and leave the message as it is: for buttons that stay (the command deck). */
  keep: () => Promise<void>;
}

export interface Gateway {
  onMessage(cb: (m: Incoming) => void): void;
  onButton(cb: (b: ButtonPress) => void): void;
  /** Make sure every category and channel exists; returns channel name -> id. Idempotent. */
  ensureLayout(): Promise<Record<string, string>>;
  send(channelId: string, msg: OutMsg): Promise<string>;
  /** Change a message he already sent. Rejects if it is gone. */
  edit(channelId: string, messageId: string, msg: OutMsg): Promise<void>;
  /** Pin a message. May reject if the permission is missing. */
  pin(channelId: string, messageId: string): Promise<void>;
  /** Start a post in a forum channel; returns the id of the post (a thread), which more messages can be sent to. */
  createPost(forumId: string, title: string, content: string): Promise<string>;
  /** The bytes of an attachment he sent. */
  download(url: string): Promise<Buffer>;
  typing(channelId: string): Promise<void>;
  /** Messages newer than `afterId`, oldest first. With no marker, returns just the newest one. */
  fetchSince(channelId: string, afterId: string | null, limit: number): Promise<Incoming[]>;
  /** The bot's own permissions in the server, by discord.js name. */
  permissions(): Promise<string[]>;
}

export interface CoreLink {
  submit(id: string, text: string, opts?: { ephemeral?: boolean; mode?: 'auto' | 'smart' }): void;
  permission(id: string, allow: boolean): void;
  stop(): void;
  status(): void;
  actions(): void;
  trust(): void;
  revoke(kind: string): void;
  hush(minutes: number): void;
  onEvent(cb: (m: any) => void): void;
}

export interface State { ownerId: string | null; channels: Record<string, string>; lastSeen: Record<string, string>; deckId?: string; recipes?: Record<string, string[]> }

/** The pinned buttons in #aang. Status costs nothing; the job hunt goes through Aang like anything he types. */
export const DECK: Button[] = [
  { id: 'deck:status', label: 'Status', style: 'secondary' },
  { id: 'deck:job', label: 'Job hunt now', style: 'primary' },
  { id: 'deck:apply', label: 'Apply approved', style: 'success' },
  { id: 'deck:stop', label: 'Stop', style: 'danger' },
  { id: 'deck:hush', label: 'Hush 1 h', style: 'secondary' },
  { id: 'deck:log', label: 'Activity', style: 'secondary' },
  { id: 'deck:perms', label: 'Permissions', style: 'secondary' },
];
export const DECK_TEXT = 'Aang: command deck. Tap a button. Status is free, it does not use your Claude quota. Job hunt now sweeps and screens only; nothing is applied to until you approve it.';
export const JOB_REQUEST = SWEEP_REQUEST;

export interface AdapterOpts {
  budget?: Budget; now?: () => Date; log?: (s: string) => void; typingMs?: number;
  /** where a sweep leaves its shortlist, and Joshua's job criteria (for vetting a pasted link) */
  shortlistFile?: string; criteriaFile?: string;
  /** where files sent from his phone are saved (outside the git-backed data folder) */
  inboxDir?: string;
  /** how often the shortlist is checked; 0 turns the timer off (tests call scanShortlist themselves) */
  scanMs?: number;
}

export class DiscordAdapter {
  state: State = { ownerId: null, channels: {}, lastSeen: {} };
  pairing: Pairing | null = null;
  private readonly pending = new Map<string, { channelId: string; timer: ReturnType<typeof setInterval> | null }>();
  private readonly asked = new Map<string, string>();      // permission id -> channel it was asked in

  private readonly gw: Gateway;
  private readonly link: CoreLink;
  private readonly dir: string;
  private readonly opts: AdapterOpts;
  private readonly budget: Budget;

  constructor(gw: Gateway, link: CoreLink, dir: string, opts: AdapterOpts = {}) {
    this.gw = gw; this.link = link; this.dir = dir; this.opts = opts;
    this.budget = opts.budget ?? new Budget();
    this.grocery = new Grocery(dir);
    this.jobs = new Jobs(dir);
  }
  private readonly grocery: Grocery;
  readonly jobs: Jobs;
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private lastShortlist = 0;
  /** Links being vetted: request id -> the link and the channel to answer in. */
  private readonly vetting = new Map<string, { url: string; channelId: string }>();
  private get stateFile() { return path.join(this.dir, 'discord.json'); }
  private get pairFile() { return path.join(this.dir, 'discord-pairing.txt'); }
  private log(s: string) { (this.opts.log ?? (() => {}))(s); }
  private save() { try { writeFileAtomic(this.stateFile, JSON.stringify(this.state, null, 2)); } catch { /* best effort */ } }
  private now() { return (this.opts.now ?? (() => new Date()))(); }

  async start(): Promise<void> {
    try { const s = JSON.parse(readFileSync(this.stateFile, 'utf8')); this.state = { ownerId: s.ownerId ?? null, channels: s.channels ?? {}, lastSeen: s.lastSeen ?? {}, ...(s.deckId ? { deckId: s.deckId } : {}), ...(s.recipes ? { recipes: s.recipes } : {}) }; }
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
      await this.ensureDeck();
      await this.catchUp();
      this.lastShortlist = this.opts.shortlistFile ? fileStamp(this.opts.shortlistFile) : 0;   // only what changes after this start is news
      if (this.opts.shortlistFile && this.opts.scanMs !== 0) {
        this.scanTimer = setInterval(() => { void this.scanShortlist().catch(e => this.log('discord: shortlist scan failed: ' + (e as Error).message)); }, this.opts.scanMs ?? 60_000);
        this.scanTimer.unref?.();
      }
    }
    await this.say('log', this.state.ownerId ? 'Shadow is on. Aang is back.' : 'Aang is online and waiting to be paired.', true);
  }

  /** One pinned message of buttons in #aang: edited in place if it is still there, otherwise posted and pinned again. */
  async ensureDeck(): Promise<void> {
    const channel = this.state.channels['aang']; if (!channel) return;
    if (this.state.deckId) {
      try { await this.gw.edit(channel, this.state.deckId, { content: DECK_TEXT, buttons: DECK }); return; }
      catch { /* it was deleted; post a new one */ }
    }
    this.state.deckId = await this.gw.send(channel, { content: DECK_TEXT, buttons: DECK, silent: true });
    this.save();
    try { await this.gw.pin(channel, this.state.deckId); }
    catch { await this.say('log', 'I could not pin the command deck in #aang. Give my role the Pin Messages permission and it will pin next start. It works unpinned.', true); }
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
        await this.ensureDeck().catch(e => this.log('discord: deck failed: ' + (e as Error).message));
      } else if (r === 'expired') { this.pairing = newPairing(this.now().getTime()); try { writeFileAtomic(this.pairFile, this.pairing.code); } catch { /* */ } this.log(`discord: pairing code expired; new code ${this.pairing.code}`); }
      return;
    }
    if (m.authorId !== this.state.ownerId) { this.log(`discord: ignored a message from someone else (${m.authorId})`); return; }
    if (!(LISTEN_CHANNELS as readonly string[]).includes(m.channelName)) return;

    this.state.lastSeen[m.channelId] = m.id; this.save();
    if (m.attachments?.length) await this.receive(m);
    const text = m.content.trim();
    if (!text) return;
    if (/^(stop|\/stop)$/i.test(text)) { this.link.stop(); await this.gw.send(m.channelId, { content: 'Stopped.' }); return; }

    if (await this.file(m.channelId, m.channelName, text)) return;
    if (await this.jobTalk(m.channelId, m.channelName, text)) return;
    this.ask('d' + m.id, m.channelId, text);
  }

  // ---------------------------------------------------------------- files from his phone

  private async receive(m: Incoming): Promise<void> {
    const dir = path.join(this.opts.inboxDir ?? path.join(this.dir, 'inbox'), this.now().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }));
    const saved: string[] = [], refused: string[] = [];
    for (const a of m.attachments ?? []) {
      const name = safeAttachmentName(a.name);
      const no = attachmentProblem(name, a.size);
      if (no) { refused.push(`${name}: ${no}`); continue; }
      try {
        const data = await this.gw.download(a.url);
        if (data.length > 25 * 1024 * 1024) { refused.push(`${name}: it is over 25 MB`); continue; }
        mkdirSync(dir, { recursive: true });
        let dest = path.join(dir, name), n = 1;
        while (existsSync(dest)) dest = path.join(dir, `${path.parse(name).name} (${n++})${path.parse(name).ext}`);
        writeFileSync(dest, data);
        saved.push(dest);
      } catch (e) { refused.push(`${name}: ${(e as Error).message}`); }
    }
    const said = [saved.length ? `Saved to the PC:\n${saved.join('\n')}` : '', refused.length ? `Not saved:\n${refused.join('\n')}` : ''].filter(Boolean).join('\n');
    if (said) await this.gw.send(m.channelId, { content: said.slice(0, 1900) });
  }

  // ---------------------------------------------------------------- jobs: vet a link, cards, approve, apply

  /** Job-related things said in a channel. True if handled here. */
  private async jobTalk(channelId: string, channelName: string, text: string): Promise<boolean> {
    const cap = /^(?:please\s+)?(?:set\s+|raise\s+|allow\s+)?(?:today'?s\s+)?(?:apply\s+)?cap(?:\s+to)?\s+(\d)(?:\s+today)?\s*[.!]?$/i.exec(text);
    if (cap) {
      const n = Number(cap[1]);
      const set = this.jobs.raiseCap(n, this.now());
      await this.gw.send(channelId, { content: n > set ? `The most I will send in a day is ${set}. Today's limit is ${set}.` : `Today's apply limit is ${set}. It goes back to 5 tomorrow.` });
      return true;
    }
    if (await this.controls(channelId, text)) return true;
    if (channelName !== 'job-inbox') return false;
    const urls = extractUrls(text);
    if (!urls.length) return false;
    for (const url of urls) {
      if (this.jobs.isSeen(url)) { await this.gw.send(channelId, { content: `I already have that one in my list: ${url}` }); continue; }
      const id = 'v' + Date.now() + Math.floor(Math.random() * 1000);
      this.vetting.set(id, { url, channelId });
      this.ask(id, channelId, vetPrompt(url, this.criteria()), { ephemeral: true, mode: 'smart' });
    }
    return true;
  }

  // ---------------------------------------------------------------- controls, answered by the Core with no model

  /** Where the answer to each kind of request goes, in the order they were asked. */
  private readonly replyTo = { actions: [] as string[], hush: [] as string[], trust: [] as string[] };
  private trustKinds: string[] = [];
  private trustCard: { channelId: string; messageId: string } | null = null;

  /** "hush 30", "unhush", "what did you do", "what can you do without asking": free, and instant. */
  private async controls(channelId: string, text: string): Promise<boolean> {
    let m: RegExpExecArray | null;
    if (/^(?:unhush|un-hush|end hush|hush off|stop hush(?:ing)?)[.!]?$/i.test(text)) { this.replyTo.hush.push(channelId); this.link.hush(0); return true; }
    if ((m = /^(?:hush|quiet)(?:\s+(?:for\s+)?(?:(?:an?\s+)?(hour)|(\d{1,3})\s*(m|min|mins|minutes?|h|hr|hrs|hours?)?))?[.!]?$/i.exec(text))) {
      const minutes = m[1] ? 60 : m[2] ? Number(m[2]) * (/^h/i.test(m[3] ?? '') ? 60 : 1) : 60;
      this.replyTo.hush.push(channelId); this.link.hush(minutes); return true;
    }
    if (/^what (?:have you|did you)(?: just)? (?:do|done)(?: today)?\??$/i.test(text)) { this.replyTo.actions.push(channelId); this.link.actions(); return true; }
    if (/^(?:what can you do without asking|what (?:have i|am i) (?:allowed|let you)|(?:show|list) (?:your |my )?permissions)\??$/i.test(text)) { this.trustCard = null; this.replyTo.trust.push(channelId); this.link.trust(); return true; }
    return false;
  }

  private async showTrust(channelId: string, items: { kind: string; example: string; since: string }[]): Promise<void> {
    this.trustKinds = items.map(i => i.kind);
    const content = items.length
      ? 'What I may do without asking each time. Tap one to take it back:\n' + items.map(i => `- ${i.kind}${i.since ? ` (since ${i.since})` : ''}${i.example ? `, e.g. "${i.example}"` : ''}`).join('\n')
      : 'I am not allowed to do anything without asking. I ask before each kind of thing.';
    const buttons: Button[] = items.slice(0, 25).map((i, n) => ({ id: `trust:rev:${n}`, label: `Take back: ${i.kind}`.slice(0, 80), style: 'danger' as const }));
    if (this.trustCard && this.trustCard.channelId === channelId) {
      try { await this.gw.edit(channelId, this.trustCard.messageId, { content: content.slice(0, 1900), buttons }); return; } catch { /* deleted: post a new one */ }
    }
    this.trustCard = { channelId, messageId: await this.gw.send(channelId, { content: content.slice(0, 1900), buttons }) };
  }

  private criteria(): string {
    try { return this.opts.criteriaFile ? readFileSync(this.opts.criteriaFile, 'utf8') : ''; } catch { return ''; }
  }

  /** A vetted link comes back as one JSON object; turn it into a card. */
  private async vetted(id: string, reply: string): Promise<void> {
    const v = this.vetting.get(id); if (!v) return;
    this.vetting.delete(id);
    const parsed = parseVerdict(reply, v.url);
    if (!parsed) { await this.gw.send(v.channelId, { content: `I could not read a verdict for ${v.url}. What I got back:\n${reply.slice(0, 1200)}` }); return; }
    await this.postCard(this.jobs.add(parsed, this.now()), v.channelId, false);
  }

  private async postCard(card: Card, channelId: string, silent: boolean): Promise<void> {
    const view = renderCard(card);
    card.channelId = channelId;
    card.messageId = await this.gw.send(channelId, { content: view.content, buttons: view.buttons, silent });
    this.jobs.save();
  }
  private async redrawCard(card: Card): Promise<void> {
    if (!card.channelId || !card.messageId) return;
    const view = renderCard(card);
    try { await this.gw.edit(card.channelId, card.messageId, { content: view.content, buttons: view.buttons }); } catch { /* the card was deleted */ }
  }

  /** New entries in the sweep's shortlist become cards in #job-digest, once each. */
  async scanShortlist(): Promise<number> {
    const file = this.opts.shortlistFile; const where = this.state.channels['job-digest'];
    if (!file || !where) return 0;
    const stamp = fileStamp(file);
    if (!stamp || stamp === this.lastShortlist) return 0;
    this.lastShortlist = stamp;
    const fresh = readShortlist(file).filter(e => !this.jobs.isSeen(e.url));
    for (const e of fresh) {
      const card = this.jobs.add({ url: e.url, title: e.title, company: e.company, location: e.location, salary: e.salary, verdict: 'apply', reason: e.reason || 'On the sweep shortlist.' }, this.now());
      await this.postCard(card, where, true);
    }
    if (fresh.length) await this.say('job-digest', `${fresh.length} new job${fresh.length > 1 ? 's' : ''} from the sweep. Approve the ones you want, then tap Apply approved in #aang.`, false);
    return fresh.length;
  }

  /** "Apply approved": the approved jobs that fit under today's cap go to a Claude session, and nothing else does. */
  private async applyApproved(channelId: string): Promise<void> {
    if (!this.jobs.approved().length) { await this.gw.send(channelId, { content: 'Nothing is approved yet. Approve jobs in #job-digest or #job-inbox first.' }); return; }
    const left = this.jobs.left(this.now());
    if (left === 0) { await this.gw.send(channelId, { content: `Today's limit of ${this.jobs.cap(this.now())} is used. Say "cap 8 today" to raise it, up to 8; otherwise these wait for tomorrow.` }); return; }
    const { taken, waiting } = this.jobs.takeForApply(this.now());
    for (const c of taken) await this.redrawCard(c);
    const applied = this.state.channels['applied'];
    if (applied) for (const c of taken) await this.gw.send(applied, { content: `Sent to apply: ${c.title} at ${c.company}\n${c.url}`, silent: true });
    await this.gw.send(channelId, { content: `Sending ${taken.length} to apply${waiting ? `, ${waiting} more wait for tomorrow or a higher limit` : ''}. Aang will open a Claude session with them; press Enter there to start.` });
    this.ask('apply' + Date.now(), channelId, applyPrompt(taken));
  }

  // ---------------------------------------------------------------- filing: grocery list and recipes, in code, no model

  /** Handle it here if it is a list command or a pasted recipe; otherwise leave it for Aang. */
  private async file(channelId: string, channelName: string, text: string): Promise<boolean> {
    const cmd = parseListCommand(text);
    if (cmd) {
      let said: string;
      if (cmd.op === 'add') {
        const r = this.grocery.add(cmd.items);
        const parts: string[] = [];
        if (r.added.length) parts.push(`Added ${r.added.join(', ')}`);
        if (r.had.length) parts.push(`${r.had.join(', ')} ${r.had.length > 1 ? 'were' : 'was'} already on it`);
        if (r.full.length) parts.push(`no room for ${r.full.join(', ')} (the list holds 24)`);
        said = parts.join('. ') + '.';
      } else if (cmd.op === 'remove') {
        const gone = this.grocery.remove(cmd.items);
        said = gone.length ? `Took ${gone.join(', ')} off the grocery list.` : 'Nothing on the grocery list matched that.';
      } else if (cmd.op === 'clear') {
        said = `Cleared the grocery list (${this.grocery.clearAll()} items).`;
      } else said = 'Here it is.';
      await this.refreshList(cmd.op === 'show');
      await this.gw.send(channelId, { content: said });
      return true;
    }
    if (channelName === 'capture' && looksLikeRecipe(text)) { await this.fileRecipe(channelId, text); return true; }
    return false;
  }

  /** Post or update the one grocery message in #lists. `bump` posts it fresh so it is at the bottom of the channel. */
  private async refreshList(bump = false): Promise<void> {
    const where = this.state.channels['lists']; if (!where) return;
    const view = this.grocery.render();
    const s = this.grocery.s;
    if (s.messageId && s.channelId && !bump) {
      try { await this.gw.edit(s.channelId, s.messageId, { content: view.content, buttons: view.buttons }); return; }
      catch { /* it was deleted: post a new one */ }
    }
    const id = await this.gw.send(where, { content: view.content, buttons: view.buttons, silent: true });
    this.grocery.remember(id, where);
    try { await this.gw.pin(where, id); } catch { /* pinning is a nicety */ }
  }

  private async fileRecipe(channelId: string, text: string): Promise<void> {
    const forum = this.state.channels['recipes'];
    if (!forum) { await this.gw.send(channelId, { content: 'There is no #recipes channel to file it in.' }); return; }
    const r = parseRecipe(text);
    const parts = chunkMessage(r.body);
    const post = await this.gw.createPost(forum, r.title, parts[0] ?? r.body);
    for (const more of parts.slice(1)) await this.gw.send(post, { content: more, silent: true });
    let buttons: Button[] | undefined;
    if (r.ingredients.length >= 2) {
      const key = String(Date.now());
      const all = { ...(this.state.recipes ?? {}), [key]: r.ingredients };
      const keys = Object.keys(all).sort(); while (keys.length > 20) delete all[keys.shift()!];
      this.state.recipes = all; this.save();
      buttons = [{ id: `recipe:add:${key}`, label: `Add ${r.ingredients.length} ingredients to the grocery list`, style: 'primary' }];
    }
    await this.gw.send(channelId, { content: `Filed in #recipes: ${r.title}.`, ...(buttons ? { buttons } : {}) });
  }

  /** Put a request to Aang and remember which channel the answer belongs in. */
  private ask(id: string, channelId: string, text: string, opts?: { ephemeral?: boolean; mode?: 'auto' | 'smart' }): void {
    const entry = { channelId, timer: null as ReturnType<typeof setInterval> | null };
    this.pending.set(id, entry);
    void this.gw.typing(channelId).catch(() => {});
    entry.timer = setInterval(() => { void this.gw.typing(channelId).catch(() => {}); }, this.opts.typingMs ?? 8000);
    entry.timer.unref?.();
    this.link.submit(id, text, opts);
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
        if (this.vetting.has(ev.id)) { await this.vetted(ev.id, ev.text); return; }
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
    if (ev?.t === 'action' && typeof ev.text === 'string') { await this.say('log', ev.text, true); return; }
    if (ev?.t === 'actions.reply' && typeof ev.text === 'string') {
      const channelId = this.replyTo.actions.shift() ?? this.state.channels['aang'];
      if (channelId) await this.gw.send(channelId, { content: ('What I did, newest last:\n' + ev.text).slice(0, 1900) });
      return;
    }
    if (ev?.t === 'trust.reply' && Array.isArray(ev.items)) {
      // Asked for: a fresh card where he asked. After a revoke there is no request: the card he pressed is updated.
      const channelId = this.replyTo.trust.shift() ?? this.trustCard?.channelId ?? this.state.channels['aang'];
      if (channelId) await this.showTrust(channelId, ev.items);
      return;
    }
    if (ev?.t === 'hush.reply' && typeof ev.text === 'string') {
      const channelId = this.replyTo.hush.shift() ?? this.state.channels['aang'];
      if (channelId) await this.gw.send(channelId, { content: ev.text });
      return;
    }
    if (ev?.t === 'status.reply' && typeof ev.text === 'string') {
      const channelId = this.statusFor.shift() ?? this.state.channels['aang'];
      if (channelId) await this.gw.send(channelId, { content: ev.text });
      return;
    }
    if (ev?.t === 'attach' && typeof ev.data === 'string') {
      // A picture or file he asked for: into the channel he is talking in, otherwise #aang.
      const channelId = [...this.pending.values()].at(-1)?.channelId ?? this.state.channels['aang'];
      if (channelId) await this.gw.send(channelId, { content: ev.caption ? String(ev.caption).slice(0, 1900) : undefined, files: [{ name: String(ev.name || 'file'), data: Buffer.from(ev.data, 'base64') }] });
      return;
    }
    if (ev?.t === 'error' && ev.id && this.pending.has(ev.id)) {
      const done = this.finish(ev.id)!;
      this.vetting.delete(ev.id);
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

  /** Channels waiting for a status answer, in the order they asked. */
  private readonly statusFor: string[] = [];
  private deckSeq = 0;

  private async press(b: ButtonPress): Promise<void> {
    if (b.userId !== this.state.ownerId) { await b.ack('That is not yours to answer.'); return; }
    if (b.customId.startsWith('deck:')) {
      await b.keep();
      if (b.customId === 'deck:status') { this.statusFor.push(b.channelId); this.link.status(); }
      else if (b.customId === 'deck:job') this.ask('deck' + ++this.deckSeq, b.channelId, JOB_REQUEST);
      else if (b.customId === 'deck:apply') await this.applyApproved(b.channelId);
      else if (b.customId === 'deck:hush') { this.replyTo.hush.push(b.channelId); this.link.hush(60); }
      else if (b.customId === 'deck:log') { this.replyTo.actions.push(b.channelId); this.link.actions(); }
      else if (b.customId === 'deck:perms') { this.trustCard = null; this.replyTo.trust.push(b.channelId); this.link.trust(); }
      else if (b.customId === 'deck:stop') { this.link.stop(); await this.gw.send(b.channelId, { content: 'Stopped.' }); }
      return;
    }
    const rev = /^trust:rev:(\d+)$/.exec(b.customId);
    if (rev) {
      await b.keep();
      const kind = this.trustKinds[Number(rev[1])];
      if (kind) { this.trustCard = { channelId: b.channelId, messageId: this.trustCard?.messageId ?? '' }; this.link.revoke(kind); }
      return;
    }
    const job = /^job:(ok|no|new):(\d+)$/.exec(b.customId);
    if (job) {
      await b.keep();
      const c = this.jobs.setStatus(job[2]!, job[1] === 'ok' ? 'approved' : job[1] === 'no' ? 'skipped' : 'new');
      if (c) await this.redrawCard(c);
      return;
    }
    if (b.customId.startsWith('list:g:')) {
      await b.keep();
      const which = b.customId.slice('list:g:'.length);
      if (which === 'clear') this.grocery.clearChecked(); else this.grocery.toggle(Number(which));
      await this.refreshList();
      return;
    }
    const rec = /^recipe:add:(\d+)$/.exec(b.customId);
    if (rec) {
      const items = this.state.recipes?.[rec[1]!];
      if (!items) { await b.ack('I no longer have that recipe\'s ingredients.'); return; }
      const r = this.grocery.add(items);
      await this.refreshList();
      await b.ack(`Added ${r.added.length} to the grocery list${r.had.length ? `, ${r.had.length} were already on it` : ''}.`);
      return;
    }
    const m = /^perm:([^:]+):(yes|no)$/.exec(b.customId);
    if (!m) return;
    if (!this.asked.has(m[1]!)) { await b.ack('That question has already been answered.'); return; }
    this.asked.delete(m[1]!);
    this.link.permission(m[1]!, m[2] === 'yes');
    await b.ack(m[2] === 'yes' ? 'Answered: yes.' : 'Answered: no.');
  }

  get pairingCode(): string | null { return this.pairing?.code ?? (existsSync(this.pairFile) ? readFileSync(this.pairFile, 'utf8').trim() : null); }
}
