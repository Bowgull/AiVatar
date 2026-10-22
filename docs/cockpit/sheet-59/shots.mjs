// Sheets 59-61 (2026-10-22): photographs a stage page off screen, one picture per scene, at exactly 2x (zoom factor 2,
// so every art pixel is a whole block and the words are crisp). Never on his screen, never focused, no real keys; the
// mouse, where a scene asks for one, is an input event sent to the page itself. Mockup tooling only, no product code.
//
// Run from src/Shell:
//   npx electron ../../docs/cockpit/sheet-59/shots.mjs docs/cockpit/sheet-59/stage.html docs/cockpit/sheet-59 sceneA sceneB ...
import { app, BrowserWindow, nativeImage } from 'electron';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String(e?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String(e?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 240_000).unref();
app.on('window-all-closed', () => { /* the script decides */ });

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.json': 'application/json' };
const Z = 2, W = 1600, H = 1000;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const args = process.argv.slice(2).filter((a) => !a.endsWith('shots.mjs'));
const [STAGE, OUTDIR, ...SCENES] = args;
if (!STAGE || !OUTDIR || !SCENES.length) { console.log('usage: shots.mjs <stage> <outdir> <scene...>'); app.exit(1); }

// Same-origin http, so stages may read Samara's wood art into canvases (file:// would taint them).
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
  let bad = 0;
  for (const scene of SCENES) {
    const w = new BrowserWindow({ width: W * Z, height: H * Z, show: false, frame: false, useContentSize: true, paintWhenInitiallyHidden: true,
      webPreferences: { offscreen: true, zoomFactor: Z, partition: 'sheet59shots', backgroundThrottling: false } });
    const errs = [];
    w.webContents.on('console-message', (e) => { if (e.level === 'error' || e.level === 'warning') errs.push(e.message); });
    await w.loadURL(`${origin}/${STAGE}?scene=${encodeURIComponent(scene)}`);
    w.webContents.setZoomFactor(Z);
    let info;
    try { info = await Promise.race([w.webContents.executeJavaScript('window.__ready', true), wait(30000).then(() => { throw new Error('stage not ready'); })]); }
    catch (e) { console.log(`${scene}: FAILED ${e.message}  ${errs.join(' | ')}`); bad++; w.destroy(); continue; }
    if (!info) { await wait(500); console.log(scene + ': NO STAGE ' + errs.join(' | ')); bad++; w.destroy(); continue; }
    await wait(250);
    if (info.hover) { w.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(info.hover.x * Z), y: Math.round(info.hover.y * Z) }); await wait(450); }
    // a row held in :hover the way the browser's own inspector does it, so the product's hover look (the glove) stays put
    // while the picture is taken in tiles
    if (info.forceHover) {
      const d = w.webContents.debugger; d.attach('1.3');
      await d.sendCommand('DOM.enable'); await d.sendCommand('CSS.enable');
      const { root } = await d.sendCommand('DOM.getDocument', { depth: -1 });
      const { nodeId } = await d.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector: info.forceHover });
      if (nodeId) await d.sendCommand('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] });
      else errs.push('no element for ' + info.forceHover);
      await wait(400);
    }
    if (info.after) { await w.webContents.executeJavaScript(info.after, true); await wait(300); }
    const c = info.crop;
    // Windows keeps a window inside the screen, so a picture taller or wider than the view is taken in tiles (the page
    // slid under the view) and stitched back together, pixel for pixel.
    const vp = await w.webContents.executeJavaScript('({ w: innerWidth, h: innerHeight })', true);
    const TW = Math.floor(vp.w / 2) * 2, TH = Math.floor(vp.h / 2) * 2;
    const out = Buffer.alloc(c.w * Z * c.h * Z * 4);
    for (let ty = 0; ty < c.h; ty += TH) for (let tx = 0; tx < c.w; tx += TW) {
      const tw = Math.min(TW, c.w - tx), th = Math.min(TH, c.h - ty);
      await w.webContents.executeJavaScript(`document.body.style.transform = 'translate(${-(c.x + tx)}px, ${-(c.y + ty)}px)'; 1`, true);
      await wait(350);
      const part = await w.webContents.capturePage({ x: 0, y: 0, width: tw * Z, height: th * Z });
      const sz = part.getSize(), bm = part.toBitmap();
      for (let y = 0; y < Math.min(sz.height, th * Z); y++) bm.copy(out, ((ty * Z + y) * c.w * Z + tx * Z) * 4, y * sz.width * 4, (y * sz.width + Math.min(sz.width, tw * Z)) * 4);
    }
    const img = nativeImage.createFromBitmap(out, { width: c.w * Z, height: c.h * Z });
    await writeFile(path.join(ROOT, OUTDIR, `${scene}.png`), img.toPNG());
    console.log(`${scene}.png ${JSON.stringify(img.getSize())}${errs.length ? '  page says: ' + errs.join(' | ') : ''}`);
    w.destroy();
  }
  s.close();
  setTimeout(() => app.exit(bad ? 1 : 0), 200);
});
