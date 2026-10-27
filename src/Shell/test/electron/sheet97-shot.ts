// Sheet 97 (2026-10-27, his "how should it work, what is the current interaction, and how can we add to and improve it"):
// Claude in Samara today, then one connected sign, on Samara itself. Claude compares three laptops in its own hidden tabs
// (a real driver session) while a Claude job runs (claudeNews, as rune-check.ts feeds it). Today's pictures are Samara as
// it is; the new ones lay on styles and the hand-drawn lantern and rune (docs/cockpit/sheet-97/art.js). Not built.
// Run: npx electron test/electron/sheet97-shot.ts <out-prefix>
import { app, BrowserWindow, screen } from 'electron';
import http from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + String((e as Error)?.message ?? e).split('\n')[0]));
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 170_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 's97-ud-')));
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setOpacity(0); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ART = readFileSync(path.join(HERE, '..', '..', '..', '..', 'docs', 'cockpit', 'sheet-97', 'art.js'), 'utf8').replace(/export /g, '');
const PAGE = (t: string, c: string) => `<!doctype html><title>${t}</title><body style="margin:0;font:18px Georgia,serif;background:#f6f3ee;color:#222">
  <div style="height:56px;background:${c}"></div><div style="padding:30px 60px"><h1 style="margin:0 0 12px">${t}</h1>
  <p style="max-width:640px;line-height:1.6;color:#555">${'Battery, weight, screen, keyboard and price, side by side. '.repeat(4)}</p></div></body>`;
const SITES: Record<string, [string, string]> = { '/': ['Weekend plans', '#5a7a4a'], '/l1': ['ThinkPad X1 Carbon', '#c0392b'], '/l2': ['MacBook Air M4', '#6c6c70'], '/l3': ['Framework Laptop 13', '#2b2b2b'] };
// One plank (sheet 96 v2), the lantern menu, and the new pieces.
const PLANK = `.band{height:66px !important;background-size:128px 52px !important;background-position:0 14px !important}
  .band::before{background-size:128px 52px !important}
  .band .rnd:not(.menukey):not(.upkey){border-radius:6px !important;border:2px solid #120A05 !important;background:#4A2C6E !important;box-shadow:inset 2px 2px 0 #7a5aa8,inset -2px -2px 0 #2C1848,0 2px 0 #120A05 !important}
  .band .menukey{background:none !important;border:none !important;box-shadow:none !important;width:36px !important;height:36px !important}
  #runeslot{display:none !important}`;
const C = { working: '#f0a64a', needs: '#7cc4ff' };
// The address bar's end: the new rune (36 px, its ring in the state's colour). Watching Claude's tab: one label, the rune,
// CLAUDE IS DRIVING and STOP, and the bar's edge ringed in the same colour, two whole pixels, no blur.
const COLOR_BAR = (state: 'working' | 'needs', watching: boolean) => `(() => { ${ART}
  const COL = '${C[state]}';
  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2; c.style.cssText = 'display:block;flex:none;image-rendering:pixelated'; const g = c.getContext('2d'); return [c, (x, y, col) => { g.fillStyle = col; g.fillRect(x * 2, y * 2, 2, 2); }]; };
  const [lc, lp] = cv(18, 18); lantern(lp); document.getElementById('menukey').replaceChildren(lc);
  const slot = document.getElementById('slot'); document.getElementById('r97')?.remove();
  const [rc, rp] = cv(18, 18); rune(rp, 0, 0, '${state}', ${state === 'needs' ? 1 : 0.4}); rc.id = 'r97'; rc.style.margin = '-6px -8px -6px 0';
  const who = document.getElementById('who');
  if (${watching} && !who.hidden) {
    // one sign: the rune leads the label, STOP after it; the bar's edge in the state's colour, two whole pixels
    who.querySelector('.who-ic')?.replaceWith(rc); rc.style.margin = '-8px 0';
    slot.style.boxShadow = 'inset 0 4px 0 rgba(0,0,0,.7),0 0 0 2px ' + COL;
  } else slot.append(rc);
  return 1; })()`;
// The tab list: Claude's trail head wears the rune (no ring) and a left edge in the state's colour; the page Claude is on
// right now has the FFX glove pointing at it and the same edge. The handle gets a small pip in the state's colour.
const LIST_JS = (state: 'working' | 'needs', at: number) => `(() => { ${ART}
  const col = '${C.working}', c2 = '${C.needs}', COL = '${state}' === 'needs' ? c2 : col;
  const h = document.querySelector('.th.driver'); if (!h) return 'no trail';
  const [ic] = [h.querySelector('.who-ic')]; if (ic) { const c = document.createElement('canvas'); c.width = 24; c.height = 24; c.style.cssText = 'display:block;image-rendering:pixelated'; const g = c.getContext('2d'); rune((x, y, k) => { g.fillStyle = k; g.fillRect(x * 2, y * 2, 2, 2); }, 0, 0, '${state}', 1, false); ic.replaceChildren(c); }
  h.style.boxShadow = 'inset 4px 0 0 ' + COL;
  const rows = [...document.querySelectorAll('.tp.drv')]; const r = rows[${at}]; if (!r) return 'no rows ' + rows.length;
  r.style.boxShadow = 'inset 4px 0 0 ' + COL + ', 0 0 0 2px ' + COL; r.style.position = 'relative'; r.style.marginLeft = '30px';
  const gl = document.createElement('i'); gl.style.cssText = 'position:absolute;left:-32px;top:50%;width:24px;height:18px;margin-top:-9px;background:url(art/browser/hand.png) 0 0/24px 18px;image-rendering:pixelated'; r.append(gl);
  ${state === 'needs' ? "const t = r.querySelector('.t'); if (t) t.textContent = t.textContent + '  ·  needs you';" : ''}
  return 'ok'; })()`;
const HANDLE_JS = (state: 'working' | 'needs') => `(() => { const b = document.querySelector('.hnd button'); if (!b) return 'no handle';
  const p = document.createElement('i'); p.id = 'pip97'; p.style.cssText = 'position:absolute;left:10px;top:6px;width:12px;height:12px;background:${C[state]};box-shadow:0 0 0 2px #120A05,inset -2px -2px 0 rgba(0,0,0,.25),inset 2px 2px 0 rgba(255,255,255,.45)'; b.append(p); return 'ok'; })()`;
app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const out = process.argv[process.argv.length - 1];
  const site = http.createServer((q, r) => { const s = SITES[q.url ?? '/'] ?? SITES['/']; r.writeHead(200, { 'Content-Type': 'text/html' }).end(PAGE(s[0], s[1])); });
  await new Promise<void>((r) => site.listen(0, '127.0.0.1', () => r()));
  const port = (site.address() as { port: number }).port, U = (p: string) => `http://127.0.0.1:${port}${p}`;
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const b: any = new AangBrowser({ origin: pages.origin, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs'), stateDir: mkdtempSync(path.join(os.tmpdir(), 's97-st-')), testLocal: true });
  wireBrowser(() => b);
  b.open(U('/'));
  for (let i = 0; i < 100 && !b.win; i++) await wait(150);
  b.win.setContentSize(1440, 860);
  await wait(5000);
  const s = await b.drive('start', { kind: 'claude', name: 'Compare laptops' });
  const opened: any[] = [];
  for (const p of ['/l1', '/l2', '/l3']) { opened.push(await b.drive('open', { job: s.job, url: U(p) })); await wait(800); }
  const job = b.driver.job(s.job); job.working = true;
  b.claudeNews({ t: 'claude.jobs', jobs: [{ id: '0b6c2a8e-1111-4c3d-9e2f-aaaaaaaaaaaa', machine: 'mac', cwd: '/x', project: 'Laptops', model: 'opus', phase: 'working', startedAt: 1, lastActivity: Date.now(), prompt: 'go',
    tasks: [{ text: 'Open three laptop pages', status: 'completed' }, { text: 'Read prices and specs', status: 'in_progress', active: 'Reading prices and specs...' }, { text: 'Write the comparison', status: 'pending' }], current: '', percent: 40, etaMs: 6 * 60_000, usage: null, open: null, held: 0 }] });
  b.driverAct('noop', 0);
  await wait(2500);
  const fw = b.win.webContents;
  const frame = async (name: string) => {
    await fw.executeJavaScript(`document.activeElement?.blur(); 1`);
    writeFileSync(`${out}-${name}-frame.png`, (await fw.capturePage()).toPNG());
    const v = b.cur()?.view; if (v && v.isVisible?.() !== false) { const r = v.getBounds(); writeFileSync(`${out}-${name}-page.png`, (await v.webContents.capturePage()).toPNG()); console.log(`PAGE ${name} ${r.x} ${r.y}`); }
    if (name.endsWith('list') && b.trayV) { writeFileSync(`${out}-${name}-tray.png`, (await b.trayV.webContents.capturePage()).toPNG()); console.log(`TRAY ${name} ${JSON.stringify(b.trayV.getBounds())}`); }
  };
  const drawer = async (open: boolean) => { if (open) b.tray(true, { x: 42, y: 62, hy: 80 }); else b.tray(false); b.sendTabs(); await wait(1800); };
  // ---- today
  await frame('t-closed');
  await drawer(true); await frame('t-list'); await drawer(false);
  b.driverAct('watch', opened[1].page); await wait(2500); await frame('t-watch'); b.driverAct('unwatch', 0); await wait(1200);
  // ---- new
  const key = await fw.insertCSS(PLANK);
  for (const [st, nm] of [['working', 'n'], ['needs', 'q']] as const) {
    await fw.executeJavaScript(COLOR_BAR(st, false)); await fw.executeJavaScript(HANDLE_JS(st)); await wait(800);
    await frame(`${nm}-closed`);
    await drawer(true); console.log('LIST ' + await b.trayV.webContents.executeJavaScript(LIST_JS(st, 1))); await wait(600); await frame(`${nm}-list`); await drawer(false);
    await fw.executeJavaScript(`document.getElementById('pip97')?.remove(); 1`);
    if (st === 'working') { b.driverAct('watch', opened[1].page); await wait(2500); await fw.executeJavaScript(COLOR_BAR(st, true)); await wait(600); await frame('n-watch'); b.driverAct('unwatch', 0); await wait(1200);
      await fw.executeJavaScript(`document.getElementById('slot').style.boxShadow = ''; 1`); }
  }
  void key;
  site.close(); app.exit(0);
});
