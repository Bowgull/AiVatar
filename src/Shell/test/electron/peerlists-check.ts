// His call (2026-10-14, code audit M3): a site the other computer trusts (programs, or no https) arrives here but
// does not count until he says yes once on this machine; a removal there still applies; nothing is lost in sync.
//
// Run: npx electron test/electron/peerlists-check.ts
import { app, BrowserWindow } from 'electron';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { AangBrowser } from '../../src/browser.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 40_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d : ''}`); if (!ok) bad++; };

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const dir = mkdtempSync(path.join(os.tmpdir(), 'peer-'));
  const mk = () => new AangBrowser({ origin: pages.origin, stateDir: dir, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') }) as any;
  const b = mk();
  b.trusted.add('mine.example');
  b.takeLists({ trusted: ['mine.example', 'other.example'], httpOk: ['old-router.example'] });
  check("the other computer's site does not count here yet", b.trusted.has('mine.example') && !b.trusted.has('other.example') && b.peerTrusted.has('other.example'));
  check('same for sites opened without https', !b.httpOk.has('old-router.example') && b.peerHttp.has('old-router.example'));
  b.takeLists({ trusted: ['other.example'], httpOk: [] });
  check('a site taken off there comes off here', !b.trusted.has('mine.example') && b.peerTrusted.has('other.example') && !b.peerHttp.has('old-router.example'));
  const b2 = mk();
  check('it is remembered after a restart', b2.peerTrusted.has('other.example') && !b2.trusted.has('other.example'));
  console.log(bad ? `${bad} FAILED` : 'ALL PASS'); app.exit(bad ? 1 : 0);
});
