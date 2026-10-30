// The capture engine (engine 6, 2026-10-30): one way to take a picture, with one size rule and a deadline.
//
// Before this there were 11 capturePage spots, each with its own size, quality and timeout (some none). A picture of a
// page on a high-DPI screen came back at twice its width, four times the bytes, and Claude paid for those pixels in
// tokens. Now:
//   - a picture is at most the size it is on screen (CSS pixels; `scale` asks for more, e.g. a crisp card at 2x),
//     and never wider than `maxWidth` (1280 by default: what Claude reads text in well);
//   - JPEG at 75 unless exact pixels matter (`png`), or the image itself (`image`) for callers that do more with it;
//   - always a deadline: a hung page gives no picture, never a hang.
//
// Samara's whole window (his pick, 2026-10-30): the frame plus every view shown in it (the page, the curtain, the tab
// list, the overlays), laid together in their order, the way he sees it. It is drawn by Samara itself, so it needs no
// Screen Recording permission on the Mac and works the same on the PC, and nothing leaves the computer.
import { BrowserWindow, WebContentsView, nativeImage, type NativeImage, type Rectangle, type WebContents } from 'electron';
import { within } from './page.ts';
import { blit } from './taskbarplan.ts';
import { MAX_W, fitWidth, shownLayers, type Layer } from './captureplan.ts';
export { SIZES, fitWidth } from './captureplan.ts';

export type CaptureTarget = WebContents | BrowserWindow | WebContentsView;
export type Format = 'jpeg' | 'png' | 'image';
export interface CaptureOpts {
  /** Part of the target, in its CSS pixels. */
  rect?: Rectangle;
  /** Never wider than this, in pixels. Default 1280. */
  maxWidth?: number;
  /** 'jpeg' (default), 'png' or 'image' (the NativeImage only, nothing encoded). */
  format?: Format;
  /** JPEG quality, default 75. */
  quality?: number;
  /** The deadline. Default 2000 ms. */
  ms?: number;
  /** Pixels per CSS pixel. Default 1 (the size on screen); 2 for a crisp card. */
  scale?: number;
}
export interface Shot {
  image: NativeImage;
  width: number;
  height: number;
  format: Format;
  mime: string;
  /** The encoded picture ('image' format: empty). */
  data: Buffer;
  base64(): string;
  dataUrl(): string;
}
export const CAPTURE_MS = 2000, JPEG_Q = 75;

const wcOf = (t: CaptureTarget): WebContents => (t instanceof BrowserWindow || t instanceof WebContentsView) ? t.webContents : t;
/** The target's width on screen, in CSS pixels, when it can be known. */
function cssWidth(t: CaptureTarget, rect?: Rectangle): number {
  if (rect) return rect.width;
  try {
    if (t instanceof BrowserWindow) return t.getContentBounds().width;
    if (t instanceof WebContentsView) return t.getBounds().width;
    const w = BrowserWindow.fromWebContents(t);
    return w && !w.isDestroyed() ? w.getContentBounds().width : 0;
  } catch { return 0; }
}

/** Shape an image into a Shot: sized by the rule, then encoded. */
export function shape(img: NativeImage, css: number, o: CaptureOpts = {}): Shot | null {
  if (!img || img.isEmpty()) return null;
  const s = img.getSize();
  const w = fitWidth(s.width, css, o.maxWidth ?? MAX_W, o.scale ?? 1);
  const fit = w < s.width ? img.resize({ width: w, quality: 'good' }) : img;
  return encode(fit, o.format ?? 'jpeg', o.quality ?? JPEG_Q);
}

function encode(image: NativeImage, format: Format, quality: number): Shot {
  const { width, height } = image.getSize();
  const data = format === 'png' ? image.toPNG() : format === 'jpeg' ? image.toJPEG(quality) : Buffer.alloc(0);
  const mime = format === 'png' ? 'image/png' : format === 'jpeg' ? 'image/jpeg' : '';
  return { image, width, height, format, mime, data, base64: () => data.toString('base64'), dataUrl: () => (mime ? `data:${mime};base64,` + data.toString('base64') : image.toDataURL()) };
}

/** A picture of a page, a view or a window's own page. Null when there is none in time (closed, crashed, hung). */
export async function capture(target: CaptureTarget, o: CaptureOpts = {}): Promise<Shot | null> {
  let wc: WebContents;
  try { wc = wcOf(target); if (!wc || wc.isDestroyed()) return null; } catch { return null; }
  const r = o.rect && o.rect.width > 0 && o.rect.height > 0 ? { x: Math.round(o.rect.x), y: Math.round(o.rect.y), width: Math.round(o.rect.width), height: Math.round(o.rect.height) } : undefined;
  let img: NativeImage | null;
  try { img = await within(r ? wc.capturePage(r) : wc.capturePage(), o.ms ?? CAPTURE_MS, null); } catch { return null; }
  return img ? shape(img, cssWidth(target, r), o) : null;
}

/** What a window picture holds besides the picture: how many layers, and which ones gave none in time. */
export interface WindowShot extends Shot { layers: number; missing: string[] }

/**
 * Samara's whole window as he sees it: the frame's own page, then every view shown over it, in order. A layer that
 * gives no picture in time (a hung page) is left as the window's colour and named in `missing`. Built at the size on
 * screen (or less, by maxWidth), so a full window is about 1280 x 800.
 */
export async function captureWindow(win: BrowserWindow, o: CaptureOpts & { name?: (v: WebContentsView) => string; under?: string } = {}): Promise<WindowShot | null> {
  if (!win || win.isDestroyed()) return null;
  const area = win.getContentBounds();
  if (area.width < 2 || area.height < 2) return null;
  const k = Math.min(o.scale ?? 1, (o.maxWidth ?? MAX_W) / area.width);
  const W = Math.max(1, Math.round(area.width * k)), H = Math.max(1, Math.round(area.height * k));
  const ms = o.ms ?? CAPTURE_MS;
  const views = (win.contentView.children ?? []).filter((v): v is WebContentsView => v instanceof WebContentsView);
  const layers = shownLayers(views.map((v, i) => { let vis = false, b = { x: 0, y: 0, width: 0, height: 0 }; try { vis = v.getVisible() && !v.webContents.isDestroyed(); b = v.getBounds(); } catch { /* gone */ } return { visible: vis, bounds: b, name: String(i) }; }), area);
  const want = [{ wc: win.webContents, at: { x: 0, y: 0, width: area.width, height: area.height, name: 'frame' } as Layer }, ...layers.map((l) => ({ wc: views[Number(l.name)]!.webContents, at: { ...l, name: o.name ? o.name(views[Number(l.name)]!) : `view ${l.name}` } }))];
  // Every layer at once, each with the deadline: the slowest page sets the wait, never the sum.
  const pics = await Promise.all(want.map(async ({ wc, at }) => {
    if (wc.isDestroyed()) return null;
    const img = await within(wc.capturePage(), ms, null).catch(() => null);
    if (!img || img.isEmpty()) return null;
    const w = Math.max(1, Math.round(at.width * k)), h = Math.max(1, Math.round(at.height * k));
    const sized = img.resize({ width: w, height: h, quality: 'good' });
    const s = sized.getSize(), bm = sized.toBitmap();
    return bm.length === s.width * s.height * 4 ? { at, bm, w: s.width, h: s.height } : null;
  }));
  const out = new Uint8Array(W * H * 4);
  // The window's own colour under everything (a see-through frame would otherwise be black in a JPEG).
  const [b, g, r] = hexBgr(o.under ?? '#2b2520');
  for (let i = 0; i < out.length; i += 4) { out[i] = b; out[i + 1] = g; out[i + 2] = r; out[i + 3] = 255; }
  const missing: string[] = [];
  pics.forEach((p, i) => { if (!p) { missing.push(want[i]!.at.name); return; } blit(out, W, H, p.bm, p.w, p.h, Math.round(p.at.x * k), Math.round(p.at.y * k)); });
  if (missing.length === want.length) return null;
  const img = nativeImage.createFromBitmap(Buffer.from(out.buffer), { width: W, height: H });
  return { ...encode(img, o.format ?? 'jpeg', o.quality ?? JPEG_Q), layers: want.length, missing };
}

function hexBgr(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[3]!, 16), parseInt(m[2]!, 16), parseInt(m[1]!, 16)] : [32, 37, 43];
}
