// Sheet 91 v2, built (2026-10-30): a tab whose site does not answer shows Jiji on the unplugged cord with Try again and
// Go back; a page that is only "not secure" keeps the wood plate. Off screen, never focused. Writes catpage.png next to
// this file's output folder and prints PASS/FAIL lines.
// Run (from src/Shell):  npx electron test/electron/catpage-shot.ts <out.png>
import { app, BrowserWindow, screen } from 'electron';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv.at(-1)!.endsWith('.png') ? process.argv.at(-1)! : path.join(os.tmpdir(), 'catpage.png');
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'samara-cat-ud-')));
app.on('window-all-closed', () => { /* the harness decides */ });
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setOpacity(0); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* never in a test */ };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const stateDir = mkdtempSync(path.join(os.tmpdir(), 'samara-cat-state-'));
  const b = new AangBrowser({ origin: pages.origin, stateDir, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'),
    thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') } as any);
  wireBrowser(() => b);
  // Nothing listens on port 9 here: the connection is refused, the "didn't answer" kind.
  b.open('http://127.0.0.1:9/');
  let ok = true;
  const frame = () => (b as any).win?.webContents as Electron.WebContents | undefined;
  for (let i = 0; i < 40; i++) { await wait(500); const v = await frame()?.executeJavaScript(`!document.getElementById('failplate').hidden`).catch(() => false); if (v) break; }
  await wait(1200);
  const s = await frame()!.executeJavaScript(`(() => { const p = document.getElementById('failplate'), c = document.getElementById('failcat');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
    return { shown: !p.hidden, cat: p.classList.contains('cat') && !c.hidden, drawn: n, title: document.getElementById('failtitle').textContent,
      retry: !document.getElementById('failretry').hidden, back: !document.getElementById('failback').hidden }; })()`);
  console.log(JSON.stringify(s));
  const check = (n: string, p: boolean) => { console.log(`${p ? 'PASS' : 'FAIL'} ${n}`); ok &&= p; };
  check('a site that does not answer shows the plate', s.shown);
  check('...with the cat', s.cat && s.drawn > 2000);
  check('...and Try again and Go back', s.retry && s.back);
  writeFileSync(OUT, (await frame()!.capturePage()).toPNG());
  console.log(ok ? 'ALL PASS' : 'FAILED'); app.exit(ok ? 0 : 1);
});
