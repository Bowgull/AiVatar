// Passkey go/no-go, the half that needs nobody at the machine (phase 3, 2026-11-17). Asks the engine what it would
// offer a site, WITHOUT starting a ceremony, so no Windows Hello / Touch ID prompt can appear on anyone's screen:
// typeof PublicKeyCredential, isUserVerifyingPlatformAuthenticatorAvailable(), isConditionalMediationAvailable(),
// getClientCapabilities(). The page is plain, with no tabpreload, so this is the engine's own answer.
//
// Run (hidden desktop): npx electron test/electron/passkey-probe.ts                                  (stock)
//                       node_modules/electron-drm/dist/electron.exe test/electron/passkey-probe.ts   (castLabs)
import { app, BrowserWindow } from 'electron';
import { mkdtempSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + (e as Error).stack); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'passkey-probe-')));

app.whenReady().then(async () => {
  const srv = http.createServer((_q, r) => r.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>p</title>'));
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  const port = (srv.address() as any).port;
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
  // localhost, not 127.0.0.1: a raw IP is not a valid relying party (the October mistake).
  await w.loadURL(`http://localhost:${port}/`);
  const r = await w.webContents.executeJavaScript(`(async () => {
    const o = { electron: ${JSON.stringify(process.versions.electron)}, chrome: ${JSON.stringify(process.versions.chrome)},
      secure: isSecureContext, pkc: typeof PublicKeyCredential };
    const t = (p) => Promise.race([p.then((v) => v, (e) => 'rejects: ' + e.name), new Promise((r) => setTimeout(() => r('NEVER SETTLES (5 s)'), 5000))]);
    if (typeof PublicKeyCredential === 'function') {
      o.uvpaa = await t(PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
      o.conditional = PublicKeyCredential.isConditionalMediationAvailable ? await t(PublicKeyCredential.isConditionalMediationAvailable()) : 'absent';
      o.caps = PublicKeyCredential.getClientCapabilities ? await t(PublicKeyCredential.getClientCapabilities()) : 'absent';
    }
    return o;
  })()`);
  console.log('PROBE ' + JSON.stringify({ platform: process.platform, ...r }));
  app.exit(0);
});
