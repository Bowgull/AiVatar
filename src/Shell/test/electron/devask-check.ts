// Sheet 69 end to end with a REAL device (2026-10-22): a secure test page asks for a keyboard (WebHID) on a real click;
// Samara's parchment ask lists only matching devices; a real click picks one and Connect gives it to the page; the
// next ask on that site connects with no ask; the shield lists it; Forget removes it and the site has to ask again.
// Needs a device from VENDOR plugged in (default 3141 = 0x0c45, Sonix, the maker of his Epomaker's chip).
// Off screen, never focused; input goes only into Samara's own views. Pictures: test/electron/out/devask-*.png
// Run (from src/Shell):  npx electron test/electron/devask-check.ts
import { app, BrowserWindow } from 'electron';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error)?.message ?? e).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | ')); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out'); mkdirSync(OUT, { recursive: true });
const VENDOR = Number(process.env.VENDOR) || 3141;
const PORT = 47971;
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'devask-ud-')));
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
// A real-looking site name (the shield ignores localhost), sent to this machine.
app.commandLine.appendSwitch('host-resolver-rules', 'MAP keys.example.com 127.0.0.1');
app.on('window-all-closed', () => { /* the check decides */ });
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setOpacity(0); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* never in a test */ };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const results: [string, boolean, string?][] = [];
const check = (name: string, ok: boolean, note = '') => { results.push([name, ok, note]); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${note ? ' (' + note + ')' : ''}`); };

// The page: a button that asks for the keyboard, and writes what it got into its title.
const PAGE = `<!doctype html><title>idle</title><style>body{margin:0;background:#fff}button{position:fixed;left:20px;top:20px;width:200px;height:60px}</style>
<button id="go">Connect keyboard</button><script>
document.getElementById('go').onclick = async () => {
  try { const d = await navigator.hid.requestDevice({ filters: [{ vendorId: ${VENDOR} }] }); document.title = d.length ? 'got:' + d[0].productName : 'none'; }
  catch (e) { document.title = 'error:' + e.name; }
};</script>`;

app.whenReady().then(async () => {
  // A throwaway certificate for localhost, accepted only by this test's own session.
  const dir = mkdtempSync(path.join(os.tmpdir(), 'devask-cert-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem'), '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
  https.createServer({ key: readFileSync(path.join(dir, 'k.pem')), cert: readFileSync(path.join(dir, 'c.pem')) }, (_q, r) => r.writeHead(200, { 'Content-Type': 'text/html' }).end(PAGE)).listen(PORT, '127.0.0.1');
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const stateDir = mkdtempSync(path.join(os.tmpdir(), 'devask-state-'));
  const URL0 = `https://keys.example.com:${PORT}/`;
  writeFileSync(path.join(stateDir, 'browser-tabs.json'), JSON.stringify({ v: 1, active: 0, fronts: [0], tabs: [{ url: URL0, title: 'Keyboard page', scrollY: 0, zoom: 0, win: 0 }], trails: [], closed: [] }));
  const b: any = new AangBrowser({ origin: pages.origin, stateDir, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'),
    thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') } as any);
  b.ses.setCertificateVerifyProc((_r: unknown, cb: (n: number) => void) => cb(0));
  wireBrowser(() => b);
  b.open();
  const frame = () => b.win.webContents as Electron.WebContents;
  const tab = () => b.tabs[0]?.view?.webContents as Electron.WebContents | undefined;
  for (let i = 0; i < 100 && !(tab() && !tab()!.isLoading() && tab()!.getURL().startsWith(URL0)); i++) await wait(100);
  await wait(800);
  // A real click: mouse down and up inside the page, which gives it the user gesture WebHID needs.
  const click = async (wc: Electron.WebContents, x: number, y: number) => {
    wc.sendInputEvent({ type: 'mouseMove', x, y }); await wait(30);
    wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 }); await wait(40);
    wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 }); await wait(60);
  };
  const center = async (wc: Electron.WebContents, sel: string) => wc.executeJavaScript(`(() => { const r = document.querySelector(${JSON.stringify(sel)})?.getBoundingClientRect(); return r && r.width ? [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)] : null; })()`, true) as Promise<[number, number] | null>;
  const shot = async (name: string) => { const img = await frame().capturePage(); writeFileSync(path.join(OUT, `devask-${name}.png`), img.toPNG()); };
  const title = () => tab()!.getTitle();

  // 1) The page asks; Samara's ask hangs from the band with the real device.
  await click(tab()!, 120, 50);
  let rows = 0;
  for (let i = 0; i < 50 && !rows; i++) { await wait(100); rows = await frame().executeJavaScript(`document.getElementById('devchip').hidden ? 0 : document.querySelectorAll('#devlist .dev').length`, true); }
  const askText = await frame().executeJavaScript(`document.getElementById('devm').textContent`, true);
  check('the ask shows with the device', rows > 0, `${rows} row(s): ${askText}`);
  await shot('1-ask');
  // 2) Pick the first row and Connect, by real clicks in the band.
  const r1 = await center(frame(), '#devlist .dev'); if (r1) await click(frame(), ...r1);
  const r2 = await center(frame(), '#devyes'); if (r2) await click(frame(), ...r2);
  for (let i = 0; i < 30 && !title().startsWith('got:'); i++) await wait(100);
  check('the page gets the device he picked', title().startsWith('got:'), title());
  check('the ask goes away', await frame().executeJavaScript(`document.getElementById('devchip').hidden`, true) === true);
  // 3) Asked again on the same site: with only that device matching, it connects with no ask; with others plugged in
  // too (his dongle AND his keyboard's cable), it asks again with the one he allowed already picked.
  await tab()!.executeJavaScript(`document.title = 'idle'`, true);
  const firstName = title();
  await click(tab()!, 120, 50);
  let asked = false;
  for (let i = 0; i < 30 && !title().startsWith('got:') && !asked; i++) { await wait(100); asked = await frame().executeJavaScript(`!document.getElementById('devchip').hidden`, true); }
  if (rows > 1) {
    const pre = await frame().executeJavaScript(`[...document.querySelectorAll('#devlist .dev')].findIndex((x) => x.getAttribute('aria-pressed') === 'true')`, true);
    check('several devices: it asks again, the allowed one already picked', asked && pre === 0, `picked row ${pre}`);
    await shot('1b-ask-again');
    const y = await center(frame(), '#devyes'); if (y) await click(frame(), ...y);
    for (let i = 0; i < 30 && !title().startsWith('got:'); i++) await wait(100);
    check('Connect gives the same device', title() !== 'idle', title());
  } else check('one device: next time it connects with no ask', title().startsWith('got:') && !asked, title());
  void firstName;
  // 4) The shield lists it; Forget takes it back.
  const lock = await center(frame(), '#lock'); if (lock) await click(frame(), ...lock);
  await wait(400);
  const listed = await frame().executeJavaScript(`[...document.querySelectorAll('#devrows .srow b')].map((x) => x.textContent)`, true) as string[];
  check('the shield lists the device', listed.length === 1, listed.join(', '));
  await shot('2-shield');
  const forget = await center(frame(), '#devrows .key'); if (forget) await click(frame(), ...forget);
  await wait(400);
  const after = await frame().executeJavaScript(`document.querySelectorAll('#devrows .srow').length`, true);
  check('Forget takes it out of the shield', after === 0);
  // 5) After Forget the site has to ask again; Cancel gives the page nothing.
  const lock2 = await center(frame(), '#lock'); if (lock2) await click(frame(), ...lock2);   // close the shield
  await tab()!.executeJavaScript(`document.title = 'idle'`, true);
  await click(tab()!, 120, 50);
  let again = false;
  for (let i = 0; i < 50 && !again; i++) { await wait(100); again = await frame().executeJavaScript(`!document.getElementById('devchip').hidden`, true); }
  const no = await center(frame(), '#devno'); if (no) await click(frame(), ...no);
  for (let i = 0; i < 30 && title() === 'idle'; i++) await wait(100);
  check('after Forget it asks again, and Cancel gives nothing', again && !title().startsWith('got:'), title());
  const ok = results.every(([, p]) => p);
  console.log(ok ? 'ALL PASS' : 'FAILED');
  app.exit(ok ? 0 : 1);
});
