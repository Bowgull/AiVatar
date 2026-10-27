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
import { BrowserWindow, Menu, WebContentsView, app, net, powerMonitor, clipboard, desktopCapturer, dialog, nativeImage, nativeTheme, safeStorage, screen, systemPreferences, session as electronSession, shell, webContents as allWebContents, type DesktopCapturerSource } from 'electron';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { execFile, spawn } from 'node:child_process';
import { connect as netConnect } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { SAFE_WEB_PREFERENCES, denyPermissions, lockDown } from './safety.ts';
import { CastSession, DEFAULT_PLAYER, airplayNames, findTvs } from './tv.ts';
import { PAGE_VIDEO_JS, PAUSE_PAGE_JS, YOUTUBE_APP, YOUTUBE_NS, plainMedia, seekPageJs, twitchMedia, twitchOf, youTubeId, youTubeOnTv } from './tvmedia.ts';
import { addressFor, engineHome, guessesUrl, parseGuesses, searchFor, setSearch, type Engine } from './address.ts';
import { TIDY_SYSTEM, bySite, doubles, readTidy, staleTrails, tidyPrompt, type TidyTab } from './tidy.ts';
import { writeFileAtomic, writeFileAtomicSoon } from './atomic.ts';
import { carriesData, personal, privateHost, reachesIn, siteOf, JOB_SITES, jobTask } from './driverrules.ts';
import { SiteRules, siteKey, type Tri } from './siterules.ts';
import { DeviceOk, deviceName, type KnownDevice } from './devices.ts';
import { svgToPng } from './svgicon.ts';
import { lookalike } from './lookalike.ts';
import { softEdge } from './winedge.ts';
import { isBar, parseBookmarks, parseChromeBookmarks, parseSafariBookmarks, type Mark } from './bookmarks.ts';
import { BW_LOGIN, LOCK_AFTER, Vault, fillScript, type Login } from './vault.ts';
import { DETAIL_KINDS, DetailsStore, PIN_MAX, PIN_MIN, PinSeal, cleanDetails, pinOk, detailFor, fillDetailsScript, samePin, type FieldKind } from './autofill.ts';
import { createHmac, randomBytes } from 'node:crypto';
import { claudeMessage, claudeOpenTarget, type ClaudeOpen } from './claudewire.ts';
import { Visits, search as searchVisits, forAang, neverKeep, bankSite, type Visit } from './visits.ts';
import { BrowserSync, urlKept, type SyncCookie, type SyncMsg, type TabSnap } from './bsync.ts';
import { Driver, type Job } from './driver.ts';
import { Downloads, kindOf, trayOf, type Dl } from './dlist.ts';
import { TIDY_KEEP, isPicked, saysDecided, sheetLabel, spaceOf, tidyDue, tidyLine } from './mockuptidy.ts';
import { MockServer, MockStore, SHOT_MAX_BYTES, SHOT_MAX_W, cleanPath, cleanSheet, findRepo, git, liveTitle, notesFrom, resolveVersion, sheetKind, splitRepoSheet, type MockSend, type MockSendItem, type MockStage, type MockVersion, type MockupDrop } from './mockups.ts';

/** A site name scrambled with this PC's own key: the file alone says nothing about where he has accounts. */
/** What the update tray shows (sheet 35): the title ("Version 1.1.0: Gojo"), what the update does as groups of lines (a
 *  line with a key is a tick box he can untick), whether he can go back, and his overnight setting. */
export interface UpdateCard {
  version: string; since: number; title?: string;
  groups?: { name: string; items: { text: string; note?: string; key?: string; on?: boolean }[] }[];
  canBack?: boolean; overnight?: boolean;
  notes?: string[]; checks?: string[]; kind?: string;
}
// His pick (2026-10-14): the lantern alone, lit and glowing, nothing behind it.
const SAMARA_ICON = path.join(import.meta.dirname, '..', 'pages', 'art', 'samara', 'samara-open.ico');
/**
 * The key that scrambles the list of sites Bitwarden has logins for, kept under the computer's own lock (code audit L10,
 * 2026-10-14) instead of beside the list. Windows' own lock (DPAPI) never asks him anything; the Mac moves to its
 * Keychain with the login lock, so it does not bring a new Keychain question with every update before then.
 */
const lockKey = (key: string): string => { try { return process.platform === 'win32' && safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(key).toString('base64') : ''; } catch { return ''; } };
const unlockKey = (locked: string): string => { try { return safeStorage.decryptString(Buffer.from(locked, 'base64')); } catch { return ''; } };
const scramble = (key: string, host: string) => createHmac('sha256', key).update(host.toLowerCase()).digest('hex').slice(0, 32);
import { PhishCheck } from './phish.ts';
import { serviceFor } from './services.ts';
import { failureWords, isRisky, upgrade } from './secure.ts';
import { blockAds, guardRequests, privacyHooks, type AdBlock } from './skip/ads.ts';
import { CookieWall, cleanLink, cookieHeaders, guardPrivacy } from './privacy.ts';
import { createRequire } from 'node:module';
import { pageMenuItems, sendKindFor } from './sendtoaang.ts';

/**
 * Dark mode for web pages (X, his "Dark Reader is a must", 2026-10-14): Dark Reader's own engine (darkreader 4.9.133,
 * MIT), put into each page in a world of its own, so the page's scripts can neither see it nor switch it off.
 */
const DARK_WORLD = 1002;
const DARK_THEME = '{brightness:100,contrast:95,sepia:5}';
/**
 * His report (2026-10-20): dark mode was laggy on his 2017 MacBook. Dark Reader repaints a whole page, which is heavy on a
 * busy page and a dual-core Mac also playing his Shadow stream. So, like the real extension's "detect dark theme": a
 * page that is already dark (its own dark mode, or one it chose because sites are told he prefers dark) is left alone,
 * and Dark Reader only works on pages that are really light. Exported for the tab preload, which runs the same test.
 */
// A site that turns dark only once it has loaded (2026-10-23, his Bitwarden vault went black after logging in: its own
// dark theme under Dark Reader's): the page's own dark marks (a "dark" class or theme on <html> or <body>, or a
// dark-only color-scheme) are watched, and Dark Reader steps aside the moment they appear.
export const ALREADY_DARK = "var __aangDarkMark=()=>{try{const els=[document.documentElement,document.body].filter(Boolean);for(const e of els){for(const c of e.classList)if(/dark/i.test(c)&&!/darkreader|light/i.test(c))return true;for(const n of ['data-theme','data-bs-theme','data-color-mode','data-mode','theme'])if(/dark/i.test(e.getAttribute(n)||''))return true;}return (document.querySelector('meta[name=color-scheme]')?.content||'').trim().toLowerCase()==='dark';}catch{return false;}};var __aangWatchDark=()=>{try{const mo=new MutationObserver(()=>{if(__aangDarkMark()){mo.disconnect();DarkReader.disable();}});mo.observe(document.documentElement,{attributes:true,childList:true});if(document.body)mo.observe(document.body,{attributes:true});}catch{}};var __aangAlreadyDark=()=>{try{if(__aangDarkMark())return true;const lum=(c)=>{const m=/rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?/.exec(c||'');if(!m||(m[4]!==undefined&&+m[4]<0.5))return null;return(0.2126*m[1]+0.7152*m[2]+0.0722*m[3])/255;};const b=document.body?lum(getComputedStyle(document.body).backgroundColor):null;const h=lum(getComputedStyle(document.documentElement).backgroundColor);const v=b??h;if(v===null)return getComputedStyle(document.documentElement).colorScheme.includes('dark');return v<0.25;}catch{return false;}};";
let darkSrc: string | null | undefined;
/** A synced list of site names: plain hosts only. */
/** Bitwarden's lock time as Settings keeps it (sheet 83). */
const lockPick = (v: unknown): string => (typeof v === 'string' && v in LOCK_AFTER ? v : '30m');
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

export interface BrowserOptions { origin: string; preloadPath: string; stateDir: string; tabPreloadPath: string; settingsPreloadPath: string; thingsPreloadPath: string; /** tests only */ testLocal?: boolean;
  /** Where the mockups' git repo is (sheet 47). Found from the Shell's own folder; a test gives its own. */ repoDir?: string;
  /** 2026-10-22, the Mac: no AangApp repo beside Samara, but the MOCKUPS trail is on for other repos' pages and live
   *  pages (the Mac's Claude sessions, through mockupdoor.ts). Only when git is really there (macmain checks). */
  mockupsAnywhere?: boolean;
  /** Sheet 87, the secret window: a second browser of its own (its own tabs, bookmarks, history and logins in its own
   *  folder and its own kept session), its tab list behind its own PIN. Normal Samara shows no sign of it. */
  secret?: boolean;
  /** Sheet 87: where the settings, autofill and site rules it shares with normal Samara live (normal Samara's folder). */
  sharedDir?: string;
  /** Sheet 87 (his "really glitchy"): normal Samara's fake-site lists, shared, so the secret window never loads its own. */
  phish?: PhishCheck }

interface Tab {
  id: number;
  /** The window it is in (a Pane's id). */
  pane: number;
  /** One of the browser's own pages (Settings, Your things), not a website: it gets its own small preload and never navigates. */
  internal?: 'settings' | 'things' | 'night';
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
  /**
   * Coming back after a restart (2026-10-22, his Mac): Chromium's own saved state for the page he was on (scroll, form
   * contents but never passwords), so the page comes back where it was as it draws, and the colour of the page, so the
   * page area shows that colour (not near-white) until it does. Kept on this machine only; sync never carries them.
   */
  pageState?: string;
  /** The last picture of the page as he left it (taken when his mouse heads for the tab list): shown at once when it
   *  wakes from sleep, so it never looks blank or crashed (2026-10-23). `waking`: its sound and video wait for the page. */
  leftShot?: string; waking?: boolean;
  /** Frozen (2026-10-23, Edge's sleeping tabs): its timers and network stop, the page stays; it thaws instantly. */
  frozen?: boolean;
  /** It was put to sleep (not a brand-new tab): when it wakes it comes back quietly, paused at his spot. */
  slept?: boolean;
  /** Where its main video was when it went quiet (his ask, 2026-10-23): a woken tab comes back paused right there. */
  videoAt?: number;
  pageBg?: string;
  zoom: number;
  lastSeen: number;
  /** 6.24: a call is live in this tab (he allowed its camera, mic or a screen share): never slowed, never put to sleep. */
  call?: boolean;
  /** 6.22: stopped before loading because a list names it: which lists. */
  blocked: { url: string; lists: string[]; real?: string; bank?: boolean } | null;
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
  /** Nothing plays until he asks (2026-10-20): when he last asked for this tab's page himself (address, bookmark, link). */
  playOkAt?: number;
  /** What the page was last told: he can see it, or it may play out of sight (a call, the pop-out, Spotify). */
  shown?: boolean;
  /** Sheet 40 B (his pick, 2026-10-20): a still of the video, taken as it went to the pop-out, for the page left behind. */
  lentShot?: string;
  /** Sheet 47: a mockup Claude opened, one tab per sheet: which sheet, the commit it shows, and its picture (key). */
  /** `at`: when it last arrived (newest on top, his ask); `unseen`: arrived and not looked at yet (a soft glow until he does). */
  mock?: { sheet: string; commit: string; key: string; at?: number; unseen?: boolean };
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
  trayAt: { x: number; y: number; hy?: number };
  /** Claude's rune panel, in its own see-through layer over the live page (2026-10-21, runeView). */
  runeV?: WebContentsView | null;
  runeOn?: boolean;
  /** Where the band's rune is (window pixels): its centre, the band's bottom, left and right. */
  runeAt?: { x: number; y: number; left: number; right: number };
  runeSize?: { w: number; h: number };
  /** When it last folded because the layer lost the keyboard: the same press on the rune must not reopen it. */
  runeShutAt?: number;
  runeHideT?: NodeJS.Timeout | null;
  /** The pop-out still last sent to this window's band (sent once, not with every message). */
  lentSent?: string;
  /** Autofill's light (sheet 77): its own see-through layer beside the box he clicked. */
  lightV?: WebContentsView | null;
  curtain: WebContentsView | null;
  curtainReady: Promise<unknown>;
  veil: { tab: number; nav: number; at: number; up: boolean; dimT: NodeJS.Timeout | null; capT: NodeJS.Timeout | null } | null;
  fullTab: number | null;
  watching: number | null;
  watchTimer: NodeJS.Timeout | null;
  /** Sheet 60: this window's "Notes for this site" rail is open (Esc in the page closes it). */
  railOpen?: boolean;
}
/** Sheet 60 section 4: a note as Samara's notes rail needs it (only notes that came from a page carry `src`). */
export interface RailNote { id: string; title: string; html: string; cat?: string; src?: { url: string; site: string }; updated: number }
const newPane = (id: number): Pane => ({ id, win: null, active: null, inset: { left: 30, top: 66, right: 8, bottom: 8 }, drawerOpen: false, peekShot: null, peeking: false,
  hideTimer: null, trayV: null, trayOn: false, trayAt: { x: 42, y: 62 }, curtain: null, curtainReady: Promise.resolve(), veil: null, fullTab: null, watching: null, watchTimer: null });

/** A trail (Horse Browser's idea, sheet 3): pages that belong to one thing he is doing. `named` = he named it. */
interface Trail { id: number; name: string; named: boolean; collapsed?: boolean; fresh?: boolean; /** sheet 47: the MOCKUPS trail */ mock?: boolean }
/** Sheet 47: the MOCKUPS trail always has this id, so it is the same trail across restarts and never mixed with his. */
const MOCK_TRAIL = -1;
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
/**
 * Sheet 87 (his "no smooth motion is applied to this whatsoever"): the secret window fades in over a fifth of a second,
 * easing out, instead of popping up.
 */
function fadeIn(w: BrowserWindow): void {
  if (!w || w.isDestroyed()) return;
  w.setOpacity(0);
  bringFront(w);
  const start = Date.now(), FADE_MS = 200;
  const step = () => {
    if (w.isDestroyed()) return;
    const k = Math.min(1, (Date.now() - start) / FADE_MS);
    w.setOpacity(1 - Math.pow(1 - k, 3));
    if (k < 1) setTimeout(step, 16);
  };
  step();
}
/** Never handed to another app, whatever claims them: they reach files, run code, or are the browser's own. */
const NEVER_HANDED = new Set(['file', 'javascript', 'vbscript', 'data', 'blob', 'about', 'chrome', 'devtools', 'view-source', 'filesystem', 'jar', 'smb', 'afp', 'nfs', 'ftp', 'ms-msdt', 'search-ms', 'ms-officecmd', 'ms-settings']);
/**
 * The app a link is for, by name; null when none. The known ones by their friendly name; any other (2026-10-25: Shadow
 * signing in hands him back to its app with tech.shadow://, which Samara called a fake site) by the app on this
 * computer that says it opens such links. He is still asked every time.
 */
export function appOf(u: string): string | null {
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(String(u ?? ''));
  if (!m || u.length > 4000) return null;
  const scheme = m[1]!.toLowerCase();
  if (APP_LINKS[scheme]) return APP_LINKS[scheme]!;
  if (NEVER_HANDED.has(scheme) || scheme === 'http' || scheme === 'https') return null;
  try { const name = app.getApplicationNameForProtocol(u); return name ? name.replace(/\.app$/i, '').slice(0, 60) : null; } catch { return null; }
}
/** The right-click item that sends a page to the other machine's browser. */
const OTHER_OPEN = process.platform === 'darwin' ? 'Open on PC' : 'Open on Mac';
/** How a look-alike is named on the red plate's list chips. */
const LOOKS_LIKE = 'LOOKS LIKE ';
const BANK = 'YOUR BANK';
/**
 * Sheet 89 (his ask, 2026-10-25): Stremio in a tab. Its page plays through the engine its app runs on this Mac
 * (127.0.0.1:11470), which the home-network guard below stopped ("Streaming server is not available"). Stremio's own
 * page, and only it, may reach that one port.
 */
const STREMIO_WEB = /^https:\/\/web\.stremio\.com(\/|$)/i;
const STREMIO_ENGINE = /^(https?|wss?):\/\/(127\.0\.0\.1|localhost):11470(\/|$)/i;
const STREMIO_APP = '/Applications/Stremio.app/Contents/MacOS';
/** Private Network Access for every tab (driverrules.ts reachesIn). */
export const netGuard = (d: Electron.OnBeforeRequestListenerDetails): boolean => {
  let from = '';
  try { from = d.frame?.url || ''; } catch { /* frame gone */ }
  if (STREMIO_ENGINE.test(d.url) && STREMIO_WEB.test(from || d.referrer || '')) return false;
  return reachesIn(d.url, from || d.referrer || '', d.resourceType === 'mainFrame');
};
/** Sheet 89: is Stremio's engine answering on this Mac? */
const stremioUp = (): Promise<boolean> => new Promise((res) => {
  const s = netConnect(11470, '127.0.0.1');
  const done = (ok: boolean) => { s.destroy(); res(ok); };
  s.once('connect', () => done(true)); s.once('error', () => done(false)); s.setTimeout(800, () => done(false));
});
/**
 * Sheet 89 (his pick): opening Stremio starts its engine quietly when it is not running: the same small program Stremio's
 * app starts, from the app itself, with no Stremio window. It keeps running after Samara closes, as it does for the app.
 */
async function startStremio(): Promise<void> {
  if (process.platform !== 'darwin' || !existsSync(path.join(STREMIO_APP, 'server.js')) || await stremioUp()) return;
  try { spawn(path.join(STREMIO_APP, 'node'), [path.join(STREMIO_APP, 'server.js')], { cwd: STREMIO_APP, detached: true, stdio: 'ignore' }).unref(); }
  catch (e) { console.error('shell: Stremio\'s engine would not start: ' + (e as Error).message); }
}
/** Where a new tab opens until he sets his own in Settings (2026-10-12: not Google). */
const DEFAULT_HOME = 'https://search.brave.com/';
/** A plain Chrome's name for itself: Google refuses sign-in to anything calling itself Electron (his yes, 2026-10-12). */
/** A web address's site, without www. Empty when it is not one. */
const hostOf = (u: string): string => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
/**
 * Chrome's own name, for the computer Samara really runs on (2026-10-25, his report: Shadow's "are you a bot" box
 * reloaded forever on the Mac). It said "Windows" everywhere, while the page's other clues (navigator.platform, the
 * client hints) said macOS; Cloudflare's check refuses a browser whose clues disagree. The version is given the way
 * Chrome gives it now (152.0.0.0), the same as the client hints.
 */
const CHROME_UA = (v: string) => {
  const major = String(v).split('.')[0] + '.0.0.0';
  const os = process.platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10_15_7' : process.platform === 'linux' ? 'X11; Linux x86_64' : 'Windows NT 10.0; Win64; x64';
  return `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major} Safari/537.36`;
};
/**
 * Google's sign-in pages get the browser's HONEST name (Electron's own, untouched). Measured by two other Electron
 * browsers in 2026 (Orca: a Chrome disguise was refused 12 of 12 times, the honest name 0 of 12; Ostia the same) and
 * it is what Google's own 2020 rules for browsers ask: no pretending to be Chrome. Everywhere else, plain Chrome.
 * research_notes/Google sign-in in Aang browser.
 */
/**
 * Sites that get the honest name too (2026-10-25, his report: Shadow's Cloudflare "are you a bot" box reloaded forever).
 * Claiming Chrome while not having all of Chrome's own parts reads as a bot to Cloudflare's check; Electron's honest
 * name is a browser it knows. Google's sign-in, Shadow, and the Cloudflare check itself.
 */
// Netflix too (2026-10-25, his "why is Netflix opening in another window"): Samara's video signature checked valid
// (streaming, 1361 days), so the E100 of 2026-10-14 points at the name: castLabs' own tracker (electron-releases #199)
// has a custom name breaking Netflix's DRM and the untouched name playing; castLabs' player, which plays it here, sends its own.
const HONEST_SITES = /^https:\/\/(accounts\.(google|youtube)\.com|([a-z0-9-]+\.)*shadow\.tech|challenges\.cloudflare\.com|([a-z0-9-]+\.)*netflix\.com|([a-z0-9-]+\.)*yandex\.(com|ru|by|kz|com\.tr)|([a-z0-9-]+\.)*ya\.ru)(:\d+)?(\/|$)/i;
/** The requests that carry the honest name (the sites above, and what their pages load: Netflix's video, Yandex's parts). */
const HONEST_REQUESTS = /^https:\/\/(accounts\.(google|youtube)\.com|challenges\.cloudflare\.com|[a-z0-9.-]+\.shadow\.tech|(([a-z0-9-]+\.)*)(netflix\.com|nflxvideo\.net|nflxext\.com|nflxso\.net|yandex\.com|yandex\.ru|ya\.ru|yandex\.net))(:\d+)?\//i;
/** Netflix's own error codes on its player page: the playback was refused here (E100, M7xxx-xxxx, F7xxx). */
const NETFLIX_REFUSED = /\b(E100|tvq-pb-101|M7\d{3}-\d{4}|F7\d{3}(-\d{1,4})?)\b/;
/** A popup that opens within this long of his click or key press is his (Chrome's own rule); later ones are a page's. */
const GESTURE_MS = 1000;
/**
 * Sign-in pages a site opens in a small window on his click (Sign in with Google and the like): let through on his click
 * even though they are another site's (sheet 87's click-trick rule would otherwise stop them).
 */
const SIGN_IN = /(^|\.)(accounts\.google\.com|appleid\.apple\.com|login\.microsoftonline\.com|login\.live\.com|github\.com|discord\.com|id\.twitch\.tv|facebook\.com|x\.com|twitter\.com|steamcommunity\.com|paypal\.com|accounts\.spotify\.com|auth0\.com|okta\.com)$/i;
/** Sheet 87, his pick: the secret window locks after 15 minutes without a key or a click in it. */
const SECRET_IDLE_MS = 15 * 60_000;
/** Sheet 87 v12, his pick: what the secret window shows while everything is put away (casual; its search stays Yandex). */
const SECRET_COVER = 'https://search.brave.com/';
/**
 * Sheet 87, his pick for a forgotten secret PIN: his Mac password, asked in the Mac's own box (Samara never sees it).
 * Yes only when the Mac says so.
 */
function macPassword(): Promise<boolean> {
  if (process.platform !== 'darwin') return Promise.resolve(false);
  return new Promise((res) => execFile('/usr/bin/osascript', ['-e', 'do shell script "true" with prompt "Samara wants to set a new PIN." with administrator privileges'],
    { timeout: 180_000 }, (e) => res(!e)));
}
/** His rule (2026-10-20): a page may start playing by itself only this soon after he asked for it (a slow redirect included). */
const PLAY_MS = 15_000;
/** The tab rail's slide in and out (his ask, 2026-10-20): the same time the rail's CSS uses. */
const TRAY_SLIDE_MS = 260;
/** The tab list's width at each size (sheet 71); browser.css draws the same widths. */
const TRAY_W = { s: 300, m: 320, l: 340 } as const;
/** A tab not looked at for this long, and not playing sound, goes to sleep. */
// 2 hours (his call, 2026-10-12: fewer reloads when going back to a tab). Was 30 minutes. This PC has 16 GB.
const SLEEP_AFTER_MS = 8 * 60 * 60_000;
/** A tab out of sight this long is frozen (Chromium's own freezing: no timers, no work, memory the system can reuse). */
const FREEZE_AFTER_MS = 5 * 60_000;
/** The page's main video (the biggest one) and where it is, or null: read before a tab freezes or sleeps. */
const VIDEO_AT_JS = `(() => { const v = [...document.querySelectorAll('video')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
  return v && Number.isFinite(v.duration) && v.duration > 0 && v.currentTime > 1 ? Math.floor(v.currentTime) : null; })()`;
/** On waking: the main video goes to his spot and stays paused until he presses play himself (his pick, 2026-10-23). */
// 2026-10-23 (filmed): YouTube sets its player up again after the first draw and starts from 0, so for 8 seconds, while
// it stays paused, it is put back at his spot each time it wanders off; his own press on play ends that at once.
const VIDEO_BACK_JS = (at: number) => `(async () => {
  const big = () => [...document.querySelectorAll('video')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
  let done = false;
  for (let i = 0; i < 160; i++) {
    const v = big();
    if (v && v.readyState >= 1 && v.paused && Math.abs(v.currentTime - ${at}) > 0.5) { v.currentTime = ${at}; done = true; }
    else if (v && !v.paused && navigator.userActivation && navigator.userActivation.isActive) return done;
    await new Promise((r) => setTimeout(r, i < 80 ? 50 : 100));
  }
  return done;
})()`;
/**
 * A woken page is settled: fully loaded, and its layout has held still for half a second (YouTube draws a small player,
 * then the sidebar, then moves everything). The old picture stays over it until then, so he never watches it rebuild.
 * At most 3.5 seconds after it first drew.
 */
const SETTLED_JS = `(async () => {
  const sig = () => { const v = [...document.querySelectorAll('video')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
    const r = v ? v.getBoundingClientRect() : null; const b = document.body;
    return [document.readyState, b ? b.scrollHeight : 0, b ? b.querySelectorAll('img,video,iframe').length : 0, r ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(',') : ''].join('|'); };
  const t0 = Date.now(); let last = sig(), since = Date.now();
  while (Date.now() - t0 < 3500) {
    await new Promise((r) => setTimeout(r, 100));
    const s = sig();
    if (s !== last) { last = s; since = Date.now(); continue; }
    if (document.readyState === 'complete' && Date.now() - since >= 500) return true;
  }
  return false;
})()`;
/** Never a tab he looked at in the last 10 minutes, even when memory is short. */
const SLEEP_MIN_MS = 10 * 60_000;
/**
 * Is the computer short on memory? On the Mac, its own pressure level (1 normal, 2 warning, 4 critical); on Windows,
 * under 12% of memory free. A failed read counts as fine.
 */
function memoryShort(): Promise<boolean> {
  if (process.platform === 'darwin') {
    return new Promise((res) => execFile('/usr/sbin/sysctl', ['-n', 'kern.memorystatus_vm_pressure_level'], { timeout: 2000 }, (e, out) => res(!e && Number(String(out).trim()) >= 2)));
  }
  return Promise.resolve(os.freemem() / os.totalmem() < 0.12);
}
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
/** Chromium's saved state for a page is kept only up to this size (a page full of form fields can be large). */
const PAGE_STATE_MAX = 64 * 1024;
/** Where the page is scrolled, and the colour it shows behind its content (the body's, else the page's, else white). */
const PAGE_LOOK_JS = `[window.scrollY, (() => { const c = (e) => e ? getComputedStyle(e).backgroundColor : ''; const clear = (x) => !x || x === 'transparent' || /rgba\\(.*,\\s*0\\)$/.test(x);
  const b = c(document.body); if (!clear(b)) return b; const h = c(document.documentElement); return clear(h) ? 'rgb(255, 255, 255)' : h; })()]`;
/** 'rgb(14, 14, 16)' as '#0e0e10'; anything else is not a colour we keep. */
function hexOf(c: unknown): string | undefined {
  const m = /^rgba?\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})/.exec(String(c));
  return m ? '#' + m.slice(1, 4).map((x) => Math.min(255, Number(x)).toString(16).padStart(2, '0')).join('') : undefined;
}
/** The soft fade between pages (his pick, option 5): fade length, when a slow site dims, when a page counts as instant. */
/**
 * A quick question to a page's own world, asked now even while it is still loading (2026-10-24, speed check): the
 * webContents form waits for the page to finish, so the password look every 1.5 s piled up on a page that keeps loading
 * (Twitch), each one a listener left waiting (the "11 did-stop-loading listeners" warning in the log).
 */
const askPage = <T>(wc: Electron.WebContents, code: string): Promise<T | null> => {
  try { const f = wc.mainFrame; if (!f || f.isDestroyed()) return Promise.resolve(null); return f.executeJavaScript(code) as Promise<T>; } catch { return Promise.resolve(null); }
};
const VEIL_FADE_MS = 250, VEIL_DIM_MS = 1500, VEIL_INSTANT_MS = 300, VEIL_MAX_MS = 8000;
/** A woken page's picture fades out a little slower: one soft change instead of a page rebuilding (2026-10-23). */
const WAKE_FADE_MS = 350;

/** Every call into a page, with a deadline: a crashed page never answers, and must never hang Aang. */
function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

/**
 * A picture for Aang (Send to Aang, 2026-10-21): at most 1200 px wide, as a PNG data URL, and dropped (null) when it
 * would still be over 1.5 MB. A huge picture is never sent.
 */
export function fitShot(img: Electron.NativeImage | null, maxW = SHOT_MAX_W, maxBytes = SHOT_MAX_BYTES): string | null {
  if (!img || img.isEmpty()) return null;
  const fit = img.getSize().width > maxW ? img.resize({ width: maxW, quality: 'good' }) : img;
  const url = 'data:image/png;base64,' + fit.toPNG().toString('base64');
  return url.length <= maxBytes ? url : null;
}

/** Sheet 37: a Claude session's plan, as shown to him. */
export interface PlanCard {
  id: string; task: string; steps: string[]; wont: string;
  /** local (2026-10-22): a page on this computer; the card does not list it. */
  sites: { site: string; login: boolean; favicon: string; local?: boolean }[];
  /** 2026-10-22: the session's folder name, for the card's kicker (CLAUDE · WAYMARK); '' when unknown. */
  from?: string;
}
/** His answer: go (with the sites he kept), change (with his note, Claude redoes the plan), or neither (not now). */
export interface PlanAnswer { go: boolean; change: boolean; keep: string[]; note: string; /** which card was answered */ card?: string }

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
    try { const shot = await this.shotOf(t); P.peekShot = shot ? { tab: t.id, url: t.url, at: Date.now(), shot } : null; if (shot) t.leftShot = shot; }
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
  /** Sheet 87: the secret window's own PIN (normal Samara has none). */
  private secretPin: PinSeal | null = null;
  /** Sheet 87: its tabs, bookmarks, history and logins are put away until its PIN. */
  private locked = false;
  /** Sheet 87: the PIN box is over the page. */
  private pinOpen = false;
  /** Sheet 87 v12: what the mask put away, as it was (every page asleep, each video's spot kept), until his PIN. */
  private away: { tabs: Tab[]; trails: Trail[]; active: number | null } | null = null;
  /** Sheet 87 v12: put away behind the cover: nothing done there is kept, not even in its history. */
  private get covered(): boolean { return this.locked && this.away !== null; }
  /** Sheet 87 v12: the Brave Search page shown while it is put away (dropped again at his PIN if he did not use it). */
  private coverId: number | null = null;
  /** Sheet 87: where the frame asked the list to open, kept while the PIN box is up. */
  private pinAt: { x?: unknown; y?: unknown } | undefined;
  /** Sheet 87: his Mac password said yes, so a new PIN may replace the forgotten one. */
  private pinReset = false;
  /** Sheet 87: the last key or click in the secret window (15 minutes without him locks it). */
  private lastInput = Date.now();
  /** Sheet 87: ⇧⌘N, from any of Samara's windows; main opens the secret window. */
  onSecret: (() => void) | null = null;
  /** Sheet 87: Settings from the secret window opens normal Samara's (the settings are shared). */
  onSettings: (() => void) | null = null;
  /** The session the tabs open in. The secret window's is its throwaway one while locked, its kept one once open. */
  private ses: Electron.Session;
  /** Sheet 87: the secret window's kept session (its logins), reached only after its PIN. */
  private readonly keptSes: Electron.Session | null = null;
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
  /**
   * His call (2026-10-14, code audit M3): sites the OTHER computer trusts (for programs, or opened without https)
   * travel here but do not count until he says yes once on this machine. A removal there still applies here.
   */
  /** Sheet 37: his per-site rules (Claude and Aang, his login, camera, mic). */
  rules!: SiteRules;
  private peerTrusted = new Set<string>();
  private peerHttp = new Set<string>();
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
  /** Sheet 69: the keyboards and mice each site may use, and the one device ask waiting for his pick. */
  private devices!: DeviceOk;
  private devAsk: { id: number; host: string; list: Electron.HIDDevice[]; done: (id?: string) => void; timer: NodeJS.Timeout; picked: string | null } | null = null;
  /** The little wood sounds (new tab, close, download done). Off until he turns them on in Settings. */
  sounds = false;
  /** The ⋯ menu's switches (sheet 3 section 10), kept between runs. Block ads and Block popups start on. */
  /**
   * Sheet 71 (his pick, 2026-10-22): the tab list's size, Small / Medium / Large (Large = the 2026-10-21 size). Each machine
   * its own (the Mac's small screen and the PC's big one), so it is kept apart from the prefs, which sync.
   */
  tabSize: 's' | 'm' | 'l' = 'l';
  private localFile = '';
  prefs = { ads: true, popups: true, home: DEFAULT_HOME, search: 'brave' as Engine, aiBox: false, startup: 'tabs' as 'tabs' | 'home', dark: true, darkOff: [] as string[], afSounds: true, lockAfter: '30m' };
  /** His home page, or his search engine's front page. Web pages only. */
  private get HOME(): string { return this.o.secret ? engineHome(this.engine) : isWeb(this.prefs.home) && this.prefs.home !== DEFAULT_HOME ? this.prefs.home : engineHome(); }
  /** Sheet 87 (his ask, 2026-10-25): the secret window searches with Yandex, and its new tabs start there; normal Samara keeps his pick. */
  private get engine(): Engine | undefined { return this.o.secret ? 'yandex' : undefined; }
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
  /** Hidden sites' cookies (privacy.ts): which pairs are let through, and the privacy log. */
  wall!: CookieWall;
  /** The browser hints' brand line, as this engine's pages read it (privacy.ts), once a page has told it. */
  private brands: string | null = null;
  /** A page's own name for the browser follows where it is going: honest on Google's sign-in, Chrome elsewhere. */
  private nameFor(wc: Electron.WebContents): void {
    // The real address never goes out around the page (2026-10-26): calls still work, but the Mac's home-network
    // address stays in, and later a VPN cannot be gone around (WebRTC IP handling, Brave's own default).
    try { wc.setWebRTCIPHandlingPolicy('default_public_interface_only'); } catch { /* an older runtime */ }
    // The brand line, read once from Samara's own world in a page (a page cannot change what that world sees).
    if (!this.brands) wc.once('dom-ready', () => {
      if (this.brands || !/^https:/.test(wc.getURL())) return;
      wc.executeJavaScriptInIsolatedWorld(999, [{ code: 'JSON.stringify((navigator.userAgentData && navigator.userAgentData.brands) || [])' }]).then((j: string) => {
        const list = JSON.parse(String(j)) as { brand: string; version: string }[];
        if (Array.isArray(list) && list.length && list.every((x) => typeof x.brand === 'string' && /^\d+$/.test(String(x.version)))) this.brands = list.map((x) => `"${x.brand.replace(/"/g, '')}";v="${x.version}"`).join(', ');
      }).catch(() => { /* the next page tells it */ });
    });
    wc.on('did-start-navigation', (d) => {
      const x = d as unknown as { url: string; isMainFrame: boolean; isSameDocument: boolean };
      if (!x.isMainFrame || x.isSameDocument) return;
      wc.setUserAgent(HONEST_SITES.test(x.url) ? this.honestUA : CHROME_UA(process.versions.chrome));
    });
  }
  /** 6.23: his logins from Bitwarden, filled when he clicks the key. */
  private readonly vault = new Vault();
  private readonly details: DetailsStore;
  private readonly pinSeal: PinSeal;
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
  /**
   * Sheet 37, the plan card: where a Claude session's plan is shown when Claude's own window is not in front. The PC sets
   * this to Aang's bubble; without it (the Mac until its own Aang exists) the plan drops from Samara's band.
   */
  onPlanAsk: ((card: PlanCard) => Promise<PlanAnswer | null>) | null = null;
  /** The live checklist: a planned session moved on to another step, or finished. */
  onPlanStep: ((card: string, at: number | null) => void) | null = null;
  /** Sheet 41: a Claude job's plan finished, card or not, so its row in the scroll-back can say done. */
  onPlanDone: ((jobId: number) => void) | null = null;
  /** Right-click "Send to Aang" (sheet 62): the words, a picture, a link or the page go to his typing box. Null while Aang
   *  is not running (then the item is not in the menu). What it carries is checked again by sendtoaang.ts cleanSent. */
  onSendToAang: ((s: Record<string, unknown>, picture?: Electron.NativeImage) => void) | null = null;
  /** Told when Samara's last window has closed (the pop-out holding one of its tabs goes with it, 2026-10-21). */
  onLastClosed: (() => void) | null = null;
  /** A video or song started in one of his tabs (the pop-out gets ready ahead, popoutipc.ts). */
  onPlaying: (() => void) | null = null;
  /** Right-click "Play in the pop-out" on a link. */
  onPlayInPopout: ((url: string) => void) | null = null;
  private popTab: ((id: number) => void) | null = null;
  /** Right-click "Pop out this video": the same as the pop-out key (popoutipc.ts). */
  setPopTab(fn: (id: number) => void): void { this.popTab = fn; }
  private planSeq = 0;
  private planWait = new Map<string, (a: PlanAnswer | null) => void>();
  /** Which card each planned job showed, for its live checklist. */
  private planOfJob = new Map<number, string>();
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
  /**
   * Sheet 47 (his picks, 2026-10-21): the mockups Claude opens. The versioned page server and the history file; both
   * null where there is no git repo (his Mac), and then the whole feature quietly stays off.
   */
  private mockServer: MockServer | null = null;
  private mockStore: MockStore | null = null;
  private mockRepo = '';
  private mockReady: Promise<number> = Promise.resolve(0);
  /** The history list inside the trail is open (in the drawer and the floating list alike). */
  private mockList = false;
  /** Things waiting for the window to finish opening (a mockup opened while Samara was closed). */
  private whenOpen: (() => void)[] = [];
  constructor(o: BrowserOptions) {
    this.o = o;
    this.ses = electronSession.fromPartition(o.secret ? 'aang-secret-guest' : 'persist:aang-browser');
    if (o.secret) {
      this.keptSes = electronSession.fromPartition('persist:aang-secret');
      this.secretPin = new PinSeal(path.join(o.stateDir, 'secret-pin.json'));
      // His picks: it locks when the Mac sleeps or locks, as well as when its window closes or he is away 15 minutes.
      powerMonitor.on('suspend', () => { void this.lock(); });
      powerMonitor.on('lock-screen', () => { void this.lock(); });
    }
    // Sheet 87: what the secret window shares with normal Samara (settings, autofill, site rules); the rest is its own.
    const sd = o.sharedDir ?? o.stateDir;
    if (!o.secret) {
      const repo = findRepo(o.repoDir ?? path.join(import.meta.dirname, '..', '..', '..'));
      if (repo || o.mockupsAnywhere) {
        this.mockRepo = repo ?? '';
        // 2026-10-22: pages from another session's repo are served too, found by the name kept in mockups.json.
        this.mockServer = new MockServer(repo ?? '', (n) =>this.mockStore?.repoPath(n) ?? null);
        this.mockStore = new MockStore(path.join(o.stateDir, 'mockups.json'));
        this.mockReady = this.mockServer.start();
        // The tidy (2026-10-22): at most once a day, a while after start, plain code only (no quota, no Qwen).
        setTimeout(() => { void this.mockTidy(false); }, 30_000).unref?.();
      }
    }
    this.file = path.join(o.stateDir, 'browser-tabs.json');
    this.pausedFile = path.join(sd, 'adblock-paused.json');
    this.devices = new DeviceOk(path.join(sd, 'device-ok.json'));
    this.prefsFile = path.join(sd, 'browser-prefs.json');
    this.localFile = path.join(o.stateDir, 'browser-local.json');
    try { const l = JSON.parse(readFileSync(this.localFile, 'utf8')); if (l?.tabSize === 's' || l?.tabSize === 'm') this.tabSize = l.tabSize; } catch { /* Large */ }
    this.placeFile = path.join(o.stateDir, 'browser-window.json');
    // Plugging the monitor in or out: Samara goes back to where it was the last time this setup was in use.
    const setupChanged = () => setTimeout(() => this.backToSetupSpot(), 700);
    screen.on('display-added', setupChanged); screen.on('display-removed', setupChanged);
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
    this.sitesFile = path.join(sd, 'vault-sites.json');
    // Autofill (sheet 77): his details and his PIN's seal, both kept with the Keychain.
    this.details = new DetailsStore(path.join(sd, 'autofill-details.json'));
    this.pinSeal = new PinSeal(path.join(sd, 'autofill-pin.json'));
    this.vault.keepSealed = () => this.pinSeal.has();
    this.vault.setLockAfter(LOCK_AFTER[this.prefs.lockAfter]);
    try { if (existsSync(this.popupOkFile)) this.popupOk = new Set((JSON.parse(readFileSync(this.popupOkFile, 'utf8')) as unknown[]).filter((x): x is string => typeof x === 'string')); } catch { /* none */ }
    try {
      if (existsSync(this.sitesFile)) {
        const v = JSON.parse(readFileSync(this.sitesFile, 'utf8'));
        const key = typeof v?.keyLocked === 'string' ? unlockKey(v.keyLocked) : typeof v?.key === 'string' ? v.key : '';
        if (key && Array.isArray(v.sites)) { this.siteKey = key; this.sites = new Set(v.sites.filter((x: unknown) => typeof x === 'string')); }
        // An older file kept the key in plain text beside the list: lock it now (Windows), the list stays the same.
        if (typeof v?.key === 'string' && key) { const locked = lockKey(key); if (locked) writeFileAtomic(this.sitesFile, JSON.stringify({ keyLocked: locked, sites: [...(this.sites ?? [])] })); }
      }
    } catch { /* none yet */ }
    // Chromium's own name, for the sign-in pages that need it (arm() gives everything else plain Chrome's).
    this.honestUA = this.ses.getUserAgent();
    try {
      if (existsSync(this.marksFile)) {
        const a = JSON.parse(readFileSync(this.marksFile, 'utf8'));
        if (Array.isArray(a)) this.marks = a.filter((m: Partial<Mark>) => typeof m?.url === 'string' && isWeb(m.url) && typeof m.title === 'string')
          .map((m: Mark) => ({ title: m.title.slice(0, 200), url: m.url, folder: String(m.folder ?? '').slice(0, 80) })).slice(0, 5000);
      }
    } catch { /* none yet */ }
    // Sheet 89 (his ask): Stremio on normal Samara's shelf, once, where its app is installed (he can take it off for good).
    if (!o.secret && existsSync(STREMIO_APP)) {
      const mark = path.join(o.stateDir, 'stremio-shelf.json');
      if (!existsSync(mark)) {
        if (!this.marks.some((m) => STREMIO_WEB.test(m.url))) { this.marks.unshift({ title: 'Stremio', url: 'https://web.stremio.com/', folder: '' }); setTimeout(() => this.saveMarks(), 0); }
        try { writeFileAtomic(mark, JSON.stringify({ at: new Date().toISOString() })); } catch { /* tries again next start */ }
      }
      // its own icon, the large one from its site, not the tiny favicon
      if (!this.icons.has('web.stremio.com')) setTimeout(() => { void this.keepIcon('web.stremio.com', ['https://web.stremio.com/images/icon_196x196.png']); }, 4000);
    }
    this.httpOkFile = path.join(sd, 'browser-http-ok.json');
    this.trustedFile = path.join(sd, 'download-trusted.json');
    this.visits = new Visits(path.join(o.stateDir, 'browser-history.json'));
    this.rules = new SiteRules(path.join(sd, 'site-rules.json'), () => { this.sync?.changed('prefs'); this.sendTabs(); this.pushSettings(); });
    this.driver = new Driver({ ses: this.ses, preload: o.tabPreloadPath, listed: (u) => this.listed(u), changed: () => this.sendTabs(), stopped: (j) => this.onDriverStop?.(j), testLocal: o.testLocal === true, stateDir: o.stateDir,
      rules: { ai: (u) => this.rules.ai(u), login: (u) => this.rules.login(u) } });
    this.dls = new Downloads(path.join(o.stateDir, 'browser-downloads.json'));
    const loadSet = (f: string) => { try { if (existsSync(f)) { const a = JSON.parse(readFileSync(f, 'utf8')); if (Array.isArray(a)) return new Set(a.filter((x: unknown) => typeof x === 'string')); } } catch { /* none */ } return new Set<string>(); };
    this.httpOk = loadSet(this.httpOkFile);
    this.trusted = loadSet(this.trustedFile);
    this.peerTrusted = loadSet(this.trustedFile.replace(/\.json$/, '-other.json'));
    this.peerHttp = loadSet(this.httpOkFile.replace(/\.json$/, '-other.json'));
    try {
      if (existsSync(this.prefsFile)) {
        const p = JSON.parse(readFileSync(this.prefsFile, 'utf8'));
        this.sounds = p?.sounds === true;
        this.prefs = { ads: p?.ads !== false, popups: p?.popups !== false, home: typeof p?.home === 'string' && isWeb(p.home) ? p.home.slice(0, 2000) : DEFAULT_HOME,
          search: ['ddg', 'google', 'yandex'].includes(p?.search) ? p.search : 'brave', aiBox: p?.aiBox === true, startup: p?.startup === 'home' ? 'home' : 'tabs',
          dark: p?.dark !== false, darkOff: hostList(p?.darkOff), afSounds: p?.afSounds !== false, lockAfter: lockPick(p?.lockAfter) };
      }
    } catch { /* defaults */ }
    // Sheet 87: the secret window blocks pop-ups and ads hard, always, whatever normal Samara's switches say.
    if (o.secret) { this.prefs.ads = true; this.prefs.popups = true; }
    this.colorScheme();
    this.phish = o.phish ?? new PhishCheck(sd);
    if (!o.phish) void this.phish.start();
    try { if (existsSync(this.pausedFile)) this.paused = new Set(JSON.parse(readFileSync(this.pausedFile, 'utf8'))); } catch { /* none paused */ }
    this.wall = new CookieWall(sd);
    this.arm();
    // Sheet 87: the secret window's kept session gets everything the throwaway one has.
    if (this.keptSes) { const guest = this.ses; this.ses = this.keptSes; this.arm(); this.ses = guest; }
    this.callFile = path.join(o.stateDir, 'in-call.json');
    try { unlinkSync(this.callFile); } catch { /* none left over */ }
  }

  /** Everything a browsing session needs: plain Chrome's name, the asks, downloads, logins kept, the guards and the ad
   *  lists. Normal Samara has one session; the secret window two (sheet 87), each armed the same. */
  private arm(): void {
    const ses = this.ses;
    // Plain Chrome, everywhere in his browsing session, except Google's sign-in pages (above).
    ses.setUserAgent(CHROME_UA(process.versions.chrome));
    // His data kept his (2026-10-26, privacy.ts): the honest name where it is needed, "do not sell my data" on every
    // request, hidden sites' cookies left off, tracking tags taken off links.
    guardPrivacy(ses, this.wall, (u) => HONEST_REQUESTS.test(u) ? this.honestUA : null, () => this.brands);
    privacyHooks(ses, { clean: cleanLink, headers: cookieHeaders(this.wall) });
    denyPermissions(ses);
    this.permissions();
    this.screenShare();
    this.hid();
    this.spelling();
    this.downloads();
    // Stay signed in (his report, 2026-10-13: Reddit logged him out). Chromium keeps new and changed cookies in
    // memory and writes them to disk in batches, so a hard stop of the Shell throws away whatever had not been
    // written yet - and a login cookie is exactly the kind that changes quietly. Nothing in Aang ever deletes a
    // cookie; they were simply lost. So every change is written within two seconds, and once more on the way out.
    let cookieWrite: NodeJS.Timeout | null = null;
    ses.cookies.on('changed', (_e, cookie, cause, removed) => {
      // M6: a login changed here; the other machine's browser gets it. Removals only when something removed it on
      // purpose (a sign-out, a site clearing it): an expired cookie expires on its own on the other machine too.
      if (!removed || cause === 'explicit') this.sync?.cookie(cookie as SyncCookie, removed);
      if (cookieWrite) clearTimeout(cookieWrite);
      cookieWrite = setTimeout(() => { cookieWrite = null; ses.cookies.flushStore().catch(() => { /* next change tries again */ }); }, 2000);
    });
    // A web page never reaches this computer or the home network (2026-10-14): on before the ad lists load.
    guardRequests(ses, netGuard, null);
    // His paused sites and the call sites go in with the lists, built into the kept engine (speed check 2026-10-24).
    // Ghostery can hide the empty ad boxes for only ONE session in the app (ads.ts): normal Samara's. The secret window's
    // two block every ad request all the same (sheet 87, found by secret-check: they had no ad blocking at all).
    void blockAds(ses, this.o.sharedDir ?? this.o.stateDir, { cosmetic: !this.o.secret, guard: netGuard, paused: [...this.paused, ...CALL_SITES] }).then((b) => {
      if (this.keptSes && ses !== this.keptSes) return;     // the secret window's throwaway session keeps its own, always on
      this.ads = b; if (b && !this.prefs.ads) b.stop();
    });
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
      // His rule for this site (sheet 37): Block never asks, Allow never asks; Ask is the old way, once per call.
      const said = types.map((x) => this.rules.media(host, x === 'video' ? 'camera' : 'mic'));
      if (said.includes('block')) { done(false); return; }
      if (said.every((x) => x === 'allow')) { const s = this.mediaOk.get(host) ?? new Set<string>(); for (const x of types) s.add(x); this.mediaOk.set(host, s); done(true); this.sendTabs(); return; }
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
      // Sheet 69: a site may ask for a keyboard or mouse (the ask below is the real gate); never Claude's tabs, never http.
      if (permission === 'hid') return Boolean(wc && !this.driver?.owns(wc) && /^https:\/\//.test(origin));
      if ((permission !== 'media' && permission !== 'speaker-selection') || (wc && this.driver?.owns(wc))) return false;
      const t0 = (details as { mediaType?: string }).mediaType;
      if (permission === 'media' && (t0 === 'audio' || t0 === 'video')) { const r = this.rules.media(hostOf(origin), t0 === 'video' ? 'camera' : 'mic'); if (r === 'block') return false; if (r === 'allow') return true; }
      const ok = this.mediaOk.get(hostOf(origin));
      if (!ok) return false;
      // Picking which speakers the call plays through comes with the microphone, as in Chrome.
      if (permission === 'speaker-selection') return ok.has('audio');
      const t = (details as { mediaType?: string }).mediaType;
      return t === 'audio' || t === 'video' ? ok.has(t) : ok.size > 0;
    });
  }

  /**
   * Sheet 69 (his picks, 2026-10-22): a site that asks for a keyboard or mouse (WebHID: Epomaker's lighting page) gets a
   * parchment ask hanging from the band, listing only the devices the site asked for; he picks one and it is remembered
   * for that site, so next time it connects with no ask. Forget in the shield takes it back. Claude's tabs never get one.
   */
  private hid(): void {
    this.ses.setDevicePermissionHandler((d) => d.deviceType === 'hid' && this.devices.allowed(hostOf(d.origin), d.device as Electron.HIDDevice));
    this.ses.on('select-hid-device', (event, details, done) => {
      event.preventDefault();
      const frame = details.frame;
      const wc = frame ? allWebContents.fromFrame(frame) : undefined;
      const origin = frame?.origin ?? '';
      const host = hostOf(origin);
      if (!wc || this.driver?.owns(wc) || !/^https:\/\//.test(origin) || !host || !this.win || this.win.isDestroyed()) { done(); return; }
      // No ask only when the one he allowed is the only match (2026-10-22, his TH99 PRO: with the dongle allowed and the
      // keyboard's cable plugged in too, the dongle was taken without asking and the cable keyboard never offered).
      const known = details.deviceList.find((d) => this.devices.allowed(host, d));
      if (known && details.deviceList.length === 1) { done(known.deviceId); return; }
      if (this.devAsk) { done(); return; }                       // one ask at a time
      this.inWc(wc);
      const id = ++this.askSeq;
      const timer = setTimeout(() => this.devAnswer(id, null), 120_000);
      this.devAsk = { id, host, list: [...details.deviceList], done, timer, picked: known?.deviceId ?? null };
      this.sendDevAsk();
    });
    // Plugged in or out while the ask is up: the list follows.
    this.ses.on('hid-device-added', (_e, d) => { if (this.devAsk && !this.devAsk.list.some((x) => x.deviceId === d.device.deviceId)) { this.devAsk.list.push(d.device); this.sendDevAsk(); } });
    this.ses.on('hid-device-removed', (_e, d) => { if (this.devAsk) { this.devAsk.list = this.devAsk.list.filter((x) => x.deviceId !== d.device.deviceId); this.sendDevAsk(); } });
  }
  private sendDevAsk(): void {
    const a = this.devAsk;
    if (!a || !this.win || this.win.isDestroyed()) return;
    // How it is connected, from its own name (a wireless one calls itself a receiver or dongle); a cable otherwise.
    const how = (d: Electron.HIDDevice) => (/2\.4g|dongle|receiver|wireless/i.test(d.name) ? 'Wireless dongle' : 'Plugged in by cable');
    this.win.webContents.send('browser:devask', { id: a.id, host: a.host, picked: a.picked, devices: a.list.map((d) => ({ id: d.deviceId, name: deviceName(d), how: how(d) })) });
  }
  /** His pick from the device ask: one of the devices it listed, or none. */
  devAnswer(id: number, deviceId: string | null): void {
    const a = this.devAsk;
    if (!a || a.id !== id) return;
    this.devAsk = null;
    clearTimeout(a.timer);
    this.win?.webContents.send('browser:devask', { id, gone: true });
    const d = deviceId ? a.list.find((x) => x.deviceId === deviceId) : undefined;
    if (d) { this.devices.add(a.host, d); this.sendTabs(); }
    a.done(d?.deviceId);
  }
  /** Forget in the shield: this site asks again next time. */
  forgetDevice(key: string): void {
    const t = this.tabs.find((x) => x.id === this.active);
    const host = hostOf(t?.url ?? '');
    if (!host || !this.devices.list(host).some((x) => x.key === key)) return;
    this.devices.forget(host, key);
    this.sendTabs();
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
  private update: UpdateCard | null = null;
  setUpdate(u: UpdateCard | null): void { this.update = u; this.sendTabs(); }
  /** After an update put in overnight: what it did, shown once by the ... key (sheet 35). */
  private updated: { title: string; lines: string[] } | null = null;
  setUpdated(d: { title: string; lines: string[] } | null): void { this.updated = d; this.sendTabs(); }
  /** Why Restart now did not go ahead, in the update tray. */
  updateWhy(why: string): void { for (const p of this.panes) if (this.alive(p)) p.win!.webContents.send('browser:updatewhy', why); }
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
        // Where the file itself came from too (security check 2026-10-24, finding 8): an ad or a redirect on a site he
        // trusts could hand him a program from anywhere. A file from another site than the page asks, unless he trusts it.
        let fileSite = '';
        try { fileSite = new URL(item.getURLChain?.().slice(-1)[0] || from).hostname.replace(/^www\./, ''); } catch { /* unknown */ }
        const sameSite = (a: string, b: string) => a === b || a.endsWith('.' + b) || b.endsWith('.' + a);
        const fileOk = !fileSite || sameSite(fileSite, site) || this.trusted.has(fileSite);
        if (!site || !this.trusted.has(site) || !fileOk) {
          item.pause();
          const other = this.peerTrusted.has(site);
          const text = this.trusted.has(site) && !fileOk ? `It is a program, and it comes from ${fileSite}, not ${site}. Only say yes if you meant to get it.`
            : other ? `It is a program. Your other computer trusts ${site}, but this one hasn't yet. Only say yes if you meant to get it.`
            : `It is a program, and ${site || 'this site'} has not given you one before. Only say yes if you meant to get it.`;
          this.ask({ host: site, what: `Download ${base}?`, text, yes: 'Download, trust this site', no: 'No' }, (allow) => {
            if (item.getState() !== 'progressing') return;
            if (!allow) { item.cancel(); return; }
            if (site) {
              this.trusted.add(site); this.peerTrusted.delete(site);
              if (fileSite && !sameSite(fileSite, site)) { this.trusted.add(fileSite); this.peerTrusted.delete(fileSite); }
              try { writeFileAtomic(this.trustedFile, JSON.stringify([...this.trusted])); writeFileAtomic(this.trustedFile.replace(/\.json$/, '-other.json'), JSON.stringify([...this.peerTrusted])); } catch { /* best effort */ }
              this.sync?.changed('prefs');
            }
            item.resume();
          });
        }
      }
      item.once('done', (_ev, state) => {
        if (state === 'completed') {
          // Marked "from the internet", so the system checks it before it runs: Windows' zone mark, or on the Mac
          // Apple's quarantine flag (Gatekeeper asks before opening it), the way Safari marks downloads (2026-10-14).
          if (process.platform === 'darwin') execFile('/usr/bin/xattr', ['-w', 'com.apple.quarantine', `0081;${Math.floor(Date.now() / 1000).toString(16)};Samara;`, to], (e) => { if (e) console.error('shell: could not mark the download for Gatekeeper: ' + e.message); });
          else try { writeFileSync(to + ':Zone.Identifier', `[ZoneTransfer]\r\nZoneId=3\r\nHostUrl=${isWeb(from) ? from : 'about:internet'}\r\n`); }
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
  /**
   * His rule (2026-10-14): his bank never opens in Samara. Chrome gets safety fixes weeks sooner, so a bank or money
   * site gets a plate with one big "Open in Chrome" button instead of the page. Same stops as the fake-site lists.
   */
  private stopFor(u: string): string[] { return isWeb(u) && bankSite(u) ? [BANK] : this.listed(u); }
  /** His bank, handed to Chrome (Safari on the Mac, Edge on Windows, if Chrome is not there). Web addresses only. */
  private toChrome(u: string): void {
    let url = '';
    try { const x = new URL(u); if (x.protocol !== 'https:' && x.protocol !== 'http:') return; url = x.href; } catch { return; }
    const fail = (e: Error | null) => { if (e) this.note("Chrome didn't open. Open your bank there yourself."); };
    if (process.platform === 'darwin') { execFile('open', ['-a', 'Google Chrome', url], (e) => { if (e) execFile('open', ['-a', 'Safari', url], fail); }); return; }
    const local = process.env.LOCALAPPDATA ?? '', pf = process.env.ProgramFiles ?? 'C:\\Program Files', pf86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
    const chrome = [path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe')].find((f) => existsSync(f));
    const edge = [path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe')].find((f) => existsSync(f));
    const exe = chrome ?? edge;
    if (!exe) { fail(new Error('none')); return; }
    execFile(exe, [url], fail);
  }
  /** Stop a tab at a listed address: nothing loads, the frame shows the red plate instead. */
  private block(tab: Tab, url: string, lists: string[]): void {
    const like = lists.find((l) => l.startsWith(LOOKS_LIKE));
    tab.blocked = { url, lists, ...(like ? { real: like.slice(LOOKS_LIKE.length).toLowerCase() } : {}), ...(lists[0] === BANK ? { bank: true } : {}) };
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
  /** Sheet 37: one site's rules as the shield shows them. Login shows on for the job sites unless he turned it off. */
  siteState(u: string): { host: string; ai: boolean; login: boolean; camera: Tri; mic: Tri; popupBlock: boolean; devices: KnownDevice[] } | null {
    const host = siteKey(u);
    if (!host || !isWeb(u)) return null;
    const lr = this.rules.login(host);
    return { host, ai: this.rules.ai(host), login: lr ?? JOB_SITES.includes(siteOf(host)), camera: this.rules.media(host, 'camera'), mic: this.rules.media(host, 'mic'),
      popupBlock: this.prefs.popups && !this.popOk(host), devices: this.devices.list(hostOf(u)) };
  }
  /** A rule changed from the shield (the site he is on) or from Settings (any site in the list). */
  setSiteRule(key: string, value: unknown, site?: string): void {
    const host = site ? siteKey(site) : siteKey(this.cur()?.url ?? '');
    if (!host) return;
    // On the site he is on, ads and dark mode go through their own switches, which also redo the open page.
    if (!site && key === 'ads') { this.pauseAds(value !== true); return; }
    if (!site && key === 'dark') { this.setDarkHere(value === true); return; }
    if (key === 'ai' || key === 'login') this.rules.set(host, { [key]: value === true });
    else if ((key === 'camera' || key === 'mic') && (value === 'allow' || value === 'ask' || value === 'block')) this.rules.set(host, { [key]: value });
    else if (key === 'popups') {
      if (value === true) this.popupOk.delete(host); else this.popupOk.add(host);
      try { writeFileAtomic(this.popupOkFile, JSON.stringify([...this.popupOk])); } catch { /* best effort */ }
      this.sync?.changed('prefs'); this.sendTabs(); this.pushSettings();
    } else if (key === 'ads') {
      if (value === true) this.paused.delete(host); else this.paused.add(host);
      this.ads?.pause(host, value !== true);
      try { writeFileAtomic(this.pausedFile, JSON.stringify([...this.paused])); } catch { /* best effort */ }
      this.sync?.changed('prefs'); this.sendTabs(); this.pushSettings();
    } else if (key === 'dark') {
      const off = new Set(this.prefs.darkOff);
      if (value === true) off.delete(host); else off.add(host);
      this.prefs.darkOff = [...off].slice(-2000); this.savePrefs(); this.sendTabs(); this.pushSettings();
      this.sync?.changed('prefs');
    }
  }
  /** Forget every rule he set for one site (the x in Your sites): back to how every site starts. */
  /**
   * Clear everything one site keeps in Samara on this machine: its cookies, storage, cache and service workers (his ask,
   * 2026-10-20: Disney+ was stuck on "not available in your region" from a half-copied sign-in). He is signed out of it
   * here; nothing else is touched. Only ever with his OK (the Claude door asks him every time).
   */
  async forgetSite(site: string): Promise<{ site: string; cookies: number; tabs: number }> {
    const root = siteKey(site).replace(/^www\./, '');
    if (!root || !root.includes('.')) throw new Error('say which site, e.g. disneyplus.com');
    // Where a service signs in on another of its own domains, that one goes too.
    const PARTNERS: Record<string, string[]> = { 'disneyplus.com': ['disney.com', 'bamgrid.com'], 'crave.ca': ['bellmedia.ca'], 'primevideo.com': ['amazon.com', 'amazon.ca'] };
    const roots = [root, ...(PARTNERS[root] ?? [])];
    const under = (h: string) => roots.some((r) => h === r || h.endsWith('.' + r));
    let cookies = 0;
    for (const r of roots) {
      for (const c of await this.ses.cookies.get({ domain: r }).catch(() => [] as Electron.Cookie[])) {
        const d = String(c.domain ?? '').replace(/^\./, '');
        await this.ses.cookies.remove(`http${c.secure ? 's' : ''}://${d}${c.path || '/'}`, c.name).catch(() => {});
        cookies++;
      }
    }
    const origins = new Set<string>();
    for (const r of roots) for (const h of [r, 'www.' + r, 'login.' + r]) origins.add('https://' + h);
    for (const t of this.tabs) { try { const u = new URL(t.url); if (under(u.hostname)) origins.add(u.origin); } catch { /* not an address */ } }
    await this.ses.clearData({ origins: [...origins], dataTypes: ['cookies', 'localStorage', 'indexedDB', 'serviceWorkers', 'cache', 'fileSystems'] }).catch((e: Error) => console.error('shell: browser: clearing a site: ' + e.message));
    await this.ses.cookies.flushStore().catch(() => {});
    let tabs = 0;
    for (const t of this.tabs) { try { if (t.view && under(new URL(t.url).hostname)) { t.view.webContents.reload(); tabs++; } } catch { /* gone */ } }
    console.log(`shell: browser: cleared ${root} (${cookies} cookies, ${tabs} tabs reloaded)`);
    return { site: root, cookies, tabs };
  }
  clearSite(site: string): void {
    const host = siteKey(site);
    if (!host) return;
    this.rules.clear(host);
    this.popupOk.delete(host); this.paused.delete(host); this.ads?.pause(host, false);
    this.prefs.darkOff = this.prefs.darkOff.filter((h) => h !== host);
    try { writeFileAtomic(this.popupOkFile, JSON.stringify([...this.popupOk])); writeFileAtomic(this.pausedFile, JSON.stringify([...this.paused])); } catch { /* best effort */ }
    this.savePrefs(); this.sync?.changed('prefs'); this.sendTabs(); this.pushSettings();
  }
  /** Every site he set anything for, with all its rules, for Settings > Your sites. */
  private yourSites(): { host: string; favicon: string; ai: boolean; login: boolean; ads: boolean; popups: boolean; dark: boolean; camera: Tri; mic: Tri; bank: boolean }[] {
    const hosts = new Set<string>([...Object.keys(this.rules.all()), ...this.paused, ...this.popupOk, ...this.prefs.darkOff].map((h) => siteKey(h)).filter(Boolean));
    return [...hosts].sort().slice(0, 500).map((host) => {
      const u = 'https://' + host + '/', st = this.siteState(u)!;
      return { host, favicon: this.iconOf(u), ai: st.ai, login: st.login, ads: !this.paused.has(host), popups: st.popupBlock, dark: this.darkWanted(u), camera: st.camera, mic: st.mic, bank: bankSite(u) };
    });
  }
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
    this.rules.takeFromPeer(L.siteRules);
    if (Array.isArray(L.popupOk)) { this.popupOk = new Set(hostList(L.popupOk)); put(this.popupOkFile, this.popupOk); }
    // A site the other computer added waits for his yes here; one it took off comes off here too.
    const meet = (incoming: unknown[], mine: Set<string>, other: Set<string>, file: string) => {
      const inc = new Set(hostList(incoming));
      for (const h of [...mine]) if (!inc.has(h)) mine.delete(h);
      for (const h of [...other]) if (!inc.has(h) || mine.has(h)) other.delete(h);
      for (const h of inc) if (!mine.has(h)) other.add(h);
      put(file, mine); put(file.replace(/\.json$/, '-other.json'), other);
    };
    if (Array.isArray(L.trusted)) meet(L.trusted, this.trusted, this.peerTrusted, this.trustedFile);
    if (Array.isArray(L.httpOk)) meet(L.httpOk, this.httpOk, this.peerHttp, this.httpOkFile);
    if (Array.isArray(L.adsPaused)) {
      const next = new Set(hostList(L.adsPaused));
      this.ads?.pauseMany([...this.paused].filter((h) => !next.has(h)), false);
      this.ads?.pauseMany([...next].filter((h) => !this.paused.has(h)), true);
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
    const steps = on ? [{ code: `if(!globalThis.DarkReader){${src}\n};true` }, { code: `${ALREADY_DARK}if(!DarkReader.isEnabled()&&!__aangAlreadyDark()){DarkReader.enable(${DARK_THEME});__aangWatchDark();}true` }] : [{ code: 'globalThis.DarkReader&&DarkReader.disable();true' }];
    void wc.executeJavaScriptInIsolatedWorld(DARK_WORLD, steps).catch(() => { /* the page went away */ });
  }
  private paintDarkAll(): void { for (const t of this.tabs) this.paintDark(t); }
  /**
   * With dark mode on, every site is told he prefers dark (prefers-color-scheme), so the many that have a dark look of
   * their own (YouTube, Reddit, Twitch, LinkedIn...) draw it themselves, at no cost; Dark Reader then finds them already
   * dark and leaves them be. Aang's own pages never follow this setting, so only websites change.
   */
  private colorScheme(): void { try { nativeTheme.themeSource = this.prefs.dark ? 'dark' : 'system'; } catch { /* not here */ } }
  /**
   * Dark mode from the page's first moment (his report, 2026-10-20: Gmail and LinkedIn stayed white for a long while).
   * dom-ready comes late on heavy sites, so the tab's own script asks here as the page starts, and runs Dark Reader in its
   * world straight away, the way the extension does at document start. Null: no dark mode on this page.
   */
  darkAtStart(wc: Electron.WebContents, url: string): { src: string; theme: string; test: string } | null {
    const t = this.tabs.find((x) => x.view?.webContents === wc);
    if (!t || t.internal || !this.darkWanted(url)) return null;
    const src = darkSource();
    return src ? { src, theme: DARK_THEME, test: ALREADY_DARK } : null;
  }
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

  /** Sheet 87: the link he last clicked in each tab (the page's own message, his clicks only), and when. */
  private lastLink = new Map<number, { url: string; at: number }>();
  linkClicked(sender: Electron.WebContents, href: string): void {
    const t = this.tabs.find((x) => x.view?.webContents === sender);
    if (!t) return;
    try { this.lastLink.set(t.id, { url: new URL(href).href, at: Date.now() }); } catch { /* not an address */ }
  }
  /**
   * Sheet 87 (his anime sites, every window): a new tab or window a page opens on his click is his only when it is the
   * link he clicked, the site's own page, or a sign-in page. An ad that a page opens on any click is none of those.
   */
  private fairOpen(tab: Tab, pageUrl: string, u: string): boolean {
    const l = this.lastLink.get(tab.id);
    try { if (l && Date.now() - l.at < GESTURE_MS && new URL(u).href === l.url) return true; } catch { return false; }
    try {
      const to = new URL(u).hostname, from = new URL(pageUrl).hostname;
      return siteOf(to) === siteOf(from) || SIGN_IN.test(to);
    } catch { return false; }
  }
  /** A site he let open pop-ups. Never in the secret window (sheet 87: strict there, always). */
  private popOk(site: string): boolean { return !this.o.secret && this.popupOk.has(site); }

  private savePrefs(): void {
    if (this.o.secret) return;               // sheet 87: the secret window reads normal Samara's settings, never writes them
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
    if (this.o.secret) return;                 // sheet 87: always strict there, and its switches are normal Samara's
    if (key === 'ads') {
      this.prefs.ads = on;
      if (on) this.ads?.start(); else this.ads?.stop();
      this.cur()?.view?.webContents.reload();
    } else if (key === 'popups') this.prefs.popups = on;
    else if (key === 'dark') { this.prefs.dark = on; this.colorScheme(); this.paintDarkAll(); }
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
    // Never slowed while hidden: its slide must start the moment it shows (his ask, 2026-10-20). It does nothing at rest.
    const v = new WebContentsView({ webPreferences: { ...SAFE_WEB_PREFERENCES, preload: this.o.preloadPath, backgroundThrottling: false } });
    lockDown(v.webContents);
    v.setBackgroundColor('#00000000');
    v.setVisible(false);
    const P = this.pane;
    // Opened before its page had loaded (his first hover right after start): slide out once it has.
    v.webContents.on('did-finish-load', () => { this.pane = P; this.sendTabs(); v.webContents.send('browser:tray', { size: this.tabSize }); if (P.trayOn) v.webContents.send('browser:tray', { open: true, hy: P.trayAt.hy, size: this.tabSize }); else this.warmTray(P, v); });
    v.webContents.on('before-input-event', (e, input) => { this.pane = P; if (this.key(input)) e.preventDefault(); });
    void v.webContents.loadURL(`${this.o.origin}/browser.html?tray=1`);
    this.trayV = v;
    return v;
  }
  /**
   * Drawn once, out of sight, before he first opens it (2026-10-22, measured on his Mac: the very first open stalled the
   * screen 130-400 ms while the graphics card drew the list's layer for the first time; every later open was smooth).
   * The layer is shown for a moment at almost no opacity with the list out, then put away. Only while his mouse is
   * not where it lies, so it never takes a click meant for the page.
   */
  private warmTray(P: Pane, v: WebContentsView, tries = 0): void {
    const w = P.win;
    if (P.trayOn || !w || w.isDestroyed() || v.webContents.isDestroyed() || tries > 10) return;
    const [cw, ch] = w.getContentSize(), wb = w.getContentBounds(), at = P.trayAt;
    const box = { x: at.x, y: at.y, width: Math.max(0, Math.min(TRAY_W[this.tabSize], cw - at.x)), height: Math.max(0, ch - at.y) };
    const m = screen.getCursorScreenPoint();
    if (m.x >= wb.x + box.x && m.x < wb.x + box.x + box.width && m.y >= wb.y + box.y && m.y < wb.y + box.y + box.height) { setTimeout(() => this.warmTray(P, v, tries + 1), 2000); return; }
    v.setBounds(box);
    w.contentView.addChildView(v);
    v.setVisible(true);
    v.webContents.send('browser:tray', { warm: true });
    setTimeout(() => { if (!P.trayOn && !v.webContents.isDestroyed()) v.setVisible(false); }, 300);
  }

  /** Tabs opened from links since he last opened the list (the tab arrow's +1). */
  private newSince = 0;
  /** Open the list where the frame says (beside its handle, under the band), or put it away. */
  tray(open: boolean, at?: { x?: unknown; y?: unknown }): void {
    const w = this.win;
    if (!w || w.isDestroyed()) return;
    this.lastInput = Date.now();
    // Sheet 87 (his "I should go to open my tabs and get prompted on screen for my pin"): locked, the list asks first.
    if (open && this.locked) { this.pinAt = at; this.pinAsk(); return; }
    if (!open) {
      // The rail slides back in with its handle (his ask, 2026-10-20), then goes; the band's own handle shows again
      // only once the rail's copy is back on top of it, so there is never a second arrow.
      const v = this.trayV && !this.trayV.webContents.isDestroyed() ? this.trayV : null;
      if (!this.trayOn) { v?.setVisible(false); return; }
      this.trayOn = false;
      v?.webContents.send('browser:tray', { open: false });
      setTimeout(() => {
        if (this.trayOn || w.isDestroyed()) return;
        v?.setVisible(false);
        w.webContents.send('browser:tray', { open: false }); w.webContents.focus();
      }, TRAY_SLIDE_MS + 20);
      return;
    }
    const v = this.trayView();
    if (!v) return;
    this.newSince = 0;
    const n = (x: unknown, d: number) => (Number.isFinite(Number(x)) ? Math.max(0, Math.round(Number(x))) : d);
    this.trayAt = { x: n(at?.x, this.trayAt.x), y: n(at?.y, this.trayAt.y), hy: n((at as { hy?: unknown })?.hy, this.trayAt.hy ?? 80) };
    this.trayOn = true;
    this.placeTray();
    w.contentView.addChildView(v);             // to the top, over the page
    // The rail starts folded, its handle exactly over the band's, then slides out carrying it (his ask, 2026-10-20).
    v.setVisible(true);
    v.webContents.send('browser:tray', { open: true, hy: this.trayAt.hy, size: this.tabSize });
    v.webContents.focus();
    w.webContents.send('browser:tray', { open: true });
    this.sendTabs();
  }
  // ------------------------------------------------------------------ sheet 87, the secret window
  /**
   * Fill the screen, or back to a size easy to drag and resize (2026-10-25, his ask: "like Windows, double-click when
   * it's full screen and it goes back to a smaller size"). A window he dragged or sized to fill the screen counts as
   * filled too (the Mac only calls it zoomed when its own button did it), and comes back to the size it had, or, when
   * that was the whole screen too, three quarters of it in the middle. The Mac glides it there.
   */
  private fillOrShrink(w: BrowserWindow): void {
    if (w.isDestroyed()) return;
    const area = screen.getDisplayMatching(w.getBounds()).workArea, b = w.getBounds();
    const fills = (r: Electron.Rectangle) => r.width >= area.width - 16 && r.height >= area.height - 16;
    if (!w.isMaximized() && !fills(b)) { w.maximize(); return; }
    if (w.isMaximized()) w.unmaximize();
    const was = w.getNormalBounds();
    const to = fills(was) ? { width: Math.round(area.width * 0.75), height: Math.round(area.height * 0.8) } : { width: was.width, height: was.height };
    w.setBounds({ x: Math.round(area.x + (area.width - to.width) / 2), y: Math.round(area.y + (area.height - to.height) / 2), ...to }, true);
  }
  // ------------------------------------------------------------------ Stremio's downloads
  /**
   * 2026-10-25 (his ask: "stop old Stremio downloads as soon as I leave a video"): every stream he opens in Stremio starts
   * a download in its engine, and it went on for minutes after he left it, so clicking through a few left five running
   * at once. The downloads that start while his Stremio tab plays are Samara's; when he leaves the video or picks another,
   * all but the one he is now watching are stopped. Ones his Stremio app started are never touched.
   */
  private stremioMine = new Map<number, { hashes: string[]; seen: Set<string> | null; url: string; timer?: NodeJS.Timeout }>();
  /** Stremio's engine on this Mac (a test points it at a stand-in). */
  stremioApi = 'http://127.0.0.1:11470';
  private async stremioHashes(): Promise<string[]> {
    try {
      const r = await fetch(`${this.stremioApi}/stats.json`, { signal: AbortSignal.timeout(2000) });
      return Object.keys(await r.json() as Record<string, unknown>).filter((h) => /^[0-9a-f]{40}$/i.test(h));
    } catch { return []; }
  }
  private stremioMoved(tab: Tab, url: string): void {
    const st = this.stremioMine.get(tab.id) ?? { hashes: [], seen: null, url: '' };
    if (st.url === url) return;
    st.url = url;
    this.stremioMine.set(tab.id, st);
    if (st.timer) clearTimeout(st.timer);
    const playing = /#\/player\//.test(url) && url !== 'about:closed';
    void (async () => {
      const now = await this.stremioHashes();
      // What was already running when this tab first came to Stremio is not its own (his Stremio app's, say).
      if (!st.seen) st.seen = new Set(now);
      // Leaving a video, or onto another one: what this tab started before stops now.
      const drop = st.hashes.filter((h) => now.includes(h));
      st.hashes = [];
      for (const h of drop) await fetch(`${this.stremioApi}/${h}/remove`, { signal: AbortSignal.timeout(3000) }).catch(() => null);
      if (drop.length) console.log(`shell: Stremio: stopped ${drop.length} old download${drop.length === 1 ? '' : 's'}`);
      if (!playing) { if (url === 'about:closed') this.stremioMine.delete(tab.id); else st.seen = new Set(await this.stremioHashes()); return; }
      // A video: whatever is running that was not running before it (it may have started a moment before this) is its.
      const watch = (left: number) => {
        void this.stremioHashes().then((hs) => { if (st.url !== url) return; for (const h of hs) if (!st.seen!.has(h) && !drop.includes(h) && !st.hashes.includes(h)) st.hashes.push(h); });
        if (left > 0) st.timer = setTimeout(() => watch(left - 1), 3000);
      };
      watch(8);
    })();
  }

  // ------------------------------------------------------------------ sheet 89, his TV
  /** What is on his TV now: one video (Google Cast) or this window (AirPlay, as a second screen). */
  private tv: { kind: 'video' | 'window'; tab: number; name: string; title: string; site: string; cast?: CastSession; back?: Electron.Rectangle; win?: BrowserWindow } | null = null;
  /** The TV ask in the band: setting yeet up as a second screen (once), or what is playing there. */
  private tvAsk: 'setup' | 'playing' | null = null;
  private tvState(): Record<string, unknown> | null {
    if (!this.tv && !this.tvAsk) return null;
    return { kind: this.tv?.kind ?? null, name: this.tv?.name ?? this.tvName, title: this.tv?.title ?? '', site: this.tv?.site ?? hostOf(this.cur()?.url ?? ''), ask: this.tvAsk };
  }
  private tvName = 'your TV';
  /**
   * Just the video (his picks: Stremio, YouTube, Twitch, any plain video). The TV plays it by itself, so his TV remote
   * works and the Mac is free; the tab's own video pauses where it was. A page that plays from inside itself has nothing
   * to send on its own: Samara says so and offers the whole window.
   */
  private async tvVideo(t: Tab): Promise<void> {
    const wc = t.view?.webContents;
    // Every step goes in the log (his report, 2026-10-27: "nothing" happened, and nothing said why), and no way out is
    // silent any more.
    const say = (s: string) => console.log(`shell: TV: ${s}`);
    say(`just the video from ${hostOf(t.url)} (tab ${t.lent ? 'in the pop-out' : t.view ? 'live' : 'asleep'})`);
    if (!wc || wc.isDestroyed() || !isWeb(t.url)) { say('no live page to send'); this.note('That tab has no video playing right now. Play it, then send it again.'); return; }
    await this.tvOff(false);
    const tvs = await findTvs();
    say(`found ${tvs.map((x) => x.name).join(', ') || 'no TV'}`);
    const tv = tvs.find((x) => /yeet/i.test(x.name)) ?? tvs[0];
    if (!tv) { this.note('Your TV is not answering for videos. Turn it on, then try again (The whole window works with it asleep).'); return; }
    this.tvName = tv.name;
    const v = await within(askPage<{ src: string; at: number; live: boolean; paused: boolean; poster: string; title: string }>(wc, PAGE_VIDEO_JS), 2000, null);
    const title = (t.title || v?.title || '').slice(0, 200), site = hostOf(t.url);
    const cast = new CastSession(tv);
    try {
      const yt = youTubeId(t.url);
      if (yt) {
        say(`YouTube video ${yt}`);
        await cast.open(YOUTUBE_APP);
        say('YouTube opened on the TV');
        const screen = await new Promise<string>((res, rej) => {
          const tm = setTimeout(() => rej(new Error('no screen')), 8000);
          cast.on('app', (ns: string, d: Record<string, unknown>) => { const id = (d.data as Record<string, unknown> | undefined)?.screenId; if (ns === YOUTUBE_NS && typeof id === 'string') { clearTimeout(tm); res(id); } });
          cast.appSend(YOUTUBE_NS, { type: 'getMdxSessionStatus' });
        });
        const why = await youTubeOnTv(screen, yt, v?.at ?? 0);
        say(why ?? 'video sent');
        if (why) throw new Error(why);
      } else {
        const media = twitchOf(t.url) ? await twitchMedia(t.url, title, v?.at ?? 0) : plainMedia(v ? { ...v, title } : null);
        if (!media) { cast.close(); this.note('This page plays its video from inside itself, so it can only go as The whole window.'); return; }
        await cast.open(DEFAULT_PLAYER);
        await cast.load(media);
      }
    } catch (e) { cast.close(); say(`failed: ${(e as Error).message}`); this.note(`${tv.name} could not play it: ${(e as Error).message}.`); return; }
    void askPage(wc, PAUSE_PAGE_JS);
    this.tv = { kind: 'video', tab: t.id, name: tv.name, title, site, cast };
    cast.on('ended', () => { if (this.tv?.cast === cast) { this.tv = null; this.tvAsk = null; this.sendTabs(); } });
    this.sendTabs();
  }
  /**
   * The whole window (his pick: it fills the TV and the sound plays there). The Mac must use yeet as a second screen,
   * which only he can turn on, once; Samara finds that screen by the TV's AirPlay name and moves this window onto it.
   */
  private async tvWindow(t: Tab): Promise<void> {
    const w = this.win;
    if (!w || w.isDestroyed()) return;
    if (this.tv?.kind === 'window') return;
    const names = await airplayNames();
    if (names.length) this.tvName = names.find((n) => /yeet/i.test(n)) ?? names[0]!;
    const shown = screen.getAllDisplays().find((d) => !d.internal && names.some((n) => d.label.toLowerCase().includes(n.toLowerCase())));
    if (!shown) { this.tvAsk = 'setup'; this.sendTabs(); return; }
    await this.tvOff(false);
    if (this.active !== t.id) this.activate(t.id);
    const back = w.isFullScreen() ? null : w.getBounds();
    if (w.isFullScreen()) w.setFullScreen(false);
    w.setBounds(shown.bounds);
    setTimeout(() => { if (!w.isDestroyed()) w.setFullScreen(true); }, 300);
    this.tv = { kind: 'window', tab: t.id, name: this.tvName, title: (t.title || '').slice(0, 200), site: hostOf(t.url), ...(back ? { back } : {}), win: w };
    this.tvAsk = null;
    this.sendTabs();
  }
  /** The TV ask's keys, from the frame only (browseripc). */
  async tvAct(act: string): Promise<void> {
    if (act === 'open') { this.tvAsk = this.tv ? 'playing' : null; this.sendTabs(); }
    else if (act === 'close') { this.tvAsk = null; this.sendTabs(); }
    else if (act === 'displays') { this.tvAsk = null; this.sendTabs(); void shell.openExternal('x-apple.systempreferences:com.apple.Displays-Settings.extension'); }
    else if (act === 'back') await this.tvOff(true);
    else if (act === 'stop') await this.tvOff(false);
  }
  /** Off the TV: back into the tab where it left off (paused), or the window back to its size on the Mac. */
  private async tvOff(bringBack: boolean): Promise<void> {
    const tv = this.tv;
    this.tv = null; this.tvAsk = null;
    if (!tv) return;
    if (tv.kind === 'video' && tv.cast) {
      const at = bringBack ? await tv.cast.where() : 0;
      tv.cast.stop();
      const wc = this.tabs.find((x) => x.id === tv.tab)?.view?.webContents;
      if (bringBack && wc && !wc.isDestroyed()) { void askPage(wc, seekPageJs(at)); this.activate(tv.tab); }
    } else if (tv.kind === 'window' && tv.win && !tv.win.isDestroyed()) {
      const w = tv.win;
      const done = () => { if (!w.isDestroyed() && tv.back) w.setBounds(tv.back, true); };
      if (w.isFullScreen()) { w.once('leave-full-screen', () => setTimeout(done, 200)); w.setFullScreen(false); } else done();
    }
    this.sendTabs();
  }
  /** Sheet 87: the fake-site lists, for the secret window to share. */
  get phishCheck(): PhishCheck { return this.phish; }
  /** Sheet 87: is this the secret window (main routes messages by it). */
  get isSecret(): boolean { return this.o.secret === true; }
  /** One of this browser's own pages or tabs (sheet 87: normal Samara and the secret window share the app's messages). */
  owns(wc: Electron.WebContents): boolean {
    if (this.tabs.some((t) => t.view?.webContents === wc)) return true;
    if (this.menu && !this.menu.isDestroyed() && this.menu.webContents === wc) return true;
    return this.panes.some((p) => {
      try { return (this.alive(p) && p.win!.webContents === wc) || [p.trayV, p.runeV, p.lightV].some((v) => v && !v.webContents.isDestroyed() && v.webContents === wc); } catch { return false; }
    });
  }
  /** Locked: nothing of his is out, and the tabs open in the throwaway session (logged out). */
  private shut(): void {
    this.locked = true; this.restored = false; this.pinOpen = false;
    if (this.keptSes && this.ses === this.keptSes) this.ses = electronSession.fromPartition('aang-secret-guest');
  }
  /** The blank night page: nothing of his shows, and an address typed on it opens in its place. */
  private night(): void {
    const t: Tab = { id: ++this.seq, internal: 'night', view: null, opener: null, title: 'New tab', url: 'aang:night', favicon: '', loading: false, audible: false, muted: false, crashed: false,
      scrollY: 0, zoom: 0, lastSeen: Date.now(), blocked: null, trail: null, done: false, lent: false, upgraded: null, failed: null, blockedPopup: null, pane: this.pane.id };
    this.tabs.push(t);
    this.activate(t.id);
  }
  /** The PIN box over the page: his PIN, a new one (the first time, or after his Mac password), or too many wrong ones. */
  private pinAsk(mode?: 'enter' | 'new' | 'gone' | 'keychain'): void {
    const w = this.win, seal = this.secretPin;
    if (!w || w.isDestroyed() || !seal) return;
    // A forgotten PIN (too many wrong ones wipe its seal) never lets a new one in without his Mac password.
    // His report (2026-10-27): after an update the Mac's Keychain box was missed, so his PIN looked forgotten and a new
    // one could not be kept. A PIN the Keychain will not open is never "gone": the box says how to let Samara back in.
    const m = mode ?? (seal.has() ? 'enter' : seal.unreadable() ? 'keychain' : this.pinReset || !existsSync(this.secretMade) ? 'new' : 'gone');
    this.pinOpen = true;
    this.place();
    w.webContents.focus();
    w.webContents.send('browser:secretpin', { mode: m, len: m === 'enter' ? seal.length() : 0 });
  }
  private pinClose(): void {
    if (!this.pinOpen) return;
    this.pinOpen = false;
    this.place();
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send('browser:secretpin', { mode: 'off' });
  }
  private get secretMade(): string { return path.join(this.o.stateDir, 'secret-made.json'); }
  /** The PIN box's answer, from the frame only (browseripc). Digits only, 4 to 8. */
  async secretPinAct(a: { act?: unknown; pin?: unknown }): Promise<void> {
    const seal = this.secretPin;
    if (!seal || !this.pinOpen) return;
    const pin = typeof a.pin === 'string' ? a.pin : '';
    // Put away without his PIN: the band's handle goes back to closed.
    if (a.act === 'cancel') { this.pinReset = false; this.pinClose(); this.win?.webContents.send('browser:tray', { open: false }); return; }
    if (a.act === 'reopen') { app.relaunch(); app.quit(); return; }
    if (a.act === 'reset') { if (!seal.has() && await macPassword()) { this.pinReset = true; this.pinAsk('new'); } return; }
    if (!pinOk(pin)) return;
    if (a.act === 'set') {
      if (!(this.pinReset || (!seal.has() && !existsSync(this.secretMade)))) return;
      if (!await seal.seal(pin, 'secret')) { this.pinAsk('keychain'); return; }
      try { writeFileAtomic(this.secretMade, JSON.stringify({ at: new Date().toISOString() })); } catch { /* the seal is what counts */ }
      this.pinReset = false;
      if (this.locked) await this.unlock(); else this.pinClose();
      return;
    }
    if (a.act !== 'try' || !this.locked) return;
    const r = await seal.open(pin);
    if (r === 'gone') { this.pinAsk('gone'); return; }
    if ('wrong' in r) { this.win?.webContents.send('browser:secretpin', { mode: 'wrong' }); return; }
    await this.unlock();
  }
  /** The right PIN: his tabs come back where he left them, logged in; pages he opened before it join them. */
  private async unlock(): Promise<void> {
    if (!this.keptSes || !this.locked) return;
    this.locked = false; this.lastInput = Date.now();
    this.pinClose();
    const before = this.tabs.slice();
    const trailOf = new Map(before.map((t) => [t, this.trails.find((x) => x.id === t.trail)?.name ?? null]));
    // They reopen in the kept session, so from now on they are logged in.
    for (const t of before) { if (!t.lent) this.closeView(t); t.trail = null; }
    this.ses = this.keptSes;
    const was = this.active;
    // The cover he did not use goes; a page he went to from it stays, like any page opened before the PIN.
    const away = this.away, coverId = this.coverId;
    this.away = null; this.coverId = null;
    // His pick: the cover starts fresh every time, so whatever was done on it goes; pages opened before his first PIN
    // (a fresh ⇧⌘N, nothing put away) join his tabs, all but the Brave Search page it opened on, if he left it as it was.
    const cover = away ? before : before.filter((t) => t.id === coverId && t.url === SECRET_COVER);
    if (away) {
      // Put away by the mask: everything back exactly as it was, asleep, so nothing plays until he presses play.
      this.tabs = [...away.tabs, ...before]; this.trails = away.trails; this.restored = true;
    } else { this.trails = []; this.restore(); }
    for (const [t, name] of trailOf) if (name) t.trail = this.addTrail(name);
    for (const t of cover) this.close(t.id, false);
    // The blank night page goes once there is something else.
    for (const t of this.tabs.filter((x) => x.internal === 'night')) if (this.tabs.length > 1) this.close(t.id, false);
    const mine = before.find((t) => t.id === was && !cover.includes(t) && !t.internal && this.tabs.includes(t));
    const back = away?.active != null ? this.tabs.find((t) => t.id === away.active) : undefined;
    const go = mine ?? back ?? this.tabs.find((t) => t.id === this.active) ?? this.tabs[0];
    if (go) this.activate(go.id);
    this.changed();
    if (this.pinAt) this.tray(true, this.pinAt);
  }
  /**
   * Sheet 87 v12: everything put away: one click on the mask, the Mac sleeping or locking, 15 minutes away. It goes from
   * the screen at once; every page sleeps where it is (each video's spot kept, nothing playing) and Brave Search shows,
   * logged out. His PIN brings it all back exactly as it was, paused.
   */
  async lock(cover = true): Promise<void> {
    if (!this.o.secret || this.locked) return;
    this.locked = true;
    this.tray(false);
    this.pinClose();
    // Off the screen and silent first; the rest takes a moment.
    const front = this.cur();
    if (front?.view) front.view.setVisible(false);
    for (const t of this.tabs) try { t.view?.webContents.setAudioMuted(true); } catch { /* gone */ }
    this.restored = true;                       // the snapshot below still takes his tabs
    await this.snapshot(true);
    this.visits.flush();
    const was = this.active;
    await Promise.all(this.tabs.filter((t) => t.view && !t.internal && !t.lent).map((t) => this.rest(t).catch(() => this.closeView(t))));
    for (const t of this.tabs) { if (t.view) this.closeView(t); t.muted = false; }
    this.away = { tabs: this.tabs.filter((t) => !t.internal && t.id !== this.coverId), trails: this.trails, active: was };
    this.tabs = []; this.trails = []; this.active = null;
    for (const p of this.panes) p.active = null;
    this.shut();
    void this.ses.clearStorageData().catch(() => { /* nothing kept there anyway */ });
    if (this.alive(this.pane)) this.coverId = cover ? this.newTab(SECRET_COVER) : null;
    if (!cover && this.alive(this.pane)) this.night();
    this.changed();
  }
  /**
   * Sheet 87 v12 (his picks): the mask in the band. Open: a click puts it all away behind Brave Search. Put away: a double
   * click and his PIN bring it all back. Just opened (⇧⌘N): a click asks his PIN. Held: his Mac password, then a new PIN.
   */
  async secretMask(act: 'one' | 'two' | 'hold'): Promise<void> {
    if (!this.o.secret) return;
    this.lastInput = Date.now();
    if (act === 'hold') {
      this.pinClose();
      if (!await macPassword()) return;
      this.pinReset = true; this.pinAt = undefined;
      this.pinAsk('new');
      return;
    }
    if (!this.locked) { await this.lock(true); return; }
    if (this.away && act !== 'two') return;            // behind the cover only a double click asks (never by accident)
    if (this.pinOpen) { this.pinClose(); return; }
    this.pinAt = undefined;
    this.pinAsk();
  }

  private raiseTray(): void {
    if (this.trayOn && this.trayV && this.win && !this.win.isDestroyed()) this.win.contentView.addChildView(this.trayV);
    // 2026-10-21: the rune's panel too, whatever comes up under it (a waking tab, the page back from the pop-out).
    const P = this.pane;
    if (P.runeOn && P.runeV && !P.runeV.webContents.isDestroyed() && this.win && !this.win.isDestroyed()) this.win.contentView.addChildView(P.runeV);
  }
  private placeTray(): void {
    const w = this.win, v = this.trayV;
    if (!w || w.isDestroyed() || !v || !this.trayOn) return;
    const [cw, ch] = w.getContentSize();
    v.setBounds({ x: this.trayAt.x, y: this.trayAt.y, width: Math.max(0, Math.min(TRAY_W[this.tabSize], cw - this.trayAt.x)), height: Math.max(0, ch - this.trayAt.y) });
  }

  /** Open the window (or bring it forward), optionally on an address. Coming back, every tab comes back. */
  open(url?: string): void {
    const p = this.lastPane();
    if (p && !this.restored) { if (url) this.whenOpen.push(() => this.newTab(url)); return; }
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
    if (first && !bring) this.restored = false;     // a new first window reads his tabs back before anything saves
    const wa = screen.getPrimaryDisplay().workArea;
    const was = first ? this.savedPlace() : null;
    // A new run: the download tray starts empty (its key hidden) until something downloads.
    if (first) this.traySince = Date.now();
    const p = newPane(++this.paneSeq);
    const w = new BrowserWindow({
      width: Math.min(1440, wa.width - 80), height: Math.min(900, wa.height - 60), minWidth: 720, minHeight: 480,
      ...(was ? { x: was.x, y: was.y, width: was.width, height: was.height } : {}),
      ...(at ? { x: Math.round(at.x), y: Math.round(at.y), width: Math.max(720, Math.round(at.width)), height: Math.max(480, Math.round(at.height)) } : {}),
      show: false, backgroundColor: '#24160D', title: 'Samara',
      // The carved band IS the title bar; Windows draws its own buttons over the band's right end.
      // See-through (the research: Flow browser), so Windows' own minimise, maximise and close sit ON the wood
      // with their real hover and snap layouts, instead of on a flat block that looked stuck on.
      // His pick (2026-10-12): Aang draws his own bold gold minimise, maximise and close on the band; Windows' were too thin.
      titleBarStyle: 'hidden',
      // Autofill's sounds (sheet 77) play in this, Samara's own page, while his keys are in the site's page.
      webPreferences: { ...SAFE_WEB_PREFERENCES, preload: this.o.preloadPath, autoplayPolicy: 'no-user-gesture-required' },
    });
    // Samara (his name and his pick of icon, sheet 33 L1, 2026-10-14): the browser wears its own lantern and gets its
    // own taskbar button; Aang's other windows keep his face.
    try { w.setIcon(SAMARA_ICON); w.setAppDetails({ appId: 'Aang.Samara', appIconPath: SAMARA_ICON, appIconIndex: 0, relaunchDisplayName: 'Samara' }); } catch { /* not Windows */ }
    // The lantern lights up as the window opens (his ask, 2026-10-14), the same frames as the Mac's Dock.
    if (process.platform === 'win32') {
      let i = 0;
      const t = setInterval(() => {
        if (w.isDestroyed()) { clearInterval(t); return; }
        // 2026-10-20: frames made at the taskbar's own sizes from the 24 px drawing (tools/samara-icons-leaf.py). The 64 px
        // frames, shrunk to 24 by Windows, came out blurry; the Mac's Dock still uses those.
        try { w.setIcon(nativeImage.createFromPath(path.join(import.meta.dirname, '..', 'pages', 'art', 'samara', `samara-lightup-${i}.ico`))); } catch { /* the lit icon stays */ }
        if (++i > 9) { clearInterval(t); try { w.setIcon(SAMARA_ICON); } catch { /* fine */ } }
      }, 55);
    }
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
    w.on('focus', () => { this.focused = p; const was = this.pane; this.pane = p; this.mockSeen(); this.pane = was; });
    w.on('resize', () => { this.pane = p; this.place(); this.placeTray(); this.placeRune(); keepSoon(); });
    w.on('move', keepSoon);
    w.on('maximize', () => { this.pane = p; this.place(); keepSoon(); this.sendTabs(); });
    w.on('unmaximize', () => { this.pane = p; this.place(); keepSoon(); this.sendTabs(); });
    w.on('close', () => { this.pane = p; if (this.panes[0] === p) this.keepPlace(); if (!this.quitting) void this.snapshot(true); this.visits.flush(); this.veil = null; try { this.curtain?.webContents.close(); } catch { /* gone */ } this.curtain = null; });
    // 6.22b bug 4: the mouse's back and forward side buttons.
    w.on('app-command', (_e, cmd) => { this.pane = p; if (cmd === 'browser-backward') this.sideNav('back'); else if (cmd === 'browser-forward') this.sideNav('forward'); });
    // A page in fullscreen: leaving the window's fullscreen (F11, a snap) ends it too.
    w.on('leave-full-screen', () => { const t = this.tabs.find((x) => x.id === p.fullTab); if (t?.view) void within(t.view.webContents.executeJavaScript('document.fullscreenElement&&document.exitFullscreen().catch(()=>{});true'), 500, null); });
    w.on('closed', () => {
      this.pane = p;
      const others = this.panes.filter((x) => x !== p && this.alive(x));
      // Quitting: this window's tabs stay in the snapshot already taken; nothing is dropped or saved again.
      if (others.length && this.quitting) { p.win = null; p.trayV = null; p.trayOn = false; p.runeV = null; p.runeOn = false; this.panes = others; if (this.focused === p) this.focused = null; this.pane = others[others.length - 1]!; return; }
      if (others.length) {
        // One of several windows: its tabs close (Reopen closed tab brings them back), the browser goes on.
        for (const t of this.paneTabs(p)) {
          if (t.lent) { t.pane = others[0]!.id; continue; }       // playing in the popout: it comes back to another window
          if (isWeb(t.url)) { this.closed.push(t.url); if (this.closed.length > 25) this.closed.shift(); }
          this.closeView(t);
        }
        this.tabs = this.tabs.filter((t) => t.pane !== p.id);
        if (p.watchTimer) clearTimeout(p.watchTimer);
        p.win = null; p.trayV = null; p.trayOn = false; p.runeV = null; p.runeOn = false;
        this.panes = others;
        if (this.focused === p) this.focused = null;
        this.pane = others[others.length - 1]!;
        this.tidyTrails();
        this.changed();
        return;
      }
      if (this.menu && !this.menu.isDestroyed()) this.menu.destroy();
      this.vault.lock();                          // closing the browser locks the vault
      // Sheet 87: closing the secret window locks it; whatever was opened before its PIN is thrown away.
      if (this.o.secret) { this.away = null; this.coverId = null; this.shut(); void this.ses.clearStorageData().catch(() => { /* nothing kept there */ }); }
      this.mediaOk.clear();                       // and ends every call's camera and microphone
      this.shareHosts.clear();
      this.callNow(false);
      if (this.share) this.shareAnswer(this.share.id, null, false);
      this.menu = null; this.fullTab = null;
      for (const t of this.tabs) if (!t.lent) this.closeView(t);
      this.tabs = []; this.active = null; this.win = null; this.trayV = null; this.trayOn = false; this.pane.runeV = null; this.pane.runeOn = false;
      this.panes = []; this.focused = null; this.quitting = false;
      this.timers.forEach(clearInterval); this.timers = [];
      try { this.onLastClosed?.(); } catch { /* the browser is closed either way */ }
    });
    w.once('ready-to-show', () => { if (this.o.secret) fadeIn(w); else bringFront(w); });
    // Anything that needs the Mac's Keychain waits until the window is up (2026-10-25: a Keychain box at start left
    // Samara with no window and a dead Dock icon until he answered it). Then the box, if any, comes up over the window.
    if (first) w.once('show', () => setTimeout(() => this.details.open(), 1200));
    // The tab list is made ready a few seconds after the window shows (measured 2026-10-20: built on his first hover it
    // took 0.2 s, and 0.5 s on a slow machine), so the first open is as quick as every other.
    w.once('ready-to-show', () => setTimeout(() => { if (w.isDestroyed() || p.win !== w) return; const was = this.pane; this.pane = p; this.trayView(); this.runeView(); this.pane = was; }, 3000));
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
      // Sheet 87: the secret window opens on its blank night page, locked; its tabs come back with its PIN.
      // His pick (2026-10-25): it opens on Brave Search, logged out; its address bar searches with Yandex.
      if (this.o.secret) { this.shut(); this.coverId = this.newTab(SECRET_COVER); return; }
      // A mockup that opened the window (sheet 47) is its first tab: no home page under it.
      if (this.prefs.startup === 'home' || !this.restore()) { this.restored = true; if (url || !this.whenOpen.length) this.newTab(url ?? this.HOME); }
      else if (url) this.newTab(url);                       // his tabs come back, and the link he clicked opens on top
      for (const f of this.whenOpen.splice(0)) { this.pane = p; f(); }
    });
    void w.loadURL(`${this.o.origin}/browser.html`);
    // The continuous snapshot, and putting idle tabs to sleep: once for the whole browser.
    if (first) this.timers.push(setInterval(() => { void this.snapshot(); }, 8000), setInterval(() => { void this.sleepIdle(); }, 60_000),
      setInterval(() => { void this.lookForLogin(); }, 1500));
    // Sheet 87: 15 minutes without a key or a click in the secret window locks it.
    if (first && this.o.secret) this.timers.push(setInterval(() => { if (!this.locked && Date.now() - this.lastInput > SECRET_IDLE_MS) void this.lock(); }, 30_000));
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
      if (to.runeOn && to.runeV) to.win!.contentView.addChildView(to.runeV);   // and the rune's panel (2026-10-21)
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
    if (t.crashed || t.blocked || t.failed || this.pinOpen) { t.view.setBounds({ x: 0, y: 0, width: 0, height: 0 }); this.veilDown(0); return; }
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
    // The picture never stands between him and the page (2026-10-23, his "I can't click on any video buttons"): it could
    // sit over a page for seconds after a load, taking his clicks. A press on it takes it away at once and the press,
    // and its release, go to the page underneath, at the same spot.
    const P = this.pane;
    let through: Tab | null = null;
    v.webContents.on('input-event', (_e, i) => {
      const m = i as Electron.MouseInputEvent;
      if (i.type === 'mouseDown') {
        this.pane = P;
        const t = this.tabs.find((x) => x.id === P.veil?.tab) ?? this.cur();
        if (P.veil) this.veilDown(0);
        v.setVisible(false);
        if (t?.waking) this.wokeUp(t);
        through = t?.view && !t.view.webContents.isDestroyed() ? t : null;
      }
      if (through && (i.type === 'mouseDown' || i.type === 'mouseUp') && through.view && !through.view.webContents.isDestroyed()) {
        through.view.webContents.sendInputEvent({ type: i.type, x: m.x, y: m.y, button: m.button ?? 'left', clickCount: m.clickCount ?? 1 });
        if (i.type === 'mouseUp') through = null;
      }
    });
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
    const shot = !t.drawn ? (t.waking && t.leftShot ? t.leftShot : from ? await this.shotOf(from) : null) : p && p.tab === t.id && Date.now() - p.at < 1500 ? p.shot : await this.shotOf(t);
    await P.curtainReady;
    this.pane = P;
    if (this.veil?.nav !== nav) return;                         // the new page drew first: a plain switch
    if (!v.webContents || v.webContents.isDestroyed()) { if (this.veil?.nav === nav) this.veil = null; return; }   // the window closed meanwhile
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
    if (t.waking && typeof t.videoAt === 'number') { const at = t.videoAt; t.videoAt = undefined; void sender.executeJavaScriptInIsolatedWorld(1003, [{ code: VIDEO_BACK_JS(at) }]).catch(() => {}); }
    if (!t.waking) { if (this.veil?.tab === t.id) this.veilDown(VEIL_FADE_MS); return; }
    // Woken from sleep (2026-10-23, filmed): its last picture stays until the page has stopped moving, then one soft fade.
    const P = this.pane;
    void within(sender.executeJavaScriptInIsolatedWorld(1004, [{ code: SETTLED_JS }]) as Promise<boolean>, 4000, false).then(() => {
      this.pane = P;
      if (this.veil?.tab === t.id) this.veilDown(WAKE_FADE_MS);
      setTimeout(() => this.wokeUp(t), WAKE_FADE_MS + 150);
    });
  }
  /** A woken tab is on screen: what it held back (his video) may play now, if he is looking at it. */
  private wokeUp(t: Tab): void {
    if (!t.waking) return;
    t.waking = false;
    const wc = t.view?.webContents;
    if (wc && !wc.isDestroyed()) wc.setAudioMuted(t.muted);
    if (wc && !wc.isDestroyed() && this.seen(t)) { try { wc.send('tab:shown', true); } catch { /* gone */ } }   // only what he started plays
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
    // page area's own colour instead (or, coming back, the page's own colour: a dark site stays dark), and keep it in
    // the window, hidden, so switching to it is instant.
    view.setBackgroundColor(tab.pageBg ?? PAGE_COLOUR);
    try { view.setBorderRadius(PAGE_RADIUS); } catch { /* an older runtime: square corners */ }
    view.setVisible(false);
    this.inTab(tab);
    this.win?.contentView.addChildView(view);
    this.raiseTray();                                   // a waking tab never covers the open tab list
    tab.view = view; tab.crashed = false; tab.loading = true; tab.drawn = false;
    // Coming back from sleep (2026-10-23, his report: a video played before the page showed, and it looked crashed): it
    // counts as loading at once, so the curtain (with its own last picture) covers it, and nothing plays until it shows.
    tab.phase = 'waiting'; tab.waking = tab.slept === true; tab.slept = false;
    // Silent while it wakes: a player that sets itself up again can start for a moment before it is paused (filmed).
    if (tab.waking) { wc.setAudioMuted(true); setTimeout(() => this.wokeUp(tab), 10_000); }
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
      if (i.type === 'mouseDown' || i.type === 'keyDown') { this.lastGesture.set(tab.id, Date.now()); this.lastInput = Date.now(); }
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
        if (!this.prefs.popups || (his && this.fairOpen(tab, wc.getURL(), u)) || this.popOk(site)) {
          return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 680, autoHideMenuBar: true, backgroundColor: PAGE_COLOUR,
            title: 'Samara', webPreferences: { ...SAFE_WEB_PREFERENCES, session: this.ses, preload: this.o.tabPreloadPath } } };
        }
        // His call (2026-10-12): no chip. The shield glows one solid blue; he clicks it to see what was blocked and
        // can open it or allow the site, so a popup he was actually waiting for is one click away.
        console.log('shell: browser: popup blocked');
        tab.blockedPopup = { url: u, site };
        this.sendTabs();
        return { action: 'deny' };
      }
      // A new TAB a page opens (window.open with no size, a link in a new tab) needs his click too (security check
      // 2026-10-24, finding 7): before, only new windows were checked, so a page could open tabs by itself.
      if (this.listed(u).length) return { action: 'deny' };
      const his = Date.now() - (this.lastGesture.get(tab.id) ?? 0) < GESTURE_MS;
      let site = '';
      try { site = new URL(wc.getURL()).hostname.replace(/^www\./, ''); } catch { /* none */ }
      if (this.prefs.popups && !(his && this.fairOpen(tab, wc.getURL(), u)) && !this.popOk(site)) {
        console.log('shell: browser: a tab the page opened by itself was blocked');
        tab.blockedPopup = { url: u, site };
        this.sendTabs();
        return { action: 'deny' };
      }
      this.newTab(u, tab.id, disposition !== 'background-tab');
      return { action: 'deny' };
    });
    on('did-create-window', (pw) => this.popupWindow(pw));
    // 6.22: a listed site never loads, whether it is a link, a redirect or anything else.
    // A page on the internet never sends him to this computer or the home network (security check 2026-10-24, finding 9:
    // a page could quietly post a form to his router's settings). He can still type such an address himself.
    const inward = (u: string) => { try { return privateHost(new URL(u).hostname) && !privateHost(new URL(wc.getURL()).hostname) && /^https?:$/.test(new URL(wc.getURL()).protocol); } catch { return false; } };
    const refuseInward = (e: Electron.Event, u: string) => { e.preventDefault(); let h = ''; try { h = new URL(u).host; } catch { /* none */ } this.note(`A website tried to open ${h || 'an address'} on your home network. Type it in yourself if you meant to go there.`); };
    on('will-navigate', (e, u) => {
      if (!isWeb(u)) { e.preventDefault(); this.offerApp(tab, u); return; }
      if (inward(u)) { refuseInward(e, u); return; }
      if (this.toPaid(u)) { e.preventDefault(); return; }
      const l = this.stopFor(u);
      if (l.length) { e.preventDefault(); this.block(tab, u, l); return; }
      const up = upgrade(u, this.httpOk);
      if (up) { e.preventDefault(); tab.upgraded = u; setTimeout(() => { if (!wc.isDestroyed()) void wc.loadURL(up).catch(() => {}); }, 0); }
    });
    on('will-redirect', (e, u, _inPage, isMain) => {
      if (!isMain) return;
      if (isWeb(u) && inward(u)) { refuseInward(e, u); return; }
      if (isWeb(u) && this.toPaid(u)) { e.preventDefault(); return; }
      if (!isWeb(u) && appOf(u)) { e.preventDefault(); this.offerApp(tab, u); return; }
      // A link for something that is not a web page and that no app here opens: stopped quietly, never shown as a fake
      // site (2026-10-25: that red plate told him Shadow's sign-in was a fake login page).
      if (!isWeb(u)) { e.preventDefault(); let sc = ''; try { sc = new URL(u).protocol; } catch { /* odd */ } this.note(`The page tried to open a ${sc || 'non-web'} link, and no app on this computer opens those.`); return; }
      const l = this.stopFor(u);
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
    on('did-start-navigation', (d) => { const x = d as unknown as { url: string; isMainFrame: boolean }; if (!x.isMainFrame || !isWeb(x.url)) return; const l = this.stopFor(x.url); if (l.length) this.block(tab, x.url, l); });
    // A mockup keeps the name Claude gave it ("46 · One cockpit"), and never goes into his History.
    on('page-title-updated', (_e, title) => { if (tab.mock) return; tab.title = title; this.visits.name(wc.getURL(), title); this.changed(); });
    on('page-favicon-updated', (_e, icons) => {
      tab.favicon = icons.find((i) => /^https?:|^data:image\//.test(i)) ?? '';
      this.sendTabs();
      // Keep it for the site's bookmark, so the shelf shows it even before he visits again.
      try { const u = new URL(wc.getURL()); if (tab.favicon && !this.icons.has(u.hostname)) void this.keepIcon(u.hostname, [...icons, u.origin + '/favicon.ico']); } catch { /* none */ }
    });
    on('did-start-loading', () => { tab.loading = true; if (tab.crashed) { tab.crashed = false; this.place(); } this.sendTabs(); });
    on('did-stop-loading', () => {
      tab.loading = false; tab.phase = 'idle'; tab.prog = 1; tab.pending = null; tab.drawn = true;
      // A woken page "finishes" while it is still rearranging itself (YouTube, filmed 2026-10-23): its picture stays until
      // it has held still (painted()).
      if (this.veil?.tab === tab.id && !tab.waking) this.veilDown(VEIL_FADE_MS);
      this.sendTabs();
    });
    // The loading steps (2026-10-12): the click, the site answering, the page read, the page drawn (painted()).
    on('did-start-navigation', (d) => {
      const x = d as unknown as { url: string; isMainFrame: boolean; isSameDocument: boolean };
      if (!x.isMainFrame || x.isSameDocument) return;
      tab.phase = 'waiting'; tab.prog = 0.08;
      if (this.af?.tab === tab.id) { this.af = null; this.lightHide(); }
      if (isWeb(x.url)) void this.veilUp(tab);
      this.sendTabs();
    });
    on('dom-ready', () => { this.paintDark(tab); if (tab.phase !== 'idle') { tab.prog = Math.max(tab.prog ?? 0, 0.55); this.sendTabs(); } });
    on('did-navigate', (_e, u, status) => {
      if (/^https:\/\/(www\.)?netflix\.com(:\d+)?\/watch\//i.test(u)) this.watchPlays(tab, u);
      if (STREMIO_WEB.test(u)) { void startStremio(); this.stremioMoved(tab, u); }
      tab.url = u; tab.scrollY = 0; if (status > 0) tab.upgraded = null; if (status < 400 && !tab.mock && !this.covered && tab.id !== this.coverId) this.visits.add(u, '');
      tab.pending = null;
      if (tab.phase !== 'idle') { tab.phase = 'loading'; tab.prog = Math.max(tab.prog ?? 0, 0.35); }
      this.changed();
    });
    on('did-navigate-in-page', (_e, u, main) => {
      if (main && STREMIO_WEB.test(u)) this.stremioMoved(tab, u);
      // A show started inside the page (Netflix changes page without loading one, his report 2026-10-14): where paid
      // video plays in its own window, the show goes there and this tab steps back to where it was.
      if (main && /^https:\/\/(www\.)?netflix\.com(:\d+)?\/watch\//i.test(u)) { if (this.toPaid(u)) { if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); return; } this.watchPlays(tab, u); }
      tab.url = u; if (main && !tab.mock && !this.covered && tab.id !== this.coverId) this.visits.add(u, wc.getTitle()); this.changed();
    });
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
    // The pop-out is made ready the moment something plays here (2026-10-22): the first Popout is then as quick as any.
    on('media-started-playing', () => { if (!tab.internal) { try { this.onPlaying?.(); } catch { /* the video plays on */ } } });
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
    on('before-input-event', (e, input) => { if (this.afKey(tab, input)) { e.preventDefault(); return; } if (!tab.lent && this.key(input)) e.preventDefault(); });
    // Back where it was: the zoom at once. The scroll (2026-10-22, measured on his Mac: it waited for every picture on
    // the page, so a busy page sat at the top for up to ~15 s and then jumped): Chromium's own saved state when there is
    // one, so the page draws where he left it, as Chrome does after a restart; otherwise as soon as the page can scroll,
    // and once more when it has loaded, unless he has scrolled it himself in between.
    if (tab.zoom) wc.setZoomLevel(tab.zoom);
    if (tab.muted) wc.setAudioMuted(true);
    const back = Math.round(tab.scrollY), state = tab.pageState;
    tab.pageState = undefined;                          // used once: a later wake loads the page afresh
    // A mockup from an earlier run: the page server has a new port each run, the commit and path stay the same.
    // (A live page, 2026-10-22, has no commit and keeps its own address.)
    if (tab.mock?.commit && this.mockServer) tab.url = this.mockServer.rebase(tab.url);
    const l = this.stopFor(tab.url);
    if (l.length) { this.block(tab, tab.url, l); return; }
    tab.blocked = null;
    const to = this.secured(tab, tab.url);
    if (state && to === tab.url && !tab.mock) {
      wc.navigationHistory.restore({ index: 0, entries: [{ url: tab.url, title: tab.title, pageState: state }] }).catch(() => { if (!wc.isDestroyed()) void wc.loadURL(to).catch(() => {}); });
      return;
    }
    if (back > 0) {
      // WebFrameMain's run does not wait for the page to finish loading the way webContents.executeJavaScript does.
      let placed = -1;
      wc.once('dom-ready', () => { void wc.mainFrame.executeJavaScript(`(scrollTo(0, ${back}), scrollY)`).then((y) => { placed = Number(y); }, () => {}); });
      wc.once('did-finish-load', () => { void wc.mainFrame.executeJavaScript(`(scrollY === ${placed} || scrollY === 0) && scrollTo(0, ${back})`).catch(() => {}); });
    }
    void wc.loadURL(to).catch(() => {});
  }

  /**
   * The Settings tab (his design, 2026-10-12): the browser's own page in a tab. It has its own small preload with
   * only the settings doors, lives in Aang's own session (never his browsing one), and is pinned to its page:
   * nothing can navigate it anywhere, and typing an address while on it opens a new tab instead.
   */
  private wakeSettings(tab: Tab): void {
    const things = tab.internal === 'things', night = tab.internal === 'night';
    // Sheet 87: the secret window's blank night page has no doors at all.
    const view = new WebContentsView({ webPreferences: { ...SAFE_WEB_PREFERENCES, ...(night ? {} : { preload: things ? this.o.thingsPreloadPath : this.o.settingsPreloadPath }) } });
    const wc = view.webContents;
    lockDown(wc);
    view.setBackgroundColor(night ? '#0e0e10' : '#24160D');
    try { view.setBorderRadius(PAGE_RADIUS); } catch { /* square */ }
    view.setVisible(false);
    this.inTab(tab);
    this.win?.contentView.addChildView(view);
    this.raiseTray();
    tab.view = view; tab.crashed = false; tab.loading = false; tab.title = night ? 'New tab' : things ? 'Your things' : 'Settings';
    wc.on('before-input-event', (e, input) => { this.inTab(tab); if (this.key(input)) e.preventDefault(); });
    wc.on('render-process-gone', () => { this.inTab(tab); tab.crashed = true; this.place(); this.sendTabs(); });
    void wc.loadURL(`${this.o.origin}/${night ? 'night' : things ? 'things' : 'settings'}.html`).catch(() => {});
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
      ads: this.prefs.ads, popups: this.prefs.popups, sounds: this.sounds, dark: this.prefs.dark, tabSize: this.tabSize,
      popupOk: [...this.popupOk].sort(), trusted: [...this.trusted].sort(), httpOk: [...this.httpOk].sort(), sites: this.yourSites(),
      marks: this.marks.slice(0, 400).map((m) => ({ title: m.title, url: m.url, favicon: this.iconOf(m.url) })), markCount: this.marks.length,
      vault, phish: this.phish.count(),
      afSounds: this.prefs.afSounds, lockAfter: this.prefs.lockAfter,
      autofill: { details: this.details.get(), pin: this.pinSeal.has(), pinLen: this.pinSeal.has() ? this.pinSeal.length() : 0, sounds: this.prefs.afSounds },
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
      // Autofill (sheet 77): his details, the sound switch, and his PIN (set while Bitwarden is open).
      case 'afDetails': this.details.set(cleanDetails(value)); this.sync?.changed('prefs'); break;
      case 'afSounds': this.prefs.afSounds = value === true; this.savePrefs(); break;
      case 'afPin': void this.afSetPin(value); return;
      case 'lockAfter': this.prefs.lockAfter = lockPick(value); this.vault.setLockAfter(LOCK_AFTER[this.prefs.lockAfter]); this.savePrefs(); break;
      case 'tabSize': {
        this.tabSize = value === 's' || value === 'm' ? value : 'l';
        try { writeFileAtomic(this.localFile, JSON.stringify({ tabSize: this.tabSize })); } catch { /* this run only */ }
        // The list layer hears it at once, open or not, so its next slide starts at the new width.
        for (const p of this.panes) {
          // ...and is drawn again out of sight at the new size, so the first open after the change is smooth too.
          if (p.trayV && !p.trayV.webContents.isDestroyed()) { p.trayV.webContents.send('browser:tray', { size: this.tabSize }); if (!p.trayOn) { const v = p.trayV; setTimeout(() => this.warmTray(p, v), 150); } }
          if (p.trayOn) { const was = this.pane; this.pane = p; this.placeTray(); this.pane = was; }
        }
        break;
      }
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
    else if (list !== 'trusted' && list !== 'httpOk') return;
    if (list === 'trusted' && this.peerTrusted.delete(v)) save(this.trustedFile.replace(/[.]json$/, '-other.json'), this.peerTrusted);
    if (list === 'httpOk' && this.peerHttp.delete(v)) save(this.httpOkFile.replace(/[.]json$/, '-other.json'), this.peerHttp);
    if (list !== 'marks') this.sync?.changed('prefs');
    this.sendTabs();
    this.pushSettings();
  }
  /**
   * Sheet 83 (his pick, 2026-10-23): the address he is typing in Settings, looked up with OpenStreetMap (Photon), so he
   * picks it and the rest fills in. Only what he typed in that box goes out, and only from Settings; answers are plain text.
   */
  async addressLookup(text: string): Promise<{ line: string; street: string; city: string; region: string; postal: string; country: string }[]> {
    const q = String(text ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);
    if (q.length < 4) return [];
    const clip = (v: unknown, n = 120) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
    try {
      const r = await within(net.fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en`, { credentials: 'omit', redirect: 'error' }).then((x) => (x.ok ? x.json() : null)), 6000, null);
      const out: { line: string; street: string; city: string; region: string; postal: string; country: string }[] = [];
      for (const f of (r as { features?: { properties?: Record<string, unknown> }[] } | null)?.features ?? []) {
        const p = f.properties ?? {};
        const road = clip(p.street ?? (p.type === 'street' ? p.name : ''));
        if (!road) continue;
        const street = [clip(p.housenumber, 20), road].filter(Boolean).join(' ');
        const city = clip(p.city ?? p.town ?? p.village ?? p.district ?? p.county), region = clip(p.state), postal = clip(p.postcode, 20).toUpperCase(), country = clip(p.country, 80);
        const line = [street, city, region].filter(Boolean).join(', ');
        if (!out.some((o) => o.line === line)) out.push({ line, street, city, region, postal, country });
        if (out.length === 5) break;
      }
      return out;
    } catch { return []; }
  }
  settingsAct(act: string): void {
    if (act === 'import') void this.importMarks().then(() => this.pushSettings());
    else if (act === 'import-chrome' || act === 'import-safari') void this.importFrom(act === 'import-chrome' ? 'chrome' : 'safari').then(() => this.pushSettings());
    else if (act === 'lockvault') { this.vault.lock(); this.pushSettings(); }
    else if (act === 'afforgetpin') { this.pinSeal.wipe(); this.pushSettings(); }
    else if (act === 'signout') { this.pinSeal.wipe(); void this.vault.signOut().then(() => this.pushSettings()); }
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

  /**
   * Freeze or thaw a tab's page through Chromium's own developer channel (Page.setWebLifecycleState, tested in this engine
   * 2026-10-23: timers stop, and stay stopped after the channel is let go; thawing picks up where it left off). Never a
   * page Claude's driver holds that channel on.
   */
  private async freeze(t: Tab, on: boolean): Promise<void> {
    const wc = t.view?.webContents;
    if (!wc || wc.isDestroyed() || Boolean(t.frozen) === on) return;
    const dbg = wc.debugger;
    if (dbg.isAttached()) return;
    if (on) { const at = await within(wc.executeJavaScriptInIsolatedWorld(1003, [{ code: VIDEO_AT_JS }]) as Promise<number | null>, 800, null); if (typeof at === 'number') t.videoAt = at; }
    try {
      dbg.attach('1.3');
      await within(dbg.sendCommand('Page.setWebLifecycleState', { state: on ? 'frozen' : 'active' }), 1500, null);
      t.frozen = on;
    } catch { /* this page will not: it stays as it was */ }
    finally { try { if (dbg.isAttached()) dbg.detach(); } catch { /* gone */ } }
  }
  thaw(t: Tab): void { if (t.frozen) void this.freeze(t, false); }
  /** Before a tab sleeps: his spot in its video (a frozen page told it as it froze), and its picture if none is kept. */
  async rest(t: Tab): Promise<void> {
    if (!t.view) return;
    if (!t.frozen) { const at = await within(t.view.webContents.executeJavaScriptInIsolatedWorld(1003, [{ code: VIDEO_AT_JS }]) as Promise<number | null>, 800, null); if (typeof at === 'number') t.videoAt = at; }
    if (!t.leftShot) { const shot = await this.shotOf(t); if (shot) t.leftShot = shot; }
    this.sleep(t);
  }
  /** Put a tab to sleep: its page closes, its snapshot stays, the plaque sinks. */
  private sleep(tab: Tab): void {
    if (!tab.view) return;
    // Its page comes back where it was when it wakes (Chromium's own state, kept with the tab).
    try { const h = tab.view.webContents.navigationHistory; const s = h.getEntryAtIndex(h.getActiveIndex())?.pageState; if (s && s.length <= PAGE_STATE_MAX && !tab.mock) tab.pageState = s; } catch { /* the scroll is kept as before */ }
    this.closeView(tab);
    tab.loading = false; tab.audible = false; tab.frozen = false; tab.slept = true;
  }
  private closeView(tab: Tab): void {
    if (!tab.view) return;
    const p = this.paneOfTab(tab);
    try { if (this.alive(p)) p.win!.contentView.removeChildView(tab.view); } catch { /* not shown */ }
    try { tab.view.webContents.close(); } catch { /* gone */ }
    tab.view = null;
  }
  /**
   * Tabs sleep the way Chrome's Memory Saver and Edge's sleeping tabs do (2026-10-23, his report: coming back to a sleeping
   * tab, a video above all, was slow and looked broken). A tab in the background already costs almost nothing (throttled,
   * its video paused), so it stays alive and comes back instantly. Only when the computer is short on memory do tabs
   * sleep, the one unseen longest first, a few at a time until it is comfortable; and any tab unseen for 8 hours.
   */
  private async sleepIdle(): Promise<void> {
    const now = Date.now();
    const can = (t: Tab) => t.view && !t.lent && !t.call && !t.internal && !this.panes.some((p) => p.active === t.id) && !t.audible && now - t.lastSeen > SLEEP_MIN_MS;
    let any = false;
    // Frozen first: out of sight for 5 minutes and silent; a call, the pop-out and Claude's work never.
    for (const t of this.tabs) if (t.view && !t.frozen && !t.lent && !t.call && !t.internal && !t.audible && !this.panes.some((p) => p.active === t.id) && now - t.lastSeen > FREEZE_AFTER_MS) await this.freeze(t, true);
    const rest = async (t: Tab) => { await this.rest(t); any = true; };
    for (const t of this.tabs) if (can(t) && now - t.lastSeen > SLEEP_AFTER_MS) await rest(t);
    if (await memoryShort()) {
      for (const t of this.tabs.filter(can).sort((a, b) => a.lastSeen - b.lastSeen).slice(0, 3)) await rest(t);
    }
    if (any) this.sendTabs();
  }

  newTab(address: string, opener: number | null = null, focus = true): number | null {
    const w = this.win;
    if (!w || w.isDestroyed()) return null;
    const url = isWeb(address) ? address : addressFor(address, this.engine);
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
    // 2026-10-25 (his "I just wanted to see that a new tab is being opened"): a tab opened from a link while the list is
    // closed counts on the tab arrow (it breathes and shows +1) until he opens the list.
    if (opener !== null && !this.trayOn) this.newSince++;
    // His own new tab, or a link he just clicked: it may play. Tabs Samara reopens never come through here.
    if (opener === null || Date.now() - (this.lastGesture.get(opener) ?? 0) < PLAY_MS) tab.playOkAt = Date.now();
    this.wake(tab);
    if (focus) this.activate(tab.id); else { this.changed(); this.quietHidden(); }
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
    if (prev) this.scrollDue.add(prev.id);             // its scroll is saved at the next save
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
      this.quietHidden();
      return;
    }
    if (!t.view) this.wake(t);                         // an asleep tab wakes exactly where it was left
    else this.thaw(t);                                 // a frozen one thaws, instantly
    if (this.watching !== null) this.unwatch(false);
    if (this.veil && this.veil.tab !== id) this.veilDown(0);
    if (this.af && this.af.tab !== id) { this.af = null; this.afPin = null; this.lightHide(); this.afBand(); }
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
    this.quietHidden();
    this.mockSeen();
  }

  /** Close a tab. Closing his last tab closes the window, as in every browser (his note, 2026-10-12). */
  close(id: number, lastClosesWindow = true): void {
    const i = this.tabs.findIndex((x) => x.id === id);
    if (i < 0) return;
    if (STREMIO_WEB.test(this.tabs[i]!.url)) this.stremioMoved(this.tabs[i]!, 'about:closed');
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
        if (!this.tabs.length && this.restored) {
          this.keepTabsCopy('empty');
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
    // His mouse rests on a sleeping tab: it starts loading out of sight (no sound until he looks: waking holds it).
    else if (act === 'prewake') { if (!t.view && !t.lent && !t.internal && !t.mock) { this.wake(t); this.sendTabs(); } else this.thaw(t); }
    else if (act === 'close') this.close(id);
    else if (act === 'mute') { t.muted = !t.muted; t.view?.webContents.setAudioMuted(t.muted); this.changed(); }
    else if (act === 'reload') { if (t.view && !t.crashed) t.view.webContents.reload(); else if (t.id === this.active) this.act('reload'); }
    else if (act === 'newwindow') this.newWindowFor(id);
    else if (act === 'tvwindow') void this.tvWindow(t);
    else if (act === 'tvvideo') void this.tvVideo(t);
    else if (act === 'done') this.markDone(id, true);
    else if (act === 'undone') this.markDone(id, false);
  }

  reopen(): void { const u = this.closed.pop(); if (u) this.newTab(u); }
  /**
   * An item from Samara's taskbar right-click list (his ask, 2026-10-21; jumplist.ts). Samara comes forward, or opens
   * if it was closed (his tabs come back first, as always), then does the one thing. New window opens another window
   * beside the one he has. Reopen closed tab with Samara closed simply opens it: his tabs coming back IS the reopen.
   */
  jumpTask(task: 'new-tab' | 'new-window' | 'mockups' | 'settings' | 'reopen'): void {
    if (task === 'new-window') { this.createPane(); return; }
    const go = () => {
      if (task === 'new-tab') this.act('newtab');
      else if (task === 'settings') this.openSettings();
      else if (task === 'mockups') { if (this.mockupsOn) this.reopenMockups(); }
      else if (task === 'reopen') this.reopen();
    };
    const p = this.lastPane();
    if (p) { this.pane = p; bringFront(p.win!); go(); return; }
    if (task === 'reopen' || (task === 'mockups' && !this.mockupsOn)) { this.createPane(); return; }
    this.whenOpen.push(go);
    this.createPane();
  }

  /**
   * A popup he opened (Sign in with Google and the like): the same safety as a tab. Its real address is its title,
   * so a fake sign-in window cannot hide where it is. Web pages only, fake sites refused, no popups of its own
   * except the same Chrome rule, and it closes itself when the sign-in is done.
   */
  private popupWindow(pw: BrowserWindow): void {
    const pwc = pw.webContents;
    softEdge(pw);
    this.nameFor(pwc);
    try { if (HONEST_SITES.test(pwc.getURL())) pwc.setUserAgent(this.honestUA); } catch { /* not yet */ }
    const name = () => { try { const u = new URL(pwc.getURL()); pw.setTitle(`${u.protocol === 'https:' ? '' : 'NOT SECURE  '}${u.hostname}  -  ${pwc.getTitle()}`.slice(0, 200)); } catch { /* not yet */ } };
    pwc.on('page-title-updated', name);
    pwc.on('did-navigate', name);
    const stop = (e: Electron.Event, u: string) => {
      if (!isWeb(u)) { e.preventDefault(); return; }
      if (this.listed(u).length) { e.preventDefault(); pw.close(); this.note('A popup tried to open a site on the fake-site lists. It was closed.'); }
    };
    pwc.on('will-navigate', stop);
    pwc.on('will-redirect', (e, u, _inPage, isMain) => { if (isMain) stop(e, u); });
    // What a popup opens becomes a tab only on his click in the popup (finding 7).
    let pClick = 0;
    pwc.on('input-event', (_e, i) => { if (i.type === 'mouseDown' || i.type === 'keyDown') pClick = Date.now(); });
    pwc.setWindowOpenHandler(({ url: u }) => { if (isWeb(u) && !this.listed(u).length && (!this.prefs.popups || Date.now() - pClick < GESTURE_MS)) this.newTab(u, this.active, true); return { action: 'deny' }; });
    pwc.on('will-attach-webview', (e) => e.preventDefault());
  }

  // ------------------------------------------------------------------ 6.22b: side buttons, the window's place, the right-click menu
  private sideNav(dir: 'back' | 'forward'): void {
    const now = Date.now();
    if (now - this.lastNav < 250) return;
    this.lastNav = now;
    this.act(dir);
  }

  /** The square key's menu (2026-10-23, his ask: "act like any other window"): fill, halves, his other screens, full screen. */
  private windowMenu(): void {
    const w = this.win;
    if (!w || w.isDestroyed()) return;
    const here = screen.getDisplayMatching(w.getBounds()), a = here.workArea, half = Math.floor(a.width / 2);
    const put = (r: Electron.Rectangle) => { if (w.isFullScreen()) w.setFullScreen(false); if (w.isMaximized()) w.unmaximize(); w.setBounds(r, true); };
    const others = screen.getAllDisplays().filter((d) => d.id !== here.id);
    const moveTo = (d: Electron.Display) => {
      const b = w.isMaximized() ? null : w.getBounds(), t = d.workArea;
      if (!b) { w.unmaximize(); w.setBounds({ ...t }, true); w.maximize(); return; }
      const width = Math.min(b.width, t.width), height = Math.min(b.height, t.height);
      put({ x: t.x + Math.min(Math.max(0, b.x - a.x), t.width - width), y: t.y + Math.min(Math.max(0, b.y - a.y), t.height - height), width, height });
    };
    Menu.buildFromTemplate([
      { label: w.isMaximized() ? 'Back to its size' : 'Fill the screen', click: () => { if (w.isMaximized()) w.unmaximize(); else w.maximize(); } },
      { label: 'Left half', click: () => put({ x: a.x, y: a.y, width: half, height: a.height }) },
      { label: 'Right half', click: () => put({ x: a.x + half, y: a.y, width: a.width - half, height: a.height }) },
      ...(others.length ? [{ type: 'separator' as const }, ...others.map((d, i) => ({ label: `Move to ${d.label || (others.length > 1 ? `screen ${i + 2}` : 'the other screen')}`, click: () => moveTo(d) }))] : []),
      { type: 'separator' },
      { label: w.isFullScreen() ? 'Leave full screen' : 'Full screen', click: () => w.setFullScreen(!w.isFullScreen()) },
    ]).popup({ window: w });
  }
  /** Option + drag anywhere on the frame (2026-10-23, his "the wood is thin, it has to be airtight"): the window follows. */
  private dragFrom: { x: number; y: number; wx: number; wy: number } | null = null;
  winDrag(sender: Electron.WebContents, phase: string, x: number, y: number): void {
    const w = BrowserWindow.fromWebContents(sender);
    if (!w || w.isDestroyed() || w.isFullScreen()) return;
    if (phase === 'start') { if (w.isMaximized()) return; const [wx, wy] = w.getPosition(); this.dragFrom = { x, y, wx: wx!, wy: wy! }; return; }
    const d = this.dragFrom;
    if (!d) return;
    if (phase === 'move') w.setPosition(d.wx + x - d.x, d.wy + y - d.y);
    else this.dragFrom = null;
  }
  private backToSetupSpot(): void {
    const w = this.panes[0]?.win;
    if (!w || w.isDestroyed() || w.isFullScreen()) return;
    let p: { x: number; y: number; width: number; height: number; maximized?: boolean } | undefined;
    try { p = JSON.parse(readFileSync(this.placeFile, 'utf8'))?.setups?.[this.screensNow()]; } catch { return; }
    if (!p || ![p.x, p.y, p.width, p.height].every(Number.isFinite)) return;
    if (w.isMaximized()) w.unmaximize();
    w.setBounds({ x: Math.round(p.x), y: Math.round(p.y), width: Math.round(p.width), height: Math.round(p.height) });
    if (p.maximized) w.maximize();
  }
  /** Which screens are plugged in, as a name for this setup: the laptop alone, or with the monitor (2026-10-23). */
  private screensNow(): string { return screen.getAllDisplays().map((d) => `${d.id}:${d.bounds.width}x${d.bounds.height}`).sort().join('|'); }
  /** Where the window was last time, if that spot is still on a screen he has. */
  private savedPlace(): { x: number; y: number; width: number; height: number; maximized: boolean } | null {
    try {
      if (!existsSync(this.placeFile)) return null;
      const all = JSON.parse(readFileSync(this.placeFile, 'utf8'));
      // Each screen setup keeps its own spot (his pick, 2026-10-23); a setup never seen yet uses the last one.
      const p = all?.setups?.[this.screensNow()] ?? all;
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
    const spot = { ...b, maximized: w.isMaximized() };
    let setups: Record<string, unknown> = {};
    try { setups = JSON.parse(readFileSync(this.placeFile, 'utf8'))?.setups ?? {}; } catch { /* first time */ }
    try { writeFileAtomic(this.placeFile, JSON.stringify({ ...spot, setups: { ...setups, [this.screensNow()]: spot } })); } catch { /* best effort */ }
  }

  /** Build the right-click menu for what was clicked: a link, a picture, selected words, a text box, or the page. */
  private pageMenu(tab: Tab, p: Electron.ContextMenuParams): void {
    const w = this.win;
    const wc = tab.view?.webContents;
    if (!w || w.isDestroyed() || !wc || tab.lent) return;
    // Sheet 62 (his pick, 2026-10-22): the items are built in sendtoaang.ts, with "Send to Aang" first in every menu.
    const items = pageMenuItems(p, {
      send: Boolean(this.onSendToAang) && !tab.internal, other: this.onOpenOther ? OTHER_OPEN : null, popout: Boolean(this.onPlayInPopout),
      popVideo: Boolean(this.popTab) && !tab.internal, canBack: wc.navigationHistory.canGoBack(), pageIsWeb: isWeb(tab.url),
    });
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
    // His report (2026-10-20): picking a spelling did nothing. The menu is its own window, so while it was open the tab's
    // window lost the keyboard, and the word was replaced in a page that was not focused. Give Samara's window the
    // keyboard back, then the tab, then replace once that has landed.
    const pw = this.panes.find((x) => x.id === t.pane)?.win;
    if (pw && !pw.isDestroyed()) pw.focus();
    wc.focus();
    const spell = /^spell([0-4])$/.exec(id);
    if (spell) { const s = p.dictionarySuggestions[Number(spell[1])]; if (s) setTimeout(() => { if (!wc.isDestroyed()) wc.replaceMisspelling(s); }, 40); return; }
    switch (id) {
      case 'linktab': if (isWeb(p.linkURL)) this.newTab(p.linkURL, t.id, false); break;
      case 'linkcopy': if (isWeb(p.linkURL)) clipboard.writeText(p.linkURL); break;
      case 'linksave': if (isWeb(p.linkURL)) wc.downloadURL(p.linkURL); break;
      case 'linkpop': if (isWeb(p.linkURL)) this.onPlayInPopout?.(p.linkURL); break;
      case 'vidpop': this.popTab?.(t.id); break;
      case 'toaang': void this.sendToAang(t, p); break;
      case 'linkother': if (isWeb(p.linkURL)) this.onOpenOther?.(p.linkURL); break;
      case 'openother': if (isWeb(t.url)) { this.onOpenOther?.(t.url); this.pauseMedia(t.id); } break;
      case 'imgsave': if (p.srcURL) wc.downloadURL(p.srcURL); break;
      case 'imgcopy': wc.copyImageAt(p.x, p.y); break;
      case 'cut': wc.cut(); break;
      case 'copy': wc.copy(); break;
      case 'paste': wc.paste(); break;
      case 'selectall': wc.selectAll(); break;
      case 'search': { const q = p.selectionText.replace(/\s+/g, ' ').trim().slice(0, 400); if (q) this.newTab(searchFor(q, this.engine), t.id, true); break; }
      case 'back': if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); break;
      case 'reload': wc.reload(); break;
      case 'learn': if (p.misspelledWord) wc.session.addWordToSpellCheckerDictionary(p.misspelledWord); break;
    }
  }

  /**
   * Sheet 62: "Send to Aang" on whatever he right-clicked: the words, the picture, the link, or the page (empty space).
   * The page is someone else's: its title, words and picture are data for Aang, quoted and never obeyed (sendtoaang.ts).
   * A picture is fetched by the tab's own session (his sign-ins, the same rules), 8 MB at most, and handed over as an
   * image, never as anything to run; the page's text is read with a deadline and cut short.
   */
  private async sendToAang(t: Tab, p: Electron.ContextMenuParams): Promise<void> {
    const wc = t.view?.webContents;
    const kind = sendKindFor(p, isWeb(t.url));
    if (!kind || !wc || wc.isDestroyed()) return;
    const site = hostOf(t.url) || 'a page';
    const base = { kind, site, url: isWeb(t.url) ? t.url : '', samara: true, icon: this.faviconFor(t.url) };
    if (kind === 'words') { this.onSendToAang?.({ ...base, text: p.selectionText, title: t.title }); return; }
    if (kind === 'link') { this.onSendToAang?.({ ...base, url: p.linkURL, title: p.linkText || '', site: hostOf(p.linkURL) || site, icon: this.faviconFor(p.linkURL) || base.icon }); return; }
    if (kind === 'page') {
      const text = await within(askPage<string>(wc, 'String(document.body ? document.body.innerText : "").slice(0, 6000)'), 1500, '');
      this.onSendToAang?.({ ...base, title: wc.getTitle() || t.title, text: typeof text === 'string' ? text : '' });
      return;
    }
    // A picture: fetched with the tab's own session, 8 MB at most, and only if it really is a picture.
    let img: Electron.NativeImage | undefined;
    try {
      if (/^data:image\//.test(p.srcURL)) img = nativeImage.createFromDataURL(p.srcURL.slice(0, 12_000_000));
      else if (isWeb(p.srcURL)) {
        const r = await within<Response | null>(wc.session.fetch(p.srcURL), 8000, null);
        if (r && r.ok && /^image\//.test(r.headers.get('content-type') ?? '') && Number(r.headers.get('content-length') ?? 0) <= 8_000_000) {
          const buf = Buffer.from(await r.arrayBuffer());
          if (buf.length <= 8_000_000) img = nativeImage.createFromBuffer(buf);
        }
      }
    } catch { img = undefined; }
    this.onSendToAang?.({ ...base, title: p.altText || p.titleText || '' }, img && !img.isEmpty() ? img : undefined);
  }

  // ------------------------------------------------------------------ 6.23 the vault (Bitwarden)
  /** A password box on the page he is looking at? Read-only, with a deadline. Secure pages only. */
  private async lookForLogin(): Promise<void> {
    // Perf sweep (2026-10-22, item 10 of samara-perf-baseline.md): this asked the tab in front for a password box every
    // 1.5 s all day, behind WoW and minimised too, waking that page's process each time. The key is only for a page he is
    // looking at, so only while one of Samara's windows has the focus; back in Samara, the next look (within 1.5 s) runs.
    const focused = BrowserWindow.getFocusedWindow();
    if (!focused || !this.panes.some((p) => p.win === focused)) return;
    const lp = this.lastPane();
    if (lp) this.pane = lp;
    const t = this.cur();
    const wc = t?.view?.webContents;
    let has = false;
    if (wc && !t!.crashed && !t!.blocked && !t!.failed && !t!.lent && t!.url.startsWith('https:')) {
      has = await within(askPage<boolean>(wc, "!!document.querySelector('input[type=password]')"), 800, false) === true;
    }
    // His pick: the key shows only where Bitwarden has a login for this site. Until the vault has been opened once
    // there is no list yet, so it shows on any login page, plain, so he can open it the first time.
    let known = false;
    if (has && this.sites) { let host = ''; try { host = new URL(t!.url).hostname; } catch { /* none */ } known = this.siteKnown(host); has = known; }
    if (has !== this.hasLogin || known !== this.loginKnown) { this.hasLogin = has; this.loginKnown = known; this.sendTabs(); }
  }
  private loginKnown = false;
  /** The site itself (with or without www), scrambled with this PC's own key, against the list. Not its parent domains:
   *  a login for example.com is not for forum.example.com (finding 3). */
  private siteKnown(host: string): boolean {
    if (!this.sites || !host) return false;
    const h = host.toLowerCase().replace(/^www\./, '');
    return this.sites.has(scramble(this.siteKey, h)) || this.sites.has(scramble(this.siteKey, 'www.' + h));
  }
  /** After an unlock: which sites have logins, kept only as scrambled names. */
  private async learnSites(): Promise<void> {
    const hosts = await this.vault.loginHosts();
    if (!hosts) return;
    if (!this.siteKey) this.siteKey = randomBytes(32).toString('hex');
    this.sites = new Set(hosts.map((h) => scramble(this.siteKey, h)));
    try { const locked = lockKey(this.siteKey); writeFileAtomic(this.sitesFile, JSON.stringify({ ...(locked ? { keyLocked: locked } : { key: this.siteKey }), sites: [...this.sites] })); } catch { /* best effort */ }
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

  // ------------------------------------------------------------------ autofill (sheet 77, his interview 2026-10-23)
  /** The box he is in, on the page in front: what it is, its neighbours' kinds, where it is (page pixels). */
  private af: { tab: number; kind: FieldKind; kinds: FieldKind[]; empty: boolean; rect: { x: number; y: number; w: number; h: number };
    offer: 'details' | 'login' | null; email: number; logins: Login[]; login: number } | null = null;
  /** The address bar asking for his PIN: the digits so far (never shown, never kept), and what to do once it opens. */
  private afPin: { digits: string; then: 'fill' | 'save'; checking?: boolean } | null = null;
  /** A login he just sent on a page, waiting for him to look at it (kept in memory only, five minutes at most). */
  private afSave: { tab: number; host: string; user: string; pass: string; at: number; asked: boolean } | null = null;
  private afBandMode: 'idle' | 'pin' | 'save' = 'idle';

  /** The light's layer for this window, made once and kept hidden. */
  private lightView(): WebContentsView | null {
    const w = this.win;
    if (!w || w.isDestroyed()) return null;
    if (this.pane.lightV && !this.pane.lightV.webContents.isDestroyed()) return this.pane.lightV;
    const v = new WebContentsView({ webPreferences: { ...SAFE_WEB_PREFERENCES, preload: path.join(path.dirname(this.o.preloadPath), 'lightpreload.cjs'), backgroundThrottling: false } });
    lockDown(v.webContents);
    v.setBackgroundColor('#00000000');
    v.setVisible(false);
    void v.webContents.loadURL(`${this.o.origin}/light.html`);
    this.pane.lightV = v;
    return v;
  }
  isLight(sender: Electron.WebContents): boolean {
    const p = this.panes.find((x) => x.lightV && !x.lightV.webContents.isDestroyed() && x.lightV.webContents === sender);
    if (p) this.pane = p;
    return Boolean(p);
  }
  /** Each showing has a number, so a fade that ends after a new showing never hides the new one. */
  private lightSeq = 0;
  private lightHide(): void {
    const seq = ++this.lightSeq;
    // The layer goes with its light (after the 90 ms fade): an invisible layer left over the page would catch his clicks.
    for (const p of this.panes) { const v = p.lightV; if (v && !v.webContents.isDestroyed() && v.getVisible()) { v.webContents.send('light:show', null); setTimeout(() => { if (seq === this.lightSeq && !v.webContents.isDestroyed()) v.setVisible(false); }, 100); } }
  }
  /** Beside the box: right of it, half a light's height above its middle. */
  private lightShow(m: { item: 'letter' | 'card' | 'key'; text: string; count: string }): void {
    const a = this.af, t = a ? this.tabs.find((x) => x.id === a.tab) : undefined, v = this.lightView(), w = this.win;
    if (!a || !t?.view || !v || !w || t.id !== this.active || this.drawerOpen) return;
    const vb = t.view.getBounds(), z = t.view.webContents.getZoomFactor();
    const W = 440, H = 44;
    const x = Math.round(vb.x + (a.rect.x + a.rect.w) * z + 2), y = Math.round(vb.y + (a.rect.y + a.rect.h / 2) * z - H / 2);
    if (y < vb.y - 4 || y + H > vb.y + vb.height + 4) return;            // the box is off the page's visible part
    v.setBounds({ x, y, width: Math.max(60, Math.min(W, vb.x + vb.width - x)), height: H });
    this.lightSeq++;
    w.contentView.addChildView(v);                                          // on top of the page
    v.setVisible(true);
    v.webContents.send('light:show', m);
  }
  /** What the light offers for the box he is in, if anything; null hides it. */
  private async afDecide(): Promise<void> {
    const a = this.af, t = a ? this.tabs.find((x) => x.id === a.tab) : undefined;
    if (!a || !t?.view || !a.empty) { this.lightHide(); return; }
    const url = t.view.webContents.getURL();
    if (!url.startsWith('https:') || this.listed(url).length) { this.lightHide(); return; }
    let host = ''; try { host = new URL(url).hostname; } catch { return; }
    const loginBox = a.kind === 'password' || ((a.kind === 'username' || a.kind === 'email') && a.kinds.includes('password'));
    if (loginBox) {
      if (this.vault.current()) {
        const logins = await this.vault.loginsFor(url);
        if (this.af !== a) return;
        if (logins && logins.length) { a.offer = 'login'; a.logins = logins; a.login = 0; this.lightShow(this.afLoginLabel()); return; }
      } else if (a.kind === 'password' && (this.siteKnown(host) || !this.sites)) {
        // Bitwarden is locked and this site has a login: the bar calls him for his PIN (or the master password).
        this.lightHide();
        if (this.pinSeal.has()) { this.afPin = { digits: '', then: 'fill' }; this.afBand('call'); }
        else { this.afBand('call'); void this.vaultKey(); }
        return;
      }
    }
    if (DETAIL_KINDS.includes(a.kind)) {
      const d = this.details.get(), v = detailFor(d, a.kind, 0);
      if (v || (a.kind !== 'email' && d.name)) { a.offer = 'details'; a.email = 0; this.lightShow(this.afDetailsLabel()); return; }
    }
    a.offer = null; this.lightHide();
  }
  private afLoginLabel() { const a = this.af!; const l = a.logins[a.login]!; return { item: 'key' as const, text: l.username || l.name, count: a.logins.length > 1 ? `${a.login + 1}/${a.logins.length}` : '' }; }
  private afDetailsLabel() {
    const a = this.af!, d = this.details.get();
    if (a.kind === 'email') return { item: 'letter' as const, text: d.emails[a.email] ?? '', count: d.emails.length > 1 ? `${a.email + 1}/${d.emails.length}` : '' };
    return { item: 'card' as const, text: d.name || detailFor(d, a.kind), count: '' };
  }
  /** The tab says which box he is in (or none, or that he is typing). */
  afField(sender: Electron.WebContents, m: unknown): void {
    const t = this.tabs.find((x) => x.view?.webContents === sender);
    if (!t || t.id !== this.active) return;
    const o = m as { kind?: unknown; kinds?: unknown; empty?: unknown; rect?: Record<string, unknown>; typing?: unknown } | null;
    if (!o) { this.af = null; this.lightHide(); if (this.afPin) setTimeout(() => { if (!this.af && this.afPin) { this.afPin = null; this.afBand(); } }, 400); return; }
    if (o.typing) { if (this.af) this.af.empty = false; this.lightHide(); return; }
    const kinds = (Array.isArray(o.kinds) ? o.kinds : []).filter((k): k is FieldKind => typeof k === 'string' && /^[a-z]{3,12}$/.test(k)).slice(0, 12);
    const kind = typeof o.kind === 'string' && /^[a-z]{3,12}$/.test(o.kind) ? o.kind as FieldKind : null;
    const r = o.rect ?? {}, rect = { x: Number(r.x) || 0, y: Number(r.y) || 0, w: Number(r.w) || 0, h: Number(r.h) || 0 };
    if (!kind) { this.af = null; this.lightHide(); return; }
    this.af = { tab: t.id, kind, kinds, empty: o.empty === true, rect, offer: null, email: 0, logins: [], login: 0 };
    void this.afDecide();
  }
  /** Keys taken for his PIN whose release has not come yet (finding 1). */
  private afTaken = new Set<string>();
  /** He clicked the light, or pressed Tab while it showed (`one`: Tab fills only the box he is in, finding 2). */
  async afPick(one = false): Promise<void> {
    const a = this.af, t = a ? this.tabs.find((x) => x.id === a.tab) : undefined, wc = t?.view?.webContents;
    if (!a || !t || !wc || wc.isDestroyed() || !a.offer) return;
    this.pane.lightV?.webContents.send('light:show', { give: true });
    if (a.offer === 'login') {
      const l = a.logins[a.login];
      const s = l ? await this.vault.secret(l.id) : null;
      if (!s || this.af !== a) return;
      await within(wc.executeJavaScriptInIsolatedWorld(1001, [{ code: fillScript(s.username, s.password) }]) as Promise<number>, 2000, 0);
    } else {
      const d = this.details.get(), values: Partial<Record<FieldKind, string>> = {};
      for (const k of DETAIL_KINDS) { const v = detailFor(d, k, k === 'email' ? a.email : 0); if (v) values[k] = v; }
      // Tab fills the box he is in; his click on the light fills the form, and the fill itself finds the form's boxes
      // (never the page's own list of them) and skips any he cannot see (finding 2).
      const whole = !one;
      await within(wc.executeJavaScriptInIsolatedWorld(1001, [{ code: fillDetailsScript(values, whole) }]) as Promise<number>, 2000, 0);
    }
    this.afSound('fill');
    a.empty = false;
    setTimeout(() => this.lightHide(), 120);
  }
  /** The wheel on the light, or an arrow key in the box: his next email (or login). */
  afFlick(d: number): void {
    const a = this.af;
    if (!a?.offer) return;
    if (a.offer === 'login' && a.logins.length > 1) { a.login = (a.login + d + a.logins.length) % a.logins.length; this.pane.lightV?.webContents.send('light:show', { flick: true, ...this.afLoginLabel() }); }
    const n = this.details.get().emails.length;
    if (a.offer === 'details' && a.kind === 'email' && n > 1) { a.email = (a.email + d + n) % n; this.pane.lightV?.webContents.send('light:show', { flick: true, ...this.afDetailsLabel() }); }
  }
  /** Keys in the page, before the page sees them. True: autofill took it. */
  afKey(tab: Tab, input: Electron.Input): boolean {
    // Security check 2026-10-24 (finding 1): a key taken for his PIN is taken whole. Stopping only the press let the page
    // hear each release, and read the PIN from it; the release of the last number comes after the PIN is done, so the
    // keys taken are remembered until they come up.
    if (input.type === 'keyUp') { if (this.afTaken.delete(input.code || input.key)) return true; return false; }
    if (input.type !== 'keyDown' || tab.id !== this.active) return false;
    if (this.afPin) {
      const take = () => { this.afTaken.add(input.code || input.key); return true; };
      if (/^[0-9]$/.test(input.key) && !input.meta && !input.control) { void this.afPinDigit(input.key); return take(); }
      if (input.key === 'Backspace') { this.afPin.digits = this.afPin.digits.slice(0, -1); this.afBand(); return take(); }
      if (input.key === 'Escape') { this.afPin = null; this.afBand(); return take(); }
      return false;
    }
    const a = this.af;
    if (!a?.offer || !a.empty || !this.pane.lightV?.getVisible()) return false;
    if (input.key === 'Tab' && !input.shift && !input.meta && !input.control && !input.alt) { void this.afPick(true); return true; }
    if ((input.key === 'ArrowDown' || input.key === 'ArrowUp') && !input.shift && !input.meta) {
      const many = a.offer === 'login' ? a.logins.length > 1 : a.kind === 'email' && this.details.get().emails.length > 1;
      if (!many) return false;
      this.afFlick(input.key === 'ArrowDown' ? 1 : -1); return true;
    }
    return false;
  }
  private async afPinDigit(d: string): Promise<void> {
    const p = this.afPin;
    const len = this.pinSeal.length();
    if (!p || p.checking || p.digits.length >= len) return;   // keys while a PIN is being checked are dropped
    p.digits += d;
    this.afBand();
    if (p.digits.length < len) return;
    p.checking = true;
    const r = await this.pinSeal.open(p.digits);
    p.digits = ''; p.checking = false;
    if (r === 'gone') { this.afPin = null; this.vault.lockHard(); this.afBand('wrong'); this.note('Five wrong PINs: Bitwarden needs your master password again.'); void this.vaultKey(); return; }
    if ('wrong' in r) { this.afBand('wrong'); return; }
    const ok = await this.vault.useSession(r.session);
    this.afPin = null;
    if (!ok) { this.pinSeal.wipe(); this.afBand(); this.note('Bitwarden wants your master password again.'); void this.vaultKey(); return; }
    this.afBand('open');
    void this.learnSites();
    if (p.then === 'save') { this.afSaveAsk(); return; }
    // Open now: the light offers the login, and his click on it fills (finding 3: the PIN alone filled at once, even on a
    // page that had only put a password box in front of him).
    setTimeout(() => { void this.afDecide(); }, 450);
  }
  /** His PIN, from Settings, while Bitwarden is open: typed twice, sealed with the session. */
  private async afSetPin(value: unknown): Promise<void> {
    const v = (value && typeof value === 'object' ? value : {}) as { pin?: unknown; again?: unknown };
    const pin = String(v.pin ?? ''), again = String(v.again ?? '');
    const say = (text: string, ok = false) => { this.pushSettings(); const wc = this.tabs.find((x) => x.internal === 'settings')?.view?.webContents; if (wc && !wc.isDestroyed()) wc.send('settings:afpin', { ok, text }); };
    if (!pinOk(pin)) { say(`A PIN is ${PIN_MIN} to ${PIN_MAX} numbers.`); return; }
    if (!samePin(pin, again)) { say('The two did not match.'); return; }
    const session = this.vault.current();
    if (!session) { say('Open Bitwarden once first (use a login), then set your PIN.'); return; }
    say((await this.pinSeal.seal(pin, session)) ? 'Your PIN is set.' : 'This computer cannot keep a PIN safely, so none was set.', true);
  }
  /** A login he just sent on a page: offered after the page moves on, if it is new or changed. */
  afCred(sender: Electron.WebContents, m: unknown): void {
    const t = this.tabs.find((x) => x.view?.webContents === sender);
    const o = (m && typeof m === 'object' ? m : {}) as { user?: unknown; pass?: unknown };
    if (!t || typeof o.pass !== 'string' || !o.pass) return;
    let host = ''; try { const u = new URL(sender.getURL()); if (u.protocol !== 'https:') return; host = u.hostname.replace(/^www\./, ''); } catch { return; }
    if (this.listed(sender.getURL()).length || bankSite(sender.getURL())) return;
    this.afSave = { tab: t.id, host, user: String(o.user ?? '').slice(0, 200), pass: o.pass.slice(0, 500), at: Date.now(), asked: false };
    const mine = this.afSave;
    setTimeout(() => { void this.afSaveCheck(mine); }, 2500);
    setTimeout(() => { if (this.afSave === mine) { this.afSave = null; this.afBand(); } }, 5 * 60_000);
  }
  private async afSaveCheck(s: NonNullable<typeof this.afSave>): Promise<void> {
    if (this.afSave !== s) return;
    const t = this.tabs.find((x) => x.id === s.tab), wc = t?.view?.webContents;
    if (!wc || wc.isDestroyed()) { this.afSave = null; return; }
    // Still a password box on the page: it did not work (a wrong password is never offered).
    const still = await within(askPage<boolean>(wc, "!!document.querySelector('input[type=password]')"), 800, false);
    if (still) { this.afSave = null; return; }
    if (this.vault.current()) {
      const logins = await this.vault.loginsFor('https://' + s.host);
      for (const l of logins ?? []) if (l.username === s.user) { const sec = await this.vault.secret(l.id, false); if (sec?.password === s.pass) { this.afSave = null; return; } }
    }
    if (this.afSave === s) this.afBand();
  }
  /** "Save this login" clicked: the card shows exactly what will be kept (needs Bitwarden open: the PIN first). */
  private afSaveAsk(): void {
    const s = this.afSave;
    if (!s) return;
    if (!this.vault.current()) {
      if (this.pinSeal.has()) { this.afPin = { digits: '', then: 'save' }; this.afBand('call'); }
      else void this.vaultKey();
      return;
    }
    this.win?.webContents.send('browser:afsave', { site: s.host, user: s.user, pass: s.pass });
  }
  /** The card's Save: what he saw, perhaps edited. */
  async afSaveGo(m: unknown): Promise<void> {
    const o = (m && typeof m === 'object' ? m : {}) as { site?: unknown; user?: unknown; pass?: unknown };
    const site = String(o.site ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!/^[a-z0-9.-]{3,253}$/.test(site) || typeof o.pass !== 'string' || !o.pass) return;
    const ok = await this.vault.create(site, String(o.user ?? ''), o.pass);
    this.afSave = null;
    this.afBand(ok ? 'open' : undefined);
    this.note(ok ? `Kept in your Bitwarden: ${site}.` : 'Bitwarden did not keep it. Try again from the key.');
    if (ok) void this.learnSites();
  }
  /** The address bar's key: what it shows now. `beat`: one moment to play (the call, opening, a wrong PIN). */
  private afBand(beat?: 'call' | 'open' | 'wrong'): void {
    this.afBandMode = this.afPin ? 'pin' : this.afSave ? 'save' : 'idle';
    this.win?.webContents.send('browser:af', { mode: this.afBandMode, n: this.afPin?.digits.length ?? 0, of: this.pinSeal.length(), beat: beat ?? null });
    if (beat === 'call') this.afSound('call');
    if (beat === 'open') this.afSound('unlock');
    if (beat === 'wrong') this.afSound('wrong');
  }
  private afSound(name: 'call' | 'unlock' | 'fill' | 'wrong'): void { if (this.prefs.afSounds) this.win?.webContents.send('browser:afsound', name); }

  // ------------------------------------------------------------------ site icons for the bookmarks
  /** Fetch one icon through his own browsing session and keep it as a small data picture. Images only, 64 KB at most. */
  private async iconData(url: string): Promise<string | null> {
    if (url.startsWith('data:image/svg+xml')) { const m = /^data:image\/svg\+xml(;base64)?,(.*)$/s.exec(url); try { return m && url.length < 90_000 ? await svgToPng(m[1] ? Buffer.from(m[2]!, 'base64') : Buffer.from(decodeURIComponent(m[2]!))) : null; } catch { return null; } }
    if (url.startsWith('data:image/')) return url.length < 90_000 ? url : null;
    if (!isWeb(url) || this.listed(url).length) return null;
    try {
      const r = await within(this.ses.fetch(url, { signal: AbortSignal.timeout(6000) }), 7000, null);
      const type = r?.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
      if (!r?.ok || !/^image\//.test(type)) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      if (!buf.length || buf.length > 64 * 1024) return null;
      // An SVG is never kept as it is: it is drawn in a sealed page and only the picture of it is kept (svgicon.ts).
      if (type === 'image/svg+xml') return await svgToPng(buf);
      return `data:${type};base64,${buf.toString('base64')}`;
    } catch { return null; }
  }
  /**
   * The first of these that is a picture Samara keeps: the page's icons in its own order, then the site's /favicon.ico
   * (2026-10-22, his Epomaker bookmark showed only a "K": the page offered just an SVG icon, which is never kept, and
   * nothing else was tried).
   */
  private async keepIcon(host: string, urls: string[]): Promise<void> {
    let d: string | null = null;
    for (const u of [...new Set(urls)].slice(0, 6)) { d = await this.iconData(u); if (d) break; }
    if (!d) return;
    this.icons.set(host, d);
    if (this.icons.size > 400) this.icons.delete(this.icons.keys().next().value!);
    void writeFileAtomicSoon(this.iconsFile, JSON.stringify(Object.fromEntries(this.icons))).catch(() => { /* best effort */ });
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
      void writeFileAtomicSoon(this.iconsFile, JSON.stringify(Object.fromEntries(this.icons))).catch(() => { /* best effort */ });
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
  /** Netflix refused to play in a tab here: main opens it in the paid-video window instead (true when it did). */
  onPaidFallback: ((url: string) => boolean) | null = null;
  /**
   * Netflix plays in the tab now (2026-10-25); if it still answers with one of its error codes, the show goes to the
   * paid-video window by itself and the tab steps back, so he is never left on an error page.
   */
  private watchPlays(tab: Tab, url: string): void {
    if (!this.onPaidFallback) return;
    for (const after of [10_000, 25_000]) setTimeout(() => {
      const wc = tab.view?.webContents;
      if (!wc || wc.isDestroyed() || wc.getURL() !== url) return;
      void askPage<string>(wc, `(document.body && document.body.innerText || '').slice(0, 5000)`).then((text) => {
        if (!text || !NETFLIX_REFUSED.test(text) || wc.isDestroyed() || wc.getURL() !== url) return;
        if (!this.onPaidFallback?.(url)) return;
        this.note('Netflix would not play in this tab, so it opened in the video window.');
        if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
      });
    }, after);
  }
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
    // Sheet 79: the Mockups trail's marks travel too, by each version's picture.
    mockStages: () => [...(this.mockStore?.stageLog.values() ?? [])],
    takeMockStages: (list: unknown[]) => { if (this.mockStore?.takeStages(list)) this.sendTabs(); },
    // His details travel to his other machine only (his pick, 2026-10-23), with the rest of his settings.
    prefs: () => ({ sounds: this.sounds, ...this.prefs, ...(this.details.empty() ? {} : { autofill: this.details.get() }), lists: {
      popupOk: [...this.popupOk], trusted: [...this.trusted, ...this.peerTrusted], httpOk: [...this.httpOk, ...this.peerHttp], adsPaused: [...this.paused], siteRules: this.rules.all(),
      stash: this.stash.map((x) => ({ ...x, tabs: x.tabs.filter((t) => urlKept(t.url)) })),
    } }) as Record<string, unknown>,
    setPrefs: (p: Record<string, unknown>) => {
      const adsWas = this.prefs.ads;
      this.sounds = p.sounds === true;
      this.prefs = { ads: p.ads !== false, popups: p.popups !== false, home: typeof p.home === 'string' && isWeb(p.home) ? p.home.slice(0, 2000) : DEFAULT_HOME,
        search: p.search === 'ddg' || p.search === 'google' || p.search === 'yandex' ? p.search : 'brave', aiBox: p.aiBox === true, startup: p.startup === 'home' ? 'home' : 'tabs',
        dark: p.dark !== false, darkOff: hostList(p.darkOff), afSounds: p.afSounds !== false, lockAfter: lockPick(p.lockAfter) };
      this.vault.setLockAfter(LOCK_AFTER[this.prefs.lockAfter]);
      if (p.autofill && typeof p.autofill === 'object') this.details.set(p.autofill);
      setSearch(this.prefs.search, this.prefs.aiBox);
      this.paintDarkAll();
      this.takeLists(p.lists);
      if (adsWas !== this.prefs.ads) { if (this.prefs.ads) this.ads?.start(); else this.ads?.stop(); }
      this.savePrefs(); this.sendTabs(); this.pushSettings();
    },
    tabSnap: (): TabSnap => {
      if (this.panes.some((p) => this.alive(p)) && this.tabs.length) {
        // Mockups (sheet 47) stay on this PC: their page server is here only.
        return { tabs: this.tabs.filter((t) => !t.internal && !t.mock && isWeb(t.url)).map((t) => ({ url: t.url, title: t.title, trail: t.trail, done: t.done })), trails: this.trails.filter((x) => !x.mock).map((x) => ({ id: x.id, name: x.name })) };
      }
      try {
        const s = JSON.parse(readFileSync(this.file, 'utf8'));
        return { tabs: (Array.isArray(s?.tabs) ? s.tabs : []).filter((t: any) => typeof t?.url === 'string' && isWeb(t.url) && !t.mock).map((t: any) => ({ url: t.url, title: String(t.title ?? t.url), trail: Number.isInteger(t.trail) ? t.trail : null, done: t.done === true })),
          trails: (Array.isArray(s?.trails) ? s.trails : []).filter((x: any) => Number.isInteger(x?.id) && x.id !== MOCK_TRAIL).map((x: any) => ({ id: x.id, name: String(x.name ?? '') })) };
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
      // The mockup tabs written here stay (sheet 47): they are this PC's own.
      let mocks: unknown[] = [];
      try { const s = JSON.parse(readFileSync(this.file, 'utf8')); if (Array.isArray(s?.closed)) closed = s.closed; if (Array.isArray(s?.tabs)) mocks = s.tabs.filter((t: { mock?: unknown }) => t?.mock).map((t: object) => ({ ...t, opener: null, win: 0 })); } catch { /* none */ }
      this.keepTabsCopy('other-machine');
      const keepTrails = mocks.length ? [...trails.filter((x) => x.id !== MOCK_TRAIL), { id: MOCK_TRAIL, name: 'MOCKUPS', named: true, mock: true }] : trails;
      try { writeFileAtomic(this.file, JSON.stringify({ v: 1, at: new Date().toISOString(), active: 0, tabs: [...want.map((t) => ({ url: t.url, title: t.title, opener: null, scrollY: 0, zoom: 0, muted: false, trail: t.trail, done: t.done })), ...mocks], trails: keepTrails, closed })); } catch { /* best effort */ }
      return;
    }
    // The mockups (sheet 47) are this PC's alone: the other machine's tabs never close or move them.
    const live = this.tabs.filter((t) => !t.internal && !t.mock);
    const fixed = (t: Tab) => t.call === true || t.lent || Boolean(t.mock);
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
    this.trails = [...trails.filter((x) => x.id !== MOCK_TRAIL), ...this.trails.filter((x) => x.mock)];
    this.trailSeq = Math.max(this.trailSeq, ...trails.map((x) => x.id), 0);
    const left = want.slice();
    for (const t of this.tabs) {
      if (t.internal || t.mock) continue;
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

  /** A site's favicon as Samara stored it (a data: picture), or ''. Read-only; nothing is fetched (cleanup 2026-10-22). */
  faviconFor(url: string): string { const d = this.iconOf(url); return /^data:image\//.test(d) && d.length < 20_000 ? d : ''; }

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
  /** The star in the slot: the page he is on goes onto the shelf (its panel then opens to name it). Already there: nothing
   *  changes here; the panel opens to rename or remove it (his ask, 2026-10-14: "edit the name it saves as"). */
  toggleMark(): void {
    const t = this.cur();
    if (!t || !isWeb(t.url)) return;
    if (this.marks.some((m) => m.url === t.url)) return;
    this.marks.unshift({ title: (t.title || t.url).slice(0, 200), url: t.url, folder: 'Bookmarks bar' });
    this.saveMarks();
    this.sendTabs();
  }
  /**
   * The bookmark's own right-click menu (his ask, 2026-10-20): rename, remove, move, open, play in the pop-out, copy.
   * Found by its address, which is what the page sends; anything else is ignored.
   */
  markOp(act: string, url: string, title = ''): void {
    const i = this.marks.findIndex((m) => m.url === url);
    if (i < 0 || !isWeb(url)) return;
    if (act === 'remove') this.marks.splice(i, 1);
    else if (act === 'rename') { const name = String(title).replace(/\s+/g, ' ').trim().slice(0, 200); if (!name) return; this.marks[i] = { ...this.marks[i]!, title: name }; }
    else if (act === 'left' || act === 'right') {
      const j = act === 'left' ? i - 1 : i + 1;
      if (j < 0 || j >= this.marks.length) return;
      [this.marks[i], this.marks[j]] = [this.marks[j]!, this.marks[i]!];
    }
    else if (act === 'newtab') { this.newTab(url, null, true); return; }
    else if (act === 'pop') { this.onPlayInPopout?.(url); return; }
    else if (act === 'copy') { clipboard.writeText(url); return; }
    else return;
    this.saveMarks();
    this.sendTabs();
  }
  /** From the star's panel: rename the bookmark for the page he is on, or take it off. */
  markAct(act: string, title?: string): void {
    const t = this.cur();
    if (!t || !isWeb(t.url)) return;
    const i = this.marks.findIndex((m) => m.url === t.url);
    if (i < 0) return;
    if (act === 'remove') this.marks.splice(i, 1);
    else if (act === 'rename') { const name = String(title ?? '').replace(/\s+/g, ' ').trim().slice(0, 200); this.marks[i] = { ...this.marks[i]!, title: name || t.title || t.url }; }
    else return;
    this.saveMarks();
    this.sendTabs();
  }

  // ------------------------------------------------------------------ C7 Claude's rune in the band (2026-10-21)
  // Sheet 50, his picks: a rune stone in the band while a Claude job runs, waits on him, or has finished and he has not
  // said Nice yet. The brain's claude.jobs / claude.wait reach the Shell (main.ts) and are passed here; the frame only
  // gets the jobs and, of the waiting items, WHICH session waits and for what kind (never Claude's exact input: the rune
  // only needs to turn blue). With no brain (Samara on its own) nothing arrives, so there is no rune.
  private claudeLast: { jobs: unknown[]; waits: { session: string; kind: string }[] } | null = null;
  /** Set by main: a checked pause / play / message for a session, to the brain. */
  onClaude: ((m: Record<string, unknown>) => void) | null = null;
  /** Set by main: open a session in the Claude app (the exact claude:// link, or 'front' / 'mac', claudeOpenTarget). */
  onClaudeOpen: ((target: ClaudeOpen) => void) | null = null;
  /** The brain's news (null: the brain went away, so the rune goes too). Sent to every Samara window's band. */
  // ------------------------------------------------------------------ sheet 60: the notes rail ("Notes for this site")
  private railNotes: RailNote[] = [];
  private railCats: string[] = [];
  /** A new note for this site, from the rail (main.ts sends it to the brain). */
  onNoteSave: ((n: RailNote) => void) | null = null;
  /** A note in the rail clicked: it opens where notes open (Aang's bubble). */
  onNoteOpen: ((id: string) => void) | null = null;
  /** The brain's notes changed: the ones that came from a page (src) go to every window with its rail open. */
  notesNews(notes: unknown, cats: unknown): void {
    this.railNotes = (Array.isArray(notes) ? notes : []).filter((n): n is RailNote => !!n && typeof n === 'object' && typeof (n as RailNote).id === 'string' && !!(n as RailNote).src)
      .slice(0, 60).map((n) => ({ id: n.id, title: String(n.title ?? ''), html: String(n.html ?? ''), cat: typeof n.cat === 'string' ? n.cat : undefined, src: n.src, updated: Number(n.updated) || 0 }));
    this.railCats = Array.isArray(cats) ? cats.map(String).slice(0, 12) : [];
    for (const p of this.panes) if (p.railOpen) this.sendNotes(p);
  }
  private sendNotes(p: Pane): void {
    if (!this.alive(p)) return;
    p.win!.webContents.send('browser:notes', { notes: this.railNotes, cats: this.railCats });
  }
  /** "+ note for this site": his words, kept as a note with this page as where it came from. */
  noteSave(raw: unknown): void {
    if (!raw || typeof raw !== 'object') return;
    const r = raw as Record<string, unknown>;
    const id = String(r.id ?? '');
    if (!/^n[a-z0-9]{1,20}$/.test(id)) return;
    // Where it came from is the page in front of THIS window, never what the frame says.
    const url = this.cur()?.url ?? '';
    let site = '';
    try { const u = new URL(url); if (u.protocol !== 'http:' && u.protocol !== 'https:') return; site = u.hostname.replace(/^www\./, ''); } catch { return; }
    const was = this.railNotes.find((n) => n.id === id);
    this.onNoteSave?.({ id, title: String(r.title ?? '').slice(0, 60) || 'Note', html: String(r.html ?? '').slice(0, 20_000), cat: typeof r.cat === 'string' ? r.cat.slice(0, 24) : undefined,
      src: was?.src ?? { url, site }, updated: Date.now() });
  }
  noteOpen(id: unknown): void { if (typeof id === 'string' && /^n[a-z0-9]{1,20}$/.test(id)) this.onNoteOpen?.(id); }

  claudeNews(m: { t?: unknown; jobs?: unknown; items?: unknown } | null): void {
    if (!m) this.claudeLast = null;
    else {
      const c = this.claudeLast ?? { jobs: [], waits: [] };
      if (m.t === 'claude.jobs' && Array.isArray(m.jobs)) c.jobs = m.jobs.slice(0, 50);
      else if (m.t === 'claude.wait' && Array.isArray(m.items)) c.waits = m.items.slice(0, 50).filter((w) => w && typeof w === 'object')
        .map((w: Record<string, unknown>) => ({ session: String(w.session ?? '').slice(0, 100), kind: String(w.kind ?? '').slice(0, 20) }));
      else return;
      this.claudeLast = c;
    }
    for (const p of this.panes) {
      if (!this.alive(p)) continue;
      p.win!.webContents.send('browser:claudenews', this.claudeLast);
      // The rune's layer keeps the same list all along (made with the window), so it opens at once and in step.
      if (p.runeV && !p.runeV.webContents.isDestroyed()) p.runeV.webContents.send('browser:claudenews', this.claudeLast);
    }
  }
  /** A band that just loaded asks for what it missed. */
  claudeHello(sender: Electron.WebContents): void { sender.send('browser:claudenews', this.claudeLast); }
  /** 2026-10-21 (his rule): Open in Claude pressed anywhere folds every rune panel away at once (main.ts openInClaude). */
  claudeFold(): void { const was = this.pane; for (const p of this.panes) if (this.alive(p) && p.runeOn) { this.pane = p; this.rune(false); } this.pane = was; }

  // ------------------------------------------------------------------ the rune's panel, floating over the live page
  /**
   * 2026-10-21 (his report: "opening the Claude button in Samara bugs out the browser completely, especially when I'm
   * watching a video"). The panel used to freeze the page: the live view was hidden and a still picture of it shown
   * (drawer(true)), which stalled a playing video and swapped views. Now it is drawn the way the tab list is: in its
   * own see-through layer ABOVE the live page, sized to the panel. The page is never hidden, frozen or captured.
   */
  runeView(): WebContentsView | null {
    const w = this.win, P = this.pane;
    if (!w || w.isDestroyed()) return null;
    if (P.runeV && !P.runeV.webContents.isDestroyed()) return P.runeV;
    // Never slowed while hidden: its slide must start the moment it shows. It does nothing at rest.
    const v = new WebContentsView({ webPreferences: { ...SAFE_WEB_PREFERENCES, preload: this.o.preloadPath, backgroundThrottling: false } });
    lockDown(v.webContents);
    v.setBackgroundColor('#00000000');
    v.setVisible(false);
    // A press anywhere else takes the keyboard from it: it folds (the band's rune knows not to reopen on that press).
    v.webContents.on('blur', () => { this.pane = P; if (P.runeOn) { P.runeShutAt = Date.now(); this.rune(false); } });
    v.webContents.on('before-input-event', (e, input) => {
      this.pane = P;
      if (input.type === 'keyDown' && input.key === 'Escape') { e.preventDefault(); this.rune(false); }
    });
    // Opened before its page had loaded (a click right after start): open once it has.
    v.webContents.on('did-finish-load', () => { this.pane = P; if (P.runeOn) this.placeRune(); });
    void v.webContents.loadURL(`${this.o.origin}/runelayer.html`);
    P.runeV = v;
    return v;
  }
  isRune(sender: Electron.WebContents): boolean {
    const p = this.panes.find((x) => this.alive(x) && x.runeV && !x.runeV.webContents.isDestroyed() && sender === x.runeV.webContents);
    if (p) this.pane = p;
    return Boolean(p);
  }
  /** The band: open the panel under its rune, or fold it. */
  runeFromBand(a: Record<string, unknown>): void {
    if (a.open !== true) { this.rune(false); return; }
    const n = (x: unknown) => (Number.isFinite(Number(x)) ? Math.round(Number(x)) : NaN);
    const at = { x: n(a.x), y: n(a.y), left: n(a.left), right: n(a.right) };
    if (Object.values(at).some((v) => !Number.isFinite(v))) return;
    this.rune(true, at);
  }
  /** The layer: it folded itself (Esc, a press on its edge, Open in Claude), or its panel changed size. */
  runeFromLayer(a: Record<string, unknown>): void {
    const sz = a.size as { w?: unknown; h?: unknown } | undefined;
    if (sz && typeof sz === 'object') {
      const w = Number(sz.w), h = Number(sz.h);
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) { this.pane.runeSize = { w: Math.min(800, Math.round(w)), h: Math.min(4000, Math.round(h)) }; this.placeRune(); }
      return;
    }
    if (a.open === false) this.rune(false);
  }
  /** Open the layer where the band says, or fold it: it slides out (~180 ms), then the layer goes. */
  rune(open: boolean, at?: { x: number; y: number; left: number; right: number }): void {
    const w = this.win, P = this.pane;
    if (!w || w.isDestroyed()) return;
    if (!open) {
      if (!P.runeOn) return;
      P.runeOn = false;
      const v = P.runeV && !P.runeV.webContents.isDestroyed() ? P.runeV : null;
      v?.webContents.send('browser:rune', { open: false });
      w.webContents.send('browser:rune', { open: false });
      if (P.runeHideT) clearTimeout(P.runeHideT);
      P.runeHideT = setTimeout(() => { P.runeHideT = null; if (!P.runeOn) v?.setVisible(false); }, 200);
      return;
    }
    if (P.runeOn) return;
    // The press on the rune that took the keyboard from the open layer has just folded it: that press means "close".
    if (Date.now() - (P.runeShutAt ?? 0) < 300) return;
    const v = this.runeView();
    if (!v) return;
    if (at) P.runeAt = at;
    if (P.runeHideT) { clearTimeout(P.runeHideT); P.runeHideT = null; }
    P.runeOn = true;
    w.contentView.addChildView(v);             // to the top, over the page (and over the tab list)
    v.setVisible(true);
    this.placeRune();                          // shown first, so its slide starts on a page that is drawing
    v.webContents.focus();
    w.webContents.send('browser:rune', { open: true });
  }
  /** Sheet 50's sums, in window pixels: the panel's right edge a little past the rune, kept inside the band. */
  placeRune(): void {
    const w = this.win, P = this.pane, v = P.runeV, at = P.runeAt;
    if (!w || w.isDestroyed() || !v || v.webContents.isDestroyed() || !P.runeOn || !at) return;
    const [cw, ch] = w.getContentSize();
    const PANEL = 384, M = 24;
    const left = Math.max(at.left + 8, Math.min(at.right - PANEL - 8, at.x - PANEL + 70));
    const x = Math.max(0, left - M), y = at.y;
    const width = Math.min(cw - x, P.runeSize?.w ?? PANEL + 2 * M);
    const maxH = Math.max(120, ch - y - 8 - M - 20);
    const height = Math.max(40, Math.min(ch - y, P.runeSize?.h ?? ch - y));   // until the panel says its size
    v.setBounds({ x, y, width: Math.max(0, width), height });
    v.webContents.send('browser:rune', { open: true, tip: at.x - x, maxH });
  }
  /** From the rune's panel: only pause, play and a message, each rebuilt and checked (claudewire.ts) like the cockpit's. */
  claudeAct(raw: unknown): void {
    const m = claudeMessage(raw);
    if (!m || !['claude.pause', 'claude.play', 'claude.send'].includes(String(m.t))) { console.error('browser: refused a Claude message from the band that did not check out'); return; }
    this.onClaude?.(m);
  }
  claudeOpen(raw: unknown): void {
    // 2026-10-21: a job with no app link (or on the Mac) still brings Claude forward, never nothing (claudeOpenTarget).
    const target = claudeOpenTarget(raw);
    if (!target) { console.error('browser: refused an Open in Claude link that was not a Claude session'); return; }
    this.onClaudeOpen?.(target);
  }

  // ------------------------------------------------------------------ lending a tab to the popout ("take the tab with you")
  /** Set by main: bring a lent tab back from the popout (the popout closes and hands it over). */
  onReclaim: (() => void) | null = null;
  /** Set by main: pause/play, pin or close the pop-out, from the tab page it left behind (sheet 40 B). */
  onPopoutAct: ((what: string) => void) | null = null;

  /**
   * Lend a live tab to the popout: the same page, already playing, signed in, nothing reloaded. It leaves this
   * window and the frame shows a plate where it was. Null for a tab with no live page (asleep, crashed, blocked).
   */
  lend(id: number): { view: WebContentsView; url: string; title: string } | null {
    const t = this.tabs.find((x) => x.id === id);
    if (!t?.view || t.internal || t.crashed || t.blocked || t.failed || t.lent || !this.inTab(t)) return null;
    this.thaw(t);                                      // the pop-out gets a running page
    t.lent = true;
    // A still of the picture for the tab page while it plays in the pop-out (taken before the view leaves the window).
    t.lentShot = '';
    void within(t.view.webContents.capturePage(), 800, null).then((img) => {
      if (!img || img.isEmpty() || !t.lent) return;
      const small = img.getSize().width > 1280 ? img.resize({ width: 1280, quality: 'good' }) : img;
      t.lentShot = 'data:image/jpeg;base64,' + small.toJPEG(78).toString('base64');
      this.sendTabs();
    });
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
    setTimeout(() => { if (t.view !== view || t.lent || !this.inTab(t)) return; if (t.id === this.active) this.activate(t.id); else { this.changed(); this.quietHidden(); } }, 250);
  }

  isLent(id: number): boolean { return Boolean(this.tabs.find((x) => x.id === id)?.lent); }
  /**
   * Address suggestions as he types (6.22b item 6). Local and instant: his open tabs first ("switch to it"), then his
   * bookmarks, then tabs he closed lately. The first row is always what he typed, so Enter never surprises him.
   */
  private preconnected = '';
  /**
   * Sheet 88 (his picks): his search engine's guesses for what he has typed, in both windows (the secret one asks Yandex,
   * before its PIN too). Only the words go, from Samara's own session with no cookies; a slow or odd answer is no guesses.
   */
  async guesses(text: string): Promise<string[]> {
    const url = guessesUrl(text, this.engine);
    if (!url) return [];
    try {
      const r = await within(net.fetch(url, { signal: AbortSignal.timeout(1500), credentials: 'omit' }), 1600, null);
      if (!r || !r.ok) return [];
      return parseGuesses(await within(r.json() as Promise<unknown>, 800, null), text);
    } catch { return []; }
  }
  suggest(text: string): { kind: string; title: string; url: string; id?: number }[] {
    const q = String(text ?? '').trim().toLowerCase().slice(0, 200);
    if (!q) return [];
    const typed = addressFor(q, this.engine);
    const out: { kind: string; title: string; url: string; id?: number }[] = [];
    if (typed) out.push({ kind: typed.startsWith('https://search.brave.com') || typed.includes('/search?') || typed.includes('duckduckgo.com/?q=') || typed.includes('yandex.com/search') ? 'search' : 'go', title: String(text).trim().slice(0, 200), url: typed });
    if (this.locked) return out;              // sheet 87, his pick: the secret history suggests only after the PIN
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
  /**
   * Nothing plays until he asks (his rule, 2026-10-20). Asked by each page as it starts (tabpreload.cjs): may it start
   * sound by itself (he asked for it a moment ago: an address, a bookmark, a link he clicked), and can he see it.
   */
  mayPlay(sender: Electron.WebContents): { ok: boolean; shown: boolean; hold?: boolean } {
    const t = this.tabs.find((x) => x.view?.webContents === sender);
    if (!t) return { ok: true, shown: true };            // a popup he opened: his
    const at = Math.max(t.playOkAt ?? 0, this.lastGesture.get(t.id) ?? 0);
    // A woken tab plays nothing by itself (his pick, 2026-10-23): it comes back paused at his spot; his own click on play
    // in the page plays it.
    // hold: nothing on a woken page plays until he clicks in the page itself (clicking its tab does not count).
    return { ok: !t.waking && Date.now() - at < PLAY_MS, shown: this.seen(t) && !t.waking, hold: Boolean(t.waking) };
  }
  /** He can see it, or it may play out of sight: a call, the pop-out, Spotify (his only music). */
  private seen(t: Tab): boolean {
    let spotify = false; try { spotify = /(^|\.)spotify\.com$/i.test(new URL(t.url).hostname); } catch { /* not an address */ }
    return t.lent || t.call === true || spotify || this.panes.some((p) => p.active === t.id);
  }
  /** His rule (2026-10-20): a tab he leaves pauses, and a tab he is not looking at never starts playing. */
  private quietHidden(): void {
    for (const x of this.tabs) {
      if (!x.view || x.internal) continue;
      const shown = this.seen(x);
      if (x.shown === shown) continue;
      const was = x.shown; x.shown = shown;
      try { x.view.webContents.send('tab:shown', shown); } catch { /* gone */ }
      if (!shown && was !== undefined) this.pauseMedia(x.id);
    }
  }
  /** Pause whatever the tab is playing (it went to the pop-out). With a deadline: a dead page never hangs Aang.
   *  No page check here passes "user gesture" (2026-10-23): that told the site he had clicked, so it let video start by
   *  itself, against his "nothing plays until I click". */
  pauseMedia(id: number): void {
    const wc = this.tabs.find((x) => x.id === id)?.view?.webContents;
    if (wc) void within(askPage(wc, "document.querySelectorAll('video,audio').forEach(m=>{try{m.pause()}catch{}});true"), 800, null);
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
    if (!tr || !n || tr.mock) return;
    tr.name = n; tr.named = true;          // his name: Qwen never renames it
    this.changed();
  }
  /** Move a tab into a trail, out to loose (null), or into a brand-new trail ('new'). */
  moveTab(tabId: number, to: number | null | 'new'): void {
    const t = this.tabs.find((x) => x.id === tabId);
    // Sheet 47: the MOCKUPS trail holds Claude's mockups only, and a mockup stays in it.
    if (!t || t.mock || to === MOCK_TRAIL) return;
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
    if (Boolean(t.mock) !== (trail === MOCK_TRAIL)) return;
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
  /**
   * Drag one tab or several (his ask, 2026-10-21): into a trail (or loose, null), in their order, before another tab (or
   * at the end of that group), and under a parent tab when he dropped it on a row or slid it right. A tab sits under the
   * one it came from (its opener), one level deep, as the drawer draws it. Every id must be a real tab; the parent must
   * be a top tab of that same trail; a tab never goes under itself or under its own child (no loops). False: refused,
   * nothing moved. A tab under one of the others moving with it keeps its place under it (a parent carries its children).
   */
  placeTabs(ids: number[], trail: number | null, before: number | null, parent: number | null): boolean {
    const set = new Set(ids);
    if (!ids.length || set.size !== ids.length) return false;
    const moving = ids.map((id) => this.tabs.find((x) => x.id === id));
    if (moving.some((t) => !t)) return false;
    if (trail !== null && !this.trails.some((x) => x.id === trail)) return false;
    const mock = trail === MOCK_TRAIL;
    // Sheet 47's rule, unchanged: the MOCKUPS trail holds Claude's mockups only, and a mockup stays in it.
    if (moving.some((t) => Boolean(t!.mock) !== mock)) return false;
    if (before !== null && (set.has(before) || !this.tabs.some((x) => x.id === before))) return false;
    if (parent !== null) {
      const p = this.tabs.find((x) => x.id === parent);
      // A mockup's parent is kept in the mockups' own tree (mockAct), never here; loose tabs are a flat list.
      if (!p || trail === null || mock || set.has(parent) || p.trail !== trail || p.done) return false;
      // One level only: the parent must itself be a top tab of that trail.
      if (p.opener !== null && this.tabs.some((x) => x.id === p.opener && x.trail === trail && !x.done)) return false;
      // No loops: walking up from the parent must never meet a tab that is moving.
      const seen = new Set<number>();
      for (let at: Tab | undefined = p; at && !seen.has(at.id); at = at.opener === null ? undefined : this.tabs.find((x) => x.id === at!.opener)) {
        if (set.has(at.id)) return false;
        seen.add(at.id);
      }
    }
    for (const t of moving as Tab[]) {
      if (!mock) t.opener = parent === null && trail !== null && t.opener !== null && set.has(t.opener) ? t.opener : parent;
      t.trail = trail;
      t.done = false;
    }
    // Tabs that were under a tab that is now a child themselves move up beside it: never two levels deep.
    if (parent !== null) for (const x of this.tabs) if (!set.has(x.id) && x.opener !== null && set.has(x.opener) && x.trail === trail) x.opener = parent;
    this.tabs = this.tabs.filter((x) => !set.has(x.id));
    const j = before !== null ? this.tabs.findIndex((x) => x.id === before) : -1;
    if (j >= 0) this.tabs.splice(j, 0, ...(moving as Tab[]));
    else {
      let k = -1;
      this.tabs.forEach((x, n) => { if (x.trail === trail) k = n; });
      this.tabs.splice(k + 1, 0, ...(moving as Tab[]));
    }
    this.tidyTrails();
    this.changed();
    return true;
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
    // Sheet 47: the MOCKUPS trail can only be closed (its history stays in mockups.json, the ... menu brings it back).
    if (tr.mock) {
      if (act !== 'close') return;
      for (const t of own) this.close(t.id, false);
      this.trails = this.trails.filter((x) => x.id !== id);
      this.changed();
      this.note('Closed the mockups. Their history is kept: Mockups in the ... menu brings them back.');
      return;
    }
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

  // ------------------------------------------------------------------ Sheet 47: the MOCKUPS trail (his picks, 2026-10-21)
  /** Mockups are on here: there is a git repo beside the Shell (not on his Mac). */
  get mockupsOn(): boolean { return Boolean(this.mockServer && this.mockStore); }
  /** The MOCKUPS trail, made if it is not there yet. The frame draws Claude's icon and FROM CLAUDE on its head. */
  private mockTrail(): Trail {
    let tr = this.trails.find((x) => x.id === MOCK_TRAIL);
    if (!tr) { tr = { id: MOCK_TRAIL, name: 'MOCKUPS', named: true, mock: true }; this.trails.push(tr); }
    tr.mock = true;
    return tr;
  }
  /**
   * Claude opened a mockup (a .mockup file in open-urls, main.ts). Its version as it is now (HEAD) goes into the history,
   * and its sheet's tab shows it: a newer version of a sheet already open updates that same tab, never a new one (his pick).
   * branch: the branch Claude was told to file it in (mockups.ts fileInto has the rules).
   */
  async openMockup(sheet: string, title = '', branch: string | null = null): Promise<MockVersion | null> {
    if (!this.mockServer || !this.mockStore || cleanSheet(sheet) !== sheet) return null;
    if (!(await this.mockReady)) return null;
    // 2026-10-22: a live page has no versions to look up: it is shown as it is, always V1.
    const where = this.mockWhere(sheet);
    const r = sheetKind(sheet) === 'live' ? { commit: '', key: 'live', title: liveTitle(sheet) } : where ? await resolveVersion(where.repo, where.rel) : null;
    if (!r) { console.log(`shell: mockups: ${sheet} is not in the repo's last commit, not opened`); return null; }
    const ver = this.mockStore.add(sheet, title || r.title, r.commit, r.key);
    // A branch Claude named (checked in cleanBranch): the same move as his Move to branch, children following.
    if (branch) this.mockStore.fileInto(sheet, branch);
    this.showMockup(ver);
    // The arrival notice (his ask, 2026-10-22): the drawer's arrow breathes, and this row glows once when he opens it.
    this.mockNew = { n: (this.mockNew?.n ?? 0) + 1, sheet, at: Date.now() };
    this.sendTabs();
    return ver;
  }
  /** The newest mockup to arrive, for the drawer's breathing arrow and the row's one glow (browser.js). */
  private mockNew: { n: number; sheet: string; at: number } | null = null;
  /**
   * A .mockup file (main.ts), any of its three kinds (2026-10-22): an AangApp sheet, a page in another session's repo
   * (registered by name in mockups.json, then @<name>/<path>), or a live page on this computer.
   */
  async openMockupDrop(m: MockupDrop): Promise<MockVersion | null> {
    if (!this.mockStore) return null;
    if (m.url) return this.openMockup(m.url, m.title, m.branch);
    if (!m.repo) return this.openMockup(m.path, m.title, m.branch);
    const same = (a: string, b: string) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
    // AangApp itself, named by its folder: its own rules (only the mockup folders are served).
    if (this.mockRepo && same(path.resolve(m.repo), path.resolve(this.mockRepo))) return cleanPath(m.path) ? this.openMockup(m.path, m.title, m.branch) : null;
    if (!findRepo(m.repo)) { console.log('shell: mockups: not a git repo, not opened: ' + m.repo); return null; }
    return this.openMockup(`@${this.mockStore.repoName(path.resolve(m.repo))}/${m.path}`, m.title, m.branch);
  }
  /** Where a sheet's file is: its repo's folder and its path inside it. Null for a live page or an unknown repo. */
  private mockWhere(sheet: string): { repo: string; rel: string } | null {
    const k = sheetKind(sheet);
    if (k === 'home') return this.mockRepo ? { repo: this.mockRepo, rel: sheet } : null;
    if (k !== 'repo') return null;
    const r = splitRepoSheet(sheet), dir = r ? this.mockStore?.repoPath(r.name) : null;
    return r && dir ? { repo: dir, rel: r.rel } : null;
  }
  /** One version, exactly as it was, in its sheet's tab (made in the MOCKUPS trail if none is open). Opens Samara if it is closed. */
  private showMockup(ver: MockVersion): void {
    const go = () => {
      const url = this.mockServer!.url(ver.commit, ver.sheet);
      // Arrived now and not looked at yet (his ask, 2026-10-23): it glows softly until he does, and sits on top.
      const mock = { sheet: ver.sheet, commit: ver.commit, key: ver.key, at: Date.now(), unseen: true };
      this.mockTrail();
      this.mockStore?.opened(ver.sheet);
      const t = this.tabs.find((x) => x.mock?.sheet === ver.sheet);
      if (t) {
        t.mock = mock; t.title = ver.title; t.trail = MOCK_TRAIL; t.done = false; t.failed = null; t.blocked = null;
        if (t.view && !t.crashed && !t.lent) { t.pending = url; void t.view.webContents.loadURL(url).catch(() => {}); }
        else { t.url = url; this.closeView(t); }
        this.activate(t.id);
        this.mockSeen();
        return;
      }
      const id = this.newTab(url);
      const n = this.tabs.find((x) => x.id === id);
      if (n) { n.mock = mock; n.title = ver.title; n.trail = MOCK_TRAIL; }
      this.tidyTrails();
      this.mockSeen();
      this.changed();
    };
    const p = this.lastPane();
    if (p && this.restored) { this.pane = p; bringFront(p.win!); go(); return; }
    this.whenOpen.push(go);
    if (!p) this.createPane();
  }
  /** The mockup in front, while Samara has his focus, has been seen: its glow goes. */
  private mockSeen(): void {
    const f = BrowserWindow.getFocusedWindow();
    if (!f || !this.panes.some((p) => p.win === f)) return;
    const t = this.cur();
    if (t?.mock?.unseen) { delete t.mock.unseen; this.changed(); }
  }
  /** "Mockups" in the ... menu: the trail comes back with its history open, even after he closed it. */
  reopenMockups(): void {
    if (!this.mockStore) return;
    this.mockList = true;
    const tr = this.trails.find((x) => x.id === MOCK_TRAIL);
    if (tr) tr.collapsed = false;
    void this.mockTidy(false);
    if (this.tabs.some((t) => t.mock)) { this.changed(); return; }
    const last = [...this.mockStore.list].sort((a, b) => b.at - a.at || b.id - a.id)[0];
    if (!last) { this.note('No mockups yet. When Claude opens one, it lands here.'); this.sendTabs(); return; }
    this.showMockup(last);
  }
  /** A branch just made from a tab's menu: the frame opens its name for typing, once. */
  private freshBranch = 0;
  /**
   * Send a mockup to Aang (his pick, 2026-10-21): set by main only while Aang's body is running, like Send to Aang for
   * words. The frame shows the item only while it is set, so a change redraws.
   */
  private sendMock: ((m: MockSend) => void) | null = null;
  get onSendMockup(): ((m: MockSend) => void) | null { return this.sendMock; }
  set onSendMockup(fn: ((m: MockSend) => void) | null) { const was = Boolean(this.sendMock); this.sendMock = fn; if (was !== Boolean(fn)) this.sendTabs(); }
  /** One version as it travels: everything from mockups.json and git, the picture from its tab or a hidden page. */
  private async mockItem(ver: MockVersion, picture: boolean): Promise<MockSendItem> {
    const st = this.mockStore!;
    const branchId = st.placeOf(ver.sheet).branch;
    // A live page (2026-10-22) has no file to read notes from; another repo's sheet is read from its own repo.
    const where = ver.commit ? this.mockWhere(ver.sheet) : null;
    const html = where ? await git(where.repo, ['cat-file', 'blob', `${ver.commit}:${where.rel}`]) : null;
    return {
      kind: 'mockup', title: ver.title, version: 'V' + ver.v, branch: st.branches.find((b) => b.id === branchId)?.name ?? null,
      sheet: ver.sheet, commit: ver.commit, url: this.mockServer!.url(ver.commit, ver.sheet),
      notes: typeof html === 'string' ? notesFrom(html) : '', picture: picture ? await this.mockShot(ver) : null,
    };
  }
  /**
   * A picture of one version. Its own tab when that tab shows exactly this picture; otherwise a hidden window off screen,
   * in a session of its own that keeps nothing, opened on the versioned page and closed again.
   */
  private async mockShot(ver: MockVersion): Promise<string | null> {
    const t = this.tabs.find((x) => x.mock?.sheet === ver.sheet && x.mock.key === ver.key && x.view && !x.crashed && !x.lent && !x.loading);
    // A tab hidden under the drawer gives an empty picture: then the hidden page below takes it.
    if (t?.view) { const shot = fitShot(await within(t.view.webContents.capturePage(), 3000, null)); if (shot) return shot; }
    const w = new BrowserWindow({ show: false, width: 1280, height: 860, webPreferences: { ...SAFE_WEB_PREFERENCES, partition: 'aang-mockshot', offscreen: true } });
    try {
      lockDown(w.webContents);
      const loaded = await within(w.loadURL(this.mockServer!.url(ver.commit, ver.sheet)).then(() => true), 8000, false);
      if (!loaded) return null;
      await new Promise((r) => setTimeout(r, 500));
      return fitShot(await within(w.webContents.capturePage(), 3000, null));
    } catch { return null; }
    finally { if (!w.isDestroyed()) w.destroy(); }
  }
  /** Send to Aang: one version (a tab's, or a history line's), or a whole branch. Ids only, each looked up here. */
  private async mockSend(what: 'tab' | 'version' | 'branch', id: number): Promise<MockSend | null> {
    const st = this.mockStore, send = this.sendMock;
    if (!st || !send || !Number.isInteger(id)) return null;
    let out: MockSend | null = null;
    if (what === 'version') { const v = st.get(id); if (v) out = await this.mockItem(v, true); }
    else if (what === 'tab') {
      const t = this.tabs.find((x) => x.id === id && x.mock);
      const v = t ? [...st.list].filter((x) => x.sheet === t.mock!.sheet && x.key === t.mock!.key).sort((a, b) => b.at - a.at)[0] : undefined;
      if (v) out = await this.mockItem(v, true);
    } else {
      const b = st.branches.find((x) => x.id === id);
      if (b) {
        // Each mockup in the branch (children too), its newest version, newest first; pictures for the first 4 only.
        const sheets = [...new Set(st.list.map((x) => x.sheet))].filter((s) => st.placeOf(s).branch === b.id);
        const newest = sheets.map((s) => st.list.filter((x) => x.sheet === s).sort((p, q) => q.at - p.at || q.id - p.id)[0]!).sort((p, q) => q.at - p.at).slice(0, 20);
        const items: MockSendItem[] = [];
        for (const [i, v] of newest.entries()) items.push(await this.mockItem(v, i < 4));
        if (items.length) out = { kind: 'mockups', branch: b.name, items };
      }
    }
    if (out && this.sendMock) this.sendMock(out);
    return out;
  }
  /**
   * The frame's clicks: a version to show, the history list opened or shut, the broom, and his moves in the family tree
   * (his ask, 2026-10-21: branches > mockups > children, all by hand, kept in mockups.json with the history).
   */
  /**
   * His system (2026-10-23): the open Mockups list is what is alive, what he is working on AND what is built (he is proud
   * of those and wants to look at them); a parked (denied) sheet leaves it for History; anything that comes back a step
   * from there (marked again, or the mark taken off) comes back to the list.
   */
  private mockStageMoved(id: number): void {
    const v = this.mockStore?.get(id);
    if (!v) return;
    const open = this.tabs.filter((t) => t.mock?.sheet === v.sheet);
    if (v.stage === 'park') { for (const t of open) this.close(t.id, false); return; }
    if (!open.length) this.showMockup(v);
  }
  /** Sheet 79: every marked version, for Claude (and Aang): which sheet, which version, which stage, his words. */
  mockStages(): unknown[] { return this.mockStore?.stages() ?? []; }
  /**
   * Claude's mark on one version of a sheet in his repo (sheet 79): approved only with his words from the chat (it shows
   * as APPROVED · CHAT), built once it is in Samara, fix with a note, park, or clear. The newest version unless `v`.
   */
  mockMark(a: { repo: string; sheet: string; v: number | null; stage: string; said: string; note: string }): string {
    const st = this.mockStore;
    if (!st) return "This Samara has no Mockups trail.";
    const names = a.repo ? [...st.repos.entries()].filter(([, p]) => path.resolve(p) === path.resolve(a.repo)).map(([n]) => `@${n}/${a.sheet}`) : [];
    const keys = [a.sheet, ...names];
    const mine = st.list.filter((x) => keys.includes(x.sheet));
    if (!mine.length) return 'That sheet is not in the Mockups trail yet: show it first (show_mockup).';
    const v = a.v === null ? mine.reduce((m, x) => (x.v > m.v ? x : m)) : mine.find((x) => x.v === a.v);
    if (!v) return `That sheet has no version ${a.v}.`;
    const map: Record<string, MockStage | null> = { approved: 'chat', built: 'built', fix: 'fix', park: 'park', clear: null };
    if (!(a.stage in map)) return 'stage is one of: approved, built, fix, park, clear.';
    if (a.stage === 'approved' && !a.said.trim()) return "An approval needs his own words from the chat in said (what he wrote when he said yes).";
    const why = st.setStage(v.id, map[a.stage]!, { said: a.said, note: a.note, by: 'claude' });
    if (!why) { this.sendTabs(); this.sync?.changed('mstages'); this.mockStageMoved(v.id); }
    return why;
  }
  mockAct(act: string, a: { id?: number; sheet?: string; to?: string | number | null; name?: string; open?: boolean } = {}): void {
    const st = this.mockStore;
    if (!st) return;
    const known = (s: unknown): s is string => typeof s === 'string' && st.list.some((x) => x.sheet === s);
    let why = '';
    switch (act) {
      case 'show': { const v = Number.isInteger(a.id) ? st.get(a.id!) : undefined; if (v) this.showMockup(v); return; }
      // Send to Aang: the page names a number only; the Shell builds what goes.
      case 'send': case 'sendtab': case 'sendbranch': if (Number.isInteger(a.id)) void this.mockSend(act === 'send' ? 'version' : act === 'sendtab' ? 'tab' : 'branch', a.id!); return;
      case 'list': this.mockList = a.open === true; if (this.mockList) void this.mockTidy(false); break;
      // The tidy (2026-10-22): "Tidy now" in the trail's head; Archive, Restore and Picked from a sheet's menu.
      case 'tidy': void this.mockTidy(true); return;
      case 'archive': if (known(a.sheet)) why = st.archive(a.sheet); break;
      case 'restore': if (known(a.sheet)) why = st.restore(a.sheet); break;
      case 'pick': if (known(a.sheet)) why = st.setPicked(a.sheet, a.open === true); break;
      // Sheet 79: his mark on one version (FIX with a note, APPROVED, PARKED), or taking it off (null).
      case 'stage': { const sg = a.to === null || a.to === '' ? null : String(a.to) as MockStage;
        if (Number.isInteger(a.id) && (sg === null || ['fix', 'ok', 'park'].includes(sg))) why = st.setStage(a.id!, sg, { note: String(a.name ?? '').slice(0, 300), by: 'you' });
        if (!why) { this.sync?.changed('mstages'); this.mockStageMoved(a.id!); }
        break; }
      // The broom (his rule): only when he presses it, and only exact duplicates.
      case 'broom': { const n = st.sweep(); if (n) this.note(`Removed ${n} duplicate${n === 1 ? '' : 's'}.`); break; }
      case 'branchnew': if (known(a.sheet)) { const id = st.newBranch(); why = st.toBranch(a.sheet, id); this.freshBranch = id; } break;
      case 'branch': if (known(a.sheet)) why = st.toBranch(a.sheet, typeof a.to === 'number' ? a.to : null); break;
      case 'top': if (known(a.sheet)) why = st.toBranch(a.sheet, null); break;
      case 'parent': if (known(a.sheet) && known(a.to)) why = st.toParent(a.sheet, a.to); break;
      case 'brename': if (Number.isInteger(a.id)) why = st.renameBranch(a.id!, String(a.name ?? '')); break;
      case 'bfold': if (Number.isInteger(a.id)) why = st.foldBranch(a.id!); break;
      case 'bdelete': if (Number.isInteger(a.id)) why = st.deleteBranch(a.id!); break;
      default: return;
    }
    if (why === 'it has children of its own') this.note('That mockup has its own children, so it cannot be a child. Move its children first.');
    this.sendTabs();
    if (this.freshBranch && act !== 'branchnew') this.freshBranch = 0;
  }
  /** A mockup tab's version tag, where it sits in the tree, and its sheet's versions (one line per V, its newest time). */
  private mockTab(t: Tab): Record<string, unknown> {
    const sheet = t.mock!.sheet;
    const list = this.mockStore?.list.filter((x) => x.sheet === sheet) ?? [];
    const byV = new Map<number, MockVersion>();
    for (const x of list) { const o = byV.get(x.v); if (!o || x.at >= o.at) byV.set(x.v, x); }
    const place = this.mockStore?.placeOf(sheet) ?? { branch: null, parent: null };
    return {
      sheet, branch: place.branch, parent: place.parent, kids: this.mockStore?.childrenOf(sheet).length ?? 0,
      // Its name in the trail ("88 · The address bar"), for the address bar (2026-10-25, his ask: not the number address).
      title: [...list].reverse().find((x) => x.key === t.mock!.key)?.title ?? list[list.length - 1]?.title ?? '',
      v: list.find((x) => x.key === t.mock!.key)?.v ?? 0,
      // Sheet 81: the stage of the version this tab shows, on its own V chip; its id, for marking it from the tab's menu.
      ...(() => { const sh = list.filter((x) => x.key === t.mock!.key); const m = sh.find((x) => x.stage); return { vid: sh[sh.length - 1]?.id ?? null, stage: m?.stage ?? null, said: m?.said ?? '' }; })(),
      at: t.mock!.at ?? list.filter((x) => x.key === t.mock!.key).reduce((m, x) => Math.max(m, x.at), 0), unseen: t.mock!.unseen === true,
      versions: [...byV.values()].sort((a, b) => b.v - a.v).slice(0, 30).map((x) => ({ id: x.id, v: x.v, at: x.at, now: x.key === t.mock!.key })),
    };
  }
  /**
   * The tidy (his ask, 2026-10-22): merge duplicates, fold old versions, archive sheets gone from the repo or superseded
   * and untouched for two weeks (mockuptidy.ts has the rules). All plain code and git reads: no quota, no Qwen. Runs by
   * itself at most once a day (start, the trail coming back, the history opening); "Tidy now" runs it at once and always
   * says what it did. Nothing is deleted: the Archive in the history list has a Restore on every sheet.
   */
  private mockTidying = false;
  async mockTidy(manual: boolean): Promise<string> {
    const st = this.mockStore;
    if (!st || this.mockTidying || (!manual && !tidyDue(st.tidiedAt, Date.now()))) return '';
    this.mockTidying = true;
    try {
      const sheets = [...new Set(st.list.map((x) => x.sheet))];
      // Which files are in their repo at HEAD: one ls-tree per repo. A repo git cannot read says nothing (never "gone").
      const known = new Map<string, boolean>();
      const byRepo = new Map<string, { dir: string; rels: Map<string, string> }>();
      for (const s of sheets) {
        const w = sheetKind(s) === 'live' ? null : this.mockWhere(s);
        if (!w) continue;
        const r = byRepo.get(w.repo) ?? { dir: w.repo, rels: new Map<string, string>() };
        r.rels.set(w.rel, s); byRepo.set(w.repo, r);
      }
      for (const r of byRepo.values()) {
        const rels = [...r.rels.keys()];
        for (let i = 0; i < rels.length; i += 100) {
          const part = rels.slice(i, i + 100);
          const out = await git(r.dir, ['ls-tree', '-r', '--name-only', 'HEAD', '--', ...part]);
          if (typeof out !== 'string') continue;
          const have = new Set(out.split(/\r?\n/).filter(Boolean));
          for (const rel of part) known.set(r.rels.get(rel)!, have.has(rel));
        }
      }
      // What each sheet says about itself (a "decided" strip, a DECIDED stamp), read again only when its newest version changed.
      let reads = 0;
      for (const s of sheets) {
        if (st.archived(s) || reads >= 80) continue;
        const v = st.list.filter((x) => x.sheet === s).sort((a, b) => b.at - a.at || b.id - a.id)[0];
        const w = v?.commit ? this.mockWhere(s) : null;
        if (!v || !w || st.meta.get(s)?.dkey === v.key) continue;
        reads++;
        const html = await git(w.repo, ['cat-file', 'blob', `${v.commit}:${w.rel}`]);
        if (typeof html === 'string') st.setDecided(s, v.key, saysDecided(html));
      }
      const open = new Set(this.tabs.filter((t) => t.mock).map((t) => t.mock!.sheet));
      const r = st.tidy(open, (s) => known.get(s) ?? null);
      const line = tidyLine(r);
      if (line || manual) this.note(line || 'The mockups are already tidy.');
      this.sendTabs();
      return line;
    } catch (e) {
      console.error('shell: mockups: the tidy failed: ' + (e as Error).message);
      return '';
    } finally { this.mockTidying = false; }
  }
  /**
   * The history at the bottom of the trail (2026-10-22, organised): by project (the repo a sheet comes from), then by
   * branch, one row per SHEET ("59 · Spotify mini player", a picked mark when decided), its versions under it, newest
   * first, the newest three out and older ones in a fold. Then the Archive. The count and the branches always; the
   * tree only while the list is open.
   */
  private mockView(): Record<string, unknown> | null {
    const st = this.mockStore;
    if (!st) return null;
    const all = st.list, dups = st.dups();
    const archivedN = new Set(all.filter((x) => st.archived(x.sheet)).map((x) => x.sheet)).size;
    const out: Record<string, unknown> = { count: all.length, dups: dups.size, open: this.mockList, branches: st.branches.map((b) => ({ ...b })), fresh: this.freshBranch || null,
      toAang: Boolean(this.sendMock), archived: archivedN, tidiedAt: st.tidiedAt || null };
    if (!this.mockList) return out;
    const shown = new Map(this.tabs.filter((t) => t.mock).map((t) => [t.mock!.sheet, t.mock!.key]));
    const bySheet = new Map<string, MockVersion[]>();
    for (const x of all) bySheet.set(x.sheet, [...(bySheet.get(x.sheet) ?? []), x]);
    for (const l of bySheet.values()) l.sort((a, b) => b.at - a.at || b.id - a.id);
    const newest = (s: string) => bySheet.get(s)?.[0]?.at ?? 0;
    const label = (s: string) => sheetLabel(bySheet.get(s)?.[0]?.title ?? '', s);
    const node = (sheet: string, kids: string[]): Record<string, unknown> => {
      const items = bySheet.get(sheet) ?? [], m = st.meta.get(sheet), lab = label(sheet);
      const line = (x: MockVersion) => ({ id: x.id, at: x.at, v: x.v, now: shown.get(sheet) === x.key && !dups.has(x.id), same: dups.get(x.id) ?? null, seen: x.seen?.length ?? 0,
        ...(x.stage ? { stage: x.stage, note: x.note ?? '', said: x.said ?? '', stageAt: x.stageAt ?? 0 } : {}) });
      const out1 = (x: MockVersion, i: number) => i < TIDY_KEEP && !x.old;
      return { sheet, num: lab.num, name: lab.name, title: lab.label, closed: !shown.has(sheet), picked: isPicked(m), hand: m?.picked !== undefined, n: items.length,
        items: items.filter(out1).map(line), older: items.filter((x, i) => !out1(x, i)).slice(0, 60).map(line),
        ...(m?.archived ? { archived: m.archived, why: m.why ?? 'hand', by: m.by ? label(m.by).label : null } : {}),
        children: kids.map((k) => node(k, [])) };
    };
    // The sheet's number, highest first (a stable order: opening one never makes the list jump); unnumbered by time.
    const rank = (s: string) => { const n = label(s).num, k = parseInt(n, 10); return Number.isFinite(k) ? k * 100 + (/[a-z]$/.test(n) ? n.charCodeAt(n.length - 1) - 96 : 0) : -1; };
    const byRank = (a: string, b: string) => rank(b) - rank(a) || newest(b) - newest(a);
    const live = [...bySheet.keys()].filter((s) => !st.archived(s));
    // A child whose parent is archived or has no history left stands at the top level.
    const parentOf = (s: string) => { const p = st.placeOf(s).parent; return p && bySheet.has(p) && !st.archived(p) ? p : null; };
    const tops = live.filter((s) => !parentOf(s));
    const kidsOf = (s: string) => live.filter((k) => parentOf(k) === s).sort(byRank);
    const projName = (sp: string) => (sp === '' ? (path.basename(this.mockRepo) || 'AangApp') : sp === 'live' ? 'Live pages' : sp);
    const spaces = [...new Set(tops.map(spaceOf))].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a === 'live' ? 1 : b === 'live' ? -1 : a.localeCompare(b)));
    const projects = spaces.map((sp) => {
      const nodes = (branch: number | null) => tops.filter((s) => spaceOf(s) === sp && st.placeOf(s).branch === branch).sort(byRank).slice(0, 120).map((s) => node(s, kidsOf(s)));
      return { name: projName(sp), loose: nodes(null), branches: st.branches.map((b) => ({ id: b.id, name: b.name, mockups: nodes(b.id) })).filter((b) => b.mockups.length) };
    });
    const archive = [...bySheet.keys()].filter((s) => st.archived(s)).sort((a, b) => (st.meta.get(b)!.archived! - st.meta.get(a)!.archived!) || byRank(a, b)).slice(0, 200).map((s) => node(s, []));
    out.tree = { projects, archive };
    return out;
  }

  // ------------------------------------------------------------------ Trail clean up (Tidy)
  private tidyTabs(): TidyTab[] {
    return this.tabs.filter((t) => isWeb(t.url) && !t.internal && !t.mock).map((t) => ({ id: t.id, url: t.url, title: t.title, trail: t.trail, lastSeen: t.lastSeen, active: this.panes.some((p) => p.active === t.id), audible: t.audible, lent: t.lent }));
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
    for (const id of staleTrails(this.trails.filter((x) => !x.mock), tabs, Date.now())) { const s = this.stashTrail(id); if (s !== null) run.stashed.push(s); }
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
    const url = addressFor(address, this.engine);
    const t = this.cur();
    if (!url) return;
    if (this.toPaid(url)) return;
    if (!t?.view || t.internal) { const night = t?.internal === 'night' ? t : null; this.newTab(url); if (night) this.close(night.id, false); return; }
    t.crashed = false;
    const l = this.stopFor(url);
    if (l.length) { this.block(t, url, l); return; }
    t.blocked = null; t.failed = null; this.place();
    t.pending = url;
    t.playOkAt = Date.now();                             // he typed it: what it plays, he asked for
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
      // Sheet 40 B: the pop-out's own keys, from the page left behind.
      case 'poppause': case 'poppin': case 'popclose': this.onPopoutAct?.(what); break;
      case 'drawer-open': void this.drawer(true); break;
      // Sheet 60 section 4: "Notes for this site" (the ... menu) opens the rail; the frame says when it opens and goes.
      case 'siterail-on': this.pane.railOpen = true; this.sendNotes(this.pane); break;
      case 'siterail-off': this.pane.railOpen = false; break;
      case 'peek': void this.peek(); break;
      case 'frozen-ready': this.frozenReady(); break;
      case 'importmarks': void this.importMarks(); break;
      case 'settings': if (this.o.secret) this.onSettings?.(); else this.openSettings(); break;
      case 'bookmarks': this.openSettings('bookmarks'); break;
      case 'history': this.openThings('history'); break;
      case 'downloads': this.openThings('downloads'); break;
      case 'print': if (wc && t && !t.internal) wc.print({}); break;
      // ONE broom (his catch, 2026-10-22: "isn't there already a broom somewhere?"): it tidies the tabs AND the mockups.
      case 'tidy': this.tidyStart(); void this.mockTidy(true); break;
      case 'tidykeep': this.tidyKeep(); break;
      case 'tidyundo': this.tidyUndo(); break;
      case 'trailundo': this.undoTrailClose(); break;
      case 'mockups': this.reopenMockups(); break;
      // The blue shield: open the popup he was looking for (as a tab, beside the page), or allow the site from now on.
      case 'popupopen': case 'popupallow': if (t?.blockedPopup) {
        const bp = t.blockedPopup;
        t.blockedPopup = null;
        if (what === 'popupallow' && bp.site) { this.popupOk.add(bp.site); try { writeFileAtomic(this.popupOkFile, JSON.stringify([...this.popupOk])); } catch { /* best effort */ } this.sync?.changed('prefs'); }
        if (!this.listed(bp.url).length) this.newTab(bp.url, t.id, true);
        this.sendTabs();
      } break;
      case 'winmin': this.win?.minimize(); break;
      case 'winmax': if (this.win) this.fillOrShrink(this.win); break;
      case 'winclose': this.win?.close(); break;
      // Autofill's save (sheet 77): the key's "Save this login" was clicked, or the card was put away.
      case 'afsaveask': this.afSaveAsk(); break;
      case 'afsavecancel': this.afSave = null; this.afBand(); break;
      // A double-click on the band's wood (2026-10-23, his report: nothing happened on the Mac). Windows does this itself
      // for the drag area; on the Mac Samara does what his Mac is set to (System Settings, Desktop & Dock: "Double-click a
      // window's title bar to"): fill the screen and back (the default), tuck it in the Dock, or nothing.
      // Right-click on the square key: what the Mac's green button offers, which Samara's own keys lost (2026-10-23).
      case 'winmenu': this.windowMenu(); break;
      case 'titledbl': if (this.win && process.platform === 'darwin') {
        const set = systemPreferences.getUserDefault('AppleActionOnDoubleClick', 'string');
        const tuck = set === 'Minimize' || (!set && systemPreferences.getUserDefault('AppleMiniaturizeOnDoubleClick', 'boolean'));
        if (tuck) this.win.minimize();
        else if (set !== 'None') this.fillOrShrink(this.win);
      } break;
      case 'homehere': { const u = t?.url; if (u && isWeb(u)) { this.prefs.home = u; this.savePrefs(); this.note('This page is your home page now.'); this.sendTabs(); } break; }
      case 'star': this.toggleMark(); break;
      // The + key on the shelf in the floating tab list (his freeze, 2026-10-20): its name box opened INSIDE that
      // see-through layer, out of sight, and the layer hung over the page. Now the list slides away and the band opens
      // its own box, exactly as the star does.
      case 'markadd': this.tray(false); this.win?.webContents.send('browser:tray', { open: false, mark: true }); break;
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
        try { const h = new URL(u).hostname; this.httpOk.add(h); this.peerHttp.delete(h); writeFileAtomic(this.httpOkFile, JSON.stringify([...this.httpOk])); writeFileAtomic(this.httpOkFile.replace(/[.]json$/, '-other.json'), JSON.stringify([...this.peerHttp])); this.sync?.changed('prefs'); } catch { /* best effort */ }
        t.failed = null; t.upgraded = null; this.place(); void wc.loadURL(u).catch(() => {});
      } break;
      // His bank: off to Chrome, and this tab steps back (or closes) so Samara never holds the page.
      case 'bankchrome': if (t?.blocked?.bank) { const u = t.blocked.url; this.toChrome(u); t.blocked = null; if (wc?.navigationHistory.canGoBack()) { this.place(); wc.navigationHistory.goBack(); } else this.close(t.id, false); } break;
      case 'failback': if (t) { t.failed = null; if (wc?.navigationHistory.canGoBack()) { this.place(); wc.navigationHistory.goBack(); } else this.close(t.id, false); } break;
      case 'phishopen': if (t?.blocked && !t.blocked.bank) { try { this.letThrough.add(new URL(t.blocked.url).hostname); } catch { /* bad url */ } const u = t.blocked.url; t.blocked = null; this.place(); void wc?.loadURL(u); } break;
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
    this.lastInput = Date.now();
    const k = i.key.toLowerCase(), c = i.control || i.meta;
    // ⇧⌘N on the Mac is a hidden menu shortcut (macmain.ts): it works whatever has the keyboard, the band included.
    if (c && i.shift && k === 'n' && process.platform !== 'darwin') { this.onSecret?.(); return true; }
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
    // Sheet 60: Esc closes the notes rail even while the page has the keyboard.
    if (k === 'escape' && this.pane.railOpen) { this.pane.railOpen = false; this.win?.webContents.send('browser:railclose'); return true; }
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
  /** Tabs he was on since the last save: only their scroll can have moved (measured 2026-10-20). */
  private scrollDue = new Set<number>();
  /** The last tabs file written, without its time: nothing changed means nothing written and nothing sent. */
  private lastSnap = '';
  /**
   * His saved tabs have been read back this run (or he starts on the home page). Until then nothing writes the tabs file
   * (2026-10-23: a mockup that arrived while Samara was still starting opened its tab first, that one tab was saved over
   * his list, and then the list read back held only it: every tab gone, twice). A mockup or link that arrives meanwhile
   * waits for the window's first load.
   */
  private restored = false;
  /** How many of his own tabs (not mockups) the tabs file held when last read or written. */
  private savedCount = 0;
  /**
   * A copy of the tabs file as it is now, kept aside (2026-10-23: one restart came back with every tab gone, and only a
   * stray copy from that morning brought them back). Taken at every start, and before any write that would drop most
   * of his tabs at once. The newest 10 are kept, in browser-tabs-kept beside it.
   */
  private keepTabsCopy(why: string): void {
    try {
      if (!existsSync(this.file)) return;
      const s = JSON.parse(readFileSync(this.file, 'utf8'));
      const n = (Array.isArray(s?.tabs) ? s.tabs : []).filter((t: { mock?: unknown }) => !t?.mock).length;
      if (n < 2) return;
      const dir = path.join(path.dirname(this.file), 'browser-tabs-kept');
      mkdirSync(dir, { recursive: true });
      copyFileSync(this.file, path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${why}.json`));
      const all = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
      for (const f of all.slice(0, Math.max(0, all.length - 10))) { try { unlinkSync(path.join(dir, f)); } catch { /* next time */ } }
    } catch (e) { console.error('shell: browser: the tabs copy was not kept: ' + (e as Error).message); }
  }
  private async snapshot(all = false): Promise<void> {
    if (!this.restored) return;
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
    // Only the tabs in front, and the ones he was on since the last save (measured 2026-10-20: asking every tab every
    // 8 s woke them all, and on a slow machine ran past its deadline so nothing was saved). Closing asks them all.
    const due = this.scrollDue; this.scrollDue = new Set();
    await Promise.all(keep.map(async (t) => {
      if (!t.view || t.crashed || t.view.webContents.isDestroyed()) return;
      if (!all && !due.has(t.id) && !this.panes.some((p) => p.active === t.id)) return;
      const wc = t.view.webContents;
      const got = await within(askPage<[number, string]>(wc, PAGE_LOOK_JS), 800, null);
      if (Array.isArray(got) && Number.isFinite(got[0])) { t.scrollY = got[0]; t.pageBg = hexOf(got[1]) ?? t.pageBg; }
      try { const h = wc.navigationHistory; const s = h.getEntryAtIndex(h.getActiveIndex())?.pageState; t.pageState = s && s.length <= PAGE_STATE_MAX ? s : undefined; } catch { /* kept as it was */ }
    }));
    const data = {
      v: 1,
      // Every window's tabs, each knowing its window (`win`), and the tab in front in each (`fronts`).
      active: Math.max(0, keep.findIndex((x) => x.id === front)),
      fronts,
      tabs: keep.map((t) => ({
        url: t.url, title: t.title, opener: t.opener === null ? null : keep.findIndex((x) => x.id === t.opener),
        scrollY: Math.round(t.scrollY), zoom: t.zoom, muted: t.muted, trail: t.trail, done: t.done, win: winOf.get(t.pane) ?? 0,
        ...(t.mock ? { mock: { ...t.mock } } : {}),
        ...(t.pageBg ? { pageBg: t.pageBg } : {}),
        ...(t.pageState && !t.mock ? { pageState: t.pageState } : {}),
        ...(t.favicon && /^(https:|data:image\/)/.test(t.favicon) && t.favicon.length < 4000 ? { favicon: t.favicon } : {}),
      })),
      trails,
      closed,
    };
    const body = JSON.stringify(data);
    if (!all && body === this.lastSnap) return;
    this.lastSnap = body;
    const mine = data.tabs.filter((t) => !t.mock).length;
    if (this.savedCount >= 4 && mine < this.savedCount / 2) this.keepTabsCopy('drop');
    this.savedCount = mine;
    // In the background while he browses; on closing, written before anything else happens.
    const text = JSON.stringify({ ...data, at: new Date().toISOString() });
    const fail = (e: unknown) => console.error('shell: browser: the tabs could not be saved: ' + (e as Error).message);
    if (all) { try { writeFileAtomic(this.file, text); } catch (e) { fail(e); } } else writeFileAtomicSoon(this.file, text).catch(fail);
    this.sync?.changed('tabs');
  }

  /** Bring every tab back from the last snapshot. Only the one he was on loads; the rest come back asleep. */
  private restore(): boolean {
    this.keepTabsCopy('start');
    this.restored = true;
    try {
      if (!existsSync(this.file)) return false;
      const s = JSON.parse(readFileSync(this.file, 'utf8'));
      this.savedCount = (Array.isArray(s?.tabs) ? s.tabs : []).filter((t: { mock?: unknown }) => !t?.mock).length;
      // A mockup tab only where the mockups are on (sheet 47); its page server is not there otherwise.
      const list = Array.isArray(s?.tabs) ? s.tabs.filter((t: { url?: unknown; mock?: unknown }) => typeof t?.url === 'string' && isWeb(t.url as string) && (!t.mock || this.mockServer)).slice(0, 80) : [];
      if (!list.length) return false;
      // Sheet 87: the secret window's PIN brings its tabs back beside pages already open (they join them).
      const at0 = this.tabs.length;
      const ids: number[] = [];
      for (const t of list) {
        const fav = typeof t.favicon === 'string' && /^(https:|data:image\/)/.test(t.favicon) && t.favicon.length < 4000 ? t.favicon : '';
        const tab: Tab = { id: ++this.seq, view: null, opener: null, title: String(t.title ?? t.url).slice(0, 300), url: t.url, favicon: fav,
          loading: false, audible: false, muted: t.muted === true, crashed: false, scrollY: Number(t.scrollY) || 0, zoom: Number(t.zoom) || 0, lastSeen: Date.now(), blocked: null,
          trail: Number.isInteger(t.trail) ? t.trail : null, done: false, lent: false, upgraded: null, failed: null, blockedPopup: null, pane: this.pane.id };
        if (typeof t.pageBg === 'string' && /^#[0-9a-f]{6}$/.test(t.pageBg)) tab.pageBg = t.pageBg;
        if (typeof t.pageState === 'string' && t.pageState.length <= PAGE_STATE_MAX && /^[A-Za-z0-9+/=]+$/.test(t.pageState)) tab.pageState = t.pageState;
        // Sheet 47: a mockup tab comes back as one (only while the mockups are on here), in the MOCKUPS trail.
        const m = t.mock;
        if (m && typeof m.sheet === 'string' && typeof m.commit === 'string' && typeof m.key === 'string') { tab.mock = { sheet: m.sheet, commit: m.commit, key: m.key, ...(Number.isFinite(m.at) ? { at: Number(m.at) } : {}), ...(m.unseen === true ? { unseen: true } : {}) }; tab.trail = MOCK_TRAIL; }
        ids.push(tab.id);
        this.tabs.push(tab);
      }
      list.forEach((t: { opener?: unknown }, i: number) => { const o = Number(t.opener); if (Number.isInteger(o) && o >= 0 && o < ids.length && o !== i) this.tabs[at0 + i]!.opener = ids[o]!; });
      if (Array.isArray(s.closed)) this.closed = s.closed.filter((u: unknown) => typeof u === 'string' && isWeb(u as string)).slice(-25);
      if (Array.isArray(s.trails)) this.trails = s.trails.filter((x: Partial<Trail>) => Number.isInteger(x?.id) && typeof x?.name === 'string')
        .map((x: Trail) => ({ id: x.id, name: x.name.slice(0, 24), named: x.named === true, collapsed: x.collapsed === true, ...(x.id === MOCK_TRAIL ? { mock: true } : {}) }));
      this.trails = this.trails.filter((x) => x.id !== MOCK_TRAIL || this.mockServer);
      if (this.tabs.some((t) => t.mock)) this.mockTrail();
      this.trailSeq = this.trails.reduce((m, x) => Math.max(m, x.id), 0);
      for (const t of this.tabs) if (t.trail !== null && !this.trails.some((x) => x.id === t.trail)) t.trail = null;
      this.tidyTrails();
      // Every window he had open comes back with its own tabs (2026-10-14). The first one is this window.
      const wins = new Map<number, Tab[]>();
      list.forEach((t: { win?: unknown }, i: number) => { const w = this.o.secret ? 0 : Math.max(0, Math.min(6, Number(t.win) || 0)); if (w > 0) { const a = wins.get(w) ?? []; a.push(this.tabs[at0 + i]!); wins.set(w, a); } });
      const fronts: number[] = Array.isArray(s.fronts) ? s.fronts.map((n: unknown) => Number(n)) : [];
      const here = this.tabs.filter((t) => ![...wins.values()].some((a) => a.includes(t)));
      const want = this.tabs[at0 + Number(fronts[0])];
      const a = at0 + Math.min(Math.max(0, Number(s.active) || 0), list.length - 1);
      this.activate((want && here.includes(want) ? want : here[0] ?? this.tabs[a]!).id);
      const base = this.win?.getBounds();
      let n = 0;
      for (const [w, group] of wins) {
        n++;
        const front = this.tabs[at0 + Number(fronts[w])];
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
    // The tab list only while it is open (measured 2026-10-20: every message went to it hidden too). Opening it sends
    // the current state first, so it is never stale.
    const send = (data: Record<string, unknown>) => { w.webContents.send('browser:tabs', data); if (this.trayOn) tray?.send('browser:tabs', data); };
    send({
      active: this.active,
      update: this.update, updated: this.updated, inCall: this.inCall,
      canBack: Boolean(wc?.navigationHistory.canGoBack()), canForward: Boolean(wc?.navigationHistory.canGoForward()),
      // A sleeping tab keeps its logo (his ask, 2026-10-20): its last one, else the site's from bookmarks.
      tabs: mine.map((x) => ({ id: x.id, opener: x.opener, title: x.title, url: x.url, favicon: x.favicon || this.iconOf(x.url), loading: x.loading, phase: x.phase ?? (x.loading ? 'loading' : 'idle'), prog: x.prog ?? 0, pending: x.pending ?? null, audible: x.audible, muted: x.muted, crashed: x.crashed, asleep: !x.view, blocked: x.blocked, failed: x.failed, trail: x.trail, done: x.done, lent: x.lent, popup: x.blockedPopup?.url ?? null, mock: x.mock ? this.mockTab(x) : null, internal: x.internal ? true : undefined })),
      // Sheet 47: the MOCKUPS trail's history (the whole list only while it is open), or null where mockups are off.
      mockups: this.mockView(),
      // 2026-10-22: the notes rail needs Aang (its notes live in his brain). Samara alone or on the Mac: the row is hidden.
      notes: Boolean(this.onNoteSave),
      // 2026-10-22: the newest mockup to arrive ({ n, sheet, at }), so the drawer's arrow can breathe for it.
      mockNew: this.mockNew,
      // The trails with a tab in this window (or the one about to start here).
      trails: this.trails.filter((tr) => tr.id === this.pendingTrail || mine.some((x) => x.trail === tr.id)),
      drivers: this.driver.view(),
      // His own tab being driven by a session: the band says so, with STOP (2026-10-14).
      driving: (() => { const w = t?.view?.webContents; return w ? this.driver.drivingTab(w) : null; })(),
      watching: this.watching === null ? null : (() => { const p = this.driver.page(this.watching!); const j = p ? this.driver.job(p.job) : undefined; return p && j ? { page: p.id, job: j.id, kind: j.kind, working: j.working, url: p.url, title: p.title } : null; })(),
      tidy: this.tidyState(),
      stash: this.stash.map((s) => ({ id: s.id, name: s.name, count: s.tabs.length })),
      adsPaused: (() => { try { return this.paused.has(new URL(t?.url ?? '').hostname.replace(/^www\./, '')); } catch { return false; } })(),
      adsOn: Boolean(this.ads),
      darkHere: this.darkWanted(t?.url ?? ''), darkAll: this.prefs.dark,
      site: this.siteState(t?.url ?? ''),
      sounds: this.sounds,
      prefs: this.prefs,
      tabSize: this.tabSize,
      // The shelf: the bar ones first, as in Chrome, then the rest. Only what the shelf can show is sent.
      marks: this.locked ? [] : [...this.marks.filter((m) => isBar(m.folder)), ...this.marks.filter((m) => !isBar(m.folder))].slice(0, 24).map((m) => ({ title: m.title, url: m.url, favicon: this.iconOf(m.url) })),
      markCount: this.locked ? 0 : this.marks.length,
      // Sheet 87: the secret window (its night look and mask), locked or not, and its History panel once open.
      ...(this.o.secret ? { secret: true, locked: this.locked } : {}),
      // Sheet 89: what is on his TV, and the TV ask.
      tv: this.tvState(),
      // New tabs from links since he last opened the list.
      newTabs: this.newSince,
      hasLogin: this.hasLogin,
      loginKnown: this.loginKnown,
      maximized: Boolean(w.isMaximized()),
      home: this.HOME,
      starred: Boolean(t && !this.locked && this.marks.some((m) => m.url === t.url)),
      markTitle: (t && this.marks.find((m) => m.url === t.url)?.title) ?? '',
      // The page's zoom as he would say it: 100%, 120%... (Chromium's level is 20% per step).
      zoomPct: wc ? Math.round(Math.pow(1.2, wc.getZoomLevel()) * 100) : 100,
      ...(t?.lent && t.lentShot && this.pane.lentSent !== t.lentShot ? { lentShot: (this.pane.lentSent = t.lentShot) } : {}),
    });
    // Sheet 87: the secret window's title never names its page (the Mac lists window titles in its menus).
    if (t) w.setTitle(this.o.secret ? 'Samara' : `${t.title} - Samara`);
  }

  /** Quitting: every window closes at once, and none of their tabs is dropped on the way out. */
  private quitting = false;
  /** A Samara window is open (what keeps the Shell running when Aang is off). */
  hasWindow(): boolean { return this.panes.some((p) => this.alive(p)); }
  /** The Samara window he used last (the Claude job's bar under the lantern goes on it, taskbar.ts), or null. */
  frontWindow(): BrowserWindow | null { const p = this.lastPane(); return p?.win && !p.win.isDestroyed() ? p.win : null; }
  closeAll(): void {
    void this.ses.cookies.flushStore().catch(() => {});
    this.driver.closeAll();
    const open = this.panes.filter((p) => this.alive(p));
    if (open.length) { this.quitting = true; void this.snapshot(true); }
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
      // His tab lent for reading only: nothing that acts on it (2026-10-14).
      if (['key', 'select', 'back', 'forward', 'upload', 'hover', 'drag'].includes(op) && Number.isInteger(Number(a?.page)) && d.readOnly(Number(a?.page))) return { ok: false, error: 'that is his tab, lent for reading only. To act in it, ask with browser_drive_tab (he is asked)' };
      switch (op) {
        // His browsing history, for Aang, only when he asks (2026-10-13): titles and addresses, never a money site.
        case 'history': {
          const days = Number(a?.days); const q = String(a?.q ?? '').slice(0, 200);
          return { ok: true, items: forAang(this.visits.list, q, Number.isFinite(days) ? days : 14, 15, Date.now()) };
        }
        case 'start': {
          const pl = a?.plan as { login?: unknown; denied?: unknown; steps?: unknown; allowed?: unknown } | undefined;
          const plan = pl ? { login: Array.isArray(pl.login) ? pl.login.map(String) : [], denied: Array.isArray(pl.denied) ? pl.denied.map(String) : [], steps: Array.isArray(pl.steps) ? pl.steps.map(String) : [], allowed: Array.isArray(pl.allowed) ? pl.allowed.map(String) : [] } : undefined;
          const j = d.startJob(a?.kind === 'claude' ? 'claude' : 'aang', String(a?.name ?? ''), plan);
          return { ok: true, job: j.id };
        }
        case 'finish': d.finish(num('job')); return { ok: true };
        case 'planstep': return this.planStep(num('job'), a?.done === true ? null : num('at'));
        case 'rename': d.rename(num('job'), String(a?.name ?? '').slice(0, 40)); return { ok: true };
        case 'open': {
          const job = num('job'), url = String(a?.url ?? '').slice(0, 2000);
          // AI lockdown G1/G2 (2026-10-14): using his login outside the job's sites, or sending what looks like private
          // details to a site in the address, waits for his OK.
          const login = a?.signedIn === true ? d.needsLogin(job, url) : '';
          if (login && a?.allowed !== true) return { ok: false, needs: 'lever', what: `use your login on ${login} for this job` };
          if (login) d.allowSite(job, url);
          const leak = carriesData(url);
          if (leak && a?.allowed !== true) { let s = ''; try { s = new URL(url).hostname; } catch { /* none */ } return { ok: false, needs: 'lever', what: `open ${s} with ${leak} in the address` }; }
          const r = await d.open(job, url); const note = this.siteNote(r.url); return { ok: true, ...r, ...(note ? { note } : {}) };
        }
        // Per-site notes (driver v2 part 3): what worked on a site, written by Claude for its next session there.
        case 'note': {
          const host = this.noteHost(String(a?.site ?? ''));
          if (!host) return { ok: false, error: 'say which site (an address or a name like linkedin.com)' };
          if (a?.text === undefined) return { ok: true, site: host, note: this.siteNote('https://' + host) };
          this.setSiteNote(host, String(a.text));
          return { ok: true, site: host, saved: true };
        }
        case 'read': return { ok: true, ...(await d.read(num('page'), { ...(Number.isInteger(Number(a?.within)) && a?.within !== undefined ? { within: Number(a.within) } : {}), changes: a?.changes === true })) };
        case 'find': return { ok: true, ...(await d.find(num('page'), String(a?.q ?? '').slice(0, 200))) };
        case 'waitfor': return { ok: true, ...(await d.waitFor(num('page'), String(a?.text ?? '').slice(0, 200), a?.gone === true, Number(a?.ms) || 8000)) };
        case 'jobs': return { ok: true, ...(await d.jobCards(num('page'))) };
        case 'sweep': return { ok: true, ...d.startSweep(num('page'), { keywords: Array.isArray(a?.keywords) ? (a.keywords as unknown[]).map(String) : [], ...(a?.path ? { path: String(a.path) } : {}), ...(a?.card ? { card: String(a.card) } : {}), ...(Number(a?.spacing) ? { spacing: Number(a.spacing) } : {}) }) };
        case 'sweep_status': return { ok: true, ...d.sweepStatus(num('id')) };
        case 'form': return { ok: true, ...(await d.form(num('page'), a?.within === undefined ? undefined : num('within'))) };
        // The fixed page readers, hover and drag, and the developer views (2026-10-14: the Chrome extension's tools).
        case 'extract': return { ok: true, ...(await d.extract(num('page'), String(a?.kind ?? ''))) };
        case 'hover': return { ok: true, ...(await d.hover(num('page'), num('n'))) };
        case 'drag': {
          if (d.readOnly(num('page'))) return { ok: false, error: 'that is his tab, lent for reading only. To act in it, ask with browser_drive_tab (he is asked)' };
          return { ok: true, ...(await d.drag(num('page'), num('n'), { ...(a?.to !== undefined ? { n: num('to') } : {}), dx: Number(a?.dx) || 0, dy: Number(a?.dy) || 0 })) };
        }
        case 'resize': return { ok: true, ...d.resize(num('page'), Number(a?.width), Number(a?.height)) };
        case 'console': return { ok: true, ...d.console(num('page'), { ...(a?.pattern ? { pattern: String(a.pattern) } : {}), errors: a?.errors === true, limit: Number(a?.limit) || 30 }) };
        case 'network': {
          if (d.readOnly(num('page')) || d.isBorrowed(num('page'))) return { ok: false, error: "his own tabs' network is never watched; open the page in your own tab" };
          return { ok: true, ...(await d.network(num('page'), { ...(a?.pattern ? { pattern: String(a.pattern) } : {}), limit: Number(a?.limit) || 30 })) };
        }
        case 'record': {
          if (a?.stop === true) { const r = await d.stopRecording(num('page')); return r ? { ok: true, ...r } : { ok: false, error: 'that page is not being recorded' }; }
          await d.startRecording(num('page')); return { ok: true, started: true };
        }
        case 'upload': {
          const page = num('page'), n = num('n'), file = String(a?.file ?? '');
          // Checked before he is asked (code audit M7): he is never asked about a file that would be refused, and the
          // question names the real file, its folder and its size.
          const up = d.checkUpload(file);
          if (a?.allowed !== true) return { ok: false, needs: 'lever', what: `upload ${up.label} to ${d.describe(page, n).replace(/^.* on /, '')}` };
          return { ok: true, ...(await d.upload(page, n, file)) };
        }
        case 'collect': return { ok: true, ...(await d.collectJobs(num('page'), Math.max(1, Math.min(120, Number(a?.max) || 60)))) };
        case 'back': case 'forward': return { ok: true, ...(await d.history(num('page'), op === 'back')) };
        case 'select': return { ok: true, ...(await d.choose(num('page'), num('n'), String(a?.option ?? '').slice(0, 200))) };
        case 'key': {
          // Enter or Space on a control is weighed like a click on it (or sending its form); the other keys are free.
          const page = num('page'), key = String(a?.key ?? '').toLowerCase();
          if (key === 'enter' || key === 'space') {
            const f = await d.focused(page);
            // The cursor on something with no number (moved there with Tab, or put there by the page): Enter could
            // send anything, so it asks him (AI lockdown G6).
            if (f === null && a?.allowed !== true) return { ok: false, needs: 'lever', what: `press ${key === 'enter' ? 'Enter' : 'Space'} where the page has put the cursor` };
            if (f !== null) {
              const w = key === 'enter' ? (d.weightOf(page, f, 'enter') === 'free' || d.weightOf(page, f, 'click') === 'free' ? 'free' : d.weightOf(page, f, 'enter') === 'never' ? 'never' : 'lever') : d.weightOf(page, f, 'click');
              if (w === 'never') return { ok: false, error: `that would act on ${d.describe(page, f)}, and buying, passwords and card details are never done for him` };
              if (w === 'lever' && a?.allowed !== true) return { ok: false, needs: 'lever', what: `press ${key === 'enter' ? 'Enter' : 'Space'} on ${d.describe(page, f)}` };
            }
          }
          return { ok: true, ...(await d.key(page, key)) };
        }
        case 'click': case 'type': {
          const page = num('page'), n = num('n');
          if (d.readOnly(page)) return { ok: false, error: 'that is his tab, lent for reading only. To act in it, ask with browser_drive_tab (he is asked)' };
          const w = op === 'click' ? d.weightOf(page, n, 'click') : d.weightOf(page, n, 'type');
          const we = op === 'type' && a?.enter === true ? d.weightOf(page, n, 'enter') : 'free';
          const worst = w === 'never' || we === 'never' ? 'never' : w === 'lever' || we === 'lever' ? 'lever' : 'free';
          if (worst === 'never') return { ok: false, error: `that is ${d.describe(page, n)}, and buying, passwords and card details are never done for him. He has to do it himself` };
          if (worst === 'lever' && a?.allowed !== true) return { ok: false, needs: 'lever', what: `${op === 'click' ? 'press' : 'fill in and send'} ${d.describe(page, n)}` };
          // His details typed on a site outside the job's sites (a fake "quick apply" sees every key): asks him (G3).
          if (op === 'type' && a?.allowed !== true && d.offFence(page)) { const what = personal(String(a?.text ?? ''), this.privateWords()); if (what) return { ok: false, needs: 'lever', what: `type ${what} into ${d.describe(page, n)}` }; }
          const r = op === 'click' ? await d.click(page, n, a?.allowed === true) : await d.type(page, n, String(a?.text ?? ''), a?.enter === true);
          if ('needs' in r) return { ok: false, needs: r.needs, what: r.what };
          return { ok: true, ...r };
        }
        case 'scroll': await d.scroll(num('page'), a?.down !== false); return { ok: true };
        // ---- his own tabs (2026-10-14): "look at what I'm looking at", "fill this in for me". Each asks him first.
        case 'tabs': {
          // One OK is enough (his rule, 2026-10-20): a plan he allowed covers seeing his tab list for that session.
          const pj = d.job(num('job'));
          if (a?.allowed !== true && !pj?.planned) return { ok: false, needs: 'lever', what: 'see the list of your open tabs' };
          const cur = this.cur();
          return { ok: true, tabs: this.tabs.filter((t) => isWeb(t.url) && !t.internal).map((t) => ({ tab: t.id, title: neverKeep(t.url) ? '(a bank or money site: hidden)' : t.title.slice(0, 120), url: neverKeep(t.url) ? '' : t.url.slice(0, 300), active: t.id === cur?.id, asleep: !t.view })) };
        }
        case 'look': case 'drivetab': {
          const t = a?.tab === undefined ? this.cur() : this.tabs.find((x) => x.id === num('tab'));
          if (!t || !isWeb(t.url) || t.internal) return { ok: false, error: 'there is no web page in that tab' };
          if (neverKeep(t.url)) return { ok: false, error: 'that tab is a bank or money site: never read or driven for a session (his rule)' };
          let site = ''; try { site = new URL(t.url).hostname.replace(/^www\./, ''); } catch { /* none */ }
          // ...and reading or driving his tab on a site that plan named: he already said yes to that site this session.
          const pj = d.job(num('job'));
          const inPlan = Boolean(pj?.allowed && [...pj.allowed].some((s) => site === s || site.endsWith('.' + s)));
          if (a?.allowed !== true && !inPlan) return { ok: false, needs: 'lever', what: op === 'look' ? `read your tab on ${site}` : `drive your tab on ${site} while you watch (STOP ends it)` };
          if (!t.view) this.wake(t); else this.thaw(t);
          const wc = t.view?.webContents;
          if (!wc) return { ok: false, error: 'that tab could not be woken' };
          const r = d.borrow(num('job'), wc, t.id, op === 'drivetab');
          this.sendTabs();
          return { ok: true, ...r, yours: true };
        }
        case 'picture': {
          const what = a?.what === 'view' || a?.what === 'marks' ? a.what as 'view' | 'marks' : Number.isInteger(Number(a?.what)) ? Number(a?.what) : 'best';
          const r = await d.picture(num('page'), what);
          const p = d.page(num('page'));
          return { ok: true, png: r.png.toString('base64'), video: r.video, width: r.width, height: r.height, url: p?.url ?? '', title: p?.title ?? '' };
        }
        case 'close': d.close(num('page')); return { ok: true };
        default: return { ok: false, error: 'unknown step' };
      }
    } catch (e) { return { ok: false, error: (e as Error).message }; }
  }

  /** His own words a driving session must not type outside its job's sites without asking (private-words.json, optional:
   *  his name, street, and the like; emails and phone numbers are caught anyway). */
  private privateWords(): string[] { try { const j = JSON.parse(readFileSync(path.join(this.o.stateDir, 'private-words.json'), 'utf8')); return Array.isArray(j) ? j.map(String).slice(0, 50) : []; } catch { return []; } }
  /** Notes per site for driving sessions, kept between runs. Claude's own words for its next visit. */
  private notesOfSites: Record<string, string> | null = null;
  private get siteNotes(): Record<string, string> {
    if (!this.notesOfSites) { try { this.notesOfSites = JSON.parse(readFileSync(path.join(this.o.stateDir, 'driver-notes.json'), 'utf8')); } catch { this.notesOfSites = {}; } }
    return this.notesOfSites!;
  }
  private noteHost(site: string): string {
    const t = site.trim().toLowerCase();
    // The site's own name, so one site can never write the note another reads (AI lockdown G8: "*.github.io" shared one).
    try { return siteOf(new URL(/^https?:/.test(t) ? t : 'https://' + t).hostname); } catch { return ''; }
  }
  private siteNote(url: string): string { const h = this.noteHost(url); return h ? this.siteNotes[h] ?? '' : ''; }
  private setSiteNote(host: string, text: string): void {
    const n = this.siteNotes;
    const t = text.replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, 1500);
    if (t) n[host] = t; else delete n[host];
    try { writeFileAtomic(path.join(this.o.stateDir, 'driver-notes.json'), JSON.stringify(n)); } catch { /* best effort */ }
  }

  /** A driven page's site, for naming its job list. */
  pageHost(id: number): string { try { return new URL(this.driver.page(id)?.url ?? '').hostname.replace(/^www\./, ''); } catch { return 'page'; } }
  /** The page a sweep runs on, or null. */
  sweepPage(id: number): number | null { return this.driver.sweepPage(id); }
  /** The job a driven page belongs to, or null. */
  pageJob(id: number): number | null { return this.driver.page(id)?.job ?? null; }
  /**
   * The held lever for a Claude session (the Claude door): asked in the band of the window he last used, every time.
   * Null when no browser window is open to ask in; the door then says so instead of acting.
   */
  /**
   * Show a plan and wait for his answer: in Aang's bubble when the PC has one, else dropped from Samara's band (opened
   * if needed). Null when nothing could show it, or nobody answered in five minutes.
   */
  async askPlan(card: Omit<PlanCard, 'id'>): Promise<PlanAnswer | null> {
    const c: PlanCard = { ...card, id: 'samara:' + ++this.planSeq };
    if (this.onPlanAsk) { const a = await this.onPlanAsk(c); if (a) return this.planClean(c, a); }
    if (!this.lastPane()) { this.open(); await new Promise((r) => setTimeout(r, 1500)); }
    const p = this.lastPane();
    if (!p || !this.win || this.win.isDestroyed()) return null;
    this.pane = p;
    const answer = new Promise<PlanAnswer | null>((done) => {
      this.planWait.set(c.id, done);
      setTimeout(() => { if (this.planWait.delete(c.id)) { done(null); this.win?.webContents.send('browser:plan', null); } }, 5 * 60_000);
    });
    this.win.webContents.send('browser:plan', c);
    this.win.show();
    const a = await answer;
    return a ? this.planClean(c, a) : null;
  }
  /** His answer from the band's plan tray. Only a card that is waiting can be answered. */
  planReply(id: string, a: { go?: unknown; change?: unknown; keep?: unknown; note?: unknown }): void {
    const done = this.planWait.get(id);
    if (!done) return;
    this.planWait.delete(id);
    this.win?.webContents.send('browser:plan', null);
    done({ go: a.go === true, change: a.change === true, keep: Array.isArray(a.keep) ? a.keep.map(String) : [], note: String(a.note ?? '') });
  }
  /** Whatever came back, only the card's own sites can be kept, and the note is plain words, short. */
  private planClean(c: PlanCard, a: PlanAnswer): PlanAnswer {
    const ours = new Set(c.sites.map((x) => x.site));
    return { card: c.id, go: a.go === true && a.change !== true, change: a.change === true, keep: a.keep.filter((x) => ours.has(x)).slice(0, 20), note: String(a.note ?? '').replace(/\s+/g, ' ').trim().slice(0, 500) };
  }
  /** The live checklist: Claude says which step it is on (or that it is done). */
  planStep(jobId: number, at: number | null): { ok: boolean; step?: string } {
    const j = this.driver.job(jobId);
    if (!j?.planned || !j.steps) return { ok: false };
    const card = this.planOfJob.get(jobId);
    // Done (his rule, 2026-10-20: "if you're done driving something close it and close the session title header"): his
    // tabs go back to him, the session's own pages close, and its group goes.
    if (at === null) { if (card) this.onPlanStep?.(card, null); try { this.onPlanDone?.(jobId); } catch { /* a record only */ } this.driver.endJob(jobId); this.sendTabs(); return { ok: true }; }
    j.step = Math.max(0, Math.min(j.steps.length - 1, Math.round(at)));
    if (card) this.onPlanStep?.(card, j.step);
    this.sendTabs();
    return { ok: true, step: j.steps[j.step] };
  }
  /** Remember which card a planned job came from. */
  planJob(jobId: number, card: string): void { this.planOfJob.set(jobId, card); }
  /** Would this plan site use his login? Only where his rules say so: the job sites for a job scan, or "use my login". */
  planLogin(task: string, site: string): boolean {
    const r = this.rules.login(site);
    return r === true || (r === undefined && jobTask(task) && JOB_SITES.includes(siteOf(siteKey(site))));
  }
  /** The site's own icon for the card, if Samara has seen it. */
  planIcon(site: string): string { return this.iconOf('https://' + siteKey(site) + '/'); }

  askForClaude(what: string): Promise<boolean | null> {
    const p = this.lastPane();
    if (!p) return Promise.resolve(null);
    this.pane = p;
    return new Promise((done) => this.ask({ host: 'Claude', what: `Let Claude ${what.slice(0, 120)}?`, text: 'A Claude session driving its own tab in your browser wants to do this. It only happens if you say yes, and only this once.', yes: 'Allow once', no: 'No' }, done));
  }

  // ------------------------------------------------------------------ 6.25a: his view of Aang's pages
  /** The drawer and the address bar: STOP a job, close it, watch one of its pages, or open a page as his own tab. */
  driverAct(act: string, id: number): void {
    if (act === 'stop') this.driver.stop(id);   // only after he confirms it in the page (browser.js stopKey)
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
    if (this.watching !== null && this.watching !== pageId) this.driver.watched(this.watching, null);
    this.watching = pageId;
    const [cw, ch] = w.getContentSize();
    this.driver.watched(pageId, { width: cw - this.inset.left - this.inset.right, height: ch - this.inset.top - this.inset.bottom });
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
    this.driver.watched(this.watching, null);
    this.watching = null;
    if (this.watchTimer) { clearTimeout(this.watchTimer); this.watchTimer = null; }
    this.win?.webContents.send('browser:watch', null);
    const t = this.cur();
    if (show && t?.view && !t.lent && !this.drawerOpen) { this.place(); t.view.setVisible(true); }
    this.sendTabs();
  }
}
