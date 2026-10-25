// Sheet 88 (his picks B and C, and the guesses), against the real browser (2026-10-25). Uses the internet (Brave's guesses).
//  1 at rest the bar is 760 wide in the middle, showing just the site's name; the band is 60 tall
//  2 clicked, it goes out to the full width with the whole address
//  3 typing: his own matches first, then at most 4 of Brave's guesses
//  4 a site he has been to is finished as he types; Enter would go there
//  5 the arrow keys put the line into the bar; Esc brings his typing back
// Run: npx electron test/electron/addressbar-check.ts
import { app, BrowserWindow } from 'electron';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.message ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'ab-ud-')));
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setOpacity(0); this.showInactive(); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (w: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${w}${d ? ' (' + d + ')' : ''}`); if (!ok) bad++; };
app.whenReady().then(async () => {
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const b: any = new AangBrowser({ origin: pages.origin, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs'), stateDir: mkdtempSync(path.join(os.tmpdir(), 'ab-s-')) });
  wireBrowser(() => b);
  b.visits.add('https://www.reddit.com/', 'Reddit - The heart of the internet');
  b.visits.add('https://en.wikipedia.org/wiki/Pixel_art', 'Pixel art - Wikipedia');
  b.open('https://en.wikipedia.org/wiki/Pixel_art');
  for (let i = 0; i < 100 && !b.win; i++) await wait(150);
  b.win.setContentSize(1440, 900);
  await wait(5000);
  const fw = b.win.webContents;
  const js = (c: string) => fw.executeJavaScript(c);
  const box = (id: string) => js(`(() => { const r = document.getElementById('${id}').getBoundingClientRect(); return [Math.round(r.x), Math.round(r.width), Math.round(r.height)]; })()`);
  // 1
  const [sx, sw] = await box('slot'), [, , bh] = await box('band'), shown = await js(`document.getElementById('url').textContent`);
  check('1 at rest: 760 wide in the middle, the site\'s name only, a 60 tall band', sw === 760 && Math.abs(sx + sw / 2 - 720) < 60 && shown === 'en.wikipedia.org' && bh === 60, `x ${sx} w ${sw} band ${bh} shows "${shown}"`);
  // 2
  await js(`document.getElementById('slot').click(); 1`); await wait(500); fw.focus();
  const [, ew] = await box('slot'), full = await js(`document.getElementById('edit').value`);
  check('2 clicked: out to the full width with the whole address', ew > 1000 && full === 'https://en.wikipedia.org/wiki/Pixel_art', `w ${ew} "${full}"`);
  const type = async (text: string) => { await js(`(() => { const e = document.getElementById('edit'); e.value = ''; return 1; })()`); for (const k of text) { fw.sendInputEvent({ type: 'char', keyCode: k }); await wait(90); } await wait(2200); };
  const rows = () => js(`[...document.querySelectorAll('#suggest .srow')].map((r) => (r.querySelector('.sa')?.textContent ?? '') + ':' + r.querySelector('.st').textContent)`);
  // 3
  await type('pixel');
  const r3: string[] = await rows();
  if (process.env.SHOT) (await import('node:fs')).writeFileSync(process.env.SHOT, (await fw.capturePage({ x: 0, y: 0, width: 1440, height: 330 })).toPNG());
  const firstGuess = r3.findIndex((x) => x.startsWith('Search:') && x !== 'Search:pixel');
  const lastMine = r3.map((x, i) => (i > 0 && !x.startsWith('Search:') ? i : -1)).reduce((a, c) => Math.max(a, c), -1);
  check('3 his own matches first, then at most 4 of Brave\'s guesses', firstGuess > lastMine && lastMine > 0 && r3.length - firstGuess <= 4 && r3.length - firstGuess >= 1, r3.join(' | '));
  // 4
  await type('red');
  const v4 = await js(`(() => { const e = document.getElementById('edit'); return [e.value, e.selectionStart, e.selectionEnd]; })()`);
  const r4: string[] = await rows();
  check('4 a site he has been to is finished as he types', v4[0] === 'reddit.com' && v4[1] === 3 && v4[2] === 10 && r4[0] === 'Go:reddit.com', JSON.stringify(v4) + ' ' + r4[0]);
  // 5
  await type('pixel');
  fw.sendInputEvent({ type: 'keyDown', keyCode: 'Down' }); fw.sendInputEvent({ type: 'keyUp', keyCode: 'Down' }); await wait(200);
  const v5 = await js(`document.getElementById('edit').value`);
  fw.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); fw.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' }); await wait(200);
  const v5b = await js(`[document.getElementById('edit').value, document.getElementById('edit').hidden]`);
  check('5 the arrow puts the line into the bar; Esc brings his typing back', v5 !== 'pixel' && v5b[0] === 'pixel' && v5b[1] === false, `"${v5}" then "${v5b[0]}"`);
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  app.exit(bad ? 1 : 0);
});
