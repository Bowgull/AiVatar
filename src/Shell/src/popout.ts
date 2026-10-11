// The pop-out: a video window that sits over WoW (step 6.3, his decision 27, mockup sheet 4).
//
// What makes it different from an ordinary window:
//   - Always on top, but still A NORMAL CLICKABLE WINDOW (decision 32). Click it to use it, click the
//     game to go back. No ghost mode, no click-through by default.
//   - 16 by 9 is held by Aang, not by Windows: setAspectRatio was tested on 2026-10-04 and does not
//     apply to a size set from code, only to a drag.
//   - It opens at the size and place he last left it. It never resizes itself.
//   - One at a time (decision 34): a new video replaces the one that is there.
//   - Opaque by default (decision 45, measured in 6.1: a see-through always-on-top window pushes the
//     GPU's drawing load from ~29% to 47%, an opaque one costs nothing).
//   - Hidden outright when not in use rather than made invisible, so it costs nothing while away.
import { BrowserWindow, screen as electronScreen, type WebContentsView } from 'electron';
import path from 'node:path';
import { embedFor, titleFor, type Embed } from './embed.ts';
import { CHROME, MIN, firstTime, hold169, ontoScreen, preset, snapToEdges, type Box } from './geometry.ts';
import { SAFE_WEB_PREFERENCES, lockDown, wrongSettings } from './safety.ts';
import type { PageServer } from './pageserver.ts';
import type { PopoutSettings } from './settings.ts';
import type { FindSkips } from './skip/find.ts';
import type { SkipSettings } from './skip/settings.ts';

export interface PopoutDeps {
  pages: PageServer;
  preloadPath: string;
  /** His switches, read fresh each time the window opens. */
  settings: () => PopoutSettings;
  /** Works out what to skip. Optional: without it nothing is skipped, which is a fine way to run. */
  skips?: FindSkips;
  skipSettings?: () => SkipSettings;
  /** Where the remembered size and place live, and how they are written back. */
  remembered: () => Box | null;
  remember: (box: Box) => void;
}

export class Popout {
  private win: BrowserWindow | null = null;
  private deps: PopoutDeps;
  /** What is playing, so a reopened window can put it back. */
  private showing: { link: string; embed: Embed; title: string; about?: { title?: string; episode?: number } } | null = null;
  /**
   * How much of the window is Aang's own chrome rather than picture. The page measures itself and
   * says, because this changes whenever a control is added and a stale number letterboxes the picture
   * without anyone noticing.
   */
  private chrome = CHROME;

  /** Told by the page once it has drawn itself. */
  setChrome(px: number): void {
    if (!Number.isFinite(px) || px < 0 || px > 400) return;
    if (Math.abs(px - this.chrome) < 2) return;
    this.chrome = px;
    const w = this.window;
    if (!w) return;
    const b = w.getBounds();
    const { width, height } = hold169(b.width, b.height, 'width', this.chrome);
    if (height !== b.height) w.setBounds({ ...b, width, height });
  }

  constructor(deps: PopoutDeps) { this.deps = deps; }

  // ------------------------------------------------------------------ a tab taken from the browser (2026-10-11)
  // "Take the tab with you": any video on any site. The live page itself moves in under the popout's own bar and
  // controls, so nothing reloads and his login comes with it. The page is shown at the video alone by asking the
  // page to put its player in fullscreen, which, with this window not allowed to go fullscreen itself, fills
  // exactly the space it has here. If a page refuses, the whole page shows instead: still the right video.
  private lent: { view: WebContentsView; back: (view: WebContentsView) => void; poll: NodeJS.Timeout; cursor: NodeJS.Timeout; css: string | null } | null = null;
  private stage = { x: 0, y: 34, width: 0, height: 0 };

  /** The page says where its picture area is, in its own pixels; the lent page is laid exactly over it. */
  setStage(r: { x: number; y: number; width: number; height: number }): void {
    if (![r.x, r.y, r.width, r.height].every(Number.isFinite)) return;
    this.stage = { x: Math.round(r.x), y: Math.round(r.y), width: Math.max(0, Math.round(r.width)), height: Math.max(0, Math.round(r.height)) };
    this.lent?.view.setBounds(this.stage);
  }

  /** Take a live tab in. Whatever was playing before goes (one at a time, decision 34). */
  openTab(view: WebContentsView, about: { url: string; title: string; label: string }, back: (view: WebContentsView) => void): void {
    this.returnTab();
    this.showing = { link: about.url, embed: { url: '', source: 'tab', label: about.label, live: false } as unknown as Embed, title: about.title };
    const w = this.window ?? this.create();
    // The page's fullscreen must fill this picture area, never take over the whole screen.
    w.setFullScreenable(false);
    view.setBounds(this.stage);
    view.setVisible(true);
    w.contentView.addChildView(view);
    const wc = view.webContents;
    // The page swallows the mouse, so the popout's own page never sees it cross the picture: watch the cursor
    // from here, and wake the controls when it is over the window (Flow browser does the same for its sidebar).
    const cursor = setInterval(() => {
      const win = this.window;
      if (!win || !win.isVisible()) return;
      const p = electronScreen.getCursorScreenPoint(), b = win.getBounds();
      if (p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height) win.webContents.send('popout:wake');
    }, 150);
    // What the video is doing, twice a second, for the controls. Numbers only; the page's own words never travel.
    const poll = setInterval(() => {
      void within(wc.executeJavaScript(STATE_JS, true), 600, null).then((s) => {
        if (s && typeof s === 'object') this.window?.webContents.send('popout:tabstate', cleanState(s as Record<string, unknown>));
      });
    }, 500);
    const lent = { view, back, poll, cursor, css: null as string | null };
    this.lent = lent;
    if (w.webContents.isLoading()) w.webContents.once('did-finish-load', () => this.send()); else this.send();
    // The bare picture (his pick): the site's own buttons hidden, the video filling whatever is fullscreen.
    void wc.insertCSS(BARE_CSS).then((key) => { if (this.lent === lent) lent.css = key; else void wc.removeInsertedCSS(key).catch(() => {}); }).catch(() => {});
    // Give the player the whole picture. A page refuses fullscreen until its window is actually showing, so this
    // waits for that, and it counts only a fullscreen that really happened, retrying for a few seconds (found on
    // his screen, 2026-10-11: the first try came before the window appeared and was never repeated).
    let tries = 0;
    const focus = () => {
      if (this.lent !== lent) return;
      if (!this.window?.isVisible()) { setTimeout(focus, 150); return; }
      void within(wc.executeJavaScript(FOCUS_JS, true), 1500, false).then((ok) => { if (!ok && ++tries < 10) setTimeout(focus, 500); });
    };
    w.show();
    focus();
  }

  /** The controls, driving the lent page's video. */
  tabCommand(c: { func?: unknown; arg?: unknown }): void {
    const wc = this.lent?.view.webContents;
    if (!wc) return;
    const n = Number(c.arg);
    const js = c.func === 'play' ? 'v.play()' : c.func === 'pause' ? 'v.pause()'
      : c.func === 'seek' && Number.isFinite(n) ? `v.currentTime=${Math.max(0, n)}`
      : c.func === 'volume' && Number.isFinite(n) ? `v.volume=${Math.max(0, Math.min(1, n))};v.muted=false`
      : c.func === 'mute' ? 'v.muted=true' : c.func === 'unmute' ? 'v.muted=false' : null;
    if (!js) return;
    void within(wc.executeJavaScript(`(()=>{const v=window.__aangVideo;if(!v)return false;${js};return true})()`, true), 600, false);
  }

  /** Hand the tab back to the browser, as it is, still playing. */
  returnTab(): void {
    const l = this.lent;
    if (!l) return;
    this.lent = null;
    clearInterval(l.poll); clearInterval(l.cursor);
    const wc = l.view.webContents;
    if (!wc.isDestroyed()) {
      void within(wc.executeJavaScript('document.fullscreenElement&&document.exitFullscreen().catch(()=>{});true', true), 400, null);
      if (l.css) void wc.removeInsertedCSS(l.css).catch(() => {});
    }
    try { this.window?.contentView.removeChildView(l.view); } catch { /* not here */ }
    try { this.window?.setFullScreenable(true); } catch { /* gone */ }
    l.back(l.view);
  }

  get window(): BrowserWindow | null { return this.win?.isDestroyed() ? null : this.win; }
  get isOpen(): boolean { return Boolean(this.window); }

  /** The screen the pop-out is on, or the main one before it exists. */
  private screenFor(box?: Box) {
    const d = box
      ? electronScreen.getDisplayMatching({ x: box.x, y: box.y, width: box.width, height: box.height })
      : electronScreen.getPrimaryDisplay();
    return d.workArea;
  }

  /**
   * Open a link, or swap what is playing if it is already open.
   *
   * Returns null for anything that is not a real http link, so a mistyped address shows nothing rather
   * than opening a window onto an error.
   */
  open(link: string, about?: { title?: string; episode?: number }): BrowserWindow | null {
    const embed = embedFor(link, this.deps.pages.host, this.deps.pages.origin);
    if (!embed) return null;
    this.showing = { link, embed, title: titleFor(embed, link), about };

    // A lent tab goes back to the browser: one thing at a time (decision 34).
    this.returnTab();
    // One at a time: a new video goes into the window that is already there (decision 34).
    if (this.window) {
      this.send();
      this.win!.show();
      return this.win;
    }
    return this.create();
  }

  /** The window itself, made once and kept until he closes it. */
  private create(): BrowserWindow {

    const saved = this.deps.remembered();
    const area = this.screenFor(saved ?? undefined);
    const box = saved ? ontoScreen(saved, area) : firstTime(area, this.chrome);

    const prefs = { ...SAFE_WEB_PREFERENCES, preload: this.deps.preloadPath };
    const wrong = wrongSettings(prefs as Record<string, unknown>);
    if (wrong.length) throw new Error(`refusing to open the pop-out: ${wrong.join(', ')}`);

    const set = this.deps.settings();
    this.win = new BrowserWindow({
      ...box,
      minWidth: MIN.width,
      minHeight: MIN.height,
      // No Windows title bar: the wooden grab bar in the page is the title bar (sheet 4, section 1).
      frame: false,
      // Opaque (decision 45). The see-through slider in 6.5 turns it on when he wants it.
      transparent: false,
      // The wood colour, so nothing flashes before the page draws. Windows rounds the corners and draws the
      // shadow (the browser's look): a frameless window keeps its thick frame for exactly that.
      backgroundColor: '#24160D',
      thickFrame: true,
      alwaysOnTop: set.alwaysOnTop,
      skipTaskbar: false,          // it is a real window; it belongs in alt-tab
      show: false,
      title: 'Aang',
      webPreferences: prefs,
    });

    // Above a fullscreen game, not merely above ordinary windows.
    if (set.alwaysOnTop) this.win.setAlwaysOnTop(true, 'screen-saver');
    // His decision 32: a normal clickable window. Click-through is the optional switch, never default.
    this.win.setIgnoreMouseEvents(set.clickThrough);
    lockDown(this.win.webContents, { openExternally: true });

    this.win.on('resize', () => this.afterDrag());
    this.win.on('move', () => this.afterDrag());
    // Closing the window by any route gives a lent tab back first, so the page is never lost with it.
    this.win.on('close', () => this.returnTab());
    this.win.on('closed', () => { this.win = null; });
    this.win.webContents.on('did-finish-load', () => {
      this.send();
      this.win?.webContents.send('popout:settings', this.deps.settings());
    });
    this.win.once('ready-to-show', () => this.win?.show());

    void this.win.loadURL(`${this.deps.pages.origin}/popout.html`);
    return this.win;
  }

  /** Tell the page what to play. Everything the window shows comes through here. */
  private send(): void {
    const w = this.window;
    if (!w || !this.showing) return;
    w.webContents.send('popout:show', {
      url: this.showing.embed.url,
      source: this.showing.embed.source,
      label: this.showing.embed.label,
      live: this.showing.embed.live,
      title: this.showing.title,
    });
    void this.sendSegments();
  }

  /**
   * Find what to skip and hand it over. Deliberately after the video is already playing: looking up an
   * opening must never be the reason a video is slow to start.
   */
  private async sendSegments(): Promise<void> {
    const { skips, skipSettings } = this.deps;
    if (!skips || !skipSettings || !this.showing) return;
    try {
      const found = await skips.forEmbed(this.showing.embed, skipSettings(), this.showing.about);
      const w = this.window;
      if (w && found.length) w.webContents.send('popout:segments', found);
    } catch (e) {
      // Not knowing where an opening is must never break playback.
      console.error('shell: could not work out what to skip: ' + (e as Error).message);
    }
  }

  /**
   * After he drags: hold 16 by 9, snap to an edge, and write down where it ended up.
   *
   * Debounced, because a drag fires these continuously and writing a file per pixel is silly. The shape
   * is corrected only once he lets go, so it does not fight his hand while he is still moving it.
   */
  private pending: NodeJS.Timeout | null = null;
  /**
   * True while a correction of our own is being applied.
   *
   * setBounds fires its own move and resize events, which would arrive here and start the whole
   * correction again. One round settles today, but a correction that feeds itself is the shape of a
   * window that creeps smaller every time it is touched, and his rule is "your size wins". Cheap to
   * prevent, so it is prevented.
   *
   * Worth knowing while reading this: Electron and Windows disagree about how wide a frameless window
   * is, by about 16 pixels. Windows counts an invisible resize border that Electron does not. Both are
   * right in their own terms; everything here uses Electron's numbers throughout, which are the ones
   * that match what he can see.
   */
  private correcting = false;

  private afterDrag(): void {
    if (this.correcting) return;
    if (this.pending) clearTimeout(this.pending);
    this.pending = setTimeout(() => {
      const w = this.window;
      if (!w) return;
      const b = w.getBounds();
      const area = this.screenFor(b);

      // 16 by 9 is held after ANY drag, not only a resize. Dragging the window fires both a move and
      // a resize, and whichever lands last wins this debounce: when it was the move, the shape was
      // never corrected and the picture stayed squashed. Found by dragging it, 2026-10-04.
      // Correcting a size that is already right is a no-op, so a plain move is left alone.
      const { width, height } = hold169(b.width, b.height, 'width', this.chrome);
      let box: Box = snapToEdges({ ...b, width, height }, area);

      const moved = box.x !== b.x || box.y !== b.y || box.width !== b.width || box.height !== b.height;
      if (moved) {
        this.correcting = true;
        w.setBounds(box);
        // Long enough for the events setBounds causes to arrive and be ignored.
        setTimeout(() => { this.correcting = false; }, 250).unref?.();
      }
      this.deps.remember(box);
    }, 180);
    this.pending.unref?.();
  }

  /** The preset shortcuts. Dragging always overrides them: they are convenience, not modes. */
  jumpTo(size: 'corner' | 'medium' | 'big' | 'fullscreen'): void {
    const w = this.window;
    if (!w) return;
    if (size === 'fullscreen') { this.toggleFullscreen(); return; }
    const box = preset(size, this.screenFor(w.getBounds()), this.chrome);
    w.setBounds(box);
    this.deps.remember(box);
  }

  /**
   * How see-through the picture is (sheet 4, section 2). The WINDOW fades, not the page, so it works
   * for a paid service too, where Aang cannot reach inside the player at all.
   *
   * Never below 0.2: a window he cannot find is a window he cannot close.
   */
  setOpacity(v: number): void {
    this.window?.setOpacity(Math.max(0.2, Math.min(1, v)));
  }

  toggleFullscreen(): void {
    const w = this.window;
    if (!w) return;
    // While a tab is lent the window is kept from fullscreen (so the PAGE's fullscreen stays inside it); his own
    // fullscreen key still works, by allowing it for that moment.
    w.setFullScreenable(true);
    w.setFullScreen(!w.isFullScreen());
  }

  /** What is playing, so it can be handed to the MacBook (step 6.9). */
  get link(): string | null { return this.showing?.link ?? null; }

  /** Re-read his switches and apply the ones that can change while it is open. */
  applySettings(set: PopoutSettings): void {
    const w = this.window;
    if (!w) return;
    w.setAlwaysOnTop(set.alwaysOnTop, 'screen-saver');
    w.setIgnoreMouseEvents(set.clickThrough);
    w.webContents.send('popout:settings', set);
  }

  /** The hotkey: out of the way and back, without stopping the video (sheet 4, section 4, way 5). */
  toggleHidden(): void {
    const w = this.window;
    if (!w) return;
    // Hidden outright rather than made invisible: a window nobody can see still costs the GPU.
    if (w.isVisible()) w.hide(); else w.show();
  }

  close(): void {
    this.returnTab();
    this.pending && clearTimeout(this.pending);
    this.showing = null;
    const w = this.window;
    this.win = null;
    w?.destroy();
  }
}

/** Every call into a page has a deadline: a dead page never answers, and must never hang Aang. */
function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

/**
 * Find the video and give it the whole picture: the playing one first, else the biggest. The player around it
 * (the box about the same size, so YouTube's and Twitch's own players keep their captions) goes fullscreen,
 * which here means "fill the popout". True when there was a video.
 */
const FOCUS_JS = `(async () => {
  const vs = [...document.querySelectorAll('video')].filter(v => v.offsetWidth * v.offsetHeight > 0);
  vs.sort((a, b) => (b.paused ? 0 : 1) - (a.paused ? 0 : 1) || b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight);
  const v = vs[0];
  if (!v) return false;
  window.__aangVideo = v;
  if (document.fullscreenElement) return true;
  const player = v.closest('.html5-video-player, [data-a-target="video-player"], .video-player, .player') || v;
  try { await player.requestFullscreen(); return true; }
  catch { try { await v.requestFullscreen(); return true; } catch { return false; } }
})()`;
/**
 * The bare picture: whatever is fullscreen, the video fills it; the site's own buttons and overlays go (YouTube's
 * named; any page's built-in video controls too). Captions are left alone. Tested on YouTube 2026-10-11: the video
 * filled the picture area exactly, the control bar gone, captions showing.
 */
const BARE_CSS = `:fullscreen video { position:fixed !important; left:0 !important; top:0 !important; width:100vw !important; height:100vh !important; object-fit:contain !important; background:#000 !important; margin:0 !important; transform:none !important; }
:fullscreen .html5-video-container { position:absolute !important; inset:0 !important; width:100% !important; height:100% !important; }
.ytp-chrome-bottom,.ytp-chrome-top,.ytp-gradient-top,.ytp-gradient-bottom,.ytp-pause-overlay,.ytp-ce-element,.ytp-endscreen-content,.ytp-watermark,.ytp-paid-content-overlay,.ytp-overflow-button,.ytp-cards-teaser,.ytp-iv-player-content{display:none !important}
video::-webkit-media-controls{display:none !important}`;
const STATE_JS = `(() => { const v = window.__aangVideo; if (!v || !v.isConnected) { return null; }
  return { at: v.currentTime, length: v.duration, paused: v.paused, volume: v.volume, muted: v.muted }; })()`;
/** The page's numbers, checked: it is someone else's page, so nothing it says is trusted as anything but a number. */
function cleanState(s: Record<string, unknown>): { at: number; length: number; playing: boolean; volume: number; muted: boolean; live: boolean } {
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
  const live = s.length === Infinity || (typeof s.length === 'number' && !Number.isFinite(s.length));
  return { at: Math.max(0, num(s.at)), length: live ? 0 : Math.max(0, num(s.length)), playing: s.paused === false, volume: Math.max(0, Math.min(1, num(s.volume))), muted: s.muted === true, live };
}

/** Where the remembered size and place are kept, beside his other settings. */
export const popoutFile = (stateDir: string) => path.join(stateDir, 'popout.json');
