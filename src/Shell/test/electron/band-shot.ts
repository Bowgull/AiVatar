// A picture of Samara's real band for a mockup sheet (2026-10-23, sheet 72): the frame as it draws, with the address,
// the shield and the Bitwarden key set as on a sign-in page. Run: WHERE=/signin npx electron test/electron/band-shot.ts <out.png>
import { app, BrowserWindow } from 'electron';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'bshot-ud-')));
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b: any = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'bshot-state-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') });
  b.open('about:blank');
  await wait(2500);
  const W = Number(process.env.W) || 900;
  b.win.setContentSize(W, 400); await wait(600);
  const where = process.env.WHERE ?? '/signin';
  console.log('step js ' + b.win.webContents.getURL() + ' loading=' + b.win.webContents.isLoading() + ' visible=' + b.win.isVisible()); console.log('probe ' + await Promise.race([b.win.webContents.mainFrame.executeJavaScript('1+1'), wait(3000).then(() => 'hung')])); const run = async (c: string) => console.log('js ' + c.slice(0, 40) + ' -> ' + await Promise.race([b.win.webContents.mainFrame.executeJavaScript(c).then((x: unknown) => String(x), (e: Error) => 'ERR ' + e.message), wait(3000).then(() => 'hung')]));
  await run(`(() => { const u = document.getElementById('url'); u.hidden = false; u.innerHTML = '<b>northwind.example</b>' + ${JSON.stringify(where)}; return 1; })()`);
  await run(`(() => { const l = document.getElementById('lock'); l.hidden = false; l.classList.remove('bad'); l.innerHTML = typeof SHIELD === 'string' ? SHIELD : '<span class="shieldbox"><img class="s-rest" src="art/browser/shield_rest.png" width="20" height="24" alt=""></span>'; return 1; })()`);
  await run(`(() => { document.getElementById('vkey').hidden = false; document.getElementById('edit').hidden = true; const r = document.getElementById('reload'); r.innerHTML = ${JSON.stringify(/id="reload"[^>]*>([\s\S]*?)<\/button>/.exec(readFileSync(path.join(HERE, '..', '..', 'pages', 'browser.html'), 'utf8'))![1])}; delete r.dataset.mode; for (const id of ['back','fwd']) document.getElementById(id).disabled = true; return 1; })()`);
  console.log('step shot'); await wait(500);
  const img = await b.win.webContents.capturePage({ x: 0, y: 0, width: W, height: 58 });
  writeFileSync(process.argv.find((a) => a.endsWith('.png'))!, img.toPNG());
  console.log('SHOT ' + JSON.stringify(img.getSize()));
  app.exit(0);
});
