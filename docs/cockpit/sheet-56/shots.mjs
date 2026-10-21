// Sheet 56 (2026-10-21): photographs stage.html?look=A and ?look=B off screen, at exactly 2x (zoom factor 2, so every
// art pixel is a whole 2x2 block and the words are crisp), with the real mouse resting on one row so the glove is the
// product's own :hover. Never on his screen. Mockup tooling only, no product code.
//
// Run from src/Shell:  npx electron ../../docs/cockpit/sheet-56/shots.mjs
import { app, BrowserWindow } from 'electron';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String(e?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String(e?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.on('window-all-closed', () => { /* the script decides */ });

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const W = 760, H = 520, Z = 2;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Same-origin http, so the stage may read band.png's pixels into a canvas (file:// would taint it).
function serve() {
  return new Promise((ok) => {
    const s = http.createServer(async (req, res) => {
      try {
        const p = path.normalize(path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
        if (!p.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
        const body = await readFile(p);
        res.writeHead(200, { 'content-type': TYPES[path.extname(p)] ?? 'application/octet-stream' }); res.end(body);
      } catch { res.writeHead(404); res.end(); }
    }).listen(0, '127.0.0.1', () => ok(s));
  });
}

app.whenReady().then(async () => {
  const s = await serve();
  const origin = 'http://127.0.0.1:' + s.address().port;
  for (const look of ['A', 'B']) {
    const w = new BrowserWindow({ width: W * Z, height: H * Z, show: false, frame: false, useContentSize: true, paintWhenInitiallyHidden: true,
      webPreferences: { offscreen: true, zoomFactor: Z, partition: 'sheet56' } });
    const errs = [];
    w.webContents.on('console-message', (e) => { if (e.level === 'error') errs.push(e.message); });
    await w.loadURL(`${origin}/docs/cockpit/sheet-56/stage.html?look=${look}`);
    w.webContents.setZoomFactor(Z);
    const info = await w.webContents.executeJavaScript('window.__ready', true);
    await wait(300);
    w.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(info.hover.x * Z), y: Math.round(info.hover.y * Z) });
    await wait(400);
    const c = info.crop, img = await w.webContents.capturePage({ x: c.x * Z, y: c.y * Z, width: c.w * Z, height: c.h * Z });
    await writeFile(path.join(HERE, `look-${look}.png`), img.toPNG());
    console.log(`look-${look}.png ${JSON.stringify(img.getSize())}${errs.length ? '  page errors: ' + errs.join(' | ') : ''}`);
    w.destroy();
  }
  s.close();
  setTimeout(() => app.exit(0), 200);
});
