// Steps 6.19, 6.20 and 6.21: Aang's browser.
//
// One window at first; dragging a tab out makes another (his ask, 2026-10-13). Each window is a Pane: its frame, its
// tabs, its tray, its curtain. The rest (bookmarks, history, trails, the snapshot) is the one browser's. Its frame (the
// carved band and the tab rail, sheet 3) is a page of ours; each tab is its own
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
import { BrowserWindow, WebContentsView, app, clipboard, desktopCapturer, dialog, nativeImage, screen, session as electronSession, shell, webContents as allWebContents, type DesktopCapturerSource } from 'electron';
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { SAFE_WEB_PREFERENCES, denyPermissions, lockDown } from './safety.ts';
import { addressFor, engineHome, searchFor, setSearch, type Engine } from './address.ts';
import { TIDY_SYSTEM, bySite, doubles, readTidy, staleTrails, tidyPrompt, type TidyTab } from './tidy.ts';
import { writeFileAtomic } from './atomic.ts';
import { lookalike } from './lookalike.ts';
import { softEdge } from './winedge.ts';
import { isBar, parseBookmarks, parseChromeBookmarks, parseSafariBookmarks, type Mark } from './bookmarks.ts';
import { BW_LOGIN, Vault, fillScript, type Login } from './vault.ts';
import { createHmac, randomBytes } from 'node:crypto';
import { Visits, search as searchVisits, forAang, type Visit } from './visits.ts';
import { BrowserSync, urlKept, type SyncCookie, type SyncMsg, type TabSnap } from './bsync.ts';
import { Driver, type Job } from './driver.ts';
import { Downloads, kindOf, trayOf, type Dl } from './dlist.ts';

/** A site name scrambled with this PC's own key: the file alone says nothing about where he has accounts. */
const scramble = (key: string, host: string) => createHmac('sha256', key).update(host.toLowerCase()).digest('hex').slice(0, 32);
import { PhishCheck } from './phish.ts';
import { serviceFor } from './services.ts';
import { failureWords, isRisky, upgrade } from './secure.ts';
import { blockAds, type AdBlock } from './skip/ads.ts';
import { createRequire } from 'node:module';

/**
 * Dark mode for web pages (X, his "Dark Reader is a must", 2026-10-14): Dark Reader's own engine (darkreader 4.9.133,
 * MIT), put into each page in a world of its own, so the page's scripts can neither see it nor switch it off.
 */
const DARK_WORLD = 1002;
const DARK_THEME = '{brightness:100,contrast:95,sepia:5}';
let darkSrc: string | null | undefined;
/** A synced list of site names: plain hosts only. */
function hostList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((h): h is string => typeof h === 'string' && /^[a-z0-9.-]{1,253}$/i.test(h)).map((h) => h.toLowerCase()).slice(-2000) : [];
}
function darkSource(): string | null {
  if (darkSrc === undefined) {
    try { darkSrc = readFileSync(createRequire(import.meta.url).resolve('darkreader/darkreader.js'), 'utf8'); }
    catch (e) { darkSrc = null; console.error('browser: dark mode could not load: ' + (e as Error).message); }
  }
  return darkSrc;
}

export interface BrowserOptions { origin: string; preloadPath: string; stateDir: string; tabPreloadPath: string; settingsPreloadPath: string; thingsPreloadPath: string }

interface Tab {
  id: number;
  /** The window it is in (a Pane's id). */
  pane: number;
  /** One of the browser's own pages (Settings, Your things), not a website: it gets its own small preload and never navigates. */
  internal?: 'settings' | 'things';
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
  /** 6.24: a call is live in this tab (he allowed its camera, mic or a screen share): never slowed, never put to sleep. */
  call?: boolean;
  /** 6.22: stopped before loading because a list names it: which lists. */
  blocked: { url: string; lists: string[]; real?: string } | null;
  /** Sheet 3 section 3: the trail it belongs to (null = a loose tab), and whether he turned it in. */
  trail: number | null;
  done: boolean;
  /** HTTPS-first: the plain http address this load was upgraded from, until the secure one answers. */
  upgraded: string | null;
  /** The last popup this page opened by itself and was blocked: the shield glows blue until he looks (2026-10-12). */
  blockedPopup: { url: string; site: string } | null;
  /** The page did not load: no secure version (`insecure`), or any other failure, in plain words (6.22b bug 3). */
  failed: { kind: 'insecure' | 'error'; url: string; title: string; text: string; retry: boolean } | null;
  /** Loading (2026-10-12, his design): waiting for the site, then loading, then idle; how far along, 0 to 1. */
  phase?: 'idle' | 'waiting' | 'loading';
  prog?: number;
  /** Where he asked to go, shown in the address slot at once, dimmed, until the page arrives. */
  pending?: string | null;
  /** The page in this view has drawn something since it woke: only then is there an old page to hold. */
  drawn?: boolean;
}

/**
 * One browser window and what belongs to it alone (2026-10-13, tab dragging). Everything that used to be "the" window,
 * the tab in front, the tray, the curtain, is per window. The browser works in one pane at a time (`this.pane`): every
 * way in (a frame's message, a tab's event, a window's event) first says which window it is about.
 */
interface Pane {
  id: number;
  win: BrowserWindow | null;
  active: number | null;
  inset: { left: number; top: number; right: number; bottom: number };
  drawerOpen: boolean;
  peekShot: { tab: number; url: string; at: number; shot: string } | null;
  peeking: boolean;
  hideTimer: NodeJS.Timeout | null;
  trayV: WebContentsView | null;
  trayOn: boolean;
  trayAt: { x: number; y: number };
  curtain: WebContentsView | null;
  curtainReady: Promise<unknown>;
  veil: { tab: number; nav: number; at: number; up: boolean; dimT: NodeJS.Timeout | null; capT: NodeJS.Timeout | null } | null;
  fullTab: number | null;
  watching: number | null;
  watchTimer: NodeJS.Timeout | null;
}
const newPane = (id: number): Pane => ({ id, win: null, active: null, inset: { left: 30, top: 66, right: 8, bottom: 8 }, drawerOpen: false, peekShot: null, peeking: false,
  hideTimer: null, trayV: null, trayOn: false, trayAt: { x: 42, y: 62 }, curtain: null, curtainReady: Promise.resolve(), veil: null, fullTab: null, watching: null, watchTimer: null });

/** A trail (Horse Browser's idea, sheet 3): pages that belong to one thing he is doing. `named` = he named it. */
interface Trail { id: number; name: string; named: boolean; collapsed?: boolean; fresh?: boolean }
/** A trail put away in the Stash (by Tidy or by him): its pages, ready to come back. Never closed for good by Aang. */
interface Stashed { id: number; name: string; tabs: { url: string; title: string }[]; at: number }
/** Everything Tidy changed, so Undo can put it all back exactly. */
interface TidyRun {
  id: number; phase: 'working' | 'review'; text: string; waiting: boolean;
  trails: Trail[]; order: { id: number; trail: number | null }[];
  dup: number[]; stashed: number[]; created: number[]; keepAt: number;
  timer: NodeJS.Timeout | null; retry: NodeJS.Timeout | null;
}

/** A trail's first name, from the site it started on: "wowhead.com" becomes "WOWHEAD". He can rename it. */
function trailNameFor(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    const parts = h.split('.');
    return (parts.length > 1 ? parts[parts.length - 2] : parts[0]).toUpperCase().slice(0, 24);
  } catch { return 'TRAIL'; }
}

const isWeb = (u: string) => /^https?:\/\//i.test(u);
/**
 * Links that open an app instead of a page (his report, 2026-10-14: signing in to Claude on the Mac ended on "Open
 * Claude" and nothing happened, because every non-web link was dropped). Like Chrome: only these, and only after he
 * says yes in the band. Anything else stays blocked: an app link is a way to run things outside the browser.
 */
const APP_LINKS: Record<string, string> = {
  claude: 'the Claude app', mailto: 'your email app', zoommtg: 'Zoom', zoomus: 'Zoom', msteams: 'Microsoft Teams',
  slack: 'Slack', discord: 'Discord', spotify: 'Spotify',
};
/**
 * In front, every time (his rule, 2026-10-14: "when I click the browser from the wheel or the tray, anything, it should
 * ALWAYS come forward"). Windows refuses a plain focus() while another app has him, and only flashes the taskbar; on top
 * for a moment, then not, is the nudge it accepts. On the Mac the app itself has to take focus.
 */
export function bringFront(w: BrowserWindow): void {
  if (!w || w.isDestroyed()) return;
  if (w.isMinimized()) w.restore();
  if (process.platform === 'darwin') app.focus({ steal: true });
  w.setAlwaysOnTop(true); w.show(); w.moveTop(); w.focus();
  setTimeout(() => { if (!w.isDestroyed()) w.setAlwaysOnTop(false); }, 400);
}
export function appOf(u: string): string | null {
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(String(u ?? ''));
  return m && u.length <= 4000 ? APP_LINKS[m[1]!.toLowerCase()] ?? null : null;
}
/** The right-click item that sends a page to the other machine's browser. */
const OTHER_OPEN = process.platform === 'darwin' ? 'Open on PC' : 'Open on Mac';
/** How a look-alike is named on the red plate's list chips. */
const LOOKS_LIKE = 'LOOKS LIKE ';
/** Where a new tab opens until he sets his own in Settings (2026-10-12: not Google). */
const DEFAULT_HOME = 'https://search.brave.com/';
/** A plain Chrome's name for itself: Google refuses sign-in to anything calling itself Electron (his yes, 2026-10-12). */
/** A web address's site, without www. Empty when it is not one. */
const hostOf = (u: string): string => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
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
// 2 hours (his call, 2026-10-12: fewer reloads when going back to a tab). Was 30 minutes. This PC has 16 GB.
const SLEEP_AFTER_MS = 2 * 60 * 60_000;
/**
 * 6.24, his interviews ("if it ever glitches and can't read my mic or my camera I'm in trouble"): the call sites run
 * with no ad blocking at all, so a filter list can never break a call. Their subdomains too.
 */
const CALL_SITES = ['zoom.us', 'zoom.com', 'teams.microsoft.com', 'teams.live.com', 'teams.cloud.microsoft', 'meet.google.com', 'webex.com'];
// The band's height (Windows draws its own buttons over it, see-through on the wood) and the page area's colour.
const BAND_HEIGHT = 58;
/** The page's corners, rounded natively: the floating page (2026-10-12) has big soft corners (Flow browser does this). */
const PAGE_RADIUS = 16;
const PAGE_COLOUR = '#f6f3ee';
/** The soft fade between pages (his pick, option 5): fade length, when a slow site dims, when a page counts as instant. */
const VEIL_FADE_MS = 250, VEIL_DIM_MS = 1500, VEIL_INSTANT_MS = 300, VEIL_MAX_MS = 8000;

/** Every call into a page, with a deadline: a crashed page never answers, and must never hang Aang. */
function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

export class AangBrowser {
  /** Every open window, and the one being worked in right now. With none open, `pane` is the last one (closed). */
  private panes: Pane[] = [];
  private pane: Pane = newPane(0);
  private paneSeq = 0;
  /** The window he used last (focus), where a link from Aang or the other machine opens. */
  private focused: Pane | null = null;
  private get win(): BrowserWindow | null { return this.pane.win; }
  private set win(v: BrowserWindow | null) { this.pane.win = v; }
  private get active(): number | null { return this.pane.active; }
  private set active(v: number | null) { this.pane.active = v; }
  private get inset() { return this.pane.inset; }
  private set inset(v) { this.pane.inset = v; }
  private get drawerOpen(): boolean { return this.pane.drawerOpen; }
  private set drawerOpen(v: boolean) { this.pane.drawerOpen = v; }
  private get peekShot() { return this.pane.peekShot; }
  private set peekShot(v) { this.pane.peekShot = v; }
  private get peeking(): boolean { return this.pane.peeking; }
  private set peeking(v: boolean) { this.pane.peeking = v; }
  private get hideTimer() { return this.pane.hideTimer; }
  private set hideTimer(v) { this.pane.hideTimer = v; }
  private get trayV() { return this.pane.trayV; }
  private set trayV(v) { this.pane.trayV = v; }
  private get trayOn(): boolean { return this.pane.trayOn; }
  private set trayOn(v: boolean) { this.pane.trayOn = v; }
  private get trayAt() { return this.pane.trayAt; }
  private set trayAt(v) { this.pane.trayAt = v; }
  private get curtain() { return this.pane.curtain; }
  private set curtain(v) { this.pane.curtain = v; }
  private get curtainReady() { return this.pane.curtainReady; }
  private set curtainReady(v) { this.pane.curtainReady = v; }
  private get veil() { return this.pane.veil; }
  private set veil(v) { this.pane.veil = v; }
  private get fullTab() { return this.pane.fullTab; }
  private set fullTab(v) { this.pane.fullTab = v; }
  private get watching() { return this.pane.watching; }
  private set watching(v) { this.pane.watching = v; }
  private get watchTimer() { return this.pane.watchTimer; }
  private set watchTimer(v) { this.pane.watchTimer = v; }
  private paneOfTab(t: Tab): Pane | undefined { return this.panes.find((p) => p.id === t.pane); }
  /** The tabs in one window, in their order. */
  private paneTabs(p: Pane = this.pane): Tab[] { return this.tabs.filter((t) => t.pane === p.id); }
  /** Work in the window this tab is in. False if that window is gone. */
  private inTab(t: Tab): boolean { const p = this.paneOfTab(t); if (p) this.pane = p; return Boolean(p); }
  private alive(p: Pane | null | undefined): p is Pane & { win: BrowserWindow } { return Boolean(p?.win && !p.win.isDestroyed()); }
  /** The window he used last, or any open one. */
  private lastPane(): Pane | undefined { return this.alive(this.focused) && this.panes.includes(this.focused) ? this.focused : this.panes.filter((p) => this.alive(p)).pop(); }
  private tabs: Tab[] = [];
  private seq = 0;
  private trails: Trail[] = [];
  private trailSeq = 0;
  private closed: string[] = [];
  /**
   * 2026-10-12, his "the window glitches when I click ⋯": the picture of the page used to be taken AFTER the
   * click (up to 600 ms), and the live page was hidden before the frame had painted it, so the page area
   * flashed. Now the picture is taken while his mouse is on the way (hover), and the live page is hidden only
   * when the frame says the picture is on screen.
   */
  /** M6, his yes (2026-10-13): a picture of this browser's own window and the page in it, for Claude to check a fix. */
  async look(): Promise<{ frame: string | null; page: string | null; size: string }> {
    const w = this.win;
    if (!w || w.isDestroyed()) return { frame: null, page: null, size: 'the window is closed' };
    const img = await within(w.webContents.capturePage(), 2000, null);
    const t = this.cur();
    const b = w.getBounds();
    return { frame: img && !img.isEmpty() ? img.toPNG().toString('base64') : null, page: t ? await this.shotOf(t) : null, size: `${b.width}x${b.height} at ${b.x},${b.y}; drawer ${this.drawerOpen ? 'open' : 'shut'}; ${this.tabs.length} tabs` };
  }

  private async shotOf(t: Tab): Promise<string | null> {
    if (!t.view || t.crashed || t.blocked || t.failed || t.lent) return null;
    try {
      const img = await within(t.view.webContents.capturePage(), 600, null);
      if (!img || img.isEmpty()) return null;
      // At the page's own size on screen: a high-DPI picture is four times the bytes for nothing he can see.
      const b = t.view.getBounds();
      const fit = img.getSize().width > b.width * 1.25 && b.width > 0 ? img.resize({ width: b.width, quality: 'good' }) : img;
      return 'data:image/jpeg;base64,' + fit.toJPEG(80).toString('base64');
    } catch { return null; }
  }
  /** The mouse is heading for something that will cover the page: take its picture now. */
  async peek(): Promise<void> {
    const t = this.cur(), P = this.pane;
    if (!t || P.drawerOpen || P.peeking) return;
    if (P.peekShot && P.peekShot.tab === t.id && Date.now() - P.peekShot.at < 700) return;
    P.peeking = true;
    try { const shot = await this.shotOf(t); P.peekShot = shot ? { tab: t.id, url: t.url, at: Date.now(), shot } : null; }
    finally { P.peeking = false; }
  }
  /** The frame has painted the picture: now the live page can go. */
  private frozenReady(): void {
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
    const t = this.cur();
    if (this.drawerOpen && t?.view && !t.lent) t.view.setVisible(false);
  }
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
  /**
   * 6.24 calls (Zoom, Teams, Meet): camera and microphone he allowed on a site, kept only while a tab is still on
   * that site, so one call does not ask five times (they ask again for every device switch). Never written to disk.
   */
  private readonly mediaOk = new Map<string, Set<string>>();
  /** 6.24: the screen-share picker waiting for his pick. One at a time. */
  /** Sites he is sharing his screen with right now (with or without camera). */
  private readonly shareHosts = new Set<string>();
  private share: { id: number; host: string; sources: Map<string, DesktopCapturerSource>; audio: boolean; done: (s: Electron.Streams | null) => void; timer: NodeJS.Timeout } | null = null;
  /** The little wood sounds (new tab, close, download done). Off until he turns them on in Settings. */
  sounds = false;
  /** The ⋯ menu's switches (sheet 3 section 10), kept between runs. Block ads and Block popups start on. */
  prefs = { ads: true, popups: true, home: DEFAULT_HOME, search: 'brave' as Engine, aiBox: false, startup: 'tabs' as 'tabs' | 'home', dark: true, darkOff: [] as string[] };
  /** His home page, or his search engine's front page. Web pages only. */
  private get HOME(): string { return isWeb(this.prefs.home) && this.prefs.home !== DEFAULT_HOME ? this.prefs.home : engineHome(); }
  /** The Stash (Tidy and the trail menu put trails here). Kept between runs. */
  private stash: Stashed[] = [];
  private stashSeq = 0;
  private readonly stashFile: string;
  /** The tidy in progress or waiting for Keep or Undo. */
  private tidy: TidyRun | null = null;
  private tidySeq = 0;
  /** Set by main: ask Qwen (through the brain) to sort the tabs. The answer comes back to tidyAnswer(). */
  onTidyAsk: ((id: number, prompt: string, system: string) => void) | null = null;
  /** Set by main: the browser is closing a trail's tabs, keep them a moment for Undo. */
  private lastClosed: { trail: Trail; tabs: { url: string; title: string }[] } | null = null;
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
  /** 6.22b bug 2: the right-click menu's own little window, kept hidden between uses. */
  private menu: BrowserWindow | null = null;
  private menuFor: { tab: number; p: Electron.ContextMenuParams } | null = null;
  private menuItems: unknown[] | null = null;
  /** 6.25a: the pages Aang (and Claude sessions) drive, in hidden windows of their own. */
  readonly driver: Driver;
  /** Set by main: he pressed STOP on a job, so the brain stops that turn. */
  onDriverStop: ((j: Job) => void) | null = null;
  /** The driver page he is watching in the page area (a live picture), or none. */
  /** History (2026-10-12): every page he opened, 90 days, only on this PC. */
  private readonly visits: Visits;
  /** Downloads (2026-10-12): the list behind the tray and the Downloads page; the live ones and how far along they are. */
  private readonly dls: Downloads;
  private readonly live = new Map<number, Electron.DownloadItem>();
  private readonly got = new Map<number, { got: number; total: number; rate: number }>();
  /** The tray holds only downloads since this: the browser opening, or his Clear list. */
  private traySince = Date.now();
  private trayTimer: NodeJS.Timeout | null = null;
  private dlSendTimer: NodeJS.Timeout | null = null;
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
    this.stashFile = path.join(o.stateDir, 'browser-stash.json');
    try {
      if (existsSync(this.stashFile)) {
        const a = JSON.parse(readFileSync(this.stashFile, 'utf8'));
        if (Array.isArray(a)) this.stash = a.filter((s: Partial<Stashed>) => Number.isInteger(s?.id) && typeof s?.name === 'string' && Array.isArray(s?.tabs)).slice(0, 50)
          .map((s: Stashed) => ({ id: s.id, name: s.name.slice(0, 24), at: Number(s.at) || 0, tabs: s.tabs.filter((t) => typeof t?.url === 'string' && isWeb(t.url)).slice(0, 80).map((t) => ({ url: t.url, title: String(t.title ?? t.url).slice(0, 200) })) }));
      }
    } catch { /* none yet */ }
    this.stashSeq = this.stash.reduce((m, s) => Math.max(m, s.id), 0);
    setSearch(this.prefs.search, this.prefs.aiBox);
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
    this.visits = new Visits(path.join(o.stateDir, 'browser-history.json'));
    this.driver = new Driver({ ses: this.ses, preload: o.tabPreloadPath, listed: (u) => this.listed(u), changed: () => this.sendTabs(), stopped: (j) => this.onDriverStop?.(j) });
    this.dls = new Downloads(path.join(o.stateDir, 'browser-downloads.json'));
    const loadSet = (f: string) => { try { if (existsSync(f)) { const a = JSON.parse(readFileSync(f, 'utf8')); if (Array.isArray(a)) return new Set(a.filter((x: unknown) => typeof x === 'string')); } } catch { /* none */ } return new Set<string>(); };
    this.httpOk = loadSet(this.httpOkFile);
    this.trusted = loadSet(this.trustedFile);
    try {
      if (existsSync(this.prefsFile)) {
        const p = JSON.parse(readFileSync(this.prefsFile, 'utf8'));
        this.sounds = p?.sounds === true;
        this.prefs = { ads: p?.ads !== false, popups: p?.popups !== false, home: typeof p?.home === 'string' && isWeb(p.home) ? p.home.slice(0, 2000) : DEFAULT_HOME,
          search: ['ddg', 'google', 'yandex'].includes(p?.search) ? p.search : 'brave', aiBox: p?.aiBox === true, startup: p?.startup === 'home' ? 'home' : 'tabs',
          dark: p?.dark !== false, darkOff: hostList(p?.darkOff) };
      }
    } catch { /* defaults */ }
    denyPermissions(this.ses);
    this.permissions();
    this.screenShare();
    this.spelling();
    this.downloads();
    this.phish = new PhishCheck(o.stateDir);
    void this.phish.start();
    try { if (existsSync(this.pausedFile)) this.paused = new Set(JSON.parse(readFileSync(this.pausedFile, 'utf8'))); } catch { /* none paused */ }
    // Stay signed in (his report, 2026-10-13: Reddit logged him out). Chromium keeps new and changed cookies in
    // memory and writes them to disk in batches, so a hard stop of the Shell throws away whatever had not been
    // written yet - and a login cookie is exactly the kind that changes quietly. Nothing in Aang ever deletes a
    // cookie; they were simply lost. So every change is written within two seconds, and once more on the way out.
    let cookieWrite: NodeJS.Timeout | null = null;
    this.ses.cookies.on('changed', (_e, cookie, cause, removed) => {
      // M6: a login changed here; the other machine's browser gets it. Removals only when something removed it on
      // purpose (a sign-out, a site clearing it): an expired cookie expires on its own on the other machine too.
      if (!removed || cause === 'explicit') this.sync?.cookie(cookie as SyncCookie, removed);
      if (cookieWrite) clearTimeout(cookieWrite);
      cookieWrite = setTimeout(() => { cookieWrite = null; this.ses.cookies.flushStore().catch(() => { /* next change tries again */ }); }, 2000);
    });
    void blockAds(this.ses, o.stateDir, { cosmetic: true }).then((b) => { this.ads = b; if (b) { for (const h of [...this.paused, ...CALL_SITES]) b.pause(h, true); if (!this.prefs.ads) b.stop(); } });
    this.callFile = path.join(o.stateDir, 'in-call.json');
    try { unlinkSync(this.callFile); } catch { /* none left over */ }
  }

  /**
   * 6.22, the asks (sheet 3 section 5). Fullscreen just works; camera and microphone ask through the chip that
   * hangs from the band, for this call only, never "always"; notifications, location and everything else are
   * refused without asking, because nothing he does needs them.
   */
  private permissions(): void {
    this.ses.setPermissionRequestHandler((wc, permission, done, details) => {
      if (permission === 'fullscreen') { done(true); return; }
      this.inWc(wc);
      // Sharing the screen: the picker below is the real ask, every time, so Chromium's own gate just lets it reach it.
      if (permission === 'display-capture') { done(!this.driver?.owns(wc)); return; }
      if (permission === 'speaker-selection') { done(!this.driver?.owns(wc) && Boolean(this.mediaOk.get(hostOf(wc.getURL()))?.has('audio'))); return; }
      if (permission !== 'media' || !this.win || this.win.isDestroyed() || this.driver?.owns(wc)) { done(false); return; }
      const asked = (details as { mediaTypes?: string[] }).mediaTypes ?? [];
      // A screen share arrives here first as "media" with no camera or microphone named (measured 2026-10-13,
      // Electron 44). Nothing is granted by letting it through: the picker below is where he says yes or no.
      if (!asked.length) { done(true); return; }
      const types = asked.filter((x) => x === 'audio' || x === 'video');
      const host = hostOf((details as { requestingUrl?: string }).requestingUrl || wc.getURL());
      if (!host || !types.length) { done(false); return; }
      // Already allowed on this site during this call: no second ask.
      const ok = this.mediaOk.get(host);
      if (ok && types.every((x) => ok.has(x))) { done(true); return; }
      const what = types.includes('video') && types.includes('audio') ? 'Camera and microphone?' : types.includes('video') ? 'Your camera?' : 'Your microphone?';
      const top = hostOf(wc.getURL());
      const text = `${host}${top && top !== host ? ` (inside ${top})` : ''} wants it for what you are doing now. It stops when you leave the site.`;
      this.ask({ host, what, text }, (allow) => {
        if (allow) { const s = this.mediaOk.get(host) ?? new Set<string>(); for (const x of types) s.add(x); this.mediaOk.set(host, s); }
        done(allow);
        if (allow) this.sendTabs();             // the tab becomes a call tab at once
      });
    });
    // Calls ask "may I?" before they ask for real (Teams, Zoom). Yes only where he already said yes, on this site.
    this.ses.setPermissionCheckHandler((wc, permission, origin, details) => {
      if (permission === 'fullscreen') return true;
      if ((permission !== 'media' && permission !== 'speaker-selection') || (wc && this.driver?.owns(wc))) return false;
      const ok = this.mediaOk.get(hostOf(origin));
      if (!ok) return false;
      // Picking which speakers the call plays through comes with the microphone, as in Chrome.
      if (permission === 'speaker-selection') return ok.has('audio');
      const t = (details as { mediaType?: string }).mediaType;
      return t === 'audio' || t === 'video' ? ok.has(t) : ok.size > 0;
    });
  }

  /**
   * 6.24: sharing his screen in a call. The site never chooses: he picks one screen or one window in a panel that
   * hangs from the band, every time, and his own sound goes only if he ticks it. Unanswered in 2 minutes means no.
   * Aang's own pages can never share anything.
   */
  private screenShare(): void {
    this.ses.setDisplayMediaRequestHandler((req, done) => {
      const deny = () => { try { done(null); } catch { /* the page went away */ } };
      let wc: Electron.WebContents | undefined;
      try { wc = req.frame ? allWebContents.fromFrame(req.frame) : undefined; } catch { wc = undefined; }
      if (wc) this.inWc(wc);
      if (!wc || this.driver?.owns(wc) || !req.videoRequested || !this.win || this.win.isDestroyed() || this.share) { deny(); return; }
      const host = hostOf(req.securityOrigin) || hostOf(wc.getURL());
      const P = this.pane;
      void desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 } }).then((list) => {
        this.pane = P;
        if (!this.win || this.win.isDestroyed() || this.share) { deny(); return; }
        // None of Aang's own browser windows can be shared.
        const own = new Set(this.panes.filter((p) => this.alive(p)).map((p) => p.win!.getMediaSourceId()));
        const sources = list.filter((s) => s.name.trim() && !own.has(s.id));
        if (!sources.length) { deny(); return; }
        const id = ++this.askSeq;
        const timer = setTimeout(() => this.shareAnswer(id, null, false), 120_000);
        this.share = { id, host, sources: new Map(sources.map((s) => [s.id, s])), audio: req.audioRequested, done, timer };
        this.win.webContents.send('browser:share', {
          id, host, audio: req.audioRequested,
          sources: sources.map((s) => ({ id: s.id, name: s.name.slice(0, 120), kind: s.id.startsWith('screen:') ? 'screen' : 'window', thumb: s.thumbnail.isEmpty() ? '' : s.thumbnail.toDataURL() })),
        });
      }, deny);
    });
  }
  /** In a call right now? Restarting the browser would drop it, so the update key waits and so must anything else. */
  inCall = false;
  private callFile = '';
  private callNow(on: boolean): void {
    if (on === this.inCall) return;
    this.inCall = on;
    console.log(`shell: browser: ${on ? 'a call started' : 'no call now'}`);
    try { if (on) writeFileAtomic(this.callFile, JSON.stringify({ since: new Date().toISOString() })); else unlinkSync(this.callFile); } catch { /* best effort */ }
    this.onCall?.(on);
  }
  /** 6.28: a tested engine waiting for his Restart now (the update key), or null. */
  private update: { version: string; since: number } | null = null;
  setUpdate(u: { version: string; since: number } | null): void { this.update = u; this.sendTabs(); }
  /** The browser window is open. */
  get showing(): boolean { return this.panes.some((p) => this.alive(p)); }
  /** Told when a call starts or ends (the update key). */
  onCall?: (on: boolean) => void;
  /** His pick from the share panel: one of the sources it showed, or nothing. */
  shareAnswer(id: number, sourceId: string | null, sound: boolean): void {
    const s = this.share;
    if (!s || s.id !== id) return;
    this.share = null;
    clearTimeout(s.timer);
    const src = sourceId ? s.sources.get(sourceId) : undefined;
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send('browser:share', { id, gone: true });
    try { s.done(src ? { video: src, ...(s.audio && sound ? { audio: 'loopback' as const } : {}) } : null); } catch { /* the page went away */ }
    if (src && s.host) { this.shareHosts.add(s.host); this.sendTabs(); }
  }

  /**
   * 6.24 spellcheck: Canadian and American English, like Chrome's. Chromium fetches the word lists from Google's
   * own dictionary server the first time, exactly as Chrome does. Suggestions are in the right-click menu.
   */
  private spelling(): void {
    try {
      const want = ['en-CA', 'en-US'].filter((l) => this.ses.availableSpellCheckerLanguages.includes(l));
      if (want.length) this.ses.setSpellCheckerLanguages(want);
      this.ses.setSpellCheckerEnabled(true);
    } catch { /* no spellcheck is better than no browser */ }
  }
  /** Work in the window of the tab this page is in (a site asking for something). */
  private inWc(wc: Electron.WebContents): void { const t = this.tabs.find((x) => x.view?.webContents === wc); if (t) this.inTab(t); }
  /** Hang a chip from the band and wait for his answer. Unanswered in 2 minutes means no. */
  private ask(a: { host: string; what: string; text?: string; yes?: string; no?: string }, done: (allow: boolean) => void): void {
    if (!this.win || this.win.isDestroyed()) { done(false); return; }
    const id = ++this.askSeq;
    const timer = setTimeout(() => { const f = this.asks.get(id); if (f) { this.asks.delete(id); f(false); } }, 120_000);
    this.asks.set(id, (allow) => { clearTimeout(timer); done(allow); });
    this.win.webContents.send('browser:ask', { id, ...a });
  }
  /** A link to an app (APP_LINKS): asked in the band, then handed to the system, which opens that app. */
  private offerApp(tab: Tab, u: string): void {
    const app = appOf(u);
    if (!app) return;
    let host = '';
    try { host = new URL(tab.view?.webContents.getURL() ?? '').hostname.replace(/^www\./, ''); } catch { /* none */ }
    this.inTab(tab);
    this.ask({ host, what: `Open ${app}?`, text: `${host || 'This page'} wants to hand you over to ${app}.`, yes: 'Open it', no: 'No' }, (ok) => {
      if (ok) void shell.openExternal(u).catch((e) => this.note(`${app} would not open: ${(e as Error).message}`));
    });
  }
  /** His answer to the chip. */
  answer(id: number, allow: boolean): void { const f = this.asks.get(id); if (f) { this.asks.delete(id); f(allow); } }

  /**
   * 6.22: downloads go to his Downloads folder and are marked as from the internet (the Mark of the Web),
   * so Windows Defender and SmartScreen check them before anything opens them, exactly as for Chrome.
   */
  private downloads(): void {
    this.ses.on('will-download', (_e, item, wc) => {
      // Aang's own pages never download (decision 42: he reads and clicks; files are not his to fetch).
      if (wc && this.driver?.owns(wc)) { item.cancel(); return; }
      if (wc) this.inWc(wc);
      const dir = app.getPath('downloads');
      const base = item.getFilename().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_') || 'download';
      let to = path.join(dir, base), n = 1;
      while (existsSync(to)) { const p = path.parse(base); to = path.join(dir, `${p.name} (${n++})${p.ext}`); }
      item.setSavePath(to);
      const from = item.getURL();
      let fromSite = '';
      try { fromSite = new URL(wc?.getURL() || from).hostname.replace(/^www\./, ''); } catch { /* unknown */ }
      const d = this.dls.start(to, fromSite, item.getTotalBytes());
      this.live.set(d.id, item);
      let lastGot = 0, lastAt = Date.now();
      item.on('updated', () => {
        const now = Date.now(), g = item.getReceivedBytes();
        const rate = now > lastAt ? ((g - lastGot) / (now - lastAt)) * 1000 : 0;
        const was = this.got.get(d.id)?.rate ?? rate;
        this.got.set(d.id, { got: g, total: item.getTotalBytes(), rate: was * 0.7 + rate * 0.3 });
        lastGot = g; lastAt = now;
        this.sendDownloads();
      });
      this.sendDownloads(true);
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
            if (site) { this.trusted.add(site); try { writeFileAtomic(this.trustedFile, JSON.stringify([...this.trusted])); } catch { /* best effort */ } this.sync?.changed('prefs'); }
            item.resume();
          });
        }
      }
      item.once('done', (_ev, state) => {
        if (state === 'completed') {
          try { writeFileSync(to + ':Zone.Identifier', `[ZoneTransfer]\r\nZoneId=3\r\nHostUrl=${isWeb(from) ? from : 'about:internet'}\r\n`); }
          catch (e) { console.error('shell: could not mark the download for Defender: ' + (e as Error).message); }
        }
        this.live.delete(d.id); this.got.delete(d.id);
        d.state = state === 'completed' ? 'done' : state === 'cancelled' ? 'stopped' : 'failed';
        if (state === 'completed') { try { d.size = statSync(to).size; } catch { /* keep */ } }
        this.dls.save();
        this.sendDownloads(state === 'completed' ? 'pop' : true);
        if (state === 'completed') this.win?.webContents.send('browser:download', { name: d.name, state, quiet: true });
        else if (state === 'interrupted') this.win?.webContents.send('browser:download', { name: d.name, state });
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
    this.sync?.changed('prefs');
    t?.view?.webContents.reload();
    this.sendTabs();
  }

  /** SY: the other machine's lists, in place of these. Every entry is checked as if it were typed here. */
  private takeLists(v: unknown): void {
    if (!v || typeof v !== 'object') return;
    const L = v as Record<string, unknown>;
    const put = (f: string, set: Set<string>) => { try { writeFileAtomic(f, JSON.stringify([...set])); } catch { /* best effort */ } };
    if (Array.isArray(L.popupOk)) { this.popupOk = new Set(hostList(L.popupOk)); put(this.popupOkFile, this.popupOk); }
    if (Array.isArray(L.trusted)) { this.trusted = new Set(hostList(L.trusted)); put(this.trustedFile, this.trusted); }
    if (Array.isArray(L.httpOk)) { this.httpOk = new Set(hostList(L.httpOk)); put(this.httpOkFile, this.httpOk); }
    if (Array.isArray(L.adsPaused)) {
      const next = new Set(hostList(L.adsPaused));
      for (const h of this.paused) if (!next.has(h)) this.ads?.pause(h, false);
      for (const h of next) if (!this.paused.has(h)) this.ads?.pause(h, true);
      this.paused = next; put(this.pausedFile, this.paused);
    }
    if (Array.isArray(L.stash)) {
      this.stash = L.stash.filter((x: any) => Number.isInteger(x?.id) && typeof x?.name === 'string' && Array.isArray(x?.tabs)).slice(0, 50)
        .map((x: any) => ({ id: x.id, name: String(x.name).slice(0, 24), at: Number(x.at) || 0,
          tabs: x.tabs.filter((t: any) => typeof t?.url === 'string' && isWeb(t.url) && urlKept(t.url)).slice(0, 80).map((t: any) => ({ url: t.url, title: String(t.title ?? t.url).slice(0, 200) })) }));
      this.stashSeq = Math.max(this.stashSeq, ...this.stash.map((x) => x.id));
      try { writeFileAtomic(this.stashFile, JSON.stringify(this.stash)); } catch { /* best effort */ }
    }
    this.sendTabs(); this.pushSettings();
  }
  /** The site's name for dark mode: its host without www. */
  private darkHost(u: string): string { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } }
  /** Dark mode on this page: on everywhere unless he switched it off for this site. */
  private darkWanted(u: string): boolean { return this.prefs.dark && isWeb(u) && !this.prefs.darkOff.includes(this.darkHost(u)); }
  /** Make one page dark, or put it back. Runs on every page load and on every switch. */
  private paintDark(t: Tab): void {
    const wc = t.view?.webContents;
    if (!wc || wc.isDestroyed() || t.internal || !isWeb(wc.getURL())) return;
    const on = this.darkWanted(wc.getURL());
    const src = darkSource();
    if (!src) return;
    const steps = on ? [{ code: `if(!globalThis.DarkReader){${src}\n};true` }, { code: `DarkReader.enable(${DARK_THEME});true` }] : [{ code: 'globalThis.DarkReader&&DarkReader.disable();true' }];
    void wc.executeJavaScriptInIsolatedWorld(DARK_WORLD, steps).catch(() => { /* the page went away */ });
  }
  private paintDarkAll(): void { for (const t of this.tabs) this.paintDark(t); }
  /** The shield's "Dark mode on this site" switch, for the site he is on. Synced with his other prefs. */
  setDarkHere(on: boolean): void {
    const host = this.darkHost(this.cur()?.url ?? '');
    if (!host) return;
    const off = new Set(this.prefs.darkOff);
    if (on) off.delete(host); else off.add(host);
    this.prefs.darkOff = [...off].slice(-2000);
    this.savePrefs();
    for (const t of this.tabs) if (this.darkHost(t.url) === host) this.paintDark(t);
    this.sendTabs();
  }

  setSounds(on: boolean): void {
    this.sounds = on;
    this.savePrefs();
    this.sendTabs();
  }

  private savePrefs(): void {
    try { writeFileAtomic(this.prefsFile, JSON.stringify({ sounds: this.sounds, ...this.prefs })); } catch { /* best effort */ }
    this.sync?.changed('prefs');
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
    else if (key === 'dark') { this.prefs.dark = on; this.paintDarkAll(); }
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
    const w = this.win, P = this.pane;
    const t = this.cur();
    if (!w || w.isDestroyed()) return;
    this.drawerOpen = open;
    if (open) this.veilDown(0);
    if (!open) { if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; } this.place(); if (t?.view && !t.lent) t.view.setVisible(true); w.webContents.send('browser:frozen', null); return; }
    const p = this.peekShot;
    this.peekShot = null;
    // A picture taken on the hover is good if it is the same page and under 1.5 seconds old.
    let shot = t && p && p.tab === t.id && p.url === t.url && Date.now() - p.at < 1500 && !t.loading ? p.shot : null;
    if (!shot && t) shot = await this.shotOf(t);
    this.pane = P;
    if (!this.drawerOpen) return;               // closed again while the picture was taken
    w.webContents.send('browser:frozen', shot);
    if (!shot) { this.frozenReady(); return; }
    // The frame answers 'frozen-ready' once the picture is painted; never wait more than a moment for it.
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => { this.pane = P; this.frozenReady(); }, 250);
  }

  /** The frame, or the tab list's own layer (it sends the same tab clicks). */
  // These also say which window the message is about: every frame message is checked here first, so from here on the
  // browser works in that window.
  isFrame(sender: Electron.WebContents): boolean {
    const p = this.panes.find((x) => (this.alive(x) && sender === x.win!.webContents) || (x.trayV && !x.trayV.webContents.isDestroyed() && sender === x.trayV.webContents));
    if (p) this.pane = p;
    return Boolean(p);
  }
  isMainFrame(sender: Electron.WebContents): boolean {
    const p = this.panes.find((x) => this.alive(x) && sender === x.win!.webContents);
    if (p) this.pane = p;
    return Boolean(p);
  }

  // ------------------------------------------------------------------ the tab list, floating over the live page
  /**
   * His ask (2026-10-13): Twitch froze under the drawer (it showed a picture of the page), and the page must not get
   * smaller either. So the list is drawn in its own see-through layer ABOVE the live page: the video stays full size
   * and keeps playing under its edge. The layer is the frame's own page (?tray), so it is the same list, the same
   * clicks, the same drag and drop.
   */
  private trayView(): WebContentsView | null {
    const w = this.win;
    if (!w || w.isDestroyed()) return null;
    if (this.trayV && !this.trayV.webContents.isDestroyed()) return this.trayV;
    const v = new WebContentsView({ webPreferences: { ...SAFE_WEB_PREFERENCES, preload: this.o.preloadPath } });
    lockDown(v.webContents);
    v.setBackgroundColor('#00000000');
    v.setVisible(false);
    const P = this.pane;
    v.webContents.on('did-finish-load', () => this.sendTabs());
    v.webContents.on('before-input-event', (e, input) => { this.pane = P; if (this.key(input)) e.preventDefault(); });
    void v.webContents.loadURL(`${this.o.origin}/browser.html?tray=1`);
    this.trayV = v;
    return v;
  }
  /** Open the list where the frame says (beside its handle, under the band), or put it away. */
  tray(open: boolean, at?: { x?: unknown; y?: unknown }): void {
    const w = this.win;
    if (!w || w.isDestroyed()) return;
    if (!open) {
      if (this.trayV && !this.trayV.webContents.isDestroyed()) this.trayV.setVisible(false);
      if (this.trayOn) { this.trayOn = false; w.webContents.send('browser:tray', { open: false }); w.webContents.focus(); }
      return;
    }
    const v = this.trayView();
    if (!v) return;
    const n = (x: unknown, d: number) => (Number.isFinite(Number(x)) ? Math.max(0, Math.round(Number(x))) : d);
    this.trayAt = { x: n(at?.x, this.trayAt.x), y: n(at?.y, this.trayAt.y) };
    this.trayOn = true;
    this.placeTray();
    w.contentView.addChildView(v);             // to the top, over the page
    v.setVisible(true);
    v.webContents.focus();
    this.sendTabs();
  }
  private raiseTray(): void { if (this.trayOn && this.trayV && this.win && !this.win.isDestroyed()) this.win.contentView.addChildView(this.trayV); }
  private placeTray(): void {
    const w = this.win, v = this.trayV;
    if (!w || w.isDestroyed() || !v || !this.trayOn) return;
    const [cw, ch] = w.getContentSize();
    v.setBounds({ x: this.trayAt.x, y: this.trayAt.y, width: Math.max(0, Math.min(340, cw - this.trayAt.x)), height: Math.max(0, ch - this.trayAt.y) });
  }

  /** Open the window (or bring it forward), optionally on an address. Coming back, every tab comes back. */
  open(url?: string): void {
    const p = this.lastPane();
    if (p) {
      this.pane = p;
      bringFront(p.win!);
      if (url) this.newTab(url);
      return;
    }
    this.createPane(url);
  }

  /**
   * A browser window. The first one brings his tabs back (or his home page); one made by dragging a tab out of another
   * (`bring`) opens where he let go and takes that tab, live, nothing reloaded.
   */
  private createPane(url?: string, bring?: Tab | Tab[], at?: { x: number; y: number; width: number; height: number }): void {
    const first = !this.panes.some((x) => this.alive(x));
    const wa = screen.getPrimaryDisplay().workArea;
    const was = first ? this.savedPlace() : null;
    // A new run: the download tray starts empty (its key hidden) until something downloads.
    if (first) this.traySince = Date.now();
    const p = newPane(++this.paneSeq);
    const w = new BrowserWindow({
      width: Math.min(1440, wa.width - 80), height: Math.min(900, wa.height - 60), minWidth: 720, minHeight: 480,
      ...(was ? { x: was.x, y: was.y, width: was.width, height: was.height } : {}),
      ...(at ? { x: Math.round(at.x), y: Math.round(at.y), width: Math.max(720, Math.round(at.width)), height: Math.max(480, Math.round(at.height)) } : {}),
      show: false, backgroundColor: '#24160D', title: 'Aang Browser',
      // The carved band IS the title bar; Windows draws its own buttons over the band's right end.
      // See-through (the research: Flow browser), so Windows' own minimise, maximise and close sit ON the wood
      // with their real hover and snap layouts, instead of on a flat block that looked stuck on.
      // His pick (2026-10-12): Aang draws his own bold gold minimise, maximise and close on the band; Windows' were too thin.
      titleBarStyle: 'hidden',
      webPreferences: { ...SAFE_WEB_PREFERENCES, preload: this.o.preloadPath },
    });
    p.win = w;
    this.panes.push(p);
    this.pane = p;
    this.focused = p;
    lockDown(w.webContents);
    softEdge(w);
    // M6: on the Mac, 'hidden' still shows the red, yellow and green buttons, floating over the band's left end (his
    // report, 2026-10-13). Aang's own gold buttons are the window's buttons on both machines.
    if (process.platform === 'darwin') w.setWindowButtonVisibility(false);
    if (was?.maximized) w.once('ready-to-show', () => w.maximize());
    let keep: NodeJS.Timeout | null = null;
    // Where the first window was is kept for next time; the others are made by dragging and open where they are dropped.
    const keepSoon = () => { if (keep) clearTimeout(keep); keep = setTimeout(() => { this.pane = p; if (this.panes[0] === p) this.keepPlace(); }, 800); };
    w.on('focus', () => { this.focused = p; });
    w.on('resize', () => { this.pane = p; this.place(); this.placeTray(); keepSoon(); });
    w.on('move', keepSoon);
    w.on('maximize', () => { this.pane = p; this.place(); keepSoon(); this.sendTabs(); });
    w.on('unmaximize', () => { this.pane = p; this.place(); keepSoon(); this.sendTabs(); });
    w.on('close', () => { this.pane = p; if (this.panes[0] === p) this.keepPlace(); if (!this.quitting) void this.snapshot(); this.visits.flush(); this.veil = null; try { this.curtain?.webContents.close(); } catch { /* gone */ } this.curtain = null; });
    // 6.22b bug 4: the mouse's back and forward side buttons.
    w.on('app-command', (_e, cmd) => { this.pane = p; if (cmd === 'browser-backward') this.sideNav('back'); else if (cmd === 'browser-forward') this.sideNav('forward'); });
    // A page in fullscreen: leaving the window's fullscreen (F11, a snap) ends it too.
    w.on('leave-full-screen', () => { const t = this.tabs.find((x) => x.id === p.fullTab); if (t?.view) void within(t.view.webContents.executeJavaScript('document.fullscreenElement&&document.exitFullscreen().catch(()=>{});true', true), 500, null); });
    w.on('closed', () => {
      this.pane = p;
      const others = this.panes.filter((x) => x !== p && this.alive(x));
      // Quitting: this window's tabs stay in the snapshot already taken; nothing is dropped or saved again.
      if (others.length && this.quitting) { p.win = null; p.trayV = null; p.trayOn = false; this.panes = others; if (this.focused === p) this.focused = null; this.pane = others[others.length - 1]!; return; }
      if (others.length) {
        // One of several windows: its tabs close (Reopen closed tab brings them back), the browser goes on.
        for (const t of this.paneTabs(p)) {
          if (t.lent) { t.pane = others[0]!.id; continue; }       // playing in the popout: it comes back to another window
          if (isWeb(t.url)) { this.closed.push(t.url); if (this.closed.length > 25) this.closed.shift(); }
          this.closeView(t);
        }
        this.tabs = this.tabs.filter((t) => t.pane !== p.id);
        if (p.watchTimer) clearTimeout(p.watchTimer);
        p.win = null; p.trayV = null; p.trayOn = false;
        this.panes = others;
        if (this.focused === p) this.focused = null;
        this.pane = others[others.length - 1]!;
        this.tidyTrails();
        this.changed();
        return;
      }
      if (this.menu && !this.menu.isDestroyed()) this.menu.destroy();
      this.vault.lock();                          // closing the browser locks the vault
      this.mediaOk.clear();                       // and ends every call's camera and microphone
      this.shareHosts.clear();
      this.callNow(false);
      if (this.share) this.shareAnswer(this.share.id, null, false);
      this.menu = null; this.fullTab = null;
      for (const t of this.tabs) if (!t.lent) this.closeView(t);
      this.tabs = []; this.active = null; this.win = null; this.trayV = null; this.trayOn = false;
      this.panes = []; this.focused = null; this.quitting = false;
      this.timers.forEach(clearInterval); this.timers = [];
    });
    w.once('ready-to-show', () => bringFront(w));
    w.webContents.once('did-finish-load', () => {
      this.pane = p;
      // Made by dragging a tab out: that tab moves in, live.
      if (bring) {
        const list = (Array.isArray(bring) ? bring : [bring]).filter((t) => this.tabs.includes(t) && !t.lent && this.paneOfTab(t));
        for (const t of list) this.moveTo(t, p);           // the last one moved ends up in front
        if (!list.length) this.newTab(this.HOME);
        return;
      }
      // Startup (Settings > General): his tabs as they were, or a fresh home page.
      if (!first) { this.newTab(url ?? this.HOME); return; }
      if (this.prefs.startup === 'home' || !this.restore()) this.newTab(url ?? this.HOME);
      else if (url) this.newTab(url);                       // his tabs come back, and the link he clicked opens on top
    });
    void w.loadURL(`${this.o.origin}/browser.html`);
    // The continuous snapshot, and putting idle tabs to sleep: once for the whole browser.
    if (first) this.timers.push(setInterval(() => { void this.snapshot(); }, 8000), setInterval(() => this.sleepIdle(), 60_000),
      setInterval(() => { void this.lookForLogin(); }, 1500));
  }

  /**
   * His ask (2026-10-13): a tab dragged out of the list and let go outside its window becomes its own window there, like
   * Chrome; let go on another of Aang's browser windows, it joins that one. Its page goes with it, still playing,
   * nothing reloaded. The only tab in its window: the window itself moves there.
   */
  tearOut(tabId: number): void {
    const t = this.tabs.find((x) => x.id === tabId);
    const src = t ? this.paneOfTab(t) : undefined;
    if (!t || t.lent || !this.alive(src)) return;
    const pt = screen.getCursorScreenPoint();
    const inside = (w: BrowserWindow) => { const b = w.getBounds(); return pt.x >= b.x && pt.x < b.x + b.width && pt.y >= b.y && pt.y < b.y + b.height; };
    if (inside(src.win)) return;                               // let go inside its own window: nothing happens
    this.pane = src;
    this.tray(false);
    const into = this.panes.find((x) => x !== src && this.alive(x) && inside(x.win!));
    if (into) { this.moveTo(t, into); into.win!.focus(); return; }
    const b = src.win.isMaximized() ? { width: 1200, height: 800 } : src.win.getNormalBounds();
    const spot = { x: pt.x - 140, y: pt.y - 24, width: b.width, height: b.height };
    if (this.paneTabs(src).length === 1) {
      if (src.win.isMaximized()) src.win.unmaximize();
      src.win.setBounds(spot);
      src.win.focus();
      return;
    }
    this.createPane(undefined, t, spot);
  }
  /** "Move to a new window" from the tab's right-click menu: a new window a little down and right of this one. */
  newWindowFor(tabId: number): void {
    const t = this.tabs.find((x) => x.id === tabId);
    const src = t ? this.paneOfTab(t) : undefined;
    if (!t || t.lent || !this.alive(src) || this.paneTabs(src).length < 2) return;
    this.pane = src;
    const b = src.win.isMaximized() ? { x: src.win.getBounds().x + 80, y: src.win.getBounds().y + 80, width: 1200, height: 800 } : src.win.getNormalBounds();
    this.createPane(undefined, t, { x: b.x + 48, y: b.y + 48, width: b.width, height: b.height });
  }
  /** A tab into another window: its live page is handed across; the window it left shows its next tab, or closes. */
  private moveTo(t: Tab, to: Pane): void {
    const from = this.paneOfTab(t);
    if (!from || from === to || !this.alive(to)) return;
    this.pane = from;
    if (from.veil?.tab === t.id) this.veilDown(0);
    if (from.fullTab === t.id) from.fullTab = null;
    if (from.watching !== null && from.active === t.id) this.unwatch(false);
    const at = this.paneTabs(from).indexOf(t);
    if (t.view) {
      try { if (this.alive(from)) from.win!.contentView.removeChildView(t.view); } catch { /* not shown */ }
      t.view.setVisible(false);
      to.win!.contentView.addChildView(t.view);
      if (to.trayOn && to.trayV) to.win!.contentView.addChildView(to.trayV);   // the open tab list stays on top
    }
    t.pane = to.id;
    t.opener = null;
    // Last in the list of its new window.
    this.tabs.splice(this.tabs.indexOf(t), 1);
    this.tabs.push(t);
    if (from.active === t.id) {
      from.active = null;
      const rest = this.paneTabs(from);
      const next = rest[Math.min(Math.max(0, at), rest.length - 1)];
      if (next) this.activate(next.id);
      else if (this.alive(from)) from.win!.close();
    }
    this.pane = to;
    this.activate(t.id);
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
    if (t.crashed || t.blocked || t.failed) { t.view.setBounds({ x: 0, y: 0, width: 0, height: 0 }); this.veilDown(0); return; }
    if (this.fullTab === t.id) { t.view.setBounds({ x: 0, y: 0, width: cw, height: ch }); this.veilDown(0); return; }
    t.view.setBounds({ x: this.inset.left, y: this.inset.top, width: Math.max(0, cw - this.inset.left - this.inset.right), height: Math.max(0, ch - this.inset.top - this.inset.bottom) });
    if (this.veil?.up && this.curtain) this.curtain.setBounds(t.view.getBounds());
  }

  // ------------------------------------------------------------------ the soft fade between pages (his pick, 2026-10-12)
  /**
   * Option 5 from the loading demo. When a page starts to change, a picture of the old page is laid over it in a
   * see-through layer of Aang's own (the curtain), so there is never a blank flash; a slow site dims it a little;
   * the moment the new page first draws, the curtain fades out over 0.25 s and the new page is underneath. A page
   * that arrives at once (Back, a fast site) just switches. A tab with nothing drawn yet shows the wood instead.
   */
  private veilSeq = 0;
  private curtainView(): WebContentsView | null {
    const w = this.win;
    if (!w || w.isDestroyed()) return null;
    if (this.curtain && !this.curtain.webContents.isDestroyed()) return this.curtain;
    const v = new WebContentsView({ webPreferences: { ...SAFE_WEB_PREFERENCES } });
    lockDown(v.webContents);
    v.setBackgroundColor('#00000000');
    try { v.setBorderRadius(PAGE_RADIUS); } catch { /* square */ }
    v.setVisible(false);
    w.contentView.addChildView(v);
    this.curtain = v;
    this.curtainReady = v.webContents.loadURL(`${this.o.origin}/curtain.html`).catch(() => {});
    return v;
  }
  /**
   * `from`: the page he was looking at when he opened a new tab (2026-10-13, his ask: no glitchy blank frame). It stays on
   * screen until the curtain holds its picture, then the new tab is swapped in underneath and fades in as it draws.
   */
  private async veilUp(t: Tab, from?: Tab): Promise<void> {
    const P = this.pane;
    // However this ends, the new tab ends up shown and the one it came from hidden.
    const swap = () => {
      this.pane = P;
      if (!from || t.id !== this.active || !t.view) return;
      if (!this.drawerOpen) t.view.setVisible(true);
      if (from.view && from.id !== this.active && !from.lent) from.view.setVisible(false);
    };
    try { await this.veilUpInner(t, from); } finally { swap(); }
  }
  private async veilUpInner(t: Tab, from?: Tab): Promise<void> {
    const P = this.pane;
    if (this.veil?.tab === t.id) return;                       // a redirect inside one change keeps the same curtain
    if (t.id !== this.active || !t.view || t.lent || t.internal || this.drawerOpen || this.fullTab === t.id || t.crashed || t.blocked || t.failed) return;
    this.veilDown(0);
    const v = this.curtainView();
    if (!v) return;
    const nav = ++this.veilSeq;
    this.veil = { tab: t.id, nav, at: Date.now(), up: false, dimT: null, capT: null };
    // The hover picture if it is fresh and of this page; otherwise a new one. Nothing drawn yet: the wood.
    const p = this.peekShot;
    const shot = !t.drawn ? (from ? await this.shotOf(from) : null) : p && p.tab === t.id && Date.now() - p.at < 1500 ? p.shot : await this.shotOf(t);
    await P.curtainReady;
    this.pane = P;
    if (this.veil?.nav !== nav) return;                         // the new page drew first: a plain switch
    const ok = await within(v.webContents.executeJavaScript(`curtainShow(${JSON.stringify(shot)})`), 400, false);
    this.pane = P;
    const vl = this.veil;
    if (!ok || vl?.nav !== nav || !t.view || t.id !== this.active || this.drawerOpen) { if (vl?.nav === nav) this.veil = null; return; }
    v.setBounds(t.view.getBounds());
    this.win?.contentView.addChildView(v);                      // to the top, over the page
    this.raiseTray();                                           // but never over the open tab list
    v.setVisible(true);
    vl.up = true;
    vl.dimT = setTimeout(() => { if (P.veil?.nav === nav) void v.webContents.executeJavaScript('curtainDim()').catch(() => {}); }, VEIL_DIM_MS);
    vl.capT = setTimeout(() => { this.pane = P; if (this.veil?.nav === nav) this.veilDown(VEIL_FADE_MS); }, VEIL_MAX_MS);
  }
  private veilDown(fade: number): void {
    const vl = this.veil;
    this.veil = null;
    if (!vl) return;
    if (vl.dimT) clearTimeout(vl.dimT);
    if (vl.capT) clearTimeout(vl.capT);
    const v = this.curtain;
    if (!v || v.webContents.isDestroyed() || !vl.up) return;
    // A page that came at once just switches: fading it would only add a wait that was not there.
    const ms = Date.now() - vl.at < VEIL_INSTANT_MS ? 0 : fade;
    if (!ms) { v.setVisible(false); return; }
    void v.webContents.executeJavaScript(`curtainFade(${ms})`).catch(() => {});
    const P = this.pane;
    setTimeout(() => { if (!P.veil?.up) v.setVisible(false); }, ms + 30);
  }
  /** The tab's page has drawn its first content (from tabpreload.cjs): the curtain can go. */
  painted(sender: Electron.WebContents): void {
    const t = this.tabs.find((x) => x.view?.webContents === sender);
    if (!t || !this.inTab(t)) return;
    t.drawn = true;
    if (t.phase !== 'idle') { t.prog = Math.max(t.prog ?? 0, 0.7); this.sendTabs(); }
    if (this.veil?.tab === t.id) this.veilDown(VEIL_FADE_MS);
  }

  /** Give a tab a live page, at its address, then put it back where it was scrolled. */
  private wake(tab: Tab): void {
    if (tab.internal) { this.wakeSettings(tab); return; }
    // The safe preferences, but a tab in the background may sleep: unlike the pop-out it has no reason to
    // keep painting over his game. NOT lockDown(): that pins a window to one page, and a browser navigates.
    // tabpreload.cjs exposes nothing to the page; it only hides passkeys, which hang in Electron (6.22).
    // plugins: Chromium's own PDF viewer, so a PDF opens in the tab instead of downloading (6.22b item 12).
    const view = new WebContentsView({ webPreferences: { ...SAFE_WEB_PREFERENCES, backgroundThrottling: true, session: this.ses, preload: this.o.tabPreloadPath, plugins: true } });
    const wc = view.webContents;
    // A new view paints white until its page draws; that white is the flash between pages. Paint it the
    // page area's own colour instead, and keep it in the window, hidden, so switching to it is instant.
    view.setBackgroundColor(PAGE_COLOUR);
    try { view.setBorderRadius(PAGE_RADIUS); } catch { /* an older runtime: square corners */ }
    view.setVisible(false);
    this.inTab(tab);
    this.win?.contentView.addChildView(view);
    this.raiseTray();                                   // a waking tab never covers the open tab list
    tab.view = view; tab.crashed = false; tab.loading = true; tab.drawn = false;
    // Every event from this page is about the window the tab is in NOW (it can be dragged to another).
    const on = ((ev: string, fn: (...a: any[]) => void) => wc.on(ev as 'destroyed', (...a: any[]) => { this.inTab(tab); fn(...a); })) as unknown as Electron.WebContents['on'];
    wc.on('will-attach-webview', (e) => e.preventDefault());
    this.nameFor(wc);
    // A link that opens a new window becomes a tab under the one it came from. Web pages only.
    // A middle click or Ctrl+click opens it behind, the way every browser does.
    // "Block popups" (on unless he turns it off): a page opening a new WINDOW by itself is refused; a link he
    // opens in a new tab still opens as a tab.
    // Popups (his pick, 2026-10-12, Chrome's rule): one opened within a second of his click or key press is his, and
    // opens as a real small window that keeps its link to the page (Sign in with Google needs that). One a page opens
    // by itself is blocked, unless he allowed popups on that site; a chip offers that.
    on('input-event', (_e, i) => {
      if (i.type === 'mouseDown' || i.type === 'keyDown') this.lastGesture.set(tab.id, Date.now());
      // (2026-10-14, his rule: a click never closes the tab list; only his mouse leaving it does.)
    });
    wc.setWindowOpenHandler(({ url: u, disposition }) => {
      this.inTab(tab);
      if (!isWeb(u)) { this.offerApp(tab, u); return { action: 'deny' }; }
      if (disposition === 'new-window') {
        let site = '';
        try { site = new URL(wc.getURL()).hostname.replace(/^www\./, ''); } catch { /* none */ }
        const his = Date.now() - (this.lastGesture.get(tab.id) ?? 0) < GESTURE_MS;
        if (this.listed(u).length) return { action: 'deny' };
        if (!this.prefs.popups || his || this.popupOk.has(site)) {
          return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 680, autoHideMenuBar: true, backgroundColor: PAGE_COLOUR,
            title: 'Aang Browser', webPreferences: { ...SAFE_WEB_PREFERENCES, session: this.ses, preload: this.o.tabPreloadPath } } };
        }
        // His call (2026-10-12): no chip. The shield glows one solid blue; he clicks it to see what was blocked and
        // can open it or allow the site, so a popup he was actually waiting for is one click away.
        console.log('shell: browser: popup blocked');
        tab.blockedPopup = { url: u, site };
        this.sendTabs();
        return { action: 'deny' };
      }
      this.newTab(u, tab.id, disposition !== 'background-tab');
      return { action: 'deny' };
    });
    on('did-create-window', (pw) => this.popupWindow(pw));
    // 6.22: a listed site never loads, whether it is a link, a redirect or anything else.
    on('will-navigate', (e, u) => {
      if (!isWeb(u)) { e.preventDefault(); this.offerApp(tab, u); return; }
      if (this.toPaid(u)) { e.preventDefault(); return; }
      const l = this.listed(u);
      if (l.length) { e.preventDefault(); this.block(tab, u, l); return; }
      const up = upgrade(u, this.httpOk);
      if (up) { e.preventDefault(); tab.upgraded = u; setTimeout(() => { if (!wc.isDestroyed()) void wc.loadURL(up).catch(() => {}); }, 0); }
    });
    on('will-redirect', (e, u, _inPage, isMain) => {
      if (!isMain) return;
      if (isWeb(u) && this.toPaid(u)) { e.preventDefault(); return; }
      if (!isWeb(u) && appOf(u)) { e.preventDefault(); this.offerApp(tab, u); return; }
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
    on('did-start-navigation', (d) => {
      const x = d as unknown as { url: string; isMainFrame: boolean; isSameDocument: boolean };
      if (!x.isMainFrame || x.isSameDocument) return;
      if (tab.failed) { tab.failed = null; this.place(); this.changed(); }
      if (tab.blockedPopup) { tab.blockedPopup = null; this.sendTabs(); }   // a new page: the old popup is old news
      try { if (tab.upgraded && new URL(tab.upgraded).hostname !== new URL(x.url).hostname) tab.upgraded = null; } catch { tab.upgraded = null; }
    });
    // The page did not load: Aang's own plate instead of Chromium's grey page. Cancelled loads (-3) are not failures.
    on('did-fail-load', (_e, code, _desc, url, isMain) => {
      if (isMain) { tab.pending = null; if (this.veil?.tab === tab.id) this.veilDown(0); }
      if (!isMain || code === -3 || !isWeb(url)) return;
      let host = '';
      try { host = new URL(url).hostname; } catch { /* keep */ }
      let wasUp = false;
      try { wasUp = tab.upgraded !== null && url.startsWith('https:') && new URL(tab.upgraded).hostname === host; } catch { /* no */ }
      if (wasUp && code !== -106 && code !== -105) this.fail(tab, { kind: 'insecure', url: tab.upgraded!, title: "This site isn't secure", text: '', retry: false });
      else this.fail(tab, { kind: 'error', url, ...failureWords(code, host) });
    });
    on('did-start-navigation', (d) => { const x = d as unknown as { url: string; isMainFrame: boolean }; if (!x.isMainFrame || !isWeb(x.url)) return; const l = this.listed(x.url); if (l.length) this.block(tab, x.url, l); });
    on('page-title-updated', (_e, title) => { tab.title = title; this.visits.name(wc.getURL(), title); this.changed(); });
    on('page-favicon-updated', (_e, icons) => {
      tab.favicon = icons.find((i) => /^https?:|^data:image\//.test(i)) ?? '';
      this.sendTabs();
      // Keep it for the site's bookmark, so the shelf shows it even before he visits again.
      try { const host = new URL(wc.getURL()).hostname; if (tab.favicon && !this.icons.has(host)) void this.keepIcon(host, tab.favicon); } catch { /* none */ }
    });
    on('did-start-loading', () => { tab.loading = true; if (tab.crashed) { tab.crashed = false; this.place(); } this.sendTabs(); });
    on('did-stop-loading', () => {
      tab.loading = false; tab.phase = 'idle'; tab.prog = 1; tab.pending = null; tab.drawn = true;
      if (this.veil?.tab === tab.id) this.veilDown(VEIL_FADE_MS);
      this.sendTabs();
    });
    // The loading steps (2026-10-12): the click, the site answering, the page read, the page drawn (painted()).
    on('did-start-navigation', (d) => {
      const x = d as unknown as { url: string; isMainFrame: boolean; isSameDocument: boolean };
      if (!x.isMainFrame || x.isSameDocument) return;
      tab.phase = 'waiting'; tab.prog = 0.08;
      if (isWeb(x.url)) void this.veilUp(tab);
      this.sendTabs();
    });
    on('dom-ready', () => { this.paintDark(tab); if (tab.phase !== 'idle') { tab.prog = Math.max(tab.prog ?? 0, 0.55); this.sendTabs(); } });
    on('did-navigate', (_e, u, status) => {
      tab.url = u; tab.scrollY = 0; if (status > 0) tab.upgraded = null; if (status < 400) this.visits.add(u, '');
      tab.pending = null;
      if (tab.phase !== 'idle') { tab.phase = 'loading'; tab.prog = Math.max(tab.prog ?? 0, 0.35); }
      this.changed();
    });
    on('did-navigate-in-page', (_e, u, main) => { tab.url = u; if (main) this.visits.add(u, wc.getTitle()); this.changed(); });
    // Find on page: how many matches, and which one is lit. Only the tab he is looking at reports.
    on('found-in-page', (_e, r) => { if (tab.id === this.active) this.win?.webContents.send('browser:found', { at: r.activeMatchOrdinal, of: r.matches }); });
    // 6.22b bug 1: a page's own fullscreen (a video's button) fills the whole screen, band and drawer gone; it
    // comes back exactly as it was when the page leaves fullscreen (its button, or Esc).
    on('enter-html-full-screen', () => {
      const w = this.win;
      if (!w || w.isDestroyed() || tab.lent) return;
      this.fullTab = tab.id;
      try { view.setBorderRadius(0); } catch { /* square anyway */ }
      w.setFullScreen(true);
      this.place();
    });
    on('leave-html-full-screen', () => {
      if (this.fullTab !== tab.id) return;
      this.fullTab = null;
      try { view.setBorderRadius(PAGE_RADIUS); } catch { /* an older runtime */ }
      if (this.win && !this.win.isDestroyed() && this.win.isFullScreen()) this.win.setFullScreen(false);
      this.place();
    });
    // 6.22b bug 2: right-click on the page opens Aang's own wood menu.
    on('context-menu', (_e, p) => this.pageMenu(tab, p));
    // Link preview (6.22b item 8): the real address of the link he points at, shown in the wood under the page.
    on('update-target-url', (_e, u) => { if (tab.id === this.active) this.win?.webContents.send('browser:hover', isWeb(u) ? u.slice(0, 600) : ''); });
    // One video at a time (his rule, 2026-10-13): when this tab starts making sound, every other one stops, here and on
    // the other machine. Sound, not just playing: a silent hover preview (YouTube's front page) stops nothing.
    on('audio-state-changed', (e) => {
      const was = tab.audible;
      tab.audible = (e as unknown as { audible: boolean }).audible;
      if (tab.audible && !was && !tab.call) this.onePlaying(tab);
      this.sendTabs();
    });
    // A crashed page goes blank and anything that pokes it hangs (tested 2026-10-04): mark it, never touch it.
    on('render-process-gone', () => { tab.crashed = true; tab.loading = false; this.place(); this.sendTabs(); });
    // The keys work wherever the keyboard is, page or frame.
    // Not while it is lent to the popout: Ctrl+W there must not close a tab in here.
    on('before-input-event', (e, input) => { if (!tab.lent && this.key(input)) e.preventDefault(); });
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

  /**
   * The Settings tab (his design, 2026-10-12): the browser's own page in a tab. It has its own small preload with
   * only the settings doors, lives in Aang's own session (never his browsing one), and is pinned to its page:
   * nothing can navigate it anywhere, and typing an address while on it opens a new tab instead.
   */
  private wakeSettings(tab: Tab): void {
    const things = tab.internal === 'things';
    const view = new WebContentsView({ webPreferences: { ...SAFE_WEB_PREFERENCES, preload: things ? this.o.thingsPreloadPath : this.o.settingsPreloadPath } });
    const wc = view.webContents;
    lockDown(wc);
    view.setBackgroundColor('#24160D');
    try { view.setBorderRadius(PAGE_RADIUS); } catch { /* square */ }
    view.setVisible(false);
    this.inTab(tab);
    this.win?.contentView.addChildView(view);
    this.raiseTray();
    tab.view = view; tab.crashed = false; tab.loading = false; tab.title = things ? 'Your things' : 'Settings';
    wc.on('before-input-event', (e, input) => { this.inTab(tab); if (this.key(input)) e.preventDefault(); });
    wc.on('render-process-gone', () => { this.inTab(tab); tab.crashed = true; this.place(); this.sendTabs(); });
    void wc.loadURL(`${this.o.origin}/${things ? 'things' : 'settings'}.html`).catch(() => {});
  }
  isSettings(sender: Electron.WebContents): boolean { const t = this.tabs.find((x) => x.internal === 'settings' && x.view?.webContents === sender); if (t) this.inTab(t); return Boolean(t); }
  /** Open Settings (or bring its tab forward), at a section. */
  openSettings(section = 'general'): void {
    if (!this.win || this.win.isDestroyed()) return;
    let t = this.tabs.find((x) => x.internal === 'settings');
    if (!t) {
      t = { id: ++this.seq, internal: 'settings', view: null, opener: null, title: 'Settings', url: 'aang:settings', favicon: '', loading: false, audible: false, muted: false, crashed: false,
        scrollY: 0, zoom: 0, lastSeen: Date.now(), blocked: null, trail: null, done: false, lent: false, upgraded: null, failed: null, blockedPopup: null, pane: this.pane.id };
      this.tabs.push(t);
    }
    this.activate(t.id);
    this.win?.focus();
    const wc = t.view?.webContents;
    if (wc) { const go = () => wc.send('settings:section', String(section).slice(0, 20)); if (wc.isLoading()) wc.once('did-finish-load', go); else go(); }
  }
  private vaultChecking = false;
  /** Everything Settings shows. Plain data only. */
  async settingsData(): Promise<Record<string, unknown>> {
    // The Bitwarden check takes over 2 seconds (it starts a whole program), so Settings draws with the last
    // known answer and is updated when the fresh one comes in.
    const vault = this.vault.known;
    if (!this.vaultChecking) {
      this.vaultChecking = true;
      void this.vault.state().then((v) => { this.vaultChecking = false; if (v !== vault) this.pushSettings(); }, () => { this.vaultChecking = false; });
    }
    return {
      home: this.prefs.home !== DEFAULT_HOME ? this.prefs.home : '', homeNow: this.HOME,
      search: this.prefs.search, aiBox: this.prefs.aiBox, startup: this.prefs.startup,
      ads: this.prefs.ads, popups: this.prefs.popups, sounds: this.sounds, dark: this.prefs.dark,
      popupOk: [...this.popupOk].sort(), trusted: [...this.trusted].sort(), httpOk: [...this.httpOk].sort(),
      marks: this.marks.slice(0, 400).map((m) => ({ title: m.title, url: m.url, favicon: this.iconOf(m.url) })), markCount: this.marks.length,
      vault, phish: this.phish.count(),
      versions: { electron: process.versions.electron, chrome: process.versions.chrome }, mac: process.platform === 'darwin',
    };
  }
  private pushSettings(): void {
    const wc = this.tabs.find((x) => x.internal === 'settings')?.view?.webContents;
    if (wc && !wc.isDestroyed()) void this.settingsData().then((d) => { if (!wc.isDestroyed()) wc.send('settings:data', d); });
  }
  /** A change made in Settings. Only these keys; anything else is ignored. */
  setSetting(key: string, value: unknown): void {
    switch (key) {
      case 'home': this.setHome(String(value ?? '')); break;
      case 'search': this.prefs.search = value === 'ddg' || value === 'google' || value === 'yandex' ? value : 'brave'; setSearch(this.prefs.search, this.prefs.aiBox); this.savePrefs(); break;
      case 'aiBox': this.prefs.aiBox = value === true; setSearch(this.prefs.search, this.prefs.aiBox); this.savePrefs(); break;
      case 'startup': this.prefs.startup = value === 'home' ? 'home' : 'tabs'; this.savePrefs(); break;
      case 'ads': case 'popups': case 'sounds': case 'dark': this.setPref(key, value === true); break;
      default: return;
    }
    this.sendTabs();
    this.pushSettings();
  }
  /** Take one entry off a list he made (sites allowed popups, trusted for downloads, opened without https, bookmarks). */
  removeEntry(list: string, value: string): void {
    const v = String(value ?? '').slice(0, 2000);
    const save = (f: string, s: Set<string>) => { try { writeFileAtomic(f, JSON.stringify([...s])); } catch { /* best effort */ } };
    if (list === 'popupOk' && this.popupOk.delete(v)) save(this.popupOkFile, this.popupOk);
    else if (list === 'trusted' && this.trusted.delete(v)) save(this.trustedFile, this.trusted);
    else if (list === 'httpOk' && this.httpOk.delete(v)) save(this.httpOkFile, this.httpOk);
    else if (list === 'marks') { const i = this.marks.findIndex((m) => m.url === v); if (i >= 0) { this.marks.splice(i, 1); this.saveMarks(); } }
    else return;
    if (list !== 'marks') this.sync?.changed('prefs');
    this.sendTabs();
    this.pushSettings();
  }
  settingsAct(act: string): void {
    if (act === 'import') void this.importMarks().then(() => this.pushSettings());
    else if (act === 'import-chrome' || act === 'import-safari') void this.importFrom(act === 'import-chrome' ? 'chrome' : 'safari').then(() => this.pushSettings());
    else if (act === 'lockvault') { this.vault.lock(); this.pushSettings(); }
    else if (act === 'homehere') {
      const t = [...this.tabs].filter((x) => isWeb(x.url)).sort((a, b) => b.lastSeen - a.lastSeen)[0];
      if (t) this.setSetting('home', t.url);
    }
  }

  // ------------------------------------------------------------------ Your things: History and Downloads (2026-10-12)
  isThings(sender: Electron.WebContents): boolean { const t = this.tabs.find((x) => x.internal === 'things' && x.view?.webContents === sender); if (t) this.inTab(t); return Boolean(t); }
  /** Open Your things (or bring its tab forward), at History or Downloads. */
  openThings(section: 'history' | 'downloads' = 'history'): void {
    if (!this.win || this.win.isDestroyed()) return;
    let t = this.tabs.find((x) => x.internal === 'things');
    if (!t) {
      t = { id: ++this.seq, internal: 'things', view: null, opener: null, title: 'Your things', url: 'aang:things', favicon: '', loading: false, audible: false, muted: false, crashed: false,
        scrollY: 0, zoom: 0, lastSeen: Date.now(), blocked: null, trail: null, done: false, lent: false, upgraded: null, failed: null, blockedPopup: null, pane: this.pane.id };
      this.tabs.push(t);
    }
    this.activate(t.id);
    this.win?.focus();
    const wc = t.view?.webContents;
    if (wc) { const go = () => wc.send('things:section', section); if (wc.isLoading()) wc.once('did-finish-load', go); else go(); }
  }
  /** One page of History, newest first, for what he typed. Plain data. */
  historyPage(q: string, offset: number): { items: { url: string; title: string; at: number; favicon: string }[]; more: boolean } {
    const r = searchVisits(this.visits.list, String(q ?? '').slice(0, 200), Math.max(0, Math.min(100_000, Math.floor(offset) || 0)), 100);
    return { items: r.items.map((v) => ({ ...v, favicon: this.iconOf(v.url) })), more: r.more };
  }
  /** His History changes: take one page off, or clear the last hour, today, or everything. */
  historyAct(act: string, url?: string, at?: number): void {
    const now = Date.now();
    if (act === 'forget' && typeof url === 'string' && Number.isFinite(at)) this.visits.forget(url, Number(at));
    else if (act === 'clearhour') this.visits.clear(now - 3_600_000);
    else if (act === 'cleartoday') { const d = new Date(now); d.setHours(0, 0, 0, 0); this.visits.clear(d.getTime()); }
    else if (act === 'clearall') this.visits.clear(0);
    else return;
    this.pushThings('history');
  }
  /** Open a page from History: always a new tab, so Your things stays where it was. */
  openFromThings(url: string): void { if (isWeb(url)) this.newTab(url); }
  private dlView(d: Dl): Record<string, unknown> {
    const g = this.got.get(d.id);
    const left = g && g.total > 0 && g.rate > 1 ? Math.round((g.total - g.got) / g.rate) : null;
    return { id: d.id, name: d.name, kind: kindOf(d.name), site: d.site, size: d.size, at: d.at, state: d.state,
      got: g?.got ?? 0, total: g?.total ?? d.size, left, gone: d.state === 'done' && !existsSync(d.file) };
  }
  /** The Downloads page: every download kept (200), newest first. */
  downloadsPage(): Record<string, unknown>[] { return [...this.dls.list].reverse().map((d) => this.dlView(d)); }
  private pushThings(what: 'history' | 'downloads'): void {
    const wc = this.tabs.find((x) => x.internal === 'things')?.view?.webContents;
    if (wc && !wc.isDestroyed()) wc.send('things:changed', what);
  }
  /**
   * The tray in the band: this run's newest 5. Its key shows only while the tray has something (2026-10-12, his ask).
   * pop: a download just finished, so the tray drops open by itself for a moment. Progress goes out at most 4 times a second.
   */
  private sendDownloads(pop: boolean | 'pop' = false): void {
    const go = () => {
      this.dlSendTimer = null;
      const tray = trayOf(this.dls.list, this.traySince, Date.now());
      const data = { items: tray.map((d) => this.dlView(d)), pop: pop === 'pop' };
      for (const p of this.panes) if (this.alive(p)) p.win!.webContents.send('browser:dls', data);
      this.pushThings('downloads');
      // When nothing is coming in, the tray empties an hour after the newest download: look again then.
      if (this.trayTimer) { clearTimeout(this.trayTimer); this.trayTimer = null; }
      if (tray.length && !tray.some((d) => d.state === 'going')) this.trayTimer = setTimeout(() => this.sendDownloads(true), Math.max(1000, tray[0].at + 60 * 60_000 - Date.now() + 500));
    };
    if (pop) { if (this.dlSendTimer) clearTimeout(this.dlSendTimer); go(); return; }
    if (!this.dlSendTimer) this.dlSendTimer = setTimeout(go, 250);
  }
  /** The frame asks again (it just loaded). */
  resendDownloads(): void { this.sendDownloads(true); }
  /** His click on a download: open it, show it in its folder, stop it, take it off the list; or the tray's own two. */
  dlAct(act: string, id: number): void {
    if (act === 'clear') { this.traySince = Date.now(); this.sendDownloads(true); return; }
    if (act === 'folder') { void shell.openPath(app.getPath('downloads')); return; }
    if (act === 'page') { this.openThings('downloads'); return; }
    const d = this.dls.get(id);
    if (!d) return;
    if (act === 'stop') { this.live.get(id)?.cancel(); return; }
    if (act === 'forget') { if (d.state !== 'going') { this.dls.remove(id); this.sendDownloads(true); } return; }
    // Only files this browser saved, and only once they are whole. Windows checks them (the Mark of the Web) as they open.
    if (d.state !== 'done' || !existsSync(d.file)) { this.sendDownloads(true); return; }
    if (act === 'open') void shell.openPath(d.file).then((err) => { if (err) this.note(`${d.name} could not be opened: ${err}`); });
    else if (act === 'show') shell.showItemInFolder(d.file);
  }
  /**
   * Drag a finished download out of the tray or the page, into Claude, Aang, a folder or the desktop. Only a file on
   * this browser's own list: the page names a number, never a path. The picture under the mouse is its paper icon.
   */
  dlDrag(sender: Electron.WebContents, id: number): void {
    const d = this.dls.get(id);
    if (!d || d.state !== 'done' || !existsSync(d.file)) return;
    let icon = nativeImage.createFromPath(path.join(path.dirname(this.o.preloadPath), '..', 'pages', 'art', 'browser', `file_${kindOf(d.name)}.png`));
    if (icon.isEmpty()) icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6XqRwAAAABJRU5ErkJggg==');
    try { sender.startDrag({ file: d.file, icon }); } catch (e) { console.error('shell: drag failed: ' + (e as Error).message); }
  }

  /** Put a tab to sleep: its page closes, its snapshot stays, the plaque sinks. */
  private sleep(tab: Tab): void {
    if (!tab.view) return;
    this.closeView(tab);
    tab.loading = false; tab.audible = false;
  }
  private closeView(tab: Tab): void {
    if (!tab.view) return;
    const p = this.paneOfTab(tab);
    try { if (this.alive(p)) p.win!.contentView.removeChildView(tab.view); } catch { /* not shown */ }
    try { tab.view.webContents.close(); } catch { /* gone */ }
    tab.view = null;
  }
  private sleepIdle(): void {
    const now = Date.now();
    let any = false;
    for (const t of this.tabs) if (t.view && !t.lent && !t.call && !this.panes.some((p) => p.active === t.id) && !t.audible && now - t.lastSeen > SLEEP_AFTER_MS) { this.sleep(t); any = true; }
    if (any) this.sendTabs();
  }

  newTab(address: string, opener: number | null = null, focus = true): number | null {
    const w = this.win;
    if (!w || w.isDestroyed()) return null;
    const url = isWeb(address) ? address : addressFor(address);
    if (!url) return null;
    if (this.toPaid(url)) return null;
    // "You don't have to start a trail. A link you open from a page joins that page's trail" (sheet 3). A loose
    // page that opens a link starts one, named after its site; nothing is ever sorted by guesswork here.
    let trail: number | null = null;
    const from = opener !== null ? this.tabs.find((x) => x.id === opener) : undefined;
    if (from) {
      if (from.trail === null && !from.done) { from.trail = this.addTrail(trailNameFor(from.url)); }
      trail = from.done ? null : from.trail;
    } else if (this.pendingTrail !== null) { trail = this.pendingTrail; }
    this.pendingTrail = null;
    const tab: Tab = { id: ++this.seq, view: null, opener, title: 'New tab', url, favicon: '', loading: true, audible: false, muted: false, crashed: false, scrollY: 0, zoom: 0, lastSeen: Date.now(), blocked: null, trail, done: false, lent: false, upgraded: null, failed: null, blockedPopup: null, pane: this.pane.id };
    // A child sits right under the last tab of its trail, so the trail reads top to bottom.
    if (from) {
      let at = this.tabs.indexOf(from);
      while (at + 1 < this.tabs.length && this.tabs[at + 1]!.opener !== null && this.tabs[at + 1]!.trail === trail && trail !== null) at++;
      this.tabs.splice(at + 1, 0, tab);
    } else this.tabs.push(tab);
    tab.pending = url;
    this.wake(tab);
    if (focus) this.activate(tab.id); else this.changed();
    return tab.id;
  }

  activate(id: number): void {
    const t = this.tabs.find((x) => x.id === id);
    if (!t) return;
    // A tab in another window (picked from the address suggestions): that window comes forward.
    const other = t.pane !== this.pane.id;
    if (!this.inTab(t)) return;
    const w = this.win;
    const prev = this.cur();
    if (!w || w.isDestroyed()) return;
    if (other) w.focus();
    const mine = this.paneTabs();
    // Every live tab stays in the window; switching only shows one and hides the rest. Placed first, then
    // shown, so it never appears for a moment at the last tab's size.
    if (t.lent) {
      // Its page is in the popout: the frame shows "playing in the popout" where it was.
      this.active = id;
      for (const x of mine) if (x.view && !x.lent) x.view.setVisible(false);
      this.changed();
      return;
    }
    if (!t.view) this.wake(t);                         // an asleep tab wakes exactly where it was left
    if (this.watching !== null) this.unwatch(false);
    if (this.veil && this.veil.tab !== id) this.veilDown(0);
    this.active = id;
    t.lastSeen = Date.now();
    this.place();
    for (const x of mine) if (x.id !== id && x.view) { try { x.view.webContents.stopFindInPage('clearSelection'); } catch { /* gone */ } }
    // A tab still loading with nothing drawn yet (a new tab, a tab waking up): the page he was on stays until the
    // curtain holds its picture, then the new one fades in as it draws, never a blank frame (his ask, 2026-10-13).
    const fresh = !this.drawerOpen && Boolean(t.phase) && t.phase !== 'idle' && !t.drawn;
    const hold = fresh && prev && prev.id !== id && prev.view && !prev.lent && !prev.crashed && !prev.blocked && !prev.failed && prev.view.getVisible() ? prev : undefined;
    // With the drawer open the page stays hidden under it; closing the drawer shows whichever tab is current.
    if (!this.drawerOpen && !hold) t.view!.setVisible(true);
    for (const x of mine) if (x.id !== id && x !== hold && x.view && !x.lent) x.view.setVisible(false);
    if (fresh) void this.veilUp(t, hold);
    if (!t.crashed) t.view!.webContents.focus();
    // The drawer is open: the page area is a still picture, so take a fresh one of the tab now in front. Without this
    // a closed tab stayed on screen until the drawer shut (his report, 2026-10-12).
    if (this.drawerOpen) void this.drawer(true);
    this.changed();
  }

  /** Close a tab. Closing his last tab closes the window, as in every browser (his note, 2026-10-12). */
  close(id: number, lastClosesWindow = true): void {
    const i = this.tabs.findIndex((x) => x.id === id);
    if (i < 0) return;
    this.inTab(this.tabs[i]!);
    const at = this.paneTabs().indexOf(this.tabs[i]!);
    // A tab playing in the popout comes back first, so its page is closed here and nowhere else.
    if (this.tabs[i]!.lent) this.onReclaim?.();
    const [t] = this.tabs.splice(i, 1);
    if (isWeb(t!.url)) { this.closed.push(t!.url); if (this.closed.length > 25) this.closed.shift(); }
    this.closeView(t!);
    this.tidyTrails();
    if (this.active === id) {
      const rest = this.paneTabs();
      const next = rest[Math.min(Math.max(0, at), rest.length - 1)];
      this.active = null;
      if (next) this.activate(next.id);
      else if (lastClosesWindow && this.win && !this.win.isDestroyed()) {
        // Nothing left in the whole browser: remember an empty window (so the closed tabs do not come back next time).
        if (!this.tabs.length) {
          try { writeFileAtomic(this.file, JSON.stringify({ v: 1, at: new Date().toISOString(), active: 0, tabs: [], trails: [], closed: this.closed.slice(-25) })); } catch { /* best effort */ }
          this.sync?.changed('tabs');
        }
        this.win.close();
      } else this.newTab(this.HOME);
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
    else if (act === 'newwindow') this.newWindowFor(id);
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
    if (p.linkURL && isWeb(p.linkURL)) { items.push({ id: 'linktab', label: 'Open link in new tab' }, ...(this.onOpenOther ? [{ id: 'linkother', label: `${OTHER_OPEN.replace('Open', 'Open link')}` }] : []), { id: 'linkcopy', label: 'Copy link' }); sep(); }
    if (p.mediaType === 'image' && p.srcURL && /^(https?:|data:image\/)/.test(p.srcURL)) { items.push({ id: 'imgsave', label: 'Save image' }, { id: 'imgcopy', label: 'Copy image' }); sep(); }
    const words = p.selectionText.replace(/\s+/g, ' ').trim();
    // A misspelled word: Chrome's suggestions first, then teach it the word.
    if (p.isEditable && p.misspelledWord) {
      const sug = p.dictionarySuggestions.slice(0, 5);
      sug.forEach((s, i) => items.push({ id: 'spell' + i, label: s }));
      if (!sug.length) items.push({ id: 'nospell', label: 'No suggestions', off: true });
      items.push({ id: 'learn', label: `Add "${p.misspelledWord.length > 20 ? p.misspelledWord.slice(0, 19) + '…' : p.misspelledWord}" to dictionary` });
      sep();
    }
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
    // His ask (2026-10-13): this page (or the link) as a full tab in Aang's browser on the other machine.
    if (this.onOpenOther && isWeb(tab.url)) { sep(); items.push({ id: 'openother', label: OTHER_OPEN }); }
    this.menuFor = { tab: tab.id, p };
    this.menuItems = items;
    const m = this.ensureMenu();
    if (!m.webContents.isLoading()) m.webContents.send('pagemenu:items', items);
  }
  private ensureMenu(): BrowserWindow {
    if (this.menu && !this.menu.isDestroyed()) return this.menu;
    const m = new BrowserWindow({
      frame: false, show: false, alwaysOnTop: true, resizable: false, movable: false, minimizable: false, maximizable: false,
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
    if (!f || !t || !wc || wc.isDestroyed() || !this.inTab(t)) return;
    const p = f.p;
    wc.focus();
    switch (id) {
      case 'linktab': if (isWeb(p.linkURL)) this.newTab(p.linkURL, t.id, false); break;
      case 'linkcopy': if (isWeb(p.linkURL)) clipboard.writeText(p.linkURL); break;
      case 'linkother': if (isWeb(p.linkURL)) this.onOpenOther?.(p.linkURL); break;
      case 'openother': if (isWeb(t.url)) { this.onOpenOther?.(t.url); this.pauseMedia(t.id); } break;
      case 'imgsave': if (p.srcURL) wc.downloadURL(p.srcURL); break;
      case 'imgcopy': wc.copyImageAt(p.x, p.y); break;
      case 'cut': wc.cut(); break;
      case 'copy': wc.copy(); break;
      case 'paste': wc.paste(); break;
      case 'selectall': wc.selectAll(); break;
      case 'search': { const q = p.selectionText.replace(/\s+/g, ' ').trim().slice(0, 400); if (q) this.newTab(searchFor(q), t.id, true); break; }
      case 'back': if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); break;
      case 'reload': wc.reload(); break;
      case 'learn': if (p.misspelledWord) wc.session.addWordToSpellCheckerDictionary(p.misspelledWord); break;
      default: {
        const m = /^spell([0-4])$/.exec(id);
        const s = m ? p.dictionarySuggestions[Number(m[1])] : undefined;
        if (s) wc.replaceMisspelling(s);
      }
    }
  }

  // ------------------------------------------------------------------ 6.23 the vault (Bitwarden)
  /** A password box on the page he is looking at? Read-only, with a deadline. Secure pages only. */
  private async lookForLogin(): Promise<void> {
    const lp = this.lastPane();
    if (lp) this.pane = lp;
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
    const P = this.pane;
    const s = await this.vault.state();
    this.pane = P;
    if (s === 'missing') { this.note("Bitwarden's tool is not on this PC yet."); return; }
    if (s === 'signed-out') { this.note('Sign in to Bitwarden once first, yourself: ' + BW_LOGIN); return; }
    if (s === 'locked') { this.win?.webContents.send('browser:vault', { mode: 'unlock', host }); return; }
    await this.vaultList();
  }
  /** His master password, straight from the frame's box. Used once by bw, never kept, never logged. */
  async vaultUnlock(password: string): Promise<void> {
    const f = this.vaultFor;
    if (!f) return;
    const P = this.pane;
    const ok = await this.vault.unlock(password);
    this.pane = P;
    if (!ok) { this.win?.webContents.send('browser:vault', { mode: 'unlock', host: f.host, wrong: true }); return; }
    void this.learnSites();
    await this.vaultList();
  }
  private async vaultList(): Promise<void> {
    const f = this.vaultFor;
    const t = f ? this.tabs.find((x) => x.id === f.tab) : undefined;
    if (!f || !t) return;
    const logins: Login[] | null = await this.vault.loginsFor(t.url);
    if (!this.inTab(t)) return;
    if (logins === null) { this.note('Bitwarden did not answer. Try the key again.'); return; }
    if (!logins.length) { this.win?.webContents.send('browser:vault', null); this.note(`No saved login for ${f.host} in your Bitwarden.`); return; }
    if (logins.length === 1) { await this.vaultPick(logins[0]!.id); return; }
    this.win?.webContents.send('browser:vault', { mode: 'pick', host: f.host, logins });
  }
  /** Fill one login into the page, if it is still the page he clicked the key on. */
  async vaultPick(id: string): Promise<void> {
    const f = this.vaultFor;
    this.vaultFor = null;
    const t = f ? this.tabs.find((x) => x.id === f.tab) : undefined;
    if (t) this.inTab(t);
    this.win?.webContents.send('browser:vault', null);
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
  // ------------------------------------------------------------------ M6 one browser on both machines (bsync.ts)
  /** Set by main: "Open on Mac" / "Open on PC", a full tab in the other machine's browser. */
  onOpenOther: ((url: string) => void) | null = null;
  /** A page sent here from the other machine: a new tab, and the window comes to the front. */
  openForward(url: string): void {
    if (!isWeb(url)) return;
    this.open(url);
    const w = this.win;
    if (!w || w.isDestroyed()) return;
    // Windows only lets a window jump in front of the one he is using with a nudge: on top for a moment, then not.
    bringFront(w);
  }
  /** Set by main: open a paid service in the paid-video window. True if it opened. */
  onPaid: ((url: string) => boolean) | null = null;
  /**
   * Paid video (2026-10-13, his ask): this browser has no Widevine, so Netflix, Crave, Disney+, Prime and Crunchyroll
   * open in the paid-video window instead, by themselves. Caught BEFORE a load starts (a link, an address he typed,
   * a bookmark, a redirect): stopping a load from inside its own start event crashed the browser (his Mac, and the
   * PC's window closed). True when it went there, and nothing should load here.
   */
  private toPaid(url: string): boolean {
    const paid = serviceFor(url);
    if (!paid?.ready || !this.onPaid) return false;
    if (!this.onPaid(url)) return false;
    this.note(`${paid.label.charAt(0)}${paid.label.slice(1).toLowerCase()} opened in the paid-video window.`);
    return true;
  }
  /** The sync with the browser on his other machine (startSync). */
  sync: BrowserSync | null = null;
  /** M6: start syncing with the other machine's browser. `send` reaches it through the brain. */
  startSync(send: (m: SyncMsg) => void, log?: (s: string) => void): BrowserSync {
    this.sync = new BrowserSync({ target: this.syncTarget, send, stateDir: this.o.stateDir, ...(log ? { log } : {}) });
    this.visits.onChange = (c) => { if (c.op === 'add') this.sync?.visited([c.v]); else if (c.op === 'forget') this.sync?.forgot(c.url, c.at); else this.sync?.cleared(c.from); };
    return this.sync;
  }
  /** What the sync needs from this browser: plain reads, and quiet writes that do not reload or say anything. */
  readonly syncTarget = {
    marks: () => this.marks.map((m) => ({ ...m })),
    setMarks: (list: Mark[]) => {
      this.marks = (Array.isArray(list) ? list : []).filter((m) => typeof m?.url === 'string' && isWeb(m.url) && typeof m.title === 'string')
        .slice(0, 5000).map((m) => ({ title: String(m.title).slice(0, 300), url: m.url, folder: String(m.folder ?? '').slice(0, 100) }));
      this.saveMarks(); this.sendTabs(); this.pushSettings();
    },
    // SY (his "sync everything", 2026-10-14): the lists he made travel with the settings. Money sites never do.
    prefs: () => ({ sounds: this.sounds, ...this.prefs, lists: {
      popupOk: [...this.popupOk], trusted: [...this.trusted], httpOk: [...this.httpOk], adsPaused: [...this.paused],
      stash: this.stash.map((x) => ({ ...x, tabs: x.tabs.filter((t) => urlKept(t.url)) })),
    } }) as Record<string, unknown>,
    setPrefs: (p: Record<string, unknown>) => {
      const adsWas = this.prefs.ads;
      this.sounds = p.sounds === true;
      this.prefs = { ads: p.ads !== false, popups: p.popups !== false, home: typeof p.home === 'string' && isWeb(p.home) ? p.home.slice(0, 2000) : DEFAULT_HOME,
        search: p.search === 'ddg' || p.search === 'google' || p.search === 'yandex' ? p.search : 'brave', aiBox: p.aiBox === true, startup: p.startup === 'home' ? 'home' : 'tabs',
        dark: p.dark !== false, darkOff: hostList(p.darkOff) };
      setSearch(this.prefs.search, this.prefs.aiBox);
      this.paintDarkAll();
      this.takeLists(p.lists);
      if (adsWas !== this.prefs.ads) { if (this.prefs.ads) this.ads?.start(); else this.ads?.stop(); }
      this.savePrefs(); this.sendTabs(); this.pushSettings();
    },
    tabSnap: (): TabSnap => {
      if (this.panes.some((p) => this.alive(p)) && this.tabs.length) {
        return { tabs: this.tabs.filter((t) => !t.internal && isWeb(t.url)).map((t) => ({ url: t.url, title: t.title, trail: t.trail, done: t.done })), trails: this.trails.map((x) => ({ id: x.id, name: x.name })) };
      }
      try {
        const s = JSON.parse(readFileSync(this.file, 'utf8'));
        return { tabs: (Array.isArray(s?.tabs) ? s.tabs : []).filter((t: any) => typeof t?.url === 'string' && isWeb(t.url)).map((t: any) => ({ url: t.url, title: String(t.title ?? t.url), trail: Number.isInteger(t.trail) ? t.trail : null, done: t.done === true })),
          trails: (Array.isArray(s?.trails) ? s.trails : []).filter((x: any) => Number.isInteger(x?.id)).map((x: any) => ({ id: x.id, name: String(x.name ?? '') })) };
      } catch { return { tabs: [], trails: [] }; }
    },
    setTabs: (snap: TabSnap) => this.takeTabs(snap),
    pauseAll: () => this.pauseAll(),
    visits: () => this.visits.list.slice(),
    addVisits: (list: Visit[]) => this.visits.merge(list),
    forgetVisit: (url: string, at: number) => { const cb = this.visits.onChange; this.visits.onChange = null; this.visits.forget(url, at); this.visits.onChange = cb; },
    clearVisits: (from: number) => { const cb = this.visits.onChange; this.visits.onChange = null; this.visits.clear(from); this.visits.onChange = cb; },
    cookies: async () => (await this.ses.cookies.get({})) as SyncCookie[],
    setCookie: async (c: SyncCookie) => {
      await this.ses.cookies.set({
        url: `${c.secure ? 'https' : 'http'}://${String(c.domain ?? '').replace(/^\./, '')}${c.path || '/'}`, name: c.name, value: c.value,
        ...(c.hostOnly ? {} : { domain: c.domain }), path: c.path || '/', secure: c.secure === true, httpOnly: c.httpOnly === true,
        ...(c.expirationDate ? { expirationDate: c.expirationDate } : {}), ...(c.sameSite ? { sameSite: c.sameSite } : {}),
      });
    },
    removeCookie: async (c: SyncCookie) => { await this.ses.cookies.remove(`https://${String(c.domain ?? '').replace(/^\./, '')}${c.path || '/'}`, c.name); },
  };

  /**
   * M6: the other machine's tabs, made the tabs here ("the same tabs on both", his pick). The window closed: they are
   * written down and open next time. Open: tabs here that are gone there close (never one in a call or playing in
   * the popout), new ones arrive asleep, and a tab that went somewhere else there goes there here. What he is looking
   * at stays in front unless it closed.
   */
  private takeTabs(snap: TabSnap): void {
    const want = (snap?.tabs ?? []).filter((t) => typeof t?.url === 'string' && isWeb(t.url)).slice(0, 80);
    const trails = (snap?.trails ?? []).filter((x) => Number.isInteger(x?.id)).map((x) => ({ id: x.id, name: String(x.name ?? '').slice(0, 24) || 'Trail', named: true }));
    const home = this.panes.find((p) => this.alive(p));
    if (home) this.pane = home;
    if (!home) {
      let closed: string[] = [];
      try { const s = JSON.parse(readFileSync(this.file, 'utf8')); if (Array.isArray(s?.closed)) closed = s.closed; } catch { /* none */ }
      try { writeFileAtomic(this.file, JSON.stringify({ v: 1, at: new Date().toISOString(), active: 0, tabs: want.map((t) => ({ url: t.url, title: t.title, opener: null, scrollY: 0, zoom: 0, muted: false, trail: t.trail, done: t.done })), trails, closed })); } catch { /* best effort */ }
      return;
    }
    const live = this.tabs.filter((t) => !t.internal);
    const fixed = (t: Tab) => t.call === true || t.lent;
    if (want.length === live.length) {
      want.forEach((w, i) => {
        const t = live[i]!;
        if (t.url !== w.url && !fixed(t)) {
          t.title = w.title.slice(0, 300); t.blocked = null; t.failed = null;
          if (t.view) { t.pending = w.url; void t.view.webContents.loadURL(this.secured(t, w.url)).catch(() => {}); } else t.url = w.url;
        }
      });
    } else {
      const need = want.map((w) => w.url);
      for (const t of live) {
        const k = need.indexOf(t.url);
        if (k >= 0) need.splice(k, 1);
        else if (!fixed(t)) this.close(t.id, false);
      }
      this.pane = home;
      for (const u of need) {
        const w = want.find((x) => x.url === u)!;
        this.tabs.push({ id: ++this.seq, view: null, opener: null, title: w.title.slice(0, 300) || u, url: u, favicon: '', loading: false, audible: false, muted: false, crashed: false,
          scrollY: 0, zoom: 0, lastSeen: Date.now(), blocked: null, trail: null, done: false, lent: false, upgraded: null, failed: null, blockedPopup: null, pane: this.pane.id });
      }
    }
    this.trails = trails;
    this.trailSeq = Math.max(this.trailSeq, ...trails.map((x) => x.id), 0);
    const left = want.slice();
    for (const t of this.tabs) {
      if (t.internal) continue;
      const k = left.findIndex((w) => w.url === t.url);
      if (k < 0) continue;
      const [w] = left.splice(k, 1);
      t.trail = w!.trail !== null && trails.some((x) => x.id === w!.trail) ? w!.trail : null; t.done = w!.done;
    }
    this.tidyTrails();
    // Any window left without a tab in front shows its first one; a window left with no tabs at all closes.
    for (const p of [...this.panes]) {
      if (!this.alive(p) || this.tabs.some((t) => t.id === p.active)) continue;
      this.pane = p;
      p.active = null;
      const n = this.paneTabs(p)[0];
      if (n) this.activate(n.id); else if (p !== home) p.win!.close();
    }
    this.pane = home;
    this.changed();
  }

  private iconOf(url: string): string {
    try { const h = new URL(url).hostname; return this.icons.get(h) ?? this.icons.get(h.replace(/^www\./, '')) ?? this.icons.get('www.' + h) ?? ''; } catch { return ''; }
  }

  // ------------------------------------------------------------------ 6.23 bookmarks
  private saveMarks(): void { try { writeFileAtomic(this.marksFile, JSON.stringify(this.marks)); } catch { /* best effort */ } this.sync?.changed('marks'); }
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
  /**
   * 2026-10-13, his ask: straight from Chrome or Safari on this machine, no export first. Only their bookmarks file is
   * read. Safari's needs macOS's Full Disk Access for Aang, which only he can give: the right page opens for him.
   */
  async importFrom(source: 'chrome' | 'safari'): Promise<void> {
    const P = this.pane;
    const say = (text: string) => { const w = P.win; if (w && !w.isDestroyed()) w.webContents.send('browser:download', { name: '', state: 'note', text }); };
    let found: Mark[] = [];
    try {
      if (source === 'chrome') {
        const base = process.platform === 'darwin'
          ? path.join(app.getPath('home'), 'Library', 'Application Support', 'Google', 'Chrome')
          : path.join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'User Data');
        const profiles = existsSync(base) ? readdirSync(base).filter((d) => d === 'Default' || /^Profile \d+$/.test(d)) : [];
        for (const p of profiles) {
          // Bookmarks on this computer, and (newer Chrome) the ones that come with his Google account.
          for (const name of ['Bookmarks', 'AccountBookmarks']) {
            const f = path.join(base, p, name);
            if (existsSync(f) && statSync(f).size < 20 * 1024 * 1024) found.push(...parseChromeBookmarks(readFileSync(f, 'utf8')));
          }
        }
        if (!profiles.length) { say('Chrome is not on this computer, or it has no bookmarks yet.'); return; }
      } else {
        if (process.platform !== 'darwin') return;
        const f = path.join(app.getPath('home'), 'Library', 'Safari', 'Bookmarks.plist');
        const json = await new Promise<string>((res, rej) => execFile('/usr/bin/plutil', ['-convert', 'json', '-o', '-', f], { maxBuffer: 32 * 1024 * 1024, timeout: 15_000 }, (e, out) => (e ? rej(e) : res(String(out)))));
        found = parseSafariBookmarks(json);
      }
    } catch (e) {
      if (source === 'safari') {
        say('Safari keeps its bookmarks private. In the window that opens, turn on Aang under Full Disk Access, then press this again.');
        void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles');
      } else say(`Chrome's bookmarks could not be read: ${(e as Error).message}`);
      return;
    }
    const have = new Set(this.marks.map((m) => m.url));
    let added = 0;
    for (const m of found) if (!have.has(m.url)) { this.marks.push(m); have.add(m.url); added++; }
    this.marks = this.marks.slice(0, 5000);
    if (added) { this.saveMarks(); void this.fillMarkIcons(); }
    say(added ? `Brought in ${added} bookmarks from ${source === 'chrome' ? 'Chrome' : 'Safari'}. The bar ones are on the shelf in the drawer.` : `Nothing new in ${source === 'chrome' ? 'Chrome' : 'Safari'}: you already have all of them.`);
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
    if (!t?.view || t.internal || t.crashed || t.blocked || t.failed || t.lent || !this.inTab(t)) return null;
    t.lent = true;
    try { this.win?.contentView.removeChildView(t.view); } catch { /* not shown */ }
    try { t.view.webContents.stopFindInPage('clearSelection'); } catch { /* gone */ }
    this.changed();
    return { view: t.view, url: t.url, title: t.title };
  }

  /** The popout hands the tab back: into the window, where it was. If the tab or the window is gone, the page closes. */
  giveBack(id: number, view: WebContentsView): void {
    const t = this.tabs.find((x) => x.id === id);
    if (t) this.inTab(t);
    const w = t ? this.paneOfTab(t)?.win : null;
    if (!t || t.view !== view || !w || w.isDestroyed()) { try { view.webContents.close(); } catch { /* gone */ } if (t) { t.view = null; t.lent = false; } return; }
    t.lent = false;
    view.setVisible(false);
    w.contentView.addChildView(view);
    this.raiseTray();                                   // back from the popout, never over the open tab list (2026-10-14)
    // At its full size but out of sight for a moment, so the site redoes its layout (popout size to tab size)
    // where he cannot see it, then shown already settled (2026-10-12, the odd resize coming back).
    const [cw, ch] = w.getContentSize();
    view.setBounds({ x: this.inset.left, y: this.inset.top, width: Math.max(0, cw - this.inset.left - this.inset.right), height: Math.max(0, ch - this.inset.top - this.inset.bottom) });
    setTimeout(() => { if (t.view !== view || t.lent || !this.inTab(t)) return; if (t.id === this.active) this.activate(t.id); else this.changed(); }, 250);
  }

  isLent(id: number): boolean { return Boolean(this.tabs.find((x) => x.id === id)?.lent); }
  /**
   * Address suggestions as he types (6.22b item 6). Local and instant: his open tabs first ("switch to it"), then his
   * bookmarks, then tabs he closed lately. The first row is always what he typed, so Enter never surprises him.
   */
  private preconnected = '';
  suggest(text: string): { kind: string; title: string; url: string; id?: number }[] {
    const q = String(text ?? '').trim().toLowerCase().slice(0, 200);
    if (!q) return [];
    const typed = addressFor(q);
    const out: { kind: string; title: string; url: string; id?: number }[] = [];
    if (typed) out.push({ kind: typed.startsWith('https://search.brave.com') || typed.includes('/search?') || typed.includes('duckduckgo.com/?q=') || typed.includes('yandex.com/search') ? 'search' : 'go', title: String(text).trim().slice(0, 200), url: typed });
    const hit = (title: string, url: string) => title.toLowerCase().includes(q) || url.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').includes(q);
    const seen = new Set(out.map((x) => x.url));
    for (const t of this.tabs) if (!t.internal && isWeb(t.url) && hit(t.title, t.url) && !seen.has(t.url)) { out.push({ kind: 'tab', title: t.title, url: t.url, id: t.id }); seen.add(t.url); }
    for (const m of this.marks) if (hit(m.title, m.url) && !seen.has(m.url)) { out.push({ kind: 'mark', title: m.title, url: m.url }); seen.add(m.url); if (out.length >= 9) break; }
    for (let i = this.visits.list.length - 1, n = 0; i >= 0 && n < 3000 && out.length < 9; i--, n++) { const v = this.visits.list[i]; if (hit(v.title, v.url) && !seen.has(v.url)) { out.push({ kind: 'history', title: v.title || v.url, url: v.url }); seen.add(v.url); } }
    for (const u of [...this.closed].reverse()) if (hit('', u) && !seen.has(u)) { out.push({ kind: 'closed', title: u, url: u }); seen.add(u); if (out.length >= 9) break; }
    // Start connecting to where Enter will go while he is still typing, as Chrome does: the address lookup and
    // the secure handshake are done by the time he presses it. A connection only, nothing is fetched or sent.
    const first = out[0];
    if (first?.url && isWeb(first.url)) {
      try {
        const origin = new URL(first.url).origin;
        if (origin !== this.preconnected) { this.preconnected = origin; this.ses.preconnect({ url: origin, numSockets: 1 }); }
      } catch { /* not an address */ }
    }
    return out.slice(0, 9).map((x) => ({ ...x, favicon: this.iconOf(x.url) }));
  }

  /** Everything else that plays pauses: other tabs (the pop-out's lent one too), never a call. And the other machine. */
  private onePlaying(tab: Tab): void {
    for (const x of this.tabs) if (x !== tab && x.view && !x.call) this.pauseMedia(x.id);
    this.onMediaStarted?.();
    this.sync?.mediaStarted();
  }
  /** Set by main: something started playing in a tab, so anything Aang plays elsewhere (the pop-out) stops. */
  onMediaStarted: (() => void) | null = null;
  /** The other machine started playing something: everything here pauses, never a call. */
  pauseAll(): void { for (const x of this.tabs) if (x.view && !x.call) this.pauseMedia(x.id); this.onMediaStarted?.(); }
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
  /** Drag a tab: into a trail (or loose, null), placed before another tab (or at the end of its group). */
  placeTab(tabId: number, trail: number | null, before: number | null): void {
    const i = this.tabs.findIndex((x) => x.id === tabId);
    if (i < 0) return;
    const t = this.tabs[i]!;
    t.trail = trail !== null && this.trails.some((x) => x.id === trail) ? trail : null;
    t.done = false;
    this.tabs.splice(i, 1);
    const j = before !== null ? this.tabs.findIndex((x) => x.id === before) : -1;
    if (j >= 0) this.tabs.splice(j, 0, t);
    else {
      // the end of its group: after the last tab already in that trail (or after the last loose tab)
      let k = -1;
      this.tabs.forEach((x, n) => { if (x.trail === t.trail) k = n; });
      this.tabs.splice(k + 1, 0, t);
    }
    this.tidyTrails();
    this.changed();
  }
  /** Drag a trail by its heading: put it before another trail (or last). */
  moveTrail(id: number, before: number | null): void {
    const i = this.trails.findIndex((x) => x.id === id);
    if (i < 0 || id === before) return;
    const [tr] = this.trails.splice(i, 1);
    const j = before !== null ? this.trails.findIndex((x) => x.id === before) : -1;
    if (j >= 0) this.trails.splice(j, 0, tr!); else this.trails.push(tr!);
    this.changed();
  }
  /** The trail menu: collapse, put in the Stash, ungroup (tabs stay), or close it with its tabs (Undo for a while). */
  trailAct(id: number, act: string): void {
    const tr = this.trails.find((x) => x.id === id);
    if (!tr) return;
    const own = this.tabs.filter((t) => t.trail === id);
    if (act === 'collapse') { tr.collapsed = !tr.collapsed; this.changed(); return; }
    if (act === 'ungroup') { for (const t of own) t.trail = null; this.trails = this.trails.filter((x) => x.id !== id); this.changed(); return; }
    if (act === 'stash') { this.stashTrail(id); this.changed(); this.note(`${tr.name} is in the Stash.`); return; }
    if (act === 'close') {
      this.lastClosed = { trail: { ...tr }, tabs: own.filter((t) => isWeb(t.url)).map((t) => ({ url: t.url, title: t.title })) };
      for (const t of own) this.close(t.id, false);
      this.trails = this.trails.filter((x) => x.id !== id);
      this.changed();
      this.win?.webContents.send('browser:download', { name: '', state: 'note', text: `Closed ${tr.name} and its ${own.length} tabs.`, undo: 'trailclose' });
    }
  }
  /** Undo for "close the trail": its pages come back, asleep, in a trail of the same name. */
  undoTrailClose(): void {
    const c = this.lastClosed;
    this.lastClosed = null;
    if (!c) return;
    this.reviveTrail(c.trail.name, c.tabs, c.trail.named);
  }
  private reviveTrail(name: string, pages: { url: string; title: string }[], named = false): number {
    const id = ++this.trailSeq;
    this.trails.push({ id, name, named });
    for (const p of pages) {
      if (!isWeb(p.url)) continue;
      this.tabs.push({ id: ++this.seq, view: null, opener: null, title: p.title, url: p.url, favicon: '', loading: false, audible: false, muted: false, crashed: false,
        scrollY: 0, zoom: 0, lastSeen: Date.now(), blocked: null, trail: id, done: false, lent: false, upgraded: null, failed: null, blockedPopup: null, pane: this.pane.id });
    }
    this.changed();
    return id;
  }
  /** Put a trail away: its tabs close (their pages kept in the Stash), never lost. */
  private stashTrail(id: number): number | null {
    const tr = this.trails.find((x) => x.id === id);
    if (!tr) return null;
    const own = this.tabs.filter((t) => t.trail === id && !t.lent);
    const s: Stashed = { id: ++this.stashSeq, name: tr.name, tabs: own.filter((t) => isWeb(t.url)).map((t) => ({ url: t.url, title: t.title })), at: Date.now() };
    this.stash.unshift(s);
    this.stash = this.stash.slice(0, 50);
    for (const t of own) { const i = this.tabs.indexOf(t); if (i >= 0) { this.closeView(t); this.tabs.splice(i, 1); } }
    this.trails = this.trails.filter((x) => x.id !== id);
    const was = this.pane;
    for (const p of this.panes) {
      if (!this.alive(p) || this.tabs.some((t) => t.id === p.active)) continue;
      this.pane = p;
      p.active = null;
      const n = this.paneTabs(p)[0];
      if (n) this.activate(n.id); else this.newTab(this.HOME);
    }
    this.pane = was;
    this.saveStash();
    return s.id;
  }
  private saveStash(): void { try { writeFileAtomic(this.stashFile, JSON.stringify(this.stash)); } catch { /* best effort */ } this.sync?.changed('prefs'); }
  /** Bring a stashed trail back (its pages wake when he opens them), or let it go. */
  stashAct(id: number, act: 'restore' | 'forget'): void {
    const i = this.stash.findIndex((s) => s.id === id);
    if (i < 0) return;
    const [s] = this.stash.splice(i, 1);
    if (act === 'restore') this.reviveTrail(s!.name, s!.tabs, true);
    this.saveStash();
    this.changed();
  }

  // ------------------------------------------------------------------ Trail clean up (Tidy)
  private tidyTabs(): TidyTab[] {
    return this.tabs.filter((t) => isWeb(t.url) && !t.internal).map((t) => ({ id: t.id, url: t.url, title: t.title, trail: t.trail, lastSeen: t.lastSeen, active: this.panes.some((p) => p.active === t.id), audible: t.audible, lent: t.lent }));
  }
  /**
   * The broom (or Trail clean up in the menu). The instant part happens at once: doubles are marked (closed only on
   * Keep), trails untouched for two weeks go into the Stash. Then Qwen sorts the loose tabs and names Aang's trails;
   * while WoW is in front it waits, and says so. Everything is undoable until he keeps it.
   */
  tidyStart(): void {
    if (this.tidy) return;
    const run: TidyRun = { id: ++this.tidySeq, phase: 'working', text: '', waiting: false, trails: this.trails.map((x) => ({ ...x })),
      order: this.tabs.map((t) => ({ id: t.id, trail: t.trail })), dup: [], stashed: [], created: [], keepAt: 0, timer: null, retry: null };
    this.tidy = run;
    const tabs = this.tidyTabs();
    run.dup = doubles(tabs);
    for (const id of staleTrails(this.trails, tabs, Date.now())) { const s = this.stashTrail(id); if (s !== null) run.stashed.push(s); }
    this.askQwen(run);
    this.changed();
  }
  private askQwen(run: TidyRun): void {
    const tabs = this.tidyTabs().filter((t) => t.trail === null && !run.dup.includes(t.id));
    const unnamed = this.trails.filter((tr) => !tr.named).map((tr) => ({ trail: tr, titles: this.tabs.filter((t) => t.trail === tr.id).map((t) => t.title) }));
    run.text = `Sorting ${tabs.length} loose tab${tabs.length === 1 ? '' : 's'}.`;
    if (!tabs.length && !unnamed.length) { this.tidyApply(run, { groups: [], names: [] }); return; }
    (run as TidyRun & { loose?: TidyTab[]; unnamed?: Trail[] }).loose = tabs;
    (run as TidyRun & { loose?: TidyTab[]; unnamed?: Trail[] }).unnamed = unnamed.map((u) => u.trail);
    if (!this.onTidyAsk) { this.tidyApply(run, { groups: bySite(tabs), names: [] }, 'Qwen is not connected, so tabs were grouped by site.'); return; }
    this.onTidyAsk(run.id, tidyPrompt(tabs, unnamed), TIDY_SYSTEM);
  }
  /** Qwen's answer (or why there is none). */
  tidyAnswer(id: number, r: { ok: boolean; text?: string; why?: string }): void {
    const run = this.tidy;
    if (!run || run.id !== id || run.phase !== 'working') return;
    const x = run as TidyRun & { loose?: TidyTab[]; unnamed?: Trail[] };
    if (r.ok) { this.tidyApply(run, readTidy(String(r.text ?? ''), x.loose ?? [], x.unnamed ?? [])); return; }
    if (r.why === 'game') {
      // The card belongs to the game: wait, and try again every 30 seconds until he is out.
      run.waiting = true; run.text = 'Qwen waits until you are out of WoW.';
      if (run.retry) clearTimeout(run.retry);
      run.retry = setTimeout(() => { if (this.tidy === run && run.phase === 'working') { run.waiting = false; this.askQwen(run); this.changed(); } }, 30_000);
      this.changed();
      return;
    }
    this.tidyApply(run, { groups: bySite(x.loose ?? []), names: [] }, 'Qwen was not available, so tabs were grouped by site.');
  }
  private tidyApply(run: TidyRun, plan: { groups: { name: string; tabs: number[] }[]; names: { trail: number; name: string }[] }, note = ''): void {
    if (this.tidy !== run) return;
    for (const g of plan.groups) {
      const tid = ++this.trailSeq;
      this.trails.push({ id: tid, name: g.name, named: false, fresh: true });
      run.created.push(tid);
      for (const id of g.tabs) { const t = this.tabs.find((x) => x.id === id); if (t && t.trail === null) t.trail = tid; }
    }
    for (const n of plan.names) { const tr = this.trails.find((x) => x.id === n.trail); if (tr && !tr.named) { tr.name = n.name; tr.fresh = true; } }
    run.phase = 'review';
    run.waiting = false;
    run.text = note;
    run.keepAt = Date.now() + 10_000;
    run.timer = setTimeout(() => this.tidyKeep(), 10_000);
    this.changed();
  }
  /** Keep: the doubles close now; the NEW marks fade. */
  tidyKeep(): void {
    const run = this.tidy;
    if (!run) return;
    if (run.timer) clearTimeout(run.timer);
    if (run.retry) clearTimeout(run.retry);
    this.tidy = null;
    for (const id of run.dup) if (this.tabs.some((t) => t.id === id)) this.close(id);
    setTimeout(() => { for (const tr of this.trails) tr.fresh = false; this.changed(); }, 8000);
    this.changed();
  }
  /** Undo (or Stop): everything goes back exactly as it was, stashed trails included. */
  tidyUndo(): void {
    const run = this.tidy;
    if (!run) return;
    if (run.timer) clearTimeout(run.timer);
    if (run.retry) clearTimeout(run.retry);
    this.tidy = null;
    for (const sid of run.stashed) {
      const i = this.stash.findIndex((s) => s.id === sid);
      if (i < 0) continue;
      const [s] = this.stash.splice(i, 1);
      const old = run.trails.find((x) => x.name === s!.name);
      const tid = this.reviveTrail(s!.name, s!.tabs, old?.named ?? false);
      if (old) { const tr = this.trails.find((x) => x.id === tid); if (tr) tr.id = old.id; for (const t of this.tabs) if (t.trail === tid) t.trail = old.id; }
    }
    this.saveStash();
    const pos = new Map(run.order.map((o, n) => [o.id, n]));
    for (const t of this.tabs) { const o = run.order.find((x) => x.id === t.id); if (o) t.trail = o.trail; }
    this.tabs.sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9));
    const revived = this.trails.filter((x) => !run.trails.some((y) => y.id === x.id) && !run.created.includes(x.id));
    this.trails = [...run.trails.map((x) => ({ ...x })), ...revived];
    this.tidyTrails();
    this.changed();
  }
  private tidyState(): Record<string, unknown> | null {
    const r = this.tidy;
    if (!r) return null;
    return { phase: r.phase, text: r.text, waiting: r.waiting, dup: r.dup, created: r.created.length, stashed: r.stashed.length, doubles: r.dup.length, keepAt: r.keepAt };
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
    if (this.toPaid(url)) return;
    if (!t?.view || t.internal) { this.newTab(url); return; }
    t.crashed = false;
    const l = this.listed(url);
    if (l.length) { this.block(t, url, l); return; }
    t.blocked = null; t.failed = null; this.place();
    t.pending = url;
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
      case 'peek': void this.peek(); break;
      case 'frozen-ready': this.frozenReady(); break;
      case 'importmarks': void this.importMarks(); break;
      case 'settings': this.openSettings(); break;
      case 'bookmarks': this.openSettings('bookmarks'); break;
      case 'history': this.openThings('history'); break;
      case 'downloads': this.openThings('downloads'); break;
      case 'print': if (wc && t && !t.internal) wc.print({}); break;
      case 'tidy': this.tidyStart(); break;
      case 'tidykeep': this.tidyKeep(); break;
      case 'tidyundo': this.tidyUndo(); break;
      case 'trailundo': this.undoTrailClose(); break;
      // The blue shield: open the popup he was looking for (as a tab, beside the page), or allow the site from now on.
      case 'popupopen': case 'popupallow': if (t?.blockedPopup) {
        const bp = t.blockedPopup;
        t.blockedPopup = null;
        if (what === 'popupallow' && bp.site) { this.popupOk.add(bp.site); try { writeFileAtomic(this.popupOkFile, JSON.stringify([...this.popupOk])); } catch { /* best effort */ } this.sync?.changed('prefs'); }
        if (!this.listed(bp.url).length) this.newTab(bp.url, t.id, true);
        this.sendTabs();
      } break;
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
      case 'phishback': if (t) { t.blocked = null; if (wc?.navigationHistory.canGoBack()) { this.place(); wc.navigationHistory.goBack(); } else this.close(t.id, false); } break;
      // A look-alike: the real site, typed fresh, never the link that led here.
      case 'phishreal': if (t?.blocked?.real) { const u = 'https://' + t.blocked.real + '/'; t.blocked = null; this.place(); void wc?.loadURL(u); } break;
      // A failed page: try again; or, with no secure version, open the plain one and remember the site.
      case 'failretry': if (t?.failed && wc) { const u = t.failed.url; t.failed = null; this.place(); void wc.loadURL(this.secured(t, u)).catch(() => {}); } break;
      case 'httpok': if (t?.failed?.kind === 'insecure' && wc) {
        const u = t.failed.url;
        try { this.httpOk.add(new URL(u).hostname); writeFileAtomic(this.httpOkFile, JSON.stringify([...this.httpOk])); this.sync?.changed('prefs'); } catch { /* best effort */ }
        t.failed = null; t.upgraded = null; this.place(); void wc.loadURL(u).catch(() => {});
      } break;
      case 'failback': if (t) { t.failed = null; if (wc?.navigationHistory.canGoBack()) { this.place(); wc.navigationHistory.goBack(); } else this.close(t.id, false); } break;
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
    if (c && !i.shift && k === 'h') { this.act('history'); return true; }
    if (c && !i.shift && k === 'j') { this.act('downloads'); return true; }
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
      const mine = this.paneTabs();
      const n = k === '9' ? mine[mine.length - 1] : mine[Number(k) - 1];
      if (n) this.activate(n.id);
      return true;
    }
    if (k === 'escape' && this.cur()?.loading) { this.act('stop'); return false; }
    if (c && k === 'tab') {
      const mine = this.paneTabs();
      const i2 = mine.findIndex((x) => x.id === this.active);
      const n = mine[(i2 + (i.shift ? -1 : 1) + mine.length) % mine.length];
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
    if (!this.tabs.length) return;   // nothing to keep; closing the last tab already wrote the empty snapshot
    // Everything is taken NOW, before waiting on the pages (2026-10-14, his "it should remember what tabs were open"):
    // closing the window emptied the tab list while this waited, and an EMPTY list was written, so nothing came back.
    const keep = this.tabs.filter((t) => isWeb(t.url));
    const windows = this.panes.filter((p) => this.alive(p) || p === this.pane);
    const winOf = new Map(windows.map((p, i) => [p.id, i]));
    const front = (this.lastPane() ?? this.pane).active;
    const fronts = windows.map((p) => keep.findIndex((t) => t.id === p.active));
    const trails = this.trails.map((x) => ({ ...x }));
    const closed = this.closed.slice(-25);
    await Promise.all(keep.map(async (t) => {
      if (!t.view || t.crashed || t.view.webContents.isDestroyed()) return;
      const y = await within(t.view.webContents.executeJavaScript('window.scrollY', true) as Promise<number>, 800, t.scrollY);
      if (typeof y === 'number' && Number.isFinite(y)) t.scrollY = y;
    }));
    const data = {
      v: 1, at: new Date().toISOString(),
      // Every window's tabs, each knowing its window (`win`), and the tab in front in each (`fronts`).
      active: Math.max(0, keep.findIndex((x) => x.id === front)),
      fronts,
      tabs: keep.map((t) => ({
        url: t.url, title: t.title, opener: t.opener === null ? null : keep.findIndex((x) => x.id === t.opener),
        scrollY: Math.round(t.scrollY), zoom: t.zoom, muted: t.muted, trail: t.trail, done: t.done, win: winOf.get(t.pane) ?? 0,
      })),
      trails,
      closed,
    };
    try { writeFileAtomic(this.file, JSON.stringify(data)); } catch (e) { console.error('shell: browser: the tabs could not be saved: ' + (e as Error).message); }
    this.sync?.changed('tabs');
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
          trail: Number.isInteger(t.trail) ? t.trail : null, done: false, lent: false, upgraded: null, failed: null, blockedPopup: null, pane: this.pane.id };
        ids.push(tab.id);
        this.tabs.push(tab);
      }
      list.forEach((t: { opener?: unknown }, i: number) => { const o = Number(t.opener); if (Number.isInteger(o) && o >= 0 && o < ids.length && o !== i) this.tabs[i]!.opener = ids[o]!; });
      if (Array.isArray(s.closed)) this.closed = s.closed.filter((u: unknown) => typeof u === 'string' && isWeb(u as string)).slice(-25);
      if (Array.isArray(s.trails)) this.trails = s.trails.filter((x: Partial<Trail>) => Number.isInteger(x?.id) && typeof x?.name === 'string')
        .map((x: Trail) => ({ id: x.id, name: x.name.slice(0, 24), named: x.named === true, collapsed: x.collapsed === true }));
      this.trailSeq = this.trails.reduce((m, x) => Math.max(m, x.id), 0);
      for (const t of this.tabs) if (t.trail !== null && !this.trails.some((x) => x.id === t.trail)) t.trail = null;
      this.tidyTrails();
      // Every window he had open comes back with its own tabs (2026-10-14). The first one is this window.
      const wins = new Map<number, Tab[]>();
      list.forEach((t: { win?: unknown }, i: number) => { const w = Math.max(0, Math.min(6, Number(t.win) || 0)); if (w > 0) { const a = wins.get(w) ?? []; a.push(this.tabs[i]!); wins.set(w, a); } });
      const fronts: number[] = Array.isArray(s.fronts) ? s.fronts.map((n: unknown) => Number(n)) : [];
      const here = this.tabs.filter((t) => ![...wins.values()].some((a) => a.includes(t)));
      const want = this.tabs[Number(fronts[0])];
      const a = Math.min(Math.max(0, Number(s.active) || 0), this.tabs.length - 1);
      this.activate((want && here.includes(want) ? want : here[0] ?? this.tabs[a]!).id);
      const base = this.win?.getBounds();
      let n = 0;
      for (const [w, group] of wins) {
        n++;
        const front = this.tabs[Number(fronts[w])];
        const ordered = front && group.includes(front) ? [...group.filter((x) => x !== front), front] : group;
        this.createPane(undefined, ordered, base ? { x: base.x + 40 * n, y: base.y + 40 * n, width: base.width, height: base.height } : undefined);
      }
      return true;
    } catch (e) { console.error('shell: browser: the saved tabs could not be read: ' + (e as Error).message); return false; }
  }

  /** The rail and the band redraw from this. Plain data only. */
  private sendTabs(): void {
    // A site's camera and microphone end when no tab is on it any more.
    if (this.mediaOk.size || this.shareHosts.size) {
      const on = new Set(this.tabs.map((t) => hostOf(t.url)));
      for (const h of [...this.mediaOk.keys()]) if (!on.has(h)) this.mediaOk.delete(h);
      for (const h of [...this.shareHosts]) if (!on.has(h)) this.shareHosts.delete(h);
    }
    // A tab with a live call runs at full speed even behind other tabs, and never sleeps (see sleepIdle).
    let calls = false;
    for (const t of this.tabs) {
      const h = hostOf(t.url);
      const c = Boolean(t.view) && (this.mediaOk.has(h) || this.shareHosts.has(h));
      if (t.view && Boolean(t.call) !== c) { try { t.view.webContents.setBackgroundThrottling(!c); } catch { /* gone */ } }
      t.call = c;
      calls ||= c;
    }
    this.callNow(calls);
    const was = this.pane;
    for (const p of this.panes) { this.pane = p; this.sendPane(); }
    this.pane = was;
  }
  /** One window's frame (and its tray) redraws from this. */
  private sendPane(): void {
    const w = this.win;
    if (!w || w.isDestroyed()) return;
    const mine = this.paneTabs();
    const t = this.cur();
    const wc = t?.view?.webContents;
    const tray = this.trayV && !this.trayV.webContents.isDestroyed() ? this.trayV.webContents : null;
    const send = (data: Record<string, unknown>) => { w.webContents.send('browser:tabs', data); tray?.send('browser:tabs', data); };
    send({
      active: this.active,
      update: this.update, inCall: this.inCall,
      canBack: Boolean(wc?.navigationHistory.canGoBack()), canForward: Boolean(wc?.navigationHistory.canGoForward()),
      tabs: mine.map((x) => ({ id: x.id, opener: x.opener, title: x.title, url: x.url, favicon: x.favicon, loading: x.loading, phase: x.phase ?? (x.loading ? 'loading' : 'idle'), prog: x.prog ?? 0, pending: x.pending ?? null, audible: x.audible, muted: x.muted, crashed: x.crashed, asleep: !x.view, blocked: x.blocked, failed: x.failed, trail: x.trail, done: x.done, lent: x.lent, popup: x.blockedPopup?.url ?? null })),
      // The trails with a tab in this window (or the one about to start here).
      trails: this.trails.filter((tr) => tr.id === this.pendingTrail || mine.some((x) => x.trail === tr.id)),
      drivers: this.driver.view(),
      watching: this.watching === null ? null : (() => { const p = this.driver.page(this.watching!); const j = p ? this.driver.job(p.job) : undefined; return p && j ? { page: p.id, job: j.id, kind: j.kind, working: j.working, url: p.url, title: p.title } : null; })(),
      tidy: this.tidyState(),
      stash: this.stash.map((s) => ({ id: s.id, name: s.name, count: s.tabs.length })),
      adsPaused: (() => { try { return this.paused.has(new URL(t?.url ?? '').hostname.replace(/^www\./, '')); } catch { return false; } })(),
      adsOn: Boolean(this.ads),
      darkHere: this.darkWanted(t?.url ?? ''), darkAll: this.prefs.dark,
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

  /** Quitting: every window closes at once, and none of their tabs is dropped on the way out. */
  private quitting = false;
  closeAll(): void {
    void this.ses.cookies.flushStore().catch(() => {});
    this.driver.closeAll();
    const open = this.panes.filter((p) => this.alive(p));
    if (open.length) { this.quitting = true; void this.snapshot(); }
    for (const p of open) p.win!.close();
  }

  // ------------------------------------------------------------------ 6.25a: what the brain asks of the driver
  /**
   * One driving step, asked by the brain. The rules are checked HERE, on the browser side, whatever the brain says:
   * a "never" control is refused outright; a "lever" one comes back as needs:'lever' until the brain has his held
   * yes and asks again with allowed. Every answer is plain data; page text is marked as the page's own words.
   */
  async drive(op: string, a: Record<string, unknown>): Promise<Record<string, unknown>> {
    const num = (k: string) => { const v = Number(a?.[k]); if (!Number.isInteger(v)) throw new Error(`${k} must be a number`); return v; };
    const d = this.driver;
    try {
      switch (op) {
        // His browsing history, for Aang, only when he asks (2026-10-13): titles and addresses, never a money site.
        case 'history': {
          const days = Number(a?.days); const q = String(a?.q ?? '').slice(0, 200);
          return { ok: true, items: forAang(this.visits.list, q, Number.isFinite(days) ? days : 14, 15, Date.now()) };
        }
        case 'start': { const j = d.startJob(a?.kind === 'claude' ? 'claude' : 'aang', String(a?.name ?? '')); return { ok: true, job: j.id }; }
        case 'finish': d.finish(num('job')); return { ok: true };
        case 'open': return { ok: true, ...(await d.open(num('job'), String(a?.url ?? '').slice(0, 2000))) };
        case 'read': return { ok: true, ...(await d.read(num('page'))) };
        case 'click': case 'type': {
          const page = num('page'), n = num('n');
          const w = op === 'click' ? d.weightOf(page, n, 'click') : d.weightOf(page, n, 'type');
          const we = op === 'type' && a?.enter === true ? d.weightOf(page, n, 'enter') : 'free';
          const worst = w === 'never' || we === 'never' ? 'never' : w === 'lever' || we === 'lever' ? 'lever' : 'free';
          if (worst === 'never') return { ok: false, error: `that is ${d.describe(page, n)}, and buying, passwords and card details are never done for him. He has to do it himself` };
          if (worst === 'lever' && a?.allowed !== true) return { ok: false, needs: 'lever', what: `${op === 'click' ? 'press' : 'fill in and send'} ${d.describe(page, n)}` };
          const r = op === 'click' ? await d.click(page, n) : await d.type(page, n, String(a?.text ?? ''), a?.enter === true);
          return { ok: true, ...r };
        }
        case 'scroll': await d.scroll(num('page'), a?.down !== false); return { ok: true };
        case 'picture': {
          const what = a?.what === 'view' ? 'view' : Number.isInteger(Number(a?.what)) ? Number(a?.what) : 'best';
          const r = await d.picture(num('page'), what);
          const p = d.page(num('page'));
          return { ok: true, png: r.png.toString('base64'), video: r.video, width: r.width, height: r.height, url: p?.url ?? '', title: p?.title ?? '' };
        }
        case 'close': d.close(num('page')); return { ok: true };
        default: return { ok: false, error: 'unknown step' };
      }
    } catch (e) { return { ok: false, error: (e as Error).message }; }
  }

  // ------------------------------------------------------------------ 6.25a: his view of Aang's pages
  /** The drawer and the address bar: STOP a job, close it, watch one of its pages, or open a page as his own tab. */
  driverAct(act: string, id: number): void {
    if (act === 'stop') this.driver.stop(id);
    else if (act === 'close') { if (this.watching !== null && this.driver.page(this.watching)?.job === id) this.unwatch(); this.driver.closeJob(id); }
    else if (act === 'watch') this.watch(id);
    else if (act === 'unwatch') this.unwatch();
    else if (act === 'open') { const p = this.driver.page(id); if (p && isWeb(p.url)) { this.unwatch(false); this.newTab(p.url); } }
    this.sendTabs();
  }
  /** A live picture of one of Aang's pages in the page area: his own tab steps aside, nothing is handed over. */
  private watch(pageId: number): void {
    const w = this.win;
    if (!w || w.isDestroyed() || !this.driver.page(pageId)) return;
    this.watching = pageId;
    const t = this.cur();
    if (t?.view && !t.lent) t.view.setVisible(false);
    this.veilDown(0);
    const P = this.pane;
    const tick = async () => {
      if (P.watching !== pageId) return;
      const src = await this.driver.glance(pageId);
      this.pane = P;
      if (this.watching !== pageId || !this.win || this.win.isDestroyed()) return;
      this.win.webContents.send('browser:watch', src);
      this.watchTimer = setTimeout(() => void tick(), 700);
    };
    if (this.watchTimer) clearTimeout(this.watchTimer);
    void tick();
    this.sendTabs();
  }
  private unwatch(show = true): void {
    if (this.watching === null) return;
    this.watching = null;
    if (this.watchTimer) { clearTimeout(this.watchTimer); this.watchTimer = null; }
    this.win?.webContents.send('browser:watch', null);
    const t = this.cur();
    if (show && t?.view && !t.lent && !this.drawerOpen) { this.place(); t.view.setVisible(true); }
    this.sendTabs();
  }
}
