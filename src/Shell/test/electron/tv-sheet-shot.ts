// Sheet 89 (2026-10-25, his asks: Stremio in Samara, sending things to his TV "yeet" from time to time, and Send to PC
// tucked into the right-click and ⋯ menus with the right-click menu organised). Samara's real list, menus and band at
// 1440 wide; the new rows and asks are laid on for the picture (not built). Plain test tabs.
// Run: STATE=<dir with a browser-tabs.json> npx electron test/electron/tv-sheet-shot.ts <out-prefix>
import { app, BrowserWindow } from 'electron';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.message ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 180_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'tv-ud-')));
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setOpacity(0); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
// The organised right-click menu: three labelled groups like the ⋯ menu's, and Close on its own.
const MENU = (secret: boolean) => `(() => {
  const m = document.getElementById('tabmenu'); if (!m) return 0;
  m.replaceChildren();
  const gh = (t) => { const p = document.createElement('div'); p.textContent = t; Object.assign(p.style, { font: '700 12px Figtree, sans-serif', color: '#FFC43C', textShadow: '1px 1px 0 #000', margin: '4px 9px 4px' }); m.append(p); };
  const item = (t, cls, tag) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; if (cls) b.className = cls; if (tag) b.append(Object.assign(document.createElement('i'), { textContent: tag })); m.append(b); return b; };
  const sep = () => m.append(Object.assign(document.createElement('div'), { className: 'sep' }));
  gh('THIS TAB'); item('Reload'); item('Mute'); sep();
  gh('TRAIL'); item('Move to a trail', 'exp', '▸'); sep();
  gh('SEND'); ${secret ? '' : "item('Pop out');"} item('Open in new window');
  item('Send to TV', 'exp open', '▸'); item('The whole window', 'sub'); item('Just the video', 'sub');
  ${secret ? '' : "item('Send to PC'); item('Open on PC');"} sep();
  item('Close');
  // the secret window's menu at night, as its ⋯ menu is (sheet 87)
  if (${secret}) Object.assign(m.style, { background: 'linear-gradient(rgba(4,8,30,.6),rgba(4,8,30,.66)),url(art/browser/tray.png) 0 0/128px 256px', boxShadow: 'inset 0 0 0 4px #1c2346,0 14px 30px rgba(0,0,0,.6)' });
  if (${secret}) m.querySelectorAll('div:not(.sep)').forEach((d) => { d.style.color = '#d6e2ff'; });
  const r = m.getBoundingClientRect(); m.style.top = Math.max(4, Math.min(parseInt(m.style.top) || 0, innerHeight - r.height - 4)) + 'px';
  return m.children.length; })()`;
app.whenReady().then(async () => {
  const out = process.argv[process.argv.length - 1];
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const base = { origin: pages.origin, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs') };
  const dir = mkdtempSync(path.join(os.tmpdir(), 'tv-s-'));
  copyFileSync(path.join(process.env.STATE!, 'browser-tabs.json'), path.join(dir, 'browser-tabs.json'));
  const b: any = new AangBrowser({ ...base, stateDir: dir });
  wireBrowser(() => b);
  b.marks.push({ title: 'Stremio', url: 'https://web.stremio.com/', folder: '' });
  await b.fillMarkIcons().catch(() => {});
  b.open();
  for (let i = 0; i < 100 && !b.win; i++) await wait(150);
  b.win.setContentSize(1440, 900);
  await wait(6000);
  const fw = b.win.webContents;
  const frame = async (name: string, h = 420) => {
    writeFileSync(`${out}-${name}.png`, (await fw.capturePage({ x: 0, y: 0, width: 1440, height: h })).toPNG());
    const v = b.cur()?.view; if (v) { const r = v.getBounds(); writeFileSync(`${out}-${name}-page.png`, (await v.webContents.capturePage({ x: 0, y: 0, width: r.width, height: h - r.y })).toPNG()); console.log(`PAGE ${name} ${r.x} ${r.y}`); }
  };
  // 1 Stremio on the bookmarks shelf, and 2 the organised right-click menu, in the real list
  await fw.executeJavaScript(`document.getElementById('drawerkey').click(); 1`);
  await wait(3500);
  const tw = b.trayV.webContents;
  writeFileSync(`${out}-shelf.png`, (await tw.capturePage()).toPNG());
  await tw.executeJavaScript(`(() => { const r = document.querySelectorAll('#tabs .tp')[1]; const k = r.getBoundingClientRect(); r.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: k.x + 120, clientY: k.y + 20 })); return 1; })()`);
  await wait(400);
  console.log('MENU ' + await tw.executeJavaScript(MENU(false)));
  await wait(300);
  writeFileSync(`${out}-tabmenu.png`, (await tw.capturePage()).toPNG());
  await tw.executeJavaScript(MENU(true));
  await tw.executeJavaScript(`document.documentElement.classList.add('secret'); 1`);
  await wait(300);
  writeFileSync(`${out}-tabmenu-secret.png`, (await tw.capturePage()).toPNG());
  await tw.executeJavaScript(`document.documentElement.classList.remove('secret'); document.getElementById('tabmenu')?.remove(); 1`);
  b.tray(false); await wait(800);
  // 3 the ⋯ menu: Send to TV and Send to PC under THIS PAGE
  await fw.executeJavaScript(`(() => { document.getElementById('menukey').click();
    const after = document.getElementById('m-print'); const mk = (t, tag) => { const r = after.cloneNode(true); r.id = ''; r.querySelector('span').textContent = t; const k = r.querySelector('kbd'); if (k) k.textContent = tag || ''; return r; };
    after.after(mk('Send to TV', '▸'), mk('Send to PC', '')); return 1; })()`);
  await wait(600);
  await frame('menu', 620);
  await fw.executeJavaScript(`document.getElementById('menukey').click(); 1`);
  await wait(500);
  // 4 the whole window: yeet is not a second screen yet (the Mac's own setting, one time)
  const ask = (q: string, m: string, yes: string, no: string) => `(() => { const c = document.getElementById('askchip'); document.getElementById('askq').textContent = ${JSON.stringify(q)};
    document.getElementById('askm').textContent = ${JSON.stringify(m)}; document.getElementById('askyes').firstChild.textContent = ${JSON.stringify(yes)};
    document.getElementById('askno').firstChild.textContent = ${JSON.stringify(no)}; c.hidden = false; return 1; })()`;
  await fw.executeJavaScript(ask('Show this window on yeet?', 'Your Mac needs yeet as a second screen first: in Displays, add yeet and pick Extended display. Samara does the rest from then on.', 'Open Displays', 'Not now'));
  await wait(500);
  await frame('ask-airplay');
  // 5 a video playing on yeet: the band says so, and stops or brings it back
  await fw.executeJavaScript(ask('Playing on yeet', 'Pixel art tutorial for beginners · YouTube', 'Bring it back', 'Stop'));
  await wait(500);
  await frame('playing');
  app.exit(0);
});
