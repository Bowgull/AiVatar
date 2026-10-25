// 2026-10-25 (his report: Samara sat "open" with no window and a dead Dock icon while the Mac's Keychain box waited):
// the window shows BEFORE anything asks the Keychain. A stand-in Keychain that takes 3 s to answer (his real one is never
// touched) shows the order. Run: npx electron test/electron/keychain-order-check.ts
import { app, BrowserWindow, safeStorage } from 'electron';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.message ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'ko-ud-')));
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); this.emit('show'); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now(); let shownAt = 0, askedAt = 0;
// The stand-in: the Keychain box he has not answered yet holds everything for 3 seconds.
const ss = safeStorage as any;
ss.isEncryptionAvailable = () => true;
ss.encryptString = (s: string) => Buffer.from(s, 'utf8');
ss.decryptString = (b: Buffer) => { askedAt = askedAt || Date.now() - t0; const until = Date.now() + 3000; while (Date.now() < until) { /* waiting on the box */ } return b.toString('utf8'); };
app.whenReady().then(async () => {
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ko-s-'));
  writeFileSync(path.join(dir, 'autofill-details.json'), JSON.stringify({ v: 1, sealed: Buffer.from(JSON.stringify({ given: 'Test' })).toString('base64') }));
  const b: any = new AangBrowser({ origin: pages.origin, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs'), stateDir: dir });
  wireBrowser(() => b);
  b.open();
  for (let i = 0; i < 200 && !b.win; i++) await wait(25);
  b.win.once('show', () => { shownAt = Date.now() - t0; });
  for (let i = 0; i < 200 && !askedAt; i++) await wait(50);
  await wait(3500);
  const ok = shownAt > 0 && askedAt > shownAt && b.details.get().given === 'Test';
  console.log(`${ok ? 'PASS' : 'FAIL'} the window shows before the Keychain is asked (shown ${shownAt} ms, Keychain ${askedAt} ms), and his details still unlock`);
  app.exit(ok ? 0 : 1);
});
