// Steps 6.19, 6.20 and 6.21: Aang's browser.
//
// One window. Its frame (the carved band and the tab rail, sheet 3) is a page of ours; each tab is its own
// WebContentsView, placed by hand in the page area. That placing is step 6.19: no layout library can hold a
// browser view, because a view is not a page element. The frame tells us once how wide the rail is and how
// tall the band is (its insets); from then on every resize is answered here, synchronously, from the window's
// own size, so the page never lags a frame behind the frame or tears at his scaling. Electron works in
// device-independent pixels, so Windows' monitor scaling is already accounted for.
//
// 6.21, NEVER LOSE A TAB: every tab is snapshotted (address, title, where it sat in the rail, scroll, zoom)
// every few seconds and on every navigation, to one file written atomically. Save-on-quit cannot be
// trusted (an updater or a Shadow shutdown closes windows first), so the snapshot is continuous and the
// same one powers crash reload, sleeping tabs and coming back after a restart. Every call INTO a tab has a
// timeout: calling a crashed one hangs (tested 2026-10-04).
//
// SAFETY, from the first line:
//  - His browsing lives in its own session (`persist:aang-browser`), apart from Aang's pages and the pop-out.
//  - A tab can only ever be a web page: http and https. The address slot searches or goes to a site and
//    never runs anything (address.ts, tested).
//  - Tabs get NO preload and the safe preferences: a website can never reach Aang's doors.
//  - Every permission a site asks for is refused until 6.22 adds the asks (chips and the lever).
import { BrowserWindow, WebContentsView, app, screen, session as electronSession } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { SAFE_WEB_PREFERENCES, denyPermissions, lockDown } from './safety.ts';
import { addressFor } from './address.ts';
import { writeFileAtomic } from './atomic.ts';
import { lookalike } from './lookalike.ts';
import { PhishCheck } from './phish.ts';
import { blockAds, type AdBlock } from './skip/ads.ts';

export interface BrowserOptions { origin: string; preloadPath: string; stateDir: string; tabPreloadPath: string }

interface Tab {
  id: number;
  /** null while the tab is asleep: its page is closed to save memory, its snapshot kept. */
  view: WebContentsView | null;
  opener: number | null;
  title: string;
  url: string;
  favicon: string;
  loading: boolean;
  audible: boolean;
  muted: boolean;
  crashed: boolean;
  scrollY: number;
  zoom: number;
  lastSeen: number;
  /** 6.22: stopped before loading because a list names it: which lists. */
  blocked: { url: string; lists: string[]; real?: string } | null;
  /** Sheet 3 section 3: the trail it belongs to (null = a loose tab), and whether he turned it in. */
  trail: number | null;
  done: boolean;
}

/** A trail (Horse Browser's idea, sheet 3): pages that belong to one thing he is doing. `named` = he named it. */
interface Trail { id: number; name: string; named: boolean }

/** A trail's first name, from the site it started on: "wowhead.com" becomes "WOWHEAD". He can rename it. */
function trailNameFor(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    const parts = h.split('.');
    return (parts.length > 1 ? parts[parts.length - 2] : parts[0]).toUpperCase().slice(0, 24);
  } catch { return 'TRAIL'; }
}

const isWeb = (u: string) => /^https?:\/\//i.test(u);
/** How a look-alike is named on the red plate's list chips. */
const LOOKS_LIKE = 'LOOKS LIKE ';
const HOME = 'https://www.google.com';
/** A tab not looked at for this long, and not playing sound, goes to sleep. */
const SLEEP_AFTER_MS = 30 * 60_000;
// The band's height (Windows draws its own buttons over it, see-through on the wood) and the page area's colour.
const BAND_HEIGHT = 58;
/** The page's corners, rounded natively so it sits in the carved recess (the research: Flow browser does this). */
const PAGE_RADIUS = 6;
const PAGE_COLOUR = '#f6f3ee';

/** Every call into a page, with a deadline: a crashed page never answers, and must never hang Aang. */
function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

export class AangBrowser {
  private win: BrowserWindow | null = null;
  private tabs: Tab[] = [];
  private active: number | null = null;
  private seq = 0;
  private trails: Trail[] = [];
  private trailSeq = 0;
  private closed: string[] = [];
  private inset = { left: 30, top: 66, right: 8, bottom: 8 };
  /** The tab drawer is open: the page is shown as a still picture under it, so the drawer can lie over it. */
  private drawerOpen = false;
  private timers: NodeJS.Timeout[] = [];
  private saveSoon: NodeJS.Timeout | null = null;
  private readonly o: BrowserOptions;
  private readonly file: string;
  private readonly ses = electronSession.fromPartition('persist:aang-browser');
  // 6.22, protection.
  private readonly phish: PhishCheck;
  private ads: AdBlock | null = null;
  private readonly pausedFile: string;
  private paused = new Set<string>();
  /** Sites he chose to open anyway, past a list, with the held lever. This run only. */
  private readonly letThrough = new Set<string>();
  private readonly asks = new Map<number, (allow: boolean) => void>();
  private askSeq = 0;
  /** The little wood sounds (new tab, close, download done). Off until he turns them on in Settings. */
  sounds = false;
  /** The ⋯ menu's switches (sheet 3 section 10), kept between runs. Block ads and Block popups start on. */
  prefs = { ads: true, popups: true };
  private readonly prefsFile: string;
  constructor(o: BrowserOptions) {
    this.o = o;
    this.file = path.join(o.stateDir, 'browser-tabs.json');
    this.pausedFile = path.join(o.stateDir, 'adblock-paused.json');
    this.prefsFile = path.join(o.stateDir, 'browser-prefs.json');
    try {
      if (existsSync(this.prefsFile)) {
        const p = JSON.parse(readFileSync(this.prefsFile, 'utf8'));
        this.sounds = p?.sounds === true;
        this.prefs = { ads: p?.ads !== false, popups: p?.popups !== false };
      }
    } catch { /* defaults */ }
    denyPermissions(this.ses);
    this.permissions();
    this.downloads();
    this.phish = new PhishCheck(o.stateDir);
    void this.phish.start();
    try { if (existsSync(this.pausedFile)) this.paused = new Set(JSON.parse(readFileSync(this.pausedFile, 'utf8'))); } catch { /* none paused */ }
    void blockAds(this.ses, o.stateDir, { cosmetic: true }).then((b) => { this.ads = b; if (b) { for (const h of this.paused) b.pause(h, true); if (!this.prefs.ads) b.stop(); } });
  }

  /**
   * 6.22, the asks (sheet 3 section 5). Fullscreen just works; camera and microphone ask through the chip that
   * hangs from the band, for this call only, never "always"; notifications, location and everything else are
   * refused without asking, because nothing he does needs them.
   */
  private permissions(): void {
    this.ses.setPermissionRequestHandler((wc, permission, done, details) => {
      if (permission === 'fullscreen') { done(true); return; }
      if (permission !== 'media' || !this.win || this.win.isDestroyed()) { done(false); return; }
      const types = ((details as { mediaTypes?: string[] }).mediaTypes ?? []);
      const what = types.includes('video') && types.includes('audio') ? 'Camera and microphone?' : types.includes('video') ? 'Your camera?' : 'Your microphone?';
      let host = '';
      try { host = new URL(wc.getURL()).hostname.replace(/^www\./, ''); } catch { /* unknown */ }
      const id = ++this.askSeq;
      const timer = setTimeout(() => { const f = this.asks.get(id); if (f) { this.asks.delete(id); f(false); } }, 120_000);
      this.asks.set(id, (allow) => { clearTimeout(timer); done(allow); });
      this.win.webContents.send('browser:ask', { id, host, what });
    });
    this.ses.setPermissionCheckHandler((_wc, permission) => permission === 'fullscreen');
  }
  /** His answer to the chip. */
  answer(id: number, allow: boolean): void { const f = this.asks.get(id); if (f) { this.asks.delete(id); f(allow); } }

  /**
   * 6.22: downloads go to his Downloads folder and are marked as from the internet (the Mark of the Web),
   * so Windows Defender and SmartScreen check them before anything opens them, exactly as for Chrome.
   */
  private downloads(): void {
    this.ses.on('will-download', (_e, item) => {
      const dir = app.getPath('downloads');
      const base = item.getFilename().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_') || 'download';
      let to = path.join(dir, base), n = 1;
      while (existsSync(to)) { const p = path.parse(base); to = path.join(dir, `${p.name} (${n++})${p.ext}`); }
      item.setSavePath(to);
      const from = item.getURL();
      item.once('done', (_ev, state) => {
        if (state === 'completed') {
          try { writeFileSync(to + ':Zone.Identifier', `[ZoneTransfer]\r\nZoneId=3\r\nHostUrl=${isWeb(from) ? from : 'about:internet'}\r\n`); }
          catch (e) { console.error('shell: could not mark the download for Defender: ' + (e as Error).message); }
        }
        this.win?.webContents.send('browser:download', { name: path.basename(to), state });
      });
    });
  }

  /** Is this address on a list, and has he not chosen to go anyway? Returns the lists, or none. */
  private listed(u: string): string[] {
    try { if (this.letThrough.has(new URL(u).hostname)) return []; } catch { return []; }
    const lists = this.phish.check(u);
    if (lists.length) return lists;
    // On no list yet, but dressed up as a site he really uses (6.22's last piece).
    const real = lookalike(u);
    return real ? [LOOKS_LIKE + real.toUpperCase()] : [];
  }
  /** Stop a tab at a listed address: nothing loads, the frame shows the red plate instead. */
  private block(tab: Tab, url: string, lists: string[]): void {
    const like = lists.find((l) => l.startsWith(LOOKS_LIKE));
    tab.blocked = { url, lists, ...(like ? { real: like.slice(LOOKS_LIKE.length).toLowerCase() } : {}) };
    tab.url = url;
    tab.loading = false;
    if (tab.view) { try { tab.view.webContents.stop(); } catch { /* gone */ } }
    this.place();
    this.changed();
  }

  /** 6.22: "Block ads on this site" off or on, for the site he is on. Kept between runs. */
  pauseAds(on: boolean): void {
    const t = this.cur();
    let host = '';
    try { host = new URL(t?.url ?? '').hostname.replace(/^www\./, ''); } catch { return; }
    if (!host) return;
    if (on) this.paused.add(host); else this.paused.delete(host);
    this.ads?.pause(host, on);
    try { writeFileAtomic(this.pausedFile, JSON.stringify([...this.paused])); } catch { /* best effort */ }
    t?.view?.webContents.reload();
    this.sendTabs();
  }

  setSounds(on: boolean): void {
    this.sounds = on;
    this.savePrefs();
    this.sendTabs();
  }

  private savePrefs(): void {
    try { writeFileAtomic(this.prefsFile, JSON.stringify({ sounds: this.sounds, ...this.prefs })); } catch { /* best effort */ }
  }

  /** A switch in the ⋯ menu. Only the ones that exist; "Let Aang act without asking" is not one of them. */
  setPref(key: string, on: boolean): void {
    if (key === 'sounds') { this.setSounds(on); return; }
    if (key === 'ads') {
      this.prefs.ads = on;
      if (on) this.ads?.start(); else this.ads?.stop();
      this.cur()?.view?.webContents.reload();
    } else if (key === 'popups') this.prefs.popups = on;
    else return;
    this.savePrefs();
    this.sendTabs();
  }

  /**
   * The tab drawer (2026-10-11, his pick: it slides OVER the page, opened by clicking the wood tab). A page is a
   * native view drawn above the frame, so no HTML can cover it. While the drawer is open the page is shown as a
   * still picture of itself in the frame and the live view is hidden; closing puts the live page straight back.
   */
  async drawer(open: boolean): Promise<void> {
    const w = this.win;
    const t = this.cur();
    if (!w || w.isDestroyed()) return;
    this.drawerOpen = open;
    if (!open) { this.place(); if (t?.view) t.view.setVisible(true); w.webContents.send('browser:frozen', null); return; }
    let shot: string | null = null;
    if (t?.view && !t.crashed && !t.blocked) {
      try { const img = await within(t.view.webContents.capturePage(), 600, null); if (img && !img.isEmpty()) shot = 'data:image/jpeg;base64,' + img.toJPEG(82).toString('base64'); }
      catch { /* no picture: the page area shows its own colour */ }
    }
    if (!this.drawerOpen) return;               // closed again while the picture was taken
    w.webContents.send('browser:frozen', shot);
    if (t?.view) t.view.setVisible(false);
  }

  isFrame(sender: Electron.WebContents): boolean { return Boolean(this.win && !this.win.isDestroyed() && sender === this.win.webContents); }

  /** Open the window (or bring it forward), optionally on an address. Coming back, every tab comes back. */
  open(url?: string): void {
    if (this.win && !this.win.isDestroyed()) {
      if (this.win.isMinimized()) this.win.restore();
      this.win.show(); this.win.focus();
      if (url) this.newTab(url);
      return;
    }
    const wa = screen.getPrimaryDisplay().workArea;
    const w = new BrowserWindow({
      width: Math.min(1440, wa.width - 80), height: Math.min(900, wa.height - 60), minWidth: 720, minHeight: 480,
      show: false, backgroundColor: '#24160D', title: 'Aang Browser',
      // The carved band IS the title bar; Windows draws its own buttons over the band's right end.
      // See-through (the research: Flow browser), so Windows' own minimise, maximise and close sit ON the wood
      // with their real hover and snap layouts, instead of on a flat block that looked stuck on.
      titleBarStyle: 'hidden', titleBarOverlay: { color: 'rgba(0,0,0,0)', symbolColor: '#FFE096', height: BAND_HEIGHT },
      webPreferences: { ...SAFE_WEB_PREFERENCES, preload: this.o.preloadPath },
    });
    lockDown(w.webContents);
    w.on('resize', () => this.place());
    w.on('maximize', () => this.place());
    w.on('unmaximize', () => this.place());
    w.on('close', () => { void this.snapshot(); });
    w.on('closed', () => {
      for (const t of this.tabs) this.closeView(t);
      this.tabs = []; this.active = null; this.win = null;
      this.timers.forEach(clearInterval); this.timers = [];
    });
    w.once('ready-to-show', () => w.show());
    w.webContents.once('did-finish-load', () => {
      if (!this.restore()) this.newTab(url ?? HOME);
      else if (url) this.newTab(url);
    });
    this.win = w;
    void w.loadURL(`${this.o.origin}/browser.html`);
    // The continuous snapshot, and putting idle tabs to sleep.
    this.timers.push(setInterval(() => { void this.snapshot(); }, 8000), setInterval(() => this.sleepIdle(), 60_000));
  }

  /** 6.19: the frame says how big its rail and band are; everything else follows from the window. */
  setInsets(left: number, top: number, right = 0, bottom = 0): void {
    if (![left, top, right, bottom].every(Number.isFinite)) return;
    const c = (n: number) => Math.max(0, Math.round(n));
    this.inset = { left: c(left), top: c(top), right: c(right), bottom: c(bottom) };
    this.place();
  }

  /** Put the active tab exactly in the page area. Synchronous, from the window's own content size. */
  private place(): void {
    const w = this.win;
    if (!w || w.isDestroyed()) return;
    const [cw, ch] = w.getContentSize();
    const t = this.cur();
    if (!t?.view) return;
    // A crashed page is moved out of the way so the frame's own plate shows; it is never touched.
    if (t.crashed || t.blocked) { t.view.setBounds({ x: 0, y: 0, width: 0, height: 0 }); return; }
    t.view.setBounds({ x: this.inset.left, y: this.inset.top, width: Math.max(0, cw - this.inset.left - this.inset.right), height: Math.max(0, ch - this.inset.top - this.inset.bottom) });
  }

  /** Give a tab a live page, at its address, then put it back where it was scrolled. */
  private wake(tab: Tab): void {
    // The safe preferences, but a tab in the background may sleep: unlike the pop-out it has no reason to
    // keep painting over his game. NOT lockDown(): that pins a window to one page, and a browser navigates.
    // tabpreload.cjs exposes nothing to the page; it only hides passkeys, which hang in Electron (6.22).
    const view = new WebContentsView({ webPreferences: { ...SAFE_WEB_PREFERENCES, backgroundThrottling: true, session: this.ses, preload: this.o.tabPreloadPath } });
    const wc = view.webContents;
    // A new view paints white until its page draws; that white is the flash between pages. Paint it the
    // page area's own colour instead, and keep it in the window, hidden, so switching to it is instant.
    view.setBackgroundColor(PAGE_COLOUR);
    try { view.setBorderRadius(PAGE_RADIUS); } catch { /* an older runtime: square corners */ }
    view.setVisible(false);
    this.win?.contentView.addChildView(view);
    tab.view = view; tab.crashed = false; tab.loading = true;
    wc.on('will-attach-webview', (e) => e.preventDefault());
    // A link that opens a new window becomes a tab under the one it came from. Web pages only.
    // A middle click or Ctrl+click opens it behind, the way every browser does.
    // "Block popups" (on unless he turns it off): a page opening a new WINDOW by itself is refused; a link he
    // opens in a new tab still opens as a tab.
    wc.setWindowOpenHandler(({ url: u, disposition }) => {
      if (this.prefs.popups && disposition === 'new-window') { console.log('shell: browser: popup refused'); return { action: 'deny' }; }
      if (isWeb(u)) this.newTab(u, tab.id, disposition !== 'background-tab');
      return { action: 'deny' };
    });
    // 6.22: a listed site never loads, whether it is a link, a redirect or anything else.
    wc.on('will-navigate', (e, u) => { if (!isWeb(u)) { e.preventDefault(); return; } const l = this.listed(u); if (l.length) { e.preventDefault(); this.block(tab, u, l); } });
    wc.on('will-redirect', (e, u, _inPage, isMain) => { if (!isMain) return; const l = isWeb(u) ? this.listed(u) : ['NOT A WEB PAGE']; if (l.length) { e.preventDefault(); this.block(tab, u, l); } });
    wc.on('did-start-navigation', (d) => { const x = d as unknown as { url: string; isMainFrame: boolean }; if (!x.isMainFrame || !isWeb(x.url)) return; const l = this.listed(x.url); if (l.length) this.block(tab, x.url, l); });
    wc.on('page-title-updated', (_e, title) => { tab.title = title; this.changed(); });
    wc.on('page-favicon-updated', (_e, icons) => { tab.favicon = icons.find((i) => /^https?:|^data:image\//.test(i)) ?? ''; this.sendTabs(); });
    wc.on('did-start-loading', () => { tab.loading = true; if (tab.crashed) { tab.crashed = false; this.place(); } this.sendTabs(); });
    wc.on('did-stop-loading', () => { tab.loading = false; this.sendTabs(); });
    wc.on('did-navigate', (_e, u) => { tab.url = u; tab.scrollY = 0; this.changed(); });
    wc.on('did-navigate-in-page', (_e, u) => { tab.url = u; this.changed(); });
    // Find on page: how many matches, and which one is lit. Only the tab he is looking at reports.
    wc.on('found-in-page', (_e, r) => { if (tab.id === this.active) this.win?.webContents.send('browser:found', { at: r.activeMatchOrdinal, of: r.matches }); });
    wc.on('audio-state-changed', (e) => { tab.audible = (e as unknown as { audible: boolean }).audible; this.sendTabs(); });
    // A crashed page goes blank and anything that pokes it hangs (tested 2026-10-04): mark it, never touch it.
    wc.on('render-process-gone', () => { tab.crashed = true; tab.loading = false; this.place(); this.sendTabs(); });
    // The keys work wherever the keyboard is, page or frame.
    wc.on('before-input-event', (e, input) => { if (this.key(input)) e.preventDefault(); });
    // Back where it was: the zoom at once, the scroll once the page has drawn.
    if (tab.zoom) wc.setZoomLevel(tab.zoom);
    if (tab.muted) wc.setAudioMuted(true);
    const back = tab.scrollY;
    if (back > 0) wc.once('did-finish-load', () => { void within(wc.executeJavaScript(`window.scrollTo(0, ${Math.round(back)})`, true), 1500, null); });
    const l = this.listed(tab.url);
    if (l.length) { this.block(tab, tab.url, l); return; }
    tab.blocked = null;
    void wc.loadURL(tab.url);
  }

  /** Put a tab to sleep: its page closes, its snapshot stays, the plaque sinks. */
  private sleep(tab: Tab): void {
    if (!tab.view) return;
    this.closeView(tab);
    tab.loading = false; tab.audible = false;
  }
  private closeView(tab: Tab): void {
    if (!tab.view) return;
    try { this.win?.contentView.removeChildView(tab.view); } catch { /* not shown */ }
    try { tab.view.webContents.close(); } catch { /* gone */ }
    tab.view = null;
  }
  private sleepIdle(): void {
    const now = Date.now();
    let any = false;
    for (const t of this.tabs) if (t.view && t.id !== this.active && !t.audible && now - t.lastSeen > SLEEP_AFTER_MS) { this.sleep(t); any = true; }
    if (any) this.sendTabs();
  }

  newTab(address: string, opener: number | null = null, focus = true): number | null {
    const w = this.win;
    if (!w || w.isDestroyed()) return null;
    const url = isWeb(address) ? address : addressFor(address);
    if (!url) return null;
    // "You don't have to start a trail. A link you open from a page joins that page's trail" (sheet 3). A loose
    // page that opens a link starts one, named after its site; nothing is ever sorted by guesswork here.
    let trail: number | null = null;
    const from = opener !== null ? this.tabs.find((x) => x.id === opener) : undefined;
    if (from) {
      if (from.trail === null && !from.done) { from.trail = this.addTrail(trailNameFor(from.url)); }
      trail = from.done ? null : from.trail;
    } else if (this.pendingTrail !== null) { trail = this.pendingTrail; }
    this.pendingTrail = null;
    const tab: Tab = { id: ++this.seq, view: null, opener, title: 'New tab', url, favicon: '', loading: true, audible: false, muted: false, crashed: false, scrollY: 0, zoom: 0, lastSeen: Date.now(), blocked: null, trail, done: false };
    // A child sits right under the last tab of its trail, so the trail reads top to bottom.
    if (from) {
      let at = this.tabs.indexOf(from);
      while (at + 1 < this.tabs.length && this.tabs[at + 1]!.opener !== null && this.tabs[at + 1]!.trail === trail && trail !== null) at++;
      this.tabs.splice(at + 1, 0, tab);
    } else this.tabs.push(tab);
    this.wake(tab);
    if (focus) this.activate(tab.id); else this.changed();
    return tab.id;
  }

  activate(id: number): void {
    const w = this.win;
    const t = this.tabs.find((x) => x.id === id);
    if (!w || w.isDestroyed() || !t) return;
    // Every live tab stays in the window; switching only shows one and hides the rest. Placed first, then
    // shown, so it never appears for a moment at the last tab's size.
    if (!t.view) this.wake(t);                         // an asleep tab wakes exactly where it was left
    this.active = id;
    t.lastSeen = Date.now();
    this.place();
    for (const x of this.tabs) if (x.id !== id && x.view) { try { x.view.webContents.stopFindInPage('clearSelection'); } catch { /* gone */ } }
    // With the drawer open the page stays hidden under it; closing the drawer shows whichever tab is current.
    if (!this.drawerOpen) t.view!.setVisible(true);
    for (const x of this.tabs) if (x.id !== id && x.view) x.view.setVisible(false);
    if (!t.crashed) t.view!.webContents.focus();
    this.changed();
  }

  close(id: number): void {
    const i = this.tabs.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [t] = this.tabs.splice(i, 1);
    if (isWeb(t!.url)) { this.closed.push(t!.url); if (this.closed.length > 25) this.closed.shift(); }
    this.closeView(t!);
    this.tidyTrails();
    if (this.active === id) {
      const next = this.tabs[Math.min(i, this.tabs.length - 1)];
      this.active = null;
      if (next) this.activate(next.id); else this.newTab(HOME);
    } else this.changed();
  }

  /** A click on one tab's plaque: show it, close it, or mute it. */
  tabAct(id: number, act: string): void {
    const t = this.tabs.find((x) => x.id === id);
    if (!t) return;
    if (act === 'show') this.activate(id);
    else if (act === 'close') this.close(id);
    else if (act === 'mute') { t.muted = !t.muted; t.view?.webContents.setAudioMuted(t.muted); this.changed(); }
    else if (act === 'reload') { if (t.view && !t.crashed) t.view.webContents.reload(); else if (t.id === this.active) this.act('reload'); }
    else if (act === 'done') this.markDone(id, true);
    else if (act === 'undone') this.markDone(id, false);
  }

  reopen(): void { const u = this.closed.pop(); if (u) this.newTab(u); }

  /** A tab's address, for the pop-out. */
  urlOf(id: number): string | null { const t = this.tabs.find((x) => x.id === id); return t && isWeb(t.url) ? t.url : null; }
  /** Pause whatever the tab is playing (it went to the pop-out). With a deadline: a dead page never hangs Aang. */
  pauseMedia(id: number): void {
    const wc = this.tabs.find((x) => x.id === id)?.view?.webContents;
    if (wc) void within(wc.executeJavaScript("document.querySelectorAll('video,audio').forEach(m=>{try{m.pause()}catch{}});true", true), 800, null);
  }

  // ------------------------------------------------------------------ trails and the done shelf (sheet 3 section 3)
  /** "+ New trail": the next tab he opens starts it. */
  private pendingTrail: number | null = null;
  private addTrail(name: string): number { const id = ++this.trailSeq; this.trails.push({ id, name, named: false }); return id; }
  /** A trail with nothing left in it goes. */
  private tidyTrails(): void { this.trails = this.trails.filter((tr) => tr.id === this.pendingTrail || this.tabs.some((t) => t.trail === tr.id && !t.done)); }
  newTrail(): void {
    this.pendingTrail = this.addTrail('NEW TRAIL');
    this.newTab(HOME);
    this.win?.webContents.send('browser:focusslot');
  }
  renameTrail(id: number, name: string): void {
    const tr = this.trails.find((x) => x.id === id);
    const n = String(name).replace(/\s+/g, ' ').trim().slice(0, 24).toUpperCase();
    if (!tr || !n) return;
    tr.name = n; tr.named = true;          // his name: Qwen never renames it
    this.changed();
  }
  /** Move a tab into a trail, out to loose (null), or into a brand-new trail ('new'). */
  moveTab(tabId: number, to: number | null | 'new'): void {
    const t = this.tabs.find((x) => x.id === tabId);
    if (!t) return;
    t.trail = to === 'new' ? this.addTrail(trailNameFor(t.url)) : (to !== null && this.trails.some((x) => x.id === to) ? to : null);
    t.done = false;
    this.tidyTrails();
    this.changed();
  }
  /** "Done is a quest turn-in": it drops to the DONE shelf. It is not closed, so he can always look back. */
  markDone(tabId: number, done: boolean): void {
    const t = this.tabs.find((x) => x.id === tabId);
    if (!t) return;
    t.done = done;
    this.tidyTrails();
    this.changed();
  }

  private cur(): Tab | undefined { return this.tabs.find((x) => x.id === this.active); }

  go(address: string): void {
    const url = addressFor(address);
    const t = this.cur();
    if (!url) return;
    if (!t?.view) { this.newTab(url); return; }
    t.crashed = false;
    const l = this.listed(url);
    if (l.length) { this.block(t, url, l); return; }
    t.blocked = null; this.place();
    void t.view.webContents.loadURL(url);
    t.view.webContents.focus();
  }

  act(what: string): void {
    const t = this.cur();
    const wc = t?.view?.webContents;
    switch (what) {
      case 'back': if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); break;
      case 'forward': if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); break;
      // A crashed page is rebuilt fresh from its snapshot, never reloaded in place (poking it hangs).
      case 'reload': if (t) { if (t.crashed) { this.closeView(t); this.activate(t.id); } else wc?.reload(); } break;
      case 'stop': wc?.stop(); break;
      case 'mute': if (t) { t.muted = !t.muted; wc?.setAudioMuted(t.muted); this.changed(); } break;
      case 'zoomin': if (wc && t) { t.zoom = Math.min(5, wc.getZoomLevel() + 0.5); wc.setZoomLevel(t.zoom); this.changed(); } break;
      case 'zoomout': if (wc && t) { t.zoom = Math.max(-5, wc.getZoomLevel() - 0.5); wc.setZoomLevel(t.zoom); this.changed(); } break;
      case 'zoomreset': if (wc && t) { t.zoom = 0; wc.setZoomLevel(0); this.changed(); } break;
      case 'newtab': this.newTab(HOME); this.win?.webContents.send('browser:focusslot'); break;
      case 'close': if (t) this.close(t.id); break;
      case 'reopen': this.reopen(); break;
      case 'drawer-open': void this.drawer(true); break;
      case 'drawer-close': void this.drawer(false); break;
      // The red plate: the safe way out, or (the held lever) in anyway, for this site, this run.
      case 'phishback': if (t) { t.blocked = null; if (wc?.navigationHistory.canGoBack()) { this.place(); wc.navigationHistory.goBack(); } else this.close(t.id); } break;
      // A look-alike: the real site, typed fresh, never the link that led here.
      case 'phishreal': if (t?.blocked?.real) { const u = 'https://' + t.blocked.real + '/'; t.blocked = null; this.place(); void wc?.loadURL(u); } break;
      case 'phishopen': if (t?.blocked) { try { this.letThrough.add(new URL(t.blocked.url).hostname); } catch { /* bad url */ } const u = t.blocked.url; t.blocked = null; this.place(); void wc?.loadURL(u); } break;
    }
  }

  /** Find on page (Ctrl+F): a new word searches from the top; Enter goes to the next, Shift+Enter back. */
  find(text: string, next: boolean, back: boolean): void {
    const wc = this.cur()?.view?.webContents;
    if (!wc) return;
    const q = String(text).slice(0, 200);
    if (!q) { wc.stopFindInPage('clearSelection'); this.win?.webContents.send('browser:found', { at: 0, of: 0 }); return; }
    wc.findInPage(q, { forward: !back, findNext: !next });
  }
  findStop(): void { this.cur()?.view?.webContents.stopFindInPage('keepSelection'); }

  /** The browser's keys, from the page or the frame. True when the key was ours. */
  key(i: Electron.Input): boolean {
    if (i.type !== 'keyDown') return false;
    const k = i.key.toLowerCase(), c = i.control || i.meta;
    if (c && i.shift && k === 't') { this.act('reopen'); return true; }
    if (c && k === 't') { this.act('newtab'); return true; }
    if (c && k === 'w') { this.act('close'); return true; }
    if (c && k === 'l') { this.win?.webContents.focus(); this.win?.webContents.send('browser:focusslot'); return true; }
    if (c && k === 'f') { this.win?.webContents.focus(); this.win?.webContents.send('browser:findopen'); return true; }
    if ((c && k === 'r') || k === 'f5') { this.act('reload'); return true; }
    if (i.alt && k === 'arrowleft') { this.act('back'); return true; }
    if (i.alt && k === 'arrowright') { this.act('forward'); return true; }
    if (c && (k === '=' || k === '+')) { this.act('zoomin'); return true; }
    if (c && k === '-') { this.act('zoomout'); return true; }
    if (c && k === '0') { this.act('zoomreset'); return true; }
    // Ctrl+1 to 8 go to that tab, Ctrl+9 to the last, as in Chrome.
    if (c && !i.shift && /^[1-9]$/.test(k)) {
      const n = k === '9' ? this.tabs[this.tabs.length - 1] : this.tabs[Number(k) - 1];
      if (n) this.activate(n.id);
      return true;
    }
    if (k === 'escape' && this.cur()?.loading) { this.act('stop'); return false; }
    if (c && k === 'tab') {
      const i2 = this.tabs.findIndex((x) => x.id === this.active);
      const n = this.tabs[(i2 + (i.shift ? -1 : 1) + this.tabs.length) % this.tabs.length];
      if (n) this.activate(n.id);
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- 6.21 the snapshot
  /** Something worth keeping changed: redraw now, and write the snapshot shortly (one write per burst). */
  private changed(): void {
    this.sendTabs();
    if (this.saveSoon) return;
    this.saveSoon = setTimeout(() => { this.saveSoon = null; void this.snapshot(); }, 1500);
  }

  /** Write every tab to disk. Scroll is asked of each live page with a deadline; a page that does not answer keeps its last. */
  private async snapshot(): Promise<void> {
    if (!this.tabs.length) return;
    await Promise.all(this.tabs.map(async (t) => {
      if (!t.view || t.crashed) return;
      const y = await within(t.view.webContents.executeJavaScript('window.scrollY', true) as Promise<number>, 800, t.scrollY);
      if (typeof y === 'number' && Number.isFinite(y)) t.scrollY = y;
    }));
    const data = {
      v: 1, at: new Date().toISOString(),
      active: Math.max(0, this.tabs.findIndex((x) => x.id === this.active)),
      tabs: this.tabs.filter((t) => isWeb(t.url)).map((t) => ({
        url: t.url, title: t.title, opener: t.opener === null ? null : this.tabs.findIndex((x) => x.id === t.opener),
        scrollY: Math.round(t.scrollY), zoom: t.zoom, muted: t.muted, trail: t.trail, done: t.done,
      })),
      trails: this.trails,
      closed: this.closed.slice(-25),
    };
    try { writeFileAtomic(this.file, JSON.stringify(data)); } catch (e) { console.error('shell: browser: the tabs could not be saved: ' + (e as Error).message); }
  }

  /** Bring every tab back from the last snapshot. Only the one he was on loads; the rest come back asleep. */
  private restore(): boolean {
    try {
      if (!existsSync(this.file)) return false;
      const s = JSON.parse(readFileSync(this.file, 'utf8'));
      const list = Array.isArray(s?.tabs) ? s.tabs.filter((t: { url?: unknown }) => typeof t?.url === 'string' && isWeb(t.url as string)).slice(0, 80) : [];
      if (!list.length) return false;
      const ids: number[] = [];
      for (const t of list) {
        const tab: Tab = { id: ++this.seq, view: null, opener: null, title: String(t.title ?? t.url).slice(0, 300), url: t.url, favicon: '',
          loading: false, audible: false, muted: t.muted === true, crashed: false, scrollY: Number(t.scrollY) || 0, zoom: Number(t.zoom) || 0, lastSeen: Date.now(), blocked: null,
          trail: Number.isInteger(t.trail) ? t.trail : null, done: t.done === true };
        ids.push(tab.id);
        this.tabs.push(tab);
      }
      list.forEach((t: { opener?: unknown }, i: number) => { const o = Number(t.opener); if (Number.isInteger(o) && o >= 0 && o < ids.length && o !== i) this.tabs[i]!.opener = ids[o]!; });
      if (Array.isArray(s.closed)) this.closed = s.closed.filter((u: unknown) => typeof u === 'string' && isWeb(u as string)).slice(-25);
      if (Array.isArray(s.trails)) this.trails = s.trails.filter((x: Partial<Trail>) => Number.isInteger(x?.id) && typeof x?.name === 'string')
        .map((x: Trail) => ({ id: x.id, name: x.name.slice(0, 24), named: x.named === true }));
      this.trailSeq = this.trails.reduce((m, x) => Math.max(m, x.id), 0);
      for (const t of this.tabs) if (t.trail !== null && !this.trails.some((x) => x.id === t.trail)) t.trail = null;
      this.tidyTrails();
      const a = Math.min(Math.max(0, Number(s.active) || 0), this.tabs.length - 1);
      this.activate(this.tabs[a]!.id);
      return true;
    } catch (e) { console.error('shell: browser: the saved tabs could not be read: ' + (e as Error).message); return false; }
  }

  /** The rail and the band redraw from this. Plain data only. */
  private sendTabs(): void {
    const w = this.win;
    if (!w || w.isDestroyed()) return;
    const t = this.cur();
    const wc = t?.view?.webContents;
    w.webContents.send('browser:tabs', {
      active: this.active,
      canBack: Boolean(wc?.navigationHistory.canGoBack()), canForward: Boolean(wc?.navigationHistory.canGoForward()),
      tabs: this.tabs.map((x) => ({ id: x.id, opener: x.opener, title: x.title, url: x.url, favicon: x.favicon, loading: x.loading, audible: x.audible, muted: x.muted, crashed: x.crashed, asleep: !x.view, blocked: x.blocked, trail: x.trail, done: x.done })),
      trails: this.trails,
      adsPaused: (() => { try { return this.paused.has(new URL(t?.url ?? '').hostname.replace(/^www\./, '')); } catch { return false; } })(),
      adsOn: Boolean(this.ads),
      sounds: this.sounds,
      prefs: this.prefs,
      // The page's zoom as he would say it: 100%, 120%... (Chromium's level is 20% per step).
      zoomPct: wc ? Math.round(Math.pow(1.2, wc.getZoomLevel()) * 100) : 100,
    });
    if (t) w.setTitle(`${t.title} - Aang Browser`);
  }

  closeAll(): void { if (this.win && !this.win.isDestroyed()) { void this.snapshot(); this.win.close(); } }
}
