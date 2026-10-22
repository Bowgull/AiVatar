// Pop-outs on Samara's taskbar (sheet 66, option A, his picks 2026-10-22; docs/TASKBAR-POPOUTS-RESEARCH.md "DECIDED").
//
// Every window-family member (the video, Claude jobs, the mini player, notes, timers, pinned snips) wears Samara's app id
// ('Aang.Samara'), so Windows puts it under Samara's lantern button: hover the lantern and each LOOSE pop-out is its own
// picture, named ("Waymark · 50%", "Flask · 6:52", the song), with its own thumbnail buttons. A SNAPPED GROUP is ONE
// picture of the whole group, named "Video + Job + Player": its members leave the taskbar while joined and a stand-in
// window of the edge helper's (winedge.ts TASKBAR_HELPER_CS: DWM only takes an iconic picture from the window's own
// process) shows the group, composed here from the members' own captures. Clicking it brings the whole group forward;
// it carries the player's buttons when the player is in it. Leaving the group, each member gets its own picture back.
// A running Claude job draws its % as the bar under the lantern (on Samara's window; amber when paused or stalled).
// The right-click list's Pop-outs section (jumplist.ts) comes here through runTask.
//
// The family is not changed for this: its add/remove are wrapped (wireTaskbar), and groups are read with groupOf/boxOf.
// The windows that never take the keyboard (WS_EX_NOACTIVATE: jobs, timers, the player, snips) would stay off the
// taskbar whatever Electron says, so the helper gives them WS_EX_APPWINDOW first (askHelper 'A').
import { BrowserWindow, nativeImage, screen } from 'electron';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { askHelper, askProxy, onHelperEvent } from './winedge.ts';
import * as P from './taskbarplan.ts';
import { BUTTON_GLYPHS, TASK_GLYPH, glyphBitmap, icoFromPngs } from './taskbaricons.ts';
import type { MemberWin } from './familywin.ts';

/** Samara's lantern: the button's icon, and each pop-out's own (the video keeps its turquoise lantern). */
export const LANTERN = path.join(import.meta.dirname, '..', 'pages', 'art', 'samara', 'samara-open.ico');
const WS_EX_APPWINDOW = 0x40000;
/** The biggest live preview (peek) picture sent, in pixels. */
const PEEK_MAX = 2560 * 1600;

/** What the taskbar needs of the family (FamilyHost has all of it). */
export interface FamilyLike {
  add(m: MemberWin): void;
  remove(id: string): void;
  groupOf(id: string): string[];
  boxOf(id: string): P.Box | null;
  drag(id: string, phase: string, dx?: number, dy?: number): boolean;
  readonly busy: boolean;
}

export interface TaskbarDeps {
  /** Samara's window (the job bar goes on it), or null when Samara is closed. */
  samara: () => BrowserWindow | null;
  /** A member's name in the hover row and the state its buttons show. */
  info: (id: string, kind: string) => { label: string; state: P.MemberState };
  /** A thumbnail button pressed on member `id`. */
  act: (id: string, kind: string, button: number) => void;
  /** The brain's claude.jobs as last sent. */
  jobs: () => unknown;
  /** Aang on the screen (Gather them by Aang), or null. */
  aang: () => P.Box | null;
  /** New note, Timer, Music player from the right-click list. */
  open: { note: () => void; timer: () => void; player: () => void };
  log?: (s: string) => void;
}

interface Tracked {
  id: string; kind: string; w: BrowserWindow;
  /** The helper's answer about WS_EX_APPWINDOW: asked, yes, or it could not (then Electron's own AddTab is still tried). */
  styled: 'asking' | 'yes' | 'failed';
  /** On the taskbar as last set (null: not set yet, or Windows forgot it on a hide/show). */
  on: boolean | null;
  title: string; btns: string; clip: string;
}
interface Proxy { pid: number; lead: string; ids: string[]; owner: string; label: string; btns: string; place: string; sig: string; asked: number; inval: number; made: Promise<string> }

/** The job bar under Samara's lantern: off by his call (2026-10-22). */
const TASKBAR_BAR = false;

export class TaskbarPops {
  readonly members = new Map<string, Tracked>();
  /** One stand-in per snapped group, by the group's lead. */
  readonly proxies = new Map<string, Proxy>();
  /** The helper's answers, for the offscreen check and the log. */
  readonly answers: string[] = [];
  private nextPid = 1;
  private soon: NodeJS.Timeout | null = null;
  private readonly tick: NodeJS.Timeout;
  private bar: { target: BrowserWindow | null; key: string; kind?: string; at?: number } = { target: null, key: '' };
  private iconsSent = false;
  private readonly imgs = new Map<string, Electron.NativeImage>();
  private readonly off: () => void;
  private readonly host: FamilyLike;
  private readonly d: TaskbarDeps;
  /** For tests: the work area Gather keeps the group in (default: the screen's nearest Aang). */
  areaFor: (p: { x: number; y: number }) => P.Box = (p) => screen.getDisplayNearestPoint(p).workArea;

  constructor(host: FamilyLike, d: TaskbarDeps) {
    this.host = host; this.d = d;
    this.off = onHelperEvent((id, what, nums) => this.heard(id, what, nums));
    // Names tick (a timer's time, a job's %), the bar follows the jobs: once a second, cheap when nothing changed.
    this.tick = setInterval(() => this.reconcile(), 1000);
    this.tick.unref();
  }

  private note(s: string): void { this.answers.push(s); if (this.answers.length > 200) this.answers.shift(); this.d.log?.(s); }
  private schedule(): void { if (this.soon) return; this.soon = setTimeout(() => { this.soon = null; this.reconcile(); }, 60); }

  // ---------------------------------------------------------------- members

  /** A family member arrived (wireTaskbar wraps FamilyHost.add). */
  track(m: MemberWin): void {
    const w = m.win();
    if (!w || w.isDestroyed()) return;
    const had = this.members.get(m.id);
    if (had && had.w === w) return;
    const t: Tracked = { id: m.id, kind: String(m.kind), w, styled: 'asking', on: null, title: '', btns: '', clip: '' };
    this.members.set(m.id, t);
    // Samara's app id: under the lantern. The video keeps its own turquoise lantern as its window icon (popout.ts).
    try { if (t.kind !== 'video') w.setIcon(LANTERN); } catch { /* the default icon */ }
    try { w.setAppDetails({ appId: 'Aang.Samara', appIconPath: LANTERN, appIconIndex: 0, relaunchDisplayName: 'Samara' }); } catch { /* not Windows */ }
    // Its name in the hover row is ours ("Flask · 6:52"), not whatever its page calls itself.
    w.on('page-title-updated', (e) => e.preventDefault());
    w.once('closed', () => { if (this.members.get(m.id)?.w === w) this.untrack(m.id); });
    // Windows makes a new button when a window shows again: whether it should be there is set again.
    for (const ev of ['show', 'hide', 'minimize', 'restore'] as const) w.on(ev as 'show', () => { t.on = null; t.btns = ''; this.schedule(); });
    void askHelper('A', w, true).then((r) => {
      t.styled = /^\d+$/.test(r) && (Number(r) & WS_EX_APPWINDOW) ? 'yes' : 'failed';
      this.note(`${m.id} appwindow ${r}`);
      this.schedule();
    });
    this.schedule();
  }

  untrack(id: string): void {
    if (!this.members.delete(id)) return;
    this.schedule();
  }

  private kindOf = (id: string) => this.members.get(id)?.kind ?? '';
  private live(t: Tracked | undefined): t is Tracked { return !!t && !t.w.isDestroyed(); }

  // ---------------------------------------------------------------- what goes where

  /** The plan as it stands (also what the offscreen check reads). */
  plan(): P.Plan {
    const seen: P.Seen[] = [];
    for (const [id, t] of [...this.members]) {
      if (!this.live(t)) { this.members.delete(id); continue; }
      let g: string[] = [];
      try { g = this.host.groupOf(id).filter((x) => this.members.has(x)); } catch { /* not in the family any more */ }
      seen.push({ id, kind: t.kind, visible: t.w.isVisible() && !t.w.isMinimized(), group: g });
    }
    return P.planTaskbar(seen);
  }

  reconcile(): void {
    try { this.reconcileNow(); } catch (e) { this.note('taskbar: ' + (e as Error).message); }
  }

  private reconcileNow(): void {
    if (process.platform !== 'win32') return;
    const plan = this.plan();
    for (const id of plan.loose) this.loose(this.members.get(id)!);
    for (const g of plan.groups) for (const id of g.ids) this.setOn(this.members.get(id)!, false);
    // The stand-ins: one per group (by its lead), gone with the group.
    const want = new Map(plan.groups.map((g) => [g.lead, g]));
    for (const [lead, p] of [...this.proxies]) if (!want.has(lead)) { this.proxies.delete(lead); void p.made.then(() => askProxy('G', p.pid, [0])); }
    for (const g of plan.groups) this.group(g);
    this.updateBar(plan);
  }

  private setOn(t: Tracked, on: boolean): void {
    if (t.on === on || t.w.isDestroyed()) return;
    // Waiting for the helper's WS_EX_APPWINDOW: added before that, Windows would drop the button on the next show.
    if (on && t.styled === 'asking') return;
    try { t.w.setSkipTaskbar(!on); t.on = on; } catch { return; }
    if (!on) t.btns = '';
  }

  /** A loose pop-out: its own picture, name, buttons, and only its panel in the picture (not the see-through room round it). */
  private loose(t: Tracked): void {
    this.setOn(t, true);
    if (t.on !== true) return;
    const w = t.w;
    const { label, state } = this.d.info(t.id, t.kind);
    if (label && label !== t.title) { try { w.setTitle(label); w.setThumbnailToolTip(label); t.title = label; } catch { /* gone */ } }
    const list = P.buttonsFor(t.kind, state);
    const sig = JSON.stringify(list);
    if (sig !== t.btns && (list.length || t.btns)) {
      let ok = false;
      try { ok = w.setThumbarButtons(list.map((b) => ({ tooltip: b.tip, icon: this.img(b.icon), click: () => this.press(t.id, b.id) }))); } catch { ok = false; }
      if (ok) t.btns = sig;
    }
    const box = this.host.boxOf(t.id), cb = w.getContentBounds();
    if (box) {
      const r = { x: Math.max(0, box.x - cb.x), y: Math.max(0, box.y - cb.y), width: Math.min(box.width, cb.width), height: Math.min(box.height, cb.height) };
      const whole = r.x === 0 && r.y === 0 && r.width === cb.width && r.height === cb.height;
      const key = whole ? 'whole' : `${r.x},${r.y},${r.width},${r.height}`;
      if (key !== t.clip) { try { w.setThumbnailClip(whole ? { x: 0, y: 0, width: 0, height: 0 } : r); t.clip = key; } catch { /* not yet */ } }
    }
  }

  /** A button pressed: the member's own work (main.ts), then its picture's buttons are looked at again. */
  private press(id: string, btn: number): void {
    const t = this.members.get(id);
    if (!t) return;
    try { this.d.act(id, t.kind, btn); } catch (e) { this.note('button: ' + (e as Error).message); }
    setTimeout(() => this.reconcile(), 250);
  }

  // ---------------------------------------------------------------- a snapped group's one picture

  private group(g: P.Group): void {
    let p = this.proxies.get(g.lead);
    if (!p) {
      this.icons();
      const pid = this.nextPid;
      this.nextPid = this.nextPid >= 999 ? 1 : this.nextPid + 1;
      const made = askProxy('G', pid, [1]).then((r) => { this.note(`group ${g.lead} proxy ${pid} made ${r}`); return r; });
      p = { pid, lead: g.lead, ids: [], owner: '', label: '', btns: '', place: '', sig: '', asked: 0, inval: 0, made };
      this.proxies.set(g.lead, p);
    }
    const px = p;
    px.ids = g.ids;
    px.owner = P.groupButtonsOwner(g, this.kindOf);
    if (g.label !== px.label) { px.label = g.label; void px.made.then(() => askProxy('N', px.pid, [b64(g.label)])).then((r) => this.note(`group ${g.lead} name "${g.label}" ${r}`)); }
    const btns = P.buttonsFor(this.kindOf(px.owner), this.d.info(px.owner, this.kindOf(px.owner)).state);
    const spec = btns.length ? btns.map((b) => `${b.id}.${Math.max(0, BUTTON_GLYPHS.indexOf(b.icon as typeof BUTTON_GLYPHS[number]))}.0.${b64(b.tip)}`).join(',') : '-';
    if (spec !== px.btns) { px.btns = spec; void px.made.then(() => askProxy('B', px.pid, [spec])).then((r) => this.note(`group ${g.lead} buttons ${r}`)); }
    const boxes = g.ids.map((id) => this.host.boxOf(id)).filter((b): b is P.Box => !!b);
    if (boxes.length) {
      const all = P.boundsOf(boxes);
      let real = all;
      try { real = screen.dipToScreenRect(null, all); } catch { /* scale 1 */ }
      const place = `${real.x},${real.y},${real.width},${real.height}`;
      if (place !== px.place) { px.place = place; void px.made.then(() => askProxy('W', px.pid, [real.x, real.y, real.width, real.height])); }
    }
    // DWM keeps the last picture: asked to ask again when the group changed, and once a second while he is looking at it.
    const sig = `${g.ids.join('|')}#${px.place}#${g.ids.map((id) => this.d.info(id, this.kindOf(id)).label).join('|')}`;
    const now = Date.now();
    if (sig !== px.sig || (now - px.asked < 10_000 && now - px.inval > 900)) { px.sig = sig; px.inval = now; void px.made.then(() => askProxy('V', px.pid)); }
  }

  private proxyBy(pid: number): Proxy | null { for (const p of this.proxies.values()) if (p.pid === pid) return p; return null; }

  private heard(pid: number, what: string, nums: number[]): void {
    const p = this.proxyBy(pid);
    if (!p) return;
    if (what === 'thumb') { p.asked = Date.now(); void this.sendPicture(p, nums[0] ?? 200, nums[1] ?? 120, false); return; }
    if (what === 'peek') { p.asked = Date.now(); void this.sendPicture(p, 0, 0, true); return; }
    if (what === 'click') { this.note(`group ${p.lead} clicked`); this.raise(p.ids, p.lead); return; }
    if (what === 'btn') { const n = nums[0] ?? 0; if (n > 0) this.press(p.owner, n); return; }
    if (what === 'close') { for (const id of p.ids) { const t = this.members.get(id); if (this.live(t)) t.w.close(); } }
  }

  /** Bring a group (or any members) forward together, the lead last so it is on top; the video takes the keyboard. */
  raise(ids: string[], lead?: string): void {
    const order = [...ids.filter((x) => x !== lead), ...(lead ? [lead] : [])];
    for (const id of order) { const t = this.members.get(id); if (this.live(t) && t.w.isVisible()) { try { t.w.moveTop(); } catch { /* gone */ } } }
    const l = lead ? this.members.get(lead) : undefined;
    if (this.live(l) && l.kind === 'video' && l.w.isVisible()) { try { l.w.focus(); } catch { /* fine */ } }
  }

  /**
   * The group's picture: each member's panel captured and put where it sits in the group, shrunk to fit DWM's size (a
   * thumbnail) or at its real size where it is on the screen (the live preview, peek). Premultiplied BGRA.
   */
  async compose(ids: string[], maxW: number, maxH: number, live: boolean): Promise<{ width: number; height: number; pixels: Uint8Array } | null> {
    const items = ids.map((id) => ({ id, t: this.members.get(id), box: this.host.boxOf(id) }))
      .filter((i): i is { id: string; t: Tracked; box: P.Box } => this.live(i.t) && !!i.box && i.t.w.isVisible());
    if (!items.length) return null;
    const all = P.boundsOf(items.map((i) => i.box));
    let sf = 1;
    try { sf = screen.getDisplayMatching(all).scaleFactor || 1; } catch { /* 1 */ }
    if (live) { maxW = Math.round(all.width * sf); maxH = Math.round(all.height * sf); const k = Math.sqrt(Math.min(1, PEEK_MAX / Math.max(1, maxW * maxH))); maxW = Math.max(1, Math.floor(maxW * k)); maxH = Math.max(1, Math.floor(maxH * k)); }
    const lay = P.fitLayout(items.map((i) => i.box), maxW, maxH, sf);
    const out = new Uint8Array(lay.width * lay.height * 4);
    await Promise.all(items.map(async (it, i) => {
      const r = lay.rects[i]!;
      if (r.width < 1 || r.height < 1) return;
      const cb = it.t.w.getContentBounds();
      let img: Electron.NativeImage;
      try { img = await it.t.w.webContents.capturePage({ x: Math.round(it.box.x - cb.x), y: Math.round(it.box.y - cb.y), width: it.box.width, height: it.box.height }); } catch { return; }
      if (img.isEmpty()) return;
      const sized = img.resize({ width: r.width, height: r.height, quality: 'best' });
      const s = sized.getSize(), bm = sized.toBitmap();
      if (bm.length !== s.width * s.height * 4) return;
      P.blit(out, lay.width, lay.height, bm, s.width, s.height, r.x, r.y);
    }));
    return { width: lay.width, height: lay.height, pixels: out };
  }

  private async sendPicture(p: Proxy, maxW: number, maxH: number, live: boolean): Promise<void> {
    const pic = await this.compose(p.ids, Math.max(16, Math.min(1024, maxW)), Math.max(16, Math.min(1024, maxH)), live);
    if (!pic) return;
    const r = await askProxy(live ? 'L' : 'T', p.pid, [pic.width, pic.height, Buffer.from(pic.pixels.buffer, pic.pixels.byteOffset, pic.pixels.byteLength).toString('base64')]);
    this.note(`group ${p.lead} ${live ? 'peek' : 'thumb'} ${pic.width}x${pic.height} ${r}`);
  }

  // ---------------------------------------------------------------- the bar under the lantern

  private updateBar(plan: P.Plan): void {
    // OFF (his call, 2026-10-22: "I'm still seeing a green pulse... I don't want that"): no progress bar on the lantern at
    // all; any bar left from before is cleared. The code below stays for if he ever wants it back.
    if (!TASKBAR_BAR) { const t = this.bar.target ?? this.d.samara(); if (t && !t.isDestroyed()) { try { t.setProgressBar(-1); } catch { /* gone */ } } this.bar = { target: null, key: 'off' }; return; }
    const now = Date.now();
    const jobs = (Array.isArray(this.d.jobs()) ? (this.d.jobs() as unknown[]) : []).filter((j): j is Record<string, unknown> => !!j && typeof j === 'object').map((j) => P.jobNow(j, now));
    const b = P.barFor(jobs);
    // Samara's own window; with Samara closed, a loose pop-out (a job's first): the bar is the lantern's either way.
    let target = this.d.samara();
    if (!target || target.isDestroyed()) {
      const loose = plan.loose.map((id) => this.members.get(id)).filter((t): t is Tracked => this.live(t) && t.on === true);
      target = (loose.find((t) => t.kind === 'job') ?? loose[0])?.w ?? null;
    }
    const key = `${b.mode}:${b.value.toFixed(3)}:${target ? target.id : '-'}`;
    if (key === this.bar.key) return;
    // Calm (2026-10-22): the same kind of bar moves at most every 4 s, so it never flickers or pulses; a change of kind
    // (none / normal / paused) or of window still goes at once.
    const kindKey = `${b.mode}:${target ? target.id : '-'}`;
    if (kindKey === this.bar.kind && now - (this.bar.at ?? 0) < 4000) return;
    const old = this.bar.target;
    if (old && old !== target && !old.isDestroyed()) { try { old.setProgressBar(-1); } catch { /* gone */ } }
    this.bar = { target, key, kind: kindKey, at: now };
    if (!target) return;
    try { target.setProgressBar(b.mode === 'none' ? -1 : b.value, { mode: b.mode }); } catch { /* gone */ }
  }

  // ---------------------------------------------------------------- the right-click list's Pop-outs section

  async runTask(t: P.PopoutTask): Promise<void> {
    if (t === 'new-note') { this.d.open.note(); return; }
    if (t === 'timer') { this.d.open.timer(); return; }
    if (t === 'player') { this.d.open.player(); return; }
    const all = [...this.members.values()].filter((x) => this.live(x));
    if (t === 'popouts-hide') { for (const x of all) if (x.w.isVisible()) x.w.hide(); return; }
    // Show all (and Gather, which shows them first): everything back, nothing takes the keyboard.
    for (const x of all) if (!x.w.isVisible()) x.w.showInactive();
    this.raise(all.map((x) => x.id));
    if (t === 'popouts-gather') { await new Promise((r) => setTimeout(r, 120)); await this.gather(); }
  }

  /**
   * Gather them by Aang: every pop-out snapped into one group just left of him, bottoms lined up, the biggest first.
   * Done the way his own drag does it (the family's drag, start / move / end), so the family joins them FLUSH and
   * reshapes each one for its side as usual.
   */
  async gather(): Promise<void> {
    const ids = [...this.members.values()].filter((t) => this.live(t) && t.w.isVisible())
      .sort((a, b) => (P.KIND_ORDER as readonly string[]).indexOf(a.kind) - (P.KIND_ORDER as readonly string[]).indexOf(b.kind)).map((t) => t.id);
    if (!ids.length) return;
    const aang = this.d.aang();
    const first = this.host.boxOf(ids[0]!);
    if (!first) return;
    const near = aang ?? { x: first.x + first.width + 16, y: first.y, width: 1, height: first.height };
    const area = this.areaFor({ x: Math.round(near.x), y: Math.round(near.y) });
    const settle = async () => { const end = Date.now() + 1500; await wait(80); while (this.host.busy && Date.now() < end) await wait(40); await wait(60); };
    const moveTo = async (id: string, x: number, y: number) => {
      const b = this.host.boxOf(id);
      if (!b) return;
      const dx = Math.round(x - b.x), dy = Math.round(y - b.y);
      this.host.drag(id, 'start');
      this.host.drag(id, 'move', dx - Math.sign(dx) * 3, dy); await wait(50);
      this.host.drag(id, 'move', dx, dy); await wait(50);
      this.host.drag(id, 'end', dx, dy);
      await settle();
    };
    // The first one: its right edge 16 px left of Aang, its bottom on his.
    const ax = Math.max(area.x, Math.min(near.x - 16 - first.width, area.x + area.width - first.width));
    const ay = Math.max(area.y, Math.min(near.y + near.height - first.height, area.y + area.height - first.height));
    await moveTo(ids[0]!, ax, ay);
    for (const id of ids.slice(1)) {
      if (this.host.groupOf(ids[0]!).includes(id)) continue;
      const boxes = this.host.groupOf(ids[0]!).map((x) => this.host.boxOf(x)).filter((b): b is P.Box => !!b);
      const me = this.host.boxOf(id);
      if (!boxes.length || !me) continue;
      // On the group's left, against its leftmost window, tops lined up; no room there: under the group, then above it.
      const left = boxes.reduce((a, b) => (b.x < a.x ? b : a));
      if (left.x - me.width >= area.x) { await moveTo(id, left.x - me.width, left.y); continue; }
      const low = boxes.reduce((a, b) => (b.y + b.height > a.y + a.height ? b : a));
      if (low.y + low.height + me.height <= area.y + area.height) { await moveTo(id, low.x, low.y + low.height); continue; }
      const top = boxes.reduce((a, b) => (b.y < a.y ? b : a));
      await moveTo(id, top.x, top.y - me.height);
    }
    this.schedule();
  }

  // ---------------------------------------------------------------- pictures

  /** A button's pixel icon: 16 px, and the same pixels doubled for a 200% screen. */
  private img(name: string): Electron.NativeImage {
    let i = this.imgs.get(name);
    if (!i) {
      i = nativeImage.createFromBitmap(glyphBitmap(name, 1), { width: 16, height: 16, scaleFactor: 1 });
      try { i.addRepresentation({ scaleFactor: 2, width: 32, height: 32, buffer: nativeImage.createFromBitmap(glyphBitmap(name, 2), { width: 32, height: 32 }).toPNG() }); } catch { /* 16 only */ }
      this.imgs.set(name, i);
    }
    return i;
  }
  /** The stand-ins' button icons, sent to the helper once (at 2x on a screen at 150% or more). */
  private icons(): void {
    if (this.iconsSent) return;
    this.iconsSent = true;
    let k = 1;
    try { k = screen.getPrimaryDisplay().scaleFactor >= 1.5 ? 2 : 1; } catch { /* 1 */ }
    BUTTON_GLYPHS.forEach((g, slot) => { void askProxy('K', slot, [16 * k, 16 * k, glyphBitmap(g, k).toString('base64')]); });
  }

  dispose(): void {
    clearInterval(this.tick);
    if (this.soon) clearTimeout(this.soon);
    this.off();
    for (const p of this.proxies.values()) void askProxy('G', p.pid, [0]);
    this.proxies.clear();
    const b = this.bar.target;
    if (b && !b.isDestroyed()) { try { b.setProgressBar(-1); } catch { /* gone */ } }
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

/**
 * Plug the taskbar into the family: every member it gets is tracked here too (its add and remove are wrapped, nothing
 * inside the family changes). Windows only; null elsewhere.
 */
export function wireTaskbar(host: FamilyLike, d: TaskbarDeps): TaskbarPops | null {
  if (process.platform !== 'win32') return null;
  const tb = new TaskbarPops(host, d);
  const add = host.add.bind(host), remove = host.remove.bind(host);
  host.add = (m: MemberWin) => { add(m); tb.track(m); };
  host.remove = (id: string) => { remove(id); tb.untrack(id); };
  return tb;
}

/**
 * The right-click list's Pop-outs icons as .ico files (Windows reads a jump list's icons from files, after the Shell is
 * gone too): made once into `dir`, from the same pixels as the buttons. Gather wears Aang's own face (`aangIco`).
 */
export function jumpIcons(dir: string, aangIco: string): Partial<Record<P.PopoutTask, string>> {
  const out: Partial<Record<P.PopoutTask, string>> = { 'popouts-gather': aangIco };
  try { mkdirSync(dir, { recursive: true }); } catch { return out; }
  for (const [task, glyph] of Object.entries(TASK_GLYPH)) {
    const f = path.join(dir, `jump-${glyph}.ico`);
    try {
      if (!existsSync(f)) {
        const png = (k: number) => nativeImage.createFromBitmap(glyphBitmap(glyph, k), { width: 16 * k, height: 16 * k }).toPNG();
        writeFileSync(f, icoFromPngs([{ size: 16, png: png(1) }, { size: 32, png: png(2) }]));
      }
      out[task as P.PopoutTask] = f;
    } catch { /* that one keeps the lantern */ }
  }
  return out;
}
