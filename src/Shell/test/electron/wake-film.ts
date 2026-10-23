// Waking a sleeping YouTube tab, filmed (2026-10-23, his "a really bad interaction"): what he sees in the page area
// every 250 ms after his click, on one contact sheet, with what Samara was doing at each moment.
// Run: npx electron test/electron/wake-film.ts <folder>
import { app, BrowserWindow, ipcMain, webContents } from 'electron';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 240_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(process.argv[process.argv.length - 1]);
const VIDEO = process.env.VIDEO || 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'wfilm-ud-')));
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b: any = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'wfilm-s-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') });
  wireBrowser(() => b);
  b.open(VIDEO);
  for (let i = 0; i < 100 && !b.cur()?.view; i++) await wait(200);
  const vid = b.cur().id;
  await wait(12_000);
  // He had watched a bit: 7 s in, paused by him.
  await b.cur().view.webContents.executeJavaScript(`(() => { const v = document.querySelector('video'); if (v) { v.currentTime = 7; v.pause(); } })()`).catch(() => {});
  await wait(800);
  await b.peek();
  b.newTab('https://en.wikipedia.org/wiki/Video'); await wait(6000);
  b.sleep(b.tabs.find((t: any) => t.id === vid)); b.sendTabs();
  await wait(1500);
  const frames: { ms: number; png: string; note: string }[] = [];
  let painted = 0;
  const t0 = Date.now();
  ipcMain.on('tab:painted', (e) => { const t = b.tabs.find((x: any) => x.id === vid); if (!painted && t?.view && e.sender === t.view.webContents) painted = Date.now() - t0; });
  b.lastGesture.set(vid, Date.now());
  b.activate(vid);
  const t = b.tabs.find((x: any) => x.id === vid);
  for (let i = 0; i < 24; i++) {
    const ms = Date.now() - t0;
    const curtainUp = b.curtain && !b.curtain.webContents.isDestroyed() && b.curtain.getVisible?.() !== false && b.veil?.up;
    let img = null, what = '';
    try {
      if (curtainUp) { img = await b.curtain.webContents.capturePage(); what = 'curtain (old picture)'; }
      else if (t.view && t.view.getVisible()) { img = await t.view.webContents.capturePage(); what = 'page'; }
      else { img = await b.win.webContents.capturePage(); what = 'frame only'; }
    } catch { what = 'no picture'; }
    let vs = '';
    try { vs = await t.view.webContents.executeJavaScript(`(() => { const v = document.querySelector('video'); return v ? (v.paused ? 'paused ' : 'PLAYING ') + v.currentTime.toFixed(1) + 's rs' + v.readyState : 'no video yet'; })()`); } catch { vs = '-'; }
    const note = `${(ms / 1000).toFixed(2)}s · ${what} · ${vs}${painted && ms >= painted ? ' · drawn' : ''}`;
    console.log(note);
    if (img && !img.isEmpty()) frames.push({ ms, png: img.resize({ width: 480 }).toDataURL(), note });
    await wait(250);
  }
  // One contact sheet.
  const w = new BrowserWindow({ show: false, width: 1500, height: 1200, webPreferences: { offscreen: true } });
  const html = `<body style="margin:0;background:#222;color:#eee;font:12px sans-serif;display:grid;grid-template-columns:repeat(3,490px);gap:6px;padding:6px">${frames.map((f) => `<div><img src="${f.png}" style="width:480px;display:block"><div>${f.note}</div></div>`).join('')}</body>`;
  writeFileSync(path.join(OUT, 'wake-film.html'), html);
  await w.loadFile(path.join(OUT, 'wake-film.html'));
  await wait(800);
  const h = await w.webContents.executeJavaScript('document.body.scrollHeight');
  w.setContentSize(1500, Math.min(h, 4000)); await wait(500);
  writeFileSync(path.join(OUT, 'wake-film.png'), (await w.webContents.capturePage()).toPNG());
  console.log(`first draw at ${painted} ms`);
  app.exit(0);
});
