// The tab rail slides out carrying its handle, the arrow turned to point back, and slides back in the same way
// (his ask, 2026-10-20). Only one handle is ever on screen. Saves pictures of the rail mid-slide and out.
//
// Run: npx electron test/electron/rail-check.ts <folder for the pictures>
import { app, BrowserWindow, screen } from 'electron';
import http from 'node:http';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { AangBrowser } from '../../src/browser.ts';
import { wireBrowser } from '../../src/browseripc.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(process.argv[process.argv.length - 1]?.endsWith('.ts') ? os.tmpdir() : process.argv[process.argv.length - 1]!);
mkdirSync(OUT, { recursive: true });
// ONSCREEN=1: on his real screen for a few seconds (never taking focus), where windows draw at full speed.
BrowserWindow.prototype.show = function (this: BrowserWindow) { if (process.env.ONSCREEN !== '1') this.setPosition(-6000, 100); else this.setPosition(80, 80); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* not in a test */ };
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d.slice(0, 200) : ''}`); if (!ok) bad++; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const site = http.createServer((_q, r) => { r.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Page</title><body style="margin:0;background:#2a3a4a"></body>'); });
  await new Promise<void>((r) => site.listen(0, '127.0.0.1', () => r()));
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'rail-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') }) as any;
  wireBrowser(() => b);
  b.open(`http://127.0.0.1:${(site.address() as any).port}/`); await wait(4500);
  const frame = b.win.webContents;
  const fjs = (c: string) => frame.executeJavaScript(c);
  // Open it the way his hover does: the band works out where, then asks.
  await fjs("document.getElementById('drawerkey').click(); true");
  const tray = b.trayV.webContents;
  const tjs = (c: string) => tray.executeJavaScript(c);
  const seen: string[] = [];
  for (let i = 0; i < 8; i++) { await wait(35); seen.push(await tjs("document.body.className + ':' + getComputedStyle(document.querySelector('.drawer')).transform.replace(/matrix\\(1, 0, 0, 1, |, 0\\)/g, '')")); }
  console.log('slide out: ' + seen.join(' > '));
  const mid = seen.find((x) => x !== '-300' && x !== 'none') ?? 'none';
  try { writeFileSync(path.join(OUT, 'rail-mid.png'), (await tray.capturePage()).toPNG()); } catch (e) { console.log('no picture: ' + (e as Error).message); }
  await wait(400);
  const out = await tjs(`(() => { const h = document.querySelector('.railhandle'), d = document.querySelector('.drawer'); return { cls: document.body.className, d: getComputedStyle(d).transform, h: getComputedStyle(h).transform, img: getComputedStyle(h).backgroundImage, hx: h.getBoundingClientRect().left, dr: d.getBoundingClientRect().right }; })()`);
  try { writeFileSync(path.join(OUT, 'rail-out.png'), (await tray.capturePage()).toPNG()); } catch (e) { console.log('no picture: ' + (e as Error).message); }
  check('the rail is moving partway through', mid !== 'none' && !/matrix\(1, 0, 0, 1, -300/.test(mid), mid);
  check('it ends fully out', out.d === 'none' && out.h === 'none', JSON.stringify(out));
  check('the handle rides its edge', Math.abs(out.hx - out.dr) <= 1, `${out.hx} vs ${out.dr}`);
  check('the arrow points back while out', /handle3-back/.test(out.img), out.img);
  const f = await fjs("({ out: document.body.classList.contains('rail-out'), vis: getComputedStyle(document.getElementById('drawerkey')).visibility })");
  check("the band's own handle hides, so there is only one", f.out && f.vis === 'hidden', JSON.stringify(f));
  b.tray(false);
  await wait(100);
  const back = await tjs("({ cls: document.body.className, t: getComputedStyle(document.querySelector('.drawer')).transform })");
  check('it slides back in', !/\bout\b/.test(back.cls) && back.t !== 'none', JSON.stringify(back));
  check('...still on screen while it does', b.trayV.getVisible());
  await wait(300);
  const end = await fjs("({ out: document.body.classList.contains('rail-out'), vis: getComputedStyle(document.getElementById('drawerkey')).visibility })");
  check('then it goes, and the band handle is back', !b.trayV.getVisible() && !end.out && end.vis === 'visible', JSON.stringify(end));
  // A second open, the everyday case (the first one waits on the rail's drawing surface being made).
  await fjs("document.getElementById('drawerkey').click(); true");
  const seen2: string[] = [];
  for (let i = 0; i < 8; i++) { await wait(35); seen2.push(await tjs("getComputedStyle(document.querySelector('.drawer')).transform.replace(/matrix[(]1, 0, 0, 1, |, 0[)]/g, '')")); }
  console.log('second slide out: ' + seen2.join(' > '));
  check('the next open slides from the first moment', seen2.slice(0, 4).some((x) => x !== '-300' && x !== 'none'), seen2.join(' '));
  console.log('pictures: ' + OUT);
  console.log(bad ? `${bad} FAILED` : 'ALL PASS'); app.exit(bad ? 1 : 0);
});
