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
// v2 (his "what about this design feels AI slop"): one rune, one size (36 px, its ring in the state's colour) in the bar,
// on Claude's row and on its trail; no outlines anywhere; watching, the address bar's corners are the gold caps the tab
// list's panels wear, taking the state's colour; the handle carries the rune's stone carved in, ringed in the colour,
// drawn in whole pixels; "needs you" is Samara's real hanging ask (sheet 86's family, .bandchip.kind).
const CV = `const cv = (w, h, s = 2) => { const c = document.createElement('canvas'); c.width = w * s; c.height = h * s; c.style.cssText = 'display:block;flex:none;image-rendering:pixelated'; const g = c.getContext('2d'); return [c, (x, y, col) => { g.fillStyle = col; g.fillRect(x * s, y * s, s, s); }]; };`;
const RUNE36 = (state: string, p: number, id = '') => `(() => { const [c, P] = cv(18, 18); rune(P, 0, 0, '${state}', ${p}); ${id ? `c.id = '${id}';` : ''} return c; })()`;
const COLOR_BAR = (state: 'working' | 'needs', watching: boolean) => `(() => { ${ART} ${CV}
  const [lc, lp] = cv(18, 18); lantern(lp); document.getElementById('menukey').replaceChildren(lc);
  const slot = document.getElementById('slot'); document.getElementById('r97')?.remove(); document.getElementById('caps97')?.remove();
  const rc = ${RUNE36('${state}', 0, 'r97')}; rc.style.margin = '-5px 0 -5px 2px';
  if ('${state}' === 'needs') { const g = rc.getContext('2d'); g.clearRect(0, 0, 36, 36); rune((x, y, k) => { g.fillStyle = k; g.fillRect(x * 2, y * 2, 2, 2); }, 0, 0, 'needs', 1); }
  else { const g = rc.getContext('2d'); g.clearRect(0, 0, 36, 36); rune((x, y, k) => { g.fillStyle = k; g.fillRect(x * 2, y * 2, 2, 2); }, 0, 0, 'working', 0.4); }
  const who = document.getElementById('who');
  if (${watching} && !who.hidden) {
    // Samara redraws the label as it goes, so the rune sits just before it and the label's own mark is hidden by style
    const wr = who.getBoundingClientRect(), sr = slot.getBoundingClientRect();
    rc.style.cssText += ';position:absolute;z-index:3;top:50%;margin:-18px 0 0 0;left:' + Math.round(wr.left - sr.left + 8) + 'px';
    slot.append(rc);
    const caps = document.createElement('i'); caps.id = 'caps97';
    caps.style.cssText = 'position:absolute;inset:-6px;pointer-events:none;z-index:2;image-rendering:pixelated;background:url(art/browser/cap3_tl.png) left top/22px 22px no-repeat,url(art/browser/cap3_tr.png) right top/22px 22px no-repeat,url(art/browser/cap3_bl.png) left bottom/22px 22px no-repeat,url(art/browser/cap3_br.png) right bottom/22px 22px no-repeat';
    slot.style.position = 'relative'; slot.style.overflow = 'visible'; slot.append(caps);
  } else slot.append(rc);
  return 1; })()`;
const LIST_JS = (state: 'working' | 'needs', at: number) => `(() => { ${ART} ${CV}
  const st = '${state}', p = st === 'needs' ? 1 : 0.4;
  const h = document.querySelector('.th.driver'); if (!h) return 'no trail';
  const ic = h.querySelector('.who-ic'); if (ic) { const [c, P] = cv(18, 18); rune(P, 0, 0, st, p); c.style.margin = '-8px 0'; ic.replaceWith(c); }
  const rows = [...document.querySelectorAll('.tp.drv')]; const r = rows[${at}]; if (!r) return 'no rows ' + rows.length;
  r.style.position = 'relative'; r.style.paddingRight = '44px';
  const [c, P] = cv(18, 18); rune(P, 0, 0, st, p); c.style.cssText += ';position:absolute;right:4px;top:50%;margin-top:-18px'; r.append(c);
  return 'ok'; })()`;
// The handle: the rune's stone (12 x 12) carved into the handle's wood, ringed in the state's colour, whole pixels at 2x.
const HANDLE_JS = (state: 'working' | 'needs') => `(() => { ${ART} ${CV}
  const b = document.querySelector('.hnd button'); if (!b) return 'no handle';
  const [c, P] = cv(14, 14); const col = STATE['${state}'];
  for (let y = 0; y < 14; y++) for (let x = 0; x < 14; x++) { const d = Math.hypot(x - 6.5, y - 6.5); if (d > 5.6 && d <= 6.9) P(x, y, col); }
  rune((x, y, k) => P(x + 1, y + 1, k), 0, 0, '${state}', 1, false);
  c.id = 'pip97'; c.style.cssText += ';position:absolute;left:2px;top:4px'; b.append(c); return 'ok'; })()`;
// "Needs you": Samara's real hanging ask, the OK kind's colour and tag, hung from the rune at the bar's end.
const ASK_JS = `(() => { ${ART} ${CV}
  const src = document.getElementById('tvchip'); const a = src.cloneNode(true); a.id = 'ask97'; a.hidden = false; a.classList.remove('k-tv'); a.style.setProperty('--kc', '#1f6fb0');
  const r = document.getElementById('r97').getBoundingClientRect(), band = document.getElementById('band').getBoundingClientRect();
  a.style.left = Math.round(r.left - band.left - 20) + 'px'; a.style.width = '330px';
  const tag = a.querySelector('.tag'); tag.removeAttribute('id'); tag.textContent = '';
  const ok = ['.........', '.........', '.###.....', '##.##....', '#...#####', '##.##.#.#', '.###..#.#', '.........', '.........'];
  const [ic, IP] = cv(9, 9); ok.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') IP(x, y, '#7cc4ff'); })); tag.append(ic, 'Needs your OK');
  const faces = a.querySelector('.faces'); faces.replaceChildren(); const f = document.createElement('span'); f.className = 'face';
  const [rc, RP] = cv(12, 12); rune(RP, 0, 0, 'needs', 1, false); f.append(rc); faces.append(f);
  a.querySelector('#tvq').textContent = 'Claude wants to open the checkout';
  a.querySelector('#tvm').innerHTML = '<b>Compare laptops</b> is on <b>bestbuy.ca</b>. It will only look at the price with tax, and won\\'t buy anything.';
  const k = a.querySelectorAll('.keys button'); k[0].firstElementChild.textContent = 'Allow once'; k[1].firstElementChild.textContent = 'No';
  for (const e of a.querySelectorAll('[id]')) e.removeAttribute('id');
  document.getElementById('band').append(a); const q = a.getBoundingClientRect(); return JSON.stringify({ x: Math.round(q.left), y: Math.round(q.top), w: Math.round(q.width), h: Math.round(q.height) + 16 }); })()`;
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
  const tw = () => b.trayV.webContents;
  await fw.executeJavaScript(COLOR_BAR('working', false)); console.log('HANDLE ' + await fw.executeJavaScript(HANDLE_JS('working'))); await wait(800);
  await frame('n-closed');
  await drawer(true); console.log('LIST ' + await tw().executeJavaScript(LIST_JS('working', 1))); await wait(600); await frame('n-list'); await drawer(false);
  await fw.executeJavaScript(`document.getElementById('pip97')?.remove(); 1`);
  b.driverAct('watch', opened[1].page); await wait(2500); const hideKey = await fw.insertCSS('#who .who-ic{display:none !important} #who{padding-left:52px !important}'); await wait(400); await fw.executeJavaScript(COLOR_BAR('working', true)); await wait(600); await frame('n-watch'); await fw.removeInsertedCSS(hideKey); b.driverAct('unwatch', 0); await wait(1200);
  await fw.executeJavaScript(`document.getElementById('caps97')?.remove(); 1`);
  await fw.executeJavaScript(COLOR_BAR('needs', false)); console.log('HANDLE ' + await fw.executeJavaScript(HANDLE_JS('needs')));
  console.log('ASK ' + await fw.executeJavaScript(ASK_JS)); await wait(900);
  b.win.webContents.send('browser:frozen', null);
  await frame('q-closed');
  await fw.executeJavaScript(`document.getElementById('ask97')?.remove(); 1`);
  await drawer(true); console.log('LIST ' + await tw().executeJavaScript(LIST_JS('needs', 1))); await wait(600); await frame('q-list'); await drawer(false);
  void key;
  site.close(); app.exit(0);
});
