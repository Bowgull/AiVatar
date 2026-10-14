// The Chrome extension's tools, in Samara (2026-10-14): the fixed page readers, his own tabs (read-only unless he
// lets a session drive), hover, drag, resize, console, network and a recording. Real sites are never touched.
//
// Run: npx electron test/electron/driver6-check.ts
import { app, BrowserWindow, screen } from 'electron';
import http from 'node:http';
import { existsSync, mkdtempSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { AangBrowser } from '../../src/browser.ts';

const PORT = 47915;
process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* not in a test */ };
const VIDEOS = mkdtempSync(path.join(os.tmpdir(), 'drv6-vid-'));
app.setPath('videos', VIDEOS);
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d.replace(/\s+/g, ' ').slice(0, 240) : ''}`); if (!ok) bad++; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PAGE = `<!doctype html><title>Customer Success Manager - Acme</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"Customer Success Manager","datePosted":"2026-10-10","jobLocationType":"TELECOMMUTE","hiringOrganization":{"@type":"Organization","name":"Acme"},"baseSalary":{"@type":"MonetaryAmount","currency":"CAD","value":{"@type":"QuantitativeValue","minValue":80000,"maxValue":95000,"unitText":"YEAR"}}}</script>
<body><h1>Customer Success Manager</h1>
<table><caption>Pay bands</caption><tr><th>Level</th><th>Pay</th></tr><tr><td>Mid</td><td>$85k</td></tr></table>
<img alt="Team photo at the Toronto office" width="200" height="120" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
<svg width="300" height="100" aria-label="Hires per year"><text>2024</text><text>12</text><text>2025</text><text>20</text></svg>
<a href="/apply">Apply here</a> <a href="https://out.example/r?url=https%3A%2F%2Fboards.greenhouse.io%2Facme%2Fjobs%2F1">Real posting</a>
<div id="menu" style="padding:20px" onmouseenter="document.getElementById('tip').hidden=false"><button>More</button><div id="tip" hidden>Hidden menu item</div></div>
<input type="range" aria-label="Volume" min="0" max="100" value="10" style="width:200px">
<script>console.log('hello from the page'); console.error('something broke');</script>
</body>`;

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const site = http.createServer((q, r) => { const api = String(q.url).startsWith('/api'); r.writeHead(200, { 'Content-Type': api ? 'application/json' : 'text/html' }).end(api ? '{}' : PAGE); });
  await new Promise<void>((r) => site.listen(PORT, '127.0.0.1', () => r()));
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'drv6-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs'), testLocal: true }) as any;
  const URL1 = `http://127.0.0.1:${PORT}/job`;
  const job = (await b.drive('start', { kind: 'claude', name: 'test' })).job;
  const p = (await b.drive('open', { job, url: URL1 })).page;
  await wait(800);

  // the readers
  const det = await b.drive('extract', { page: p, kind: 'details' });
  const dt = (det.lines ?? []).join('\n');
  check('details: the hidden job facts (pay, remote, posted)', det.ok && /JobPosting/.test(dt) && /minValue: 80000/.test(dt) && /TELECOMMUTE/.test(dt) && /2026-10-10/.test(dt) && /Acme/.test(dt), dt);
  const tb = await b.drive('extract', { page: p, kind: 'tables' });
  check('tables: clean rows', tb.ok && tb.lines.includes('Mid | $85k') && /Pay bands/.test(tb.lines[0]), JSON.stringify(tb.lines));
  const im = await b.drive('extract', { page: p, kind: 'images' });
  check('images: picture and chart labels', im.ok && im.lines.some((l: string) => /Team photo/.test(l)) && im.lines.some((l: string) => /Hires per year: 2024 \| 12/.test(l)), JSON.stringify(im.lines));
  const ln = await b.drive('extract', { page: p, kind: 'links' });
  check('links: where they really go, tracking unwrapped', ln.ok && ln.lines.some((l: string) => /Real posting -> LEAVES THE SITE: boards.greenhouse.io\/acme\/jobs\/1/.test(l)) && ln.lines.some((l: string) => /Apply here -> \/apply/.test(l)), JSON.stringify(ln.lines));
  const no = await b.drive('extract', { page: p, kind: 'script' });
  check('there is no reader that runs code', no.ok === false, JSON.stringify(no));

  // hover, drag, resize, console, network
  const rd = await b.drive('read', { page: p });
  const more = rd.items.find((i: any) => i.label === 'More'), vol = rd.items.find((i: any) => /Volume/.test(i.label));
  const hv = await b.drive('hover', { page: p, n: more.n });
  const after = await b.drive('find', { page: p, q: 'Hidden menu item' });
  check('hover opens a hover menu', hv.ok && after.lines.length > 0, JSON.stringify(hv));
  const dg = await b.drive('drag', { page: p, n: vol.n, dx: 120, dy: 0 });
  const rd2 = await b.drive('read', { page: p });
  const v2 = Number(rd2.items.find((i: any) => /Volume/.test(i.label))?.value);
  check('drag moves a slider', dg.ok && v2 > 30, `value ${v2} ${JSON.stringify(dg)}`);
  const rs = await b.drive('resize', { page: p, width: 390, height: 844 });
  await wait(300);
  const w = await b.driver.page(p).wc.executeJavaScript('innerWidth');
  check('resize: a phone-sized page', rs.ok && rs.width === 390 && Math.abs(w - 390) < 20, `innerWidth ${w}`);
  const con = await b.drive('console', { page: p, errors: true });
  check('console: errors only', con.ok && con.lines.length === 1 && /something broke/.test(con.lines[0]), JSON.stringify(con));
  const n1 = await b.drive('network', { page: p });
  await b.driver.page(p).wc.executeJavaScript(`fetch('/api/again').then(() => 1)`); await wait(400);
  const n2 = await b.drive('network', { page: p, pattern: 'api' });
  check('network: records from the first call on', n1.ok && n1.started && n2.ok && n2.lines.some((l: string) => /GET 200 .*\/api\/again/.test(l)), JSON.stringify(n2));

  // a recording
  const r1 = await b.drive('record', { page: p });
  await wait(1500);
  const r2 = await b.drive('record', { page: p, stop: true });
  check('a recording is saved as a video', r1.ok && r2.ok && existsSync(r2.file) && statSync(r2.file).size > 1000 && r2.file.startsWith(VIDEOS), JSON.stringify(r2));

  // his own tabs
  b.open(URL1 + '?mine=1'); await wait(1500);
  const t0 = await b.drive('tabs', { job });
  check('his tabs: he is asked first', t0.ok === false && t0.needs === 'lever', JSON.stringify(t0));
  const t1 = await b.drive('tabs', { job, allowed: true });
  const mine = t1.tabs?.find((t: any) => /mine=1/.test(t.url));
  check('his tabs listed once he says yes', t1.ok && !!mine, JSON.stringify(t1.tabs));
  const lk = await b.drive('look', { job, tab: mine?.tab, allowed: true });
  const lr = await b.drive('read', { page: lk.page });
  check('a borrowed tab reads like any page', lk.ok && lr.ok && /Customer Success Manager/.test(lr.title), JSON.stringify(lk));
  const lx = await b.drive('extract', { page: lk.page, kind: 'details' });
  check('and the readers work on it', lx.ok && lx.lines.some((l: string) => /Acme/.test(l)));
  const apply = lr.items?.find((i: any) => i.label === 'Apply here');
  const cl = await b.drive('click', { page: lk.page, n: apply?.n });
  check('but a read-only tab cannot be clicked', cl.ok === false && /reading only/.test(cl.error), cl.error);
  const nw = await b.drive('network', { page: lk.page });
  check("and his tab's network is never watched", nw.ok === false, nw.error);
  const rz = await b.drive('resize', { page: lk.page, width: 400, height: 400 });
  check('and his window is never resized', rz.ok === false, JSON.stringify(rz));
  b.open('https://www.rbc.com/'); await wait(600);
  const t2 = await b.drive('tabs', { job, allowed: true });
  check('a bank tab is never listed with its address', !t2.tabs.some((t: any) => /rbc/.test(t.url)), JSON.stringify(t2.tabs));

  console.log(bad ? `${bad} FAILED` : 'ALL PASS'); app.exit(bad ? 1 : 0);
});
