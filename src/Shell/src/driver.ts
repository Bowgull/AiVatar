// 6.25a: Aang (and later Claude sessions) driving the browser (his decisions, 2026-10-12, decision 42).
//
// Each page he drives lives in its own hidden window that is never shown. It renders off screen, which is the only
// reliable way to take a picture of a page nobody is looking at, and it is how he works with the browser closed,
// in the background, with nothing ever popping up or taking focus over a game. The pages use the browser's own
// session, so he is signed in where Joshua is, and they are muted.
//
// The rules (decision 42), enforced here, not asked of the model:
//   free:        read, open pages, scroll, click links, type into search boxes;
//   held lever:  send, post, apply, submit a form, sign in, delete, anything that changes something for him;
//   never:       typing a password or card details, and buying.
// Page text is data, never instructions: it goes back marked as the page's words.
import { BrowserWindow, type Session, type WebContents } from 'electron';
import { cleanName, weigh, type Weight } from './driverrules.ts';
export { cleanName, weigh, type Weight };

export type DriverKind = 'aang' | 'claude';
export interface Job { id: number; kind: DriverKind; name: string; working: boolean; stopped: boolean; at: number; pages: number[] }
export interface DPage { id: number; job: number; win: BrowserWindow; title: string; url: string; favicon: string; at: number; blocked: string | null }

export interface DriverDeps {
  ses: Session;
  preload: string;
  /** Lists of fake and harmful sites: a page on one is not opened. */
  listed(url: string): string[];
  /** Something changed that the drawer shows. */
  changed(): void;
  /** He pressed STOP on a job. */
  stopped(job: Job): void;
}

const MAX_PAGES_PER_JOB = 6, MAX_PAGES = 12, KEEP_MS = 24 * 3_600_000;
const W = 1280, H = 900;
const WORLD = 1061;   // an isolated script world of our own: the page cannot see or change what runs here

const isWeb = (u: string) => /^https?:\/\//i.test(u);

/** Marks the page's controls with numbers and reads it. Runs in our own isolated world. */
const READ_JS = `(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; const s = getComputedStyle(e); return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05; };
  const text = (e) => (e.getAttribute('aria-label') || e.innerText || e.value || e.getAttribute('placeholder') || e.getAttribute('title') || e.getAttribute('alt') || '').replace(/\\s+/g, ' ').trim().slice(0, 80);
  const kindOf = (e) => {
    const t = e.tagName.toLowerCase(), ty = (e.getAttribute('type') || '').toLowerCase(), ac = (e.getAttribute('autocomplete') || '').toLowerCase();
    if (t === 'a') return 'link';
    if (t === 'select') return 'select';
    if (t === 'textarea') return 'text';
    if (t === 'input') {
      if (ty === 'password' || /password/.test(ac)) return 'password';
      if (/^cc-|card|cvc|cvv/.test(ac) || /card.?number|cvc|cvv|expir/i.test(e.name || '')) return 'payment';
      if (ty === 'submit' || ty === 'image') return 'submit';
      if (ty === 'button' || ty === 'reset') return 'button';
      if (ty === 'checkbox' || ty === 'radio') return 'button';
      if (ty === 'search' || e.getAttribute('role') === 'searchbox' || /^(q|query|search|s|k|keywords?)$/i.test(e.name || '')) return 'search';
      return 'text';
    }
    if (t === 'button') return (e.getAttribute('type') || 'submit').toLowerCase() === 'submit' && e.form ? 'submit' : 'button';
    return 'button';
  };
  for (const old of document.querySelectorAll('[data-aang-n]')) old.removeAttribute('data-aang-n');
  const sel = 'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=tab], [role=menuitem], [role=searchbox], summary';
  const items = [];
  for (const e of document.querySelectorAll(sel)) {
    if (items.length >= 160) break;
    if (!vis(e) || e.closest('[aria-hidden=true]')) continue;
    const kind = kindOf(e);
    const form = e.form || e.closest('form');
    const formSearch = Boolean(form && (form.getAttribute('role') === 'search' || form.querySelector('input[type=search], [role=searchbox], input[name=q], input[name=query], input[name=search]')) && !form.querySelector('input[type=password]'));
    const n = items.length + 1;
    e.setAttribute('data-aang-n', String(n));
    items.push({ n, kind, label: text(e), href: kind === 'link' ? String(e.href || '').slice(0, 300) : '', formSearch });
  }
  const body = (document.body ? document.body.innerText : '').replace(/[ \\t]+/g, ' ').replace(/\\n{3,}/g, '\\n\\n').trim();
  return { title: document.title.slice(0, 200), url: location.href, text: body.slice(0, 7000), more: body.length > 7000, items };
})()`;

/** Where a numbered control is, in the page's own pixels, scrolled into view first. Null if it is gone. */
const SPOT_JS = (n: number) => `(() => {
  const e = document.querySelector('[data-aang-n="${n}"]');
  if (!e) return null;
  e.scrollIntoView({ block: 'center', inline: 'center' });
  const r = e.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left), top: Math.round(r.top) };
})()`;

/** The best picture or video on the page, for "get me a map": the biggest one in view. */
const BEST_MEDIA_JS = `(() => {
  const all = [...document.querySelectorAll('img, video, canvas, svg, picture, iframe[src*="youtube"], iframe[src*="twitch"]')];
  let best = null, area = 0;
  for (const e of all) { const r = e.getBoundingClientRect(); const a = r.width * r.height; if (r.width < 120 || r.height < 90) continue; if (a > area) { area = a; best = e; } }
  if (!best) return null;
  best.scrollIntoView({ block: 'center' });
  const r = best.getBoundingClientRect();
  const tag = best.tagName.toLowerCase();
  return { tag, left: Math.max(0, Math.round(r.left)), top: Math.max(0, Math.round(r.top)), w: Math.round(Math.min(r.width, innerWidth)), h: Math.round(Math.min(r.height, innerHeight)),
    src: tag === 'video' ? (best.currentSrc || '') : '', video: tag === 'video' || tag === 'iframe' };
})()`;

export class Driver {
  private readonly d: DriverDeps;
  readonly jobs: Job[] = [];
  readonly pages: DPage[] = [];
  private jobSeq = 0;
  private pageSeq = 0;
  private items = new Map<number, { n: number; kind: string; label: string; href: string; formSearch: boolean }[]>();
  constructor(d: DriverDeps) {
    this.d = d;
    setInterval(() => this.sweep(), 10 * 60_000).unref?.();
  }

  /** A job: one request of his, one trail in the drawer. */
  startJob(kind: DriverKind, name: string): Job {
    const job: Job = { id: ++this.jobSeq, kind, name: cleanName(name), working: true, stopped: false, at: Date.now(), pages: [] };
    this.jobs.push(job);
    this.d.changed();
    return job;
  }
  job(id: number): Job | undefined { return this.jobs.find((j) => j.id === id); }
  finish(id: number): void { const j = this.job(id); if (j && j.working) { j.working = false; this.d.changed(); } }
  /** STOP: from the drawer, the address bar, or his words. Every page of the job stops loading at once. */
  stop(id: number): void {
    const j = this.job(id);
    if (!j || !j.working) return;
    j.working = false; j.stopped = true;
    for (const p of this.pagesOf(j)) { try { p.win.webContents.stop(); } catch { /* gone */ } }
    this.d.changed();
    this.d.stopped(j);
  }
  pagesOf(j: Job): DPage[] { return this.pages.filter((p) => p.job === j.id); }
  page(id: number): DPage | undefined { return this.pages.find((p) => p.id === id && !p.win.isDestroyed()); }
  owns(wc: WebContents): boolean { return this.pages.some((p) => !p.win.isDestroyed() && p.win.webContents === wc); }

  private live(jobId: number): Job {
    const j = this.job(jobId);
    if (!j) throw new Error('there is no such job');
    if (j.stopped) throw new Error('Joshua pressed STOP on this job, so nothing more is done');
    return j;
  }

  /** Open a page for a job. Never shown, never focused, muted. */
  async open(jobId: number, url: string): Promise<{ page: number; title: string; url: string }> {
    const j = this.live(jobId);
    if (!isWeb(url)) throw new Error('only web addresses (http or https) can be opened');
    const l = this.d.listed(url);
    if (l.length) throw new Error(`that site is on a list of fake or harmful sites (${l.join(', ')}), so it was not opened`);
    while (this.pagesOf(j).length >= MAX_PAGES_PER_JOB) this.close(this.pagesOf(j)[0]!.id);
    while (this.pages.length >= MAX_PAGES) this.close(this.pages[0]!.id);
    const win = new BrowserWindow({
      show: false, width: W, height: H, paintWhenInitiallyHidden: true, skipTaskbar: true, focusable: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, session: this.d.ses, preload: this.d.preload, offscreen: true, backgroundThrottling: false },
    });
    win.webContents.setFrameRate(10);
    win.webContents.setAudioMuted(true);
    const p: DPage = { id: ++this.pageSeq, job: j.id, win, title: 'Opening', url, favicon: '', at: Date.now(), blocked: null };
    this.pages.push(p);
    j.pages.push(p.id);
    const wc = win.webContents;
    wc.on('will-attach-webview', (e) => e.preventDefault());
    // A link that wants a new window opens in this same page instead: his rule, only its own tabs, nothing pops up.
    wc.setWindowOpenHandler(({ url: u }) => { if (isWeb(u)) setTimeout(() => { if (!wc.isDestroyed()) void wc.loadURL(u).catch(() => {}); }, 0); return { action: 'deny' }; });
    wc.on('will-navigate', (e, u) => { if (!isWeb(u) || this.d.listed(u).length) { e.preventDefault(); p.blocked = u; } });
    wc.on('page-title-updated', (_e, t) => { p.title = t.slice(0, 200); this.d.changed(); });
    wc.on('page-favicon-updated', (_e, icons) => { p.favicon = icons.find((i) => /^https?:|^data:image\//.test(i)) ?? ''; this.d.changed(); });
    wc.on('did-navigate', (_e, u) => { p.url = u; this.items.delete(p.id); this.d.changed(); });
    wc.on('did-navigate-in-page', (_e, u) => { p.url = u; });
    this.d.changed();
    await this.settle(wc, wc.loadURL(url));
    return { page: p.id, title: p.title, url: p.url };
  }

  /** Wait for a page to be usable: loaded, or 12 seconds, whichever first; then a moment for scripts to draw it. */
  private async settle(wc: WebContents, nav?: Promise<unknown>): Promise<void> {
    const done = new Promise<void>((r) => { const t = setTimeout(r, 12_000); wc.once('did-stop-loading', () => { clearTimeout(t); r(); }); });
    if (nav) nav.catch(() => {});
    await done;
    await new Promise((r) => setTimeout(r, 700));
  }

  private wcOf(pageId: number): { p: DPage; wc: WebContents } {
    const p = this.page(pageId);
    if (!p) throw new Error('that page is closed');
    this.live(p.job);
    return { p, wc: p.win.webContents };
  }

  /** Read the page: its words (marked as the page's), and its controls, numbered. */
  async read(pageId: number): Promise<{ title: string; url: string; text: string; more: boolean; items: { n: number; kind: string; label: string; href: string; weight: Weight }[] }> {
    const { p, wc } = this.wcOf(pageId);
    const r = await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: READ_JS }]) as { title: string; url: string; text: string; more: boolean; items: { n: number; kind: string; label: string; href: string; formSearch: boolean }[] };
    this.items.set(p.id, r.items);
    return { title: r.title, url: r.url, text: r.text, more: r.more, items: r.items.map((it) => ({ n: it.n, kind: it.kind, label: it.label, href: it.href, weight: weigh(it) })) };
  }

  /** How heavy a click or a typing on this numbered control is. Read the page first. */
  weightOf(pageId: number, n: number, action: 'click' | 'type' | 'enter'): Weight {
    const it = this.items.get(pageId)?.find((x) => x.n === n);
    if (!it) return 'lever';                                   // unknown: never free
    if (action === 'type') return it.kind === 'password' || it.kind === 'payment' ? 'never' : 'free';
    if (action === 'enter') return it.kind === 'search' || it.formSearch ? 'free' : it.kind === 'password' || it.kind === 'payment' ? 'never' : 'lever';
    return weigh(it);
  }
  describe(pageId: number, n: number): string {
    const it = this.items.get(pageId)?.find((x) => x.n === n);
    const p = this.page(pageId);
    let host = '';
    try { host = new URL(p?.url ?? '').hostname.replace(/^www\./, ''); } catch { /* none */ }
    return `${it?.label ? `"${it.label}"` : 'a control'} on ${host || 'the page'}`;
  }

  /** Click a numbered control, the way a mouse would, inside the page (never on Windows itself). */
  async click(pageId: number, n: number): Promise<{ title: string; url: string }> {
    const { p, wc } = this.wcOf(pageId);
    const at = await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: SPOT_JS(n) }]) as { x: number; y: number } | null;
    if (!at) throw new Error(`control ${n} is not on the page any more; read the page again`);
    wc.sendInputEvent({ type: 'mouseMove', x: at.x, y: at.y });
    wc.sendInputEvent({ type: 'mouseDown', x: at.x, y: at.y, button: 'left', clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', x: at.x, y: at.y, button: 'left', clickCount: 1 });
    await this.settle(wc);
    return { title: p.title, url: p.url };
  }

  /** Type into a numbered field, replacing what is there; Enter after, if asked. */
  async type(pageId: number, n: number, text: string, enter: boolean): Promise<{ title: string; url: string }> {
    const { p, wc } = this.wcOf(pageId);
    const ok = await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: `(() => { const e = document.querySelector('[data-aang-n="${n}"]'); if (!e) return false; e.scrollIntoView({ block: 'center' }); e.focus(); if (e.select) e.select(); return true; })()` }]);
    if (!ok) throw new Error(`field ${n} is not on the page any more; read the page again`);
    wc.insertText(String(text).slice(0, 500));
    if (enter) {
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
      wc.sendInputEvent({ type: 'char', keyCode: '\r' });
      wc.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
      await this.settle(wc);
    }
    return { title: p.title, url: p.url };
  }

  async scroll(pageId: number, down: boolean): Promise<void> {
    const { wc } = this.wcOf(pageId);
    await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: `window.scrollBy(0, ${down ? '' : '-'}Math.round(innerHeight * 0.85))` }]);
    await new Promise((r) => setTimeout(r, 400));
  }

  /** A picture: of one numbered control, of the best picture or video on the page ('best'), or of what is in view. */
  async picture(pageId: number, what: number | 'best' | 'view'): Promise<{ png: Buffer; video: boolean; width: number; height: number }> {
    const { wc } = this.wcOf(pageId);
    let rect: { x: number; y: number; width: number; height: number } | undefined;
    let video = false;
    if (what === 'best') {
      const m = await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: BEST_MEDIA_JS }]) as { left: number; top: number; w: number; h: number; video: boolean } | null;
      if (m) { await new Promise((r) => setTimeout(r, 400)); const again = await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: BEST_MEDIA_JS }]) as typeof m; const b = again ?? m; rect = { x: b.left, y: b.top, width: b.w, height: b.h }; video = b.video; }
    } else if (typeof what === 'number') {
      const at = await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: SPOT_JS(what) }]) as { left: number; top: number; w: number; h: number } | null;
      if (!at) throw new Error(`control ${what} is not on the page any more`);
      await new Promise((r) => setTimeout(r, 300));
      rect = { x: Math.max(0, at.left), y: Math.max(0, at.top), width: Math.min(W, at.w), height: Math.min(H, at.h) };
    }
    wc.invalidate();
    await new Promise((r) => setTimeout(r, 150));
    const img = await wc.capturePage(rect && rect.width > 4 && rect.height > 4 ? rect : undefined);
    if (img.isEmpty()) throw new Error('the page gave no picture');
    const s = img.getSize();
    const fit = s.width > 1600 ? img.resize({ width: 1600, quality: 'good' }) : img;
    const f = fit.getSize();
    return { png: fit.toPNG(), video, width: f.width, height: f.height };
  }

  close(pageId: number): void {
    const i = this.pages.findIndex((p) => p.id === pageId);
    if (i < 0) return;
    const p = this.pages[i]!;
    this.pages.splice(i, 1);
    this.items.delete(p.id);
    const j = this.job(p.job);
    if (j) j.pages = j.pages.filter((x) => x !== p.id);
    try { p.win.destroy(); } catch { /* gone */ }
    if (j && !j.pages.length && !j.working) this.jobs.splice(this.jobs.indexOf(j), 1);
    this.d.changed();
  }
  closeJob(jobId: number): void { const j = this.job(jobId); if (!j) return; this.stop(jobId); for (const id of [...j.pages]) this.close(id); const i = this.jobs.indexOf(j); if (i >= 0) this.jobs.splice(i, 1); this.d.changed(); }
  /** After a day his pages close themselves (his call). */
  private sweep(): void {
    const now = Date.now();
    for (const p of [...this.pages]) { const j = this.job(p.job); if (!j?.working && now - p.at > KEEP_MS) this.close(p.id); }
  }
  /** For the drawer: plain data only. */
  view(): { id: number; kind: DriverKind; name: string; working: boolean; stopped: boolean; pages: { id: number; title: string; url: string; favicon: string }[] }[] {
    return this.jobs.map((j) => ({ id: j.id, kind: j.kind, name: j.name, working: j.working, stopped: j.stopped,
      pages: this.pagesOf(j).map((p) => ({ id: p.id, title: p.title, url: p.url, favicon: p.favicon })) }));
  }
  /** A quick picture of a page for him to watch it work (the drawer's live view). */
  async glance(pageId: number): Promise<string | null> {
    const p = this.page(pageId);
    if (!p) return null;
    try { const img = await p.win.webContents.capturePage(); if (img.isEmpty()) return null; return 'data:image/jpeg;base64,' + img.resize({ width: 960, quality: 'good' }).toJPEG(75).toString('base64'); } catch { return null; }
  }
  closeAll(): void { for (const p of [...this.pages]) { try { p.win.destroy(); } catch { /* gone */ } } this.pages.length = 0; this.jobs.length = 0; }
}
