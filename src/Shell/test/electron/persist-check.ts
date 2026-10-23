// His ask (2026-10-14): "when the browser closes it should remember what tabs were open, what trails were open".
// The real browser, off screen: (1) one window closed with its own X keeps every tab and trail (the snapshot used to be
// written AFTER the window had emptied its list, so an empty one was saved); (2) two windows open when he quits both
// come back, each with its own tabs, the right one in front.
//
// Run: npx electron test/electron/persist-check.ts
import { app, BrowserWindow, screen } from 'electron';
import http from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { AangBrowser } from '../../src/browser.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* not in a test */ };
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d : ''}`); if (!ok) bad++; };

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const srv = http.createServer((q, r) => r.writeHead(200, { 'Content-Type': 'text/html' }).end(`<!doctype html><title>Page ${q.url}</title><body>${q.url}</body>`));
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${(srv.address() as any).port}`;
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const make = (state: string) => new AangBrowser({ origin: pages.origin, stateDir: state, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') });

  // (1) one window, closed with its own X
  const s1 = mkdtempSync(path.join(os.tmpdir(), 'persist-1-'));
  let b = make(s1); b.prefs.home = base + '/home';
  b.open(base + '/a'); await wait(2500);
  b.newTab(base + '/b'); b.newTab(base + '/c'); await wait(1500);
  let any = b as any;
  const c = any.tabs.find((t: any) => t.url.endsWith('/c'));
  b.moveTab(c.id, 'new');                       // a trail of its own
  await wait(300);
  any.win.close();                              // his X
  await wait(2500);
  const saved = JSON.parse(readFileSync(path.join(s1, 'browser-tabs.json'), 'utf8'));
  check('closing the window keeps every tab', saved.tabs.length === 3, saved.tabs.map((t: any) => t.url.replace(base, '')).join(' '));
  check('and its trail', saved.trails.length === 1 && saved.tabs.some((t: any) => t.trail === saved.trails[0].id));
  b = make(s1); b.prefs.home = base + '/home'; any = b as any;
  b.open(); await wait(3000);
  check('opening again brings them back', any.tabs.map((t: any) => t.url.replace(base, '')).join(' ') === '/a /b /c', any.tabs.map((t: any) => t.url).join(' '));
  check('with the trail', any.trails.length === 1);
  b.closeAll(); await wait(1500);

  // (2) two windows open when he quits
  const s2 = mkdtempSync(path.join(os.tmpdir(), 'persist-2-'));
  b = make(s2); b.prefs.home = base + '/home'; any = b as any;
  b.open(base + '/one'); await wait(2500);
  const two = b.newTab(base + '/two')!; const three = b.newTab(base + '/three')!; await wait(1500);
  b.tearOut(two); await wait(2500);              // /two gets its own window
  check('two windows before quitting', any.panes.length === 2);
  b.closeAll(); await wait(2500);
  const s = JSON.parse(readFileSync(path.join(s2, 'browser-tabs.json'), 'utf8'));
  check('quitting keeps every tab of both windows', s.tabs.length === 3, s.tabs.map((t: any) => `${t.url.replace(base, '')}@${t.win}`).join(' '));
  b = make(s2); b.prefs.home = base + '/home'; any = b as any;
  b.open(); await wait(5000);
  const where = any.panes.map((p: any) => any.tabs.filter((t: any) => t.pane === p.id).map((t: any) => t.url.replace(base, '')).join(','));
  check('both windows come back', any.panes.length === 2, where.join(' | '));
  check('each with its own tabs', where.includes('/one,/three') && where.includes('/two'), where.join(' | '));
  void three;
  b.closeAll(); await wait(2000);

  // (3) 2026-10-23, twice on his Mac: a mockup or link arriving while Samara is still starting saved its one tab over his
  // whole list. Something arrives before the window's first load, and a save is tried at once: his list must survive.
  b = make(s2); b.prefs.home = base + '/home'; any = b as any;
  b.open(); b.open(base + '/late');
  await any.snapshot(true);
  const early = JSON.parse(readFileSync(path.join(s2, 'browser-tabs.json'), 'utf8'));
  check('nothing is saved before his tabs are back', early.tabs.length === 3, String(early.tabs.length));
  await wait(5000);
  check('his tabs come back, and the late one with them', any.tabs.length === 4, any.tabs.map((t: any) => t.url.replace(base, '')).join(' '));
  b.closeAll(); await wait(2000);
  const after = JSON.parse(readFileSync(path.join(s2, 'browser-tabs.json'), 'utf8'));
  check('and all four are saved', after.tabs.length === 4, String(after.tabs.length));
  srv.close(); pages.close();
  console.log(bad ? `${bad} failed` : 'all passed');
  setTimeout(() => app.exit(bad ? 1 : 0), 800);
});
