// 6.24: do Zoom's and Teams' web clients accept Aang's browser? Loads their public join pages (no sign-in, nothing
// typed, nothing sent) in a hidden window with a throwaway profile and the browser's own user agent, and reports
// whether the page says the browser is not supported.
//
// Run: npx electron test/electron/call-sites-probe.ts
import { app, BrowserWindow, session } from 'electron';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + (e as Error).stack); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'call-sites-')));

const SITES = [
  ['Zoom (join from browser)', 'https://app.zoom.us/wc/join'],
  ['Teams (free, join a meeting)', 'https://teams.live.com/v2/'],
  ['Teams (work)', 'https://teams.microsoft.com/v2/'],
  ['Google Meet', 'https://meet.google.com/'],
] as const;
const BAD = /(not supported|unsupported|isn.t supported|update your browser|use a supported browser|switch to (chrome|edge)|download the (app|desktop))/i;

app.whenReady().then(async () => {
  const ses = session.fromPartition('probe-' + Date.now());
  ses.setUserAgent(`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`);
  ses.setPermissionRequestHandler((_wc, _p, done) => done(false));
  for (const [name, url] of SITES) {
    const w = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: { session: ses, sandbox: true, contextIsolation: true } });
    w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const r = await w.loadURL(url).then(() => 'loaded', (e) => 'load error ' + String(e).slice(0, 120));
    await new Promise((res) => setTimeout(res, 9000));
    let text = '';
    try { text = String(await w.webContents.executeJavaScript('document.body ? document.body.innerText : ""', true)); } catch (e) { text = 'read error ' + String(e); }
    const at = w.webContents.getURL();
    const bad = BAD.exec(text);
    console.log(`${bad ? 'WARN' : 'OK  '}  ${name}  -- ${r}, now at ${at.slice(0, 90)}`);
    console.log(`      says: ${text.replace(/\s+/g, ' ').trim().slice(0, 260)}`);
    if (bad) console.log(`      matched: "${bad[0]}"`);
    w.hide();
  }
  app.exit(0);
});
