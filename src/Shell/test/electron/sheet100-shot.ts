// Sheet 100: a full picture of the sheet, to check it before he sees it.
// Run: npx electron test/electron/sheet100-shot.ts -ApplePersistenceIgnoreState YES <out.png>
import { app, BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const out = process.argv[process.argv.length - 1]!;
const sheet = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'docs', 'cockpit', 'sheet-100-trail-browse.html');
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, width: 1300, height: 900, webPreferences: { backgroundThrottling: false } });
  w.webContents.on('console-message', (_e, _l, m) => console.log('page: ' + m));
  await w.loadFile(sheet);
  await new Promise((r) => setTimeout(r, 1500));
  const h = await w.webContents.executeJavaScript('document.documentElement.scrollHeight');
  w.setContentSize(1300, Math.min(h, 7000));
  await new Promise((r) => setTimeout(r, 800));
  writeFileSync(out, (await w.webContents.capturePage()).toPNG());
  console.log('height ' + h);
  app.exit(0);
});
