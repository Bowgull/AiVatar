// Sheet 100 (his picks, 2026-10-28): the MOCKUPS trail as Project > Topic > Sheet with a picture strip, and the quest
// log page. The real browser.html and mocklog.html, off screen, on a COPY of a trail file (given on the command line);
// his repos are only read (git cat-file), never written.
// Run: npx electron test/electron/sheet100-check.ts -ApplePersistenceIgnoreState YES <mockups.json> <shots folder>
import { app, BrowserWindow, screen } from 'electron';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts'; import { AangBrowser } from '../../src/browser.ts'; import { wireBrowser } from '../../src/browseripc.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | ')); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 600_000).unref();
app.on('window-all-closed', () => {});
const HERE = path.dirname(fileURLToPath(import.meta.url));
const [TRAIL, OUT] = process.argv.slice(-2) as [string, string];
mkdirSync(OUT, { recursive: true });
// never on his screen (2026-10-28: these test windows showed up in front of him): see-through and far off to the side
// His rule (2026-10-29): never his main monitor or his keyboard. See-through, on the second monitor, unfocusable, no Dock icon.
const away = () => { const d = screen.getAllDisplays().find((x) => x.id !== screen.getPrimaryDisplay().id); return d ? d.bounds : { x: -6000, y: 100 }; };
BrowserWindow.prototype.show = function (this: BrowserWindow) { const b = away(); this.setOpacity(0); this.setPosition(b.x + 20, b.y + 20); this.setFocusable(false); this.showInactive(); };
BrowserWindow.prototype.setAlwaysOnTop = function () {};
app.focus = () => {};
app.dock?.hide();
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
  // the logos the repair keeps beside the trail (mocklogos/), as Samara keeps them beside its own
  const lg0 = path.join(path.dirname(TRAIL), 'mocklogos');
  if (existsSync(lg0)) cpSync(lg0, path.join(st, 'mocklogos'), { recursive: true });
  // Waymark's mockups here are a live page (no repo to find a logo in): its logo as Samara would have kept it from the repo
  const wl = path.join(os.homedir(), 'projects', 'waymark', 'assets', 'brand', 'Logo.png');
  if (existsSync(wl)) { mkdirSync(path.join(st, 'mocklogos'), { recursive: true }); copyFileSync(wl, path.join(st, 'mocklogos', 'waymark.png')); }
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const b = new AangBrowser({ origin: pages.origin, stateDir: st, repoDir: os.tmpdir(), mockupsAnywhere: true, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'),
    settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs'), testLocal: true }) as any;
  wireBrowser(() => b);
  b.mockStore.tidiedAt = Date.now();
  b.reopenMockups();
  await until(() => !!b.win, 15000);
  const w: BrowserWindow = b.win, wc = w.webContents;
  wc.on('console-message', (e: any) => { const m = e?.message ?? ''; if (/error|undefined|not a function|cannot/i.test(m)) console.log('FRAME ' + String(m).slice(0, 300)); });
  w.setSize(1400, 1500); await wait(1500);
  await wc.executeJavaScript("document.body.classList.add('drawer-open'); true");
  await wait(1200);
  const shot = async (name: string) => { const r0 = await wc.executeJavaScript(`(() => { const b = document.querySelector('.drawer').getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), width: Math.round(b.width), height: 560 }; })()`); writeFileSync(path.join(OUT, name), (await wc.capturePage(r0)).toPNG()); };
  // always there: no mockup open yet, and ALL MOCKUPS is in the tab list
  const e0 = { row: await wc.executeJavaScript(`document.querySelector('.mquest')?.textContent ?? null`) as string | null };
  check('always there: with no mockup open, ALL MOCKUPS is in the tab list', /ALL MOCKUPS/.test(e0.row ?? '') && !b.tabs.some((x: any) => x.mock), e0.row ?? '');
  await shot('trail-empty.png');
  // two projects open: Samara's cat and a Couch Mode scene, each under its project, then its topic
  await b.openMockupDrop({ repo: os.homedir() + '/projects/AiVatar', path: 'docs/cockpit/sheet-91-jiji-cat.html', url: null, title: '91 · The cat, Jiji style', branch: 'Logins' });
  await b.openMockupDrop({ repo: os.homedir() + '/Handoff/couch-mode', path: 'mockups/11-dark-forest-fire.html', url: null, title: '11 · Dark Forest Fire', branch: 'Campfire scene' });
  await b.openMockupDrop({ url: 'http://127.0.0.1:8765/79-ledger-boards.html', repo: null, path: '', title: '79 · Ledger boards', branch: 'All Waymark', project: 'Waymark' });
  await wait(2500);
  const e1 = JSON.parse(await wc.executeJavaScript(`JSON.stringify({ projects: [...document.querySelectorAll('.mph .pn')].map((x) => x.textContent), topics: [...document.querySelectorAll('.bh .nm')].map((x) => x.textContent),
    logo: !!document.querySelector('.mph .em img[src*="/p/waymark.png"]') })`));
  console.log(JSON.stringify(e1));
  check('project on each topic: open mockups sit under their project', e1.projects.includes('Samara') && e1.projects.includes('Couch Mode'), e1.projects.join(', '));
  check('a project with a logo wears it (Waymark)', e1.logo);
  await shot('trail-projects.png');
  // tuck away: a mockup he has not looked at in 4 days closes by itself; the one in front never does
  const couch = b.tabs.find((x: any) => x.mock?.sheet?.includes('11-dark-forest'));
  const front = b.tabs.find((x: any) => b.panes.some((p: any) => p.active === x.id));
  if (couch && couch !== front) { couch.mock.unseen = false; b.mockStore.meta.get(couch.mock.sheet).opened = Date.now() - 4 * 86_400_000; }
  await b.sleepIdle();
  check('tuck away: an old unseen-for-days mockup tab closes, still in the Mockups tab', !b.tabs.some((x: any) => x.mock?.sheet?.includes('11-dark-forest')) && b.mockStore.list.some((x: any) => x.sheet.includes('11-dark-forest')));
  check('the trail stays put after that', !!(await wc.executeJavaScript(`!!document.querySelector('.mquest')`)));
  const t = JSON.parse(await wc.executeJavaScript(`JSON.stringify({ row: document.querySelector('.mquest')?.textContent, old: !!document.querySelector('.mhist, .mlist, .mfrom, .mlog') })`));
  check('the trail has one way in: All mockups, with how many sheets', /ALL MOCKUPS\s*\d+ SHEETS/.test(t.row ?? ''), t.row);
  check('the old history list, FROM CLAUDE and the magnifier are gone', !t.old);
  const r = await wc.executeJavaScript(`(() => { const m = document.querySelector('.drawer'); const b = m.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), width: Math.round(b.width), height: 700 }; })()`);
  writeFileSync(path.join(OUT, 'trail.png'), (await wc.capturePage(r)).toPNG());
  if (process.env.WHOLE) { w.setSize(1400, 860); await wait(800); writeFileSync(path.join(OUT, 'window.png'), (await wc.capturePage()).toPNG()); w.setSize(1400, 1500); await wait(500); }
  await wc.executeJavaScript(`document.querySelector('.mquest').click(); 1`);
  // the quest log
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
  await lwc.executeJavaScript(`[...document.querySelectorAll('#tree .topic')].find((x) => /^security/i.test(x.textContent))?.click(); 1`); await wait(300);
  await lwc.executeJavaScript(`[...document.querySelectorAll('#sheets .sh')].find((x) => x.querySelector('.num')?.textContent === '86')?.click(); 1`); await wait(1500);
  // every version gets its picture in the background, newest first; 86 is an old sheet, so this waits a while
  const t0 = Date.now();
  await until(async () => (await lwc.executeJavaScript(`document.querySelectorAll('#detail .vt .pic[style*="background-image"]').length`)) >= 4, 300000);
  console.log(`pictures for 86 after ${Math.round((Date.now() - t0) / 1000)} s`);
  await wait(1000);
  if (process.env.WHOLE) { w.setSize(1400, 860); await wait(1200); }
  writeFileSync(path.join(OUT, 'log-86.png'), (await lwc.capturePage()).toPNG());
  if (process.env.WHOLE) console.log('log view ' + JSON.stringify(lg.view.getBounds()));
  if (process.env.WHOLE) { await wc.executeJavaScript("document.body.classList.remove('drawer-open'); true"); await wait(800); writeFileSync(path.join(OUT, 'frame-log.png'), (await wc.capturePage()).toPNG()); }
  const before = b.tabs.filter((x: any) => x.mock).length;
  await lwc.executeJavaScript(`document.querySelector('#detail .go').click(); 1`);
  await until(() => b.tabs.some((x: any) => x.mock?.sheet?.includes('sheet-86')), 8000);
  check('Open opens that version in the MOCKUPS trail', b.tabs.some((x: any) => x.mock?.sheet?.includes('sheet-86')), `${before} -> ${b.tabs.filter((x: any) => x.mock).length}`);
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  setTimeout(() => app.exit(bad ? 1 : 0), 300);
});
