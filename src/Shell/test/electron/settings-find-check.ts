// Search settings (2026-10-13): the real Settings page, off screen, with a word typed into the search field.
// Run: npx electron test/electron/settings-find-check.ts <folder for pictures>
import { app, BrowserWindow } from 'electron';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + (e as Error).stack); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'settings-find-')));
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(process.argv[process.argv.length - 1] ?? os.tmpdir());
mkdirSync(OUT, { recursive: true });
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const w = new BrowserWindow({ show: false, width: 1100, height: 760, webPreferences: { offscreen: true } });
  await w.loadURL(`${pages.origin}/settings.html`);
  await wait(400);
  let bad = 0;
  const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d : ''}`); if (!ok) bad++; };
  const visible = () => w.webContents.executeJavaScript(`[...document.querySelectorAll('.row')].filter(r => r.offsetParent).map(r => r.querySelector('b')?.textContent)`);
  for (const [q, want] of [['search', 'Search engine'], ['ads', ''], ['zzzz', '']] as const) {
    await w.webContents.executeJavaScript(`(() => { const f = document.getElementById('find'); f.value = ${JSON.stringify(q)}; f.dispatchEvent(new Event('input')); })()`);
    await wait(150);
    const rows: string[] = await visible();
    console.log(`  "${q}" shows: ${JSON.stringify(rows)}`);
    if (q === 'zzzz') check('nothing matches: the note says so', rows.length === 0 && await w.webContents.executeJavaScript(`!document.getElementById('nofind').hidden`));
    else check(`"${q}" finds something`, rows.length > 0 && (!want || rows.includes(want)));
    writeFileSync(path.join(OUT, `settings-find-${q}.png`), (await w.webContents.capturePage()).toPNG());
  }
  await w.webContents.executeJavaScript(`(() => { const f = document.getElementById('find'); f.value = ''; f.dispatchEvent(new Event('input')); })()`);
  await wait(100);
  check('clearing it puts the one section back', (await w.webContents.executeJavaScript(`[...document.querySelectorAll('section[data-sec]')].filter(s => !s.hidden).length`)) === 1);
  w.destroy(); pages.close();
  console.log(bad ? `${bad} failed` : 'all passed');
  app.exit(bad ? 1 : 0);
});
