// Sheet 114 (2026-10-31, his pick "Yes, mock it up"): the UPDATE key stays while a newer version gets ready. Today a
// newer release throws the ready one away and the key is gone until the newer one is built (macsource.ts MacStage:
// key() changes, ready() is false until build() ends). Drawn by the REAL key and tray (sheet 35); only the new words
// are put in for the sheet. Writes one picture per state.
//
// Run: perl -e 'alarm 120; exec @ARGV' node_modules/electron/dist/Electron.app/Contents/MacOS/Electron test/electron/sheet114-shot.ts <out dir>
import { app, BrowserWindow, screen } from 'electron';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { AangBrowser } from '../../src/browser.ts';
import { wireBrowser } from '../../src/browseripc.ts';

setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.on('window-all-closed', () => { /* the shot decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv.at(-1)!;
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* not in a shot */ };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  mkdirSync(OUT, { recursive: true });
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'shot114-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') });
  wireBrowser(() => b);
  b.open('about:blank'); await wait(2500);
  const w = (b as any).win as BrowserWindow;
  const js = (s: string) => w.webContents.executeJavaScript(s);
  const keyBox = () => js(`(() => { const k = document.getElementById('upkey').getBoundingClientRect(); return { x: k.left, y: k.top, width: k.width, height: k.height }; })()`);
  // The key with the band around it, from where the key sits when it shows (the same crop when it is gone).
  let at = { x: 0, y: 0, width: 0, height: 0 };
  const keyShot = async (file: string) => {
    await wait(300);
    const img = await w.webContents.capturePage({ x: Math.max(0, Math.round(at.x - 160)), y: Math.max(0, Math.round(at.y - 14)), width: Math.round(at.width + 200), height: Math.round(at.height + 28) });
    writeFileSync(path.join(OUT, file), img.toPNG()); console.log('SHOT ' + file);
  };
  const trayShot = async (file: string) => {
    await wait(300);
    const r = await js(`(() => { const x = document.getElementById('uptray').getBoundingClientRect(); return { x: Math.max(0, x.left - 20), y: Math.max(0, x.top - 70), width: x.width + 40, height: x.height + 90 }; })()`);
    const img = await w.webContents.capturePage({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) });
    writeFileSync(path.join(OUT, file), img.toPNG()); console.log('SHOT ' + file);
  };
  const para = (html: string) => js(`(() => { const p = document.getElementById('upkc'); p.hidden = false; p.innerHTML = ${JSON.stringify(html)}; })()`);
  const open = () => js(`(() => { const t = document.getElementById('uptray'); if (t.hidden) document.getElementById('upkey').click(); })()`);
  const v1270 = { version: '1.27.0', since: Date.now() - 3 * 3_600_000, title: 'Version 1.27.0: Gojo', canBack: true, overnight: true,
    groups: [{ name: 'SAMARA', items: [{ text: 'Ask Claude about anything you pick on a page.' }, { text: 'Take over and hand back a tab Claude is using.' }] }] };

  // 1. Today, before: 1.27.0 is ready and the key shows.
  b.setUpdate(v1270); await wait(1200);
  at = await keyBox();
  await keyShot('1-key-ready.png');
  // 2. Today, after: 1.27.1 came out, the ready one is thrown away and the key is gone while 1.27.1 gets ready.
  b.setUpdate(null); await wait(900);
  await keyShot('2-key-gone.png');
  // 3. Proposed: the key stays, the tray says a newer one is on its way, Restart now still puts in 1.27.0.
  b.setUpdate(v1270); await wait(1200);
  await open(); await wait(1500);
  await para('<b>1.27.1 is getting ready</b> behind this one. Restart now puts in 1.27.0, and 1.27.1 comes to this key when it\'s ready.');
  await trayShot('3a-tray-restart-now.png');
  // 4. Option B: the key stays, Restart now waits for 1.27.1 and puts both in together.
  await para('<b>1.27.1 is getting ready.</b> Press Restart now and Samara waits for it, then puts in the newest. You can keep browsing.');
  await js(`(() => { const g = document.getElementById('upgo'); g.textContent = 'Restart when ready'; })()`);
  await trayShot('3b-tray-wait.png');
  // 5. Built (his pick A): the same line from the real card (`coming`), nothing put in by hand. Then 1.27.1 is ready:
  // the line goes and the Keychain note is back.
  let bad = 0;
  const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d : ''}`); if (!ok) bad++; };
  await js(`(() => { document.getElementById('upgo').textContent = 'Restart now'; })()`);
  b.setUpdate({ ...v1270, version: '1.26.9' }); await wait(600);
  b.setUpdate({ ...v1270, coming: { next: '1.27.1', now: '1.27.0' } }); await wait(900);
  const line = await js(`document.getElementById('upkc').innerHTML`);
  check('the line, as sheet 114 shows it', line === "<b>1.27.1 is getting ready</b> behind this one. Restart now puts in 1.27.0, and 1.27.1 comes to this key when it's ready.", line);
  check('the line shows', await js(`!document.getElementById('upkc').hidden`) === true);
  check('the key stays', await js(`!document.getElementById('upkey').classList.contains('away')`) === true);
  check('Restart now', await js(`document.getElementById('upgo').textContent`) === 'Restart now');
  await trayShot('4-built-a.png');
  b.setUpdate({ ...v1270, version: '1.27.1', title: 'Version 1.27.1: Gojo' }); await wait(900);
  check('ready: the line goes, the Keychain note is back', /Aang Safe Storage/.test(await js(`document.getElementById('upkc').innerHTML`)));
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  app.exit(bad ? 1 : 0);
});
