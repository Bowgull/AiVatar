// The Satchel (sheet 116, approved 2026-11-01 as v2.4: "everything's perfect"): his clipboard, kept.
//
// What it does, all from his two interviews:
//   - keeps every copy (words, links, colours, commands, pictures, files), every Snipit snip and whatever he drops on it,
//     EXCEPT what password managers and apps mark private, and copies made on a money site in Samara; LOCKED on this PC
//     (satchelstore.ts, Windows' own encryption through safeStorage, pictures too);
//   - is not on the screen until he reaches for it: a tab peeks out of the middle of the right edge of his main screen
//     while the mouse is there (never while a game runs), a click opens it; or Ctrl+Alt+V anywhere (hotkeys.ts 'satchel');
//   - closes on Esc, a click outside, the hotkey again, or the mouse wandering off (the page decides that last one);
//   - copy (puts it back on the clipboard; it NEVER presses Ctrl+V for him: that could land in WoW), pin, keep as a note
//     (the quick note opens with it inside), ask Aang (Send to Aang's chip), bin; pictures and files drag out into any app.
//
// Watching the clipboard: Electron has no change event, so it is read every 650 ms, cheaply (the list of formats and the
// words), and a picture only when the formats change or every 1.5 s while one is on it. Edge-Drop (Apache-2.0) settles
// for 220 ms after a change because Explorer writes its formats late; one tick here does the same. Electron 44's
// clipboard is the web's (async read/write); Windows' own formats (the privacy flags, FileNameW) are reached through its
// "electron application/osclipboard" names.
import { BrowserWindow, ClipboardItem, clipboard, ipcMain, nativeImage, safeStorage, screen } from 'electron';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SAFE_WEB_PREFERENCES, denyPermissions, lockDown } from './safety.ts';
import { SatchelStore, type Clip, type Lock } from './satchelstore.ts';
import { neverKeep } from './visits.ts';

export interface SatchelOptions {
  origin: string;
  preloadPath: string;
  stateDir: string;
  iconPath?: string;
  /** A game owns the screen: the tab never peeks (the hotkey still works, his pick). */
  inGame: () => boolean;
  /** The page Samara is on while it has the keyboard (a copy there from a money site is never kept), else null. */
  samaraUrl: () => string | null;
  /** Keep as a note: open the quick note with this inside. False while it cannot (Aang is not running). */
  keepAsNote: ((text: string) => boolean) | null;
  /** Ask Aang: land it on his typing box as a chip. Null while Aang is not running. */
  ask: ((c: Clip, png: Buffer | null) => void) | null;
  /** Tests only: no windows, no timers. */
  headless?: boolean;
}

/** Formats apps put on the clipboard to say "do not keep this" (password managers, private windows). */
const PRIVATE_FORMATS = ['ExcludeClipboardContentFromMonitorProcessing', 'Clipboard Viewer Ignore', 'KeePass', '1Password', 'Bitwarden'];
const PANEL_W = 400, PANEL_H = 600, TAB_W = 60, TAB_H = 78;
const POLL_MS = 650, PIC_EVERY_MS = 1500;

/** Windows' DPAPI through Electron. Without it nothing is kept: his clips are never written down unlocked. */
export function electronLock(): Lock {
  const on = safeStorage.isEncryptionAvailable();
  return {
    on,
    seal: (b) => safeStorage.encryptString(b.toString('base64')),
    open: (b) => Buffer.from(safeStorage.decryptString(b), 'base64'),
  };
}

export class Satchel {
  readonly store: SatchelStore;
  private readonly o: SatchelOptions;
  private panel: BrowserWindow | null = null;
  private tab: BrowserWindow | null = null;
  private open = false;
  private peeking = false;
  private tabHot = false;
  private leftAt = 0;
  private lastSig = '';
  private lastPicAt = 0;
  private picSig = '';
  private timers: NodeJS.Timeout[] = [];
  private thumbs = new Map<string, string>();
  private dragging = false;
  private readonly lock: Lock;

  constructor(o: SatchelOptions, lock: Lock = electronLock()) {
    this.o = o;
    this.store = new SatchelStore(o.stateDir, lock);
    if (!lock.on) console.error('shell: satchel: Windows encryption is not available, so nothing will be kept');
    this.lock = lock;
    if (o.headless) return;
    wireIpc(this);
    void this.signature().then((x) => { this.lastSig = x.sig; }).catch(() => {});   // what is on it at start is not "a new copy"
    this.timers.push(setInterval(() => this.poll(), POLL_MS));
    this.timers.push(setInterval(() => this.watchEdge(), 90));
  }

  dispose(): void { for (const t of this.timers) clearInterval(t); for (const w of [this.panel, this.tab]) if (w && !w.isDestroyed()) w.destroy(); }

  // ---------------------------------------------------------------- watching the clipboard
  private busy = false;
  private static raw = (f: string) => `electron application/osclipboard;format="${f}"`;
  private async rawBytes(f: string): Promise<Buffer | null> {
    try { if (!(await clipboard.has(Satchel.raw(f)))) return null; } catch { return null; }
    for (const it of await clipboard.read()) {
      if (!it.types.includes(Satchel.raw(f))) continue;
      try { const b = await it.getType(Satchel.raw(f)); return b instanceof Blob ? Buffer.from(await b.arrayBuffer()) : null; } catch { return null; }
    }
    return null;
  }
  private async signature(): Promise<{ sig: string; types: string[]; text: string }> {
    const items = await clipboard.read();
    const types = [...new Set(items.flatMap((i) => i.types))].sort();
    const text = await clipboard.readText();
    return { sig: types.join(',') + '|' + text.length + '|' + createHash('sha1').update(text).digest('hex'), types, text };
  }
  private async private(): Promise<boolean> {
    for (const f of PRIVATE_FORMATS) { try { if (await clipboard.has(Satchel.raw(f))) return true; } catch { /* not there */ } }
    // A DWORD, 0 = do not keep (Windows' own clipboard history obeys these too).
    for (const f of ['CanIncludeInClipboardHistory', 'CanUploadToCloudClipboard']) { const b = await this.rawBytes(f); if (b && b.length >= 4 && b.readUInt32LE(0) === 0) return true; }
    const url = this.o.samaraUrl();
    return !!url && neverKeep(url);
  }
  poll(): void { if (!this.busy && this.lock.on) { this.busy = true; void this.pollNow().catch(() => {}).finally(() => { this.busy = false; }); } }
  private async pollNow(): Promise<void> {
    const s = await this.signature();
    const pngType = s.types.includes('image/png') ? 'image/png' : null;
    const picDue = !!pngType && Date.now() - this.lastPicAt >= PIC_EVERY_MS;
    if (s.sig === this.lastSig && !picDue) return;
    const changed = s.sig !== this.lastSig;
    this.lastSig = s.sig;
    if (await this.private()) return;
    const from = this.o.samaraUrl() ? 'from Samara' : '';
    let kept: Clip | null = null;
    // A file copied in Explorer: its full path (FileNameW holds the first one).
    if (changed) {
      const b = await this.rawBytes('FileNameW');
      if (b && b.length > 2) { const p = b.toString('utf16le').replace(/\0[\s\S]*$/, ''); if (p && existsSync(p)) kept = this.store.addText(p, from || 'Explorer', 'file'); }
    }
    if (!kept && pngType) {
      this.lastPicAt = Date.now();
      for (const it of await clipboard.read()) {
        if (!it.types.includes(pngType)) continue;
        try {
          const blob = await it.getType(pngType);
          if (!(blob instanceof Blob)) break;
          const png = Buffer.from(await blob.arrayBuffer());
          const sig = createHash('sha1').update(png).digest('hex');
          if (sig !== this.picSig) {
            this.picSig = sig;
            const img = nativeImage.createFromBuffer(png);
            if (!img.isEmpty()) { const { width, height } = img.getSize(); kept = this.store.addPic(png, width, height, from); }
          }
        } catch { /* not readable */ }
        break;
      }
    }
    if (!kept && changed && s.text.trim()) kept = this.store.addText(s.text, from);
    if (kept) this.push();
  }

  /** Snipit's snip (main.ts): kept as a snip, as it was saved. */
  keepSnip(file: string): void {
    try { const img = nativeImage.createFromPath(file); if (img.isEmpty()) return; const { width, height } = img.getSize(); if (this.store.addPic(img.toPNG(), width, height, 'Snipit', true)) this.push(); } catch { /* gone */ }
  }
  /** Things dropped on the Satchel or its tab: files (pictures kept as pictures) and dragged words. */
  hearDrop(paths: string[], text: string): void {
    for (const p of paths.slice(0, 20)) {
      try {
        if (!existsSync(p) || !statSync(p).isFile()) continue;
        if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(p) && statSync(p).size < 12 << 20) {
          const img = nativeImage.createFromPath(p);
          if (!img.isEmpty()) { const { width, height } = img.getSize(); this.store.addPic(img.toPNG(), width, height, 'dragged in'); continue; }
        }
        this.store.addText(p, 'dragged in', 'file');
      } catch { /* skipped */ }
    }
    if (!paths.length && text.trim()) this.store.addText(text, 'dragged in');
    this.push();
  }

  // ---------------------------------------------------------------- what the page is told
  private thumb(c: Clip): string | undefined {
    if (!c.pic) return undefined;
    const have = this.thumbs.get(c.pic); if (have) return have;
    const png = this.store.picBytes(c); if (!png) return undefined;
    const img = nativeImage.createFromBuffer(png), { width } = img.getSize();
    const t = (width > 664 ? img.resize({ width: 664, quality: 'good' }) : img).toDataURL();
    this.thumbs.set(c.pic, t); return t;
  }
  private data() {
    return {
      clips: this.store.list().slice(0, 300).map((c) => ({ id: c.id, kind: c.kind, at: c.at, pinned: c.pinned, from: c.from, mac: c.from === 'from the Mac',
        text: c.kind === 'text' ? c.text.slice(0, 600) : c.text.slice(0, 2048), thumb: this.thumb(c) })),
      can: { note: !!this.o.keepAsNote, ask: !!this.o.ask },
    };
  }
  push(): void { const w = this.panel; if (w && !w.isDestroyed() && !w.webContents.isLoading()) w.webContents.send('satchel:data', this.data()); }
  /** Aang came or went: Keep as a note and Ask light up or grey out. */
  setHelpers(h: { keepAsNote: SatchelOptions['keepAsNote']; ask: SatchelOptions['ask'] }): void {
    const was = !!this.o.keepAsNote + ',' + !!this.o.ask;
    this.o.keepAsNote = h.keepAsNote; this.o.ask = h.ask;
    if (was !== !!h.keepAsNote + ',' + !!h.ask) this.push();
  }

  // ---------------------------------------------------------------- the windows
  private home() { return screen.getPrimaryDisplay(); }
  private panelWin(): BrowserWindow {
    if (this.panel && !this.panel.isDestroyed()) return this.panel;
    const a = this.home().workArea;
    const w = new BrowserWindow({
      x: a.x + a.width - PANEL_W, y: Math.round(a.y + (a.height - PANEL_H) / 2), width: PANEL_W, height: PANEL_H,
      frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, resizable: false, movable: false,
      minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, show: false, title: 'Satchel',
      webPreferences: { ...SAFE_WEB_PREFERENCES, preload: this.o.preloadPath },
    });
    if (this.o.iconPath) { try { w.setIcon(this.o.iconPath); } catch { /* default */ } }
    w.setAlwaysOnTop(true, 'screen-saver');
    w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    lockDown(w.webContents); denyPermissions(w.webContents.session);
    // A click outside closes it (his pick); not while he is dragging a clip out of it.
    w.on('blur', () => { if (this.open && !this.dragging) this.close(); });
    w.webContents.on('did-finish-load', () => this.push());
    void w.loadURL(`${this.o.origin}/satchel.html`);
    this.panel = w;
    return w;
  }
  private tabWin(): BrowserWindow {
    if (this.tab && !this.tab.isDestroyed()) return this.tab;
    const b = this.home().bounds;
    const w = new BrowserWindow({
      x: b.x + b.width - TAB_W, y: Math.round(b.y + b.height / 2 - TAB_H / 2), width: TAB_W, height: TAB_H,
      frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, resizable: false, movable: false,
      minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, focusable: false, show: false, title: 'Satchel tab',
      webPreferences: { ...SAFE_WEB_PREFERENCES, preload: this.o.preloadPath },
    });
    w.setAlwaysOnTop(true, 'screen-saver');
    lockDown(w.webContents); denyPermissions(w.webContents.session);
    void w.loadURL(`${this.o.origin}/satcheltab.html`);
    this.tab = w;
    return w;
  }
  /** Open it (the tab's click, or the hotkey: 'key' gets the arrows and Enter ready). */
  show(how: 'click' | 'key' = 'click'): void {
    const w = this.panelWin();
    this.peek(false);
    if (this.open) { w.focus(); return; }
    this.open = true;
    const go = () => { if (w.isDestroyed()) return; w.show(); w.focus(); w.webContents.focus(); this.push(); w.webContents.send('satchel:open', how); };
    if (w.webContents.isLoading()) w.webContents.once('did-finish-load', go); else go();
  }
  close(): void { if (!this.open) return; this.open = false; const w = this.panel; if (w && !w.isDestroyed()) w.webContents.send('satchel:close', null); }
  toggle(): void { if (this.open) this.close(); else this.show('key'); }
  hearClosed(): void { if (!this.open && this.panel && !this.panel.isDestroyed()) this.panel.hide(); }

  // The hover spot: the middle third of the right edge of his main screen.
  private watchEdge(): void {
    if (this.open || this.dragging) return;
    const pt = screen.getCursorScreenPoint(), b = this.home().bounds;
    const inSpot = pt.x >= b.x + b.width - 3 && pt.x < b.x + b.width + 1 && pt.y >= b.y + b.height / 3 && pt.y <= b.y + (b.height * 2) / 3;
    const nearTab = this.peeking && pt.x >= b.x + b.width - TAB_W - 12 && Math.abs(pt.y - (b.y + b.height / 2)) < TAB_H;
    if ((inSpot || this.tabHot) && !this.o.inGame()) { this.leftAt = 0; this.peek(true); return; }
    if (this.peeking && !nearTab && !this.tabHot) { if (!this.leftAt) this.leftAt = Date.now(); else if (Date.now() - this.leftAt > 700) this.peek(false); }
  }
  private peek(on: boolean): void {
    if (on === this.peeking) return;
    this.peeking = on;
    const w = this.tabWin();
    const send = () => { if (w.isDestroyed()) return; if (on) w.showInactive(); w.webContents.send('satchel:peek', on); };
    if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send); else send();
  }
  hearTabHover(on: boolean): void { this.tabHot = on; if (on) this.leftAt = 0; }
  hearTabHidden(): void { if (!this.peeking && this.tab && !this.tab.isDestroyed()) this.tab.hide(); }
  isOurs(sender: Electron.WebContents): boolean { return [this.panel, this.tab].some((w) => w && !w.isDestroyed() && w.webContents === sender); }

  // ---------------------------------------------------------------- what the keys do
  hearCopy(id: string): void {
    const c = this.store.get(id); if (!c) return;
    const png = c.pic ? this.store.picBytes(c) : null;
    const done = png ? clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) })]) : clipboard.writeText(c.text);
    // Our own write is not a new copy; the clip moves to the top as he used it.
    this.busy = true;
    void done.then(() => this.signature()).then((x) => { this.lastSig = x.sig; if (png) this.picSig = createHash('sha1').update(png).digest('hex'); }).catch(() => {}).finally(() => { this.busy = false; });
    this.store.touch(id); this.push();
  }
  hearPin(id: string): void { if (this.store.pin(id)) this.push(); }
  hearBin(id: string): void { if (this.store.bin(id)) this.push(); }
  hearNote(id: string): void {
    const c = this.store.get(id); if (!c || !this.o.keepAsNote) return;
    const words = c.pic ? (c.kind === 'snip' ? 'A snip from your Satchel' : 'A picture from your Satchel') : c.text;
    if (this.o.keepAsNote(words)) this.close();
  }
  hearAsk(id: string): void {
    const c = this.store.get(id); if (!c || !this.o.ask) return;
    this.o.ask(c, c.pic ? this.store.picBytes(c) : null);
    this.close();
  }
  /** Drag a picture or a file out into any app. A picture goes as a PNG written for the drag, removed two minutes later. */
  hearDrag(e: Electron.IpcMainEvent, id: string): void {
    e.returnValue = false;
    const c = this.store.get(id); if (!c) return;
    let file = '', icon: Electron.NativeImage | null = null;
    if (c.kind === 'file') { if (!existsSync(c.text)) return; file = c.text; icon = nativeImage.createFromPath(path.join(import.meta.dirname, '..', 'pages', 'art', 'browser', 'file_file.png')); }
    else if (c.pic) {
      const png = this.store.picBytes(c); if (!png) return;
      const dir = path.join(os.tmpdir(), 'aang-satchel-out'); mkdirSync(dir, { recursive: true });
      file = path.join(dir, `${c.kind === 'snip' ? 'Snip' : 'Picture'} ${new Date(c.at).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png`);
      writeFileSync(file, png);
      setTimeout(() => { try { rmSync(file, { force: true }); } catch { /* in use */ } }, 120_000).unref();
      icon = nativeImage.createFromBuffer(png).resize({ width: 64, quality: 'good' });
    } else return;
    if (!icon || icon.isEmpty()) icon = nativeImage.createFromPath(this.o.iconPath ?? '');
    this.dragging = true;
    try { e.sender.startDrag({ file, icon: icon.isEmpty() ? nativeImage.createEmpty() : icon }); e.returnValue = true; } catch { /* refused */ }
    setTimeout(() => { this.dragging = false; }, 600);
  }
}

let wired = false;
let current: Satchel | null = null;
/** One set of doors; each message is checked against the Satchel's own two windows. */
function wireIpc(s: Satchel): void {
  current = s;
  if (wired) return;
  wired = true;
  const ok = (e: Electron.IpcMainEvent) => !!current && current.isOurs(e.sender) && (!e.senderFrame || e.senderFrame.parent === null);
  const id = (v: unknown) => (typeof v === 'string' && /^c[0-9a-z]{1,20}$/.test(v) ? v : null);
  ipcMain.on('satchel:copy', (e, v) => { const i = id(v); if (ok(e) && i) current!.hearCopy(i); });
  ipcMain.on('satchel:pin', (e, v) => { const i = id(v); if (ok(e) && i) current!.hearPin(i); });
  ipcMain.on('satchel:bin', (e, v) => { const i = id(v); if (ok(e) && i) current!.hearBin(i); });
  ipcMain.on('satchel:note', (e, v) => { const i = id(v); if (ok(e) && i) current!.hearNote(i); });
  ipcMain.on('satchel:ask', (e, v) => { const i = id(v); if (ok(e) && i) current!.hearAsk(i); });
  ipcMain.on('satchel:drag', (e, v) => { const i = id(v); if (ok(e) && i) current!.hearDrag(e, i); else e.returnValue = false; });
  ipcMain.on('satchel:drop', (e, d) => {
    if (!ok(e) || !d || typeof d !== 'object') return;
    const paths = Array.isArray((d as { paths?: unknown }).paths) ? ((d as { paths: unknown[] }).paths.filter((p) => typeof p === 'string' && path.isAbsolute(p)) as string[]) : [];
    current!.hearDrop(paths, String((d as { text?: unknown }).text ?? '').slice(0, 100_000));
  });
  ipcMain.on('satchel:close', (e) => { if (ok(e)) current!.close(); });
  ipcMain.on('satchel:closed', (e) => { if (ok(e)) current!.hearClosed(); });
  ipcMain.on('satchel:tabclick', (e) => { if (ok(e)) current!.show('click'); });
  ipcMain.on('satchel:tabhover', (e, on) => { if (ok(e)) current!.hearTabHover(on === true); });
  ipcMain.on('satchel:tabhidden', (e) => { if (ok(e)) current!.hearTabHidden(); });
}

