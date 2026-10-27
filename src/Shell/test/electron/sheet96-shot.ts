// Sheet 96 v2 (2026-10-27, his "it's not bad but we forgot a lot of design principles and design choices I've made in
// the past"): the one-plank bar laid on Samara's REAL band, so every pick he made stays (the lip, the tab handle, the calm
// address bar with the site's name, the shield, the gold window keys, red close, the night look). Not built: styles laid
// on for the picture. Run: npx electron test/electron/sheet96-shot.ts <out-prefix>
import { app, BrowserWindow } from 'electron';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.message ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 150_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 's96-ud-')));
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setOpacity(0); this.showInactive(); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
// One plank: the wood at its true 2x (band.png is 64 x 26, so 128 x 52, under the 14 px lip); the keys carved into it
// with the plum kept as their inlay (dark top-left, lit bottom-right lip, no smooth gradient); the address bar the same
// carving; the lantern standing on the wood where the ... was.
const PLANK = `.band{height:66px !important;background-size:128px 52px !important;background-position:0 14px !important}
  .band::before{background-size:128px 52px !important}
  .band .rnd:not(.menukey){border-radius:6px !important;border:2px solid #120A05 !important;background:#3e2560 !important;
    box-shadow:inset 2px 2px 0 #1e0f33,inset -2px -2px 0 #7a5aa8 !important}
  .band .slot{border-width:2px !important;box-shadow:inset 0 2px 0 rgba(0,0,0,.75),inset 2px 0 0 rgba(0,0,0,.5),inset 0 -2px 0 rgba(150,110,200,.35),inset -2px 0 0 rgba(150,110,200,.22) !important}
  .band .menukey{background:none !important;border:none !important;box-shadow:none !important;width:36px !important;height:36px !important}
  .band .menukey img{display:block;width:32px;height:32px;image-rendering:pixelated;filter:drop-shadow(2px 2px 0 #120A05)}
  html.secret .band{background:var(--night),url(art/browser/band.png) repeat-x 0 14px/128px 52px !important}
  html.secret .band::before{background:var(--night),url(art/browser/band.png) repeat-x 0 -8px/128px 52px !important}
  html.secret .band .menukey{background:none !important;border:none !important;box-shadow:none !important}
  html.secret .band .rnd:not(.menukey){background:#22304f !important;box-shadow:inset 2px 2px 0 #0e1630,inset -2px -2px 0 #6f86b8 !important}`;
const STONE = ['...OOOOOO...', '..OHHHHHLO..', '.OHHLLLLLSO.', 'OHLLLLLLLLSO', 'OHLLLLLLLLSO', 'OHLLLLLLLLSO', 'OLLLLLLLLLSO', 'OLLLLLLLLSSO', 'OLLLLLLLLSSO', '.OSLLLLLSSO.', '..OSSSSSSO..', '...OOOOOO...'];
const GLYPH = ['...G...', 'G..G.G.', '.G.GG..', '..GGGGG', 'GGGG...', '..G.GG.', '.G..G.G'];
// The lantern for the menu, and Claude's rune (rune.js's own maps, ring at 40%, working amber) at the address bar's end.
const LAY_JS = `(() => {
  const m = document.getElementById('menukey'); const im = new Image(); im.src = 'art/samara/samara-lantern-16.png'; m.replaceChildren(im);
  for (const id of ['dlkey', 'upkey']) document.getElementById(id).classList.remove('away');
  const S = ${JSON.stringify(STONE)}, G = ${JSON.stringify(GLYPH)}, C = { O: '#2a1a10', H: '#fbf3e4', L: '#f0e3c8', S: '#cdb48c' };
  const cv = document.createElement('canvas'); cv.width = 36; cv.height = 36; cv.id = 'r96'; cv.style.cssText = 'flex:none;image-rendering:pixelated;margin:-4px -6px -4px 0';
  const g = cv.getContext('2d'); const P = (x, y, c) => { g.fillStyle = c; g.fillRect(x * 2, y * 2, 2, 2); };
  for (let y = 0; y < 18; y++) for (let x = 0; x < 18; x++) { const d = Math.hypot(x - 8.5, y - 8.5); if (Math.abs(d - 8.2) > 0.62) continue; let a = Math.atan2(x - 8.5, -(y - 8.5)) / (2 * Math.PI); if (a < 0) a += 1; P(x, y, a <= .4 ? '#f0a64a' : 'rgba(18,10,5,.75)'); }
  S.forEach((r, y) => [...r].forEach((c, x) => { if (c !== '.') P(x + 3, y + 3, C[c]); }));
  G.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'G') P(x + 5, y + 5, '#d97757'); }));
  document.getElementById('slot').append(cv); return 1; })()`;
const UNLAY_JS = `(() => { document.getElementById('r96')?.remove(); return 1; })()`;
app.whenReady().then(async () => {
  const out = process.argv[process.argv.length - 1];
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const b: any = new AangBrowser({ origin: pages.origin, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs'), stateDir: mkdtempSync(path.join(os.tmpdir(), 's96-st-')) });
  wireBrowser(() => b);
  b.open('https://en.wikipedia.org/wiki/Lantern');
  for (let i = 0; i < 100 && !b.win; i++) await wait(150);
  b.win.setContentSize(1440, 900);
  await wait(7000);
  const fw = b.win.webContents;
  const page = () => b.cur()?.view;
  const shot = async (name: string) => {
    const f = await fw.capturePage({ x: 0, y: 0, width: 1440, height: 200 });
    writeFileSync(`${out}-${name}-frame.png`, f.toPNG());
    const v = page(); if (v) { const r = v.getBounds(); writeFileSync(`${out}-${name}-page.png`, (await v.webContents.capturePage({ x: 0, y: 0, width: r.width, height: Math.max(1, 200 - r.y) })).toPNG()); console.log(`PAGE ${name} ${r.x} ${r.y}`); }
  };
  const look = async (name: string, css: string, js = '', secret = false) => {
    if (secret) await fw.executeJavaScript(`document.documentElement.classList.add('secret'); 1`);
    const key = css ? await fw.insertCSS(css) : null;
    if (js) await fw.executeJavaScript(js);
    await wait(900);
    await fw.executeJavaScript(`window.dispatchEvent(new Event('resize')); 1`);
    await wait(700);
    await shot(name);
    if (key) await fw.removeInsertedCSS(key);
    await fw.executeJavaScript(UNLAY_JS + `; document.documentElement.classList.remove('secret'); 1`);
    await wait(300);
  };
  await look('now', '');
  await look('plank', PLANK, LAY_JS);
  await look('night', PLANK, LAY_JS, true);
  app.exit(0);
});
