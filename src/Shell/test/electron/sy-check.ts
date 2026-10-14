// SY (his "sync everything", 2026-10-14): the lists he makes in one browser arrive in the other, money sites never travel.
// Two real browsers off screen; what one hands the sync is given to the other, as the brain would pass it on.
//
// Run: npx electron test/electron/sy-check.ts
import { app, BrowserWindow, screen } from 'electron';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { AangBrowser } from '../../src/browser.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* not in a test */ };
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d : ''}`); if (!ok) bad++; };

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const make = () => new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'sy-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') });
  const pc = make() as any, mac = make() as any;
  pc.popupOk.add('twitch.tv'); pc.trusted.add('github.com'); pc.httpOk.add('192.168.1.10'); pc.paused.add('youtube.com');
  pc.prefs.dark = false; pc.prefs.darkOff = ['reddit.com'];
  pc.stash = [{ id: 7, name: 'Raid prep', at: 1, tabs: [{ url: 'https://wowhead.com/x', title: 'Wowhead' }, { url: 'https://www.rbcroyalbank.com/accounts', title: 'Bank' }] }];
  const sent = JSON.parse(JSON.stringify(pc.syncTarget.prefs()));
  check('the bank tab never leaves the PC', !JSON.stringify(sent).includes('rbcroyalbank'));
  mac.syncTarget.setPrefs(sent);
  check('popups allowed on the same sites', mac.popupOk.has('twitch.tv'));
  check('downloads trusted from the same sites', mac.trusted.has('github.com'));
  check('the same plain-http exceptions', mac.httpOk.has('192.168.1.10'));
  check('ads paused on the same sites', mac.paused.has('youtube.com'));
  check('dark mode setting and its exceptions', mac.prefs.dark === false && mac.prefs.darkOff.includes('reddit.com'));
  check('the stashed trail, without the bank tab', mac.stash.length === 1 && mac.stash[0].tabs.length === 1 && mac.stash[0].name === 'Raid prep', JSON.stringify(mac.stash));
  mac.syncTarget.setPrefs({ ...sent, lists: { ...sent.lists, popupOk: ['ok.example', 'not a host!', 42] } });
  check('a bad entry from the other side is dropped', [...mac.popupOk].join() === 'ok.example', [...mac.popupOk].join());
  pages.close();
  console.log(bad ? `${bad} failed` : 'all passed');
  setTimeout(() => app.exit(bad ? 1 : 0), 300);
});
