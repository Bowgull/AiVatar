// Code audit L10 (2026-10-14): the key that scrambles Bitwarden's site list is kept under Windows' own lock, not beside
// the list; an older file with the key in plain text is locked the first time Samara starts, the list unchanged.
//
// Run: npx electron test/electron/vaultkey-check.ts
import { app, BrowserWindow } from 'electron';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d.slice(0, 200) : ''}`); if (!ok) bad++; };

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const dir = mkdtempSync(path.join(os.tmpdir(), 'vk-'));
  writeFileSync(path.join(dir, 'vault-sites.json'), JSON.stringify({ key: 'a'.repeat(64), sites: ['x1', 'x2'] }));
  const mk = () => new AangBrowser({ origin: pages.origin, stateDir: dir, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') }) as any;
  const b1 = mk();
  const f = JSON.parse(readFileSync(path.join(dir, 'vault-sites.json'), 'utf8'));
  check('an old plain key is locked at once, the list unchanged', typeof f.keyLocked === 'string' && f.key === undefined && f.sites.join() === 'x1,x2' && b1.siteKey === 'a'.repeat(64), JSON.stringify(Object.keys(f)));
  const b2 = mk();
  check('the next start unlocks it to the same key', b2.siteKey === 'a'.repeat(64) && b2.sites.size === 2);
  console.log(bad ? `${bad} FAILED` : 'ALL PASS'); app.exit(bad ? 1 : 0);
});
