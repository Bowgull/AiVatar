// Sheet 122 (2026-11-22, his ask: "clicking check for updates freezes the window ... we need an interaction for that"):
// what "Check for updates" shows while it works. Drawn by the REAL drop-down Samara hangs off its ... key after an
// overnight update (#updone, sheet 35's tray); only the words and the progress line are put in. One picture per state.
//
// Run (from src/Shell, hidden desktop): npx electron test/electron/sheet122-shot.ts <out dir>
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
  const src = path.join(HERE, '..', '..', 'src');
  const b = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'shot122-')), preloadPath: path.join(src, 'samarapreload.cjs'),
    tabPreloadPath: path.join(src, 'tabpreload.cjs'), settingsPreloadPath: path.join(src, 'settingspreload.cjs'), thingsPreloadPath: path.join(src, 'thingspreload.cjs') });
  wireBrowser(() => b);
  b.open('about:blank'); await wait(2500);
  const w = (b as any).win as BrowserWindow;
  const js = (s: string) => w.webContents.executeJavaScript(s);
  const shot = async (file: string) => {
    await wait(350);
    const r = await js(`(() => { const x = document.getElementById('updone').getBoundingClientRect(); return { x: Math.max(0, x.left - 30), y: 0, width: x.width + 60, height: x.bottom + 24 }; })()`);
    console.log('RECT ' + JSON.stringify(r) + ' ' + JSON.stringify(await js(`(() => { const d = document.getElementById('updone'); return { hidden: d.hidden, disp: getComputedStyle(d).display, vis: getComputedStyle(d).visibility, win: [innerWidth, innerHeight] }; })()`)));
    const img = await w.webContents.capturePage({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) });
    writeFileSync(path.join(OUT, file), img.toPNG()); console.log('SHOT ' + file);
  };
  // The drop-down, put in place under the ... key with the given words. `bar`: 0..1 for the progress line, -1 for the
  // moving "working" line, null for none. `foot`: the buttons' words.
  const state = (kicker: string, name: string, line: string, bar: number | null, foot: string[]) => js(`(() => {
    const d = document.getElementById('updone');
    document.documentElement.classList.remove('floated');   // drawn in the frame itself for the picture
    d.querySelector('.uphd small').textContent = ${JSON.stringify(kicker)};
    document.getElementById('updonename').textContent = ${JSON.stringify(name)};
    const list = document.getElementById('updonelist'); list.replaceChildren();
    const p = document.createElement('p'); p.className = 'upwhy'; p.innerHTML = ${JSON.stringify(line)}; p.style.cssText = 'margin:2px 0 10px;color:#3a2a18;text-shadow:none'; for (const x of p.querySelectorAll('b')) x.style.color = '#8a4b0c';
    list.append(p);
    const bar = ${JSON.stringify(bar)};
    if (bar !== null) {
      const t = document.createElement('div');
      t.style.cssText = 'height:6px;border-radius:3px;background:rgba(58,42,24,.2);overflow:hidden;margin:0 0 6px;position:relative';
      const f = document.createElement('i');
      f.style.cssText = 'position:absolute;top:0;bottom:0;border-radius:3px;background:linear-gradient(90deg,#f0b54a,#ffd36a);box-shadow:0 0 8px rgba(255,200,90,.6);' + (bar < 0 ? 'left:30%;width:28%' : 'left:0;width:' + Math.round(bar * 100) + '%');
      t.append(f); list.append(t);
    }
    const ft = d.querySelector('.upfoot'); const keys = ${JSON.stringify(foot)};
    const [a, c] = [document.getElementById('updoneok'), document.getElementById('updonevers')];
    a.textContent = keys[0] ?? ''; a.hidden = !keys[0]; c.textContent = keys[1] ?? ''; c.hidden = !keys[1]; ft.hidden = !keys.length;
    const band = document.getElementById('band').getBoundingClientRect(), k = document.getElementById('menukey').getBoundingClientRect();
    d.style.right = Math.max(8, Math.round(band.right - k.right)) + 'px';
    d.hidden = false;
  })()`);

  await state('CHECKING FOR UPDATES', 'Samara 1.62.1', 'Looking on GitHub for a newer Samara. <b>Keep browsing</b>, this never stops your tabs.', -1, []);
  await shot('1-checking.png');
  await state('GETTING IT READY', 'Version 1.62.2: Gojo', 'Downloading. <b>4.1 of 6.6 MB</b>', 0.62, ['Hide']);
  await shot('2-downloading.png');
  await state('GETTING IT READY', 'Version 1.62.2: Gojo', "Setting it up beside the one you're using. <b>About a minute.</b>", -1, ['Hide']);
  await shot('3-setting-up.png');
  await state('UPDATE READY', 'Version 1.62.2: Gojo', "Ready to go in. It's on the <b>UPDATE</b> key too.", 1, ['Restart now', 'Later']);
  await shot('4-ready.png');
  await state("YOU'RE UP TO DATE", 'Samara 1.62.2', 'This is the newest Samara.', null, ['Got it']);
  await shot('5-up-to-date.png');
  await state('COULD NOT CHECK', 'Samara 1.62.1', 'GitHub did not answer. <b>Try again</b> in a minute.', null, ['Try again', 'Close']);
  await shot('6-could-not.png');
  app.exit(0);
});
