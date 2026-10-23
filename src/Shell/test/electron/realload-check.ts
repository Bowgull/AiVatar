// Real sites in Samara's tab code vs a plain Electron page (2026-10-23, his report: "all websites seem to be having a hard
// time loading"). For each site: when the page first drew (the curtain can go) and when it stopped loading.
// Run: npx electron test/electron/realload-check.ts
import { app, BrowserWindow, ipcMain } from 'electron';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 180_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITES = process.env.ONE ? [process.env.ONE] : ['https://en.wikipedia.org/wiki/Electron', 'https://www.cnn.com/', 'https://www.youtube.com/', 'https://www.reddit.com/r/mac/', 'https://www.amazon.com/'];
const PROF = process.env.PROF; app.setPath('userData', PROF ?? mkdtempSync(path.join(os.tmpdir(), 'rl-ud-')));
app.on('window-all-closed', () => {});
const time = (wc: Electron.WebContents, url: string, load: () => void) => new Promise<{ drawn: number; stop: number }>((res) => {
  const t0 = Date.now(); let drawn = 0;
  const onPaint = (e: Electron.IpcMainEvent) => { if (e.sender === wc && !drawn) drawn = Date.now() - t0; };
  ipcMain.on('tab:painted', onPaint);
  const fin = () => { ipcMain.removeListener('tab:painted', onPaint); res({ drawn, stop: Date.now() - t0 }); };
  const cap = setTimeout(fin, 30_000);
  wc.once('did-stop-loading', () => { clearTimeout(cap); fin(); });
  load();
});
let lagMax = 0, lagSum = 0; { let last = Date.now(); setInterval(() => { const n = Date.now(); const l = n - last - 50; last = n; if (l > lagMax) lagMax = l; if (l > 100) lagSum += l; }, 50).unref(); }
const lag = () => { const r = `main stalled max ${lagMax} ms, ${lagSum} ms in stalls over 100 ms`; lagMax = 0; lagSum = 0; return r; };
app.whenReady().then(async () => {
  const plain = new BrowserWindow({ show: false, width: 1280, height: 800 });
  if (!process.env.SKIPPLAIN) for (const u of SITES) { const r = await time(plain.webContents, u, () => void plain.webContents.loadURL(u).catch(() => {})); console.log(`plain   ${u}  stopped ${r.stop} ms; ${lag()}`); }
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b: any = new AangBrowser({ origin: pages.origin, stateDir: PROF ?? mkdtempSync(path.join(os.tmpdir(), 'rl-state-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') } as any);
  b.open('about:blank'); await new Promise((r) => setTimeout(r, Number(process.env.SETTLE ?? 1500))); console.log('settle: ' + lag());
  const insp = await import('node:inspector'); const ps = new insp.Session(); ps.connect();
  const post = (m: string, a?: object) => new Promise<any>((r) => ps.post(m, a ?? {}, (_e: unknown, v: unknown) => r(v)));
  if (process.env.PROFILE) { await post('Profiler.enable'); await post('Profiler.setSamplingInterval', { interval: 500 }); await post('Profiler.start'); }
  if (process.env.SLOW) { const ses = b.tabs[0].view.webContents.session; const st = new Map<number, number>();
    ses.webRequest.onSendHeaders((d: any) => st.set(d.id, Date.now()));
    const end = (d: any) => { const ms = Date.now() - (st.get(d.id) ?? Date.now()); if (ms > 700) console.log(`slow ${ms} ms ${d.statusCode ?? d.error} ${d.url.slice(0, 110)}`); };
    ses.webRequest.onCompleted(end); ses.webRequest.onErrorOccurred(end); }
  for (const u of SITES) {
    const before = new Set(b.tabs.map((t: any) => t.id));
    let wc: Electron.WebContents | null = null;
    const r = await new Promise<{ drawn: number; stop: number }>((res) => {
      const t0 = Date.now(); let drawn = 0; let done = false;
      const onPaint = (e: Electron.IpcMainEvent) => { if (wc && e.sender === wc && !drawn) drawn = Date.now() - t0; };
      ipcMain.on('tab:painted', onPaint);
      const fin = () => { if (done) return; done = true; ipcMain.removeListener('tab:painted', onPaint); res({ drawn, stop: Date.now() - t0 }); };
      setTimeout(fin, 30_000);
      b.newTab(u);
      const t = b.tabs.find((x: any) => !before.has(x.id)); wc = t?.view?.webContents ?? null;
      if (wc) wc.once('did-stop-loading', fin); else fin();
    });
    console.log(`samara  ${u}  drew ${r.drawn || '-'} ms, stopped ${r.stop} ms; ${lag()}`);
  }
  if (process.env.PROFILE) { const { profile } = await post('Profiler.stop'); (await import('node:fs')).writeFileSync(process.env.PROFILE, JSON.stringify(profile)); }
  app.exit(0);
});
