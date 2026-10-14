// The update key, everything-update (2026-10-14): the tray shows a title, what it covers, what is new and the checks
// it passed (sheet 18's ticks), and says why when Restart now cannot go ahead. The engine-only tray is unchanged.
//
// Run: npx electron test/electron/uptray-check.ts
import { app, BrowserWindow, screen } from 'electron';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { AangBrowser } from '../../src/browser.ts';
import { wireBrowser } from '../../src/browseripc.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* not in a test */ };
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d : ''}`); if (!ok) bad++; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'uptray-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') });
  wireBrowser(() => b);
  b.open('about:blank'); await wait(2500);
  const w = (b as any).win as BrowserWindow;
  const js = (s: string) => w.webContents.executeJavaScript(s);
  check('the window is called Samara', /Samara$/.test(w.getTitle()) && (await w.webContents.executeJavaScript('document.title')) === 'Samara', w.getTitle());
  b.setUpdate({ version: 'abc', since: Date.now() - 5 * 86_400_000, title: 'Aang update', kind: 'Aang, his browser and everything on this Mac',
    notes: ['Job hunt tweaks: AE flagged', 'STOP takes two presses'], checks: ['Comes from your PC over your locked, private connection', 'Checked against its fingerprint before it installs'] });
  await wait(500);
  const pulse = await js(`getComputedStyle(document.querySelector('#upkey .w')).animationName`);
  check('the word pulses warm while it waits', pulse === 'upwarm', String(pulse));
  const arrow = await js(`getComputedStyle(document.querySelector('#upkey svg')).animationName`);
  check('the arrow glows and pulses with it', arrow === 'upwarmarrow', String(arrow));
  await js(`document.getElementById('upkey').click()`); await wait(300);
  const still = await js(`getComputedStyle(document.querySelector('#upkey .w')).animationName`);
  check('and stops pulsing while the tray is open', still === 'none', String(still));
  const t = await js(`({ open: !document.getElementById('uptray').hidden, name: document.getElementById('upname').textContent, kind: document.getElementById('upkind').textContent,
    notes: [...document.querySelectorAll('#upnotes li')].map(l => l.textContent), ticks: [...document.querySelectorAll('#uplines .tick')].length, lines: document.getElementById('uplines').textContent,
    title: document.getElementById('upkey').title, age: document.getElementById('upkey').className })`);
  check('the key shows, amber after 4 days', !String(t.age).includes('away') && String(t.age).includes('age1'), t.age);
  check('the tray says what it is and what it covers', t.open && t.name === 'Aang update' && /everything on this Mac/.test(t.kind), `${t.name} / ${t.kind}`);
  check("what's new is listed", JSON.stringify(t.notes) === JSON.stringify(['Job hunt tweaks: AE flagged', 'STOP takes two presses']), JSON.stringify(t.notes));
  check('each check it passed has its tick', t.ticks === 2 && /locked, private connection/.test(t.lines), `${t.ticks} ticks`);
  check('the hover says "Update ready"', /^Update ready, waiting 5 days$/.test(t.title), t.title);
  b.updateWhy("Your PC isn't reachable right now.");
  await wait(300);
  const why = await js(`({ shown: !document.getElementById('upwhy').hidden, text: document.getElementById('upwhy').textContent })`);
  check('why Restart now could not go ahead is said in the tray', why.shown && /isn't reachable/.test(why.text), why.text);
  b.setUpdate({ version: '44.9.0', since: Date.now() });
  await wait(400);
  const e = await js(`({ name: document.getElementById('upname').textContent, kind: document.getElementById('upkind').textContent, notes: document.getElementById('upnotes').hidden })`);
  check('the engine-only update still reads as before', e.name === 'Browser engine 44.9.0' && /browser engine/.test(e.kind) && e.notes === true, `${e.name} / ${e.kind}`);
  (b as any).closeAll?.(); pages.close();
  console.log(bad ? `${bad} failed` : 'all passed');
  setTimeout(() => app.exit(bad ? 1 : 0), 500);
});
