// P1 (2026-11-17, his call): Samara crashed, so it stays closed and Aang tells him. In the real bubble page: the card says
// "Samara closed unexpectedly." with Reopen (A, gold) and Not now (Z), and Reopen answers {t: 'samara.down', choice:
// 'reopen'}, which Aang's windows act on (main.ts answerAsk opens Samara). Off screen, with the test stand-in for Aang's doors.
//
// Run on the hidden desktop, from src/Shell:
//   powershell -NoProfile -ExecutionPolicy Bypass -File tools/hidden-desktop-run.ps1 -Command "npx electron test/electron/samara-down-check.ts"
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d.slice(0, 300) : ''}`); if (!ok) bad++; };

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const w = new BrowserWindow({ width: 700, height: 600, show: false, frame: false, transparent: true, webPreferences: { preload: path.join(HERE, 'bubble-stub.cjs'), contextIsolation: false, sandbox: false, offscreen: true } });
  w.setPosition(-6000, 100);
  w.showInactive();
  await w.loadURL(`${pages.origin}/bubble.html`);
  await wait(800);
  const js = (s: string) => w.webContents.executeJavaScript(s, true);

  await js(`window.__deliver({ t: 'samara.down', id: 'samara-down-4242' })`);
  await wait(700);
  const shown = await js(`({ said: document.getElementById('said')?.textContent, means: document.getElementById('means')?.textContent,
    keys: [...document.querySelectorAll('#asks button')].map((b) => b.firstChild.textContent + ':' + b.className) })`);
  check('the card says Samara closed unexpectedly, and that it stays closed', shown.said === 'Samara closed unexpectedly.' && /stays closed/.test(shown.means ?? ''), JSON.stringify(shown));
  check('Reopen (gold) and Not now', /^Reopen:.*primary/.test(shown.keys[0] ?? '') && /^Not now:/.test(shown.keys[1] ?? '') && shown.keys.length === 2, JSON.stringify(shown.keys));

  await wait(650);   // the 600 ms guard on new keys
  await js(`[...document.querySelectorAll('#asks button')][0].click()`); await wait(300);
  const a = (await js(`window.__sent.filter(([k]) => k === 'answerAsk').map(([, a]) => a[0])`)).at(-1);
  check('Reopen answers samara.down / reopen to Aang\'s windows', a?.t === 'samara.down' && a?.choice === 'reopen' && a?.id === 'samara-down-4242', JSON.stringify(a));
  const gone = await js(`document.querySelectorAll('#asks button').length`);
  check('and the card goes', gone === 0, String(gone));

  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  app.exit(bad ? 1 : 0);
});
