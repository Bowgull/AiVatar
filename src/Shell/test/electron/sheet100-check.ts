// Sheet 100 (his picks, 2026-10-28): the MOCKUPS trail as Project > Topic > Sheet with a picture strip, and the quest
// log page. The real browser.html and mocklog.html, off screen, on a COPY of a trail file (given on the command line);
// his repos are only read (git cat-file), never written.
// Run: npx electron test/electron/sheet100-check.ts -ApplePersistenceIgnoreState YES <mockups.json> <shots folder>
import { app, BrowserWindow, screen } from 'electron';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts'; import { AangBrowser } from '../../src/browser.ts'; import { wireBrowser } from '../../src/browseripc.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | ')); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 600_000).unref();
app.on('window-all-closed', () => {});
const HERE = path.dirname(fileURLToPath(import.meta.url));
const [TRAIL, OUT] = process.argv.slice(-2) as [string, string];
mkdirSync(OUT, { recursive: true });
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
BrowserWindow.prototype.moveTop = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => boolean | Promise<boolean>, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(200); } return fn(); };
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + String(d).slice(0, 300) : ''}`); if (!ok) bad++; };

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const st = mkdtempSync(path.join(os.tmpdir(), 's100-state-'));
  copyFileSync(TRAIL, path.join(st, 'mockups.json'));
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const b = new AangBrowser({ origin: pages.origin, stateDir: st, repoDir: os.tmpdir(), mockupsAnywhere: true, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'),
    settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs'), testLocal: true }) as any;
  wireBrowser(() => b);
  b.mockStore.tidiedAt = Date.now();
  b.reopenMockups();
  await until(() => !!b.win, 15000);
  const w: BrowserWindow = b.win, wc = w.webContents;
  w.setSize(1400, 1500); await wait(1500);
  b.mockAct('list', { open: true });
  await wc.executeJavaScript("document.body.classList.add('drawer-open'); true");
  // the pictures come in one at a time; wait for the open topic's
  await until(async () => (await wc.executeJavaScript(`document.querySelectorAll('.mstrip .mvt .pic[style*="background-image"]').length`)) >= 1, 120000);
  await wait(4000);
  const t = JSON.parse(await wc.executeJavaScript(`JSON.stringify({
    projects: [...document.querySelectorAll('.mlist .mproj .pn')].map((x) => x.textContent),
    open: [...document.querySelectorAll('.mlist .mproj.open .pn')].map((x) => x.textContent),
    topics: [...document.querySelectorAll('.mlist .mtopic .tn')].map((x) => x.textContent),
    tiles: document.querySelectorAll('.mlist .mvt').length, pics: document.querySelectorAll('.mlist .mvt .pic[style*="background-image"]').length })`));
  console.log(JSON.stringify(t));
  check('projects, newest first, Live pages never', t.projects[0] === 'Samara' && t.projects.includes('Couch Mode') && t.projects.includes('Waymark') && t.projects.includes('Anti-slop') && !t.projects.includes('Live pages'), t.projects.join(', '));
  check('only the newest project starts open', t.open.length === 1, t.open.join(', '));
  check('Samara\'s topics are under it, Top bar among them', t.topics.includes('Top bar') && t.topics.includes('Security'), t.topics.join(', '));
  check('the open sheet shows its versions as pictures', t.tiles > 0 && t.pics > 0, `${t.pics}/${t.tiles}`);
  // open Security > 86 to see a longer strip
  await wc.executeJavaScript(`(() => { const tp = [...document.querySelectorAll('.mlist .mtopic')].find((x) => x.querySelector('.tn').textContent === 'Security'); tp.click();
    setTimeout(() => { const r = [...document.querySelectorAll('.mlist .msr')].find((x) => x.querySelector('.num')?.textContent === '87'); r?.click(); }, 400); return 1; })()`);
  await wait(1500);
  const r = await wc.executeJavaScript(`(() => { const m = document.querySelector('.drawer'); const b = m.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), width: Math.round(b.width), height: Math.min(1400, Math.round(b.height)) }; })()`);
  writeFileSync(path.join(OUT, 'trail.png'), (await wc.capturePage(r)).toPNG());
  if (process.env.WHOLE) { w.setSize(1400, 860); await wait(800); writeFileSync(path.join(OUT, 'window.png'), (await wc.capturePage()).toPNG()); w.setSize(1400, 1500); await wait(500); }
  // the quest log
  b.openMockLog();
  await until(() => b.tabs.some((x: any) => x.internal === 'mocklog' && x.view && !x.view.webContents.isLoading()), 15000);
  const lg = b.tabs.find((x: any) => x.internal === 'mocklog');
  const lwc = lg.view.webContents;
  await until(async () => (await lwc.executeJavaScript(`document.querySelectorAll('#sheets .sh').length`)) > 0, 15000);
  await wait(2500);
  const l = JSON.parse(await lwc.executeJavaScript(`JSON.stringify({ projects: document.querySelectorAll('#tree .proj').length, topics: document.querySelectorAll('#tree .topic').length,
    sheets: document.querySelectorAll('#sheets .sh').length, big: !!document.querySelector('#detail .big'), strip: document.querySelectorAll('#detail .vt').length, head: document.querySelector('#detail .dt')?.textContent })`));
  console.log(JSON.stringify(l));
  check('the quest log: projects, topics, sheets, one big and its versions', l.projects >= 4 && l.topics > 3 && l.sheets > 0 && l.big && l.strip > 0, JSON.stringify(l));
  writeFileSync(path.join(OUT, 'log.png'), (await lwc.capturePage()).toPNG());
  // pick Security > 86 in the log
  await lwc.executeJavaScript(`[...document.querySelectorAll('#tree .topic')].find((x) => x.textContent.startsWith('Security')).click(); 1`); await wait(300);
  await lwc.executeJavaScript(`[...document.querySelectorAll('#sheets .sh')].find((x) => x.querySelector('.num')?.textContent === '86').click(); 1`); await wait(1500);
  // every version gets its picture in the background, newest first; 86 is an old sheet, so this waits a while
  const t0 = Date.now();
  await until(async () => (await lwc.executeJavaScript(`document.querySelectorAll('#detail .vt .pic[style*="background-image"]').length`)) >= 4, 300000);
  console.log(`pictures for 86 after ${Math.round((Date.now() - t0) / 1000)} s`);
  await wait(1000);
  writeFileSync(path.join(OUT, 'log-86.png'), (await lwc.capturePage()).toPNG());
  const before = b.tabs.filter((x: any) => x.mock).length;
  await lwc.executeJavaScript(`document.querySelector('#detail .go').click(); 1`);
  await until(() => b.tabs.some((x: any) => x.mock?.sheet?.includes('sheet-86')), 8000);
  check('Open opens that version in the MOCKUPS trail', b.tabs.some((x: any) => x.mock?.sheet?.includes('sheet-86')), `${before} -> ${b.tabs.filter((x: any) => x.mock).length}`);
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  setTimeout(() => app.exit(bad ? 1 : 0), 300);
});
