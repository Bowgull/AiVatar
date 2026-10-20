// A click on Aang brings back whatever the bubble last showed (his rule, 2026-10-20): the morning brief, a card, a
// reply. With nothing shown yet, the page says so and the click opens the chat box instead.
//
// Run: npx electron test/electron/bubble-recall-check.ts
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
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d.slice(0, 200) : ''}`); if (!ok) bad++; };

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const w = new BrowserWindow({ width: 700, height: 820, show: false, frame: false, transparent: true, webPreferences: { preload: path.join(HERE, 'bubble-stub.cjs'), contextIsolation: false, sandbox: false, offscreen: true } });
  w.setPosition(-6000, 100); w.showInactive();
  await w.loadURL(`${pages.origin}/bubble.html`); await wait(800);
  const js = (s: string) => w.webContents.executeJavaScript(s, true);

  await js(`window.__recall(); true`); await wait(200);
  check('nothing shown yet: the page says so (the click opens the chat box)', (await js('window.__recalled')) === false);

  await js(`window.__deliver({ t: 'bubble', text: '', brief: { day: 'Tuesday', date: 'October 20', events: [], parts: [], mail: [], jobs: [], waiting: [] } })`); await wait(600);
  await js(`document.querySelector('.briefcard').hidden = true; true`);
  await js(`window.__recall(); true`); await wait(600);
  check('the morning brief comes back', (await js('window.__recalled')) === true && (await js(`!document.querySelector('.briefcard').hidden`)) === true);

  await js(`window.__deliver({ t: 'bubble', text: 'HisWattson posted a new video: Wattson ranked guide.', stream: false })`); await wait(1500);
  await js(`document.getElementById('said').textContent = ''; true`);
  await js(`window.__recall(); true`); await wait(2500);
  const said = String(await js(`document.getElementById('bubble').innerText`));
  check('a reply comes back, word for word', /HisWattson posted a new video/.test(said), said.slice(0, 120));
  console.log(bad ? `${bad} FAILED` : 'ALL PASS'); app.exit(bad ? 1 : 0);
});
