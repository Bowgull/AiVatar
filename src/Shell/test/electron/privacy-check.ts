// 2026-10-26 (his "I'm trying to gain more autonomy over my data"; picks after three research rounds): privacy.ts in a
// real Samara. shop.example is the page, yandex.com a site hidden inside it, www.netflix.com one that needs the honest name.
//  1 a hidden site's cookies neither go out nor come in; the page's own cookies (his logins) do both
//  2 a hidden site's cookie kept for this page only (Partitioned) still works
//  3 a sign-in box inside the page is let through by itself, and written in the privacy log
//  4 every request says "do not sell my data", and the page can read it
//  5 a link's tracking tags are taken off; its own parts (and utm_) stay
//  6 Netflix still gets Samara's honest name
//  7 the real address stays in (WebRTC policy)
//  8 the browser hints Chrome sends are sent, the same as the page reads; the honest-name sites get none
// Run: TEST_CERT_DIR=<dir with test-key.pem, test-cert.pem> npx electron test/electron/privacy-check.ts
import { app, BrowserWindow } from 'electron';
import https from 'node:https';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.message ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
app.commandLine.appendSwitch('host-resolver-rules', 'MAP shop.example 127.0.0.1, MAP yandex.com 127.0.0.1, MAP www.netflix.com 127.0.0.1');
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'pv-ud-')));
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (w: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${w}${d ? ' (' + d + ')' : ''}`); if (!ok) bad++; };
type Hit = { host: string; url: string; cookie: string; gpc: string; ua: string; ch: string };
app.whenReady().then(async () => {
  const CERT = process.env.TEST_CERT_DIR!;
  const hits: Hit[] = [];
  let port = 0;
  const srv = https.createServer({ key: readFileSync(path.join(CERT, 'test-key.pem')), cert: readFileSync(path.join(CERT, 'test-cert.pem')) }, (q, r) => {
    const host = String(q.headers.host).split(':')[0]!, url = String(q.url);
    hits.push({ host, url, cookie: String(q.headers.cookie ?? ''), gpc: String(q.headers['sec-gpc'] ?? ''), ua: String(q.headers['user-agent'] ?? ''), ch: String(q.headers['sec-ch-ua'] ?? '') + '|' + String(q.headers['sec-ch-ua-platform'] ?? '') });
    const A = `https://yandex.com:${port}`;
    if (host === 'yandex.com' && url === '/home') { r.writeHead(200, { 'Set-Cookie': 'track=1; SameSite=None; Secure; Path=/', 'Content-Type': 'text/html' }); r.end('<p>ads home'); return; }
    if (host === 'yandex.com' && url.startsWith('/login')) { r.writeHead(200, { 'Set-Cookie': 'sess=1; SameSite=None; Secure; Path=/', 'Content-Type': 'text/html' }); r.end('<p>sign in'); return; }
    if (host === 'yandex.com' && url === '/frame') { r.writeHead(200, { 'Set-Cookie': ['again=1; SameSite=None; Secure; Path=/', 'part=1; SameSite=None; Secure; Path=/; Partitioned'], 'Content-Type': 'text/html' }); r.end('<p>ad'); return; }
    if (host === 'shop.example' && url === '/') { r.writeHead(200, { 'Set-Cookie': 'mine=1; Path=/; Secure', 'Content-Type': 'text/html' }); r.end(`<p>shop</p><iframe src="${A}/frame"></iframe>`); return; }
    if (host === 'shop.example' && url === '/signin') { r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(`<p>shop</p><iframe src="${A}/login?next=1"></iframe>`); return; }
    r.writeHead(200, { 'Content-Type': 'text/html' }); r.end('<p>page');          // (favicons and the rest: no cookies)
  });
  await new Promise<void>((res) => srv.listen(0, '127.0.0.1', () => res()));
  port = (srv.address() as any).port;
  const S = `https://shop.example:${port}`, A = `https://yandex.com:${port}`;
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const stateDir = mkdtempSync(path.join(os.tmpdir(), 'pv-s-'));
  const b: any = new AangBrowser({ origin: pages.origin, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs'), stateDir });
  wireBrowser(() => b);
  b.ses.setCertificateVerifyProc((_r: unknown, cb: (n: number) => void) => cb(0));
  const go = async (url: string) => {
    const before = b.cur()?.view?.webContents;
    b.open(url);
    for (let i = 0; i < 60 && (!b.cur()?.view || b.cur().view.webContents === before); i++) await wait(150);
    const wc = b.cur().view.webContents;
    for (let i = 0; i < 40 && wc.isLoading(); i++) await wait(150);
    await wait(700);
    return wc;
  };
  const last = (host: string, pre: string) => [...hits].reverse().find((h) => h.host === host && h.url.startsWith(pre));
  // he visits the hidden site himself first: it has a cookie of its own now (as Google or Facebook would)
  await go(`${A}/home`);
  await go(`${S}/`); await go(`${S}/`);
  const f2 = last('yandex.com', '/frame');
  check('1a a hidden site gets none of its cookies inside another page', !!f2 && !/track=1|again=1/.test(f2.cookie), f2?.cookie);
  const s2 = last('shop.example', '/');
  check('1b the page\'s own cookie (a login) still goes', !!s2 && s2.cookie.includes('mine=1'), s2?.cookie);
  const jar = (await b.ses.cookies.get({})).map((c: any) => c.name);
  await go(`${S}/`);
  const f3 = last('yandex.com', '/frame');
  check('1c the hidden site could not set a new cookie of its own', !jar.includes('again'), jar.join(','));
  check('2 a cookie kept for this page only still works, and nothing else of that site', !!f3 && f3.cookie === 'part=1', f3?.cookie);
  await go(`${S}/signin`); await go(`${S}/signin`);
  const l2 = last('yandex.com', '/login');
  const log = (() => { try { return readFileSync(path.join(stateDir, 'privacy-log.jsonl'), 'utf8'); } catch { return ''; } })();
  check('3 a sign-in box inside the page is let through, and written down', !!l2 && l2.cookie.includes('sess=1') && /cookies-let-through.*yandex\.com.*shop\.example/.test(log), `${l2?.cookie} | ${log.trim().slice(0, 160)}`);
  const wc = await go(`${S}/x`);
  check('4a every request says do not sell my data', hits.filter((h) => h.host !== 'www.netflix.com').every((h) => h.gpc === '1'), String(hits.filter((h) => h.gpc !== '1').length));
  check('4b the page can read it', await wc.executeJavaScript('navigator.globalPrivacyControl === true'));
  const wc5 = await go(`${S}/item?id=3&fbclid=abc&utm_source=news&gclid=zz`);
  const at = wc5.getURL();
  check('5 a link\'s tracking tags are taken off, its own parts stay', /[?&]id=3/.test(at) && /utm_source=news/.test(at) && !/fbclid|gclid/.test(at) && !!last('shop.example', '/item?id=3&utm_source=news') && !hits.some((h) => h.url.includes('fbclid')), at);
  await go(`https://www.netflix.com:${port}/browse`);
  const n = last('www.netflix.com', '/browse');
  check('6 Netflix still gets the honest name', !!n && n.ua === b.honestUA && n.ua.includes('Electron'), n?.ua);
  check('7 the real address stays in', b.cur().view.webContents.getWebRTCIPHandlingPolicy() === 'default_public_interface_only');
  const reads = await wc5.executeJavaScript('navigator.userAgentData.brands.map((x) => `"${x.brand}";v="${x.version}"`).join(", ")');
  const it = last('shop.example', '/item');
  check('8 the browser hints go out as the page reads them, never with the honest name', !!it && it.ch === `${reads}|"macOS"` && n?.ch === '|', `${it?.ch} vs ${reads}; netflix ${n?.ch}`);
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  srv.close(); app.exit(bad ? 1 : 0);
});
