// Sheet 89 (2026-10-25), against the real browser, with whatever TV is on the network (his "yeet" asleep is fine):
//  1 the tab's right-click menu has its groups, Send to TV, and Send to PC (not in the secret window); no Send key on rows
//  2 the ⋯ menu has Send to TV and Send to PC
//  3 The whole window with the TV not yet a second screen: the TV ask, hanging from the address bar; Not now puts it away
//  4 Just the video with the TV not answering: he is told, nothing breaks
// Run: npx electron test/electron/tv-check.ts
import { app, BrowserWindow } from 'electron';
import { mkdirSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.message ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 150_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'tc-ud-')));
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
  const base = { origin: pages.origin, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs') };
  const dir = mkdtempSync(path.join(os.tmpdir(), 'tc-s-')), sdir = path.join(dir, 'secret'); mkdirSync(sdir);
  const b: any = new AangBrowser({ ...base, stateDir: dir });
  wireBrowser(() => b);
  b.open('https://www.youtube.com/');
  for (let i = 0; i < 100 && !b.cur()?.view; i++) await wait(150);
  b.win.setContentSize(1440, 900);
  await wait(5000);
  const fw = b.win.webContents;
  const notes: string[] = []; const was = b.note.bind(b); b.note = (x: string) => { notes.push(x); return was(x); };
  // 1
  await fw.executeJavaScript(`document.getElementById('drawerkey').click(); 1`); await wait(2500);
  const tw = b.trayV.webContents;
  const menu = async () => tw.executeJavaScript(`(() => { const r = document.querySelector('#tabs .tp'); const k = r.getBoundingClientRect(); r.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: k.x + 60, clientY: k.y + 10 })); const m = document.getElementById('tabmenu'); const t = [...m.querySelectorAll('.gh, button')].map((x) => x.textContent.trim()); document.getElementById('tabmenu')?.remove(); return t; })()`);
  const items: string[] = await menu();
  const rowKeys = await tw.executeJavaScript(`document.querySelectorAll('#tabs .pip.tomac').length`);
  check('1 the right-click menu has its groups, Send to TV and Send to PC; no Send key on the rows',
    ['THIS TAB', 'TRAIL', 'SEND'].every((g) => items.includes(g)) && items.some((x) => x.startsWith('Send to TV')) && items.includes('Send to PC') && items[items.length - 1] === 'Close' && !items.some((x) => /Chrome/.test(x)) && rowKeys === 0, items.join(' | '));
  b.tray(false); await wait(700);
  // 2
  const dots = await fw.executeJavaScript(`(() => { document.getElementById('menukey').click(); const r = [...document.querySelectorAll('#menu .mrow')].filter((x) => !x.hidden && !x.closest('[hidden]')).map((x) => x.textContent.trim()); document.getElementById('menukey').click(); return r; })()`);
  check('2 the ⋯ menu has Send to TV and Send to PC', dots.some((x: string) => x.startsWith('Send to TV')) && dots.includes('Send to PC'), dots.join(' | '));
  // 3
  await b.tvAct('close');
  await b.tabAct(b.active, 'tvwindow'); await wait(4000);
  const ask = await fw.executeJavaScript(`(() => { const c = document.getElementById('tvchip'); const s = document.getElementById('slot').getBoundingClientRect(), k = c.getBoundingClientRect(); return { shown: !c.hidden, q: document.getElementById('tvq').textContent, flush: Math.abs(k.left - s.left) < 2, below: k.top >= s.bottom - 4 }; })()`);
  const onTv = screenHasTv();
  check('3 the whole window, TV not yet a second screen: the TV ask hangs from the address bar', onTv || (ask.shown && /Show this window on/.test(ask.q) && ask.flush && ask.below), JSON.stringify(ask));
  await fw.executeJavaScript(`document.getElementById('tvno').click(); 1`); await wait(600);
  check('3 Not now puts it away', !(await fw.executeJavaScript(`!document.getElementById('tvchip').hidden`)));
  // 4
  await b.tabAct(b.active, 'tvvideo'); await wait(6000);
  check('4 just the video with the TV not answering (or a page with nothing to send): he is told', notes.some((n) => /not answering|whole window|could not play/i.test(n)) || b.tv?.kind === 'video', notes.join(' | '));
  if (b.tv) await b.tvAct('stop');
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  app.exit(bad ? 1 : 0);
  function screenHasTv() { return false; }
});
