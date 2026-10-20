// His reports (2026-10-20): dark mode came on late on Gmail and LinkedIn; picking a spelling did nothing; and his picks
// for the right-click menu (save link, save image, send to Aang, play in / pop out to the pop-out).
//
// Dark mode: a page that holds its body back for 8 s, like a heavy site still loading, must already be dark at 3 s.
// Menu: the items he picked show where they belong and do what they say. Spelling: Samara's window gets the keyboard
// back before the word is replaced (recorded, never taking the focus from his desktop).
//
// Run: npx electron test/electron/menu-dark-check.ts
import { app, BrowserWindow, screen } from 'electron';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { AangBrowser } from '../../src/browser.ts';
import { wireBrowser } from '../../src/browseripc.ts';

const PORT = 47931;
process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const focused: string[] = [];
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function (this: BrowserWindow) { focused.push(this.getTitle()); };
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d.slice(0, 220) : ''}`); if (!ok) bad++; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const site = http.createServer((q, r) => {
    if (q.url?.startsWith('/slow')) {
      // the head and the start of the page now, the rest in 8 s: dom-ready cannot fire before then
      r.writeHead(200, { 'Content-Type': 'text/html' });
      r.write('<!doctype html><html><head><title>slow</title><style>body{background:#fff;color:#000}</style></head><body><p>Inbox</p>' + ' '.repeat(2048));
      setTimeout(() => r.end('<p>the rest</p></body></html>'), 8000);
      return;
    }
    r.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>plain</title><p>hello</p>');
  });
  await new Promise<void>((r) => site.listen(PORT, '127.0.0.1', () => r()));
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'menu-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs'), testLocal: true }) as any;
  wireBrowser(() => b);
  b.prefs.dark = true; b.prefs.darkOff = [];

  // ---- dark mode from the start
  b.open(`http://127.0.0.1:${PORT}/slow`);
  await wait(3000);
  const t = b.tabs.find((x: any) => x.url.includes('/slow'));
  const wc = t?.view?.webContents;
  const early = wc ? await wc.executeJavaScriptInIsolatedWorld(1002, [{ code: '!!(globalThis.DarkReader && DarkReader.isEnabled())' }]).catch(() => false) : false;
  const state = wc ? await wc.executeJavaScript('document.readyState').catch(() => '') : '';
  // The old code (dark at dom-ready) was still white here; measured side by side 2026-10-20.
  check('the page is dark within 3 s of opening (the old code was still white)', early === true, `dark=${early} page=${state}`);
  await wait(7000);
  const later = wc ? await wc.executeJavaScriptInIsolatedWorld(1002, [{ code: '!!(globalThis.DarkReader && DarkReader.isEnabled())' }]).catch(() => false) : false;
  check('and still dark once it has finished', later === true);

  // ---- the menu
  const P = (o: Record<string, unknown>) => ({ x: 5, y: 5, linkURL: '', srcURL: '', mediaType: 'none', selectionText: '', isEditable: false, misspelledWord: '', dictionarySuggestions: [], editFlags: { canCut: false, canCopy: true, canPaste: false, canSelectAll: true }, ...o });
  const labels = () => (b.menuItems ?? []).filter((i: any) => !i.sep).map((i: any) => i.label);
  b.onPlayInPopout = (u: string) => { played.push(u); };
  const played: string[] = [], toAang: string[] = [], popped: number[] = [], saved: string[] = [];
  b.setPopTab((id: number) => popped.push(id));
  if (wc) wc.downloadURL = (u: string) => { saved.push(u); };

  b.pageMenu(t, P({ linkURL: 'https://www.youtube.com/watch?v=abc' }));
  check('a link: Play in the pop-out and Save link', labels().includes('Play in the pop-out') && labels().includes('Save link'), labels().join(' | '));
  b.menuPick('linkpop'); b.pageMenu(t, P({ linkURL: 'https://www.youtube.com/watch?v=abc' })); b.menuPick('linksave');
  check('Play in the pop-out plays that link there', played[0] === 'https://www.youtube.com/watch?v=abc');
  check('Save link saves it', saved[0] === 'https://www.youtube.com/watch?v=abc');

  b.pageMenu(t, P({ mediaType: 'image', srcURL: 'https://example.com/a.png' }));
  check('a picture: Save image', labels().includes('Save image'), labels().join(' | '));

  b.pageMenu(t, P({ mediaType: 'video', srcURL: 'https://example.com/v.mp4' }));
  check('a video: Pop out this video', labels().includes('Pop out this video'), labels().join(' | '));
  b.menuPick('vidpop');
  check('which pops that tab out, like the pop-out key', popped[0] === t.id);

  b.onSendToAang = null;
  b.pageMenu(t, P({ selectionText: 'some words he picked' }));
  check('highlighted words with Aang not running: no Send to Aang', !labels().includes('Send to Aang'), labels().join(' | '));
  b.onSendToAang = (text: string, from: string) => toAang.push(`${from}: ${text}`);
  b.pageMenu(t, P({ selectionText: 'some words he picked' }));
  check('with Aang running: Send to Aang', labels().includes('Send to Aang'), labels().join(' | '));
  b.menuPick('toaang');
  check('which hands Aang the words and where they came from', toAang[0] === 'Samara, 127.0.0.1: some words he picked', toAang[0] ?? '');

  // ---- the spelling pick
  const replaced: string[] = [];
  if (wc) wc.replaceMisspelling = (s: string) => { replaced.push(s); };
  focused.length = 0;
  b.pageMenu(t, P({ isEditable: true, misspelledWord: 'helo', dictionarySuggestions: ['hello', 'halo'] }));
  check('a misspelled word: its suggestions first', labels()[0] === 'hello' && labels()[1] === 'halo', labels().join(' | '));
  b.menuPick('spell0');
  check('picking one gives Samara’s window the keyboard back first', focused.length > 0, focused.join(','));
  await wait(150);
  check('then replaces the word', replaced[0] === 'hello', replaced.join(','));

  console.log(bad ? `${bad} FAILED` : 'ALL PASS'); app.exit(bad ? 1 : 0);
});
