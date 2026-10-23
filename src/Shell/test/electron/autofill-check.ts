// Autofill, sheet 77 (2026-10-23), in the real browser off screen, against a made-up shop over https and a stand-in
// Bitwarden (test/fixtures/fake-bw.mjs): the light shows by an email box, Tab fills it, the arrow takes the next email,
// one click fills a whole form, the PIN opens Bitwarden in the address bar without the page seeing the digits, five
// wrong PINs wipe the seal, and a new login is offered and kept after he says Save.
// Run: npx electron test/electron/autofill-check.ts
import { app, BrowserWindow } from 'electron';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, Number(process.env.TMO) || 150_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = 47993, SHOP = `https://shop.example:${PORT}`;
const tmp = mkdtempSync(path.join(os.tmpdir(), 'af-'));
process.env.AANG_TEST_BW = path.join(HERE, '..', 'fixtures', 'fake-bw.mjs');
process.env.FAKE_BW_DIR = tmp;
app.setPath('userData', path.join(tmp, 'ud'));
app.commandLine.appendSwitch('host-resolver-rules', 'MAP shop.example 127.0.0.1');
app.commandLine.appendSwitch('ignore-certificate-errors');
// Off screen and never focused (the test must not take his keyboard): keep its pages running at full speed.
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let all = true;
const ok = (name: string, pass: boolean, note = '') => { console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${note ? ' (' + note + ')' : ''}`); all = pass && all; return pass; };
const PAGES: Record<string, string> = {
  '/signin': `<!doctype html><title>Sign in</title><form action="/account" method="get" style="margin:40px">
    <label>Email <input id="email" type="email" autocomplete="username"></label><br><label>Password <input id="pw" type="password" autocomplete="current-password"></label><br><button>Continue</button></form>`,
  '/account': `<!doctype html><title>Account</title><p>Welcome back.</p>`,
  '/ship': `<!doctype html><title>Shipping</title><form style="margin:40px"><input id="name" autocomplete="name"><input id="mail" type="email"><input id="tel" type="tel">
    <input id="street" autocomplete="address-line1"><input id="city" autocomplete="address-level2"><input id="postal" autocomplete="postal-code"></form>`,
  '/new': `<!doctype html><title>New</title><form action="/account" method="get" style="margin:40px"><input id="u" autocomplete="username"><input id="p" type="password"><button id="go">Join</button></form>`,
};

app.whenReady().then(async () => {
  console.log('stage: cert');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(tmp, 'k.pem'), '-out', path.join(tmp, 'c.pem'), '-days', '1', '-subj', '/CN=shop.example'], { stdio: 'ignore' });
  https.createServer({ key: readFileSync(path.join(tmp, 'k.pem')), cert: readFileSync(path.join(tmp, 'c.pem')) }, (q, r) => {
    const p = (q.url ?? '/').split('?')[0]!;
    r.writeHead(PAGES[p] ? 200 : 404, { 'Content-Type': 'text/html' }).end(PAGES[p] ?? 'no');
  }).listen(PORT, '127.0.0.1');
  console.log('stage: server');
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const stateDir = path.join(tmp, 'state');
  const b: any = new AangBrowser({ origin: pages.origin, stateDir, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') });
  wireBrowser(() => b);
  console.log('stage: browser made');
  b.setSetting('afDetails', { name: 'Alex Example', emails: ['alex@example.com', 'alex.work@example.com'], phone: '555-0142', street: '12 Harbour St', city: 'Halifax', postal: 'B3H 1A1' });
  const shopTab = () => b.tabs.find((t: any) => t.view && !t.internal && !t.view.webContents.isDestroyed());
  const tab = () => shopTab().view.webContents as Electron.WebContents;
  const go = async (p: string) => { await Promise.race([tab().loadURL(SHOP + p).catch(() => {}), wait(6000)]); await wait(900); };
  const val = (sel: string) => tab().executeJavaScript(`document.querySelector(${JSON.stringify(sel)}).value`) as Promise<string>;
  const focus = async (sel: string) => { tab().focus(); await tab().executeJavaScript(`document.querySelector(${JSON.stringify(sel)}).focus(); 1`); await wait(700); };
  // Keys go straight to Samara's own key check for the tab (what before-input-event calls), so the test never takes the
  // keyboard from his other apps. Not taken there: typed into the page, as the page would get it.
  const KEYS: Record<string, string> = { Down: 'ArrowDown', Up: 'ArrowUp' };
  const key = async (k: string) => {
    const input = { type: 'keyDown', key: KEYS[k] ?? k, code: '', isAutoRepeat: false, shift: false, control: false, alt: false, meta: false } as unknown as Electron.Input;
    if (!b.afKey(shopTab(), input)) await tab().executeJavaScript(`(() => { const e = document.activeElement; if (e && 'value' in e && ${JSON.stringify(KEYS[k] ?? k)}.length === 1) e.value += ${JSON.stringify(k)}; return 1; })()`);
    await wait(250);
  };
  const lightOn = () => Boolean(b.pane.lightV?.getVisible());
  // Waits for what it is waiting for (a busy Mac is slow), up to a limit.
  const until = async (f: () => unknown, ms = 8000) => { for (let t = 0; t < ms; t += 150) { if (await f()) return true; await wait(150); } return false; };

  console.log('stage: open');
  b.open(SHOP + '/signin');
  // A slow Mac can take a while to make the first window: wait for the tab, not a fixed time.
  for (let i = 0; i < 100 && !shopTab(); i++) await wait(300);
  await wait(1500);
  console.log('stage: opened ' + JSON.stringify(b.tabs.map((t: any) => ({ id: t.id, url: t.url, view: !!t.view, blocked: t.blocked, internal: t.internal }))) + ' panes ' + b.panes.length);
  // Box focus needs the window's focus (a page that is not focused gets no focus events): it is taken for this test's
  // ~40 seconds, off screen.
  b.win.focus(); b.win.webContents.focus();

  // 1 · the light by an email box, Tab fills, the arrow takes the next email (no login saved yet: Bitwarden is locked
  //     and there is no PIN, so only his details are offered for the email box)
  await go('/ship');
  console.log('stage: ship');
  await focus('#mail');
  console.log('stage: focused ' + JSON.stringify({ af: b.af && { kind: b.af.kind, offer: b.af.offer, empty: b.af.empty }, light: lightOn(), active: b.active, cur: b.cur()?.id, url: tab().getURL() }));
  ok('the light shows beside an email box', lightOn());
  const lb = b.pane.lightV?.getBounds(), fb = await tab().executeJavaScript(`(() => { const r = document.querySelector('#mail').getBoundingClientRect(); return { x: r.right, y: r.top + r.height / 2 }; })()`);
  ok('...right beside the box', lb && Math.abs(lb.x - (shopTab().view.getBounds().x + fb.x)) <= 6, JSON.stringify({ lb, fb }));
  await key('Down'); await key('Tab');
  ok('the arrow then Tab fills the second email', (await val('#mail')) === 'alex.work@example.com', await val('#mail'));
  ok('...and the other boxes of the form too (one move)', (await val('#name')) === 'Alex Example' && (await val('#postal')) === 'B3H 1A1', `${await val('#name')} / ${await val('#postal')}`);
  ok('the light goes once it has filled', await until(() => !lightOn(), 3000));

  // 2 · a click on the light fills the whole form
  await go('/ship');
  await focus('#name');
  ok('the light shows by the name box', lightOn());
  await b.afPick(); await wait(400);
  ok('one click fills name, phone, street, city', (await val('#name')) === 'Alex Example' && (await val('#tel')) === '555-0142' && (await val('#street')) === '12 Harbour St' && (await val('#city')) === 'Halifax', [await val('#name'), await val('#tel'), await val('#street'), await val('#city')].join(' | '));
  ok('...and the main email', (await val('#mail')) === 'alex@example.com');

  // 3 · the PIN: open Bitwarden once with the master password, set a PIN, lock (it only forgets the session here)
  ok('the master password opens the stand-in Bitwarden', await b.vault.unlock('correct horse'));
  await b.learnSites();
  await b.afSetPin({ pin: '1234', again: '1234' }); await wait(300);
  ok('the PIN is sealed', b.pinSeal.has());
  b.vault.lock();
  ok('locking only forgets the session (the PIN can open it again)', b.vault.current() === null && JSON.parse(readFileSync(path.join(tmp, 'state.json'), 'utf8')).unlocked === true);
  await go('/signin');
  await focus('#pw');
  ok('a password box on a site with a login: the bar asks for the PIN', b.afPin !== null);
  await key('1'); await key('2'); await key('3');
  ok('the page never sees the PIN', (await val('#pw')) === '' && (await val('#email')) === '', `"${await val('#pw')}"`);
  await key('4'); await until(() => b.vault.current() !== null); await until(async () => (await val('#pw')) !== '');
  ok('the fourth digit opens Bitwarden', b.vault.current() !== null);
  ok('...and the light brings the login', (await val('#email')) === 'alex@example.com' && (await val('#pw')) === 'opensesame', `${await val('#email')} / ${(await val('#pw')).length} chars`);

  // 4 · five wrong PINs: the seal is gone, the master password again
  b.vault.lock();
  await go('/signin');
  await focus('#pw');
  for (let i = 0; i < 5; i++) { for (const d of '9999') await key(d); await until(() => !b.afPin?.checking, 4000); await wait(200); }
  ok('five wrong PINs wipe the seal', !b.pinSeal.has() && !existsSync(path.join(stateDir, 'autofill-pin.json')));
  ok('...and lock the tool itself', JSON.parse(readFileSync(path.join(tmp, 'state.json'), 'utf8')).unlocked === false);

  // 5 · a new login: offered after the page moves on; Save keeps exactly what he saw
  await b.vault.unlock('correct horse');
  await go('/new');
  await tab().executeJavaScript(`document.querySelector('#u').value = 'newbie'; document.querySelector('#p').value = 'hunter2!'; document.querySelector('#go').click(); 1`);
  await until(() => b.afBandMode === 'save', 15000);
  ok('a new login waits behind the key', b.afSave !== null && b.afBandMode === 'save', JSON.stringify({ host: b.afSave?.host, user: b.afSave?.user }));
  await b.afSaveGo({ site: 'shop.example', user: 'newbie', pass: 'hunter2!' }); await wait(800);
  const made = existsSync(path.join(tmp, 'created.log')) ? readFileSync(path.join(tmp, 'created.log'), 'utf8') : '';
  ok('Save keeps it in Bitwarden, as he saw it', /"username":"newbie"/.test(made) && /"password":"hunter2!"/.test(made) && /shop\.example/.test(made));
  ok('the secret went in by stdin, never the command line', !made.includes('--') && b.afSave === null);

  console.log(all ? 'ALL PASS' : 'FAILED'); app.exit(all ? 0 : 1);
});
