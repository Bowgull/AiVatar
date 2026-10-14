// Pictures of every Settings section, off screen, for checking how it looks (never on his screen).
// Run: npx electron test/electron/settings-shot.ts   (pictures go to the temp folder: settings-<section>.png)
import { app, BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();
app.on('window-all-closed', () => { /* the script decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const w = new BrowserWindow({ show: false, width: 1100, height: 900, webPreferences: { offscreen: true } });
  await w.loadURL(`${pages.origin}/settings.html`);
  await wait(500);
  for (const sec of ['general', 'bookmarks', 'passwords', 'privacy', 'sound', 'about']) {
    await w.webContents.executeJavaScript(`for (const s of document.querySelectorAll('section[data-sec]')) s.hidden = s.dataset.sec !== ${JSON.stringify(sec)}; 1`);
    await wait(300);
    writeFileSync(path.join(os.tmpdir(), `settings-${sec}.png`), (await w.webContents.capturePage()).toPNG());
  }
  console.log('done');
  app.exit(0);
});
