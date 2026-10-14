// Private Network Access (2026-10-14): a page from the internet never reaches this computer or the home network,
// while Samara's own local pages, and local pages he opens himself, still work. Ad blocking still runs.
//
// Run: npx electron test/electron/netguard-check.ts
import { app, BrowserWindow, screen } from 'electron';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { AangBrowser } from '../../src/browser.ts';

const PORT = 47916, SECRET = 47917;
// www.public-site.com stands in for any site on the internet; it is served from this computer for the test.
app.commandLine.appendSwitch('host-resolver-rules', `MAP www.public-site.com 127.0.0.1:${PORT}`);
process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* not in a test */ };
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d.slice(0, 200) : ''}`); if (!ok) bad++; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PROBE = `<!doctype html><title>probe</title><body><script>
window.result = Promise.all(['http://127.0.0.1:${SECRET}/secret', 'http://localhost:${SECRET}/secret', 'http://192.168.1.1/'].map((u) =>
  fetch(u, { mode: 'no-cors' }).then(() => 'reached').catch(() => 'stopped')));
</script></body>`;

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  let secretHits = 0;
  const secret = http.createServer((_q, r) => { secretHits++; r.writeHead(200, { 'Access-Control-Allow-Origin': '*' }).end('brain'); });
  await new Promise<void>((r) => secret.listen(SECRET, '127.0.0.1', () => r()));
  const site = http.createServer((_q, r) => { r.writeHead(200, { 'Content-Type': 'text/html' }).end(PROBE); });
  await new Promise<void>((r) => site.listen(PORT, '127.0.0.1', () => r()));
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'netg-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') }) as any;
  const result = async (url: string) => {
    b.open(url); await wait(2500);
    const t = b.tabs.find((x: any) => x.url.startsWith(url));
    return await t.view.webContents.executeJavaScript('window.result');
  };
  const pub = await result(`http://www.public-site.com:${PORT}/`);
  check('an internet page cannot reach this computer or the home network', JSON.stringify(pub) === '["stopped","stopped","stopped"]' && secretHits === 0, `${JSON.stringify(pub)} hits ${secretHits}`);
  const local = await result(`http://127.0.0.1:${PORT}/`);
  check('a local page he opens himself still reaches local things', local[0] === 'reached' && local[1] === 'reached' && secretHits === 2, `${JSON.stringify(local)} hits ${secretHits}`);
  await wait(4000);
  check('the ad blocker is still on', !!b.ads, String(!!b.ads));
  console.log(bad ? `${bad} FAILED` : 'ALL PASS'); app.exit(bad ? 1 : 0);
});
