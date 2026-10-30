// Sheet 106 v7 (his yes, 2026-10-30; sheet 92 option B, "Item get"): every notice and every ask Samara has is one
// notice built from Claude's plan card's own tray pieces, dropping from whatever caused it. This is the queue that
// decides which one shows: one at a time with a count, the small ones drain by themselves after 4 s (and wait while his
// mouse is on them), the big ones stay until a button, and only "needs you" plays the sound. No Electron in here.

/** Teal done, blue needs you, red went wrong. */
export type NoticeKind = 'done' | 'need' | 'bad';
/** What it drops from: the download key, the shield, the ... menu, the address bar, the tab list, Claude's rune. */
export type NoticeFrom = 'dl' | 'shield' | 'menu' | 'slot' | 'tabs' | 'rune';
export const NOTICE_KINDS: readonly NoticeKind[] = ['done', 'need', 'bad'];
export const NOTICE_FROM: readonly NoticeFrom[] = ['dl', 'shield', 'menu', 'slot', 'tabs', 'rune'];

/** A button on the notice: what it says and what it does (the first plain one is gold unless `plain`). */
export interface NoticeKey { label: string; act: string; plain?: boolean }
/** A download tray row: the badge, the name, size · site · time. Dragged out by the row. */
export interface NoticeFile { id: number; kind: string; name: string; meta: string }
/** A device a site asked for (sheet 69): one is picked before Allow. */
export interface NoticePick { id: string; name: string; how: string }

export interface NoticeIn {
  kind: NoticeKind;
  from: NoticeFrom;
  /** Small news: the header strip only, drains in 4 s. */
  small?: boolean;
  /** The gold line over the title ("DOWNLOADED") and the title itself ("Ready"). */
  kick: string;
  title: string;
  /** The gem's picture (a pixicons name); Claude's notices always show its orange spark on a white gem. */
  icon?: string;
  claude?: boolean;
  /** The parchment: labelled lines, download rows, devices to pick, or the TV's six-letter code. */
  rows?: { g: string; v: string }[];
  files?: NoticeFile[];
  picks?: NoticePick[];
  picked?: string | null;
  code?: boolean;
  /** Said under the code boxes when the code was wrong (they shake). */
  err?: string;
  keys?: NoticeKey[];
  /** Notices with the same group join into the one waiting (several downloads make one notice). */
  group?: string;
}
export interface Notice extends NoticeIn { id: number }
/** What the layer is told to draw. */
export interface NoticeShown {
  notice: Notice;
  /** "2 of 3": `at` is this one's place since the queue was last empty, `of` everything finished, showing and waiting. */
  at: number;
  of: number;
  /** A new notice (it drops) or the same one changed in place (it does not). */
  fresh: boolean;
  /** The one sound: only when a "needs you" first shows. */
  sound: boolean;
}
/** Told his answer: the button's act (or DRAINED), its value (the TV code, the device), and the notice as it was. */
export type NoticeOn = (act: string, value: string | undefined, n: Notice) => void;
export interface NoticeTimers { set(f: () => void, ms: number): unknown; clear(h: unknown): void; now(): number }
const realTimers: NoticeTimers = { set: (f, ms) => setTimeout(f, ms), clear: (h) => clearTimeout(h as NodeJS.Timeout), now: () => Date.now() };

export const DRAIN_MS = 4000;
/** What a small one is answered with when it drains by itself. */
export const DRAINED = 'drained';

export class NoticeQueue {
  private list: { n: Notice; on?: NoticeOn }[] = [];
  private seq = 0;
  /** Finished since the queue was last empty, for the count. */
  private seen = 0;
  private drainT: unknown = null;
  private drainLeft = DRAIN_MS;
  private drainFrom = 0;
  private hovered = false;
  private readonly t: NoticeTimers;
  private readonly show: (s: NoticeShown | null) => void;
  constructor(show: (s: NoticeShown | null) => void, timers: NoticeTimers = realTimers) { this.show = show; this.t = timers; }

  /** The one showing now. */
  get current(): Notice | null { return this.list[0]?.n ?? null; }
  /** Everything showing or waiting, in order. */
  get all(): Notice[] { return this.list.map((x) => x.n); }

  /** A new notice, at the back. Its answer (a button's act, or DRAINED) goes to `on`. Returns its number. */
  push(n: NoticeIn, on?: NoticeOn): number {
    const id = ++this.seq;
    this.list.push({ n: { ...n, id }, on });
    if (this.list.length === 1) this.present(true);
    else this.present(false);             // the count on the one showing goes up
    return id;
  }
  /** The waiting or showing notice of this group (several downloads join one), if any. */
  group(g: string): Notice | null { return this.list.find((x) => x.n.group === g)?.n ?? null; }
  /** Change a notice in place (a file joined it, the code was wrong). The one showing is redrawn without dropping again. */
  update(id: number, patch: Partial<NoticeIn>): void {
    const x = this.list.find((y) => y.n.id === id);
    if (!x) return;
    x.n = { ...x.n, ...patch, id };
    if (this.list[0] === x) this.present(false);
  }
  /** He pressed a button (or a small one drained): it goes, its owner hears, the next one drops. */
  answer(id: number, act: string, value?: string): boolean {
    const i = this.list.findIndex((y) => y.n.id === id);
    if (i < 0) return false;
    const [x] = this.list.splice(i, 1);
    this.after(i === 0);
    try { x.on?.(act, value, x.n); } catch (e) { console.error('shell: a notice answer failed: ' + (e as Error).message); }
    return true;
  }
  /** Gone without an answer (an ask that timed out, the TV moved on): nobody is told. */
  drop(id: number): void {
    const i = this.list.findIndex((y) => y.n.id === id);
    if (i < 0) return;
    this.list.splice(i, 1);
    this.after(i === 0);
  }
  /** His mouse is on the notice (a small one waits) or left it (it carries on from where it was). */
  hover(on: boolean): void {
    if (on === this.hovered) return;
    this.hovered = on;
    const c = this.current;
    if (!c?.small) return;
    if (on) { if (this.drainT !== null) { this.t.clear(this.drainT); this.drainT = null; this.drainLeft = Math.max(0, this.drainLeft - (this.t.now() - this.drainFrom)); } }
    else this.drainStart();
  }
  /** Everything put away (the window closed). */
  clear(): void { this.list = []; this.seen = 0; this.stopDrain(); this.show(null); }

  private after(wasShowing: boolean): void {
    if (wasShowing) {
      this.seen++;
      if (!this.list.length) { this.seen = 0; this.stopDrain(); this.show(null); return; }
      this.present(true);
    } else this.present(false);
  }
  private present(fresh: boolean): void {
    const c = this.current;
    if (!c) return;
    if (fresh) { this.stopDrain(); this.hovered = false; this.drainLeft = DRAIN_MS; if (c.small) this.drainStart(); }
    this.show({ notice: c, at: this.seen + 1, of: this.seen + this.list.length, fresh, sound: fresh && c.kind === 'need' });
  }
  private drainStart(): void {
    const c = this.current;
    if (!c?.small || this.hovered || this.drainT !== null) return;
    this.drainFrom = this.t.now();
    this.drainT = this.t.set(() => { this.drainT = null; if (this.current?.id === c.id) this.answer(c.id, DRAINED); }, this.drainLeft);
  }
  private stopDrain(): void { if (this.drainT !== null) this.t.clear(this.drainT); this.drainT = null; }
}

/** Plain words only, never a website's markup; long ones cut. */
const str = (x: unknown, n: number): string => (typeof x === 'string' ? x : x == null ? '' : String(x)).replace(/[\u0000-\u001f]/g, ' ').slice(0, n);
/** Checked before it leaves for the layer: kinds from the fixed few, words cut to size, at most a few of each. */
export function cleanNotice(n: NoticeIn): NoticeIn {
  return {
    kind: NOTICE_KINDS.includes(n.kind) ? n.kind : 'done',
    from: NOTICE_FROM.includes(n.from) ? n.from : 'menu',
    small: n.small === true,
    kick: str(n.kick, 40).toUpperCase(),
    title: str(n.title, 80),
    ...(n.icon ? { icon: str(n.icon, 20) } : {}),
    ...(n.claude ? { claude: true } : {}),
    ...(n.rows?.length ? { rows: n.rows.slice(0, 4).map((r) => ({ g: str(r.g, 30), v: str(r.v, 300) })) } : {}),
    ...(n.files?.length ? { files: n.files.slice(0, 6).map((f) => ({ id: Number(f.id) | 0, kind: str(f.kind, 6), name: str(f.name, 200), meta: str(f.meta, 120) })) } : {}),
    ...(n.picks ? { picks: n.picks.slice(0, 8).map((p) => ({ id: str(p.id, 100), name: str(p.name, 100), how: str(p.how, 100) })), picked: n.picked ? str(n.picked, 100) : null } : {}),
    ...(n.code ? { code: true } : {}),
    ...(n.err ? { err: str(n.err, 200) } : {}),
    ...(n.keys?.length ? { keys: n.keys.slice(0, 3).map((k) => ({ label: str(k.label, 40), act: str(k.act, 40), ...(k.plain ? { plain: true } : {}) })) } : {}),
    ...(n.group ? { group: str(n.group, 20) } : {}),
  };
}

/**
 * A line said the old way (one sentence), as a notice: short ones are small news, long ones big with the words on the
 * parchment and a Got it. The lines Samara has were each sorted on sheet 106's table and say their own kind and place;
 * this is only for a line nobody sorted yet.
 */
export function plainNotice(text: string, o: Partial<NoticeIn> = {}): NoticeIn {
  const t = str(text, 300).trim();
  const kind = o.kind ?? 'done';
  if (t.length <= 44 && !o.rows) return { kind, from: 'menu', small: true, kick: 'SAMARA', title: t.replace(/\.$/, ''), ...o };
  return { kind, from: 'menu', kick: 'SAMARA', title: kind === 'bad' ? 'Went wrong' : kind === 'need' ? 'Needs you' : 'Done', rows: [{ g: '', v: t }], keys: [{ label: kind === 'bad' ? 'Close' : 'Got it', act: 'ok' }], ...o };
}
