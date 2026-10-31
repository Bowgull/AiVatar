// Can this engine play protected (Widevine) video at all? Off screen, nothing on his screen. Run with the stock
// engine (Samara) and with the castLabs one (the paid-video runtime) to compare.
//
// Run: npx electron test/electron/drm-check.ts            (stock)
//      node_modules/electron-drm/dist/electron.exe test/electron/drm-check.ts   (castLabs)
import { app, BrowserWindow } from 'electron';
import { mkdtempSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + (e as Error).stack); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'drm-check-')));

app.whenReady().then(async () => {
  const el = await import('electron') as any;
  let status = 'no components (stock engine)';
  if (el.components?.whenReady) {
    try { await el.components.whenReady(); status = JSON.stringify(el.components.status()); } catch (e) { status = 'widevine did not load: ' + (e as Error).message; }
  }
  const srv = http.createServer((_q, r) => r.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>x</title>'));
  await new Promise<void>(r => srv.listen(0, '127.0.0.1', () => r()));
  const port = (srv.address() as any).port;
  const w = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await w.loadURL(`http://127.0.0.1:${port}/`);
  const eme = await w.webContents.executeJavaScript(`navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{ initDataTypes: ['cenc'], videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }] }]).then(a => 'Widevine available (' + a.keySystem + ')', e => 'Widevine NOT available: ' + e.message)`, true);
  console.log(`engine ${process.versions.electron} | components: ${status} | ${eme}`);
  w.destroy(); srv.close();
  app.exit(0);
});
