// Security check 2026-10-24, group 1: a page trying each autofill trick, against the real code.
//  1 the PIN's key releases never reach the page   2 hidden boxes are never filled; Tab fills one box
//  3 a login only for its exact site               4 a page's fake "login sent" is ignored
// Run: AANG_TEST_BW=<fake bw> npx electron test/electron/autofill-attacks-check.ts
import { app, BrowserWindow, ipcMain } from 'electron';
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | ')); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'afatk-ud-')));
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (w: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${w}${d ? ' (' + d + ')' : ''}`); if (!ok) bad++; };
const PAGE = `<!doctype html><body>
<form id="f"><input id="email" type="email" autocomplete="email" style="width:200px">
<input id="name" autocomplete="name" style="opacity:0">
<input id="tel" type="tel" autocomplete="tel" style="position:absolute;left:-9999px">
<input id="street" autocomplete="street-address" style="width:1px;height:1px">
<div style="opacity:0.01"><input id="postal" autocomplete="postal-code"></div>
<input id="city" autocomplete="address-level2" style="width:200px">
<input id="pw" type="password"></form>
<script>window.ups=[];window.downs=[];addEventListener('keyup',e=>ups.push(e.key),true);addEventListener('keydown',e=>downs.push(e.key),true);</script></body>`;
app.whenReady().then(async () => {
  // A secure page on this computer (Samara's autofill only runs on https), with a test certificate this test alone accepts.
  const CERT = process.env.TEST_CERT_DIR!;
  const srv = https.createServer({ key: readFileSync(path.join(CERT, 'test-key.pem')), cert: readFileSync(path.join(CERT, 'test-cert.pem')) }, (_q, r) => { r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(PAGE); });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  const base = `https://localhost:${(srv.address() as any).port}`;
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const { fillDetailsScript } = await import('../../src/autofill.ts');
  const { Vault } = await import('../../src/vault.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b: any = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'afatk-s-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') });
  wireBrowser(() => b);
  b.ses.setCertificateVerifyProc((_r: unknown, cb: (n: number) => void) => cb(0));
  b.open(base + '/');
  for (let i = 0; i < 100 && !b.cur()?.view; i++) await wait(200);
  await wait(4000);
  const t = b.cur(), wc = t.view.webContents;
  for (let i = 0; i < 40 && !(await wc.mainFrame.executeJavaScript(`!!document.getElementById('pw')`).catch(() => false)); i++) await wait(250);
  console.log('page: ' + wc.getURL());
  const js = (c: string) => Promise.race([wc.mainFrame.executeJavaScript(c), wait(4000).then(() => { throw new Error('page did not answer: ' + c.slice(0, 40)); })]);

  // First, that keys reach the page at all here (else check 1 would pass for nothing).
  // Key presses need the window's focus: taken for a moment by this test (off screen).
  b.win.focus(); b.win.webContents.focus(); wc.focus(); await wait(300); await js(`document.getElementById('pw').focus()`);
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'z' }); wc.sendInputEvent({ type: 'char', keyCode: 'z' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'z' }); await wait(300);
  check('0 keys reach the page in this test', String(await js(`downs.join('') + '|' + ups.join('')`)).includes('z'), await js(`downs.join('') + '|' + ups.join('')`));
  // 1: he types his PIN; the page's own box has the cursor.
  await js(`document.getElementById('pw').value = ''; document.getElementById('pw').focus(); ups.length = 0; downs.length = 0`);
  b.afPin = { digits: '', then: 'fill' };
  b.pinSeal.has = () => true; b.pinSeal.length = () => 4; b.pinSeal.open = async () => ({ wrong: 4 });
  for (const k of ['4', '8', '1', '7']) {
    wc.sendInputEvent({ type: 'keyDown', keyCode: k }); wc.sendInputEvent({ type: 'char', keyCode: k }); await wait(30);
    wc.sendInputEvent({ type: 'keyUp', keyCode: k }); await wait(60);
  }
  await wait(300);
  const seen1 = await js(`[downs.join(''), ups.join(''), document.getElementById('pw').value]`);
  check('1 the page hears none of the PIN keys, pressed or let go', seen1[0] === '' && seen1[1] === '' && seen1[2] === '', JSON.stringify(seen1));
  b.afPin = null;
  await js(`ups.length = 0`); wc.sendInputEvent({ type: 'keyDown', keyCode: 'a' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'a' }); await wait(200);
  check('1 ...and ordinary typing still reaches it afterwards', (await js(`ups.join('')`)).includes('a'));

  // 2: a click on the light fills the form; only the boxes he can see.
  const V = { email: 'you@example.com', name: 'Sam Doe', tel: '(416) 555-0142', street: '1 Main St', postal: 'M5H 2N2', city: 'Toronto' };
  await js(`for (const i of document.querySelectorAll('input')) i.value = ''; document.getElementById('email').focus()`);
  await wc.executeJavaScriptInIsolatedWorld(1001, [{ code: fillDetailsScript(V, true) }]);
  const v2 = await js(`Object.fromEntries([...document.querySelectorAll('input')].map(i => [i.id, i.value]))`);
  check('2 the boxes he can see are filled', v2.email === V.email && v2.city === V.city, JSON.stringify(v2));
  check('2 hidden boxes get nothing (see-through, off the page, tiny, inside a see-through block)', !v2.name && !v2.tel && !v2.street && !v2.postal, JSON.stringify(v2));
  // Tab: only the box he is in, whatever the page claims about its form.
  await js(`for (const i of document.querySelectorAll('input')) i.value = ''; document.getElementById('email').focus()`);
  b.af = { tab: t.id, kind: 'email', kinds: ['email', 'city', 'name'], empty: true, rect: { x: 0, y: 0, w: 200, h: 20 }, offer: 'details', email: 0, logins: [], login: 0 };
  b.details.get = () => ({ name: 'Sam Doe', given: 'Sam', family: 'Doe', emails: ['you@example.com'], phone: '', street: '', city: 'Toronto', region: '', postal: '', country: '' });
  await b.afPick(true);
  const v3 = await js(`Object.fromEntries([...document.querySelectorAll('input')].map(i => [i.id, i.value]))`);
  check('2 Tab fills only the box he is in', v3.email === 'you@example.com' && !v3.city, JSON.stringify(v3));

  // 3: logins only for their exact site.
  const vault: any = new Vault(); vault.session = 'x'.repeat(30);
  const main = await vault.loginsFor('https://example.com/login');
  const sub = await vault.loginsFor('https://forum.example.com/');
  const other = await vault.loginsFor('https://evil.example.com/');
  check('3 example.com offers only its own login', main?.length === 1 && main[0].name === 'main', JSON.stringify(main));
  check('3 forum.example.com offers only its own', sub?.length === 1 && sub[0].name === 'forum', JSON.stringify(sub));
  check('3 another part of the site gets nothing', Array.isArray(other) && other.length === 0, JSON.stringify(other));
  // The PIN is asked for on a site with a login, not on another part of it (the list as learnSites keeps it).
  b.vault.loginHosts = async () => ['example.com']; b.vault.current = () => 'x'; await b.learnSites();
  check('3 the PIN is asked for on the site itself', b.siteKnown('example.com') && b.siteKnown('www.example.com'));
  check('3 not on another part of it', !b.siteKnown('evil.example.com') && !b.siteKnown('forum.example.com'));

  // 4: a page's script fakes "a login was sent"; Samara never hears it.
  let creds = 0;
  const was = b.afCred.bind(b); b.afCred = (...a: any[]) => { creds++; return was(...a); };
  await js(`document.getElementById('pw').value = 'stolen'; document.getElementById('f').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); document.querySelector('form').querySelector('input').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  await wait(400);
  check('4 a fake "login sent" from the page is ignored', creds === 0, String(creds));
  // His real Enter in the password box still counts.
  await js(`document.getElementById('pw').focus()`); wc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' }); await wait(400);
  check('4 ...his own Enter still offers to keep it', creds === 1, String(creds));

  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  srv.close(); app.exit(bad ? 1 : 0);
});
