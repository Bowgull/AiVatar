// M6 (his interview, 2026-10-13): one browser on both machines. "If something changes on my Mac it changes on my
// Shadow." Bookmarks, settings, the open tabs (the SAME tabs on both, his pick), history, and logins (cookies; his
// call, against my advice).
//
// Guards, his and mine:
//   - It travels only between his two machines, through Aang's brain on the PC, over Tailscale. The brain passes
//     it on and never writes it down: no GitHub, no Drive, no copy anywhere else.
//   - Bank and money sites never sync (visits.ts neverKeep): their cookies, history and tabs stay where they are.
//   - Aang's own pages (127.0.0.1) never sync.
//
// How it agrees: each kind carries the time it last changed. Live, a change is sent as it happens. When the other
// machine comes back (it was off, or asleep), both send everything and each keeps the newer of each thing; open
// tabs are joined rather than replaced, so tabs opened on a machine while it was apart are never lost.
import { existsSync, readFileSync } from 'node:fs';
import { writeFileAtomic } from './atomic.ts';
import { neverKeep, type Visit } from './visits.ts';
import type { Mark } from './bookmarks.ts';

/** One tab as it travels: where it is and which trail it belongs to. Scroll, zoom and sound stay per machine. */
export interface SyncTab { url: string; title: string; trail: number | null; done: boolean }
export interface TabSnap { tabs: SyncTab[]; trails: { id: number; name: string }[] }
/** A cookie as Electron reports it (Electron.Cookie), minus what cannot be set. */
export interface SyncCookie {
  name: string; value: string; domain?: string; hostOnly?: boolean; path?: string; secure?: boolean; httpOnly?: boolean;
  expirationDate?: number; sameSite?: 'unspecified' | 'no_restriction' | 'lax' | 'strict';
}

/** What a browser has to offer the sync. AangBrowser implements it; the tests use a stand-in. */
export interface SyncTarget {
  marks(): Mark[]; setMarks(list: Mark[]): void;
  prefs(): Record<string, unknown>; setPrefs(p: Record<string, unknown>): void;
  tabSnap(): TabSnap; setTabs(s: TabSnap): void;
  visits(): Visit[]; addVisits(list: Visit[]): void; forgetVisit(url: string, at: number): void; clearVisits(from: number): void;
  cookies(): Promise<SyncCookie[]>; setCookie(c: SyncCookie): Promise<void>; removeCookie(c: SyncCookie): Promise<void>;
  /** The other machine started playing something: stop here (one video at a time, his rule). */
  pauseAll?(): void;
}

export type SyncMsg =
  | { t: 'bsync.hello' } | { t: 'bsync.down' } | { t: 'bsync.media' }
  | { t: 'bsync.full'; marks: { at: number; list: Mark[] }; prefs: { at: number; data: Record<string, unknown> }; tabs: { at: number; snap: TabSnap }; visits: Visit[]; cookies: Record<string, { at: number; c: SyncCookie | null }> }
  | { t: 'bsync.marks'; at: number; list: Mark[] }
  | { t: 'bsync.prefs'; at: number; data: Record<string, unknown> }
  | { t: 'bsync.tabs'; at: number; snap: TabSnap }
  | { t: 'bsync.visit'; op: 'add'; list: Visit[] } | { t: 'bsync.visit'; op: 'forget'; url: string; at: number } | { t: 'bsync.visit'; op: 'clear'; from: number }
  | { t: 'bsync.cookies'; list: { key: string; at: number; c: SyncCookie | null }[] };

const DAY = 86_400_000;

/** Never synced: money sites (his rule), Aang's own pages, anything not a real web address. */
export function hostKept(host: string): boolean {
  const h = String(host ?? '').replace(/^\./, '').toLowerCase();
  if (!h || h === 'localhost' || /^127\.|^\[?::1\]?$/.test(h) || !/^[a-z0-9.-]+$/.test(h)) return false;
  return !neverKeep('https://' + h + '/');
}
export const urlKept = (u: string) => { try { const x = new URL(u); return (x.protocol === 'https:' || x.protocol === 'http:') && hostKept(x.hostname); } catch { return false; } };

export const cookieKey = (c: SyncCookie) => `${String(c.domain ?? '').toLowerCase()}|${c.path ?? '/'}|${c.name}`;

/** The address Electron needs to set a cookie for its domain. */
export function cookieUrl(c: SyncCookie): string {
  return `${c.secure ? 'https' : 'http'}://${String(c.domain ?? '').replace(/^\./, '')}${c.path || '/'}`;
}

/** What tabs look like for comparing: places and trails, not titles. */
export const tabSig = (s: TabSnap) => JSON.stringify(s.tabs.map(t => [t.url, t.trail, t.done]));

/**
 * Two machines' tabs after time apart: the newer side's tabs in its order, then any the older side opened that the
 * newer side does not have. Both machines work this out from the same two lists, so both end with the same tabs.
 */
export function joinTabs(a: { at: number; snap: TabSnap }, b: { at: number; snap: TabSnap }): TabSnap {
  const [first, second] = a.at >= b.at ? [a.snap, b.snap] : [b.snap, a.snap];
  const have = new Map<string, number>();
  for (const t of first.tabs) have.set(t.url, (have.get(t.url) ?? 0) + 1);
  const extra: SyncTab[] = [];
  for (const t of second.tabs) { const n = have.get(t.url) ?? 0; if (n > 0) have.set(t.url, n - 1); else extra.push(t); }
  // Trails keep their numbers from the side that made them; one the newer side does not know comes along with its tabs.
  const trails = [...first.trails];
  const used = new Set(trails.map(x => x.id));
  const remap = new Map<number, number>();
  for (const x of second.trails) {
    if (!extra.some(t => t.trail === x.id)) continue;
    const same = trails.find(y => y.name === x.name);
    if (same) { remap.set(x.id, same.id); continue; }
    let id = x.id; while (used.has(id)) id++;
    used.add(id); remap.set(x.id, id); trails.push({ id, name: x.name });
  }
  return { tabs: [...first.tabs, ...extra.map(t => ({ ...t, trail: t.trail === null ? null : remap.get(t.trail) ?? null }))].slice(0, 80), trails };
}

/** The other machine's visits this one does not have yet (each page-time once, 90 days, money sites never). */
export function joinVisits(mine: Visit[], theirs: Visit[], now = Date.now()): Visit[] {
  const seen = new Set(mine.map(v => v.url + '|' + v.at));
  const add = theirs.filter(v => urlKept(v.url) && Number.isFinite(v.at) && v.at > now - 90 * DAY && !seen.has(v.url + '|' + v.at));
  return add;
}

interface SyncState { marksAt: number; prefsAt: number; tabsAt: number; cookies: Record<string, { at: number; c: SyncCookie | null }> }

/**
 * The sync itself, the same on both machines. `send` reaches the other machine (through the brain); `got` is called
 * with whatever arrives. The browser calls `changed(kind)` whenever one of its own things changes.
 */
export class BrowserSync {
  private s: SyncState = { marksAt: 0, prefsAt: 0, tabsAt: 0, cookies: {} };
  private readonly file: string;
  /** set while a change from the other machine is being applied, so it is not sent straight back */
  private applying = 0;
  private lastTabSig = '';
  private cookieOut = new Map<string, { key: string; at: number; c: SyncCookie | null }>();
  private cookieTimer: NodeJS.Timeout | null = null;
  /** cookies just set from the other machine: their change event here is not news */
  private echo = new Map<string, string>();
  private readonly o: { target: SyncTarget; send: (m: SyncMsg) => void; stateDir: string; log?: (s: string) => void; now?: () => number };
  connected = false;

  constructor(o: { target: SyncTarget; send: (m: SyncMsg) => void; stateDir: string; log?: (s: string) => void; now?: () => number }) {
    this.o = o;
    this.file = `${o.stateDir}/browser-sync.json`;
    try { if (existsSync(this.file)) { const s = JSON.parse(readFileSync(this.file, 'utf8')); this.s = { marksAt: +s.marksAt || 0, prefsAt: +s.prefsAt || 0, tabsAt: +s.tabsAt || 0, cookies: s.cookies && typeof s.cookies === 'object' ? s.cookies : {} }; } } catch { /* fresh */ }
    this.lastTabSig = tabSig(o.target.tabSnap());
    // A file written before 2026-10-14 still holds login values: rewritten without them, now.
    if (Object.values(this.s.cookies).some((v) => v.c && typeof (v.c as SyncCookie).value === 'string')) this.save();
  }
  private now() { return (this.o.now ?? Date.now)(); }
  private save() {
    // Old removals are forgotten after 30 days: by then both machines have long agreed.
    const cut = this.now() - 30 * DAY;
    for (const [k, v] of Object.entries(this.s.cookies)) if (!v.c && v.at < cut) delete this.s.cookies[k];
    // Never a login's value on disk (security audit H2, 2026-10-14: this file was a second, plain copy of every synced
    // login). What the sync needs between runs is only WHEN each cookie last changed and whether it was removed; the
    // live values are always read fresh from the browser's own cookie store when the machines catch up.
    const cookies: Record<string, { at: number; c: SyncCookie | null }> = {};
    for (const [k, v] of Object.entries(this.s.cookies)) cookies[k] = { at: v.at, c: v.c ? ({} as SyncCookie) : null };
    try { writeFileAtomic(this.file, JSON.stringify({ ...this.s, cookies })); } catch { /* next change */ }
  }
  private log(s: string) { this.o.log?.(s); }
  private send(m: SyncMsg) { if (this.connected) this.o.send(m); }

  // ---- this machine changed something
  changed(kind: 'marks' | 'prefs' | 'tabs'): void {
    if (this.applying) return;
    const at = this.now();
    if (kind === 'marks') { this.s.marksAt = at; this.save(); this.send({ t: 'bsync.marks', at, list: this.o.target.marks() }); }
    else if (kind === 'prefs') { this.s.prefsAt = at; this.save(); this.send({ t: 'bsync.prefs', at, data: this.o.target.prefs() }); }
    else {
      const snap = keptTabs(this.o.target.tabSnap());
      const sig = tabSig(snap);
      if (sig === this.lastTabSig) return;
      this.lastTabSig = sig; this.s.tabsAt = at; this.save();
      this.send({ t: 'bsync.tabs', at, snap });
    }
  }
  visited(list: Visit[]): void { if (!this.applying) { const kept = list.filter(v => urlKept(v.url)); if (kept.length) this.send({ t: 'bsync.visit', op: 'add', list: kept }); } }
  forgot(url: string, at: number): void { if (!this.applying) this.send({ t: 'bsync.visit', op: 'forget', url, at }); }
  cleared(from: number): void { if (!this.applying) this.send({ t: 'bsync.visit', op: 'clear', from }); }
  /** A cookie changed here (Electron's cookies 'changed' event). Sent in small batches. */
  cookie(c: SyncCookie, removed: boolean): void {
    if (!hostKept(String(c.domain ?? ''))) return;
    const key = cookieKey(c);
    const sig = removed ? '' : c.value;
    if (this.echo.has(key) && this.echo.get(key) === sig) { this.echo.delete(key); return; }
    const at = this.now();
    const rec = { key, at, c: removed ? null : clean(c) };
    this.s.cookies[key] = { at, c: rec.c };
    this.cookieOut.set(key, rec);
    if (!this.cookieTimer) this.cookieTimer = setTimeout(() => {
      this.cookieTimer = null; this.save();
      const list = [...this.cookieOut.values()]; this.cookieOut.clear();
      if (list.length) this.send({ t: 'bsync.cookies', list });
    }, 1500);
  }

  /** Something started playing on this machine: the other one stops (one video at a time). */
  mediaStarted(): void { this.send({ t: 'bsync.media' }); }

  // ---- the other machine is there
  /** The link to the other machine came up (or went down). Up: both send everything. */
  async link(up: boolean): Promise<void> {
    this.connected = up;
    if (up) await this.sendFull();
  }
  private async sendFull(): Promise<void> {
    const t = this.o.target;
    // Every kept cookie this machine has, with when it last changed (unknown ones count as old: the other side's
    // record wins over them).
    const cookies: Record<string, { at: number; c: SyncCookie | null }> = {};
    for (const [k, v] of Object.entries(this.s.cookies)) if (!v.c) cookies[k] = v;
    for (const c of await t.cookies()) {
      if (!hostKept(String(c.domain ?? ''))) continue;
      const k = cookieKey(c);
      cookies[k] = { at: this.s.cookies[k]?.at ?? 0, c: clean(c) };
    }
    const now = this.now();
    this.send({
      t: 'bsync.full',
      marks: { at: this.s.marksAt, list: t.marks() }, prefs: { at: this.s.prefsAt, data: t.prefs() },
      tabs: { at: this.s.tabsAt, snap: keptTabs(t.tabSnap()) },
      visits: t.visits().filter(v => v.at > now - 90 * DAY && urlKept(v.url)),
      cookies,
    });
  }

  /** Something arrived from the other machine. */
  async got(m: SyncMsg): Promise<void> {
    const t = this.o.target;
    this.applying++;
    try {
      switch (m.t) {
        case 'bsync.hello': this.connected = true; await this.sendFull(); break;
        case 'bsync.down': this.connected = false; break;
        case 'bsync.media': t.pauseAll?.(); break;
        case 'bsync.marks': if (m.at > this.s.marksAt && Array.isArray(m.list)) { t.setMarks(m.list); this.s.marksAt = m.at; this.save(); } break;
        case 'bsync.prefs': if (m.at > this.s.prefsAt && m.data && typeof m.data === 'object') { t.setPrefs(m.data); this.s.prefsAt = m.at; this.save(); } break;
        case 'bsync.tabs': if (m.at > this.s.tabsAt && m.snap) { this.applyTabs(m.snap); this.s.tabsAt = m.at; this.save(); } break;
        case 'bsync.visit':
          if (m.op === 'add' && Array.isArray(m.list)) t.addVisits(joinVisits(t.visits(), m.list, this.now()));
          else if (m.op === 'forget') t.forgetVisit(String(m.url), Number(m.at));
          else if (m.op === 'clear') t.clearVisits(Number(m.from));
          break;
        case 'bsync.cookies': for (const r of Array.isArray(m.list) ? m.list : []) await this.takeCookie(r.key, r.at, r.c); this.save(); break;
        case 'bsync.full': {
          // Bookmarks after time apart are joined, never replaced (found 2026-10-13: on the first sync neither side had
          // a change time, so neither took the other's and the Mac stayed empty). A bookmark removed on one machine
          // while apart can come back; one he made is never lost.
          if (Array.isArray(m.marks?.list)) {
            const mine = t.marks();
            const have = new Set(mine.map(x => x.url));
            const add = m.marks.list.filter(x => x && typeof x.url === 'string' && !have.has(x.url));
            const base = m.marks.at > this.s.marksAt ? m.marks.list : mine;
            const extra = m.marks.at > this.s.marksAt ? mine.filter(x => !m.marks.list.some(y => y.url === x.url)) : add;
            if (extra.length || base !== mine) t.setMarks([...base, ...extra]);
            this.s.marksAt = Math.max(this.s.marksAt, m.marks.at);
          }
          if (m.prefs?.at > this.s.prefsAt) { t.setPrefs(m.prefs.data); this.s.prefsAt = m.prefs.at; }
          if (m.tabs?.snap) {
            const mine = { at: this.s.tabsAt, snap: keptTabs(t.tabSnap()) };
            const joined = joinTabs(mine, m.tabs);
            if (tabSig(joined) !== tabSig(mine.snap)) this.applyTabs(joined);
            this.s.tabsAt = Math.max(this.s.tabsAt, m.tabs.at);
          }
          if (Array.isArray(m.visits)) t.addVisits(joinVisits(t.visits(), m.visits, this.now()));
          // A login both machines already have, and neither changed since syncing began, stays as each has it.
          const here = new Map<string, number>();
          for (const c of await t.cookies()) { const k = cookieKey(c); here.set(k, this.s.cookies[k]?.at ?? 0); }
          for (const [k, v] of Object.entries(m.cookies ?? {})) await this.takeCookie(k, v.at, v.c, here.get(k) ?? this.s.cookies[k]?.at ?? -1);
          this.save();
          this.log('browser sync: caught up with the other machine');
          break;
        }
      }
    } finally { this.applying--; }
  }
  private applyTabs(snap: TabSnap): void {
    const kept = keptTabs(snap);
    this.o.target.setTabs(kept);
    this.lastTabSig = tabSig(keptTabs(this.o.target.tabSnap()));
  }
  private async takeCookie(key: string, at: number, c: SyncCookie | null, mineAt = this.s.cookies[key]?.at ?? -1): Promise<void> {
    if (mineAt >= at) return;                                  // ours is as new or newer
    if (c && !hostKept(String(c.domain ?? ''))) return;
    if (c && cookieKey(c) !== key) return;                     // a record that does not match its own name
    if (c && c.expirationDate && c.expirationDate * 1000 < this.now()) return;
    this.s.cookies[key] = { at, c };
    try {
      if (c) { this.echo.set(key, c.value); await this.o.target.setCookie(c); }
      else {
        const [domain, p, ...name] = key.split('|');
        this.echo.set(key, '');
        await this.o.target.removeCookie({ domain, path: p, name: name.join('|'), value: '' });
      }
    } catch (e) { this.echo.delete(key); this.log(`browser sync: a login for ${key.split('|')[0]} could not be set: ${(e as Error).message}`); }
  }
}

/** Money sites and Aang's own pages stay off the list that travels. */
function keptTabs(s: TabSnap): TabSnap { return { tabs: s.tabs.filter(t => urlKept(t.url)).slice(0, 80), trails: s.trails }; }
function clean(c: SyncCookie): SyncCookie {
  return {
    name: c.name, value: c.value, ...(c.domain ? { domain: c.domain } : {}), ...(c.hostOnly ? { hostOnly: true } : {}), path: c.path || '/',
    ...(c.secure ? { secure: true } : {}), ...(c.httpOnly ? { httpOnly: true } : {}),
    ...(c.expirationDate ? { expirationDate: c.expirationDate } : {}), ...(c.sameSite ? { sameSite: c.sameSite } : {}),
  };
}
