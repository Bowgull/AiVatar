// The secret window's fences in a real Electron (2026-11-19, his rule: Mac only, sealed, nothing leaks).
//  1 the sealed folder with the real safeStorage: its key is kept only sealed, and every file it writes is unreadable
//  2 off the Mac, the browser refuses to be a secret window, and no secret profile folder is ever made
// Run (PC, never on his screen): powershell -File tools/hidden-desktop-run.ps1 -Command "npx electron test/electron/sealdir-check.ts"
// On the Mac: npx electron test/electron/sealdir-check.ts (it uses a stand-in Keychain, never his real one).
import { app, safeStorage } from 'electron';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
app.commandLine.appendSwitch('use-mock-keychain');                 // never his real Keychain
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ud = mkdtempSync(path.join(os.tmpdir(), 'seal-ud-'));
app.setPath('userData', ud);
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
let bad = 0;
const check = (w: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${w}${d ? ' (' + d + ')' : ''}`); if (!ok) bad++; };

app.whenReady().then(async () => {
  const { SealedDir, electronKeychain, isSealed } = await import('../../src/sealdir.ts');
  const { writeFileAtomic } = await import('../../src/atomic.ts');
  const { readJson } = await import('../../src/store.ts');
  // 1
  const dir = mkdtempSync(path.join(os.tmpdir(), 'seal-s-')), s = path.join(dir, 'secret');
  mkdirSync(s);
  const room = new SealedDir(s, electronKeychain(safeStorage));
  check('1 the Keychain can seal here', safeStorage.isEncryptionAvailable());
  check('1 the folder opens with the Keychain', room.open() === 'open');
  const key = readFileSync(path.join(s, 'secret-key.json'), 'utf8');
  check('1 its key is kept only sealed', /"sealed":"/.test(key) && key.length > 60);
  writeFileAtomic(path.join(s, 'browser-history.json'), JSON.stringify([{ url: 'https://hidden.example/', title: 'Hidden' }]));
  const b = readFileSync(path.join(s, 'browser-history.json'));
  check('1 what it writes is sealed on disk', isSealed(b) && !b.toString('latin1').includes('hidden'));
  check('1 and reads back while open', readJson<any[]>(path.join(s, 'browser-history.json'), [])[0]?.url === 'https://hidden.example/');
  room.close();
  check('1 locked: it reads as nothing', readJson<any[]>(path.join(s, 'browser-history.json'), []).length === 0);
  const again = new SealedDir(s, electronKeychain(safeStorage));
  check('1 opened again from the kept key', again.open() === 'open' && readJson<any[]>(path.join(s, 'browser-history.json'), [])[0]?.title === 'Hidden');
  again.close();

  // 2
  if (process.platform !== 'darwin') {
    const { AangBrowser } = await import('../../src/browser.ts');
    const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
    const sd = mkdtempSync(path.join(os.tmpdir(), 'seal-pc-'));
    let threw = '';
    try { new AangBrowser({ origin: 'http://127.0.0.1:1', preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs'), stateDir: path.join(sd, 'secret'), sharedDir: sd, secret: true }); }
    catch (e) { threw = (e as Error).message; }
    check('2 off the Mac the browser refuses to be a secret window', /Mac only/.test(threw), threw);
    const parts = path.join(ud, 'Partitions');
    const made = existsSync(parts) ? readdirSync(parts) : [];
    check('2 no secret profile is made', !made.some((n) => /secret/i.test(n)), made.join(','));
    check('2 no secret folder is made', !existsSync(path.join(sd, 'secret')));
  } else console.log('SKIP 2 (this is the Mac)');
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  app.exit(bad ? 1 : 0);
});
