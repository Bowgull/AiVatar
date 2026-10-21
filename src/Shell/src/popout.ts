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
import { softEdge } from './winedge.ts';
import path from 'node:path';

const POPOUT_ICON = path.join(import.meta.dirname, '..', 'pages', 'art', 'samara', 'samara-popout.ico');
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
    w.setAspectRatio(16 / 9, { width: 0, height: this.chrome });
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
    const next = { x: Math.round(r.x), y: Math.round(r.y), width: Math.max(0, Math.round(r.width)), height: Math.max(0, Math.round(r.height)) };
    // Only a real change moves the picture (measured 2026-10-20: every mouse move over the pop-out resized it).
    const s = this.stage;
    if (next.x === s.x && next.y === s.y && next.width === s.width && next.height === s.height) return;
    this.stage = next;
    const w = this.window;
    if (w) { const [cw, ch] = w.getContentSize(); this.gap = { right: Math.max(0, cw - this.stage.x - this.stage.width), bottom: Math.max(0, ch - this.stage.y - this.stage.height) }; }
    this.lent?.view.setBounds(this.stage);
  }
  /** The bar and edges around the picture, from the page's last measure: the picture follows the window from them. */
  private gap = { right: 0, bottom: 0 };
  /**
   * His report (2026-10-13): resizing felt laggy. The picture waited for the page to measure itself and say so. Now it
   * follows the window synchronously on every resize step, from the window's own size; the page's measure still
   * corrects it a moment later if the bar changed.
   */
  private follow(): void {
    const w = this.window, v = this.lent?.view;
    if (!w || !v) return;
    const [cw, ch] = w.getContentSize();
    const width = Math.max(0, cw - this.stage.x - this.gap.right), height = Math.max(0, ch - this.stage.y - this.gap.bottom);
    if (width === this.stage.width && height === this.stage.height) return;   // the page's echo of the same size
    this.stage = { ...this.stage, width, height };
    v.setBounds(this.stage);
  }

  /** Take a live tab in. Whatever was playing before goes (one at a time, decision 34). */
  openTab(view: WebContentsView, about: { url: string; title: string; label: string }, back: (view: WebContentsView) => void): void {
    this.returnTab();
    this.showing = { link: about.url, embed: { url: '', source: 'tab', label: about.label, live: false } as unknown as Embed, title: about.title };
    const w = this.window ?? this.create();
    // The page's fullscreen must fill this picture area, never take over the whole screen.
    w.setFullScreenable(false);
    // The picture from the first frame (measured 2026-10-20: it stayed at nothing until the pop-out's page had loaded
    // and measured itself): the window's own size, less its bar and controls. The page corrects it once it measures.
    if (!this.stage.width || !this.stage.height) { const [cw, ch] = w.getContentSize(); this.stage = { x: 0, y: this.stage.y || 34, width: cw, height: Math.max(0, ch - (this.chrome || 78)) }; }
    view.setBounds(this.stage);
    view.setVisible(true);
    w.contentView.addChildView(view);
    const wc = view.webContents;
    // The page swallows the mouse, so the popout's own page never sees it cross the picture: watch the cursor
    // from here, and wake the controls when it is over the window (Flow browser does the same for its sidebar).
    // Only a real move wakes them (2026-10-12): in WoW the pointer sits still, or is put back in one spot while
    // he turns the camera, and the controls kept coming back over the game though he never pointed at them.
    let last = electronScreen.getCursorScreenPoint();
    const cursor = setInterval(() => {
      const win = this.window;
      if (!win || !win.isVisible() || this.pinned) return;
      const p = electronScreen.getCursorScreenPoint(), b = win.getBounds();
      const moved = Math.abs(p.x - last.x) + Math.abs(p.y - last.y) >= 6;
      last = p;
      if (moved && p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height) win.webContents.send('popout:wake');
    }, 150);
    // What the video is doing, twice a second, for the controls. Numbers only; the page's own words never travel.
    // At once on opening (the controls were blank for half a second), never while hidden, and slower while paused.
    let paused = false, beat = 0;
    const tick = () => {
      if (!this.window?.isVisible() || (paused && ++beat % 4)) return;
      void within(wc.executeJavaScript(STATE_JS, true), 600, null).then((s) => {
        if (s && typeof s === 'object') { paused = (s as { paused?: unknown }).paused === true; this.window?.webContents.send('popout:tabstate', cleanState(s as Record<string, unknown>)); }
        // The next video (autoplay) can be a new player: pin it again, so it stays the bare picture.
        else void within(wc.executeJavaScript(FOCUS_JS, true), 600, false).then((ok) => { if (ok) void within(wc.executeJavaScript(BEST_QUALITY_JS, true), 1500, null); });
      });
    };
    const poll = setInterval(tick, 500);
    setTimeout(tick, 60);
    const lent = { view, back, poll, cursor, css: null as string | null };
    this.lent = lent;
    // Twitch's ad breaks (his catch, 2026-10-21): with its ads blocked, Twitch shows "we'll be right back" and stitches the
    // stream back afterwards with the sound out of step with the picture. The tab watches for the break ending and
    // jumps the player back to the live edge, which brings sound and picture together again. Twitch tabs only.
    const resync = () => { try { if (/(^|\.)twitch\.tv$/i.test(new URL(wc.getURL()).hostname)) void within(wc.executeJavaScript(TWITCH_RESYNC_JS, true), 600, null); } catch { /* not a page */ } };
    resync();
    wc.on('did-navigate-in-page', resync);
    wc.on('did-finish-load', resync);
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
      void within(wc.executeJavaScript(FOCUS_JS, true), 1500, false).then((ok) => {
        if (!ok && ++tries < 10) { setTimeout(focus, 500); return; }
        if (ok) void within(wc.executeJavaScript(BEST_QUALITY_JS, true), 1500, null);
      });
    };
    w.show();
    focus();
  }

  /** Pause or play whatever the pop-out is showing (sheet 40 B, from the tab page it left behind). */
  togglePlay(): void {
    const wc = this.lent?.view.webContents;
    if (wc && !wc.isDestroyed()) { void within(wc.executeJavaScript(`(()=>{const v=window.__aangVideo||document.querySelector('video');if(!v)return false;if(v.paused)v.play();else v.pause();return true})()`, true), 600, false); return; }
    this.window?.webContents.send('popout:toggleplay');
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
    // The page is made itself again BEFORE it goes back (2026-10-12): handing it over first showed it for a moment
    // as one giant player, then snapping back, which is the odd resize he saw.
    // It goes home paused (his rule, 2026-10-20: closing the pop-out pauses the video).
    const undone = wc.isDestroyed() ? Promise.resolve() : Promise.all([
      within(wc.executeJavaScript(UNPIN_JS + ";document.querySelectorAll('video,audio').forEach((m)=>{try{m.pause()}catch{}});true", true), 400, null),
      l.css ? wc.removeInsertedCSS(l.css).catch(() => {}) : Promise.resolve(),
    ]);
    try { this.window?.contentView.removeChildView(l.view); } catch { /* not here */ }
    try { this.window?.setFullScreenable(true); } catch { /* gone */ }
    void undone.then(() => l.back(l.view), () => l.back(l.view));
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
      // No Windows title bar: the wooden grab bar in the page is the title bar (sheet 4, section 1). A HIDDEN
      // title bar rather than frame:false, exactly as the browser does it: Windows 11 then rounds the corners
      // and draws its soft edge and shadow. frame:false gave hard square corners (his eyes, 2026-10-12).
      titleBarStyle: 'hidden',
      // Opaque (decision 45). The see-through slider in 6.5 turns it on when he wants it.
      transparent: false,
      // The wood colour, so nothing flashes before the page draws. Windows rounds the corners and draws the
      // shadow (the browser's look): a frameless window keeps its thick frame for exactly that.
      backgroundColor: '#24160D',
      thickFrame: true,
      // On top only while pinned (his rule, 2026-10-20): unpinned it is a normal window that goes behind whatever he
      // clicks (WoW included); pinned it floats over everything and lets every click through.
      alwaysOnTop: false,
      skipTaskbar: false,          // it is a real window; it belongs in alt-tab
      show: false,
      title: 'Aang',
      webPreferences: prefs,
    });

    softEdge(this.win);
    // Sheet 42 (his pick, 2026-10-20): its own taskbar button, Samara's lantern lit turquoise with the same orange leaf,
    // so it reads as Samara's video and never as Samara itself. Its own app id keeps Windows from folding it into Aang's
    // or Samara's group (main.ts gives every window Aang's face first; this replaces it for the pop-out only).
    if (process.platform === 'win32') {
      try { this.win.setIcon(POPOUT_ICON); this.win.setAppDetails({ appId: 'Aang.Samara.Popout', appIconPath: POPOUT_ICON, appIconIndex: 0, relaunchDisplayName: 'Samara pop-out' }); }
      catch { /* Aang's face stays */ }
    }
    // His report (2026-10-13): resizing was glitchy. Aang let the drag happen, then snapped the window back to 16 by 9
    // after each move, fighting his mouse. Now the window itself keeps 16 by 9 (the picture) plus the bar while he drags.
    this.win.setAspectRatio(16 / 9, { width: 0, height: this.chrome });
    // On the Mac the wooden bar's own buttons are the window's buttons; macOS's floating ones stay hidden (M6).
    if (process.platform === 'darwin') this.win.setWindowButtonVisibility(false);
    // Above a fullscreen game, not merely above ordinary windows.
    void set;
    // His decision 32: a normal clickable window. Click-through is the optional switch, never default.
    this.win.setIgnoreMouseEvents(set.clickThrough);
    lockDown(this.win.webContents, { openExternally: true });

    // The picture follows the window live; the tidying up (16 by 9, snap to an edge, remember where) waits until he lets
    // go. His report (2026-10-20): dragging made it jump all over, worst near the edges. 'move' fires all through a drag,
    // so any pause of 180 ms set the window's bounds UNDER his held mouse, and within 24 px of an edge it snapped there
    // while Windows kept moving it from where it had been. 'moved' and 'resized' fire once, when the drag ends.
    this.win.on('resize', () => this.follow());
    this.win.on('resized', () => this.afterDrag());
    this.win.on('moved', () => this.afterDrag());
    // Closing the window by any route gives a lent tab back first, so the page is never lost with it.
    this.win.on('close', () => {
      // Alt+F4 or the taskbar's Close: the same as its own close key, Samara included.
      const inFront = Boolean(this.win?.isFocused()), after = this.afterClose;
      this.afterClose = null;
      this.returnTab();
      try { after?.(inFront); } catch { /* Samara stays where it is */ }
    });
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

      // Within 3 pixels is the window's own rounding of the shape it holds: leave it, never a jump under his mouse.
      const near = (a: number, c: number) => Math.abs(a - c) <= 3;
      if (near(box.width, b.width) && near(box.height, b.height)) box = { ...box, width: b.width, height: b.height };
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

  /**
   * Pinned (his ask, 2026-10-12, Ctrl+Alt+P): every click goes through to the game, and nothing on the popout
   * wakes. The same key unpins. The bar says which it is for two seconds.
   */
  pinned = false;
  togglePin(): void {
    const w = this.window;
    if (!w || !w.isVisible()) return;
    this.pinned = !this.pinned;
    w.setAlwaysOnTop(this.pinned, 'screen-saver');
    w.setIgnoreMouseEvents(this.pinned || this.deps.settings().clickThrough);
    // The Mac (his report, 2026-10-13: pinned was not click-through there): said again a moment later, once the click
    // on the pin button itself is over, so it holds.
    if (process.platform === 'darwin') setTimeout(() => { if (!w.isDestroyed()) w.setIgnoreMouseEvents(this.pinned || this.deps.settings().clickThrough); }, 150);
    w.webContents.send('popout:pinned', this.pinned);
    // Pinned means clicks go through to his game: the site's own controls stay away too (his ask, 2026-10-13).
    const wc = this.lent?.view.webContents;
    if (wc && !wc.isDestroyed()) void within(wc.executeJavaScript(`document.documentElement.classList.toggle('aang-pinned', ${this.pinned}); true`, true), 800, null);
  }

  /** Sent to the MacBook: it stops here (overstimulation, his words), and a lent tab goes home paused. */
  pauseAndClose(): void {
    if (this.lent) this.tabCommand({ func: 'pause' });
    this.close();
  }

  /** What is playing, so it can be handed to the MacBook (step 6.9). */
  get link(): string | null { return this.showing?.link ?? null; }

  /** Re-read his switches and apply the ones that can change while it is open. */
  applySettings(set: PopoutSettings): void {
    const w = this.window;
    if (!w) return;
    w.setAlwaysOnTop(this.pinned, 'screen-saver');
    w.setIgnoreMouseEvents(set.clickThrough || this.pinned);
    w.webContents.send('popout:settings', set);
  }

  /** The hotkey: out of the way and back, without stopping the video (sheet 4, section 4, way 5). */
  toggleHidden(): void {
    const w = this.window;
    if (!w || !this.showing) return;              // put away after closing: nothing to show
    // Hidden outright rather than made invisible: a window nobody can see still costs the GPU.
    if (w.isVisible()) w.hide(); else { w.show(); w.setIgnoreMouseEvents(this.pinned || this.deps.settings().clickThrough); }
  }

  /** For a look from the PC (M6): what the pop-out is doing, whether the site's controls show, and its picture. */
  async diag(): Promise<Record<string, unknown>> {
    const w = this.window;
    if (!w || !w.isVisible() && !this.showing) return { open: false };
    const wc = this.lent?.view.webContents;
    const live = wc && !wc.isDestroyed() ? wc : null;
    const page = live ? await within(live.executeJavaScript(`(() => { const c = document.documentElement.classList;
      const vis = (s) => [...document.querySelectorAll(s)].filter(e => { const r = e.getBoundingClientRect(), st = getComputedStyle(e); return r.width * r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && st.opacity !== '0'; }).map(e => (e.className && String(e.className).slice(0, 60)) || e.tagName);
      return { url: location.href.slice(0, 200), bare: c.contains('aang-bare'), pinned: c.contains('aang-pinned'), showing: vis('[data-aang-player] *:not(video)').slice(0, 30),
        menus: [...document.querySelectorAll('[role="menu"],[role="dialog"],.tw-balloon,[data-a-target*="settings"],[data-popper-placement]')].slice(0, 12).map(e => { const st = getComputedStyle(e), r = e.getBoundingClientRect(); return { what: (e.getAttribute('data-a-target') || e.getAttribute('role') || String(e.className).slice(0, 40)), inPlayer: !!e.closest('[data-aang-player]'), shown: st.visibility !== 'hidden' && st.display !== 'none', size: Math.round(r.width) + 'x' + Math.round(r.height) }; }) }; })()`, true), 800, null) : null;
    let shot: string | null = null;
    try { const img = live ? await within(live.capturePage(), 1500, null) : null; if (img && !img.isEmpty()) shot = img.resize({ width: Math.min(960, img.getSize().width) }).toJPEG(70).toString('base64'); } catch { /* none */ }
    let bar: string | null = null;
    try { const img = await within(w.webContents.capturePage(), 1500, null); if (img && !img.isEmpty()) bar = img.resize({ width: Math.min(960, img.getSize().width) }).toJPEG(70).toString('base64'); } catch { /* none */ }
    return { open: true, visible: w.isVisible(), pinned: this.pinned, bounds: w.getBounds(), lent: Boolean(this.lent), page, shot, bar };
  }

  /**
   * Called once when the pop-out is put away, with whether it was the window in front at that moment. Set by whoever
   * tucked Samara away for it (popoutipc.ts), so closing the pop-out can bring Samara back (his ask, 2026-10-20).
   */
  afterClose: ((wasInFront: boolean) => void) | null = null;

  close(): void {
    const inFront = Boolean(this.window?.isVisible() && this.window.isFocused());
    const after = this.afterClose;
    this.afterClose = null;
    this.pinned = false;
    this.returnTab();
    this.pending && clearTimeout(this.pending);
    this.showing = null;
    // Put away, not destroyed (measured 2026-10-20): building it again took about half a second on every open.
    // Its page is told to stop whatever it was playing and show nothing.
    const w = this.window;
    if (!w) return;
    w.hide();
    try { w.setIgnoreMouseEvents(this.deps.settings().clickThrough); w.setAlwaysOnTop(false); } catch { /* gone */ }
    w.webContents.send('popout:pinned', false);
    w.webContents.send('popout:show', { url: '', source: 'none', label: '', live: false, title: 'Nothing playing' });
    try { after?.(inFront); } catch { /* Samara stays where it is */ }
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
/**
 * Pin the site's own player over the whole page: the playing video first, else the biggest; the player around it
 * (YouTube's, Twitch's, any page's) is marked and BARE_CSS lays it edge to edge on top of everything, so nothing
 * of the page shows: no header, no "Next:" panel, no scrollbar. No fullscreen request, so no timing to get wrong.
 * True when there was a video. Tested on a YouTube Mix page 2026-10-11: the video filled the view exactly.
 */
/**
 * Installed once per Twitch page (2026-10-21): every second it looks for Twitch's ad-break screen ("right back",
 * "commercial break", the ad label); when the break ends it waits a moment for the stream to come back, then pauses,
 * jumps to the live edge and plays, which re-joins the sound to the picture. Also offered on demand as __aangResync().
 */
export const TWITCH_RESYNC_JS = `(() => {
  if (window.__aangResyncOn) return true;
  window.__aangResyncOn = true;
  const vid = () => [...document.querySelectorAll('video')].sort((a, b) => (b.videoWidth * b.videoHeight) - (a.videoWidth * a.videoHeight))[0];
  const inAd = () => Boolean(document.querySelector('[data-a-target="video-ad-label"],[data-a-target="video-ad-countdown"],[data-test-selector="sad-overlay"]'))
    || /right back|commercial break/i.test((document.querySelector('.video-player, [data-a-target="video-player"]') || {}).innerText || '');
  window.__aangResync = () => {
    const v = vid(); if (!v) return false;
    const b = v.buffered; const live = b.length ? b.end(b.length - 1) : NaN;
    v.pause();
    setTimeout(() => { try { if (Number.isFinite(live) && live - v.currentTime > 0.4) v.currentTime = Math.max(0, live - 1); v.playbackRate = 1; v.play().catch(() => {}); } catch (e) {} }, 120);
    return true;
  };
  let was = false;
  setInterval(() => {
    const now = inAd();
    if (was && !now) setTimeout(() => window.__aangResync(), 1500);
    was = now;
  }, 1000);
  return true;
})()`;

export const FOCUS_JS = `(() => {
  const vs = [...document.querySelectorAll('video')].filter(v => v.offsetWidth * v.offsetHeight > 0);
  vs.sort((a, b) => (b.paused ? 0 : 1) - (a.paused ? 0 : 1) || b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight);
  const v = vs[0];
  if (!v) return false;
  window.__aangVideo = v;
  for (const old of document.querySelectorAll('[data-aang-player]')) old.removeAttribute('data-aang-player');
  // The site's own player box, with its controls in it (his report, 2026-10-20: on Prime only the bare picture was kept, so
  // no pause, play or anything). Known players first; on any other site, the highest box around the video that is still
  // about its size, which is where a site puts its control bar.
  const KNOWN = '.html5-video-player, [data-a-target="video-player"], .video-player, .player, .webPlayerSDKContainer, #dv-web-player, .watch-video, [data-uia="player"], disney-web-player, .btm-media-player, #vilos, .video-player-wrapper, .jw-wrapper, .vjs-player';
  let player = v.closest(KNOWN);
  if (!player) {
    const vr = v.getBoundingClientRect();
    player = v;
    for (let a = v.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      const r = a.getBoundingClientRect();
      if (r.width <= vr.width * 1.25 + 8 && r.height <= vr.height * 1.6 + 8) player = a; else break;
    }
  }
  player.setAttribute('data-aang-player', '');
  // Twitch (2026-10-12): its columns use transform and contain, which trap a fixed box inside them, so chat and
  // the side bar showed around the video. Every box above the player is marked and those tricks are switched off.
  // Twitch (his screenshot, 2026-10-13): its controls sit in a box that kept the old player's height, so they floated
  // halfway up the picture. Every box between the player and the video fills the player too, so the controls land at
  // the bottom edge, where the site put them.
  for (const old of document.querySelectorAll('[data-aang-fill]')) old.removeAttribute('data-aang-fill');
  for (let a = v.parentElement; a && a !== player; a = a.parentElement) a.setAttribute('data-aang-fill', '');
  for (const old of document.querySelectorAll('[data-aang-path]')) old.removeAttribute('data-aang-path');
  for (let a = player.parentElement; a && a !== document.documentElement; a = a.parentElement) a.setAttribute('data-aang-path', '');
  document.documentElement.classList.add('aang-bare');
  return true;
})()`;
/** Undo the pin when the tab goes back to the browser: the page is exactly as it was. */
export const UNPIN_JS = `(() => { document.documentElement.classList.remove('aang-bare');
  document.documentElement.classList.remove('aang-pinned');
  for (const el of document.querySelectorAll('[data-aang-player],[data-aang-path],[data-aang-fill]')) { el.removeAttribute('data-aang-player'); el.removeAttribute('data-aang-path'); el.removeAttribute('data-aang-fill'); }
  return true; })()`;
/**
 * Never a lower picture because the window is small (his rule, 2026-10-13): YouTube is told to play its best quality
 * (its own player's methods, on its own page); Twitch is told to remember Source as his choice, which its player reads,
 * and he can pick any quality in Twitch's own menu (now shown). Returns what it did, for the log.
 */
export const BEST_QUALITY_JS = `(() => {
  try {
    const p = document.getElementById('movie_player');
    if (p && typeof p.getAvailableQualityLevels === 'function') {
      const best = (p.getAvailableQualityLevels() || []).filter(q => q !== 'auto')[0];
      if (best) { if (p.setPlaybackQualityRange) p.setPlaybackQualityRange(best, best); if (p.setPlaybackQuality) p.setPlaybackQuality(best); return 'youtube ' + best; }
    }
    if (/(^|\\.)twitch\\.tv$/.test(location.hostname)) { localStorage.setItem('video-quality', JSON.stringify({ default: 'chunked' })); return 'twitch source'; }
  } catch (e) { return 'quality: ' + e.message; }
  return null;
})()`;
/**
 * The bare picture (his pick): the player over everything, the video filling it. The site's own controls show when
 * he moves the mouse over the video and hide again by themselves (2026-10-13, his ask: quality, captions, speed live
 * in YouTube's and Twitch's own menus, so Aang's duplicate buttons are gone). Captions stay.
 */
export const BARE_CSS = `html.aang-bare, html.aang-bare body { overflow:hidden !important; background:#000 !important; }
html.aang-bare [data-aang-path] { transform:none !important; filter:none !important; contain:none !important; will-change:auto !important; perspective:none !important; backdrop-filter:none !important; }
html.aang-bare body * { visibility:hidden !important; }
html.aang-bare [data-aang-player], html.aang-bare [data-aang-player] *, html.aang-bare .ytp-caption-window-container, html.aang-bare .ytp-caption-window-container *, html.aang-bare .player-captions-container, html.aang-bare .player-captions-container * { visibility:visible !important; }
html.aang-bare [data-aang-player] { position:fixed !important; left:0 !important; top:0 !important; width:100vw !important; height:100vh !important; max-width:none !important; max-height:none !important; z-index:2147483646 !important; background:#000 !important; margin:0 !important; transform:none !important; }
html.aang-bare [data-aang-player] video { position:fixed !important; left:0 !important; top:0 !important; width:100vw !important; height:100vh !important; object-fit:contain !important; background:#000 !important; margin:0 !important; transform:none !important; }
html.aang-bare .html5-video-container { position:absolute !important; inset:0 !important; width:100% !important; height:100% !important; }
html.aang-bare [data-aang-fill] { position:absolute !important; inset:0 !important; width:100% !important; height:100% !important; max-width:none !important; max-height:none !important; transform:none !important; }
html.aang-pinned .ytp-chrome-bottom, html.aang-pinned .ytp-chrome-top, html.aang-pinned .ytp-gradient-bottom, html.aang-pinned .ytp-gradient-top, html.aang-pinned [data-a-target="player-controls"], html.aang-pinned .video-player__overlay, html.aang-pinned [data-aang-player] video::-webkit-media-controls { display:none !important; }
html.aang-bare:not(.aang-pinned) :is([role="menu"], [role="dialog"], [role="listbox"], .tw-balloon, [data-a-target="player-settings-menu"], [data-a-target^="player-settings"], [class*="ReactModal"], [data-popper-placement]), html.aang-bare:not(.aang-pinned) :is([role="menu"], [role="dialog"], [role="listbox"], .tw-balloon, [data-a-target="player-settings-menu"], [data-a-target^="player-settings"], [class*="ReactModal"], [data-popper-placement]) * { visibility:visible !important; }
html.aang-bare:not(.aang-pinned) :is([role="menu"], [role="dialog"], [role="listbox"], .tw-balloon, [data-a-target="player-settings-menu"], [class*="ReactModal"], [data-popper-placement]) { z-index:2147483647 !important; }
html.aang-pinned [data-aang-player] *, html.aang-pinned body { pointer-events:none !important; }
html.aang-pinned [data-aang-player] * { visibility:hidden !important; }
html.aang-pinned [data-aang-player] video, html.aang-pinned .ytp-caption-window-container, html.aang-pinned .ytp-caption-window-container *, html.aang-pinned .player-captions-container, html.aang-pinned .player-captions-container * { visibility:visible !important; }
html.aang-bare .ytp-pause-overlay,html.aang-bare .ytp-ce-element,html.aang-bare .ytp-endscreen-content,html.aang-bare .ytp-watermark,html.aang-bare .ytp-paid-content-overlay,html.aang-bare .ytp-overflow-button,html.aang-bare .ytp-cards-teaser,html.aang-bare .ytp-iv-player-content{display:none !important}`;
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
