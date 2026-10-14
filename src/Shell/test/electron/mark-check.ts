// His ask (2026-10-14): name a bookmark as it is saved. The star saves the page and opens its panel with the name ready
// to type over; Enter or Done keeps the new name; the star on a saved page opens the same panel; Remove takes it off.
//
// Run: npx electron test/electron/mark-check.ts
import { app, BrowserWindow } from 'electron';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { AangBrowser } from '../../src/browser.ts';
import { wireBrowser } from '../../src/browseripc.ts';

const PORT = 47920;
app.commandLine.appendSwitch('host-resolver-rules', `MAP www.recipes.example 127.0.0.1:${PORT}`);
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

app.whenReady().then(async () => {
  const site = http.createServer((_q, r) => { r.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Grandma Rose | The Best Lasagna Ever | Recipes Example</title><p>Lasagna</p>'); });
  await new Promise<void>((r) => site.listen(PORT, '127.0.0.1', () => r()));
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'mark-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') }) as any;
  wireBrowser(() => b);
  b.open(`http://www.recipes.example:${PORT}/lasagna`); await wait(2500);
  const w = b.win as BrowserWindow;
  const js = (s: string) => w.webContents.executeJavaScript(s);
  await js(`document.getElementById('star').click()`); await wait(500);
  const p1 = await js(`({ open: !document.getElementById('markpanel').hidden, head: document.getElementById('markhead').textContent, name: document.getElementById('markname').value,
    selected: document.getElementById('markname').selectionEnd - document.getElementById('markname').selectionStart })`);
  check('the star saves the page and opens its panel with the name ready to type over', p1.open && p1.head === 'Bookmark saved' && /Lasagna/.test(p1.name) && p1.selected === p1.name.length && b.marks.length === 1, JSON.stringify(p1));
  await js(`(() => { const n = document.getElementById('markname'); n.value = "Grandma's lasagna"; n.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`); await wait(400);
  check('Enter keeps his name', b.marks[0].title === "Grandma's lasagna" && await js(`document.getElementById('markpanel').hidden`), b.marks[0].title);
  await js(`document.getElementById('star').click()`); await wait(400);
  const p2 = await js(`({ head: document.getElementById('markhead').textContent, name: document.getElementById('markname').value })`);
  check('the star on a saved page opens it to rename, with his name', p2.head === 'Bookmark' && p2.name === "Grandma's lasagna" && b.marks.length === 1, JSON.stringify(p2));
  await js(`document.getElementById('markremove').click()`); await wait(400);
  check('Remove takes it off', b.marks.length === 0 && await js(`document.getElementById('markpanel').hidden`));
  console.log(bad ? `${bad} FAILED` : 'ALL PASS'); app.exit(bad ? 1 : 0);
});
