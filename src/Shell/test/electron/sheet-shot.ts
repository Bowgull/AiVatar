// A picture of a mockup sheet, off screen, for showing him (docs/cockpit). Never on his screen.
// Run: SHEET_URL=... SHEET_OUT=... SHEET_W=1420 npx electron test/electron/sheet-shot.ts (an address as an argument stops Electron)
import { app, BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();
app.on('window-all-closed', () => { /* the script decides */ });
const url = process.env.SHEET_URL, out = process.env.SHEET_OUT, width = process.env.SHEET_W ?? '1400';

app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, width: Number(width), height: 1000, paintWhenInitiallyHidden: true, webPreferences: { offscreen: true } });
  await w.loadURL(url!);
  await new Promise((r) => setTimeout(r, 1500));
  const h = await w.webContents.executeJavaScript('document.documentElement.scrollHeight');
  w.setContentSize(Number(width), Number(h));
  await new Promise((r) => setTimeout(r, 1500));
  const img = await w.webContents.capturePage();
  writeFileSync(out!, img.toPNG());
  console.log('shot ' + JSON.stringify(img.getSize()));
  app.exit(0);
});
