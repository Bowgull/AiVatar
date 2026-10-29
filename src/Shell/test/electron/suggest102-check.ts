// Sheet 102 as built (2026-10-29): the address bar's list on its own layer, steady, bigger, remembering his searches.
// Samara's real browser at his screen's width (1920), see-through on his SECOND monitor, never focused (his rule).
// Run: npx electron test/electron/suggest102-check.ts <shots folder>
import { app, BrowserWindow, screen } from 'electron';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 180_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 's102-ud-')));
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.on('window-all-closed', () => {});
// His rule (2026-10-29): never his main monitor or his keyboard.
const away = () => { const d = screen.getAllDisplays().find((x) => x.id !== screen.getPrimaryDisplay().id); return d ? d.bounds : { x: -6000, y: 100 }; };
BrowserWindow.prototype.show = function (this: BrowserWindow) { const b = away(); this.setOpacity(0); this.setPosition(b.x + 20, b.y + 20); this.setFocusable(false); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
BrowserWindow.prototype.moveTop = function () {};
BrowserWindow.prototype.setAlwaysOnTop = function () {};
app.focus = () => {};
app.dock?.hide();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (name: string, ok: boolean, note = '') => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  -- ' + note : ''}`); };
const GUESS: Record<string, string[]> = { p: ['pinterest', 'paypal'], pi: ['pizza near me', 'pixel 10'], pix: ['pixel 10', 'pixel art', 'pixabay', 'pixel watch'], pixe: ['pixel 10', 'pixel art', 'pixel watch', 'pixel 11'], pixel: ['pixel 11', 'pixel art', 'pixel watch', 'pixel 10'] };
app.whenReady().then(async () => {
  const OUT = process.argv[process.argv.length - 1];
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const b: any = new AangBrowser({ origin: pages.origin, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs'), stateDir: mkdtempSync(path.join(os.tmpdir(), 's102-s-')) });
  wireBrowser(() => b);
  const day = 86_400_000, now = Date.now();
  const seed = (url: string, title: string, ago: number) => b.visits.list.push({ url, title, at: now - ago });
  seed('https://search.brave.com/search?q=valheim+ashlands+map', 'valheim ashlands map - Brave Search', 3 * day);
  seed('https://www.reddit.com/r/PixelArt/', 'r/PixelArt', 2 * day);
  seed('https://search.brave.com/search?q=pixel+art+tutorial', 'pixel art tutorial - Brave Search', 2 * day);
  seed('https://search.brave.com/search?q=pixel+art+tutorial', 'pixel art tutorial - Brave Search', 1 * day);
  seed('https://en.wikipedia.org/wiki/Pixel_art', 'Pixel art - Wikipedia', 1 * day);
  seed('https://www.reddit.com/', 'Reddit - The heart of the internet', 0.5 * day);
  seed('https://search.brave.com/search?q=weather+tomorrow', 'weather tomorrow - Brave Search', 0.2 * day);
  let shots = 0;
  const shotOf = b.shotOf.bind(b); b.shotOf = async (t: unknown) => { shots++; return shotOf(t); };
  b.guesses = async (text: string) => { await wait(150 + Math.random() * 150); return GUESS[text.trim()] ?? []; };
  b.open('https://en.wikipedia.org/wiki/Pixel_art');
  for (let i = 0; i < 100 && !b.win; i++) await wait(150);
  b.win.setContentSize(1920, 1040);
  await wait(6000);
  const fw = b.win.webContents;
  const js = (s: string) => fw.executeJavaScript(s);
  const layer = () => b.pane.sugV;
  const lay = (s: string) => layer().webContents.executeJavaScript(s);
  // One picture of the window as he sees it: the page, the frame over it, and the list's layer over both.
  const picture = async (name: string, h = 520) => {
    const parts: { png: string; x: number; y: number }[] = [];
    const t = b.cur(); if (t?.view) { const vb = t.view.getBounds(); parts.push({ png: (await t.view.webContents.capturePage()).toDataURL(), x: vb.x, y: vb.y }); }
    parts.push({ png: (await fw.capturePage()).toDataURL(), x: 0, y: 0 });
    const v = layer(); if (v?.getVisible()) { const vb = v.getBounds(); parts.push({ png: (await v.webContents.capturePage()).toDataURL(), x: vb.x, y: vb.y }); }
    const url = await js(`(async () => { const c = document.createElement('canvas'); c.width = 1920; c.height = ${h}; const g = c.getContext('2d');
      for (const p of ${JSON.stringify(parts)}) { const i = new Image(); i.src = p.png; await i.decode(); g.drawImage(i, p.x, p.y, i.width / devicePixelRatio, i.height / devicePixelRatio); }
      return c.toDataURL('image/png'); })()`);
    writeFileSync(path.join(OUT, name), Buffer.from(String(url).split(',')[1]!, 'base64'));
  };
  const type = async (k: string) => js(`(() => { const e = document.getElementById('edit'); e.setRangeText(${JSON.stringify(k)}, e.selectionStart, e.selectionEnd, 'end'); e.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: ${JSON.stringify(k)} })); return 1; })()`);
  const key = async (k: string, shift = false) => js(`document.getElementById('edit').dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, shiftKey: ${shift}, bubbles: true, cancelable: true })); 1`);

  // 1 the bar at rest
  const restW = await js(`Math.round(document.getElementById('slot').getBoundingClientRect().width)`);
  check('at rest the bar is 1000 wide', restW === 1000, String(restW));
  await picture('rest.png', 90);

  // 2 click in: his last searches, then his sites, at once, with no picture of the page taken
  await js(`(() => { document.getElementById('slot').click(); document.getElementById('edit').focus(); return 1; })()`);
  await wait(600);
  const editW = await js(`Math.round(document.getElementById('slot').getBoundingClientRect().width)`);
  check('while typing the bar is 1280 wide', editW === 1280, String(editW));
  const z = JSON.parse(await lay(`JSON.stringify([...document.querySelectorAll('.srow:not(.hold)')].map((r) => [r.querySelector('.st').textContent, r.querySelector('.sa').textContent]))`));
  console.log(JSON.stringify(z));
  check('a click shows his last 3 searches, newest first, then his top sites', z.length >= 4 && z[0][0] === 'weather tomorrow' && z[1][0] === 'pixel art tutorial' && z[2][0] === 'valheim ashlands map' && z[3][1] === 'Open', z.map((x: string[]) => x[0]).join(' | '));
  check('nothing is picked before he moves, so Enter goes where the bar says', (await lay(`document.querySelectorAll('.srow.on').length`)) === 0);
  check('the layer is exactly as wide as the bar', layer().getBounds().width === 1280, JSON.stringify(layer().getBounds()));
  await picture('zero.png');

  // 3 typing "pixel" at a steady pace: the list never gets shorter, its first line never moves, no page picture
  const heights: number[] = [], firsts: string[] = [];
  const watch = setInterval(() => { const v = layer(); if (v?.getVisible()) heights.push(v.getBounds().height); }, 8);
  for (const k of 'pixel') {
    await type(k); await wait(60);
    firsts.push(await lay(`document.querySelector('.srow .st')?.textContent ?? ''`));
    await wait(60);
  }
  await wait(900);
  clearInterval(watch);
  const drops = heights.filter((h, i) => i > 0 && h < heights[i - 1]!).length;
  const typedAt = heights.findIndex((h, i) => i > 0 && h !== heights[0]);
  const grows = heights.slice(Math.max(0, typedAt)).filter((h, i, a) => i > 0 && h !== a[i - 1]).length;
  const atP = heights.findIndex((h) => h > 0);
  check('the list never gets shorter while he types', drops === 0, `${heights.length} samples, ${Math.min(...heights.slice(atP))}..${Math.max(...heights)} px`);
  check('from his first letter it opens at its full size and stays still', grows === 0, `${grows} changes after the first letter`);
  check('the first line is always what he typed', firsts.every((f, i) => f === 'pixel'.slice(0, i + 1)), firsts.join(','));
  check('no still picture of the page was taken', shots === 0 && !b.drawerOpen, `${shots} pictures`);
  const t = JSON.parse(await lay(`JSON.stringify([...document.querySelectorAll('.srow:not(.hold)')].map((r) => [r.querySelector('.st').textContent, r.querySelector('.sg img') ? 'icon' : 'glyph']))`));
  console.log(JSON.stringify(t));
  check('his past search is one line with his words, never a "- Brave Search" page', t.some((x: string[]) => x[0] === 'pixel art tutorial') && !t.some((x: string[]) => /Brave Search/.test(x[0])));
  check('the engine\'s guesses come under his own lines', t.findIndex((x: string[]) => x[0] === 'pixel 11') > t.findIndex((x: string[]) => x[0] === 'Pixel art - Wikipedia'));
  await picture('typing.png');

  // 4 arrow down to his past search, then Shift+Delete forgets it everywhere
  await key('ArrowDown'); await wait(150);
  const onPast = await js(`document.getElementById('edit').value`);
  check('Down puts the line he is on into the bar', onPast === 'pixel art tutorial', onPast);
  await wait(200);
  const markY = await lay(`document.getElementById('mark').style.transform`);
  check('the gold marker sits on that line', /translateY\(\d+px\)/.test(markY) && !markY.includes('(0px)'), markY);
  await key('Delete', true); await wait(300);
  check('Shift+Delete forgets that search from his History', !b.visits.list.some((v: any) => v.url.includes('pixel+art+tutorial')));
  const after = JSON.parse(await lay(`JSON.stringify([...document.querySelectorAll('.srow:not(.hold)')].map((r) => r.querySelector('.st').textContent))`));
  check('and the line goes from the list', !after.includes('pixel art tutorial'), after.join(' | '));

  // 5 a click on a line in the layer opens it
  const wiki = after.indexOf('Pixel art - Wikipedia');
  const tabsBefore = b.tabs.length;
  await lay(`(() => { const r = [...document.querySelectorAll('.srow')].find((x) => x.querySelector('.st').textContent === 'Pixel art - Wikipedia'); r.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); return 1; })()`);
  await wait(600);
  check('a click on a line in the list opens it, and the list goes', wiki >= 0 && !layer().getVisible() && b.tabs.length === tabsBefore && (await js(`document.getElementById('edit').hidden`)) === true);

  // 5b a site he has been to is finished as he types (sheet 88): "red" becomes reddit.com, the rest selected
  await js(`(() => { document.getElementById('slot').click(); document.getElementById('edit').focus(); return 1; })()`);
  await wait(400);
  for (const k of 'red') { await type(k); await wait(80); }
  await wait(400);
  const fill = await js(`(() => { const e = document.getElementById('edit'); return [e.value, e.selectionStart, e.selectionEnd]; })()`);
  check('"red" is finished to reddit.com with the rest selected', fill[0] === 'reddit.com' && fill[1] === 3 && fill[2] === 10, JSON.stringify(fill));
  await key('Escape'); await wait(50); await key('Escape'); await wait(300);

  // 6 Esc closes
  await js(`(() => { document.getElementById('slot').click(); document.getElementById('edit').focus(); return 1; })()`);
  await wait(400); await type('r'); await wait(500);
  check('the list opens again on the next click', layer().getVisible());
  await key('Escape'); await wait(50); await key('Escape'); await wait(200);
  check('Esc twice puts it away', !layer().getVisible());
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  setTimeout(() => app.exit(bad ? 1 : 0), 300);
});
