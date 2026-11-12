// Chrome parity sweep (plan Phase 0, 2026-11-12): the things a daily browser must do, checked on the real AangBrowser,
// off his screen and never focused, so nothing reaches his mouse, keys, game, Downloads folder or real profile.
// "Public" sites are served from this computer (host-resolver-rules), so almost every row works offline.
// Each row prints PASS (does what Chrome does), FAIL (a gap or a bug) or INFO. FAILs are the baseline bug list; every
// later fix turns one row green.
//
// Run: npx electron test/electron/chrome-parity-sweep.ts [folder for pictures]
import { app, BrowserWindow, screen, shell } from 'electron';
import http from 'node:http';
import { mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { AangBrowser } from '../../src/browser.ts';

const PORT = 47926, SECRET = 47927;
const PUB = `http://www.public-site.com:${PORT}`;
app.commandLine.appendSwitch('host-resolver-rules',
  `MAP www.public-site.com 127.0.0.1:${PORT}`);
// The stand-in site counts as https, so the browser's own secure-origin rule never hides what Samara decides.
app.commandLine.appendSwitch('unsafely-treat-insecure-origin-as-secure', `http://www.public-site.com:${PORT}`);
process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e).split('\n')[0]); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 240_000).unref();
app.on('window-all-closed', () => { /* the sweep decides */ });
const TMP = mkdtempSync(path.join(os.tmpdir(), 'parity-'));
app.setPath('userData', path.join(TMP, 'user'));
const DL = path.join(TMP, 'downloads');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = (() => { const a = process.argv.at(-1); try { return a && statSync(a).isDirectory() ? a : TMP; } catch { return TMP; } })();
// Off his screen, never in front of his game.
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-9000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* not in a test */ };
BrowserWindow.prototype.moveTop = function () { /* not in a test */ };
// Nothing is ever handed to his real Chrome or another app: recorded instead.
const handedOut: string[] = [];
(shell as any).openExternal = async (u: string) => { handedOut.push(u); };

const rows: { r: string; what: string; d: string }[] = [];
const row = (r: 'PASS' | 'FAIL' | 'INFO', what: string, d: unknown = '') => {
  const s = typeof d === 'string' ? d : JSON.stringify(d);
  rows.push({ r, what, d: s }); console.log(`${r}  ${what}${s ? '  -- ' + s.slice(0, 220) : ''}`);
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => boolean, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await wait(80); } return fn(); };

// A one-page PDF, smallest valid form.
const PDF = '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF';
const page = (body: string) => `<!doctype html><meta charset=utf-8><title>sweep</title><body>${body}</body>`;

app.whenReady().then(async () => {
  app.setPath('downloads', DL);
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  let secretHits = 0;
  const secret = http.createServer((_q, r) => { secretHits++; r.writeHead(200, { 'Access-Control-Allow-Origin': '*' }).end('home'); });
  await new Promise<void>((r) => secret.listen(SECRET, '::', () => r()));
  const site = http.createServer((q, r) => {
    const u = q.url ?? '/';
    if (u.startsWith('/auth')) {
      if (q.headers.authorization) { r.writeHead(200, { 'Content-Type': 'text/html' }).end(page('signed in')); return; }
      r.writeHead(401, { 'WWW-Authenticate': 'Basic realm="router"', 'Content-Type': 'text/html' }).end(page('401')); return;
    }
    if (u.startsWith('/file.txt')) { setTimeout(() => r.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="invoice.txt"' }).end('x'.repeat(200_000)), 400); return; }
    if (u.startsWith('/doc.pdf')) { r.writeHead(200, { 'Content-Type': 'application/pdf' }).end(PDF); return; }
    r.writeHead(200, { 'Content-Type': 'text/html' }).end(page('<p>public page</p><input id=t>'));
  });
  await new Promise<void>((r) => site.listen(PORT, '127.0.0.1', () => r()));
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: path.join(TMP, 'state'), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'),
    thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') }) as any;

  const tabFor = (url: string) => b.tabs.find((x: any) => String(x.url).startsWith(url));
  const openAt = async (url: string, settle = 2200) => {
    const before = b.tabs.length; b.open(url);
    await until(() => b.tabs.length > before || !!tabFor(url), 8000); await wait(settle);
    return b.tabs.at(-1);
  };
  const js = (t: any, code: string): Promise<any> => !t?.view?.webContents || t.view.webContents.isDestroyed() ? Promise.resolve('no view')
    : Promise.race([t.view.webContents.executeJavaScript(code, true).catch((e: Error) => 'threw: ' + String(e.message).slice(0, 80)), wait(8000).then(() => 'no answer in 8 s')]);
  const shot = async (t: any, name: string) => { try { const img = await t.view.webContents.capturePage(); writeFileSync(path.join(OUT, `sweep-${name}.png`), img.toPNG()); } catch { /* no picture */ } };

  const t = await openAt(PUB + '/');
  if (!t?.view) { row('FAIL', 'Samara opens a public page at all', 'no tab view'); return finish(); }
  row('PASS', 'Samara opens a public page');

  // ---- Permissions a web app asks for ----
  const perm = await js(t, `Promise.all(['notifications','geolocation','clipboard-read','midi','camera','microphone'].map((n) =>
    navigator.permissions.query({ name: n }).then((s) => n + '=' + s.state).catch((e) => n + '=error'))).then((a) => a.join(' '))`);
  row('INFO', 'permission states a site sees before asking', perm);
  const notif = await js(t, `Notification.requestPermission().then(String)`);
  row(notif === 'denied' ? 'FAIL' : 'PASS', 'notifications: a site can ask (Gmail, Slack, Calendar)', `requestPermission -> ${notif}`);
  const geo = await js(t, `new Promise((r) => navigator.geolocation.getCurrentPosition(() => r('granted'), (e) => r('error ' + e.code + ' ' + e.message), { timeout: 4000 }))`);
  row(/error 1/.test(String(geo)) ? 'FAIL' : 'INFO', 'location: a site can ask (maps, delivery)', geo);
  const clip = await js(t, `navigator.clipboard.readText().then(() => 'read').catch((e) => 'refused: ' + e.name)`);
  row(/NotAllowed/.test(String(clip)) ? 'FAIL' : 'INFO', 'clipboard read: a paste button can ask', clip);

  // ---- Sign-in kinds ----
  row(typeof (await js(t, 'typeof PublicKeyCredential')) === 'string' && (await js(t, 'typeof PublicKeyCredential')) === 'function' ? 'PASS' : 'FAIL',
    'passkeys / security keys (WebAuthn) are there for sites', await js(t, 'typeof PublicKeyCredential'));
  row(app.listenerCount('login') > 0 ? 'PASS' : 'FAIL', 'password-protected sites (HTTP Basic: routers, intranets) get a sign-in box', `app 'login' listeners: ${app.listenerCount('login')}`);
  const a = await openAt(PUB + '/auth');
  row('INFO', 'what a Basic-auth page shows', String(await js(a, 'document.body.innerText')).slice(0, 60));
  // Electron keeps one listener of its own here (it picks the first certificate silently), so Samara's makes it two.
  row(app.listenerCount('select-client-certificate') > 1 ? 'PASS' : 'FAIL', 'client certificates are picked by him, not silently', `listeners: ${app.listenerCount('select-client-certificate')} (1 = Electron's silent default only)`);

  // ---- Unsaved work ----
  const u = await openAt(PUB + '/unload');
  await js(u, `document.getElementById('t').value = 'half a long email'; window.onbeforeunload = (e) => { e.preventDefault(); e.returnValue = ''; return ''; }; 1`);
  let asked = false;
  u.view.webContents.once('will-prevent-unload', () => { asked = true; });
  const uid = u.id; b.close(uid); await wait(1200);
  const stillOpen = b.tabs.some((x: any) => x.id === uid);
  row(asked || stillOpen ? 'PASS' : 'FAIL', 'closing a tab with unsaved work asks first (beforeunload)', `asked ${asked}, tab still open ${stillOpen}`);

  // ---- Popups pages build themselves ----
  const p = await openAt(PUB + '/popups');
  b.lastGesture?.set(p.id, Date.now());
  // A page's own blob: or blank page opens as a small popup window (it keeps its link to the page), not a tab.
  let n0 = b.tabs.length, w0 = BrowserWindow.getAllWindows().length;
  await js(p, `window.open(URL.createObjectURL(new Blob(['<p>made by the page</p>'], { type: 'text/html' }))); 1`); await wait(1500);
  const w1 = BrowserWindow.getAllWindows().length;
  row(b.tabs.length > n0 || w1 > w0 ? 'PASS' : 'FAIL', 'a blob: page a site builds opens (generated PDFs, previews)', `tabs ${n0} -> ${b.tabs.length}, windows ${w0} -> ${w1}`);
  b.lastGesture?.set(p.id, Date.now()); n0 = b.tabs.length;
  const blank = await js(p, `(() => { const w = window.open(''); if (!w) return 'null'; try { w.document.write('<p>print me</p>'); return 'written'; } catch (e) { return 'threw ' + e.message; } })()`); await wait(1000);
  row(blank === 'written' ? 'PASS' : 'FAIL', 'window.open("") + document.write works (print previews, some sign-ins)', `${blank}, tabs ${n0} -> ${b.tabs.length}`);

  // ---- Home network guard ----
  const g = await openAt(PUB + '/guard');
  const hits0 = secretHits;
  const mapped = await js(g, `fetch('http://[::ffff:7f00:1]:${SECRET}/', { mode: 'no-cors' }).then(() => 'reached').catch(() => 'stopped')`);
  row(secretHits === hits0 ? 'PASS' : 'FAIL', 'a website cannot reach this PC by writing 127.0.0.1 as IPv6 ([::ffff:7f00:1])', `${mapped}, hits ${secretHits - hits0}`);
  const h1 = secretHits;
  const rebind = await js(g, `fetch('http://localtest.me:${SECRET}/', { mode: 'no-cors' }).then(() => 'reached').catch(() => 'stopped')`);
  row(secretHits === h1 ? 'PASS' : 'FAIL', 'a public name that points at this PC is stopped (DNS rebinding; localtest.me, needs internet)', `${rebind}, hits ${secretHits - h1}`);
  const h2 = secretHits; b.lastGesture?.set(g.id, Date.now());
  await js(g, `window.open('http://127.0.0.1:${SECRET}/new-tab'); 1`); await wait(2000);
  row(secretHits === h2 ? 'PASS' : 'FAIL', 'a website cannot open this PC in a new tab (window.open skips will-navigate)', `hits ${secretHits - h2}`);

  // ---- Page-world leaks ----
  // The switch stays on the page's window (the page's own play() goes through it), but answers only to the preload's
  // secret: a page guessing it gets nothing. Two arguments = the keyed switch; one = the old open one.
  const leak = await js(t, `typeof window.__samaraMayPlay === 'function' ? String(window.__samaraMayPlay.length) : 'none'`);
  row(leak === '1' ? 'FAIL' : 'PASS', 'pages cannot switch off "nothing plays until I click"', `switch arguments: ${leak} (2 = needs Samara's secret)`);

  // ---- Downloads ----
  const d = await openAt(PUB + '/dl');
  d.view.webContents.downloadURL(PUB + '/file.txt?1'); d.view.webContents.downloadURL(PUB + '/file.txt?2');
  await wait(4000);
  let files: string[] = []; try { files = readdirSync(DL).filter((f) => f.startsWith('invoice')); } catch { /* none */ }
  row(files.length === 2 ? 'PASS' : 'FAIL', 'two downloads with the same name both survive', files.join(', ') || 'none');

  // ---- Pages and schemes ----
  const pdf = await openAt(PUB + '/doc.pdf', 2500);
  row(tabFor(PUB + '/doc.pdf') ? 'PASS' : 'FAIL', 'a PDF opens in the built-in viewer', String(pdf?.url));
  await shot(pdf, 'pdf');
  const nb = b.tabs.length; b.open('view-source:' + PUB + '/'); await wait(1500);
  row(b.tabs.some((x: any) => String(x.url).startsWith('view-source:')) ? 'PASS' : 'FAIL', 'view-source: works', `tabs ${nb} -> ${b.tabs.length}`);
  const fileUrl = 'file:///' + path.join(TMP, 'local.html').replace(/\\/g, '/'); writeFileSync(path.join(TMP, 'local.html'), page('local file'));
  b.open(fileUrl); await wait(1500);
  row(b.tabs.some((x: any) => String(x.url).startsWith('file:')) ? 'PASS' : 'FAIL', 'a local .html file opens when typed (file://)', String(b.tabs.at(-1)?.url));

  // ---- Keys Chrome has ----
  const keys = await js(t, `window.__k = []; addEventListener('keydown', (e) => __k.push((e.ctrlKey ? 'C+' : '') + e.key), true); 1`);
  void keys;
  for (const k of ['f', 'h', 'j', 'l', 'k']) { t.view.webContents.sendInputEvent({ type: 'keyDown', keyCode: k, modifiers: ['control'] }); t.view.webContents.sendInputEvent({ type: 'keyUp', keyCode: k, modifiers: ['control'] }); }
  await wait(500);
  const got = await js(t, 'window.__k.join(" ")');
  row('INFO', 'which Ctrl keys a page itself can use (Chrome lets pages have Ctrl+F/H/J/K/L)', `page saw: ${got || 'none'}`);
  const acts = ['print', 'bookmark', 'newwindow', 'save', 'fullscreen', 'devtools', 'source', 'hardreload', 'private'];
  const src = String((b as any).act);
  row('INFO', 'browser commands the act() table knows', acts.map((x) => `${x}:${new RegExp(`'${x}'`).test(src) ? 'yes' : 'no'}`).join(' '));
  row(String((b as any).act).includes('openDevTools') || /openDevTools/.test(Object.getOwnPropertyNames(Object.getPrototypeOf(b)).map((m) => String(b[m])).join('')) ? 'PASS' : 'FAIL', 'DevTools / Inspect exist');

  // ---- Banks (decision: allow them, locked down) ----
  const ho = handedOut.length; b.open('https://www.rbc.com/'); await wait(1500);
  row(handedOut.length > ho ? 'FAIL' : 'INFO', 'a bank opens in Samara (not handed to Chrome)', handedOut.slice(ho).join(' ') || String(b.tabs.at(-1)?.url));

  // ---- Real certificate errors (needs internet; INFO only) ----
  const c = await openAt('https://expired.badssl.com/', 3500);
  row('INFO', 'an expired certificate shows', `${c?.url} failed=${JSON.stringify(c?.failed ?? c?.blocked ?? null).slice(0, 120)}`);
  await shot(c, 'cert');

  row('INFO', 'handed to other apps during the sweep', handedOut.join(' ') || 'nothing');
  finish();

  function finish() {
    writeFileSync(path.join(OUT, 'sweep-results.json'), JSON.stringify(rows, null, 1));
    const fails = rows.filter((x) => x.r === 'FAIL').length;
    console.log(`\n${rows.filter((x) => x.r === 'PASS').length} PASS, ${fails} FAIL, ${rows.filter((x) => x.r === 'INFO').length} INFO  (results: ${path.join(OUT, 'sweep-results.json')})`);
    app.exit(fails ? 1 : 0);
  }
});
