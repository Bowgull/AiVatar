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
import { BrowserWindow, WebContentsView, app, clipboard, dialog, screen, session as electronSession } from 'electron';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { SAFE_WEB_PREFERENCES, denyPermissions, lockDown } from './safety.ts';
import { addressFor, searchFor } from './address.ts';
import { writeFileAtomic } from './atomic.ts';
import { lookalike } from './lookalike.ts';
import { softEdge } from './winedge.ts';
import { isBar, parseBookmarks, type Mark } from './bookmarks.ts';
import { Vault, fillScript, type Login } from './vault.ts';
import { createHmac, randomBytes } from 'node:crypto';

/** A site name scrambled with this PC's own key: the file alone says nothing about where he has accounts. */
const scramble = (key: string, host: string) => createHmac('sha256', key).update(host.toLowerCase()).digest('hex').slice(0, 32);
import { PhishCheck } from './phish.ts';
import { failureWords, isRisky, upgrade } from './secure.ts';
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
  /** Lent to the popout: the live page is playing over his game; the browser shows a plate where it was. */
  lent: boolean;
  scrollY: number;
  zoom: number;
  lastSeen: number;
  /** 6.22: stopped before loading because a list names it: which lists. */
  blocked: { url: string; lists: string[]; real?: string } | null;
  /** Sheet 3 section 3: the trail it belongs to (null = a loose tab), and whether he turned it in. */
  trail: number | null;
  done: boolean;
  /** HTTPS-first: the plain http address this load was upgraded from, until the secure one answers. */
  upgraded: string | null;
  /** The page did not load: no secure version (`insecure`), or any other failure, in plain words (6.22b bug 3). */
  failed: { kind: 'insecure' | 'error'; url: string; title: string; text: string; retry: boolean } | null;
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
/** Where a new tab opens until he sets his own in Settings (2026-10-12: not Google). */
const DEFAULT_HOME = 'https://search.brave.com/';
/** A plain Chrome's name for itself: Google refuses sign-in to anything calling itself Electron (his yes, 2026-10-12). */
const CHROME_UA = (v: string) => `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Safari/537.36`;
/**
 * Google's sign-in pages get the browser's HONEST name (Electron's own, untouched). Measured by two other Electron
 * browsers in 2026 (Orca: a Chrome disguise was refused 12 of 12 times, the honest name 0 of 12; Ostia the same) and
 * it is what Google's own 2020 rules for browsers ask: no pretending to be Chrome. Everywhere else, plain Chrome.
 * research_notes/Google sign-in in Aang browser.
 */
const GOOGLE_AUTH = /^https:\/\/accounts\.(google|youtube)\.com(\/|$)/i;
/** A popup that opens within this long of his click or key press is his (Chrome's own rule); later ones are a page's. */
const GESTURE_MS = 1000;
/** A tab not looked at for this long, and not playing sound, goes to sleep. */
const SLEEP_AFTER_MS = 30 * 60_000;
// The band's height (Windows draws its own buttons over it, see-through on the wood) and the page area's colour.
const BAND_HEIGHT = 58;
/** The page's corners, rounded natively: the floating page (2026-10-12) has big soft corners (Flow browser does this). */
const PAGE_RADIUS = 16;
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
  /** HTTPS-first: sites he chose to open without a secure version. Kept between runs. */
  private readonly httpOkFile: string;
  private httpOk = new Set<string>();
  /** Decision 18: sites he let download a program. Only his click on the chip adds to it. Kept between runs. */
  private readonly trustedFile: string;
  private trusted = new Set<string>();
  private askSeq = 0;
  /** The little wood sounds (new tab, close, download done). Off until he turns them on in Settings. */
  sounds = false;
  /** The ⋯ menu's switches (sheet 3 section 10), kept between runs. Block ads and Block popups start on. */
  prefs = { ads: true, popups: true, home: DEFAULT_HOME };
  /** His home page, or the default. Web pages only. */
  private get HOME(): string { return isWeb(this.prefs.home) ? this.prefs.home : DEFAULT_HOME; }
  /** Sites he let open popups by themselves ("Allow popups on this site"). Kept between runs. */
  private popupOk = new Set<string>();
  private readonly popupOkFile: string;
  /** When he last clicked or pressed a key in each tab: Chrome's user-activation rule for popups. */
  private lastGesture = new Map<number, number>();
  /** Scrambled list of the sites he has Bitwarden logins for (no names, no passwords), for the gold key. */
  private readonly sitesFile: string;
  private sites: Set<string> | null = null;
  private siteKey = '';
  private readonly prefsFile: string;
  /** Electron's own name for itself, kept for Google's sign-in pages. */
  private honestUA = '';
  /** A page's own name for the browser follows where it is going: honest on Google's sign-in, Chrome elsewhere. */
  private nameFor(wc: Electron.WebContents): void {
    wc.on('did-start-navigation', (d) => {
      const x = d as unknown as { url: string; isMainFrame: boolean; isSameDocument: boolean };
      if (!x.isMainFrame || x.isSameDocument) return;
      wc.setUserAgent(GOOGLE_AUTH.test(x.url) ? this.honestUA : CHROME_UA(process.versions.chrome));
    });
  }
  /** 6.23: his logins from Bitwarden, filled when he clicks the key. */
  private readonly vault = new Vault();
  /** The tab and site a fill was started for: a fill never lands on a page that changed since. */
  private vaultFor: { tab: number; host: string } | null = null;
  /** Does the page he is looking at have a password box? Then the key shows in the slot. */
  private hasLogin = false;
  /** Each site's icon, kept as a small picture so bookmarks always carry their icons, as in any browser. */
  private readonly iconsFile: string;
  private icons = new Map<string, string>();
  private iconsBusy = false;
  /** 6.23: his bookmarks. The bar ones show on the velvet shelf; all of them are kept. */
  private readonly marksFile: string;
  private marks: Mark[] = [];
  /** 6.22b bug 5: where the window was, kept between opens. */
  private readonly placeFile: string;
  /** 6.22b bug 1: the tab whose page asked for fullscreen (a video's own button): it fills the whole screen. */
  private fullTab: number | null = null;
  /** 6.22b bug 2: the right-click menu's own little window, kept hidden between uses. */
  private menu: BrowserWindow | null = null;
  private menuFor: { tab: number; p: Electron.ContextMenuParams } | null = null;
  private menuItems: unknown[] | null = null;
  /** The mouse's side buttons can arrive twice (window and page): one press, one step. */
  private lastNav = 0;
  constructor(o: BrowserOptions) {
    this.o = o;
    this.file = path.join(o.stateDir, 'browser-tabs.json');
    this.pausedFile = path.join(o.stateDir, 'adblock-paused.json');
    this.prefsFile = path.join(o.stateDir, 'browser-prefs.json');
    this.placeFile = path.join(o.stateDir, 'browser-window.json');
    this.marksFile = path.join(o.stateDir, 'browser-bookmarks.json');
    this.iconsFile = path.join(o.stateDir, 'browser-favicons.json');
    try { if (existsSync(this.iconsFile)) for (const [h, d] of Object.entries(JSON.parse(readFileSync(this.iconsFile, 'utf8')) as Record<string, unknown>)) if (typeof d === 'string' && d.startsWith('data:image/')) this.icons.set(h, d); } catch { /* none yet */ }
    setTimeout(() => { void this.fillMarkIcons(); }, 5000);
    this.popupOkFile = path.join(o.stateDir, 'browser-popups-ok.json');
    this.sitesFile = path.join(o.stateDir, 'vault-sites.json');
    try { if (existsSync(this.popupOkFile)) this.popupOk = new Set((JSON.parse(readFileSync(this.popupOkFile, 'utf8')) as unknown[]).filter((x): x is string => typeof x === 'string')); } catch { /* none */ }
    try {
      if (existsSync(this.sitesFile)) {
        const v = JSON.parse(readFileSync(this.sitesFile, 'utf8'));
        if (typeof v?.key === 'string' && Array.isArray(v.sites)) { this.siteKey = v.key; this.sites = new Set(v.sites.filter((x: unknown) => typeof x === 'string')); }
      }
    } catch { /* none yet */ }
    // Plain Chrome, everywhere in his browsing session, except Google's sign-in pages (above).
    this.honestUA = this.ses.getUserAgent();
    this.ses.setUserAgent(CHROME_UA(process.versions.chrome));
    this.ses.webRequest.onBeforeSendHeaders({ urls: ['https://accounts.google.com/*', 'https://accounts.youtube.com/*'] },
      (d, cb) => cb({ requestHeaders: { ...d.requestHeaders, 'User-Agent': this.honestUA } }));
    try {
      if (existsSync(this.marksFile)) {
        const a = JSON.parse(readFileSync(this.marksFile, 'utf8'));
        if (Array.isArray(a)) this.marks = a.filter((m: Partial<Mark>) => typeof m?.url === 'string' && isWeb(m.url) && typeof m.title === 'string')
          .map((m: Mark) => ({ title: m.title.slice(0, 200), url: m.url, folder: String(m.folder ?? '').slice(0, 80) })).slice(0, 5000);
      }
    } catch { /* none yet */ }
    this.httpOkFile = path.join(o.stateDir, 'browser-http-ok.json');
    this.trustedFile = path.join(o.stateDir, 'download-trusted.json');
    const loadSet = (f: string) => { try { if (existsSync(f)) { const a = JSON.parse(readFileSync(f, 'utf8')); if (Array.isArray(a)) return new Set(a.filter((x: unknown) => typeof x === 'string')); } } catch { /* none */ } return new Set<string>(); };
    this.httpOk = loadSet(this.httpOkFile);
    this.trusted = loadSet(this.trustedFile);
    try {
      if (existsSync(this.prefsFile)) {
        const p = JSON.parse(readFileSync(this.prefsFile, 'utf8'));
        this.sounds = p?.sounds === true;
        this.prefs = { ads: p?.ads !== false, popups: p?.popups !== false, home: typeof p?.home === 'string' && isWeb(p.home) ? p.home.slice(0, 2000) : DEFAULT_HOME };
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
      this.ask({ host, what }, done);
    });
    this.ses.setPermissionCheckHandler((_wc, permission) => permission === 'fullscreen');
  }
  /** Hang a chip from the band and wait for his answer. Unanswered in 2 minutes means no. */
  private ask(a: { host: string; what: string; text?: string; yes?: string; no?: string }, done: (allow: boolean) => void): void {
    if (!this.win || this.win.isDestroyed()) { done(false); return; }
    const id = ++this.askSeq;
    const timer = setTimeout(() => { const f = this.asks.get(id); if (f) { this.asks.delete(id); f(false); } }, 120_000);
    this.asks.set(id, (allow) => { clearTimeout(timer); done(allow); });
    this.win.webContents.send('browser:ask', { id, ...a });
  }
  /** His answer to the chip. */
  answer(id: number, allow: boolean): void { const f = this.asks.get(id); if (f) { this.asks.delete(id); f(allow); } }

  /**
   * 6.22: downloads go to his Downloads folder and are marked as from the internet (the Mark of the Web),
   * so Windows Defender and SmartScreen check them before anything opens them, exactly as for Chrome.
   */
  private downloads(): void {
    this.ses.on('will-download', (_e, item, wc) => {
      const dir = app.getPath('downloads');
      const base = item.getFilename().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_') || 'download';
      let to = path.join(dir, base), n = 1;
      while (existsSync(to)) { const p = path.parse(base); to = path.join(dir, `${p.name} (${n++})${p.ext}`); }
      item.setSavePath(to);
      const from = item.getURL();
      // Decision 18: a program or a script from a site he has not trusted waits for one yes in a chip. The site
      // is the page he was on (a download often comes from some other server behind it). Unanswered = no.
      if (isRisky(base)) {
        let site = '';
        try { site = new URL(wc?.getURL() || from).hostname.replace(/^www\./, ''); } catch { /* unknown */ }
        if (!site || !this.trusted.has(site)) {
          item.pause();
          this.ask({ host: site, what: `Download ${base}?`, text: `It is a program, and ${site || 'this site'} has not given you one before. Only say yes if you meant to get it.`, yes: 'Download, trust this site', no: 'No' }, (allow) => {
            if (item.getState() !== 'progressing') return;
            if (!allow) { item.cancel(); return; }
            if (site) { this.trusted.add(site); try { writeFileAtomic(this.trustedFile, JSON.stringify([...this.trusted])); } catch { /* best effort */ } }
            item.resume();
          });
        }
      }
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

  /** HTTPS-first: the address to really load, the secure one when it exists. Remembers what it upgraded. */
  private secured(tab: Tab, url: string): string {
    const up = upgrade(url, this.httpOk);
    tab.upgraded = up ? url : null;
    return up ?? url;
  }
  /** The page did not load: the frame's own plate shows where it would be. */
  private fail(tab: Tab, f: NonNullable<Tab['failed']>): void {
    tab.failed = f;
    tab.loading = false;
    tab.upgraded = null;
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

  /** His home page, typed into Settings: a web address only. Empty puts the default back. */
  setHome(text: string): void {
    const t = String(text ?? '').trim();
    const u = t ? addressFor(t) : DEFAULT_HOME;
    if (!u || !isWeb(u)) { this.note('That is not a web address.'); return; }
    this.prefs.home = u;
    this.savePrefs();
    this.note(t ? 'Home page saved.' : 'Home page set back to Brave Search.');
    this.sendTabs();
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
    if (!open) { this.place(); if (t?.view && !t.lent) t.view.setVisible(true); w.webContents.send('browser:frozen', null); return; }
    let shot: string | null = null;
    if (t?.view && !t.crashed && !t.blocked && !t.failed && !t.lent) {
      try { const img = await within(t.view.webContents.capturePage(), 600, null); if (img && !img.isEmpty()) shot = 'data:image/jpeg;base64,' + img.toJPEG(82).toString('base64'); }
      catch { /* no picture: the page area shows its own colour */ }
    }
    if (!this.drawerOpen) return;               // closed again while the picture was taken
    w.webContents.send('browser:frozen', shot);
    if (t?.view && !t.lent) t.view.setVisible(false);
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
    const was = this.savedPlace();
    const w = new BrowserWindow({
      width: Math.min(1440, wa.width - 80), height: Math.min(900, wa.height - 60), minWidth: 720, minHeight: 480,
      ...(was ? { x: was.x, y: was.y, width: was.width, height: was.height } : {}),
      show: false, backgroundColor: '#24160D', title: 'Aang Browser',
      // The carved band IS the title bar; Windows draws its own buttons over the band's right end.
      // See-through (the research: Flow browser), so Windows' own minimise, maximise and close sit ON the wood
      // with their real hover and snap layouts, instead of on a flat block that looked stuck on.
      // His pick (2026-10-12): Aang draws his own bold gold minimise, maximise and close on the band; Windows' were too thin.
      titleBarStyle: 'hidden',
      webPreferences: { ...SAFE_WEB_PREFERENCES, preload: this.o.preloadPath },
    });
    lockDown(w.webContents);
    softEdge(w);
    if (was?.maximized) w.once('ready-to-show', () => w.maximize());
    let keep: NodeJS.Timeout | null = null;
    const keepSoon = () => { if (keep) clearTimeout(keep); keep = setTimeout(() => this.keepPlace(), 800); };
    w.on('resize', () => { this.place(); keepSoon(); });
    w.on('move', keepSoon);
    w.on('maximize', () => { this.place(); keepSoon(); this.sendTabs(); });
    w.on('unmaximize', () => { this.place(); keepSoon(); this.sendTabs(); });
    w.on('close', () => { this.keepPlace(); void this.snapshot(); });
    // 6.22b bug 4: the mouse's back and forward side buttons.
    w.on('app-command', (_e, cmd) => { if (cmd === 'browser-backward') this.sideNav('back'); else if (cmd === 'browser-forward') this.sideNav('forward'); });
    // A page in fullscreen: leaving the window's fullscreen (F11, a snap) ends it too.
    w.on('leave-full-screen', () => { const t = this.tabs.find((x) => x.id === this.fullTab); if (t?.view) void within(t.view.webContents.executeJavaScript('document.fullscreenElement&&document.exitFullscreen().catch(()=>{});true', true), 500, null); });
    w.on('closed', () => {
      if (this.menu && !this.menu.isDestroyed()) this.menu.destroy();
      this.vault.lock();                          // closing the browser locks the vault
      this.menu = null; this.fullTab = null;
      for (const t of this.tabs) if (!t.lent) this.closeView(t);
      this.tabs = []; this.active = null; this.win = null;
      this.timers.forEach(clearInterval); this.timers = [];
    });
    w.once('ready-to-show', () => w.show());
    w.webContents.once('did-finish-load', () => {
      if (!this.restore()) this.newTab(url ?? this.HOME);
      else if (url) this.newTab(url);
    });
    this.win = w;
    void w.loadURL(`${this.o.origin}/browser.html`);
    // The continuous snapshot, and putting idle tabs to sleep.
    this.timers.push(setInterval(() => { void this.snapshot(); }, 8000), setInterval(() => this.sleepIdle(), 60_000),
      setInterval(() => { void this.lookForLogin(); }, 1500));
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
    if (!t?.view || t.lent) return;
    // A crashed page is moved out of the way so the frame's own plate shows; it is never touched.
    if (t.crashed || t.blocked || t.failed) { t.view.setBounds({ x: 0, y: 0, width: 0, height: 0 }); return; }
    if (this.fullTab === t.id) { t.view.setBounds({ x: 0, y: 0, width: cw, height: ch }); return; }
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
    this.nameFor(wc);
    // A link that opens a new window becomes a tab under the one it came from. Web pages only.
    // A middle click or Ctrl+click opens it behind, the way every browser does.
    // "Block popups" (on unless he turns it off): a page opening a new WINDOW by itself is refused; a link he
    // opens in a new tab still opens as a tab.
    // Popups (his pick, 2026-10-12, Chrome's rule): one opened within a second of his click or key press is his, and
    // opens as a real small window that keeps its link to the page (Sign in with Google needs that). One a page opens
    // by itself is blocked, unless he allowed popups on that site; a chip offers that.
    wc.on('input-event', (_e, i) => { if (i.type === 'mouseDown' || i.type === 'keyDown') this.lastGesture.set(tab.id, Date.now()); });
    wc.setWindowOpenHandler(({ url: u, disposition }) => {
      if (!isWeb(u)) return { action: 'deny' };
      if (disposition === 'new-window') {
        let site = '';
        try { site = new URL(wc.getURL()).hostname.replace(/^www\./, ''); } catch { /* none */ }
        const his = Date.now() - (this.lastGesture.get(tab.id) ?? 0) < GESTURE_MS;
        if (this.listed(u).length) return { action: 'deny' };
        if (!this.prefs.popups || his || this.popupOk.has(site)) {
          return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 680, autoHideMenuBar: true, backgroundColor: PAGE_COLOUR,
            title: 'Aang Browser', webPreferences: { ...SAFE_WEB_PREFERENCES, session: this.ses, preload: this.o.tabPreloadPath } } };
        }
        console.log('shell: browser: popup blocked');
        this.ask({ host: site, what: 'Popup blocked', text: `${site || 'This page'} tried to open a window by itself.`, yes: 'Allow popups on this site', no: 'Keep blocking' }, (allow) => {
          if (!allow || !site) return;
          this.popupOk.add(site);
          try { writeFileAtomic(this.popupOkFile, JSON.stringify([...this.popupOk])); } catch { /* best effort */ }
          this.newTab(u, tab.id, true);
        });
        return { action: 'deny' };
      }
      this.newTab(u, tab.id, disposition !== 'background-tab');
      return { action: 'deny' };
    });
    wc.on('did-create-window', (pw) => this.popupWindow(pw));
    // 6.22: a listed site never loads, whether it is a link, a redirect or anything else.
    wc.on('will-navigate', (e, u) => {
      if (!isWeb(u)) { e.preventDefault(); return; }
      const l = this.listed(u);
      if (l.length) { e.preventDefault(); this.block(tab, u, l); return; }
      const up = upgrade(u, this.httpOk);
      if (up) { e.preventDefault(); tab.upgraded = u; setTimeout(() => { if (!wc.isDestroyed()) void wc.loadURL(up).catch(() => {}); }, 0); }
    });
    wc.on('will-redirect', (e, u, _inPage, isMain) => {
      if (!isMain) return;
      const l = isWeb(u) ? this.listed(u) : ['NOT A WEB PAGE'];
      if (l.length) { e.preventDefault(); this.block(tab, u, l); return; }
      const up = upgrade(u, this.httpOk);
      if (!up) return;
      e.preventDefault();
      // The secure version sent us straight back to the plain one: it has no secure version.
      let back = false;
      try { back = tab.upgraded !== null && new URL(tab.upgraded).hostname === new URL(u).hostname; } catch { /* no */ }
      if (back) { this.fail(tab, { kind: 'insecure', url: u, title: "This site isn't secure", text: '', retry: false }); return; }
      tab.upgraded = u;
      setTimeout(() => { if (!wc.isDestroyed()) void wc.loadURL(up).catch(() => {}); }, 0);
    });
    // A new page clears the last failure; a different site forgets the upgrade.
    wc.on('did-start-navigation', (d) => {
      const x = d as unknown as { url: string; isMainFrame: boolean; isSameDocument: boolean };
      if (!x.isMainFrame || x.isSameDocument) return;
      if (tab.failed) { tab.failed = null; this.place(); this.changed(); }
      try { if (tab.upgraded && new URL(tab.upgraded).hostname !== new URL(x.url).hostname) tab.upgraded = null; } catch { tab.upgraded = null; }
    });
    // The page did not load: Aang's own plate instead of Chromium's grey page. Cancelled loads (-3) are not failures.
    wc.on('did-fail-load', (_e, code, _desc, url, isMain) => {
      if (!isMain || code === -3 || !isWeb(url)) return;
      let host = '';
      try { host = new URL(url).hostname; } catch { /* keep */ }
      let wasUp = false;
      try { wasUp = tab.upgraded !== null && url.startsWith('https:') && new URL(tab.upgraded).hostname === host; } catch { /* no */ }
      if (wasUp && code !== -106 && code !== -105) this.fail(tab, { kind: 'insecure', url: tab.upgraded!, title: "This site isn't secure", text: '', retry: false });
      else this.fail(tab, { kind: 'error', url, ...failureWords(code, host) });
    });
    wc.on('did-start-navigation', (d) => { const x = d as unknown as { url: string; isMainFrame: boolean }; if (!x.isMainFrame || !isWeb(x.url)) return; const l = this.listed(x.url); if (l.length) this.block(tab, x.url, l); });
    wc.on('page-title-updated', (_e, title) => { tab.title = title; this.changed(); });
    wc.on('page-favicon-updated', (_e, icons) => {
      tab.favicon = icons.find((i) => /^https?:|^data:image\//.test(i)) ?? '';
      this.sendTabs();
      // Keep it for the site's bookmark, so the shelf shows it even before he visits again.
      try { const host = new URL(wc.getURL()).hostname; if (tab.favicon && !this.icons.has(host)) void this.keepIcon(host, tab.favicon); } catch { /* none */ }
    });
    wc.on('did-start-loading', () => { tab.loading = true; if (tab.crashed) { tab.crashed = false; this.place(); } this.sendTabs(); });
    wc.on('did-stop-loading', () => { tab.loading = false; this.sendTabs(); });
    wc.on('did-navigate', (_e, u, status) => { tab.url = u; tab.scrollY = 0; if (status > 0) tab.upgraded = null; this.changed(); });
    wc.on('did-navigate-in-page', (_e, u) => { tab.url = u; this.changed(); });
    // Find on page: how many matches, and which one is lit. Only the tab he is looking at reports.
    wc.on('found-in-page', (_e, r) => { if (tab.id === this.active) this.win?.webContents.send('browser:found', { at: r.activeMatchOrdinal, of: r.matches }); });
    // 6.22b bug 1: a page's own fullscreen (a video's button) fills the whole screen, band and drawer gone; it
    // comes back exactly as it was when the page leaves fullscreen (its button, or Esc).
    wc.on('enter-html-full-screen', () => {
      const w = this.win;
      if (!w || w.isDestroyed() || tab.lent) return;
      this.fullTab = tab.id;
      try { view.setBorderRadius(0); } catch { /* square anyway */ }
      w.setFullScreen(true);
      this.place();
    });
    wc.on('leave-html-full-screen', () => {
      if (this.fullTab !== tab.id) return;
      this.fullTab = null;
      try { view.setBorderRadius(PAGE_RADIUS); } catch { /* an older runtime */ }
      if (this.win && !this.win.isDestroyed() && this.win.isFullScreen()) this.win.setFullScreen(false);
      this.place();
    });
    // 6.22b bug 2: right-click on the page opens Aang's own wood menu.
    wc.on('context-menu', (_e, p) => this.pageMenu(tab, p));
    wc.on('audio-state-changed', (e) => { tab.audible = (e as unknown as { audible: boolean }).audible; this.sendTabs(); });
    // A crashed page goes blank and anything that pokes it hangs (tested 2026-10-04): mark it, never touch it.
    wc.on('render-process-gone', () => { tab.crashed = true; tab.loading = false; this.place(); this.sendTabs(); });
    // The keys work wherever the keyboard is, page or frame.
    // Not while it is lent to the popout: Ctrl+W there must not close a tab in here.
    wc.on('before-input-event', (e, input) => { if (!tab.lent && this.key(input)) e.preventDefault(); });
    // Back where it was: the zoom at once, the scroll once the page has drawn.
    if (tab.zoom) wc.setZoomLevel(tab.zoom);
    if (tab.muted) wc.setAudioMuted(true);
    const back = tab.scrollY;
    if (back > 0) wc.once('did-finish-load', () => { void within(wc.executeJavaScript(`window.scrollTo(0, ${Math.round(back)})`, true), 1500, null); });
    const l = this.listed(tab.url);
    if (l.length) { this.block(tab, tab.url, l); return; }
    tab.blocked = null;
    void wc.loadURL(this.secured(tab, tab.url)).catch(() => {});
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
    for (const t of this.tabs) if (t.view && !t.lent && t.id !== this.active && !t.audible && now - t.lastSeen > SLEEP_AFTER_MS) { this.sleep(t); any = true; }
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
    const tab: Tab = { id: ++this.seq, view: null, opener, title: 'New tab', url, favicon: '', loading: true, audible: false, muted: false, crashed: false, scrollY: 0, zoom: 0, lastSeen: Date.now(), blocked: null, trail, done: false, lent: false, upgraded: null, failed: null };
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
    if (t.lent) {
      // Its page is in the popout: the frame shows "playing in the popout" where it was.
      this.active = id;
      for (const x of this.tabs) if (x.view && !x.lent) x.view.setVisible(false);
      this.changed();
      return;
    }
    if (!t.view) this.wake(t);                         // an asleep tab wakes exactly where it was left
    this.active = id;
    t.lastSeen = Date.now();
    this.place();
    for (const x of this.tabs) if (x.id !== id && x.view) { try { x.view.webContents.stopFindInPage('clearSelection'); } catch { /* gone */ } }
    // With the drawer open the page stays hidden under it; closing the drawer shows whichever tab is current.
    if (!this.drawerOpen) t.view!.setVisible(true);
    for (const x of this.tabs) if (x.id !== id && x.view && !x.lent) x.view.setVisible(false);
    if (!t.crashed) t.view!.webContents.focus();
    this.changed();
  }

  close(id: number): void {
    const i = this.tabs.findIndex((x) => x.id === id);
    if (i < 0) return;
    // A tab playing in the popout comes back first, so its page is closed here and nowhere else.
    if (this.tabs[i]!.lent) this.onReclaim?.();
    const [t] = this.tabs.splice(i, 1);
    if (isWeb(t!.url)) { this.closed.push(t!.url); if (this.closed.length > 25) this.closed.shift(); }
    this.closeView(t!);
    this.tidyTrails();
    if (this.active === id) {
      const next = this.tabs[Math.min(i, this.tabs.length - 1)];
      this.active = null;
      if (next) this.activate(next.id); else this.newTab(this.HOME);
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

  /**
   * A popup he opened (Sign in with Google and the like): the same safety as a tab. Its real address is its title,
   * so a fake sign-in window cannot hide where it is. Web pages only, fake sites refused, no popups of its own
   * except the same Chrome rule, and it closes itself when the sign-in is done.
   */
  private popupWindow(pw: BrowserWindow): void {
    const pwc = pw.webContents;
    softEdge(pw);
    this.nameFor(pwc);
    try { if (GOOGLE_AUTH.test(pwc.getURL())) pwc.setUserAgent(this.honestUA); } catch { /* not yet */ }
    const name = () => { try { const u = new URL(pwc.getURL()); pw.setTitle(`${u.protocol === 'https:' ? '' : 'NOT SECURE  '}${u.hostname}  -  ${pwc.getTitle()}`.slice(0, 200)); } catch { /* not yet */ } };
    pwc.on('page-title-updated', name);
    pwc.on('did-navigate', name);
    const stop = (e: Electron.Event, u: string) => {
      if (!isWeb(u)) { e.preventDefault(); return; }
      if (this.listed(u).length) { e.preventDefault(); pw.close(); this.note('A popup tried to open a site on the fake-site lists. It was closed.'); }
    };
    pwc.on('will-navigate', stop);
    pwc.on('will-redirect', (e, u, _inPage, isMain) => { if (isMain) stop(e, u); });
    pwc.setWindowOpenHandler(({ url: u }) => { if (isWeb(u) && !this.listed(u).length) this.newTab(u, this.active, true); return { action: 'deny' }; });
    pwc.on('will-attach-webview', (e) => e.preventDefault());
  }

  // ------------------------------------------------------------------ 6.22b: side buttons, the window's place, the right-click menu
  private sideNav(dir: 'back' | 'forward'): void {
    const now = Date.now();
    if (now - this.lastNav < 250) return;
    this.lastNav = now;
    this.act(dir);
  }

  /** Where the window was last time, if that spot is still on a screen he has. */
  private savedPlace(): { x: number; y: number; width: number; height: number; maximized: boolean } | null {
    try {
      if (!existsSync(this.placeFile)) return null;
      const p = JSON.parse(readFileSync(this.placeFile, 'utf8'));
      const r = { x: Math.round(p.x), y: Math.round(p.y), width: Math.round(p.width), height: Math.round(p.height) };
      if (!Object.values(r).every(Number.isFinite) || r.width < 720 || r.height < 480) return null;
      // At least a good piece of the band must land on a screen, or it opens where it opens by default.
      const ok = screen.getAllDisplays().some((d) => {
        const a = d.workArea;
        const w = Math.min(r.x + r.width, a.x + a.width) - Math.max(r.x, a.x);
        return w >= 200 && r.y >= a.y - 8 && r.y + 40 <= a.y + a.height;
      });
      return ok ? { ...r, maximized: p.maximized === true } : null;
    } catch { return null; }
  }
  private keepPlace(): void {
    const w = this.win;
    if (!w || w.isDestroyed() || w.isMinimized() || w.isFullScreen()) return;
    const b = w.getNormalBounds();
    try { writeFileAtomic(this.placeFile, JSON.stringify({ ...b, maximized: w.isMaximized() })); } catch { /* best effort */ }
  }

  /** Build the right-click menu for what was clicked: a link, a picture, selected words, a text box, or the page. */
  private pageMenu(tab: Tab, p: Electron.ContextMenuParams): void {
    const w = this.win;
    const wc = tab.view?.webContents;
    if (!w || w.isDestroyed() || !wc || tab.lent) return;
    type Item = { id: string; label: string; key?: string; off?: boolean } | { sep: true };
    const items: Item[] = [];
    const sep = () => { if (items.length && !('sep' in items[items.length - 1]!)) items.push({ sep: true }); };
    if (p.linkURL && isWeb(p.linkURL)) { items.push({ id: 'linktab', label: 'Open link in new tab' }, { id: 'linkcopy', label: 'Copy link' }); sep(); }
    if (p.mediaType === 'image' && p.srcURL && /^(https?:|data:image\/)/.test(p.srcURL)) { items.push({ id: 'imgsave', label: 'Save image' }, { id: 'imgcopy', label: 'Copy image' }); sep(); }
    const words = p.selectionText.replace(/\s+/g, ' ').trim();
    if (p.isEditable) {
      const f = p.editFlags;
      items.push({ id: 'cut', label: 'Cut', key: 'CTRL X', off: !f.canCut }, { id: 'copy', label: 'Copy', key: 'CTRL C', off: !f.canCopy },
        { id: 'paste', label: 'Paste', key: 'CTRL V', off: !f.canPaste }, { id: 'selectall', label: 'Select all', key: 'CTRL A', off: !f.canSelectAll });
      sep();
    } else if (words) {
      items.push({ id: 'copy', label: 'Copy', key: 'CTRL C' }, { id: 'search', label: `Search for "${words.length > 28 ? words.slice(0, 27) + '…' : words}"` });
      sep();
    }
    items.push({ id: 'back', label: 'Back', key: 'ALT ←', off: !wc.navigationHistory.canGoBack() }, { id: 'reload', label: 'Reload', key: 'CTRL R' });
    this.menuFor = { tab: tab.id, p };
    this.menuItems = items;
    const m = this.ensureMenu();
    if (!m.webContents.isLoading()) m.webContents.send('pagemenu:items', items);
  }
  private ensureMenu(): BrowserWindow {
    if (this.menu && !this.menu.isDestroyed()) return this.menu;
    const m = new BrowserWindow({
      parent: this.win ?? undefined, frame: false, show: false, resizable: false, movable: false, minimizable: false, maximizable: false,
      fullscreenable: false, skipTaskbar: true, width: 220, height: 120, backgroundColor: '#3A2414', title: 'Menu',
      webPreferences: { ...SAFE_WEB_PREFERENCES, preload: this.o.preloadPath },
    });
    lockDown(m.webContents);
    m.on('blur', () => this.hideMenu());
    m.webContents.once('did-finish-load', () => { if (this.menuItems) m.webContents.send('pagemenu:items', this.menuItems); });
    void m.loadURL(`${this.o.origin}/pagemenu.html`);
    this.menu = m;
    return m;
  }
  private hideMenu(): void { this.menuItems = null; if (this.menu && !this.menu.isDestroyed() && this.menu.isVisible()) this.menu.hide(); }
  isMenu(sender: Electron.WebContents): boolean { return Boolean(this.menu && !this.menu.isDestroyed() && sender === this.menu.webContents); }
  /** The menu measured itself: put it at the pointer, flipped so it never leaves the screen. */
  menuSize(width: number, height: number): void {
    const m = this.menu;
    if (!m || m.isDestroyed() || !this.menuItems) return;
    const w = Math.min(340, Math.max(160, Math.round(width))), h = Math.min(600, Math.max(30, Math.round(height)));
    const pt = screen.getCursorScreenPoint();
    const a = screen.getDisplayNearestPoint(pt).workArea;
    const x = pt.x + w > a.x + a.width ? Math.max(a.x, pt.x - w) : pt.x;
    const y = pt.y + h > a.y + a.height ? Math.max(a.y, pt.y - h) : pt.y;
    m.setBounds({ x, y, width: w, height: h });
    m.show();
    m.focus();
  }
  /** He picked something (or '' for nothing). Everything happens to the tab he right-clicked. */
  menuPick(id: string): void {
    const f = this.menuFor;
    this.menuFor = null;
    this.hideMenu();
    const t = f ? this.tabs.find((x) => x.id === f.tab) : undefined;
    const wc = t?.view?.webContents;
    if (!f || !t || !wc || wc.isDestroyed()) return;
    const p = f.p;
    wc.focus();
    switch (id) {
      case 'linktab': if (isWeb(p.linkURL)) this.newTab(p.linkURL, t.id, false); break;
      case 'linkcopy': if (isWeb(p.linkURL)) clipboard.writeText(p.linkURL); break;
      case 'imgsave': if (p.srcURL) wc.downloadURL(p.srcURL); break;
      case 'imgcopy': wc.copyImageAt(p.x, p.y); break;
      case 'cut': wc.cut(); break;
      case 'copy': wc.copy(); break;
      case 'paste': wc.paste(); break;
      case 'selectall': wc.selectAll(); break;
      case 'search': { const q = p.selectionText.replace(/\s+/g, ' ').trim().slice(0, 400); if (q) this.newTab(searchFor(q), t.id, true); break; }
      case 'back': if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); break;
      case 'reload': wc.reload(); break;
    }
  }

  // ------------------------------------------------------------------ 6.23 the vault (Bitwarden)
  /** A password box on the page he is looking at? Read-only, with a deadline. Secure pages only. */
  private async lookForLogin(): Promise<void> {
    const t = this.cur();
    const wc = t?.view?.webContents;
    let has = false;
    if (wc && !t!.crashed && !t!.blocked && !t!.failed && !t!.lent && t!.url.startsWith('https:')) {
      has = await within(wc.executeJavaScript("!!document.querySelector('input[type=password]')", true) as Promise<boolean>, 800, false) === true;
    }
    // His pick: the key shows only where Bitwarden has a login for this site. Until the vault has been opened once
    // there is no list yet, so it shows on any login page, plain, so he can open it the first time.
    let known = false;
    if (has && this.sites) { let host = ''; try { host = new URL(t!.url).hostname; } catch { /* none */ } known = this.siteKnown(host); has = known; }
    if (has !== this.hasLogin || known !== this.loginKnown) { this.hasLogin = has; this.loginKnown = known; this.sendTabs(); }
  }
  private loginKnown = false;
  /** The site and its parent domains, scrambled with this PC's own key, against the list. */
  private siteKnown(host: string): boolean {
    if (!this.sites || !host) return false;
    const parts = host.toLowerCase().split('.');
    for (let i = 0; i < parts.length - 1; i++) if (this.sites.has(scramble(this.siteKey, parts.slice(i).join('.')))) return true;
    return false;
  }
  /** After an unlock: which sites have logins, kept only as scrambled names. */
  private async learnSites(): Promise<void> {
    const hosts = await this.vault.loginHosts();
    if (!hosts) return;
    if (!this.siteKey) this.siteKey = randomBytes(32).toString('hex');
    this.sites = new Set(hosts.map((h) => scramble(this.siteKey, h)));
    try { writeFileAtomic(this.sitesFile, JSON.stringify({ key: this.siteKey, sites: [...this.sites] })); } catch { /* best effort */ }
    void this.lookForLogin();
  }
  private note(text: string): void { this.win?.webContents.send('browser:download', { name: '', state: 'note', text }); }
  /** He clicked the key. */
  async vaultKey(): Promise<void> {
    const t = this.cur();
    if (!t || !t.view || !t.url.startsWith('https:')) { this.note('Logins are only filled on secure pages.'); return; }
    let host = '';
    try { host = new URL(t.url).hostname; } catch { return; }
    this.vaultFor = { tab: t.id, host };
    const s = await this.vault.state();
    if (s === 'missing') { this.note("Bitwarden's tool is not on this PC yet."); return; }
    if (s === 'signed-out') { this.note('Sign in to Bitwarden once first, yourself: in PowerShell run  & "$env:LOCALAPPDATA\\Programs\\BitwardenCLI\\bw.exe" login'); return; }
    if (s === 'locked') { this.win?.webContents.send('browser:vault', { mode: 'unlock', host }); return; }
    await this.vaultList();
  }
  /** His master password, straight from the frame's box. Used once by bw, never kept, never logged. */
  async vaultUnlock(password: string): Promise<void> {
    const f = this.vaultFor;
    if (!f) return;
    const ok = await this.vault.unlock(password);
    if (!ok) { this.win?.webContents.send('browser:vault', { mode: 'unlock', host: f.host, wrong: true }); return; }
    void this.learnSites();
    await this.vaultList();
  }
  private async vaultList(): Promise<void> {
    const f = this.vaultFor;
    const t = f ? this.tabs.find((x) => x.id === f.tab) : undefined;
    if (!f || !t) return;
    const logins: Login[] | null = await this.vault.loginsFor(t.url);
    if (logins === null) { this.note('Bitwarden did not answer. Try the key again.'); return; }
    if (!logins.length) { this.win?.webContents.send('browser:vault', null); this.note(`No saved login for ${f.host} in your Bitwarden.`); return; }
    if (logins.length === 1) { await this.vaultPick(logins[0]!.id); return; }
    this.win?.webContents.send('browser:vault', { mode: 'pick', host: f.host, logins });
  }
  /** Fill one login into the page, if it is still the page he clicked the key on. */
  async vaultPick(id: string): Promise<void> {
    const f = this.vaultFor;
    this.vaultFor = null;
    this.win?.webContents.send('browser:vault', null);
    const t = f ? this.tabs.find((x) => x.id === f.tab) : undefined;
    const wc = t?.view?.webContents;
    if (!f || !t || !wc || wc.isDestroyed() || t.blocked || t.failed) return;
    let host = '';
    try { host = new URL(wc.getURL()).hostname; } catch { /* none */ }
    if (host !== f.host || !wc.getURL().startsWith('https:')) { this.note('The page changed, so nothing was filled. Click the key again.'); return; }
    const s = await this.vault.secret(id);
    if (!s) { this.note('Bitwarden did not give that login back. Try the key again.'); return; }
    const did = await within(wc.executeJavaScriptInIsolatedWorld(1001, [{ code: fillScript(s.username, s.password) }]) as Promise<number>, 2000, 0);
    if (!did) this.note('No login box found on this page to fill.');
  }
  vaultCancel(): void { this.vaultFor = null; this.win?.webContents.send('browser:vault', null); }

  // ------------------------------------------------------------------ site icons for the bookmarks
  /** Fetch one icon through his own browsing session and keep it as a small data picture. Images only, 64 KB at most. */
  private async iconData(url: string): Promise<string | null> {
    if (url.startsWith('data:image/')) return url.length < 90_000 ? url : null;
    if (!isWeb(url) || this.listed(url).length) return null;
    try {
      const r = await within(this.ses.fetch(url, { signal: AbortSignal.timeout(6000) }), 7000, null);
      const type = r?.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
      if (!r?.ok || !/^image\//.test(type) || type === 'image/svg+xml') return null;
      const buf = Buffer.from(await r.arrayBuffer());
      if (!buf.length || buf.length > 64 * 1024) return null;
      return `data:${type};base64,${buf.toString('base64')}`;
    } catch { return null; }
  }
  private async keepIcon(host: string, url: string): Promise<void> {
    const d = await this.iconData(url);
    if (!d) return;
    this.icons.set(host, d);
    if (this.icons.size > 400) this.icons.delete(this.icons.keys().next().value!);
    try { writeFileAtomic(this.iconsFile, JSON.stringify(Object.fromEntries(this.icons))); } catch { /* best effort */ }
    this.sendTabs();
  }
  /** Bookmarks of sites he has not visited yet: ask the site for its icon (its page's icon link, else /favicon.ico). */
  private async fillMarkIcons(): Promise<void> {
    if (this.iconsBusy) return;
    this.iconsBusy = true;
    try {
      for (const m of this.marks.slice(0, 60)) {
        let u: URL;
        try { u = new URL(m.url); } catch { continue; }
        if (this.icons.has(u.hostname)) continue;
        let link: string | null = null;
        try {
          const r = await within(this.ses.fetch(u.origin + '/', { signal: AbortSignal.timeout(6000) }), 7000, null);
          if (r?.ok) {
            const html = (await r.text()).slice(0, 300_000);
            const tag = [...html.matchAll(/<link\b[^>]*>/gi)].map((x) => x[0]).find((x) => /rel\s*=\s*["']?[^"'>]*\bicon\b/i.test(x) && !/mask-icon/i.test(x));
            const href = tag && /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
            if (href) link = new URL(href.replace(/&amp;/g, '&'), u.origin + '/').href;
          }
        } catch { /* fall back to /favicon.ico */ }
        let d = link ? await this.iconData(link) : null;
        if (!d) d = await this.iconData(u.origin + '/favicon.ico');
        if (d) { this.icons.set(u.hostname, d); this.sendTabs(); }
      }
      try { writeFileAtomic(this.iconsFile, JSON.stringify(Object.fromEntries(this.icons))); } catch { /* best effort */ }
    } finally { this.iconsBusy = false; }
  }
  private iconOf(url: string): string {
    try { const h = new URL(url).hostname; return this.icons.get(h) ?? this.icons.get(h.replace(/^www\./, '')) ?? this.icons.get('www.' + h) ?? ''; } catch { return ''; }
  }

  // ------------------------------------------------------------------ 6.23 bookmarks
  private saveMarks(): void { try { writeFileAtomic(this.marksFile, JSON.stringify(this.marks)); } catch { /* best effort */ } }
  /**
   * "Bring bookmarks from Chrome": he picks the file Chrome's Export bookmarks made (in his Drive or Downloads).
   * Only the file he picks is read. New ones are added; ones he already has are left as they are.
   */
  async importMarks(): Promise<void> {
    const w = this.win;
    if (!w || w.isDestroyed()) return;
    const drive = 'G:\\My Drive';
    const r = await dialog.showOpenDialog(w, {
      title: 'Pick the bookmarks file Chrome exported', buttonLabel: 'Bring them in',
      defaultPath: existsSync(drive) ? drive : app.getPath('downloads'),
      filters: [{ name: 'Bookmarks file', extensions: ['html', 'htm'] }], properties: ['openFile'],
    });
    const file = r.filePaths[0];
    if (r.canceled || !file) return;
    let added = 0;
    try {
      if (statSync(file).size > 20 * 1024 * 1024) throw new Error('that file is too big to be a bookmarks file');
      const have = new Set(this.marks.map((m) => m.url));
      for (const m of parseBookmarks(readFileSync(file, 'utf8'))) if (!have.has(m.url)) { this.marks.push(m); have.add(m.url); added++; }
      this.marks = this.marks.slice(0, 5000);
      this.saveMarks();
    } catch (e) {
      w.webContents.send('browser:download', { name: '', state: 'note', text: `Those bookmarks could not be read: ${(e as Error).message}` });
      return;
    }
    if (added) void this.fillMarkIcons();
    w.webContents.send('browser:download', { name: '', state: 'note', text: added ? `Brought in ${added} bookmarks. The bar ones are on the shelf in the drawer.` : 'Nothing new in that file: you already have all of them.' });
    this.sendTabs();
  }
  /** The star in the slot: the page he is on goes onto the shelf, or comes off it. */
  toggleMark(): void {
    const t = this.cur();
    if (!t || !isWeb(t.url)) return;
    const i = this.marks.findIndex((m) => m.url === t.url);
    if (i >= 0) this.marks.splice(i, 1);
    else this.marks.unshift({ title: (t.title || t.url).slice(0, 200), url: t.url, folder: 'Bookmarks bar' });
    this.saveMarks();
    this.sendTabs();
  }

  // ------------------------------------------------------------------ lending a tab to the popout ("take the tab with you")
  /** Set by main: bring a lent tab back from the popout (the popout closes and hands it over). */
  onReclaim: (() => void) | null = null;

  /**
   * Lend a live tab to the popout: the same page, already playing, signed in, nothing reloaded. It leaves this
   * window and the frame shows a plate where it was. Null for a tab with no live page (asleep, crashed, blocked).
   */
  lend(id: number): { view: WebContentsView; url: string; title: string } | null {
    const t = this.tabs.find((x) => x.id === id);
    if (!t?.view || t.crashed || t.blocked || t.failed || t.lent) return null;
    t.lent = true;
    try { this.win?.contentView.removeChildView(t.view); } catch { /* not shown */ }
    try { t.view.webContents.stopFindInPage('clearSelection'); } catch { /* gone */ }
    this.changed();
    return { view: t.view, url: t.url, title: t.title };
  }

  /** The popout hands the tab back: into the window, where it was. If the tab or the window is gone, the page closes. */
  giveBack(id: number, view: WebContentsView): void {
    const t = this.tabs.find((x) => x.id === id);
    const w = this.win;
    if (!t || t.view !== view || !w || w.isDestroyed()) { try { view.webContents.close(); } catch { /* gone */ } if (t) { t.view = null; t.lent = false; } return; }
    t.lent = false;
    view.setVisible(false);
    w.contentView.addChildView(view);
    if (t.id === this.active) this.activate(t.id); else this.changed();
  }

  isLent(id: number): boolean { return Boolean(this.tabs.find((x) => x.id === id)?.lent); }
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
    this.newTab(this.HOME);
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
    t.blocked = null; t.failed = null; this.place();
    void t.view.webContents.loadURL(this.secured(t, url)).catch(() => {});
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
      case 'newtab': this.newTab(this.HOME); this.win?.webContents.send('browser:focusslot'); break;
      case 'close': if (t) this.close(t.id); break;
      case 'reopen': this.reopen(); break;
      case 'reclaim': this.onReclaim?.(); break;
      case 'drawer-open': void this.drawer(true); break;
      case 'importmarks': void this.importMarks(); break;
      case 'winmin': this.win?.minimize(); break;
      case 'winmax': if (this.win) { if (this.win.isMaximized()) this.win.unmaximize(); else this.win.maximize(); } break;
      case 'winclose': this.win?.close(); break;
      case 'homehere': { const u = t?.url; if (u && isWeb(u)) { this.prefs.home = u; this.savePrefs(); this.note('This page is your home page now.'); this.sendTabs(); } break; }
      case 'star': this.toggleMark(); break;
      case 'vault': void this.vaultKey(); break;
      case 'vaultcancel': this.vaultCancel(); break;
      case 'vaultlock': this.vault.lock(); this.note('Bitwarden is locked.'); break;
      case 'drawer-close': void this.drawer(false); break;
      // The red plate: the safe way out, or (the held lever) in anyway, for this site, this run.
      case 'phishback': if (t) { t.blocked = null; if (wc?.navigationHistory.canGoBack()) { this.place(); wc.navigationHistory.goBack(); } else this.close(t.id); } break;
      // A look-alike: the real site, typed fresh, never the link that led here.
      case 'phishreal': if (t?.blocked?.real) { const u = 'https://' + t.blocked.real + '/'; t.blocked = null; this.place(); void wc?.loadURL(u); } break;
      // A failed page: try again; or, with no secure version, open the plain one and remember the site.
      case 'failretry': if (t?.failed && wc) { const u = t.failed.url; t.failed = null; this.place(); void wc.loadURL(this.secured(t, u)).catch(() => {}); } break;
      case 'httpok': if (t?.failed?.kind === 'insecure' && wc) {
        const u = t.failed.url;
        try { this.httpOk.add(new URL(u).hostname); writeFileAtomic(this.httpOkFile, JSON.stringify([...this.httpOk])); } catch { /* best effort */ }
        t.failed = null; t.upgraded = null; this.place(); void wc.loadURL(u).catch(() => {});
      } break;
      case 'failback': if (t) { t.failed = null; if (wc?.navigationHistory.canGoBack()) { this.place(); wc.navigationHistory.goBack(); } else this.close(t.id); } break;
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
          trail: Number.isInteger(t.trail) ? t.trail : null, done: false, lent: false, upgraded: null, failed: null };
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
      tabs: this.tabs.map((x) => ({ id: x.id, opener: x.opener, title: x.title, url: x.url, favicon: x.favicon, loading: x.loading, audible: x.audible, muted: x.muted, crashed: x.crashed, asleep: !x.view, blocked: x.blocked, failed: x.failed, trail: x.trail, done: x.done, lent: x.lent })),
      trails: this.trails,
      adsPaused: (() => { try { return this.paused.has(new URL(t?.url ?? '').hostname.replace(/^www\./, '')); } catch { return false; } })(),
      adsOn: Boolean(this.ads),
      sounds: this.sounds,
      prefs: this.prefs,
      // The shelf: the bar ones first, as in Chrome, then the rest. Only what the shelf can show is sent.
      marks: [...this.marks.filter((m) => isBar(m.folder)), ...this.marks.filter((m) => !isBar(m.folder))].slice(0, 24).map((m) => ({ title: m.title, url: m.url, favicon: this.iconOf(m.url) })),
      markCount: this.marks.length,
      hasLogin: this.hasLogin,
      loginKnown: this.loginKnown,
      maximized: Boolean(w.isMaximized()),
      home: this.HOME,
      starred: Boolean(t && this.marks.some((m) => m.url === t.url)),
      // The page's zoom as he would say it: 100%, 120%... (Chromium's level is 20% per step).
      zoomPct: wc ? Math.round(Math.pow(1.2, wc.getZoomLevel()) * 100) : 100,
    });
    if (t) w.setTitle(`${t.title} - Aang Browser`);
  }

  closeAll(): void { if (this.win && !this.win.isDestroyed()) { void this.snapshot(); this.win.close(); } }
}
