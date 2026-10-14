// Driver v2 part 3: a form inside a frame from another site (like a Greenhouse or Workday application on a company's
// page), a picture with the numbers drawn on, and notes kept per site between sessions.
//
// Run: npx electron test/electron/driver4-check.ts
import { app, BrowserWindow, screen } from 'electron';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { AangBrowser } from '../../src/browser.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 150_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* not in a test */ };
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d.replace(/\s+/g, ' ').slice(0, 200) : ''}`); if (!ok) bad++; };

const FORM = `<!doctype html><title>Apply</title><body style="margin:0"><h2>Apply to Acme</h2>
<label>First name <input id="fn"></label><button id="next">Next step</button><p id="out"></p>
<script>document.getElementById('next').onclick = () => { document.getElementById('out').textContent = 'Step 2 of 3'; };</script></body>`;

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const formSite = http.createServer((_q, r) => r.writeHead(200, { 'Content-Type': 'text/html' }).end(FORM));
  await new Promise<void>((r) => formSite.listen(0, '127.0.0.1', () => r()));
  const formUrl = `http://localhost:${(formSite.address() as any).port}/embed/job_app`;
  const site = http.createServer((_q, r) => r.writeHead(200, { 'Content-Type': 'text/html' }).end(`<!doctype html><title>Acme careers</title><body style="margin:0"><h1>Senior Product Designer</h1><p>Apply below.</p>
    <div style="height:120px"></div><iframe src="${formUrl}" style="width:600px;height:300px;border:4px solid #000"></iframe></body>`));
  await new Promise<void>((r) => site.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${(site.address() as any).port}`;
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'drv4-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs'), testLocal: true }) as any;
  const job = (await b.drive('start', { kind: 'claude', name: 'test' })).job;
  const o = await b.drive('open', { job, url: base + '/careers' });
  await new Promise((r) => setTimeout(r, 800));
  const r = await b.drive('read', { page: o.page });
  check("the frame's words come back with its own address", /\[A frame from localhost\. To use anything in it, open its own address with browser_open: http:\/\/localhost:\d+\/embed\/job_app\]/.test(r.text) && /Apply to Acme/.test(r.text), (/\[A frame[^\]]*\]/.exec(r.text) ?? [''])[0]);
  check('and no frame control is numbered as if it were on this page', !(r.items ?? []).some((i: any) => i.label === 'Next step'));
  const addr = /open its own address with browser_open: (\S+)\]/.exec(r.text)?.[1] ?? '';
  const f = await b.drive('open', { job, url: addr });
  const fr = await b.drive('read', { page: f.page });
  const fn = fr.items?.find((i: any) => i.kind === 'text');
  const next = fr.items?.find((i: any) => i.label === 'Next step');
  const t = await b.drive('type', { page: f.page, n: fn?.n, text: 'Joshua' });
  check('opened on its own, typing into the form works and is confirmed', t.ok && /now says "Joshua"/.test((t.changed ?? []).join()), JSON.stringify(t));
  const c = await b.drive('click', { page: f.page, n: next?.n });
  check('and clicking says what changed', c.ok && /Step 2 of 3/.test((c.changed ?? []).join()), JSON.stringify(c));

  const plain = await b.drive('picture', { page: f.page, what: 'view' });
  const marked = await b.drive('picture', { page: f.page, what: 'marks' });
  check('a picture with the numbers drawn on comes back', marked.ok && marked.png.length > 1000 && marked.png !== plain.png);
  const again = await b.drive('picture', { page: f.page, what: 'view' });
  check('and the numbers are gone from the page afterwards', again.ok && again.png.length === plain.png.length || Math.abs(again.png.length - plain.png.length) < plain.png.length * 0.02, `${again.png.length} vs ${plain.png.length}`);

  const saved = await b.drive('note', { site: 'www.linkedin.com', text: 'Jobs list scrolls in the left column; Easy Apply asks Joshua.' });
  const got = await b.drive('note', { site: 'https://linkedin.com/jobs' });
  check('a note per site is kept and read back', saved.saved === true && /left column/.test(got.note), JSON.stringify(got));
  const o2 = await b.drive('open', { job, url: base + '/again' });
  check('a site with no note opens without one', o2.ok && !o2.note);

  b.closeAll(); site.close(); formSite.close(); pages.close();
  console.log(bad ? `${bad} failed` : 'all passed');
  setTimeout(() => app.exit(bad ? 1 : 0), 500);
});
