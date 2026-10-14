// His bank never opens in Samara (2026-10-14): a big plate with one "Open in Chrome" button, never the page.
//
// Run: npx electron test/electron/bank-check.ts
import { app, BrowserWindow } from 'electron';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { AangBrowser } from '../../src/browser.ts';
import { wireBrowser } from '../../src/browseripc.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* not in a test */ };
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d : ''}`); if (!ok) bad++; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'bank-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') });
  wireBrowser(() => b);
  // never really launch Chrome from a test
  const sent: string[] = []; (b as any).toChrome = (u: string) => sent.push(u);
  b.open('https://www.rbc.com/'); await wait(2500);
  const w = (b as any).win as BrowserWindow;
  const js = (s: string) => w.webContents.executeJavaScript(s);
  const t = (b as any).tabs.find((x: any) => /rbc/.test(x.url));
  const st = await js(`({ bank: !document.getElementById('bankplate').hidden, phish: !document.getElementById('phishplate').hidden, text: document.getElementById('banktext').textContent, btn: document.getElementById('bankchrome').textContent })`);
  check('a bank shows the big plate, not the fake-site one', st.bank && !st.phish, JSON.stringify(st));
  check('it names the site in plain words', /rbc\.com is a bank site/.test(st.text), st.text);
  check('the page itself never loaded', !t?.view || !/rbc/.test(t.view.webContents.getURL()), t?.view?.webContents.getURL());
  check('ordinary sites and PayPal checkout are not stopped; brokers are', (b as any).stopFor('https://www.linkedin.com/').length === 0 && (b as any).stopFor('https://rbc.com./x')[0] === 'YOUR BANK' && (b as any).stopFor('https://www.paypal.com/checkoutnow?token=x').length === 0 && (b as any).stopFor('https://www.wealthsimple.com/')[0] === 'YOUR BANK');
  const img = await w.webContents.capturePage(); writeFileSync(path.join(os.tmpdir(), 'bank-plate.png'), img.toPNG());
  await js(`document.getElementById('bankchrome').click()`); await wait(500);
  check('Open in Chrome hands over the address and clears the tab', sent[0] === 'https://www.rbc.com/' && !(b as any).tabs.some((x: any) => x.blocked?.bank), JSON.stringify(sent));
  console.log(bad ? `${bad} FAILED` : 'ALL PASS'); app.exit(bad ? 1 : 0);
});
