// 2026-10-22 (his yes): at most three finished jobs in the bubble's list. When a fourth finishes, the oldest is read by
// itself and its card folds away gently (the X's fold without the bounce), never a jump.
//
// The real bubble.html through the test preload, as done-cards-check.ts drives it: three done cards, then the brain's
// list with a fourth (the brain already dropped the oldest, claudelink.ts MAX_UNREAD), then an older brain that still
// sends four (the page reads the oldest itself and tells the brain).
//
// Off screen, never focused, no real input. Run (from src/Shell): npx electron test/electron/four-done-check.ts
import { app, BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';

dialog.showErrorBox = (t: string, c: string) => { console.log('HARNESS DIALOG ' + t + ' ' + c); };
process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + String(d).slice(0, 240) : ''}`); if (!ok) bad++; };

const now = Date.now();
const done = (n: number, ago: number) => ({ id: 's-d' + n, machine: 'pc', project: 'Job ' + n, phase: 'ended', startedAt: now - ago - 60000, prompt: 'Job number ' + n,
  tasks: [], open: 'claude://claude.ai/epitaxy/s-d' + n, unread: true, doneAt: now - ago });
const D1 = done(1, 30 * 60000), D2 = done(2, 20 * 60000), D3 = done(3, 10 * 60000), D4 = done(4, 1000), D5 = done(5, 500);

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const w = new BrowserWindow({ width: 900, height: 820, show: false, frame: false, useContentSize: true,
    webPreferences: { preload: path.join(HERE, 'cockpit-stub.cjs'), contextIsolation: false, sandbox: false, offscreen: true } });
  w.setPosition(-6000, 100); w.showInactive();
  const errors: string[] = [];
  w.webContents.on('console-message', (e) => { const m = e as unknown as { message?: string; level?: string }; if (m.level === 'error') errors.push(String(m.message)); });
  try {
    await w.loadURL(`${pages.origin}/bubble.html`);
    await wait(700);
    const js = (s: string) => w.webContents.executeJavaScript(s, true);
    await js(`window.__fire('onAim', { x: 700, y: 700, flip: false }); true`);
    const cards = () => js(`[...document.querySelectorAll('#ckjobs .jdone')].filter((d) => !d.classList.contains('ck-leaving')).map((d) => d.dataset.id)`) as Promise<string[]>;
    const all = () => js(`[...document.querySelectorAll('#ckjobs .jdone')].map((d) => d.dataset.id)`) as Promise<string[]>;
    const card = (id: string) => js(`(() => { const d = document.querySelector('#ckjobs .jdone[data-id="${id}"]'); if (!d) return null;
      return { h: d.getBoundingClientRect().height, op: Number(getComputedStyle(d).opacity), bounce: d.classList.contains('bounce'), going: d.classList.contains('going') }; })()`) as Promise<{ h: number; op: number; bounce: boolean; going: boolean } | null>;
    const acks = async () => (await js(`window.__sent.filter(s => s[0] === 'claude').map(s => s[1][0]).filter(m => m.t === 'claude.ackdone').map(m => m.id)`)) as string[];
    const jobs = (list: unknown[]) => js(`window.__deliver({ t: 'claude.jobs', jobs: ${JSON.stringify(list)} }); true`);

    await jobs([D1, D2, D3]); await wait(200);
    await js(`window.__fire('onRecall', 'jobs')`); await wait(1500);
    check('three done cards, newest first', JSON.stringify(await cards()) === JSON.stringify([D3.id, D2.id, D1.id]), JSON.stringify(await cards()));
    const full = (await card(D1.id))?.h ?? 0;

    // The brain's list after a fourth finished: it already dropped the oldest.
    await js(`window.__sent.length = 0; true`);
    await jobs([D4, D3, D2]);
    await wait(15);
    const start = await card(D1.id);
    await wait(170);
    const mid = await card(D1.id);
    check('the oldest is still there at first, at full height (no jump)', !!start && Math.abs(start.h - full) < 1, JSON.stringify([start, full]));
    check('then it fades and folds gently, mid-way, with no bounce', !!mid && mid.going && !mid.bounce && mid.h > 0 && mid.h < full && mid.op < 1, JSON.stringify(mid));
    await wait(700);
    check('three left: the new one on top, the oldest gone', JSON.stringify(await all()) === JSON.stringify([D4.id, D3.id, D2.id]), JSON.stringify(await all()));
    check('no ack from the page (the brain read it itself)', !(await acks()).length, JSON.stringify(await acks()));

    // An older brain that still sends four: the page reads the oldest and tells the brain, with the same gentle fold.
    await js(`window.__sent.length = 0; true`);
    await jobs([D5, D4, D3, D2]);
    await wait(15);
    check('an older brain with four: the new one on top, the oldest last and on its way out', JSON.stringify(await all()) === JSON.stringify([D5.id, D4.id, D3.id, D2.id]), JSON.stringify(await all()));
    await wait(900);
    check('...and the oldest is acked to the brain and folded away', JSON.stringify(await acks()) === JSON.stringify([D2.id]) && JSON.stringify(await all()) === JSON.stringify([D5.id, D4.id, D3.id]),
      JSON.stringify([await acks(), await all()]));
    // The brain catches up and drops it: nothing moves again.
    await jobs([D5, D4, D3]); await wait(500);
    check('the brain catching up changes nothing', JSON.stringify(await all()) === JSON.stringify([D5.id, D4.id, D3.id]) && JSON.stringify(await acks()) === JSON.stringify([D2.id]));
    check('no page errors', !errors.length, errors.join(' | '));
  } finally {
    for (const b of BrowserWindow.getAllWindows()) b.destroy();
    pages.close();
  }
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  setTimeout(() => app.exit(bad ? 1 : 0), 200);
});
