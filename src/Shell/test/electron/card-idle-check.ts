// Perf sweep (2026-10-22): the card window goes when no card has been asked for in a while, and the next card builds
// it again. Off screen, nothing on his screen; exits on any error.
//
// Run: npx electron test/electron/card-idle-check.ts
import { app, BrowserWindow } from 'electron';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { CardRenderer } from '../../src/cardrender.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + (e as Error).stack); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 40_000).unref();
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'card-idle-')));
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d : ''}`); if (!ok) bad++; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const r = new CardRenderer(pages.origin, { idleMs: 700 });
  const card = { title: 'Delete 3 old test files?', text: 'Nothing else uses them.' };
  const a = await r.render('needs', card);
  check('a card draws', a.ok && (a.png?.length ?? 0) > 1000, a.error);
  check('the window stays right after', r.open);
  // Two at once: the window stays until both are done, then rests.
  const [b, c] = await Promise.all([r.render('needs', card), r.render('quota', { what: 'x', low: 0.01, high: 0.02, week: 0.3, resetsAt: 1792368000 })]);
  check('two cards back to back draw', b.ok && c.ok, `${b.error ?? ''} ${c.error ?? ''}`);
  await wait(300);
  check('still there inside the idle time', r.open);
  await wait(800);
  check('gone once idle', !r.open && BrowserWindow.getAllWindows().length === 0, `${BrowserWindow.getAllWindows().length} windows`);
  const d = await r.render('needs', card);
  check('the next card builds it again', d.ok && r.open, d.error);
  r.close();
  check('close leaves nothing', BrowserWindow.getAllWindows().length === 0);
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  app.exit(bad ? 1 : 0);
}).catch((e) => { console.log('HARNESS ERROR ' + (e as Error).stack); app.exit(2); });
