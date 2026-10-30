// Sheet 108 (2026-10-30): the engine card on his UPDATE key, the castLabs sign-in key and the "behind Chrome" line,
// drawn by the REAL tray (sheet 35) with the new lines put in for the sheet only. Writes one picture per state.
//
// Run: npx electron test/electron/engine-card-shot.ts <out dir>
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
  const b = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'engshot-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') });
  wireBrowser(() => b);
  b.open('about:blank'); await wait(2500);
  const w = (b as any).win as BrowserWindow;
  const js = (s: string) => w.webContents.executeJavaScript(s);
  const engine = { name: "SAMARA'S ENGINE", items: [
    { text: "Chrome's newest security fixes.", note: 'castLabs 44.9.3, out 2 days ago.' },
    { text: 'Netflix and Prime keep playing in your tabs.', note: 'Signed for video on this Mac.' },
  ] };
  const shot = async (file: string) => {
    await wait(250);
    const r = await js(`(() => { const x = document.getElementById('uptray').getBoundingClientRect(); return { x: Math.max(0, x.left - 20), y: Math.max(0, x.top - 70), width: x.width + 40, height: x.height + 90 }; })()`);
    const img = await w.webContents.capturePage({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) });
    writeFileSync(path.join(OUT, file), img.toPNG());
    console.log('SHOT ' + file);
  };
  // The paragraph under the lines (the tray's own .upwhy, as the Mac's Safe Storage line uses).
  const para = (html: string) => js(`(() => { const p = document.getElementById('upkc'); p.hidden = false; p.innerHTML = ${JSON.stringify(html)}; })()`);
  const open = () => js(`(() => { const t = document.getElementById('uptray'); if (t.hidden) document.getElementById('upkey').click(); })()`);

  // 1. A new engine, ready: the engine's lines, and how far behind Chrome today's engine is.
  b.setUpdate({ version: '44.9.3', since: Date.now() - 1.3 * 86_400_000, title: "Samara's engine 44.9.3", canBack: true, overnight: true, groups: [engine] });
  await wait(1200); await open(); await wait(600); await wait(2000);
  await para('Your engine today is <b>6 weeks behind</b> Chrome\'s security fixes. This one is <b>2 days</b> behind.');
  await shot('1-ready.png');

  // 2. castLabs wants him to sign in before it signs this engine for video.
  await js(`document.getElementById('upkicker').textContent = 'ONE STEP FROM YOU'`);
  await para('castLabs wants you to sign in before it signs this engine for video. Terminal opens with the sign-in typed. <b>Your password goes to castLabs only</b>, never to Samara or Aang.');
  await js(`(() => { const g = document.getElementById('upgo'); g.textContent = 'Sign in to castLabs'; })()`);
  await shot('2-signin.png');

  // 3. Terminal is open; Samara waits and carries on by itself once castLabs has his sign-in.
  await js(`document.getElementById('upkicker').textContent = 'WAITING FOR CASTLABS'`);
  await para('Finish in Terminal. Samara signs the engine by itself the moment you\'re in.');
  await js(`(() => { const g = document.getElementById('upgo'); g.textContent = 'Signing in...'; g.disabled = true; })()`);
  await shot('3-waiting.png');

  // 4. Both: Samara's own version and the engine together, one Restart now (as today).
  await js(`document.getElementById('upkicker').textContent = 'UPDATE READY'`);
  await js(`(() => { const g = document.getElementById('upgo'); g.textContent = 'Restart now'; g.disabled = false; })()`);
  b.setUpdate({ version: '1.24.0+44.9.3', since: Date.now() - 1.3 * 86_400_000, title: 'Version 1.24.0: Gojo', canBack: true, overnight: true,
    groups: [{ name: 'SAMARA', items: [{ text: 'Updates for the engine come from GitHub now, on both machines.' }] }, engine] });
  await wait(300);
  await para('Your engine today is <b>6 weeks behind</b> Chrome\'s security fixes. This one is <b>2 days</b> behind.');
  await shot('4-both.png');
  app.exit(0);
});
