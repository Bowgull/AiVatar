// A double-click on the band's wood fills the window and a second one brings it back (2026-10-23, his report: nothing
// happened on the Mac); a double-click on the address or a key does nothing. The Mac's own setting decides (Zoom by
// default). Also: Option + drag anywhere on the frame moves the window; each screen setup keeps its own spot.
// Run: npx electron test/electron/titledbl-check.ts
import { app, BrowserWindow, systemPreferences } from 'electron';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'tdbl-ud-')));
app.on('window-all-closed', () => {});
BrowserWindow.prototype.focus = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ok = (name: string, pass: boolean, note = '') => { console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${note ? ' (' + note + ')' : ''}`); return pass; };
app.whenReady().then(async () => {
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b: any = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'tdbl-state-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') });
  wireBrowser(() => b);
  b.open('about:blank');
  // A busy Mac takes a while to draw the frame: wait for its band, not a fixed time.
  for (let i = 0; i < 200; i++) { if (b.win && await b.win.webContents.executeJavaScript('!!document.getElementById("band")', true).catch(() => false)) break; await wait(150); }
  await wait(500);
  const w: BrowserWindow = b.win; w.setBounds({ x: 80, y: 80, width: 900, height: 600 }); await wait(500);
  const dbl = (sel: string) => w.webContents.mainFrame.executeJavaScript(`document.querySelector(${JSON.stringify(sel)}).dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); 1`);
  const set = systemPreferences.getUserDefault('AppleActionOnDoubleClick', 'string') || '(not set: Zoom)';
  console.log('this Mac is set to: ' + set);
  await dbl('#band'); await wait(900);
  let all = ok('double-click on the wood fills the window', w.isMaximized());
  await dbl('#band'); await wait(900);
  all = ok('a second double-click brings it back', !w.isMaximized() && w.getBounds().width === 900, JSON.stringify(w.getBounds())) && all;
  await dbl('#slot'); await wait(700);
  all = ok('a double-click on the address does nothing to the window', !w.isMaximized()) && all;
  await dbl('#reload'); await wait(700);
  all = ok('a double-click on a key does nothing to the window', !w.isMaximized()) && all;
  // Option + drag anywhere on the frame, the address bar included: the window follows the pointer
  const p0 = w.getPosition();
  await w.webContents.mainFrame.executeJavaScript(`(() => { const t = document.querySelector('#slot'); const o = { bubbles: true, altKey: true, button: 0, pointerId: 1 };
    t.dispatchEvent(new PointerEvent('pointerdown', { ...o, screenX: 400, screenY: 300 })); t.dispatchEvent(new PointerEvent('pointermove', { ...o, screenX: 460, screenY: 340 }));
    t.dispatchEvent(new PointerEvent('pointerup', { ...o, screenX: 460, screenY: 340 })); return 1; })()`);
  await wait(500);
  const p1 = w.getPosition();
  all = ok('Option + drag on the address bar moves the window', p1[0] === p0[0]! + 60 && p1[1] === p0[1]! + 40, `${p0} -> ${p1}`) && all;
  await w.webContents.mainFrame.executeJavaScript(`(() => { const t = document.querySelector('#slot'); const o = { bubbles: true, altKey: false, button: 0, pointerId: 1 };
    t.dispatchEvent(new PointerEvent('pointerdown', { ...o, screenX: 400, screenY: 300 })); t.dispatchEvent(new PointerEvent('pointermove', { ...o, screenX: 500, screenY: 300 })); return 1; })()`);
  await wait(400);
  all = ok('without Option, the address bar does not move the window', w.getPosition()[0] === p1[0], String(w.getPosition())) && all;
  // Each screen setup keeps its own spot
  b.keepPlace();
  const saved = JSON.parse((await import('node:fs')).readFileSync(b.placeFile, 'utf8'));
  all = ok('the spot is kept for this screen setup', Boolean(saved.setups?.[b.screensNow()]) && saved.setups[b.screensNow()].x === w.getNormalBounds().x, Object.keys(saved.setups ?? {}).join(' ; ')) && all;
  all = ok('and read back for this setup', b.savedPlace()?.x === w.getNormalBounds().x) && all;
  console.log(all ? 'ALL PASS' : 'FAILED'); app.exit(all ? 0 : 1);
});
