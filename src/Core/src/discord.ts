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
import { promptFor, type EmailAct } from './emailcard.ts';
import { briefCardData } from './briefcard.ts';
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { clock as videoClock, videoUrl } from './watchvideo.ts';
import { writeFileAtomic } from './atomic.ts';
import { Budget, LISTEN_CHANNELS, NEEDED, FORBIDDEN, chunkMessage, kindOf, newPairing, tryPair, planLayout, BUZZ_KEYS } from './discord-logic.ts';
import type { Pairing } from './discord-logic.ts';
import { capture } from './capture.ts';
import { Grocery, applyListCommand, looksLikeRecipe, parseListCommand, parseRecipe } from './lists.ts';
import { Drafts, Jobs, SWEEP_REQUEST, applyPrompt, extractUrls, fileStamp, parseVerdict, readAppliedFile, readDraftsFile, readShortlist, renderCard, renderDraft, verdictFor, vetPrompt } from './jobs.ts';
import type { Card } from './jobs.ts';
import { attachmentProblem, safeAttachmentName } from './phone.ts';

export interface Attachment { name: string; url: string; size: number }
export interface Incoming { id: string; channelId: string; channelName: string; authorId: string; isBot: boolean; content: string; createdAt: number; attachments?: Attachment[]; /** the message this one replies to */ replyTo?: string; /** for a message in a forum post: the forum */ parentId?: string }
/** 9.D: a forum post, as read back for moving it. */
export interface PostInfo { id: string; title: string; content: string; createdAt: number }
export type { ChannelInfo } from './discord-logic.ts';
/** With `url` it is a link button that opens the page and needs no answer from us. */
export interface Button { id: string; label: string; style: 'primary' | 'secondary' | 'success' | 'danger'; url?: string; /** greyed out and cannot be pressed */ disabled?: boolean }
/** A real Discord embed, for anything that is a record to scan rather than a line to read - a job card first
 * (2026-09-22): stage, match score, dates and reason each their own field instead of one run-on line. */
export interface OutEmbed {
  title?: string; description?: string; /** decimal, e.g. 0x57F287 */ color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: string;
  /** 9.D D3: a picture inside the card, e.g. 'attachment://card.png' (the file goes in OutMsg.files) */
  image?: string;
}
export interface OutMsg { content?: string; silent?: boolean;
  /** 9.D D2: may buzz even outside the green channels (a finished Claude job's post). Rare on purpose. */
  loud?: boolean;
  /** 9.D D4: who says it. Claude and Job Hunt post as their own senders (webhooks Aang made); unset is Aang. */
  as?: 'claude' | 'jobhunt'; buttons?: Button[]; files?: { name: string; data: Buffer }[]; embed?: OutEmbed }
export interface ButtonPress {
  customId: string; userId: string; channelId: string;
  /** the message the button is on */
  messageId?: string;
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
  createPost(forumId: string, title: string, content: string, tags?: string[]): Promise<string>;
  // 9.D: the plain channel operations the layout is built from. The decisions stay on Shadow (planLayout), so the
  // Mac front desk only ever does these and rarely needs updating.
  channelList(): Promise<import('./discord-logic.ts').ChannelInfo[]>;
  createChannel(spec: { name: string; kind: 'category' | 'text' | 'forum'; parentId?: string | null; topic?: string; tags?: string[] }): Promise<string>;
  editChannel(id: string, spec: { name?: string; parentId?: string | null; topic?: string; addTags?: string[] }): Promise<void>;
  /** Only ever after his yes. */
  deleteChannel(id: string): Promise<void>;
  /** A forum's posts, newest first: title and opening message. */
  postsOf(forumId: string, limit: number): Promise<PostInfo[]>;
  /** Set a forum post's tags by name (tags the forum does not have are ignored). */
  setPostTags(postId: string, tags: string[]): Promise<void>;
  /** 9.D D7: a thread on one of his messages; returns the thread's id. */
  startThread?(channelId: string, messageId: string, name: string): Promise<string>;
  /** The bytes of an attachment he sent. */
  download(url: string): Promise<Buffer>;
  typing(channelId: string): Promise<void>;
  /** Messages newer than `afterId`, oldest first. With no marker, returns just the newest one. */
  fetchSince(channelId: string, afterId: string | null, limit: number): Promise<Incoming[]>;
  /** The bot's own permissions in the server, by discord.js name. */
  permissions(): Promise<string[]>;
  /** M4, the Mac's front desk only: what the Mac needs to answer while this PC is off, and what it did. */
  macBrief?(b: import('./macbrain.ts').MacBrief): Promise<boolean>;
  onHandled?(cb: (items: import('./macbrain.ts').Handled[]) => Promise<void> | void): void;
  onHello?(cb: () => void): void;
}

export interface CoreLink {
  /** 9.D D5: bring the Claude app forward where this job runs. Optional for older links. */
  openClaude?(cwd: string): void;
  /** 9.D D6: the home card's numbers; he steps away; put a show on. Optional for older links. */
  homeData?(): Promise<{ week: number | null; five?: number | null; pace: string; running: number; waiting: string[] } | null>;
  stepAway?(): void;
  putOn?(words: string): void;
  /** 9.D D7: watch a video, and add an idea to Aang's plan. Optional for older links. */
  watchVideo?(url: string): Promise<any | null>;
  addIdea?(text: string): void;
  /** 9.D D3: a card Aang draws, as a PNG; null when it could not be drawn. Optional: without it, plain text. */
  drawCard?(kind: 'job' | 'needs' | 'home' | 'watched' | 'quota' | 'brief' | 'inbox' | 'week' | 'email', data: unknown): Promise<Buffer | null>;
  submit(id: string, text: string, opts?: { ephemeral?: boolean; mode?: 'auto' | 'smart' }): void;
  permission(id: string, allow: boolean): void;
  /** Type this into a new chat in the Claude app on the MacBook. Answered by a mac.run.reply event, never a
   *  direct return - the same async-event shape as status()/trust(). */
  runOnMac(text: string): void;
  stop(): void;
  status(): void;
  actions(): void;
  trust(): void;
  revoke(kind: string): void;
  hush(minutes: number): void;
  /** Turn quota saving on or off from his phone. Free: it never reaches Claude. */
  saving(on: boolean): void;
  mailAct(id: string, hash: string, action: 'send' | 'save' | 'discard'): void;
  brief(): void;
  /** A reply to a Claude Code job's update: continue that job (by its folder) with his words. */
  claudeReply(cwd: string, text: string): void;
  /** M4: Aang's voice, his facts and the last few lines, for the Mac; and what the Mac said and saved. */
  macBrief?(): Promise<{ prompt: string; facts: string[]; recent: { who: 'you' | 'Aang'; text: string }[]; talk?: { who: 'you' | 'Aang'; text: string; ts: string }[]; morning?: import('./macbrain.ts').MacMorning } | null>;
  macHandled?(items: import('./macbrain.ts').Handled[]): void;
  onEvent(cb: (m: any) => void): void;
}

export interface State { ownerId: string | null; channels: Record<string, string>; lastSeen: Record<string, string>;
  /** 9.D: channels (by key) already renamed once from their old plain names (before emoji) */
  renamed?: string[];
  /** 9.D: the name each channel (by key) was last renamed toward, so it is tried once per name */
  namedAs?: Record<string, string>;
  /** 9.D: old channels still to move from and, with his yes, delete */
  old?: { name: string; id: string; into: string }[]; oldCats?: { name: string; id: string }[]; moved?: boolean;
  /** 9.D: job cards that are their own post in the jobs forum (post id), so their tags follow the job */
  jobPosts?: string[];
  /** 9.D: the one message in home that offers deleting the old channels */
  oldOffer?: string;
  /** 9.D D5: each Claude job's own post in claude-jobs and its one live card, by the job's folder */
  claudePosts?: Record<string, { post: string; card: string; title: string; state: 'working' | 'waiting' | 'done' }>;
  /** 9.D D7: videos he dropped in capture, by key: where its thread is and what Aang made of it */
  videos?: Record<string, { url: string; thread: string; title: string; kind: string; shows: string }>;
  /** 9.D D6: the pinned home card in home */
  homeCard?: string;
  /** 9.D D6: "Put a show on" was pressed: his next words in aang are the show */
  putOnNext?: boolean;
  /** 2026-10-13: the one-time fix for the empty channel copies has run */
  fixedCopies?: boolean; deckId?: string; recipes?: Record<string, string[]>; /** email draft id -> where its card is, so a change edits the card in place */ mail?: Record<string, { c: string; m: string }>; /** Claude job folder -> where its last update is, so a reply there continues that job */ jobs?: Record<string, { c: string; m: string }> }

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
/** Placeholder for a shortlisted job with no rubric score of its own - lands as "apply" (>= 70), since the sweep
 * was already asked to screen before shortlisting. */
const SWEEP_SCORE = 75;

export interface AdapterOpts {
  budget?: Budget; now?: () => Date; log?: (s: string) => void; typingMs?: number;
  /** where a sweep leaves its shortlist, and Joshua's job criteria (for vetting a pasted link) */
  shortlistFile?: string; criteriaFile?: string;
  /** drafts.json (answers waiting for approval), answers-approved.json (what he approved) and applied.json (what came of each application) */
  draftsFile?: string; answersFile?: string; appliedFile?: string;
  /** where files sent from his phone are saved (outside the git-backed data folder) */
  inboxDir?: string;
  /** how often the shortlist is checked; 0 turns the timer off (tests call scanShortlist themselves) */
  scanMs?: number;
  /**
   * M3: false when the MacBook front desk holds the connection. It keeps what he said while Shadow was off and
   * hands each message over exactly once, so reading Discord's history back (where old messages were answered
   * again) is not done at all.
   */
  catchUp?: boolean;
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
    // 9.D D2 (sheet 15): only the green channels may buzz his phone. Enforced here, once, for every message Aang
    // sends, so no new feature can forget it: anything else goes out silent.
    const send = (channelId: string, msg: OutMsg) => gw.send(channelId, this.buzzes(channelId) || msg.loud ? msg : { ...msg, silent: true });
    this.gw = new Proxy(gw, { get: (t: any, p) => p === 'send' ? send : typeof t[p] === 'function' ? t[p].bind(t) : t[p] }) as Gateway;
    this.link = link; this.dir = dir; this.opts = opts;
    this.budget = opts.budget ?? new Budget();
    this.grocery = new Grocery(dir);
    this.jobs = new Jobs(dir);
    this.drafts = new Drafts(dir);
  }
  private readonly grocery: Grocery;
  readonly jobs: Jobs;
  readonly drafts: Drafts;
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private lastShortlist = 0;
  private lastDrafts = 0;
  private lastApplied = 0;
  /** Links being vetted: request id -> the link and the channel to answer in. */
  private readonly vetting = new Map<string, { url: string; channelId: string }>();
  private get stateFile() { return path.join(this.dir, 'discord.json'); }
  private get pairFile() { return path.join(this.dir, 'discord-pairing.txt'); }
  private log(s: string) { (this.opts.log ?? (() => {}))(s); }
  private save() { try { writeFileAtomic(this.stateFile, JSON.stringify(this.state, null, 2)); } catch { /* best effort */ } }
  private now() { return (this.opts.now ?? (() => new Date()))(); }

  async start(): Promise<void> {
    try { const s = JSON.parse(readFileSync(this.stateFile, 'utf8')); this.state = { ...s, ownerId: s.ownerId ?? null, channels: s.channels ?? {}, lastSeen: s.lastSeen ?? {} }; }
    catch { /* first run */ }
    this.gw.onMessage(m => { void this.handle(m).catch(e => this.log('discord: message failed: ' + (e as Error).message)); });
    this.gw.onButton(b => { void this.press(b).catch(e => this.log('discord: button failed: ' + (e as Error).message)); });
    this.link.onEvent(ev => { void this.fromCore(ev).catch(e => this.log('discord: core event failed: ' + (e as Error).message)); });
    this.gw.onHandled?.(items => this.applyMac(items));
    // M4: a front desk that just (re)started, e.g. updated by the Mac setup, is briefed at once, not in ten minutes.
    this.gw.onHello?.(() => { if (this.started) void this.sendMacBrief(); });

    this.state.channels = await this.layout();
    this.save();
    await this.selfCheck();
    if (!this.state.ownerId) {
      this.pairing = newPairing(this.now().getTime());
      try { writeFileAtomic(this.pairFile, this.pairing.code); } catch { /* shown in the log instead */ }
      this.log(`discord: not paired yet. Send the code ${this.pairing.code} to Aang in #aang within 10 minutes.`);
    } else {
      await this.ensureDeck();
      if (this.opts.catchUp !== false) await this.catchUp();
      // 9.D D6: the home card, pinned in home and kept current.
      await this.refreshHome().catch(e => this.log('discord: home card failed: ' + (e as Error).message));
      // M4: the Mac is kept ready to answer, on the same ten minutes.
      void this.sendMacBrief();
      this.started = true;
      this.homeTimer = setInterval(() => { void this.refreshHome().catch(() => {}); void this.sendMacBrief(); }, 10 * 60_000);
      this.homeTimer.unref?.();
      // 9.D: the old channels' contents move once; deleting them waits for his two yeses.
      const moved = await this.moveOld().catch(e => { this.log('discord: moving the old channels failed: ' + (e as Error).message); return null; });
      const home = this.state.channels['home'];
      if ((moved || (this.state.old ?? []).length) && home) {
        // Posted once; on later starts the same message is brought up to date, never posted again.
        const offer: OutMsg = { content: moved ?? `The old channels (${(this.state.old ?? []).map(o => '#' + o.name).join(', ')}) are still there.`, buttons: [{ id: 'old:delete', label: 'Delete the old channels', style: 'danger' }, { id: 'old:keep', label: 'Keep them for now', style: 'secondary' }], silent: true };
        let kept = false;
        if (this.state.oldOffer) { try { await this.gw.edit(home, this.state.oldOffer, offer); kept = true; } catch { /* it was deleted: post it again */ } }
        if (!kept) { this.state.oldOffer = await this.gw.send(home, offer); this.save(); }
      }
      // Only what changes after this start is news.
      this.lastShortlist = this.opts.shortlistFile ? fileStamp(this.opts.shortlistFile) : 0;
      this.lastDrafts = this.opts.draftsFile ? fileStamp(this.opts.draftsFile) : 0;
      this.lastApplied = this.opts.appliedFile ? fileStamp(this.opts.appliedFile) : 0;
      if ((this.opts.shortlistFile || this.opts.draftsFile || this.opts.appliedFile) && this.opts.scanMs !== 0) {
        this.scanTimer = setInterval(() => { void this.scanAll().catch(e => this.log('discord: job files scan failed: ' + (e as Error).message)); }, this.opts.scanMs ?? 60_000);
        this.scanTimer.unref?.();
      }
    }
    await this.say('home', this.state.ownerId ? 'Yip yip.' : 'Aang is online and waiting to be paired.', true);
  }

  /**
   * 9.D (sheet 15, approved 2026-10-13): make the server match LAYOUT. Existing channels are renamed in place, so
   * their history stays; new ones are created; nothing is ever deleted here. Returns key -> channel id.
   */
  async layout(): Promise<Record<string, string>> {
    // One-time fix (2026-10-13): Discord stripped "!" and "+", a restart then made empty copies of #needs-you and
    // #capture, and Aang began using the copies. Forget them once, so the older channels (his history) are found
    // again by name and get the symbols Discord keeps; the copies are offered for deletion.
    if (!this.state.fixedCopies) {
      for (const k of ['needs-you', 'capture']) delete this.state.channels[k];

      this.state.fixedCopies = true;
    }
    const namedAs = { ...(this.state.namedAs ?? {}) };
    const plan = planLayout(await this.gw.channelList(), namedAs, this.state.channels ?? {});
    const out: Record<string, string> = {};
    for (const cat of plan.categories) {
      const catId = cat.id ?? await this.gw.createChannel({ name: cat.name, kind: 'category' });
      for (const ch of plan.channels.filter(c => c.category === cat.name)) {
        const d = ch.def;
        if (!ch.id) {
          out[d.key] = await this.gw.createChannel({ name: d.name, kind: d.kind, parentId: catId, topic: d.topic, ...(d.tags ? { tags: d.tags } : {}) });
          continue;
        }
        out[d.key] = ch.id;
        if (ch.rename || ch.moveTo || ch.addTags.length) {
          // In the background: Discord allows two renames of a channel in ten minutes and makes the next one wait,
          // and a slow rename must never keep Discord from starting (found 2026-10-13).
          const id = ch.id, spec = { ...(ch.rename ? { name: d.name } : {}), ...(ch.moveTo ? { parentId: catId } : {}), ...(ch.rename ? { topic: d.topic } : {}), ...(ch.addTags.length ? { addTags: ch.addTags } : {}) };
          void this.gw.editChannel(id, spec).catch(e => this.log(`discord: could not tidy #${d.key} yet: ${(e as Error).message}`));
          if (ch.rename) namedAs[d.key] = d.name;
        }
      }
    }
    this.state.namedAs = namedAs;
    this.state.old = plan.old;
    this.state.oldCats = plan.oldCategories;
    return out;
  }

  /**
   * 9.D D3: a message carrying a card Aang draws (sheet 15): the picture inside an embed with its accent strip, and the
   * plain words kept as the message text, which is what his phone's notification shows. Without a picture (the Shell is
   * not running), the same words go out on their own.
   */
  private async drawn(kind: 'job' | 'needs' | 'home' | 'watched' | 'quota' | 'brief' | 'inbox' | 'week' | 'email', data: unknown, accent: number, msg: OutMsg): Promise<OutMsg> {
    const png = await this.link.drawCard?.(kind, data).catch(() => null) ?? null;
    if (!png) return msg;
    return { ...msg, embed: { ...(msg.embed ?? {}), color: accent, image: 'attachment://card.png' }, files: [...(msg.files ?? []), { name: 'card.png', data: png }] };
  }
  private async post(channel: string, msg: OutMsg): Promise<string | null> {
    const id = this.state.channels[channel]; if (!id) return null;
    return this.gw.send(id, msg);
  }

  /**
   * 9.D D5 (sheet 15 board 2): one post per Claude job in claude-jobs, holding ONE drawn card that is edited in place as
   * the job moves: working, waiting on him, done. Its tag follows (Working / Needs you / Done). A question also goes to
   * needs-you, which buzzes; "done" buzzes once, in the post. Anything he writes in the post goes to that job.
   */
  /**
   * 9.D D7 (sheet 15 board 3): a video in capture. In a thread on his message: "Watching it...", then a drawn card that
   * says what it is, what it shows and what it could be useful for, with Add to Aang's plan / Just save it / Go deeper /
   * Not useful. Replying in the thread steers Aang about it.
   */
  private async watchVideoIn(m: Incoming, url: string): Promise<void> {
    let thread = m.channelId;
    try { if (this.gw.startThread) thread = await this.gw.startThread(m.channelId, m.id, 'about this video'); } catch { /* answer in the channel */ }
    await this.gw.send(thread, { content: 'Watching it...', silent: true });
    const r = await this.link.watchVideo!(url);
    if (!r || !r.ok) { await this.gw.send(thread, { content: `I could not watch that one: ${r?.why ?? 'the PC did not answer'}. The link is kept here.`, silent: true }); return; }
    const d = r.d as { kind: string; title: string; shows: string; useful: { who: string; what: string }[]; best: number };
    const len = r.seconds ? `${videoClock(r.seconds)}, ` : '';
    const from = r.from === 'transcript' ? 'read from the transcript' : r.from === 'description' ? 'read from its description' : 'read from its caption';
    const key = Buffer.from(url).toString('base64url').slice(-24);
    const title = d.title || r.title || 'A video';
    this.state.videos = { ...(this.state.videos ?? {}), [key]: { url, thread, title, kind: d.kind, shows: d.shows } };
    const keys = Object.keys(this.state.videos); for (const k of keys.slice(0, Math.max(0, keys.length - 50))) delete this.state.videos[k];
    this.save();
    const words = `${title}: ${d.kind}. ${d.shows}`;
    const msg = await this.drawn('watched', { meta: `${len}${from}`, title, kind: d.kind, shows: d.shows, useful: d.useful, best: d.best }, 0x966EC8, {
      content: `${words.slice(0, 1500)}\n-# ${r.by === 'Qwen' ? 'Qwen read it on your PC, for free.' : 'Claude read it, because Qwen could not just now.'} Go deeper uses Claude and says the cost first.`,
      silent: true,
      buttons: [
        { id: `vid:plan:${key}`, label: "Add to Aang's plan", style: 'primary' },
        { id: `vid:save:${key}`, label: 'Just save it', style: 'secondary' },
        { id: `vid:deep:${key}`, label: 'Go deeper', style: 'secondary' },
        { id: `vid:bin:${key}`, label: 'Not useful', style: 'secondary' },
      ],
    });
    await this.gw.send(thread, msg);
  }

  /**
   * 9.D D8 (sheet 15 board 4): 🎮 gaming. A new upload from a creator he follows: its picture, title, Watch on PC and
   * Later. Apex patch notes: the title, a short summary and the link. Always silent (gaming does not buzz).
   */
  private async gamingPost(ev: any): Promise<void> {
    const where = this.state.channels['gaming']; if (!where) return;
    if (ev.kind === 'upload' && /^[\w-]{6,20}$/.test(String(ev.videoId))) {
      const files = typeof ev.thumb === 'string' && ev.thumb ? [{ name: 'thumb.jpg', data: Buffer.from(ev.thumb, 'base64') }] : [];
      await this.gw.send(where, {
        content: `${String(ev.channel ?? 'A creator').slice(0, 80)} just posted`, silent: true,
        embed: { title: String(ev.title ?? '').slice(0, 200), color: 0x966EC8, ...(files.length ? { image: 'attachment://thumb.jpg' } : {}) },
        ...(files.length ? { files } : {}),
        buttons: [{ id: `gm:watch:${ev.videoId}`, label: 'Watch on PC', style: 'secondary' }, { id: `gm:later:${ev.videoId}`, label: 'Later', style: 'secondary' }],
      });
      return;
    }
    if (ev.kind === 'news' && /^https:\/\/store\.steampowered\.com\//.test(String(ev.link))) {
      await this.gw.send(where, { content: `Apex patch notes: ${String(ev.title).slice(0, 200)}\n${ev.link}`, silent: true,
        embed: { title: String(ev.title).slice(0, 200), description: String(ev.summary ?? '').slice(0, 400), color: 0xDA373C, footer: 'Apex Legends news, from Steam' } });
    }
  }

  private homeTimer: NodeJS.Timeout | null = null;
  private started = false;
  /**
   * 9.D D6 (sheet 15 board 4): one card pinned at the top of home, drawn on the pixel wood, edited in place, never
   * posted again: Claude this week, what is running, what waits on him, his PC. Buttons: What's waiting, Stepping away,
   * Put a show on. Silent always (home is not a channel that buzzes).
   */
  async refreshHome(): Promise<void> {
    const home = this.state.channels['home']; if (!home) return;
    const d = await this.link.homeData?.() ?? null;
    if (!d) return;
    const pct = d.week === null ? null : Math.round(d.week * 100);
    const tiles = [
      { k: 'CLAUDE THIS WEEK', v: pct === null ? 'not known yet' : `${pct}%${d.pace ? ', ' + d.pace : ''}`, ...(pct === null ? {} : { fill: d.week }) },
      // Sheet 21 (his pick): the 5-hour window too, so a big job's ask can be judged at a glance.
      ...(typeof d.five === 'number' ? [{ k: 'NEXT 5 HOURS', v: `${Math.round(d.five * 100)}% used`, fill: d.five }] : []),
      { k: 'RUNNING', v: d.running === 0 ? 'nothing' : `${d.running} Claude job${d.running === 1 ? '' : 's'}` },
      { k: 'WAITING ON YOU', v: d.waiting.length === 0 ? 'nothing' : `${d.waiting.length} thing${d.waiting.length === 1 ? '' : 's'}`, ...(d.waiting.length ? { tone: 'warn' } : {}) },
      { k: 'YOUR PC', v: 'On', tone: 'good' },
    ];
    const words = `Home: ${pct === null ? '' : `${pct}% of the week, `}${d.running} running, ${d.waiting.length} waiting on you.`;
    const msg = await this.drawn('home', { tiles }, 0xFFC43C, { content: words, silent: true, buttons: [
      { id: 'home:waiting', label: "What's waiting", style: 'primary' },
      { id: 'home:away', label: 'Stepping away', style: 'secondary' },
      { id: 'home:puton', label: 'Put a show on', style: 'secondary' },
    ] });
    if (this.state.homeCard) { try { await this.gw.edit(home, this.state.homeCard, msg); return; } catch { /* deleted: post and pin again */ } }
    this.state.homeCard = await this.gw.send(home, msg); this.save();
    try { await this.gw.pin(home, this.state.homeCard); } catch { /* pinning is a nicety */ }
  }

  async claudeNews(ev: any, needsHim: boolean): Promise<void> {
    const forum = this.state.channels['claude-jobs']; if (!forum) return;
    const cwd = String(ev.jobCwd);
    const state: 'working' | 'waiting' | 'done' = ev.done === true ? 'done' : needsHim ? 'waiting' : 'working';
    // "Done:" is said once, by the card: Claude's own leading "Done." is dropped so it never reads "Done: Done."
    const text = String(ev.text ?? '').trim().replace(state === 'done' ? /^done[.!:,]?\s*/i : /^$/, '');
    const posts = this.state.claudePosts ?? {};
    let p = posts[cwd];
    const title = (String(ev.jobName ?? '').trim() || path.basename(cwd) || 'Claude job').slice(0, 90);
    // A finished job's folder starting new work is a new job: a new post.
    if (!p || (p.state === 'done' && state !== 'done')) {
      const post = await this.gw.createPost(forum, title, `A Claude job, working in ${cwd}.`.slice(0, 1900), ['Working']);
      p = { post, card: '', title, state };
    }
    p.state = state;
    const first = text.split(/\n/)[0]!.slice(0, 160);
    const words = state === 'done' ? `Done: ${first}` : state === 'waiting' ? `Needs you: ${first}` : first;
    const msg = await this.drawn('job', { plaque: state === 'waiting' ? 'NEEDS YOU' : 'CLAUDE JOB', headline: state === 'done' ? `${title}. Done.` : title, sub: first, done: state === 'done' },
      state === 'done' ? 0x78E696 : state === 'waiting' ? 0xFF8040 : 0x966EC8,
      { content: words, as: 'claude', silent: true, buttons: [{ id: `cj:open:${this.claudeKey(cwd)}`, label: 'Open on PC', style: 'secondary' }] });
    let edited = false;
    if (p.card) { try { await this.gw.edit(p.post, p.card, msg); edited = true; } catch { /* the card was deleted: post it again */ } }
    if (!edited) p.card = await this.gw.send(p.post, msg);
    await this.gw.setPostTags(p.post, [state === 'done' ? 'Done' : state === 'waiting' ? 'Needs you' : 'Working']).catch(() => {});
    this.state.claudePosts = { ...posts, [cwd]: p };
    // Replies to the card (or to the question in needs-you) reach this job, as before.
    this.state.jobs = { ...(this.state.jobs ?? {}), [cwd]: { c: p.post, m: p.card } };
    this.save();
    if (ev.image?.data) await this.gw.send(p.post, { files: [{ name: 'screen.jpg', data: Buffer.from(String(ev.image.data), 'base64') }], silent: true, as: 'claude' }).catch(() => {});
    if (state === 'waiting') {
      const q = await this.post('needs-you', await this.drawn('needs', { title: `${title} needs you`, text: text.slice(0, 380) }, 0xC95E28, { content: `Claude needs you: ${first}`, as: 'claude' }));
      if (q) { this.state.jobs = { ...(this.state.jobs ?? {}), [cwd]: { c: this.state.channels['needs-you']!, m: q } }; this.save(); }
      if (q && typeof ev.session === 'string') this.sentFor(ev.session, this.state.channels['needs-you']!, q, `Claude needs you: ${first}`);
    }
    // A finished job buzzes, except in his quiet hours (2026-10-28 review R14); a session that needs him always does.
    if (state === 'done') {
      const d = await this.gw.send(p.post, { content: `Done: ${text.slice(0, 1800)}`, as: 'claude', loud: !this.budget.quiet(this.now()) });
      if (typeof ev.session === 'string') this.sentFor(ev.session, p.post, d, `Done: ${text.slice(0, 1800)}`);
    }
    void this.refreshHome().catch(() => {});
  }
  /** A short stable key for a job's folder, for its buttons. */
  private claudeKey(cwd: string): string { return Buffer.from(cwd.toLowerCase()).toString('base64url').slice(-40); }

  /** 9.D D2: may a message here buzz his phone? Only in the green channels. */
  private buzzes(channelId: string): boolean { const k = this.keyOf(channelId); return !!k && BUZZ_KEYS.has(k); }

  /** Which of his channels (by key) a message is in; a message in a forum post counts as the forum. */
  private keyOf(channelId: string, parentId?: string): string | null {
    for (const [k, id] of Object.entries(this.state.channels)) if (id === channelId || (parentId && id === parentId)) return k;
    return null;
  }

  /**
   * 9.D: what is in the old channels moves into the new forums, once. Recipes and guides are copied post by post into
   * the library with their tag; the job cards are drawn again from Aang's own job list, one post each, so nothing is
   * lost in a copy. The old channels stay until he presses delete (twice: it cannot be undone).
   */
  async moveOld(): Promise<string | null> {
    const old = this.state.old ?? [];
    if (!old.length || this.state.moved) return null;
    let library = 0, jobs = 0;
    const lib = this.state.channels['library'];
    for (const o of old.filter(x => x.into === 'library' && lib)) {
      const tag = o.name === 'recipes' ? 'Recipe' : 'Guide';
      for (const p of (await this.gw.postsOf(o.id, 200)).reverse()) {
        const parts = chunkMessage(p.content || p.title);
        const post = await this.gw.createPost(lib!, p.title, parts[0] ?? p.title, [tag]);
        for (const more of parts.slice(1)) await this.gw.send(post, { content: more, silent: true });
        library++;
      }
    }
    if (this.state.channels['jobs'] && old.some(x => x.into === 'jobs')) {
      for (const card of this.jobs.cards) { await this.postCard(card, '', true); jobs++; }
    }
    this.state.moved = true; this.save();
    const names = old.map(o => '#' + o.name).join(', ');
    return `Moved ${library} recipe${library === 1 ? '' : 's'} and guide${library === 1 ? '' : 's'} into ❖ library and ${jobs} job${jobs === 1 ? '' : 's'} into ◎ jobs. The old channels (${names}) are still there until you say.`;
  }

  /** His second yes: the old channels go, then their categories if they are empty. */
  private async deleteOld(): Promise<string> {
    let n = 0;
    for (const o of this.state.old ?? []) { try { await this.gw.deleteChannel(o.id); n++; } catch (e) { this.log(`discord: could not delete #${o.name}: ${(e as Error).message}`); } }
    const left = await this.gw.channelList().catch(() => []);
    for (const c of this.state.oldCats ?? []) if (!left.some(x => x.parentId === c.id)) { try { await this.gw.deleteChannel(c.id); } catch { /* not empty after all */ } }
    this.state.old = []; this.state.oldCats = []; this.save();
    return `Deleted ${n} old channel${n === 1 ? '' : 's'}.`;
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
    catch { await this.say('home', 'I could not pin the command deck in #aang. Give my role the Pin Messages permission and it will pin next start. It works unpinned.', true); }
  }

  /** Tell #log if the permissions he was given are wrong, in either direction. */
  private async selfCheck(): Promise<void> {
    const has = new Set(await this.gw.permissions());
    const missing = NEEDED.filter(p => !has.has(p));
    const extra = FORBIDDEN.filter(p => has.has(p));
    if (missing.length) await this.say('home', `Missing permissions: ${missing.join(', ')}. Add them under Server Settings, Roles, Aang.`, false);
    if (extra.length) await this.say('home', `Permissions Aang does not need and should not have: ${extra.join(', ')}. Please switch them off.`, false);
  }

  /** Read back what he said while Shadow was off, in order. */
  private async catchUp(): Promise<void> {
    for (const name of LISTEN_CHANNELS) {
      const id = this.state.channels[name]; if (!id || name === 'jobs') continue;      // a forum has no messages of its own
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
    // 9.D: by key, never by name: the names now carry symbols and could be renamed again.
    const key = this.keyOf(m.channelId, m.parentId);
    if (!key || !(LISTEN_CHANNELS as readonly string[]).includes(key)) return;

    this.state.lastSeen[m.channelId] = m.id; this.save();
    if (m.attachments?.length) await this.receive(m);
    const text = m.content.trim();
    if (!text) return;
    if (/^(stop|\/stop)$/i.test(text)) { this.link.stop(); await this.gw.send(m.channelId, { content: 'Stopped.' }); return; }

    if (key === 'drafts') { await this.draftReply(m, text); return; }
    // 9.D D7: talking in a video's thread steers Aang about that video.
    const vid = Object.values(this.state.videos ?? {}).find(v => v.thread === m.channelId);
    if (vid) { this.ask('vt' + m.id, m.channelId, `About the video "${vid.title}" (${vid.url}), which I dropped in capture: ${text}`); return; }
    if (key === 'capture' && videoUrl(text) && this.link.watchVideo) { await this.watchVideoIn(m, videoUrl(text)!); return; }
    if (key === 'aang' && this.state.putOnNext) {
      this.state.putOnNext = false; this.save();
      if (this.link.putOn) { this.link.putOn(text); await this.gw.send(m.channelId, { content: `Putting on ${text.slice(0, 100)}.` }); return; }
    }
    // 9.D D5: anything he writes in a Claude job's post is for that job.
    if (key === 'claude-jobs') {
      const cwd = Object.entries(this.state.claudePosts ?? {}).find(([, p]) => p.post === m.channelId)?.[0];
      if (cwd) { await this.gw.send(m.channelId, { content: 'Telling Claude...', as: 'claude' }); this.link.claudeReply(cwd, text); }
      return;
    }          // #drafts is for changing drafts, never for chat
    if (m.replyTo && await this.claudeReplyTo(m, text)) return;
    if (await this.file(m.channelId, key, text)) return;
    if (await this.jobTalk(m.channelId, key, text)) return;
    this.ask('d' + m.id, m.channelId, text);
  }

  /** A reply to one of a Claude Code job's own updates: told to that job, not to Aang. True if it was one. */
  private async claudeReplyTo(m: Incoming, text: string): Promise<boolean> {
    const hit = Object.entries(this.state.jobs ?? {}).find(([, v]) => v.m === m.replyTo);
    if (!hit) return false;
    await this.gw.send(m.channelId, { content: 'Telling Claude...' });
    this.link.claudeReply(hit[0]!, text);
    return true;
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
    if (channelName !== 'jobs') return false;
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
  private readonly replyTo = { actions: [] as string[], hush: [] as string[], trust: [] as string[], brief: [] as string[] };
  private trustKinds: string[] = [];
  private trustCard: { channelId: string; messageId: string } | null = null;

  /** "hush 30", "unhush", "save quota", "what did you do", "what can you do without asking": free, and instant. */
  private async controls(channelId: string, text: string): Promise<boolean> {
    let m: RegExpExecArray | null;
    if (/^(?:unhush|un-hush|end hush|hush off|stop hush(?:ing)?)[.!]?$/i.test(text)) { this.replyTo.hush.push(channelId); this.link.hush(0); return true; }
    if ((m = /^(?:hush|quiet)(?:\s+(?:for\s+)?(?:(?:an?\s+)?(hour)|(\d{1,3})\s*(m|min|mins|minutes?|h|hr|hrs|hours?)?))?[.!]?$/i.exec(text))) {
      const minutes = m[1] ? 60 : m[2] ? Number(m[2]) * (/^h/i.test(m[3] ?? '') ? 60 : 1) : 60;
      this.replyTo.hush.push(channelId); this.link.hush(minutes); return true;
    }
    // Saving mode from his phone (step Q2). It used to be desktop-only, and it forgot itself at every
    // restart, so at 72% to 88% of his week he could neither keep it on nor turn it back on from here.
    if (/^(?:save|saving)(?: quota| mode)?(?: on)?[.!]?$/i.test(text) || /^(?:turn )?(?:on )?saving(?: mode)?[.!]?$/i.test(text)) {
      this.link.saving(true);
      await this.gw.send(channelId, { content: 'Saving quota from now on: I will stay on Quick and skip background work. Say "saving off" to stop.' });
      return true;
    }
    if (/^(?:saving|save)(?: quota| mode)? off[.!]?$/i.test(text) || /^(?:stop|end) saving(?: quota| mode)?[.!]?$/i.test(text)) {
      this.link.saving(false);
      await this.gw.send(channelId, { content: 'Back to normal. I will use the best model for each job again.' });
      return true;
    }
    if (/^(?:(?:my |the )?(?:morning )?(?:brief|briefing)|what'?s on today|what is on today|(?:my )?agenda(?: today)?)\??[.!]?$/i.test(text)) { this.replyTo.brief.push(channelId); this.link.brief(); return true; }
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

  /**
   * 9.D: a job is its own post in ◎ jobs, tagged Found, Applied or Skipped as it moves, with its card inside. A card for
   * a link he pasted in a post of his own goes into that post. `channelId` '' means "a new post".
   */
  private async postCard(card: Card, channelId: string, silent: boolean): Promise<void> {
    const view = renderCard(card);
    let where = channelId;
    const forum = this.state.channels['jobs'];
    if (!where && forum) {
      where = await this.gw.createPost(forum, `${card.title || 'A job'}${card.company ? ' at ' + card.company : ''}`.slice(0, 100), card.url, [tagFor(card)]);
      this.state.jobPosts = [...(this.state.jobPosts ?? []), where].slice(-500); this.save();
    } else if (where && forum && this.keyOf(where) === null && !this.isJobPost(where)) {
      // a link pasted inside a post he started in ◎ jobs: that post becomes the job
      this.state.jobPosts = [...(this.state.jobPosts ?? []), where].slice(-500); this.save();
      await this.gw.setPostTags(where, [tagFor(card)]).catch(() => {});
    }
    if (!where) return;
    card.channelId = where;
    card.messageId = await this.gw.send(where, { content: view.content, embed: view.embed, buttons: view.buttons, silent, as: 'jobhunt' });
    this.jobs.save();
  }
  private isJobPost(id: string): boolean { return (this.state.jobPosts ?? []).includes(id); }
  private async redrawCard(card: Card): Promise<void> {
    if (!card.channelId || !card.messageId) return;
    const view = renderCard(card);
    try { await this.gw.edit(card.channelId, card.messageId, { content: view.content, embed: view.embed, buttons: view.buttons, as: 'jobhunt' }); } catch { /* the card was deleted */ }
    if (this.isJobPost(card.channelId)) await this.gw.setPostTags(card.channelId, [tagFor(card)]).catch(() => {});
  }

  /** New entries in the sweep's shortlist become cards in #job-digest, once each. */
  async scanShortlist(): Promise<number> {
    const file = this.opts.shortlistFile; const where = this.state.channels['jobs'];
    if (!file || !where) return 0;
    const stamp = fileStamp(file);
    if (!stamp || stamp === this.lastShortlist) return 0;
    this.lastShortlist = stamp;
    const fresh = readShortlist(file).filter(e => !this.jobs.isSeen(e.url));
    for (const e of fresh) {
      // The sweep skill does not score its own picks yet (it is outside this repo); until it does, a shortlisted
      // job gets a fixed "the sweep already screened this" score rather than no score at all.
      const score = e.score ?? SWEEP_SCORE;
      const card = this.jobs.add({ url: e.url, title: e.title, company: e.company, location: e.location, salary: e.salary, score, verdict: verdictFor(score), reason: e.reason || 'On the sweep shortlist.' }, this.now());
      await this.postCard(card, '', true);
    }
    if (fresh.length) await this.say('home', `${fresh.length} new job${fresh.length > 1 ? 's' : ''} from the sweep in ◎ jobs. Approve the ones you want, then tap Apply approved in ▸ aang.`, true);
    return fresh.length;
  }

  /** Everything the job sessions leave behind, checked together. */
  async scanAll(): Promise<void> {
    await this.scanShortlist();
    await this.scanDrafts();
    await this.scanApplied();
  }

  // ---------------------------------------------------------------- answers he must approve

  /** New drafted answers become cards in #drafts, each with Approve and Skip. Nothing is used until he approves it. */
  async scanDrafts(): Promise<number> {
    const file = this.opts.draftsFile; const where = this.state.channels['drafts'];
    if (!file || !where) return 0;
    const stamp = fileStamp(file);
    if (!stamp || stamp === this.lastDrafts) return 0;
    this.lastDrafts = stamp;
    const fresh = readDraftsFile(file).filter(d => !this.drafts.has(d.id));
    for (const d of fresh) {
      const draft = this.drafts.add(d);
      const view = renderDraft(draft);
      draft.channelId = where;
      draft.messageId = await this.gw.send(where, { content: view.content, buttons: view.buttons, silent: true });
      this.drafts.save();
    }
    if (fresh.length) await this.say('drafts', `${fresh.length} answer${fresh.length > 1 ? 's need' : ' needs'} your approval. Nothing goes out in your name until you tap Approve.`, false);
    return fresh.length;
  }

  private async redrawDraft(d: { channelId?: string; messageId?: string } & Parameters<typeof renderDraft>[0]): Promise<void> {
    if (!d.channelId || !d.messageId) return;
    const view = renderDraft(d);
    try { await this.gw.edit(d.channelId, d.messageId, { content: view.content, buttons: view.buttons }); } catch { /* the card was deleted */ }
  }

  /** Only approved wording is ever written where an apply session can read it, and it is rewritten after every change. */
  private exportAnswers(): void {
    if (!this.opts.answersFile) return;
    try { writeFileAtomic(this.opts.answersFile, JSON.stringify(this.drafts.approvedForExport(), null, 2)); } catch (e) { this.log('discord: could not write the approved answers: ' + (e as Error).message); }
  }

  /** A reply to a draft in #drafts is his own wording for it. It needs approving again. */
  private async draftReply(m: Incoming, text: string): Promise<void> {
    const target = m.replyTo ? this.drafts.byMessage(m.replyTo) : null;
    if (!target) { await this.gw.send(m.channelId, { content: 'Reply directly to the draft you want to change, so I know which one it is.' }); return; }
    if (!text) return;
    const d = this.drafts.rewrite(target.id, text);
    if (!d) return;
    this.exportAnswers();
    await this.redrawDraft(d);
    await this.gw.send(m.channelId, { content: 'Changed to your wording. Tap Approve when it reads right.' });
  }

  // ---------------------------------------------------------------- what came of each application

  /** The apply session's own report: submitted (with the confirmation it saw) or stuck (with why). */
  async scanApplied(): Promise<number> {
    const file = this.opts.appliedFile;
    if (!file) return 0;
    const stamp = fileStamp(file);
    if (!stamp || stamp === this.lastApplied) return 0;
    this.lastApplied = stamp;
    let news = 0;
    for (const e of readAppliedFile(file)) {
      const key = `result:${e.url}|${e.status}|${e.note}`;
      if (this.jobs.seen.includes(key)) continue;
      this.jobs.seen.push(key); news++;
      const card = this.jobs.recordResult(e.url, e.status, e.note);
      if (card) await this.redrawCard(card);
      const label = e.title || card?.title || 'A job', at = e.company || card?.company || '';
      const line = `${label}${at ? ' at ' + at : ''}\n${e.url}${e.note ? '\n' + e.note : ''}`;
      const post = card?.channelId && this.isJobPost(card.channelId) ? card.channelId : null;
      if (e.status === 'applied') { if (post) await this.gw.send(post, { content: `Submitted: ${line}`, silent: true, as: 'jobhunt' }); else await this.say('home', `Submitted: ${line}`, true); }
      else {
        if (post) await this.gw.send(post, { content: `Stuck: ${line}`, silent: true, as: 'jobhunt' }); else await this.say('home', `Stuck: ${line}`, true);
        await this.post('needs-you', await this.drawn('needs', { title: `The job hunt is stuck: ${label}${at ? ' at ' + at : ''}`, text: e.note || 'It stopped and needs you.' }, 0xC95E28,
          { content: `Need input on the job hunt: ${label}${at ? ' at ' + at : ''}. ${e.note || 'It stopped and needs you.'}`, silent: false, as: 'jobhunt' }));
      }
    }
    if (news) this.jobs.save();
    return news;
  }

  /** "Apply approved": the approved jobs that fit under today's cap go to a Claude session, and nothing else does. */
  private async applyApproved(channelId: string): Promise<void> {
    if (!this.jobs.approved().length) { await this.gw.send(channelId, { content: 'Nothing is approved yet. Approve jobs in ◎ jobs first.' }); return; }
    const left = this.jobs.left(this.now());
    if (left === 0) { await this.gw.send(channelId, { content: `Today's limit of ${this.jobs.cap(this.now())} is used. Say "cap 8 today" to raise it, up to 8; otherwise these wait for tomorrow.` }); return; }
    const { taken, waiting } = this.jobs.takeForApply(this.now());
    for (const c of taken) await this.redrawCard(c);
    for (const c of taken) if (c.channelId && this.isJobPost(c.channelId)) await this.gw.send(c.channelId, { content: `Sent to apply: ${c.title} at ${c.company}`, silent: true, as: 'jobhunt' }).catch(() => {});
    await this.gw.send(channelId, { content: `Sending ${taken.length} to apply${waiting ? `, ${waiting} more wait for tomorrow or a higher limit` : ''}. Aang will open a Claude session with them; press Enter there to start.` });
    this.ask('apply' + Date.now(), channelId, applyPrompt(taken));
  }

  // ---------------------------------------------------------------- filing: grocery list and recipes, in code, no model

  /** Handle it here if it is a list command or a pasted recipe; otherwise leave it for Aang. */
  private async file(channelId: string, channelName: string, text: string): Promise<boolean> {
    const cmd = parseListCommand(text);
    if (cmd) {
      const said = applyListCommand(this.grocery, cmd);
      await this.refreshList(cmd.op === 'show');
      await this.gw.send(channelId, { content: said });
      return true;
    }
    if (channelName === 'capture' && looksLikeRecipe(text)) { await this.fileRecipe(channelId, text); return true; }
    // Anything else in #capture is a thought to keep, not a question. Written down here, in code, for
    // nothing: it used to fall through to Aang on Smart (step Q3). A question still goes to him, since
    // he would be no use answering it from a file, and so does anything aimed at him by name.
    if (channelName === 'capture' && !text.trimEnd().endsWith('?') && !text.toLowerCase().includes('aang')) {
      const c = capture(text);
      if (c) {
        await this.gw.send(channelId, {
          content: c.countToday > 1 ? `Noted (${c.countToday} today).` : 'Noted.',
          silent: true,
        });
        return true;
      }
      // It could not be written: fall through to Aang rather than lose it.
    }
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
    void this.sendMacBrief();
  }

  // ---------------------------------------------------------------- M4: the Mac answers while this PC is off

  /** What the Mac needs to answer as Aang: who he is, where to listen, Aang's voice and memory, the list. */
  async sendMacBrief(): Promise<void> {
    if (!this.gw.macBrief || !this.link.macBrief || !this.state.ownerId) return;
    try {
      const d = await this.link.macBrief();
      if (!d) return;
      const listen = Object.fromEntries(LISTEN_CHANNELS.map(k => [this.state.channels[k], k] as const).filter(([id]) => !!id));
      await this.gw.macBrief({ ownerId: this.state.ownerId, listen, prompt: d.prompt, facts: d.facts, recent: d.recent, talk: d.talk ?? [], ...(d.morning ? { morning: d.morning } : {}), grocery: this.grocery.s, at: Date.now() });
    } catch (e) { this.log('discord: could not brief the Mac: ' + (e as Error).message); }
  }

  /**
   * What the Mac did while this PC was off, applied once: list changes and notes here, what he said and asked it to
   * remember in memory, and anything it saved for the PC started now, with a line to say so.
   */
  async applyMac(items: import('./macbrain.ts').Handled[]): Promise<void> {
    let listChanged = false;
    for (const h of items) {
      if (h.kind === 'list') { const cmd = parseListCommand(String(h.text)); if (cmd) { applyListCommand(this.grocery, cmd); listChanged = true; } }
      else if (h.kind === 'capture') { try { capture(String(h.text)); } catch { /* the note is still in Discord */ } }
    }
    const forCore = items.filter(h => h.kind === 'turn' || h.kind === 'remember' || h.kind === 'forget');
    if (forCore.length) this.link.macHandled?.(forCore);
    if (listChanged) await this.refreshList().catch(() => {});
    const later = items.filter(h => h.kind === 'later');
    const aang = this.state.channels['aang'];
    if (aang) for (const [i, h] of later.entries()) {
      await this.gw.send(aang, { content: `Your PC is back. Starting what you asked for on the Mac: ${String(h.text).slice(0, 300)}` });
      this.ask(`mac${h.at}-${i}`, aang, String(h.text));
    }
    this.log(`discord: took ${items.length} thing(s) the Mac did while this PC was off`);
  }

  private async fileRecipe(channelId: string, text: string): Promise<void> {
    const forum = this.state.channels['library'];
    if (!forum) { await this.gw.send(channelId, { content: 'There is no ❖ library to file it in.' }); return; }
    const r = parseRecipe(text);
    const parts = chunkMessage(r.body);
    const post = await this.gw.createPost(forum, r.title, parts[0] ?? r.body, ['Recipe']);
    for (const more of parts.slice(1)) await this.gw.send(post, { content: more, silent: true });
    let buttons: Button[] | undefined;
    if (r.ingredients.length >= 2) {
      const key = String(Date.now());
      const all = { ...(this.state.recipes ?? {}), [key]: r.ingredients };
      const keys = Object.keys(all).sort(); while (keys.length > 20) delete all[keys.shift()!];
      this.state.recipes = all; this.save();
      buttons = [{ id: `recipe:add:${key}`, label: `Add ${r.ingredients.length} ingredients to the grocery list`, style: 'primary' }];
    }
    await this.gw.send(channelId, { content: `Filed in ❖ library: ${r.title}.`, ...(buttons ? { buttons } : {}) });
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

  private async say(channel: string, text: string, silent: boolean, session?: string): Promise<void> {
    const id = this.state.channels[channel]; if (!id) return;
    for (const part of chunkMessage(text)) { const m = await this.gw.send(id, { content: part, silent }); if (session) this.sentFor(session, id, m, part); }
  }

  /**
   * 2026-10-29 (his "Discord posts get edited to Seen, not deleted"): the posts about each Claude session, so that once
   * he deals with it (answered at the desk or in Claude, or the Claude app in front showed it to him) each one is
   * edited to say so instead of waiting on his phone as if it were still news. Kept in memory only: a restart forgets.
   */
  private readonly bySession = new Map<string, { c: string; m: string; text: string }[]>();
  private sentFor(session: string, c: string, m: string | null | undefined, text: string): void {
    if (!m || !session) return;
    const list = this.bySession.get(session) ?? [];
    list.push({ c, m, text: text.slice(0, 1800) });
    this.bySession.delete(session); this.bySession.set(session, list.slice(-6));
    while (this.bySession.size > 40) this.bySession.delete(this.bySession.keys().next().value as string);
  }
  private async seen(sessions: string[]): Promise<void> {
    for (const s of sessions) {
      const list = this.bySession.get(s); if (!list) continue;
      this.bySession.delete(s);
      for (const p of list) await this.gw.edit(p.c, p.m, { content: `✓ Seen · ${p.text}`.slice(0, 1900), buttons: [] }).catch(() => { /* deleted */ });
    }
  }

  /**
   * A Claude Code job's own update: one message (these stay short, so never chunked), with a picture of what it is
   * doing when Aang has one. Remembered by the job's folder, so a reply in Discord (any reply to this exact message)
   * is told to that job rather than treated as ordinary chat.
   */
  private async postJob(cwd: string, channel: string, text: string, silent: boolean, image?: { data: string; mimeType: string }): Promise<void> {
    const channelId = this.state.channels[channel]; if (!channelId) return;
    const files = image ? [{ name: 'screen.jpg', data: Buffer.from(image.data, 'base64') }] : undefined;
    const id = await this.gw.send(channelId, { content: text.slice(0, 1900), silent, as: 'claude', ...(files ? { files } : {}) });
    this.state.jobs = { ...(this.state.jobs ?? {}), [cwd]: { c: channelId, m: id } };
    const keys = Object.keys(this.state.jobs);
    for (const k of keys.slice(0, Math.max(0, keys.length - 40))) delete this.state.jobs[k];
    this.save();
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
        const channel = kind === 'needs' || (kind === 'asked' && /^Need input/i.test(ev.text)) ? 'needs-you' : 'aang';
        // The morning brief, drawn (sheet 21 board 1).
        if (ev.brief && typeof ev.brief === 'object' && this.state.channels['aang']) { await this.briefPost(this.state.channels['aang'], ev.text, ev.brief, !loud); return; }
        if (typeof ev.jobCwd === 'string' && ev.jobCwd) {
          if (this.state.channels['claude-jobs']) { await this.claudeNews(ev, channel === 'needs-you' || ev.blocking === true); return; }
          await this.postJob(ev.jobCwd, channel, ev.text, !loud, ev.image); return;
        }
        // E7: a reminder with a link (Join, Open in Waze) gets it as a button too.
        if (Array.isArray(ev.links) && ev.links.length && this.state.channels[channel]) {
          const buttons: Button[] = ev.links.filter((l: any) => typeof l?.url === 'string' && /^https:\/\//.test(l.url)).slice(0, 4).map((l: any, i: number) => ({ id: `link:${i}`, label: String(l.label ?? 'Open').slice(0, 40), style: 'success' as const, url: l.url }));
          const m = await this.gw.send(this.state.channels[channel]!, { content: ev.text.slice(0, 1900), ...(loud ? {} : { silent: true }), buttons });
          if (typeof ev.session === 'string') this.sentFor(ev.session, this.state.channels[channel]!, m, ev.text);
          return;
        }
        await this.say(channel, ev.text, !loud, typeof ev.session === 'string' ? ev.session : undefined);
      }
      return;
    }
    if (ev?.t === 'claude.seen' && Array.isArray(ev.sessions)) { await this.seen(ev.sessions.filter((x: unknown): x is string => typeof x === 'string')); return; }
    if (ev?.t === 'gaming.post') { await this.gamingPost(ev); return; }
    if (ev?.t === 'action' && typeof ev.text === 'string') { await this.say('home', ev.text, true); return; }
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
    // Sheet 21: the drawn card that goes with his question (his email, his week), in the channel he asked in.
    if (ev?.t === 'card.show' && typeof ev.id === 'string' && (ev.kind === 'inbox' || ev.kind === 'week')) {
      const p = this.pending.get(ev.id);
      if (!p) return;
      const msg = await this.drawn(ev.kind, ev.data ?? {}, 0xFFC43C, { content: '' });
      if (msg.files?.length) await this.gw.send(p.channelId, msg);
      return;
    }
    if (ev?.t === 'links.show' && typeof ev.id === 'string' && Array.isArray(ev.links)) {
      const p = this.pending.get(ev.id);
      if (!p) return;
      const buttons: Button[] = ev.links.filter((l: any) => typeof l?.url === 'string' && /^https:\/\//.test(l.url) && typeof l?.label === 'string').slice(0, 4)
        .map((l: any, i: number) => ({ id: `link:${i}`, label: String(l.label).slice(0, 40), style: 'secondary' as const, url: l.url }));
      if (buttons.length) await this.gw.send(p.channelId, { content: '', buttons, silent: true });
      return;
    }
    // E3 (sheet 21 board 2): one email, gone through, with a button for each thing Aang can do with it.
    if (ev?.t === 'card.show' && typeof ev.id === 'string' && ev.kind === 'email' && typeof ev.email === 'string' && /^[\w-]{1,80}$/.test(ev.email)) {
      const p = this.pending.get(ev.id);
      if (!p) return;
      const label: Record<string, string> = { book: 'Book it', drive: 'Drive time', transcripts: 'Transcripts', prep: 'Prep', reply: 'Reply', files: 'Files' };
      const acts = (Array.isArray(ev.acts) ? ev.acts : []).filter((a: unknown): a is string => typeof a === 'string' && a in label);
      const buttons: Button[] = acts.map((a: string) => ({ id: `em:${a}:${ev.email}`, label: label[a]!, style: a === 'book' ? 'success' as const : a === 'prep' ? 'primary' as const : 'secondary' as const }));
      if (typeof ev.join === 'string' && /^https:\/\//.test(ev.join)) buttons.unshift({ id: 'em:join', label: 'Join call', style: 'success', url: ev.join });
      const d = ev.data ?? {};
      const msg = await this.drawn('email', d, 0xFFC43C, { content: `${String(d.from ?? '')}: ${String(d.subject ?? '')}`.slice(0, 300), buttons });
      await this.gw.send(p.channelId, msg);
      return;
    }
    if (ev?.t === 'brief.reply' && typeof ev.text === 'string') {
      const channelId = this.replyTo.brief.shift() ?? this.state.channels['aang'];
      if (!channelId) return;
      if (ev.card && typeof ev.card === 'object') { await this.briefPost(channelId, ev.text, ev.card, false); return; }
      await this.gw.send(channelId, { content: ev.text.slice(0, 1900) });
      return;
    }
    if (ev?.t === 'mail.card' && typeof ev.id === 'string' && typeof ev.content === 'string') { await this.mailCard(ev.id, ev.content, Array.isArray(ev.buttons) ? ev.buttons : []); return; }
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
    if (ev?.t === 'mac.run.reply') {
      const channelId = this.macRunFor.shift() ?? this.state.channels['aang'];
      if (!channelId) return;
      if (ev.ok) await this.gw.send(channelId, { content: 'Starting the job hunt on your MacBook.' });
      else { await this.gw.send(channelId, { content: 'Your MacBook is not reachable right now - running the job hunt here instead.' }); this.ask('deck' + ++this.deckSeq, channelId, JOB_REQUEST); }
      return;
    }
    if (ev?.t === 'job.card' && typeof ev.url === 'string') {
      // A job found outside ◎ jobs (an email, a link pasted in chat) - scored, then the same kind of card, its own post.
      const where = this.state.channels['jobs'];
      if (where && !this.jobs.isSeen(ev.url)) {
        const card = this.jobs.add({ url: ev.url, title: String(ev.title ?? ''), company: String(ev.company ?? ''), location: String(ev.location ?? ''), salary: String(ev.salary ?? ''), score: Number(ev.score) || 0, verdict: ev.verdict === 'apply' || ev.verdict === 'skip' ? ev.verdict : 'maybe', reason: String(ev.reason ?? '') }, this.now());
        await this.postCard(card, '', false);
      }
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
      // C1 (sheet 21): the quota ask, drawn, with Go ahead / Not now. Asked every time; there is no "always".
      if (ev.quota && typeof ev.quota === 'object') {
        const qd = ev.quota;
        const msg = await this.drawn('quota', { what: String(qd.what ?? '').slice(0, 120), low: Number(qd.low) || 0, high: Number(qd.high) || 0, week: typeof qd.week === 'number' ? qd.week : null, resetsAt: Number(qd.resetsAt) || 0 }, 0xC95E28, {
          content: `Can I ${ev.question}?`,
          buttons: [{ id: `perm:${ev.id}:yes`, label: 'Go ahead', style: 'success' }, { id: `perm:${ev.id}:no`, label: 'Not now', style: 'secondary' }],
        });
        await this.gw.send(channelId, msg);
        return;
      }
      const sub = ' Yes is for this once.';
      // E5: what he is saying yes to, all of it (a booking's day, time, source, place, who is told, clashes, doubts).
      const means = typeof ev.means === 'string' && ev.means.trim() ? `\n${ev.means.trim().slice(0, 1500)}` : '';
      await this.gw.send(channelId, {
        content: `Can I ${ev.question}?${sub}${means}`.slice(0, 1990),
        buttons: [{ id: `perm:${ev.id}:yes`, label: 'Yes', style: 'success' }, { id: `perm:${ev.id}:no`, label: 'No', style: 'danger' }],
      });
    }
  }

  /**
   * Sheet 21 board 1 (his order, 2026-10-13): job hunt first, then what is waiting on him, then today, then the other
   * email WITH its subject. Built only from the brief's own fields; every word goes onto the card as text.
   */
  private async briefPost(channelId: string, text: string, b: any, silent: boolean): Promise<void> {
    const { data, waiting } = briefCardData(b ?? {});
    const msg = await this.drawn('brief', data, 0xFFC43C, {
      content: text.slice(0, 1900), silent,
      ...(waiting ? { buttons: [{ id: 'home:waiting', label: "What's waiting", style: 'primary' as const }] } : {}),
    });
    await this.gw.send(channelId, msg);
  }

  /** An email draft card: the first time it goes to #drafts, every later change edits that same message. */
  private async mailCard(id: string, content: string, buttons: Button[]): Promise<void> {
    const at = this.state.mail?.[id];
    if (at) { try { await this.gw.edit(at.c, at.m, { content, buttons }); return; } catch { /* the card was deleted: post it again */ } }
    const where = this.state.channels['drafts']; if (!where) return;
    const m = await this.gw.send(where, { content, buttons });
    this.state.mail = { ...(this.state.mail ?? {}), [id]: { c: where, m } };
    const ids = Object.keys(this.state.mail); for (const k of ids.slice(0, Math.max(0, ids.length - 60))) delete this.state.mail[k];
    this.save();
  }

  /** Channels waiting for a status answer, in the order they asked. */
  private readonly statusFor: string[] = [];
  private readonly macRunFor: string[] = [];
  private deckSeq = 0;

  private async press(b: ButtonPress): Promise<void> {
    if (b.userId !== this.state.ownerId) { await b.ack('That is not yours to answer.'); return; }
    const gm = /^gm:(watch|later):([\w-]{6,20})$/.exec(b.customId);
    if (gm) {
      const url = `https://www.youtube.com/watch?v=${gm[2]}`;
      if (gm[1] === 'watch') { this.link.putOn?.(url); await b.ack('Putting it on, on your PC.'); return; }
      const lib = this.state.channels['library'];
      if (lib) await this.gw.createPost(lib, 'Watch later', url, ['Video']);
      await b.ack(lib ? 'Saved for later in 📚 library.' : 'Saved.');
      return;
    }
    const vb = /^vid:(plan|save|deep|go|no|bin):([\w-]+)$/.exec(b.customId);
    if (vb) {
      const v = this.state.videos?.[vb[2]!];
      if (!v) { await b.ack('That video is no longer on the list.'); return; }
      if (vb[1] === 'plan') { this.link.addIdea?.(`${v.title} (${v.kind}): ${v.shows} ${v.url}`); await b.ack("Added to Aang's plan as an idea for you to approve. Nothing gets built on its own."); return; }
      if (vb[1] === 'save') {
        const lib = this.state.channels['library'];
        if (lib) await this.gw.createPost(lib, v.title, `${v.kind}. ${v.shows}\n${v.url}`, ['Video']);
        await b.ack(lib ? 'Saved to 📚 library.' : 'There is no library to save it in.');
        return;
      }
      if (vb[1] === 'deep') {
        await b.keep();
        await this.gw.send(b.channelId, { content: 'Going deeper uses Claude (Smart): about as much as one long chat, a small part of your week. Go?', buttons: [{ id: `vid:go:${vb[2]}`, label: 'Yes, go deeper', style: 'primary' }, { id: `vid:no:${vb[2]}`, label: 'No', style: 'secondary' }], silent: true });
        return;
      }
      if (vb[1] === 'go') { await b.ack('Going deeper.'); this.ask('vd' + Date.now(), v.thread, `Go deeper on this video for me: ${v.url} ("${v.title}"). Use watch_video to read it, then tell me what is worth knowing or using.`, { mode: 'smart' }); return; }
      if (vb[1] === 'no') { await b.ack('Okay, left as it is.'); return; }
      delete this.state.videos![vb[2]!]; this.save();
      await b.ack('Binned. Nothing kept.');
      return;
    }
    if (b.customId === 'home:waiting') {
      const d = await this.link.homeData?.() ?? null;
      await b.keep();
      await this.gw.send(b.channelId, { content: !d ? 'I could not ask the PC just now.' : d.waiting.length ? 'Waiting on you:\n' + d.waiting.map(w => '- ' + w).join('\n') : 'Nothing is waiting on you.', silent: true });
      return;
    }
    // E3: a button on an email's card is asked of Aang in words, as if he typed it; its own tools then ask him as usual.
    const em = /^em:(book|drive|transcripts|prep|reply|files):([\w-]{1,80})$/.exec(b.customId);
    if (em) { await b.keep(); this.ask(`em${Date.now()}`, b.channelId, promptFor(em[1] as EmailAct, em[2]!), { mode: 'smart' }); return; }
    if (b.customId === 'home:away') { await b.keep(); this.link.stepAway?.(); await this.gw.send(b.channelId, { content: 'Okay. Everything comes here until you are back at the PC.', silent: true }); return; }
    if (b.customId === 'home:puton') { await b.keep(); this.state.putOnNext = true; this.save(); await this.post('aang', { content: 'What should I put on? Tell me here.' }); return; }
    const cj = /^cj:open:([\w-]+)$/.exec(b.customId);
    if (cj) {
      const cwd = Object.keys(this.state.claudePosts ?? {}).find(c => this.claudeKey(c) === cj[1]);
      if (!cwd) { await b.ack('That job is no longer on the list.'); return; }
      this.link.openClaude?.(cwd);
      await b.keep();
      return;
    }
    if (b.customId === 'old:keep') { await b.ack('Kept. Say "delete the old channels" whenever you want them gone.'); return; }
    if (b.customId === 'old:delete') {
      // Deleting cannot be undone, so it is asked twice.
      await b.ack('Sure? This cannot be undone.');
      await this.gw.send(b.channelId, { content: `Delete ${(this.state.old ?? []).map(o => '#' + o.name).join(', ')} for good? Everything in them is already in the new forums.`, buttons: [{ id: 'old:delete2', label: 'Yes, delete them', style: 'danger' }, { id: 'old:keep', label: 'Keep them', style: 'secondary' }] });
      return;
    }
    if (b.customId === 'old:delete2') { await b.keep(); await b.ack(await this.deleteOld()); return; }
    if (b.customId.startsWith('deck:')) {
      await b.keep();
      if (b.customId === 'deck:status') { this.statusFor.push(b.channelId); this.link.status(); }
      // The job hunt, on the MacBook's own Claude app by default (2026-09-22); the reply falls back to running
      // it here if the Mac cannot be reached (mac.run.reply, above).
      else if (b.customId === 'deck:job') { this.macRunFor.push(b.channelId); this.link.runOnMac(JOB_REQUEST); }
      else if (b.customId === 'deck:apply') await this.applyApproved(b.channelId);
      else if (b.customId === 'deck:hush') { this.replyTo.hush.push(b.channelId); this.link.hush(60); }
      else if (b.customId === 'deck:log') { this.replyTo.actions.push(b.channelId); this.link.actions(); }
      else if (b.customId === 'deck:perms') { this.trustCard = null; this.replyTo.trust.push(b.channelId); this.link.trust(); }
      else if (b.customId === 'deck:stop') { this.link.stop(); await this.gw.send(b.channelId, { content: 'Stopped.' }); }
      return;
    }
    const ml = /^mail:(send|save|discard):([a-f0-9]+):([a-f0-9]+)$/.exec(b.customId);
    if (ml) {
      await b.keep();
      // The card is remembered by where it is, in case the press came from a card posted before a restart.
      if (b.messageId && !this.state.mail?.[ml[2]!]) { this.state.mail = { ...(this.state.mail ?? {}), [ml[2]!]: { c: b.channelId, m: b.messageId } }; this.save(); }
      this.link.mailAct(ml[2]!, ml[3]!, ml[1] as 'send' | 'save' | 'discard');
      return;
    }
    const dr = /^draft:(ok|no|new):([a-z0-9]+)$/.exec(b.customId);
    if (dr) {
      await b.keep();
      const d = this.drafts.setStatus(dr[2]!, dr[1] === 'ok' ? 'approved' : dr[1] === 'no' ? 'skipped' : 'new');
      if (d) { this.exportAnswers(); await this.redrawDraft(d); }
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

/** 9.D: the jobs forum tag for where a job is. */
function tagFor(card: Card): string { return card.status === 'applied' ? 'Applied' : card.status === 'skipped' ? 'Skipped' : 'Found'; }
