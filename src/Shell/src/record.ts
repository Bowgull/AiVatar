// Recording a page (capture engine, 2026-10-30). Before: a picture every 250 ms through capturePage, each one turned
// into a base64 JPEG, sent into a hidden page and drawn on a canvas there: about 4 frames a second, no sound, and the
// whole video held in memory until the end.
//
// Now the browser's own tab capture does it (the same as sharing a tab in a call): Samara answers a hidden recorder
// page's "share a tab" with the page being recorded, so real frames come at the page's own pace (up to 30 a second),
// and the encoder is the browser's (no sound yet: asking for it never answers on this engine). The video is written to the file every few seconds, so memory stays small on the 8 GB
// Mac. The recorder lives in a session of its own (in memory only), so no website can ever be handed a tab this way.
// If tab capture will not start (an older engine), it falls back to the old picture-by-picture way, so a recording is
// never lost to it. Nothing leaves the computer: the file is saved in his Videos/Samara folder.
import { BrowserWindow, app, session, webContents, type WebContents, type WebFrameMain } from 'electron';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { capture } from './capture.ts';
import { within } from './page.ts';

const PARTITION = 'samara-recorder';
/** The frame each recorder page asked for, by the recorder page's own webContents id. */
const wanted = new Map<number, WebFrameMain>();
let handled = false;
function recorderSession(): Electron.Session {
  const ses = session.fromPartition(PARTITION);
  if (!handled) {
    handled = true;
    // Only our own recorder pages live in this session, and each is answered with the one page it was made for.
    ses.setDisplayMediaRequestHandler((req, answer) => {
      let from: WebContents | undefined;
      try { from = req.frame ? webContents.fromFrame(req.frame) : undefined; } catch { from = undefined; }
      const frame = from ? wanted.get(from.id) : undefined;
      if (!frame || frame.isDestroyed()) { answer({}); return; }
      // Video only: asking for the page's sound too never answers on Electron 44 (checked 2026-10-30), and the pages
      // Claude drives are muted anyway.
      try { answer({ video: frame }); } catch { answer({}); }
    });
    ses.setPermissionRequestHandler((_wc, perm, ok) => ok(perm === 'media' || perm === 'display-capture'));
  }
  return ses;
}

/** The recorder's blank page, written once into Samara's temporary folder. */
let pageFile = '';
function recorderPage(): string {
  if (pageFile && existsSync(pageFile)) return pageFile;
  pageFile = path.join(app.getPath('temp'), 'samara-recorder.html');
  writeFileSync(pageFile, '<!doctype html><meta charset="utf-8"><title>Samara recorder</title>');
  return pageFile;
}

const START_JS = `(async () => {
  const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 30 } }, audio: false });
  const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
  const r = new MediaRecorder(s, { mimeType: mime, videoBitsPerSecond: 1500000, audioBitsPerSecond: 96000 });
  const parts = [];
  r.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
  const b64 = (blob) => new Promise((res) => { const f = new FileReader(); f.onload = () => res(String(f.result).split(',')[1] || ''); f.readAsDataURL(blob); });
  window.__rec = { r, s, take: () => parts.length ? b64(new Blob(parts.splice(0), { type: 'video/webm' })) : Promise.resolve(''),
    stop: () => new Promise((res) => { r.onstop = () => { s.getTracks().forEach((t) => t.stop()); res(true); }; r.stop(); }) };
  r.start(1000);
  return { video: s.getVideoTracks().length, sound: s.getAudioTracks().length };
})()`;

/** The old way, kept as the fallback: pictures drawn on a canvas and recorded from it. */
const CANVAS_JS = `window.__rec = (() => { const c = document.getElementById('c'), g = c.getContext('2d'); const s = c.captureStream(0); const tr = s.getVideoTracks()[0]; const r = new MediaRecorder(s, { mimeType: 'video/webm;codecs=vp9' }); const parts = []; r.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); }; r.start(1000);
  const b64 = (blob) => new Promise((res) => { const f = new FileReader(); f.onload = () => res(String(f.result).split(',')[1] || ''); f.readAsDataURL(blob); });
  return { r, take: () => parts.length ? b64(new Blob(parts.splice(0), { type: 'video/webm' })) : Promise.resolve(''), stop: () => new Promise((res) => { r.onstop = () => res(true); r.stop(); }),
    draw: async (src) => { const i = new Image(); i.src = src; await i.decode(); if (c.width !== i.naturalWidth) { c.width = i.naturalWidth; c.height = i.naturalHeight; } g.drawImage(i, 0, 0); tr.requestFrame(); } }; })(); true`;

export type RecordHow = 'tab' | 'frames';
export class Recorder {
  private win: BrowserWindow | null = null;
  private file = '';
  private at = 0;
  private pull: NodeJS.Timeout | null = null;
  private frames: NodeJS.Timeout | null = null;
  how: RecordHow | null = null;
  /** Why tab capture did not start, when it fell back. */
  why = '';
  private readonly dir: string;
  /** dir: where the videos are saved. */
  constructor(dir: string) { this.dir = dir; }
  get busy(): boolean { return Boolean(this.win); }

  /** Start recording this page. Tab capture first, the picture-by-picture way if that will not start. */
  async start(target: WebContents): Promise<{ how: RecordHow; sound: boolean }> {
    if (this.win) throw new Error('already recording');
    mkdirSync(this.dir, { recursive: true });
    this.file = path.join(this.dir, `samara-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.webm`);
    writeFileSync(this.file, Buffer.alloc(0));
    this.at = Date.now();
    const tab = await this.startTab(target);
    if (tab) { this.how = 'tab'; this.pulling(); return { how: 'tab', sound: tab.sound > 0 }; }
    await this.startFrames(target);
    this.how = 'frames'; this.pulling();
    return { how: 'frames', sound: false };
  }

  private async startTab(target: WebContents): Promise<{ sound: number } | null> {
    const w = new BrowserWindow({ show: false, width: 200, height: 120, webPreferences: { session: recorderSession(), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    try {
      // A file page, not a data: one: sharing a tab is only offered to a secure page.
      await w.loadFile(recorderPage());
      wanted.set(w.webContents.id, target.mainFrame);
      const r = await within(w.webContents.executeJavaScript(START_JS, true) as Promise<{ video: number; sound: number }>, 5000, null);
      if (!r || !r.video) throw new Error(r ? 'no video track' : 'tab capture did not start in 5 s');
      this.win = w;
      return r;
    } catch (e) { this.why = (e as Error).message; wanted.delete(w.webContents.id); try { w.destroy(); } catch { /* gone */ } return null; }
  }

  private async startFrames(target: WebContents): Promise<void> {
    const w = new BrowserWindow({ show: false, width: 400, height: 300, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, offscreen: true } });
    await w.loadURL('data:text/html,<canvas id="c" width="1280" height="800"></canvas>');
    await w.webContents.executeJavaScript(CANVAS_JS);
    this.win = w;
    let busy = false;
    this.frames = setInterval(() => {
      if (busy || target.isDestroyed() || w.isDestroyed()) return;
      busy = true;
      void capture(target, { quality: 70, ms: 1000 }).then((s) => s ? w.webContents.executeJavaScript(`window.__rec.draw(${JSON.stringify(s.dataUrl())})`) : null).catch(() => {}).finally(() => { busy = false; });
    }, 250);
  }

  /** Every few seconds what was recorded goes to the file, so it is never all in memory. */
  private pulling(): void {
    this.pull = setInterval(() => void this.drain(), 3000);
  }
  private async drain(): Promise<void> {
    const w = this.win;
    if (!w || w.isDestroyed()) return;
    const b64 = await within(w.webContents.executeJavaScript('window.__rec.take()') as Promise<string>, 5000, '');
    if (b64) try { appendFileSync(this.file, Buffer.from(b64, 'base64')); } catch { /* the disk; the rest still tries */ }
  }

  /** Stop and save (or throw the video away). Null when nothing was recorded. */
  async stop(discard = false): Promise<{ file: string; seconds: number; how: RecordHow } | null> {
    const w = this.win;
    if (!w) return null;
    if (this.pull) clearInterval(this.pull);
    if (this.frames) clearInterval(this.frames);
    this.pull = this.frames = null;
    const how = this.how ?? 'frames';
    try {
      if (!w.isDestroyed()) {
        await within(w.webContents.executeJavaScript('window.__rec.stop()') as Promise<boolean>, 4000, false);
        await this.drain();
      }
    } finally {
      wanted.delete(w.webContents.id);
      try { w.destroy(); } catch { /* gone */ }
      this.win = null; this.how = null;
    }
    const seconds = Math.round((Date.now() - this.at) / 1000);
    if (discard) { try { writeFileSync(this.file, Buffer.alloc(0)); } catch { /* fine */ } return null; }
    return { file: this.file, seconds, how };
  }
}
