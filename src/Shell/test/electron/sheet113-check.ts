// Sheet 113 as built (2026-10-31): Samara's real Mockups page with the made-up tree of sheet 112 (sheet112-preload.cjs).
// Types in the search, taps a mark, switches the sort, and checks what the list shows; writes a picture of each step.
// Run (from src/Shell): npx electron test/electron/sheet113-check.ts <out-folder>
import { app, BrowserWindow, screen } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + (e as Error).message); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.on('window-all-closed', () => {});
app.dock?.hide();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d : ''}`); if (!ok) bad++; };
app.whenReady().then(async () => {
  const out = process.argv.at(-1)!; mkdirSync(out, { recursive: true });
  const { servePages } = await import('../../src/pageserver.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const d = screen.getAllDisplays().find((x) => x.id !== screen.getPrimaryDisplay().id)?.bounds;
  const w = new BrowserWindow({ width: 1100, height: 820, show: false, x: d ? d.x + 20 : -6000, y: 100, focusable: false,
    webPreferences: { preload: path.join(HERE, 'sheet112-preload.cjs'), contextIsolation: false, sandbox: false } });
  await w.loadURL(`${pages.origin}/mocklog.html`);
  await wait(1000);
  const js = (s: string) => w.webContents.executeJavaScript(s);
  const rows = () => js(`[...document.querySelectorAll('#list .sh .nm')].map((x) => x.textContent)`) as Promise<string[]>;
  const shot = async (name: string) => { const r = await js(`(() => { const l = document.querySelector('.side').getBoundingClientRect(); return { x: Math.round(l.left), y: Math.round(l.top), w: Math.round(l.width), h: Math.round(l.height) }; })()`);
    writeFileSync(path.join(out, name + '.png'), (await w.webContents.capturePage({ x: r.x, y: r.y, width: r.w, height: Math.min(r.h, 640) })).toPNG()); };
  const heads = await js(`[...document.querySelectorAll('#list .topic')].map((x) => x.textContent)`);
  check('New sits first, with the two unopened sheets', heads[0] === 'New2' && (await rows()).slice(0, 2).join() === "Claude's tabs in the list,Stop per tab", heads.join('|'));
  check('a new sheet is not also in its topic', (await rows()).filter((n) => n === 'Stop per tab').length === 1);
  await shot('top');
  await js(`(() => { const q = document.querySelector('#find input'); q.value = 'tab'; q.dispatchEvent(new Event('input')); return 1; })()`);
  await wait(200);
  const tab = await rows();
  check('search "tab" shows only the matches', tab.length === 3 && tab.every((n) => /tab/i.test(n)), tab.join(', '));
  check('the match lights up', (await js(`document.querySelectorAll('#list .nm .hl').length`)) === 3);
  check('the box keeps its typing through redraws', (await js(`document.querySelector('#find input').value`)) === 'tab');
  await shot('search');
  await js(`(() => { const q = document.querySelector('#find input'); q.value = '10'; q.dispatchEvent(new Event('input')); return 1; })()`);
  await wait(200);
  check('a number finds by number (102, 104, 106, 107, 109)', (await rows()).length === 5, (await rows()).join(', '));
  await js(`(() => { const q = document.querySelector('#find input'); q.value = ''; q.dispatchEvent(new Event('input')); [...document.querySelectorAll('#find .mk')].find((b) => b.textContent === 'FIX').click(); return 1; })()`);
  await wait(200);
  check('FIX shows only fixes', (await rows()).join() === 'Pixel edges', (await rows()).join(', '));
  await js(`[...document.querySelectorAll('#find .mk')].find((b) => b.textContent === 'PARKED').click(); 1`);
  await wait(200);
  check('two marks mix', (await rows()).length === 2, (await rows()).join(', '));
  await shot('filter');
  await js(`for (const b of document.querySelectorAll('#find .mk.sel')) b.click(); [...document.querySelectorAll('#find .sort button')].find((b) => b.textContent === 'NEWEST').click(); 1`);
  await wait(200);
  check('Newest is one list, no headings', (await js(`document.querySelectorAll('#list .topic').length`)) === 0 && (await rows()).length === 9, String((await rows()).length));
  await shot('newest');
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  app.exit(bad ? 1 : 0);
});
