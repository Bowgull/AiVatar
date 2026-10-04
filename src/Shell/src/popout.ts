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
import { BrowserWindow, screen as electronScreen } from 'electron';
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

    // One at a time: a new video goes into the window that is already there (decision 34).
    if (this.window) {
      this.send();
      this.win!.show();
      return this.win;
    }

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
      backgroundColor: '#1A1132',
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
    if (size === 'fullscreen') { w.setFullScreen(!w.isFullScreen()); return; }
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
    if (w) w.setFullScreen(!w.isFullScreen());
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
    this.pending && clearTimeout(this.pending);
    this.showing = null;
    const w = this.window;
    this.win = null;
    w?.destroy();
  }
}

/** Where the remembered size and place are kept, beside his other settings. */
export const popoutFile = (stateDir: string) => path.join(stateDir, 'popout.json');
