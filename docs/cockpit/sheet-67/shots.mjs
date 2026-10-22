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
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
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
    webPreferences: { offscreen: process.env.ONSCREEN ? false : true, partition: 'sheet67shots', backgroundThrottling: false } });
  const errs = [];
  w.webContents.on('console-message', (e) => { if ((e.level === 'error' || e.level === 'warning') && !String(e.message).includes('Security Warning') && !String(e.message).includes('willReadFrequently')) errs.push(e.message); });
  await w.loadURL(`${origin}/docs/cockpit/sheet-67-timer.html`);
  for (let i = 0; i < 100 && !(await w.webContents.executeJavaScript('!!window.__ready', true)); i++) await wait(100);
  await w.webContents.executeJavaScript('window.alert = window.confirm = window.prompt = () => {}; true', true);
  const js = (x) => w.webContents.executeJavaScript(x, true);
  // Offscreen rendering drops a canvas that was drawn once and never again (menu icons, frozen states): redraw them all
  // with their own pixels right before each picture. A harness quirk only; a normal window shows them (checked).
  const refresh = () => js(`document.querySelectorAll('canvas').forEach((c) => { if (!c.width) return; const g = c.getContext('2d'); g.putImageData(g.getImageData(0, 0, c.width, c.height), 0, 0); }); true`);
  if (MODE === 'page') {
    // the whole sheet, in slices
    const h = await js('document.documentElement.scrollHeight');
    w.setContentSize(1280, 1400); await wait(1500);
    let k = 0;
    for (let y = 0; y < h; y += 1400) {
      await js(`window.scrollTo(0, ${y}); true`); await wait(900); await refresh(); await wait(150);
      const img = await w.webContents.capturePage();
      await writeFile(path.join(OUT, `page-${k}.png`), img.toPNG()); console.log('PICTURE page-' + k); k++;
    }
  } else if (MODE === 'eval') {
    await wait(1500);
    console.log('EVAL ' + JSON.stringify(await js(args[2])));
  } else if (MODE === 'el') {
    // one element, by selector, at the moment asked
    const sel = args[2], name = args[3] ?? 'el';
    w.setContentSize(1280, 1400); await wait(1200);
    await js(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({block:'center'}); true`); await wait(1500); await refresh(); await wait(150);
    const r = await js(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: Math.max(0, Math.round(r.x) - 12), y: Math.max(0, Math.round(r.y) - 12), width: Math.round(r.width) + 24, height: Math.round(r.height) + 24 }; })()`);
    const img = await w.webContents.capturePage(r);
    await writeFile(path.join(OUT, name + '.png'), img.toPNG()); console.log('PICTURE ' + name + ' ' + JSON.stringify(r));
  } else if (MODE === 'check') {
    // hands-on: click pauses (it lies down), click again stands it up, hold turns it over, scroll adds, right-click menu
    w.setContentSize(1280, 1400); await wait(800);
    const r = {};
    const T = '#g-try';
    await js(`document.querySelector('${T}').scrollIntoView({block:'center'}); true`); await wait(400);
    const at = await js(`(() => { const b = document.querySelector('${T} .gbox').getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; })()`);
    const down = () => w.webContents.sendInputEvent({ type: 'mouseDown', x: at.x, y: at.y, button: 'left', clickCount: 1 });
    const up = () => w.webContents.sendInputEvent({ type: 'mouseUp', x: at.x, y: at.y, button: 'left', clickCount: 1 });
    w.webContents.sendInputEvent({ type: 'mouseMove', x: at.x, y: at.y }); await wait(300);
    r.keys = await js(`[...document.querySelectorAll('${T} .tb')].map(b => b.textContent).join(' ')`);
    down(); await wait(80); up(); await wait(900);
    r.afterClick = await js(`({ cls: document.querySelector('${T} .tw').className, angle: Math.round(window.__sheet.pz && document.querySelector('${T} .tw') ? 0 : 0) })`);
    const shot = async (n) => { const b = await js(`(() => { const r = document.querySelector('${T} .tw').getBoundingClientRect(); return { x: Math.round(r.x) - 20, y: Math.round(r.y) - 20, width: Math.round(r.width) + 40, height: Math.round(r.height) + 80 }; })()`); const img = await w.webContents.capturePage(b); await writeFile(path.join(OUT, n + '.png'), img.toPNG()); };
    await shot('try-paused');
    down(); await wait(80); up(); await wait(900);
    r.afterClick2 = await js(`document.querySelector('${T} .tw').className`);
    down(); await wait(350); await shot('try-holding'); await wait(450); up(); await wait(250); await shot('try-turning'); await wait(800);
    r.afterHold = await js(`({ cls: document.querySelector('${T} .tw').className, time: document.querySelector('${T} .tmv').textContent })`);
    w.webContents.sendInputEvent({ type: 'mouseWheel', x: at.x, y: at.y, deltaX: 0, deltaY: 120 }); await wait(300);
    r.afterScroll = await js(`document.querySelector('${T} .tmv').textContent + ' chip ' + document.querySelector('${T} .chip2').textContent`);
    w.webContents.sendInputEvent({ type: 'contextMenu', x: at.x, y: at.y }); await js(`document.querySelector('${T} .tw').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: ${at.x}, clientY: ${at.y} })); true`); await wait(300);
    r.menu = await js(`[...document.querySelectorAll('.livemenu button')].map(b => b.textContent).join(' | ')`);
    const mi = await js(`(() => { const r = document.querySelector('.livemenu').getBoundingClientRect(); return { x: Math.round(r.x) - 10, y: Math.round(r.y) - 10, width: Math.round(r.width) + 20, height: Math.round(r.height) + 20 }; })()`);
    await writeFile(path.join(OUT, 'livemenu.png'), (await w.webContents.capturePage(mi)).toPNG());
    console.log('CHECK ' + JSON.stringify(r));
  }
  if (errs.length) console.log('PAGE ERRORS ' + errs.join(' | '));
  w.destroy(); s.close(); app.exit(errs.length ? 1 : 0);
}).catch((e) => { console.log('HARNESS FAILED ' + String(e?.stack ?? e)); app.exit(2); });
