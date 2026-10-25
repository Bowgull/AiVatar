// Sheet 88 (2026-10-25, his "it starts giving me what it thinks i want" and "is this purple address bar far too large"):
// Samara's real band and suggestion list, at 1440 wide. The search guesses are Brave's real answers for "pixel"
// (search.brave.com/api/suggest, fetched 2026-10-25); the history line is a plain test page. Not built: drawn in.
// Run: npx electron test/electron/address-sheet-shot.ts <out-prefix>
import { app, BrowserWindow } from 'electron';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.message ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 150_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'as-ud-')));
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setOpacity(0); this.showInactive(); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const GUESSES = ['pixel 11', 'pixel art', 'pixel watch', 'pixel 10'];
app.whenReady().then(async () => {
  const out = process.argv[process.argv.length - 1];
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const b: any = new AangBrowser({ origin: pages.origin, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs'), stateDir: mkdtempSync(path.join(os.tmpdir(), 'as-s-')) });
  wireBrowser(() => b);
  b.visits.add('https://en.wikipedia.org/wiki/Pixel_art', 'Pixel art - Wikipedia');
  b.visits.add('https://www.reddit.com/', 'Reddit - The heart of the internet');
  b.open('https://search.brave.com/');
  for (let i = 0; i < 100 && !b.win; i++) await wait(150);
  b.win.setContentSize(1440, 900);
  await wait(5000);
  const fw = b.win.webContents;
  const crop = { x: 0, y: 0, width: 1440, height: 330 };
  const shot = async (name: string) => writeFileSync(`${out}-${name}.png`, (await fw.capturePage(crop)).toPNG());
  const typeIn = async (text: string) => {
    await fw.executeJavaScript(`document.getElementById('slot').click(); 1`); await wait(300); fw.focus();
    for (const k of text) { fw.sendInputEvent({ type: 'char', keyCode: k }); await wait(70); }
    await wait(900);
  };
  // 1 today
  await typeIn('pixel');
  await shot('today');
  // 2 with Brave's guesses under his own things: the list comes through Samara's real path, the guesses as their own kind
  const list = (typed: string, mine: { kind: string; title: string; url: string }[], guesses: string[]) =>
    [{ kind: 'search', title: typed, url: '' }, ...mine, ...guesses.map((g) => ({ kind: 'guess', title: g, url: 'guess:' + g }))];
  // How a guess will look (not built): the search glyph, his letters plain and the rest bold, and "Search".
  const dressGuesses = `(() => { const rows = [...document.querySelectorAll('#suggest .srow')]; const glass = rows[0].querySelector('.sg').innerHTML;
    for (const r of rows) if (r.dataset.g || r.querySelector('.su')?.textContent.startsWith('guess:')) { r.dataset.g = 1; r.querySelector('.su')?.remove(); r.querySelector('.sg').innerHTML = glass; r.querySelector('.sa').textContent = 'Search'; }
    return rows.length; })()`;
  const retype = async (text: string) => {
    await fw.executeJavaScript(`(() => { const ed = document.getElementById('edit'); ed.value = ''; ed.dispatchEvent(new Event('input')); return 1; })()`);
    await wait(200);
    for (const k of text) { fw.sendInputEvent({ type: 'char', keyCode: k }); await wait(70); }
    await wait(900);
  };
  b.suggest = () => list('pixel', [{ kind: 'history', title: 'Pixel art - Wikipedia', url: 'https://en.wikipedia.org/wiki/Pixel_art' }], GUESSES);
  await retype('pixel');
  await fw.executeJavaScript(dressGuesses);
  await wait(300);
  await shot('guesses');
  // 3 the arrow keys: the bar follows the line he is on (drawn: the bar takes the guess's words)
  for (let i = 0; i < 3; i++) { fw.sendInputEvent({ type: 'keyDown', keyCode: 'Down' }); fw.sendInputEvent({ type: 'keyUp', keyCode: 'Down' }); await wait(120); }
  await fw.executeJavaScript(dressGuesses);
  await fw.executeJavaScript(`(() => { const ed = document.getElementById('edit'); ed.value = ${JSON.stringify(GUESSES[1])}; return 1; })()`);
  await wait(300);
  await shot('arrow');
  // 4 a site he has been to, finished as he types (drawn: the rest of the address selected, as Chrome does)
  const RG = ['reddit', 'reddit nba', 'reddit news', 'redbubble'];
  b.suggest = () => list('red', [{ kind: 'history', title: 'Reddit - The heart of the internet', url: 'https://www.reddit.com/' }], RG);
  await retype('red');
  await fw.executeJavaScript(dressGuesses);
  await fw.executeJavaScript(`(() => { const ed = document.getElementById('edit'); ed.value = 'reddit.com'; ed.setSelectionRange(3, 10); const r0 = document.querySelector('#suggest .srow'); r0.querySelector('.st').textContent = 'reddit.com'; r0.querySelector('.su')?.remove(); r0.querySelector('.sa').textContent = 'Go'; return 1; })()`);
  await wait(300);
  await shot('fill');
  // 5 the bar's width: as now, centred and narrower, and narrower from the left
  fw.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); fw.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await wait(400);
  const band = { x: 0, y: 0, width: 1440, height: 90 };
  writeFileSync(`${out}-w-now.png`, (await fw.capturePage(band)).toPNG());
  for (const [k, css] of [['w-centre', '.band .slot{flex:0 1 760px !important;margin:0 auto !important}'], ['w-left', '.band .slot{flex:0 1 860px !important;margin-right:auto !important}']] as const) {
    const key = await fw.insertCSS(css);
    await wait(400);
    writeFileSync(`${out}-${k}.png`, (await fw.capturePage(band)).toPNG());
    await fw.removeInsertedCSS(key);
  }
  app.exit(0);
});
