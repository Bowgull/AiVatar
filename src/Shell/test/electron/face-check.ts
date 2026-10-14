// His ask (2026-10-14): "the thumbnail of a youtube account present if aang is speaking to me", and for any website or
// email too. The real bubble page, off screen, is sent a notice carrying a real channel picture (fetched the way the
// brain fetches it); the picture and the name must sit on the row above the text, and a non-picture is refused.
//
// Run: npx electron test/electron/face-check.ts   (SHOT=<png> to keep a picture of it)
import { app, BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { Faces } from '../../../Core/src/faces.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d : ''}`); if (!ok) bad++; };

app.whenReady().then(async () => {
  const img = await new Faces().channel('UCu6xqwLxixO-UidWIQzTHlg');
  check('the channel picture was fetched', Boolean(img));
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const w = new BrowserWindow({ width: 520, height: 400, show: false, frame: false, webPreferences: { preload: path.join(HERE, 'bubble-stub.cjs'), contextIsolation: false, sandbox: false, offscreen: true } });
  w.setPosition(-6000, 100);
  w.showInactive();
  await w.loadURL(`${pages.origin}/bubble.html`);
  await wait(800);
  const js = (s: string) => w.webContents.executeJavaScript(s, true);

  await js(`window.__deliver(${JSON.stringify({ t: 'bubble', text: 'HisWattson just posted: HisWattson finally locks in...', stream: false, proactive: true, turn: 1037, face: { img, name: 'HisWattson' } })})`);
  await wait(3000);
  const row = await js(`(() => { const s = document.getElementById('speaker'); const i = s && s.querySelector('img.face'); return s && { hidden: s.hidden, name: s.textContent, loaded: !!i && i.naturalWidth > 0, w: i && i.getBoundingClientRect().width }; })()`) as any;
  check('the picture shows on the row above the text', row && !row.hidden && row.loaded, JSON.stringify(row));
  check('with the channel name', row?.name === 'HISWATTSON', row?.name);
  if (process.env.SHOT) writeFileSync(process.env.SHOT, (await w.webContents.capturePage()).toPNG());

  // Only a picture: anything else in `face` is dropped.
  await js(`window.__deliver(${JSON.stringify({ t: 'bubble', text: 'Something else.', stream: false, proactive: true, face: { img: 'https://evil.example/x.png', name: 'Evil' } })})`);
  await wait(2000);
  check('a web address in place of a picture is refused', (await js(`document.getElementById('speaker').hidden && !document.querySelector('#speaker img.face')`)) === true);

  pages.close();
  console.log(bad ? `${bad} failed` : 'all passed');
  setTimeout(() => app.exit(bad ? 1 : 0), 300);
});
