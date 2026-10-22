// Sheet 67 (2026-10-22): pictures of the sheet for checking, and the frame-by-frame strip of the end moment. Off screen
// (offscreen rendering), never focused, no real mouse or keys. Mockup tooling only.
//
// Run from src/Shell:
//   npx electron ../../docs/cockpit/sheet-67/shots.mjs <outdir> page      (the whole sheet, 1x, a few seconds apart)
//   npx electron ../../docs/cockpit/sheet-67/shots.mjs <outdir> film      (every frame of the last 3 s of a timer, 4x)
import { app, BrowserWindow } from 'electron';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String(e?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String(e?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
app.on('window-all-closed', () => {});
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const args = process.argv.slice(2).filter((a) => !a.endsWith('shots.mjs'));
const [OUT, MODE] = args;

function serve() {
  return new Promise((ok) => {
    const s = http.createServer(async (req, res) => {
      try {
        const p = path.normalize(path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
        if (!p.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
        res.writeHead(200, { 'content-type': TYPES[path.extname(p)] ?? 'application/octet-stream' }); res.end(await readFile(p));
      } catch { res.writeHead(404); res.end(); }
    }).listen(0, '127.0.0.1', () => ok(s));
  });
}

app.whenReady().then(async () => {
  const s = await serve();
  const origin = 'http://127.0.0.1:' + s.address().port;
  const w = new BrowserWindow({ width: 1280, height: 900, show: false, frame: false, paintWhenInitiallyHidden: true,
    webPreferences: { offscreen: true, partition: 'sheet67shots', backgroundThrottling: false } });
  const errs = [];
  w.webContents.on('console-message', (e) => { if ((e.level === 'error' || e.level === 'warning') && !String(e.message).includes('Security Warning')) errs.push(e.message); });
  await w.loadURL(`${origin}/docs/cockpit/sheet-67-timer.html`);
  for (let i = 0; i < 100 && !(await w.webContents.executeJavaScript('!!window.__ready', true)); i++) await wait(100);
  if (MODE === 'page') {
    const h = await w.webContents.executeJavaScript('document.documentElement.scrollHeight', true);
    w.setContentSize(1280, Math.min(h, 6000));
    await wait(2500);
    for (const k of [1, 2]) {
      const img = await w.webContents.capturePage();
      await writeFile(path.join(OUT, `page-${k}.png`), img.toPNG());
      console.log('PICTURE ' + path.join(OUT, `page-${k}.png`) + ' ' + JSON.stringify(img.getSize()));
      await wait(1700);
    }
  } else if (MODE === 'film') {
    // A glass on its own canvas, a fake clock, the loop driven by hand: one picture per frame, 4x.
    const frames = await w.webContents.executeJavaScript(`(async () => {
      const { SandGlass } = await import('./sheet-67/sand.js');
      const clock = { t: 0, now() { return this.t; }, rate: 1 };
      const c = document.createElement('canvas'); document.body.append(c);
      const g = new SandGlass(c, { scale: 4, clock, seed: 5 * 97 + 0 });
      g.set({ total: 60000, end: 3200, paused: 0 });
      const out = [];
      for (let f = 0; f < 52; f++) { g.sleep(); g.frame(); g.sleep(); out.push({ t: clock.t, url: c.toDataURL('image/png'), landed: g.landed, ended: g.ended, flying: g.flying.length }); clock.t += 100; }
      g.flip(); out.push({ t: clock.t, url: c.toDataURL('image/png'), landed: g.landed, ended: g.ended, flying: 0 });
      await new Promise((r) => setTimeout(r, 400)); g.sleep();
      g.set({ total: 60000, end: clock.t + 60000, paused: 0 });
      for (let f = 0; f < 10; f++) { g.sleep(); g.frame(); g.sleep(); out.push({ t: clock.t, url: c.toDataURL('image/png'), landed: g.landed, ended: g.ended, flying: g.flying.length }); clock.t += 100; }
      g.destroy(); return out;
    })()`, true);
    let i = 0;
    for (const f of frames) { await writeFile(path.join(OUT, `raw-${String(i).padStart(2, '0')}.png`), Buffer.from(f.url.split(',')[1], 'base64')); i++; }
    console.log(frames.map((f, k) => `${k}:t${f.t}/L${f.landed}${f.ended ? 'E' : ''}${f.flying ? 'f' + f.flying : ''}`).join(' '));
  }
  else if (MODE === 'check') {
    // hands-on: scroll adds a minute, the hourglass click pauses (laid on its side), hover shows the keys, time's up shows Again
    const js = (x) => w.webContents.executeJavaScript(x, true);
    w.setContentSize(1280, 4100); await wait(800);
    const r = {};
    r.before = await js(`document.querySelector('#s-plate .tmv').textContent`);
    await js(`document.querySelector('#s-plate .tw').dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })); true`);
    await wait(300);
    r.afterScroll = await js(`document.querySelector('#s-plate .tmv').textContent + ' chip ' + document.querySelector('#s-plate .chip').textContent`);
    await js(`document.querySelector('#s-plate .gbox').click(); true`);
    await wait(300);
    r.paused = await js(`({ cls: document.querySelector('#s-plate .tw').className, canvas: document.querySelector('#s-plate canvas').width + 'x' + document.querySelector('#s-plate canvas').height, key: [...document.querySelectorAll('#s-plate .tb')].map(b => b.textContent).join(' ') })`);
    const b = await js(`(() => { const r = document.querySelector('#s-plate .tw').getBoundingClientRect(); return { x: r.x + 20, y: r.y + 20 }; })()`);
    w.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(b.x), y: Math.round(b.y) });
    await wait(400);
    const img = await w.webContents.capturePage({ x: Math.round(b.x) - 40, y: Math.round(b.y) - 40, width: 260, height: 140 });
    await writeFile(path.join(OUT, 'hover.png'), img.toPNG());
    await js(`document.getElementById('e-play').click(); true`);
    await wait(12500);
    r.end = await js(`({ cls: document.querySelector('#e-plate .tw').className, label: document.querySelector('#e-plate .twl').textContent, time: document.querySelector('#e-plate .tmv').textContent, keys: [...document.querySelectorAll('#e-plate .tb')].map(b => b.textContent).join(' ') })`);
    const e = await js(`(() => { const r = document.querySelector('#e-plate .tw').getBoundingClientRect(); return { x: r.x, y: r.y }; })()`);
    const img2 = await w.webContents.capturePage({ x: Math.round(e.x) - 10, y: Math.round(e.y) - 10, width: 260, height: 130 });
    await writeFile(path.join(OUT, 'end.png'), img2.toPNG());
    console.log('CHECK ' + JSON.stringify(r));
  }
  if (errs.length) console.log('PAGE ERRORS ' + errs.join(' | '));
  w.destroy(); s.close(); app.exit(errs.length ? 1 : 0);
}).catch((e) => { console.log('HARNESS FAILED ' + String(e?.stack ?? e)); app.exit(2); });
