// Security check 2026-10-24, group 2, against the real browser: a page on the internet (shop.example, mapped here)
//  7 opens a tab by itself: blocked; with his click: opens
//  9 posts a form to the home network (192.168.1.1): stopped; a local page linking locally still works
// Run: TEST_CERT_DIR=<dir with test-key.pem, test-cert.pem> npx electron test/electron/group2-check.ts
import { app, BrowserWindow } from 'electron';
import https from 'node:https';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | ')); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
app.commandLine.appendSwitch('host-resolver-rules', 'MAP shop.example 127.0.0.1');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'g2-ud-')));
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (w: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${w}${d ? ' (' + d + ')' : ''}`); if (!ok) bad++; };
const PAGE = (p: string) => `<!doctype html><body style="margin:0">
<button id="b" style="position:absolute;left:20px;top:20px;width:200px;height:60px" onclick="window.open('${p}/opened-by-click')">open</button>
<form id="f" method="post" action="http://192.168.1.1/apply.cgi"><input name="x" value="1"></form></body>`;
app.whenReady().then(async () => {
  const CERT = process.env.TEST_CERT_DIR!;
  let port = 0;
  const srv = https.createServer({ key: readFileSync(path.join(CERT, 'test-key.pem')), cert: readFileSync(path.join(CERT, 'test-cert.pem')) }, (q, r) => { r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(PAGE(`https://shop.example:${port}`)); });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  port = (srv.address() as any).port;
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const { isRisky } = await import('../../src/secure.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b: any = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'g2-s-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') });
  wireBrowser(() => b);
  b.ses.setCertificateVerifyProc((_r: unknown, cb: (n: number) => void) => cb(0));
  b.open(`https://shop.example:${port}/`);
  for (let i = 0; i < 100 && !b.cur()?.view; i++) await wait(200);
  const t = b.cur(), wc = t.view.webContents;
  for (let i = 0; i < 40 && !(await wc.mainFrame.executeJavaScript(`!!document.getElementById('b')`).catch(() => false)); i++) await wait(250);
  console.log('page: ' + wc.getURL());
  const tabsNow = () => b.tabs.filter((x: any) => !x.internal).length;

  // 7: window.open by itself.
  const n0 = tabsNow();
  await wc.mainFrame.executeJavaScript(`window.open('https://shop.example:${port}/by-itself'); 1`);
  await wait(800);
  check('7 a tab the page opens by itself is blocked', tabsNow() === n0 && Boolean(t.blockedPopup), `${n0} -> ${tabsNow()}`);
  // ...and with his real click.
  b.win.focus(); b.win.webContents.focus(); wc.focus(); await wait(300);
  wc.sendInputEvent({ type: 'mouseDown', x: 60, y: 40, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x: 60, y: 40, button: 'left', clickCount: 1 });
  await wait(1200);
  check('7 his click still opens it', b.tabs.some((x: any) => String(x.url).includes('opened-by-click')), b.tabs.map((x: any) => x.url).join(' '));

  // 9: the page posts a form into the home network.
  b.activate(t.id); await wait(300);
  const notes: string[] = []; const was = b.note.bind(b); b.note = (x: string) => { notes.push(x); return was(x); };
  await wc.mainFrame.executeJavaScript(`document.getElementById('f').submit(); 1`);
  await wait(1500);
  check('9 a form posted to the router is stopped, and he is told', wc.getURL().startsWith(`https://shop.example:${port}`) && notes.some((n) => n.includes('home network')), wc.getURL() + ' ' + notes.join(' | '));

  // 8: zips ask now.
  check('8 a zip counts as risky', isRisky('tool.zip') && isRisky('Installer.dmg') && !isRisky('photo.jpg'));
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  srv.close(); app.exit(bad ? 1 : 0);
});
