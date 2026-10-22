// Sheet 65: photographs report.html off screen at 1x (the pixel art is already drawn at 2x). Never on his screen, never
// focused, no input. Mockup tooling only.
// Run from src/Shell: npx electron ../../docs/cockpit/sheet-65/shots.mjs
import { app, BrowserWindow } from 'electron';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String(e?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String(e?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 180_000).unref();
app.on('window-all-closed', () => { /* the script decides */ });

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const W = 1480, H = 780;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const SCENES = [['report', 'toon=bujuju'], ['report-derek', 'toon=derek']];
const only = process.argv.slice(2).filter((a) => !a.endsWith('shots.mjs'));

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
  for (const [name, q] of SCENES) {
    if (only.length && !only.some((o) => name.startsWith(o))) continue;
    const w = new BrowserWindow({ width: W, height: H, show: false, frame: false, useContentSize: true, paintWhenInitiallyHidden: true,
      webPreferences: { offscreen: true, partition: 'sheet65shots', backgroundThrottling: false } });
    const errs = [];
    w.webContents.on('console-message', (e) => { if (e.level === 'error') errs.push(e.message); });
    await w.loadURL(`${origin}/docs/cockpit/sheet-65/report.html?${q}`);
    try { await Promise.race([w.webContents.executeJavaScript('window.__ready', true), wait(30000).then(() => { throw new Error('not ready'); })]); }
    catch (e) { console.log(`${name}: FAILED ${e.message} ${errs.join(' | ')}`); w.destroy(); continue; }
    await wait(400);
    const img = await w.webContents.capturePage({ x: 0, y: 0, width: W, height: H });
    await writeFile(path.join(HERE, name + '.png'), img.toPNG());
    console.log(`${name}.png ${JSON.stringify(img.getSize())}${errs.length ? '  errors: ' + errs.join(' | ') : ''}`);
    w.destroy();
  }
  s.close();
  setTimeout(() => app.exit(0), 200);
});
