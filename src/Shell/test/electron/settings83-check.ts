// Sheet 83 v2 (2026-10-23): the real Settings page, off screen, with a stand-in for its doors. Checks the chapters, the
// ‹ › values, the home page row, the half-second help line, the address lookup, the PIN slots and eye; takes pictures.
// Run: npx electron test/electron/settings83-check.ts <folder for pictures>
import { app, BrowserWindow } from 'electron';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + (e as Error).stack); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'settings83-')));
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(process.argv[process.argv.length - 1] ?? os.tmpdir());
mkdirSync(OUT, { recursive: true });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const w = new BrowserWindow({ show: false, width: 1100, height: 720, webPreferences: { offscreen: true, preload: path.join(HERE, 'settings83-stub.cjs') } });
  await w.loadURL(`${pages.origin}/settings.html`);
  await wait(600);
  const js = (c: string) => w.webContents.executeJavaScript(c);
  let bad = 0;
  const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${d ? ' (' + d + ')' : ''}`); if (!ok) bad++; };
  const shot = async (n: string) => writeFileSync(path.join(OUT, `s83-${n}.png`), (await w.webContents.capturePage()).toPNG());
  const go = (sec: string) => js(`document.querySelector('.side a[data-sec="${sec}"]').click()`);

  check('seven chapters, no search box', (await js(`document.querySelectorAll('.side a').length`)) === 7 && !(await js(`!!document.getElementById('find')`)));
  check('no grey line under any row', (await js(`document.querySelectorAll('.r small').length`)) === 0);
  check('home page row shows what is saved', (await js(`document.getElementById('homev').textContent`)) === 'search.brave.com');
  check('When Samara opens says My tabs', (await js(`document.querySelector('[data-cyc=startup] .v').textContent`)) === 'My tabs');
  await shot('start');
  await js(`document.getElementById('homerow').click()`);
  check('a click on it opens the box with it in', (await js(`document.getElementById('homein').value`)) === 'search.brave.com' && !(await js(`document.getElementById('homeedit').hidden`)));
  await js(`(() => { const i = document.getElementById('homein'); i.value = 'reddit.com'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); })()`);
  check('Enter saves reddit.com', (await js(`__sent()`)).includes('"key":"home","value":"reddit.com"'));
  await js(`document.querySelector('[data-cyc=startup] .ar[aria-label=Next]').click()`);
  check('› moves My tabs to Home page', (await js(`document.querySelector('[data-cyc=startup] .v').textContent`)) === 'Home page' && (await js(`__sent()`)).includes('"key":"startup","value":"home"'));

  // the help line waits half a second
  await go('look');
  await js(`document.querySelector('[data-cyc=dark]').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))`);
  await wait(200);
  check('no help line yet after 0.2 s', (await js(`document.getElementById('help').textContent`)) === '');
  await wait(450);
  check('help line after half a second', (await js(`document.getElementById('help').textContent`)).startsWith('Websites shown dark'));
  await shot('look-help');

  for (const s of ['search', 'autofill', 'privacy', 'sounds', 'about']) { await go(s); await wait(150); await shot(s); }

  // details: the address lookup
  await go('autofill');
  await js(`document.querySelector('[data-go=details]').click()`);
  await js(`(() => { const i = document.getElementById('af-street'); i.focus(); i.value = '100 Queen'; i.dispatchEvent(new Event('input')); })()`);
  await wait(700);
  check('the lookup shows addresses to pick', (await js(`document.querySelectorAll('#sug div').length`)) === 2);
  await shot('details-lookup');
  await js(`document.querySelector('#sug div').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);
  await wait(150);
  const got = await js(`['street','city','region','postal','country'].map(k => document.getElementById('af-' + k).value).join('|')`);
  check('picking it fills the rest', got === '100 Queen Street West|Toronto|Ontario|M5H 2N2|Canada', got);
  check('each filled box has its tick', (await js(`[...document.querySelectorAll('[data-ok]')].filter(t => !t.hidden).length`)) === 5);
  check('and it is kept at once', (await js(`__sent()`)).includes('"postal":"M5H 2N2"'));
  await shot('details-picked');
  await js(`(() => { for (const [k, v] of [['given', 'Mary Ann'], ['family', 'van der Berg']]) { const i = document.getElementById('af-' + k); i.value = v; i.dispatchEvent(new Event('change')); } })()`);
  check('first and last name are two boxes, kept as typed', (await js(`__sent()`)).includes('"given":"Mary Ann","family":"van der Berg"'));

  // PIN
  await js(`document.querySelector('[data-back]:not([hidden])') ; document.querySelector('section[data-sec=details] [data-back]').click()`);
  await js(`document.querySelector('[data-go=pin]').click()`);
  await wait(100);
  check('PIN starts at 6 slots', (await js(`document.querySelectorAll('#pin1 i').length`)) === 6);
  for (let i = 0; i < 3; i++) await js(`document.querySelector('[data-len="1"]').click()`);
  check('it goes no longer than 8', (await js(`document.querySelectorAll('#pin1 i').length`)) === 8);
  for (let i = 0; i < 6; i++) await js(`document.querySelector('[data-len="-1"]').click()`);
  check('and no shorter than 4', (await js(`document.querySelectorAll('#pin1 i').length`)) === 4);
  await js(`document.querySelector('[data-len="1"]').click(); document.querySelector('[data-len="1"]').click()`);
  for (const d of '4817') await js(`document.getElementById('pin1').dispatchEvent(new KeyboardEvent('keydown', { key: '${d}', bubbles: true }))`);
  check('typed numbers are hidden', (await js(`[...document.querySelectorAll('#pin1 i.f')].map(i => i.textContent).join('')`)) === '●●●●');
  await js(`document.getElementById('eye').click()`);
  check('the eye shows them', (await js(`[...document.querySelectorAll('#pin1 i.f')].map(i => i.textContent).join('')`)) === '4817');
  await shot('pin');
  for (const d of '48') await js(`document.getElementById('pin1').dispatchEvent(new KeyboardEvent('keydown', { key: '${d}', bubbles: true }))`);
  for (const d of '481748') await js(`document.getElementById('pin1').dispatchEvent(new KeyboardEvent('keydown', { key: '${d}', bubbles: true }))`);
  check('both typed: it is sent to be set', (await js(`__sent()`)).includes('"pin":"481748","again":"481748"'));

  // Bitwarden
  await js(`document.querySelector('section[data-sec=pin] [data-back]').click(); document.querySelector('[data-go=bw]').click()`);
  await js(`document.querySelector('[data-cyc=lockAfter] .ar[aria-label=Next]').click()`);
  check('lock time moves to 2 hours', (await js(`document.querySelector('[data-cyc=lockAfter] .v').textContent`)) === '2 hours');
  await shot('bw');
  w.destroy(); pages.close();
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  app.exit(bad ? 1 : 0);
});
