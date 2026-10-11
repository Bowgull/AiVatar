// Steps 6.19 and 6.20, pass 1: Aang's browser.
//
// One window. Its frame (the carved band and the tab rail, sheet 3) is a page of ours; each tab is its own
// WebContentsView, placed by hand in the page area. That placing is step 6.19: no layout library can hold a
// browser view, because a view is not a page element. The frame tells us once how wide the rail is and how
// tall the band is (its insets); from then on every resize is answered here, synchronously, from the window's
// own size, so the page never lags a frame behind the frame or tears at his scaling. Electron works in
// device-independent pixels, so Windows' monitor scaling is already accounted for.
//
// SAFETY, from the first line:
//  - His browsing lives in its own session (`persist:aang-browser`), apart from Aang's pages and the pop-out.
//  - A tab can only ever be a web page: http and https. The address slot searches or goes to a site and
//    never runs anything (no javascript:, file:, chrome: or anything else).
//  - Tabs get NO preload and the safe preferences: a website can never reach Aang's doors.
//  - Every permission a site asks for is refused until 6.22 adds the asks (chips and the lever).
import { BrowserWindow, WebContentsView, screen, session as electronSession } from 'electron';
import { SAFE_WEB_PREFERENCES, denyPermissions, lockDown } from './safety.ts';
import { addressFor } from './address.ts';

export interface BrowserOptions { origin: string; preloadPath: string }

interface Tab {
  id: number;
  view: WebContentsView;
  opener: number | null;
  title: string;
  url: string;
  favicon: string;
  loading: boolean;
  audible: boolean;
  muted: boolean;
  crashed: boolean;
}

const isWeb = (u: string) => /^https?:\/\//i.test(u);

export class AangBrowser {
  private win: BrowserWindow | null = null;
  private tabs: Tab[] = [];
  private active: number | null = null;
  private seq = 0;
  private closed: string[] = [];
  private inset = { left: 268, top: 66 };
  private readonly o: BrowserOptions;
  private readonly ses = electronSession.fromPartition('persist:aang-browser');
  constructor(o: BrowserOptions) {
    this.o = o;
    denyPermissions(this.ses);
  }

  isFrame(sender: Electron.WebContents): boolean { return Boolean(this.win && !this.win.isDestroyed() && sender === this.win.webContents); }

  /** Open the window (or bring it forward), optionally on an address. */
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
      titleBarStyle: 'hidden', titleBarOverlay: { color: '#3a2414', symbolColor: '#FFE096', height: 58 },
      webPreferences: { ...SAFE_WEB_PREFERENCES, preload: this.o.preloadPath },
    });
    lockDown(w.webContents);
    w.on('resize', () => this.place());
    w.on('maximize', () => this.place());
    w.on('unmaximize', () => this.place());
    w.on('closed', () => { for (const t of this.tabs) { try { t.view.webContents.close(); } catch { /* gone */ } } this.tabs = []; this.active = null; this.win = null; });
    w.once('ready-to-show', () => w.show());
    w.webContents.once('did-finish-load', () => { this.newTab(url ?? 'https://www.google.com'); });
    this.win = w;
    void w.loadURL(`${this.o.origin}/browser.html`);
  }

  /** 6.19: the frame says how big its rail and band are; everything else follows from the window. */
  setInsets(left: number, top: number): void {
    if (!Number.isFinite(left) || !Number.isFinite(top)) return;
    this.inset = { left: Math.max(0, Math.round(left)), top: Math.max(0, Math.round(top)) };
    this.place();
  }

  /** Put the active tab exactly in the page area. Synchronous, from the window's own content size. */
  private place(): void {
    const w = this.win;
    if (!w || w.isDestroyed()) return;
    const [cw, ch] = w.getContentSize();
    const t = this.tabs.find((x) => x.id === this.active);
    if (!t) return;
    // A crashed page is moved out of the way so the frame's own plate shows; it is never touched.
    if (t.crashed) { t.view.setBounds({ x: 0, y: 0, width: 0, height: 0 }); return; }
    t.view.setBounds({ x: this.inset.left, y: this.inset.top, width: Math.max(0, cw - this.inset.left), height: Math.max(0, ch - this.inset.top) });
  }

  newTab(address: string, opener: number | null = null, focus = true): number | null {
    const w = this.win;
    if (!w || w.isDestroyed()) return null;
    const url = isWeb(address) ? address : addressFor(address);
    if (!url) return null;
    // The safe preferences, but a tab in the background may sleep: unlike the pop-out it has no reason to
    // keep painting over his game. NOT lockDown(): that pins a window to one page, and a browser navigates.
    const view = new WebContentsView({ webPreferences: { ...SAFE_WEB_PREFERENCES, backgroundThrottling: true, session: this.ses } });
    const wc = view.webContents;
    wc.on('will-attach-webview', (e) => e.preventDefault());
    const tab: Tab = { id: ++this.seq, view, opener, title: 'New tab', url, favicon: '', loading: true, audible: false, muted: false, crashed: false };
    this.tabs.push(tab);
    // A link that opens a new window becomes a tab under the one it came from. Web pages only.
    // A middle click or Ctrl+click opens it behind, the way every browser does.
    wc.setWindowOpenHandler(({ url: u, disposition }) => { if (isWeb(u)) this.newTab(u, tab.id, disposition !== 'background-tab'); return { action: 'deny' }; });
    wc.on('will-navigate', (e, u) => { if (!isWeb(u)) e.preventDefault(); });
    wc.on('page-title-updated', (_e, title) => { tab.title = title; this.sendTabs(); });
    wc.on('page-favicon-updated', (_e, icons) => { tab.favicon = icons.find((i) => /^https?:|^data:image\//.test(i)) ?? ''; this.sendTabs(); });
    wc.on('did-start-loading', () => { tab.loading = true; if (tab.crashed) { tab.crashed = false; this.place(); } this.sendTabs(); });
    wc.on('did-stop-loading', () => { tab.loading = false; this.sendTabs(); });
    wc.on('did-navigate', (_e, u) => { tab.url = u; this.sendTabs(); });
    wc.on('did-navigate-in-page', (_e, u) => { tab.url = u; this.sendTabs(); });
    wc.on('audio-state-changed', (e) => { tab.audible = (e as unknown as { audible: boolean }).audible; this.sendTabs(); });
    // A crashed page goes blank and anything that pokes it hangs (tested 2026-10-04): mark it, never touch it.
    wc.on('render-process-gone', () => { tab.crashed = true; tab.loading = false; this.place(); this.sendTabs(); });
    // The keys work wherever the keyboard is, page or frame.
    wc.on('before-input-event', (e, input) => { if (this.key(input)) e.preventDefault(); });
    void wc.loadURL(url);
    if (focus) this.activate(tab.id); else this.sendTabs();
    return tab.id;
  }

  activate(id: number): void {
    const w = this.win;
    const t = this.tabs.find((x) => x.id === id);
    if (!w || w.isDestroyed() || !t) return;
    for (const x of this.tabs) if (x.id !== id) { try { w.contentView.removeChildView(x.view); } catch { /* not shown */ } }
    w.contentView.addChildView(t.view);
    this.active = id;
    this.place();
    if (!t.crashed) t.view.webContents.focus();
    this.sendTabs();
  }

  close(id: number): void {
    const i = this.tabs.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [t] = this.tabs.splice(i, 1);
    if (isWeb(t!.url)) { this.closed.push(t!.url); if (this.closed.length > 25) this.closed.shift(); }
    try { this.win?.contentView.removeChildView(t!.view); } catch { /* gone */ }
    try { t!.view.webContents.close(); } catch { /* gone */ }
    if (this.active === id) {
      const next = this.tabs[Math.min(i, this.tabs.length - 1)];
      this.active = null;
      if (next) this.activate(next.id); else this.newTab('https://www.google.com');
    } else this.sendTabs();
  }

  /** A click on one tab's plaque: show it, close it, or mute it. */
  tabAct(id: number, act: string): void {
    const t = this.tabs.find((x) => x.id === id);
    if (!t) return;
    if (act === 'show') this.activate(id);
    else if (act === 'close') this.close(id);
    else if (act === 'mute') { t.muted = !t.muted; t.view.webContents.setAudioMuted(t.muted); this.sendTabs(); }
  }

  reopen(): void { const u = this.closed.pop(); if (u) this.newTab(u); }

  private cur(): Tab | undefined { return this.tabs.find((x) => x.id === this.active); }

  go(address: string): void {
    const url = addressFor(address);
    const t = this.cur();
    if (!url) return;
    if (!t) { this.newTab(url); return; }
    t.crashed = false;
    void t.view.webContents.loadURL(url);
    t.view.webContents.focus();
  }

  act(what: string): void {
    const t = this.cur();
    const wc = t?.view.webContents;
    switch (what) {
      case 'back': if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); break;
      case 'forward': if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); break;
      case 'reload': if (t) { t.crashed = false; wc!.reload(); } break;
      case 'stop': wc?.stop(); break;
      case 'mute': if (t) { t.muted = !t.muted; wc!.setAudioMuted(t.muted); this.sendTabs(); } break;
      case 'zoomin': if (wc) wc.setZoomLevel(Math.min(5, wc.getZoomLevel() + 0.5)); break;
      case 'zoomout': if (wc) wc.setZoomLevel(Math.max(-5, wc.getZoomLevel() - 0.5)); break;
      case 'zoomreset': wc?.setZoomLevel(0); break;
      case 'newtab': this.newTab('https://www.google.com'); this.win?.webContents.send('browser:focusslot'); break;
      case 'close': if (t) this.close(t.id); break;
      case 'reopen': this.reopen(); break;
    }
  }

  /** The browser's keys, from the page or the frame. True when the key was ours. */
  key(i: Electron.Input): boolean {
    if (i.type !== 'keyDown') return false;
    const k = i.key.toLowerCase(), c = i.control || i.meta;
    if (c && i.shift && k === 't') { this.act('reopen'); return true; }
    if (c && k === 't') { this.act('newtab'); return true; }
    if (c && k === 'w') { this.act('close'); return true; }
    if (c && k === 'l') { this.win?.webContents.focus(); this.win?.webContents.send('browser:focusslot'); return true; }
    if ((c && k === 'r') || k === 'f5') { this.act('reload'); return true; }
    if (i.alt && k === 'arrowleft') { this.act('back'); return true; }
    if (i.alt && k === 'arrowright') { this.act('forward'); return true; }
    if (c && (k === '=' || k === '+')) { this.act('zoomin'); return true; }
    if (c && k === '-') { this.act('zoomout'); return true; }
    if (c && k === '0') { this.act('zoomreset'); return true; }
    if (c && k === 'tab') {
      const i2 = this.tabs.findIndex((x) => x.id === this.active);
      const n = this.tabs[(i2 + (i.shift ? -1 : 1) + this.tabs.length) % this.tabs.length];
      if (n) this.activate(n.id);
      return true;
    }
    return false;
  }

  /** The rail and the band redraw from this. Plain data only. */
  private sendTabs(): void {
    const w = this.win;
    if (!w || w.isDestroyed()) return;
    const t = this.cur();
    const wc = t?.view.webContents;
    w.webContents.send('browser:tabs', {
      active: this.active,
      canBack: Boolean(wc?.navigationHistory.canGoBack()), canForward: Boolean(wc?.navigationHistory.canGoForward()),
      tabs: this.tabs.map((x) => ({ id: x.id, opener: x.opener, title: x.title, url: x.url, favicon: x.favicon, loading: x.loading, audible: x.audible, muted: x.muted, crashed: x.crashed })),
    });
    if (t) w.setTitle(`${t.title} - Aang Browser`);
  }

  closeAll(): void { if (this.win && !this.win.isDestroyed()) this.win.close(); }
}
