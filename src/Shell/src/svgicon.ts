// A site's SVG icon, kept as a small picture (2026-10-22, his ask: "no bookmark is ever just a letter when the site has
// an icon"). Samara never keeps an SVG itself (it is a document, not just a picture), so it is drawn once in a sealed,
// hidden page and only the PNG of what it drew is kept:
//   - the SVG is shown as an <img>, where an SVG cannot run scripts or load anything (the browser's own rule), and on top
//     of that the page has JavaScript switched off and lives in its own in-memory storage;
//   - every request from that page that is not the picture itself is cancelled, so nothing reaches the internet;
//   - one picture at a time, a deadline on each, and the hidden window is closed after a minute with nothing to draw.
import { BrowserWindow, session } from 'electron';

const SIZE = 32;
const MAX_BYTES = 64 * 1024;
let win: BrowserWindow | null = null;
let idle: NodeJS.Timeout | null = null;
let queue: Promise<unknown> = Promise.resolve();

function sealed(): BrowserWindow {
  if (win && !win.isDestroyed()) return win;
  const ses = session.fromPartition('svgicon');                 // in memory: nothing of it is kept on disk
  ses.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !d.url.startsWith('data:') }));
  ses.setPermissionRequestHandler((_wc, _p, done) => done(false));
  win = new BrowserWindow({
    show: false, width: SIZE, height: SIZE, transparent: true, frame: false, paintWhenInitiallyHidden: true,
    webPreferences: { offscreen: true, javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false, session: ses, images: true, webgl: false, spellcheck: false },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  return win;
}

/** The SVG's bytes drawn as a 32x32 PNG data URL, or null when it is too big, draws nothing, or takes too long. */
export function svgToPng(svg: Buffer): Promise<string | null> {
  const job = queue.then(() => draw(svg), () => draw(svg));
  queue = job.catch(() => null);
  return job;
}

async function draw(svg: Buffer): Promise<string | null> {
  if (!svg.length || svg.length > MAX_BYTES) return null;
  if (idle) { clearTimeout(idle); idle = null; }
  try {
    const w = sealed();
    const src = 'data:image/svg+xml;base64,' + svg.toString('base64');
    const html = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">`
      + `<style>html,body{margin:0;background:transparent}img{display:block;width:${SIZE}px;height:${SIZE}px;object-fit:contain}</style><img src="${src}">`;
    const loaded = w.webContents.loadURL('data:text/html;base64,' + Buffer.from(html).toString('base64'));
    const done = await Promise.race([loaded.then(() => true, () => false), new Promise<boolean>((r) => setTimeout(() => r(false), 3000))]);
    if (!done) return null;
    await new Promise((r) => setTimeout(r, 60));               // one paint after load
    const img = await Promise.race([w.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE }), new Promise<null>((r) => setTimeout(() => r(null), 2000))]);
    if (!img || img.isEmpty()) return null;
    const pic = img.getSize().width === SIZE ? img : img.resize({ width: SIZE, height: SIZE, quality: 'best' });
    // Drew nothing (a broken or empty SVG): no picture rather than a blank square.
    const px = pic.toBitmap();
    let seen = 0; for (let i = 3; i < px.length; i += 4) if (px[i]! > 16) seen++;
    if (seen < 8) return null;
    return 'data:image/png;base64,' + pic.toPNG().toString('base64');
  } catch { return null; }
  finally {
    idle = setTimeout(() => { try { win?.destroy(); } catch { /* gone */ } win = null; }, 60_000);
    idle.unref?.();
  }
}
