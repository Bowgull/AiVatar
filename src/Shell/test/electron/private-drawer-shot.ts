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
// v10 (his "the full night style, not the brown bar at the top"): the secret window's whole skin, written as the styles
// it would ship with (html.secret in browser.css): moonlit navy wood everywhere, silver for what was gold, no brown left.
const SECRET_CSS = `
html.secret{--night:linear-gradient(rgba(10,20,60,.62),rgba(10,20,60,.62))}
html.secret .band{background:var(--night),url(art/browser/band.png) repeat-x 0 14px/128px 58px !important}
html.secret .band::before{background:var(--night),url(art/browser/band.png) repeat-x 0 -8px/128px 58px !important;filter:none !important;
  box-shadow:inset 0 2px 0 rgba(180,200,255,.18),inset 0 -2px 0 rgba(0,0,0,.5) !important}
html.secret:not(.solo) .bw::after{background:var(--night),url(art/browser/band.png) repeat-x 0 -20px/128px 58px !important}
html.secret .bw{background:linear-gradient(rgba(6,10,30,.72),rgba(4,6,20,.78)),url(art/browser/tray.png) 0 0/128px 256px !important}
html.secret .body3{background:none !important}
html.secret .pg3{background:#0e0e10 !important}
html.secret .rnd{background:linear-gradient(180deg,#2c3a78,#18204a) !important;color:#dce6ff !important;box-shadow:0 3px 0 #05030c,inset 0 2px 0 rgba(160,190,255,.4) !important}
html.secret .rnd svg *{stroke:#dce6ff;fill:#dce6ff}
html.secret .wk svg path{fill:#cfe0ff !important}
html.secret .drawer{background-image:var(--night),url(art/browser/tray.png) !important}
html.secret .drawer .tabpanel{background:radial-gradient(120% 40% at 50% 0%,rgba(170,200,255,.10),transparent 60%),linear-gradient(rgba(4,8,30,.55),rgba(4,8,30,.6)),url(art/browser/tray.png) 0 0/128px 256px !important;
  box-shadow:inset 0 0 0 4px #1c2346,inset 0 0 0 5px #05030c,inset 0 7px 12px rgba(0,0,0,.5),0 3px 0 #02020a !important}
html.secret .drawer .shelf-bk{box-shadow:inset 0 0 0 4px #1c2346,inset 0 0 0 5px #05030c,inset 0 7px 12px rgba(0,0,0,.5),0 3px 0 #02020a !important}
html.secret .drawer .tabpanel::after,html.secret .shelf-bk::after{filter:grayscale(1) brightness(1.2) sepia(.25) hue-rotate(185deg)}
html.secret .drawer .ptitle{color:#d6e2ff !important}
html.secret .drawer .ptitle::after{background:linear-gradient(180deg,rgba(0,0,0,.6) 0 2px,rgba(170,200,255,.22) 2px 4px) !important}
html.secret .drawer .tp{color:#e4eaff !important;background:linear-gradient(180deg,#323c6e 0,#252d58 45%,#1d2448 100%) !important;
  box-shadow:0 4px 0 #05030c,inset 0 3px 0 rgba(180,200,255,.22),inset 0 -2px 0 rgba(0,0,0,.35) !important}
html.secret .drawer .tp.on{background:linear-gradient(180deg,#e6edff,#aebce4) !important;color:#141a38 !important;text-shadow:0 1px 0 rgba(255,255,255,.55) !important}
html.secret .drawer .tp .fi.letter,html.secret .drawer .tp .w{color:#cfe0ff !important}
html.secret .tp.kid::before{border-color:rgba(170,200,255,.35) !important}
html.secret .drawer .newtab{color:#e4eaff !important}
html.secret .drawer .th{color:#dce6ff !important}
html.secret .drawer .th .n{color:#9fb0d8 !important}
html.secret .drawer .th::after{background:linear-gradient(180deg,rgba(0,0,0,.6) 0 2px,rgba(170,200,255,.22) 2px 5px) !important}
html.secret .bm-add{border-color:rgba(190,210,255,.45) !important;color:#dce6ff !important}
html.secret .drawer,html.secret .drawer *{scrollbar-color:#3a4880 transparent !important}
`;
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
  await fw.insertCSS(SECRET_CSS); await fw.executeJavaScript(`document.documentElement.classList.add('secret'); 1`);
  await fw.executeJavaScript(`(() => { const slot = document.getElementById('slot'); const m = document.createElement('span'); m.innerHTML = ${JSON.stringify(maskSvg)};
    Object.assign(m.style, { display: 'grid', placeItems: 'center', paddingRight: '9px', marginRight: '1px', position: 'relative', flex: 'none' });
    const n = document.createElement('i'); Object.assign(n.style, { position: 'absolute', right: '0', top: '50%', width: '2px', height: '16px', marginTop: '-8px', background: '#05030c' }); m.append(n); slot.prepend(m); return 1; })()`);
  await tw.insertCSS(SECRET_CSS); await tw.executeJavaScript(`document.documentElement.classList.add('secret'); 1`);
  // the mask by his tabs: before the TABS title
  await tw.executeJavaScript(`(() => { const t = document.querySelector('.tabpanel .ptitle'); const m = document.createElement('span'); m.innerHTML = ${JSON.stringify(maskSvg)}; m.style.display = 'grid'; t.prepend(m); return 1; })()`);
  // v9 (his "its own space its own set of bookmarks its own private history"): the secret list has its own Bookmarks
  // (empty at first), its Tabs, and a History panel under them.
  // The secret history: a third panel in the Tabs panel's own frame, the newest first, when on the right.
  await tw.executeJavaScript(`(() => {
    const src = document.querySelector('.tabpanel'); const p = src.cloneNode(false);
    const t = document.createElement('p'); t.className = 'ptitle'; t.textContent = 'HISTORY'; p.append(t);
    for (const [l, n, w] of [['R', 'Reddit - Popular', '2m'], ['G', 'Inbox - Gmail', '1h'], ['T', 'sweetdreams - Twitch', 'Yesterday']]) {
      const r = document.createElement('div'); r.className = 'tp sleep'; r.innerHTML = '<span class="fi letter"></span><span class="t"></span><span class="w"></span>';
      r.querySelector('.fi').textContent = l; r.querySelector('.t').textContent = n; const ws = r.querySelector('.w'); ws.textContent = w;
      Object.assign(ws.style, { font: '600 11px Figtree, sans-serif', marginLeft: '6px', flex: 'none' }); p.append(r); }
    src.after(p); return 1; })()`);
  await wait(600);
  writeFileSync(`${out}-list.png`, (await tw.capturePage()).toPNG());
  writeFileSync(`${out}-frame.png`, (await fw.capturePage()).toPNG());
  // ⇧⌘N: a blank night page, nothing of his in the address.
  await fw.executeJavaScript(`(() => { for (const id of ['url', 'lock']) document.getElementById(id)?.style.setProperty('visibility', 'hidden', 'important'); return 1; })()`);
  await wait(600);
  writeFileSync(`${out}-blank.png`, (await fw.capturePage()).toPNG());
  console.log('TRAY ' + JSON.stringify(b.trayV.getBounds()) + ' FRAME ' + JSON.stringify(b.win.getContentBounds()));
  app.exit(0);
});
