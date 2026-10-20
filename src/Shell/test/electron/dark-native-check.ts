// His report (2026-10-20): dark mode lagged on his 2017 MacBook. Sites are now told he prefers dark, so those with a dark
// look of their own draw it themselves, and Dark Reader only works on pages that are really light.
//
// Run: npx electron test/electron/dark-native-check.ts
import { app, BrowserWindow, nativeTheme, screen } from 'electron';
import http from 'node:http'; import { mkdtempSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts'; import { AangBrowser } from '../../src/browser.ts'; import { wireBrowser } from '../../src/browseripc.ts';
process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();
app.on('window-all-closed', () => {});
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d.slice(0, 200) : ''}`); if (!ok) bad++; };
const PAGES: Record<string, string> = {
  own: '<style>body{background:#fff;color:#111} @media (prefers-color-scheme: dark){body{background:#151515;color:#eee}}</style><p>has its own dark mode</p>',
  dark: '<style>body{background:#0f0f0f;color:#ddd}</style><p>always dark</p>',
  light: '<style>body{background:#fff;color:#111}</style><p>plain light page</p>',
  bare: '<p>no colours at all</p>',
};
app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const site = http.createServer((q, r) => r.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>t</title>' + (PAGES[(q.url ?? '/').slice(1)] ?? '')));
  await new Promise<void>((r) => site.listen(47953, '127.0.0.1', () => r()));
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'dn-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'), tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs'), testLocal: true }) as any;
  wireBrowser(() => b);
  b.prefs.dark = true; b.prefs.darkOff = []; b.colorScheme();
  check('sites are told he prefers dark', nativeTheme.shouldUseDarkColors === true && nativeTheme.themeSource === 'dark');
  b.open('http://127.0.0.1:47953/light'); await wait(2500);
  const state = async (name: string) => {
    b.newTab('http://127.0.0.1:47953/' + name, null, true); await wait(2500);
    const t = b.tabs.find((x: any) => x.url.endsWith('/' + name)); const wc = t.view.webContents;
    const dr = await wc.executeJavaScriptInIsolatedWorld(1002, [{ code: '!!(globalThis.DarkReader && DarkReader.isEnabled())' }]).catch(() => false);
    const bg = await wc.executeJavaScript('getComputedStyle(document.body).backgroundColor');
    return { dr, bg };
  };
  let s = await state('own'); check('a site with its own dark mode draws it, and Dark Reader stays off', s.dr === false && /21, 21, 21/.test(s.bg), JSON.stringify(s));
  s = await state('dark'); check('an always-dark page: Dark Reader stays off', s.dr === false, JSON.stringify(s));
  s = await state('light'); check('a plain light page: Dark Reader makes it dark', s.dr === true, JSON.stringify(s));
  s = await state('bare'); check('a page with no colours of its own: Dark Reader makes it dark', s.dr === true, JSON.stringify(s));
  b.prefs.dark = false; b.colorScheme();
  check('dark mode off: sites follow the computer again', nativeTheme.themeSource === 'system');
  console.log(bad ? `${bad} FAILED` : 'ALL PASS'); app.exit(bad ? 1 : 0);
});
