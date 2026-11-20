// Phase 3 (2026-11-18): passkeys go to Chrome, checked on the real AangBrowser, off his screen, never focused.
// - A site that asks for a passkey gets "not available" at once (no hang) and Samara offers "Open this page in Chrome?";
//   yes hands Chrome the page's own address (stubbed here: nothing reaches his real Chrome). Once per page, and never for
//   the quiet autofill kind of ask a page makes on load.
// - Google's "This browser or app may not be secure" (by its address or its words) offers Chrome too, for the service he
//   was signing in to. A normal Google sign-in page offers nothing.
// - The go/no-go's test-only switch (SAMARA_PASSKEY_TRY=1) shows passkeys on webauthn.io and nowhere else.
//
// Run (from src/Shell, hidden desktop):
//   powershell -NoProfile -ExecutionPolicy Bypass -File tools/hidden-desktop-run.ps1 -Command "npx electron test/electron/passkey-check.ts"
import { app, BrowserWindow, screen, shell } from 'electron';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { AangBrowser } from '../../src/browser.ts';
import { wireBrowser } from '../../src/browseripc.ts';

process.env.SAMARA_PASSKEY_TRY = '1';             // the test-only switch, as the go/no-go run sets it
const PORT = 47941, TLS = 47942;
app.commandLine.appendSwitch('host-resolver-rules',
  `MAP www.passkey-site.com 127.0.0.1:${PORT}, MAP webauthn.io 127.0.0.1:${PORT}, MAP accounts.google.com 127.0.0.1:${TLS}`);
app.commandLine.appendSwitch('unsafely-treat-insecure-origin-as-secure', `http://www.passkey-site.com:${PORT},http://webauthn.io:${PORT}`);
app.commandLine.appendSwitch('ignore-certificate-errors');   // the stand-in Google below has a certificate made here
process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e).split('\n')[0]); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 150_000).unref();
app.on('window-all-closed', () => { /* the check decides */ });
const TMP = mkdtempSync(path.join(os.tmpdir(), 'passkey-'));
app.setPath('userData', path.join(TMP, 'user'));
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-9000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* not in a test */ };
BrowserWindow.prototype.moveTop = function () { /* not in a test */ };
(shell as any).openExternal = async () => { /* never his apps */ };

let fails = 0;
const check = (what: string, ok: boolean, d: unknown = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d === '' ? '' : '  -- ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 240)}`); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => boolean, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await wait(80); } return fn(); };
const page = (body: string) => `<!doctype html><meta charset=utf-8><title>pk</title><body>${body}</body>`;

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  http.createServer((_q, r) => r.writeHead(200, { 'Content-Type': 'text/html' }).end(page('<p>a site with a passkey button</p>')))
    .listen(PORT, '127.0.0.1');
  // A stand-in accounts.google.com, over https with a certificate made for this run.
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=accounts.google.com',
    '-keyout', path.join(TMP, 'k.pem'), '-out', path.join(TMP, 'c.pem')], { stdio: 'ignore' });
  https.createServer({ key: readFileSync(path.join(TMP, 'k.pem')), cert: readFileSync(path.join(TMP, 'c.pem')) }, (q, r) => {
    const u = q.url ?? '/';
    const body = u.startsWith('/v3/signin/rejected') ? "<h1>Couldn't sign you in</h1>"
      : u.startsWith('/v3/signin/words') ? "<h1>Couldn't sign you in</h1><p>This browser or app may not be secure. Learn more</p>"
      : '<h1>Sign in</h1><p>to continue to Gmail</p>';
    r.writeHead(200, { 'Content-Type': 'text/html' }).end(page(body));
  }).listen(TLS, '127.0.0.1');

  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: path.join(TMP, 'state'), preloadPath: path.join(HERE, '..', '..', 'src', 'samarapreload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'),
    thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') }) as any;
  wireBrowser(() => b);                                       // the tab messages, as main.ts and macmain.ts wire them
  const handed: string[] = [];
  b.toChrome = (u: string) => { handed.push(u); };           // never his real Chrome
  const offers = () => b.notices.all.filter((n: any) => n.title === 'Open this page in Chrome?');
  const answerAll = () => { for (const n of offers()) b.notices.answer(n.id, 'yes'); };
  const openAt = async (url: string) => {
    const before = b.tabs.length; b.open(url);
    await until(() => b.tabs.length > before, 8000);
    const t = b.tabs.at(-1);
    await until(() => !t.loading && !!t.view, 10_000); await wait(700);
    return t;
  };
  const js = (t: any, code: string): Promise<any> => Promise.race([t.view.webContents.executeJavaScript(code, true).catch((e: Error) => 'threw: ' + e.message), wait(8000).then(() => 'NO ANSWER IN 8 S')]);

  // ---- A site asking for a passkey ----
  const SITE = `http://www.passkey-site.com:${PORT}/login`;
  const t = await openAt(SITE);
  check('passkeys stay hidden from sites', (await js(t, 'typeof PublicKeyCredential')) === 'undefined', await js(t, 'typeof PublicKeyCredential'));
  const quiet = await js(t, `navigator.credentials.get({ mediation: 'conditional', publicKey: { challenge: new Uint8Array(32) } }).then(() => 'resolved', (e) => e.name)`);
  await wait(800);
  check('the quiet autofill ask is refused and offers nothing', quiet === 'NotSupportedError' && offers().length === 0, { quiet, offers: offers().length });
  const t0 = Date.now();
  const made = await js(t, `navigator.credentials.create({ publicKey: { challenge: new Uint8Array(32), rp: { name: 'x' }, user: { id: new Uint8Array(8), name: 'a', displayName: 'a' }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }] } }).then(() => 'resolved', (e) => e.name)`);
  check('a real passkey ask is refused at once, never hangs', made === 'NotSupportedError' && Date.now() - t0 < 3000, { made, ms: Date.now() - t0 });
  await until(() => offers().length > 0, 4000);
  const o = offers()[0];
  check('Samara offers "Open this page in Chrome?"', !!o && /passkey-site\.com wants a passkey/i.test(o.kick ?? '') && o.keys?.[0]?.label === 'Open in Chrome', o);
  await js(t, `navigator.credentials.get({ publicKey: { challenge: new Uint8Array(32) } }).catch(() => 0)`);
  await wait(800);
  check('once per page: asking again does not stack offers', offers().length === 1, offers().length);
  answerAll(); await wait(300);
  check('yes hands Chrome the page Samara itself has open', handed.at(-1) === SITE, handed);

  // ---- The go/no-go's test-only switch ----
  const w = await openAt(`http://webauthn.io:${PORT}/`);
  check('SAMARA_PASSKEY_TRY=1 shows passkeys on webauthn.io (go/no-go only)', (await js(w, 'typeof PublicKeyCredential')) === 'function', await js(w, 'typeof PublicKeyCredential'));
  check('...and still nowhere else', (await js(t, 'typeof PublicKeyCredential')) === 'undefined');

  // ---- Google refusing the sign-in ----
  const g0 = await openAt('https://accounts.google.com/v3/signin/identifier');
  await wait(1200);
  check('a normal Google sign-in page offers nothing', offers().length === 0 && g0.view.webContents.getURL().startsWith('https://accounts.google.com/'), { offers: offers().length, url: g0.view.webContents.getURL() });
  await openAt('https://accounts.google.com/v3/signin/rejected?continue=https%3A%2F%2Fmail.google.com%2Fmail%2F');
  await until(() => offers().length > 0, 5000);
  check('Google\'s rejected-sign-in page offers Chrome', offers().length === 1 && /^google sign-in$/i.test(offers()[0].kick), offers()[0]);
  answerAll(); await wait(300);
  check('...for the service he was signing in to', handed.at(-1) === 'https://mail.google.com/mail/', handed.at(-1));
  await openAt('https://accounts.google.com/v3/signin/words');
  await until(() => offers().length > 0, 5000);
  check('"This browser or app may not be secure" in the page\'s words offers Chrome', offers().length === 1, offers().length);
  answerAll(); await wait(300);
  check('...and with nothing to go back to, Chrome gets Google\'s sign-in', handed.at(-1) === 'https://accounts.google.com/', handed.at(-1));

  console.log(fails ? `PASSKEY CHECK: ${fails} FAILED` : 'PASSKEY CHECK: ALL PASS');
  app.exit(fails ? 1 : 0);
});
