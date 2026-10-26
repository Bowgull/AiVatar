// 2026-10-25 (his "why can't I use the secret window's website bar as a search?"): in the secret window, clicking the
// address bar, typing words and pressing Enter searches (Yandex), the way he does it, keys and all.
// Run: npx electron test/electron/secret-search-check.ts
import { app, BrowserWindow } from 'electron';
import { mkdirSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.message ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'ss-ud-')));
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (w: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${w}${d ? ' (' + d + ')' : ''}`); if (!ok) bad++; };
app.whenReady().then(async () => {
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const base = { origin: pages.origin, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs') };
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ss-s-')), sdir = path.join(dir, 'secret'); mkdirSync(sdir);
  const b: any = new AangBrowser({ ...base, stateDir: dir });
  const s: any = new AangBrowser({ ...base, stateDir: sdir, sharedDir: dir, secret: true, phish: b.phishCheck });
  wireBrowser(() => b, () => s);
  const tryIt = async (who: any, label: string) => {
    for (let i = 0; i < 100 && !who.cur()?.view; i++) await wait(150);
    await wait(2500);
    const fw = who.win.webContents;
    who.win.focus(); fw.focus();
    const r = await fw.executeJavaScript(`(() => { const k = document.getElementById('slot').getBoundingClientRect(); return [Math.round(k.x + k.width / 2), Math.round(k.y + k.height / 2)]; })()`);
    fw.sendInputEvent({ type: 'mouseDown', x: r[0], y: r[1], button: 'left', clickCount: 1 }); fw.sendInputEvent({ type: 'mouseUp', x: r[0], y: r[1], button: 'left', clickCount: 1 });
    await wait(500);
    const open = await fw.executeJavaScript(`!document.getElementById('edit').hidden`);
    for (const k of 'pixel cats') { fw.sendInputEvent({ type: 'char', keyCode: k }); await wait(60); }
    await wait(1200);
    fw.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); fw.sendInputEvent({ type: 'char', keyCode: '\r' }); fw.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
    await wait(2500);
    const urls = who.tabs.map((t: any) => String(t.pending || t.url));
    check(`${label}: click the bar, type, Enter searches`, open && urls.some((u: string) => /search.*pixel(%20|\+)cats|text=pixel(%20|\+)cats/.test(u)), `bar opened ${open}; tabs ${urls.join(' ')}`);
  };
  s.open(); await tryIt(s, 'secret window, locked (just opened)');
  b.open(); await tryIt(b, 'normal Samara');
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  app.exit(bad ? 1 : 0);
});
