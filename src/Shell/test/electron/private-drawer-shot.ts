// Sheet 87 (2026-10-25, his "I should go to open my tabs and get prompted on screen for my pin"): Samara's REAL tab list
// and frame in a private window (night wood, the mask in the address), with the hidden tabs as a third panel in the list,
// locked and then open. Plain test tabs, never his. Pictures for the sheet: frame, list locked, list open.
// Run: STATE=<dir with a browser-tabs.json> npx electron test/electron/private-drawer-shot.ts <out-prefix>
import { app, BrowserWindow } from 'electron';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 150_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'pds-ud-')));
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setOpacity(0); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
// The night, set on elements (Samara's pages allow no added style sheets), and Samara's masquerade (sheet 87).
const NIGHT = `(() => {
  const night = 'linear-gradient(rgba(10,20,60,.6),rgba(10,20,60,.6))';
  const tint = (sel) => document.querySelectorAll(sel).forEach((e) => { const cs = getComputedStyle(e); if (!cs.backgroundImage || cs.backgroundImage === 'none') return;
    e.style.setProperty('background-image', night + ',' + cs.backgroundImage, 'important');
    e.style.setProperty('background-size', 'auto,' + cs.backgroundSize, 'important'); e.style.setProperty('background-position', '0 0,' + cs.backgroundPosition, 'important');
    e.style.setProperty('background-repeat', 'repeat,' + cs.backgroundRepeat, 'important'); });
  ['.bw', '.band', '.drawer', '.tabpanel', '.body3'].forEach(tint);
  document.querySelectorAll('.pg3').forEach((e) => e.style.setProperty('background', '#0e0e10', 'important'));
  return 1; })()`;
const HALF = ['o........', 'oLo......', 'oLLo...oo', 'oLPPoooPG', 'oPPPPPPPP', 'oPPooooPP', 'oPo....oP', '.ono...on', '..onoooon', '...oonnnn', '.....ooon', '.......oo'];
const COL: Record<string, string> = { o: '#6a3fb0', L: '#f0b4ff', P: '#c04ee0', n: '#4a46a0', G: '#FFC43C' };
const MASK = HALF.map((r) => r + [...r].reverse().join(''));
const maskSvg = `<svg width="18" height="12" viewBox="0 0 18 12" shape-rendering="crispEdges" style="display:block">${MASK.map((r, y) => [...r].map((c, x) => COL[c] ? `<rect x="${x}" y="${y}" width="1" height="1" fill="${COL[c]}"/>` : '').join('')).join('')}</svg>`;
// A padlock in Samara's pixel-icon way (coloured outline, brass, lit from the top left).
const LOCK = ['..ooooo..', '.oLMMDo..', '.oM...oD.', '.oM...oD.', 'ooooooooo', 'oHHHHHHAo', 'oHAAkAAao', 'oHAkkkAao', 'oHAAkAAao', 'oAaaaaaao', 'ooooooooo'];
const LC: Record<string, string> = { o: '#5a3a14', L: '#c9cdd6', M: '#8a8f9c', D: '#4a4e5a', H: '#FFE28C', A: '#FFC43C', a: '#C98C14', k: '#2a1a10' };
const lockSvg = `<svg width="18" height="22" viewBox="0 0 9 11" shape-rendering="crispEdges" style="display:block">${LOCK.map((r, y) => [...r].map((c, x) => LC[c] ? `<rect x="${x}" y="${y}" width="1" height="1" fill="${LC[c]}"/>` : '').join('')).join('')}</svg>`;
app.whenReady().then(async () => {
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b: any = new AangBrowser({ origin: pages.origin, stateDir: process.env.STATE!, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') } as any);
  wireBrowser(() => b);
  b.open();
  for (let i = 0; i < 100 && !b.win; i++) await wait(150);
  b.win.setContentSize(1100, 700);
  await wait(6000);
  b.tray(true, { x: 42, y: 62, hy: 80 }); await wait(1500); b.tray(true, { x: 42, y: 62, hy: 80 }); await wait(2500);
  const out = process.argv[process.argv.length - 1];
  const fw = b.win.webContents, tw = b.trayV.webContents;
  await fw.executeJavaScript(NIGHT);
  await fw.executeJavaScript(`(() => { const slot = document.getElementById('slot'); const m = document.createElement('span'); m.innerHTML = ${JSON.stringify(maskSvg)};
    Object.assign(m.style, { display: 'grid', placeItems: 'center', paddingRight: '9px', marginRight: '1px', position: 'relative', flex: 'none' });
    const n = document.createElement('i'); Object.assign(n.style, { position: 'absolute', right: '0', top: '50%', width: '2px', height: '16px', marginTop: '-8px', background: '#05030c' }); m.append(n); slot.prepend(m); return 1; })()`);
  await tw.executeJavaScript(NIGHT);
  // v8 (his "it ONLY opens to these tabs"): a private window's list has no bookmarks and none of his normal tabs.
  await tw.executeJavaScript(`document.querySelector('.shelf-bk')?.remove(); 1`);
  // The hidden tabs: a third panel, the Tabs panel's own frame. Locked first.
  const panel = (open: boolean) => `(() => {
    document.getElementById('hidpanel')?.remove();
    const src = document.querySelector('.tabpanel'); const p = src.cloneNode(false); p.id = 'hidpanel';
    const t = document.createElement('p'); t.className = 'ptitle'; t.textContent = 'HIDDEN'; p.append(t);
    const lock = ${JSON.stringify(lockSvg)}, mask = ${JSON.stringify(maskSvg)};
    const row = (icon, text, cls) => { const r = document.createElement('div'); r.className = 'tp ' + (cls || ''); r.innerHTML = icon + '<span class="t"></span>'; r.querySelector('.t').textContent = text; return r; };
    if (!${open}) { const r = row('<span class="fi" style="display:grid;place-items:center;background:none;border:none">' + lock + '</span>', 'Locked · 3 tabs', 'sleep'); p.append(r); }
    else for (const [l, n] of [['T', 'sweetdreams - Twitch'], ['Y', 'Loba is Finally Meta after 6 years... - YouTube'], ['P', 'Prime Video']]) p.append(row('<span class="fi letter">' + l + '</span>', n, 'sleep'));
    src.after(p); return 1; })()`;
  await tw.executeJavaScript(panel(false)); await wait(600);
  writeFileSync(`${out}-frame.png`, (await fw.capturePage()).toPNG());
  writeFileSync(`${out}-locked.png`, (await tw.capturePage()).toPNG());
  await tw.executeJavaScript(panel(true)); await wait(600);
  writeFileSync(`${out}-open.png`, (await tw.capturePage()).toPNG());
  console.log('TRAY ' + JSON.stringify(b.trayV.getBounds()) + ' FRAME ' + JSON.stringify(b.win.getContentBounds()));
  app.exit(0);
});
