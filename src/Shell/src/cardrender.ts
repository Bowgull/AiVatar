// 9.D D3 (sheet 15, approved 2026-10-13): the cards Aang draws for Discord. A picture is the one thing Discord shows
// exactly as made, so Aang's look (pixel-painted wood, parchment, plaques, Silkscreen and Figtree) lives in these.
// pages/card.html draws one card from data in its #fragment (text only, never markup); this window renders it off
// screen at 2x and hands back a PNG. One window, reused; one card at a time.
import { BrowserWindow, session } from 'electron';
import { SAFE_WEB_PREFERENCES, lockDown } from './safety.ts';

export const CARD_KINDS = new Set(['job', 'needs', 'home', 'watched']);

export class CardRenderer {
  private win: BrowserWindow | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private seq = 0;
  private readonly origin: string;
  constructor(origin: string) { this.origin = origin; }

  /** The card as a PNG (base64), or why not. */
  render(kind: string, data: unknown): Promise<{ ok: boolean; png?: string; error?: string }> {
    const run = this.chain.then(() => this.one(kind, data), () => this.one(kind, data));
    this.chain = run.catch(() => {});
    return run;
  }

  private async one(kind: string, data: unknown): Promise<{ ok: boolean; png?: string; error?: string }> {
    if (!CARD_KINDS.has(kind)) return { ok: false, error: 'no such card' };
    let json = '';
    try { json = JSON.stringify({ kind, data: data ?? {} }); } catch { return { ok: false, error: 'the card data is not plain data' }; }
    if (json.length > 20_000) return { ok: false, error: 'too much for one card' };
    const w = this.window();
    const wc = w.webContents;
    const said = new Promise<string>((resolve) => {
      const t = setTimeout(() => { wc.off('page-title-updated', on); resolve('failed:timed out'); }, 8000);
      const on = (_e: unknown, title: string) => { if (/^(ready|failed):/.test(title)) { clearTimeout(t); wc.off('page-title-updated', on); resolve(title); } };
      wc.on('page-title-updated', on);
    });
    // A new query each time, so the page really reloads (a changed #fragment alone would not).
    await w.loadURL(`${this.origin}/card.html?n=${++this.seq}#${encodeURIComponent(json)}`).catch(() => {});
    const title = await said;
    const m = /^ready:(\d+)x(\d+)$/.exec(title);
    if (!m) return { ok: false, error: title.replace(/^failed:/, '') || 'it did not draw' };
    await new Promise((r) => setTimeout(r, 60));                 // one more frame, so the pictures are painted
    const css = { width: Math.min(700, Number(m[1])), height: Math.min(1200, Number(m[2])) };
    const img = await wc.capturePage({ x: 0, y: 0, width: css.width * 2, height: css.height * 2 });
    if (img.isEmpty()) return { ok: false, error: 'the picture came out empty' };
    return { ok: true, png: img.toPNG().toString('base64') };
  }

  private window(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win;
    const w = new BrowserWindow({
      show: false, width: 1400, height: 2400, frame: false, transparent: true, backgroundColor: '#00000000',
      // Its own in-memory session (2026-10-13): Chromium saves a page's zoom for its whole HOST, and every Aang page
      // is on 127.0.0.1, so this 2x leaked onto the typing box and the bubble and stayed there across restarts.
      webPreferences: { ...SAFE_WEB_PREFERENCES, offscreen: true, zoomFactor: 2, session: session.fromPartition('aang-cards') },
    });
    lockDown(w.webContents);
    this.win = w;
    return w;
  }

  close(): void { if (this.win && !this.win.isDestroyed()) this.win.destroy(); this.win = null; }
}
