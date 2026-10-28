// Sheet 87, the secret window, against the real browser (2026-10-25). Pages are shop.example and ads.example, mapped here.
//  1 opens locked on its blank night page, in the night look; nothing of his is out
//  2 a page opened before the PIN is logged out (the throwaway session)
//  3 the first PIN is picked in the box (typed, Enter, again); the page joins, now in the kept session
//  4 locking puts everything away (the Mac sleeping, 15 minutes away): night page only, no suggestions, saved to its folder
//  5 a wrong PIN shakes and stays locked; the right one brings the tabs back, logged in; the History panel has them
//  6 normal Samara never sees any of it (its tabs file, its cookies)
//  7 every window: a page's ad opened on any click is stopped; the link he clicked still opens
//  8 closing the window locks it
//  5b the mask: hide behind Brave Search, double click + PIN to come back
//  8b opened again, his tabs come back with his PIN
//  8c 2026-10-28: ⇧⌘N brings a locked secret window forward; closing its last tab keeps every tab for next time
//  9 five wrong PINs: a new one needs his Mac password
// 10 the secret window searches with Yandex
// Run: TEST_CERT_DIR=<dir with test-key.pem, test-cert.pem> npx electron test/electron/secret-check.ts
import { app, BrowserWindow } from 'electron';
import https from 'node:https';
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | ')); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 180_000).unref();
app.commandLine.appendSwitch('host-resolver-rules', 'MAP shop.example 127.0.0.1, MAP ads.example 127.0.0.1, MAP yandex.com 127.0.0.1');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('use-mock-keychain');                 // never his real Keychain
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'sec-ud-')));
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (w: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${w}${d ? ' (' + d + ')' : ''}`); if (!ok) bad++; };
const PAGE = (p: string) => `<!doctype html><title>Shop page</title><body style="margin:0">
<button id="b" style="position:absolute;left:20px;top:20px;width:200px;height:60px" onclick="window.open('${p.replace('shop', 'ads')}/ad')">play</button>
<a id="l" href="${p.replace('shop', 'ads')}/link" target="_blank" style="position:absolute;left:20px;top:120px;width:200px;height:60px;display:block;background:#ccc">link</a>
<script>document.addEventListener('click', (e) => { if (e.target.id === 'l') window.open('${p.replace('shop', 'ads')}/sneaky'); });</script></body>`;
app.whenReady().then(async () => {
  const CERT = process.env.TEST_CERT_DIR!;
  let port = 0;
  const srv = https.createServer({ key: readFileSync(path.join(CERT, 'test-key.pem')), cert: readFileSync(path.join(CERT, 'test-cert.pem')) },
    (q, r) => { r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(PAGE(`https://shop.example:${port}`)); });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  port = (srv.address() as any).port;
  const SHOP = `https://shop.example:${port}`;
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const base = { origin: pages.origin, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs') };
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sec-s-')), sdir = path.join(dir, 'secret');
  mkdirSync(sdir);
  const b: any = new AangBrowser({ ...base, stateDir: dir });
  const s: any = new AangBrowser({ ...base, stateDir: sdir, sharedDir: dir, secret: true });
  wireBrowser(() => b, () => s);
  for (const x of [b.ses, s.ses, s.keptSes]) x.setCertificateVerifyProc((_r: unknown, cb: (n: number) => void) => cb(0));
  const guest = s.ses, kept = s.keptSes;

  // 1
  s.open();
  for (let i = 0; i < 100 && !s.cur()?.view; i++) await wait(150);
  const fw = s.win.webContents;
  await wait(1500);
  const secretClass = await fw.executeJavaScript(`document.documentElement.classList.contains('secret')`);
  check('1 opens locked on Brave Search, in the night look', s.locked && String(s.cur()?.url).startsWith('https://search.brave.com') && secretClass === true, `locked ${s.locked}, tab ${s.cur()?.url}, class ${secretClass}`);

  // 2
  s.go(`${SHOP}/before`);
  for (let i = 0; i < 40 && !String(s.cur()?.url).includes('/before'); i++) await wait(150);
  await wait(1500);
  const pre = s.cur();
  check('2 a page before the PIN opens in its place, logged out', pre && String(pre.url).includes('/before') && !s.tabs.some((t: any) => t.internal === 'night') && pre.view.webContents.session === guest,
    s.tabs.map((t: any) => t.url).join(' '));

  // 3: the PIN box, typed for real
  const type = async (keys: string[]) => { for (const k of keys) { fw.sendInputEvent({ type: 'keyDown', keyCode: k }); fw.sendInputEvent({ type: 'keyUp', keyCode: k }); await wait(60); } };
  s.win.focus(); fw.focus();
  s.tray(true, { x: 42, y: 62 });
  await wait(600);
  const boxUp = await fw.executeJavaScript(`!document.getElementById('spin').hidden`);
  check('3 opening the list while locked asks for the PIN on screen, and the page is put away', boxUp === true && s.pinOpen === true && pre.view.getBounds().width === 0, `box ${boxUp}`);
  await type(['1', '2', '3', '4', 'Enter', '1', '2', '3', '4']);
  for (let i = 0; i < 40 && s.locked; i++) await wait(150);
  await wait(800);
  if (!pre.view) s.activate(pre.id);
  for (let i = 0; i < 30 && !pre.view; i++) await wait(150);
  check('3 a new PIN unlocks it; the page joins, now in the kept session', !s.locked && s.tabs.includes(pre) && pre.view?.webContents.session === kept && s.trayOn === true,
    `locked ${s.locked}, session kept ${pre.view?.webContents.session === kept}, list open ${s.trayOn}`);
  await kept.cookies.set({ url: SHOP, name: 'login', value: 'yes', expirationDate: Date.now() / 1000 + 3600 });
  s.newTab(`${SHOP}/kept`, pre.id);
  await wait(2500);

  // 4
  await s.lock();
  await wait(500);
  const saved = existsSync(path.join(sdir, 'browser-tabs.json')) ? readFileSync(path.join(sdir, 'browser-tabs.json'), 'utf8') : '';
  const guestLogin = (await guest.cookies.get({ name: 'login' })).length;
  check('4 locking puts it all away behind Brave Search: nothing suggested, saved in its own folder',
    s.locked && s.tabs.length === 1 && String(s.cur()?.url).startsWith('https://search.brave.com') && s.suggest('shop').every((x: any) => x.kind === 'search' || x.kind === 'go') && saved.includes('/before') && saved.includes('/kept') && guestLogin === 0,
    `${s.tabs.map((t: any) => t.url).join(' ')} | suggest ${s.suggest('shop').map((x: any) => x.kind).join(',')} | guest login ${guestLogin}`);

  // 5
  s.win.focus(); fw.focus();
  s.tray(true, { x: 42, y: 62 });
  await wait(500);
  await type(['9', '9', '9', '9']);
  await wait(800);
  check('5 a wrong PIN stays locked', s.locked === true);
  await type(['1', '2', '3', '4']);
  for (let i = 0; i < 40 && s.locked; i++) await wait(150);
  await wait(1000);
  const back = s.tabs.map((t: any) => String(t.url));
  const keptLogin = (await kept.cookies.get({ name: 'login' })).length;
  check('5 the right PIN brings the tabs back, logged in', !s.locked && back.some((u: string) => u.includes('/before')) && back.some((u: string) => u.includes('/kept')) && keptLogin === 1, back.join(' '));
  const hist = s.visits.list.map((v: any) => v.url).join(' ');
  check('5 its History has them, and nothing from the cover', hist.includes('/before') && hist.includes('/kept') && !hist.includes('search.brave.com'), hist);
  const opener = s.tabs.find((t: any) => String(t.url).includes('/kept'));
  const parent = s.tabs.find((t: any) => String(t.url).includes('/before'));
  check('5 a tab opened from another comes back under it', opener && parent && opener.opener === parent.id && opener.trail !== null && opener.trail === parent.trail, `opener ${opener?.opener} parent ${parent?.id} trails ${opener?.trail}/${parent?.trail}`);

  // 5b: the mask (his picks): a click hides it all behind a fresh Brave Search; a click there does nothing; a double
  // click and his PIN bring back exactly what was there, every page asleep (paused), the cover thrown away.
  const ids = s.tabs.map((t: any) => t.id).join(','), front = s.active;
  await s.secretMask('one');
  await wait(800);
  check('5b a click on the mask hides it all behind Brave Search', s.locked && s.tabs.length === 1 && String(s.tabs[0].url).startsWith('https://search.brave.com') && s.away?.tabs.length >= 2,
    s.tabs.map((t: any) => t.url).join(' '));
  await s.secretMask('one');
  await wait(300);
  check('5b behind the cover, one click does nothing', s.pinOpen === false);
  s.go('https://shop.example:' + port + '/on-the-cover');
  await wait(800);
  await s.secretMask('two');
  await wait(400);
  s.win.focus(); fw.focus();
  await type(['1', '2', '3', '4']);
  for (let i = 0; i < 40 && s.locked; i++) await wait(150);
  await wait(500);
  check('5b a double click and his PIN bring back exactly what was there, asleep, the cover gone',
    !s.locked && s.tabs.map((t: any) => t.id).join(',') === ids && s.active === front && s.tabs.every((t: any) => t.slept === true || t.id === front) && !s.tabs.some((t: any) => String(t.url).includes('on-the-cover') || String(t.url).startsWith('https://search.brave.com')),
    `${s.tabs.map((t: any) => t.id + ':' + t.url + ':' + t.slept).join(' ')} front ${s.active}/${front}`);

  // 6
  const normalFile = existsSync(path.join(dir, 'browser-tabs.json')) ? readFileSync(path.join(dir, 'browser-tabs.json'), 'utf8') : '';
  const normalLogin = (await b.ses.cookies.get({ name: 'login' })).length;
  check('6 normal Samara never sees it', !normalFile.includes('shop.example') && normalLogin === 0 && !b.visits.list.some((v: any) => v.url.includes('shop.example')), `file has it ${normalFile.includes('shop.example')}, login ${normalLogin}`);

  // 7: in normal Samara
  b.open(`${SHOP}/page`);
  for (let i = 0; i < 100 && !b.cur()?.view; i++) await wait(200);
  const t = b.cur(), wc = t.view.webContents;
  for (let i = 0; i < 40 && !(await wc.mainFrame.executeJavaScript(`!!document.getElementById('b')`).catch(() => false)); i++) await wait(250);
  b.win.focus(); b.win.webContents.focus(); wc.focus(); await wait(300);
  const click = async (x: number, y: number, to = wc) => { to.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 }); to.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 }); await wait(1200); };
  await click(600, 500);                 // the first click into a fresh window only focuses it (seen 2026-10-25)
  await click(60, 40);
  for (let i = 0; i < 20 && !t.blockedPopup; i++) await wait(150);
  check('7 an ad the page opens on his click (another site) is stopped', !b.tabs.some((x: any) => String(x.url).includes('/ad')) && Boolean(t.blockedPopup), b.tabs.map((x: any) => x.url).join(' '));
  b.activate(t.id); await wait(300); wc.focus();
  await click(60, 140);
  const urls = b.tabs.map((x: any) => String(x.url));
  check('7 the link he clicked still opens, and the sneaky one riding on it does not', urls.some((u: string) => u.includes('/link')) && !urls.some((u: string) => u.includes('/sneaky')), urls.join(' '));

  // 7b: a plain click on a Yandex result opens it in the same tab (his pick); the page is Yandex's (mapped here)
  b.go(`https://yandex.com:${port}/search/?text=x`);
  for (let i = 0; i < 40 && !String(b.cur()?.url).includes('yandex.com'); i++) await wait(150);
  await wait(1500);
  const y = b.cur(), yn = b.tabs.length;
  b.win.focus(); y.view.webContents.focus(); await wait(200);
  await click(600, 500, y.view.webContents); await click(60, 140, y.view.webContents);
  for (let i = 0; i < 20 && b.tabs.length === yn; i++) await wait(150);
  check('7b a link a site opens in a new tab (here Yandex) opens a new tab, counted on the tab arrow', b.tabs.length === yn + 1 && b.newSince >= 1, `${y.url} tabs ${yn} -> ${b.tabs.length}, arrow +${b.newSince}`);
  check('7 the secret window blocks ads too', Boolean(s.ads), 'its ad lists did not start');
  // 8
  s.win.close();
  await wait(1500);
  check('8 closing the window locks it', s.locked === true && !s.tabs.length);
  // 8b: opened again, his PIN brings his tabs back from its folder
  s.open();
  for (let i = 0; i < 100 && !s.cur()?.view; i++) await wait(150);
  await wait(1200);
  const fw2 = s.win.webContents;
  s.win.focus(); fw2.focus();
  await s.secretMask('one');
  await wait(400);
  for (const k of ['1', '2', '3', '4']) { fw2.sendInputEvent({ type: 'keyDown', keyCode: k }); fw2.sendInputEvent({ type: 'keyUp', keyCode: k }); await wait(60); }
  for (let i = 0; i < 40 && s.locked; i++) await wait(150);
  const again = s.tabs.map((t: any) => String(t.url)).join(' ');
  check('8b opened again, a click on the mask and his PIN bring his tabs back', !s.locked && again.includes('/before') && again.includes('/kept'), again);
  // 8c: his tabs survive closing them one by one down to the last; and ⇧⌘N on a locked, minimized window brings it up
  const tabsFile = path.join(sdir, 'browser-tabs.json');
  while (s.tabs.length > 1) s.close(s.tabs[0].id);
  const lastUrl = String(s.tabs[0].url);
  s.close(s.tabs[0].id);
  await wait(2000);
  const after = existsSync(tabsFile) ? readFileSync(tabsFile, 'utf8') : '';
  check('8c closing the last secret tab keeps it for next time (never an empty list)', s.locked === true && after.includes(lastUrl) && !/"tabs":\[\]/.test(after), `last ${lastUrl}`);
  s.open();
  for (let i = 0; i < 100 && !s.cur()?.view; i++) await wait(150);
  await wait(1200);
  s.win.minimize();
  await wait(800);
  s.open();
  await wait(800);
  check('8c ⇧⌘N on a locked secret window that is out of sight brings it forward', s.locked === true && !s.win.isMinimized() && s.win.isVisible(), `minimized ${s.win.isMinimized()}, visible ${s.win.isVisible()}`);
  s.win.focus(); s.win.webContents.focus();
  await s.secretMask('one');
  await wait(400);
  for (const k of ['1', '2', '3', '4']) { s.win.webContents.sendInputEvent({ type: 'keyDown', keyCode: k }); s.win.webContents.sendInputEvent({ type: 'keyUp', keyCode: k }); await wait(60); }
  for (let i = 0; i < 40 && s.locked; i++) await wait(150);
  const kept3 = s.tabs.map((t: any) => String(t.url)).join(' ');
  check('8c and its PIN brings back the tab he closed last', !s.locked && kept3.includes(lastUrl), kept3);
  s.win.close();
  await wait(1500);
  // 9: five wrong PINs wipe it; a new one then needs his Mac password (never just picked by whoever is there)
  s.open();
  for (let i = 0; i < 100 && !s.cur()?.view; i++) await wait(150);
  await wait(1200);
  s.tray(true, { x: 42, y: 62 });
  for (let i = 0; i < 5; i++) await s.secretPinAct({ act: 'try', pin: '0000' });
  await s.secretPinAct({ act: 'set', pin: '5555' });
  check('9 a forgotten PIN cannot be replaced without his Mac password', s.locked === true && !s.secretPin.has(), `locked ${s.locked}, sealed ${s.secretPin.has()}`);
  // 10: the secret window searches with Yandex; normal Samara keeps its own engine
  s.go('pixel art masks');
  b.go('pixel art masks');
  await wait(400);
  const sUrl = s.tabs.map((x: any) => String(x.pending || x.url)).join(' '), bUrl = String(b.cur()?.pending || b.cur()?.url);
  check('10 the secret window searches with Yandex, normal Samara with its own', sUrl.includes('yandex.com/search/?text=pixel') && bUrl.includes('search.brave.com/search'), `${sUrl} | ${bUrl}`);
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  srv.close(); app.exit(bad ? 1 : 0);
});
