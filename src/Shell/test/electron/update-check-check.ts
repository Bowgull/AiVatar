// Sheet 122 (his pick, 2026-11-22): "Check for updates" while it works, in a real Samara window. Each step the update
// engine reports (setChecking) is drawn in the drop-down under the ... key with the words, line and keys sheet 122
// shows; Hide keeps it closed while it works and the ending still shows; closing an ending tells Samara it is done.
// Writes a picture per state into <out dir> when one is given.
//
// Run (from src/Shell, hidden desktop): npx electron test/electron/update-check-check.ts [out dir]
import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { AangBrowser } from '../../src/browser.ts';
import { wireBrowser } from '../../src/browseripc.ts';

setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.on('window-all-closed', () => { /* the check decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv.length > 2 && !process.argv.at(-1)!.endsWith('.ts') ? process.argv.at(-1)! : '';
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* not in a check */ };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d : ''}`); if (!ok) bad++; };

app.whenReady().then(async () => {
  if (OUT) mkdirSync(OUT, { recursive: true });
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const src = path.join(HERE, '..', '..', 'src');
  const b: any = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'upcheck-')), preloadPath: path.join(src, 'samarapreload.cjs'),
    tabPreloadPath: path.join(src, 'tabpreload.cjs'), settingsPreloadPath: path.join(src, 'settingspreload.cjs'), thingsPreloadPath: path.join(src, 'thingspreload.cjs') } as any);
  wireBrowser(() => b);
  const acts: string[] = [];
  ipcMain.on('browser:updateact', (_e, a) => acts.push(String(a?.act ?? '')));
  b.open('about:blank'); await wait(2500);
  const w = b.win as BrowserWindow;
  const js = (s: string) => w.webContents.executeJavaScript(s);
  const read = () => js(`(() => { const d = document.getElementById('upcheck'), k = (id) => { const e = document.getElementById(id); return e.hidden ? '' : e.textContent; };
    return { shown: !d.hidden, kick: document.getElementById('upckick').textContent, name: document.getElementById('upcname').textContent, line: document.getElementById('upcline').textContent,
      bar: document.getElementById('upcbar').hidden ? 'none' : document.getElementById('upcbar').classList.contains('busy') ? 'busy' : document.getElementById('upcbar').querySelector('i').style.width,
      a: k('upca'), b: k('upcb') }; })()`);
  // The picture is taken from the panel layer when it is up (that is where Samara draws it), else from the frame.
  const shot = async (file: string) => {
    await wait(300);
    const fv = b.pane?.floatV, layer = fv && !fv.webContents.isDestroyed() && fv.getVisible() ? fv.webContents : null;
    const wc = layer ?? w.webContents;
    const r = await wc.executeJavaScript(`(() => { const d = document.getElementById('upcheck'); const x = d.getBoundingClientRect(); return { shown: !d.hidden && getComputedStyle(d).display !== 'none' && getComputedStyle(d).visibility !== 'hidden', x: Math.max(0, x.left - 30), width: x.width + 60, height: x.bottom + 24 }; })()`);
    if (file.startsWith('1-') || file.startsWith('2-')) check(`drawn where he sees it (${layer ? 'panel layer' : 'frame'}): ${file}`, r.shown && r.width > 200, JSON.stringify(r));
    if (!OUT) return;
    // (a layer cannot be pictured on the hidden desktop: the frame's own copy, the same page, is pictured instead)
    const f = await js(`(() => { document.documentElement.classList.remove('floated'); const x = document.getElementById('upcheck').getBoundingClientRect(); return { x: Math.max(0, x.left - 30), width: x.width + 60, height: x.bottom + 24 }; })()`);
    await wait(150);
    writeFileSync(path.join(OUT, file), (await w.webContents.capturePage({ x: Math.round(f.x), y: 0, width: Math.round(f.width), height: Math.round(f.height) })).toPNG());
    if (layer) await js(`document.documentElement.classList.add('floated'), true`);
  };
  const step = async (c: object | null) => { b.setChecking(c ? { at: Date.now(), ...c } : null); await wait(400); return read(); };
  const MB = 1048576;

  let s = await step({ stage: 'checking', version: '1.62.1' });
  check('checking: shown under the ... key', s.shown && s.kick === 'CHECKING FOR UPDATES' && s.name === 'Samara 1.62.1' && s.bar === 'busy' && !s.a, JSON.stringify(s));
  await shot('1-checking.png');
  s = await step({ stage: 'download', version: '1.62.2', title: 'Version 1.62.2: Gojo', got: 4.1 * MB, total: 6.6 * MB });
  check('downloading: a real count and a filling line', s.kick === 'GETTING IT READY' && s.name === 'Version 1.62.2: Gojo' && s.line.includes('4.1 of 6.6 MB') && s.bar === '62%' && s.a === 'Hide', JSON.stringify(s));
  await shot('2-downloading.png');
  s = await step({ stage: 'setup', version: '1.62.2', title: 'Version 1.62.2: Gojo' });
  check('setting up', s.line.startsWith('Setting it up') && s.bar === 'busy' && s.a === 'Hide', JSON.stringify(s));
  await shot('3-setting-up.png');

  // Hide while it works: stays closed through the rest of the work, and the ending still shows
  await js(`document.getElementById('upca').click(), true`); await wait(200);
  s = await read();
  check('Hide closes it', !s.shown, JSON.stringify(s));
  s = await step({ stage: 'setup', version: '1.62.2', title: 'Version 1.62.2: Gojo' });
  check('hidden while it still works', !s.shown);
  check('Hide is not the end of it (Samara is not told)', !acts.includes('checkdone'), acts.join(','));
  s = await step({ stage: 'ready', version: '1.62.2', title: 'Version 1.62.2: Gojo' });
  check('ready: shows again, Restart now and Later', s.shown && s.kick === 'UPDATE READY' && s.bar === '100%' && s.a === 'Restart now' && s.b === 'Later', JSON.stringify(s));
  await shot('4-ready.png');
  await js(`document.getElementById('upcb').click(), true`); await wait(300);
  check('Later closes it and tells Samara it is done', !(await read()).shown && acts.includes('checkdone'), acts.join(','));

  s = await step({ stage: 'none', version: '1.62.2' });
  check("up to date", s.shown && s.kick === "YOU'RE UP TO DATE" && s.name === 'Samara 1.62.2' && s.line === 'This is the newest Samara.' && s.bar === 'none' && s.a === 'Got it' && !s.b, JSON.stringify(s));
  await shot('5-up-to-date.png');
  s = await step({ stage: 'error', version: '1.62.1' });
  check('could not check: Try again and Close', s.kick === 'COULD NOT CHECK' && s.a === 'Try again' && s.b === 'Close', JSON.stringify(s));
  await shot('6-could-not.png');
  acts.length = 0;
  await js(`document.getElementById('upca').click(), true`); await wait(300);
  check('Try again checks again', acts.includes('check'), acts.join(','));
  s = await step(null);
  check('gone when Samara clears it', !s.shown);

  // the menu's own line starts it
  acts.length = 0;
  await js(`document.getElementById('m-updates').click(), true`); await wait(300);
  check('Check for updates in the ... menu asks Samara to check', acts.includes('check'), acts.join(','));

  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  pages.close?.();
  app.exit(bad ? 1 : 0);
});
