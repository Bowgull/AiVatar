// Job-hunt parity (2026-10-14): LinkedIn's new layout read from its words, a board sweep, a check of every field, a résumé
// upload behind his yes, and a CAPTCHA box on a form that leaves the session running. Real sites are never touched:
// www.linkedin.com and www.google.com are pointed at a local test server.
//
// Run: npx electron test/electron/driver5-check.ts
import { app, BrowserWindow, screen } from 'electron';
import http from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { AangBrowser } from '../../src/browser.ts';

const PORT = 47914;
app.commandLine.appendSwitch('host-resolver-rules', `MAP www.linkedin.com 127.0.0.1:${PORT}, MAP www.google.com 127.0.0.1:${PORT}`);
process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 180_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* not in a test */ };
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d.replace(/\s+/g, ' ').slice(0, 220) : ''}`); if (!ok) bad++; };

const li = (t: string, c: string, ea: boolean) => `<div>${t}</div><div>${t}</div><div>${c}</div><div>Toronto, ON (Hybrid)</div><div>CA$80K/yr - CA$95K/yr</div><div>2 days ago</div>${ea ? '<div>·</div><div>Easy Apply</div>' : ''}`;
const LINKEDIN = `<!doctype html><title>Jobs | LinkedIn</title><body><main><h1>Jobs</h1>${li('Customer Success Manager', 'Acme', true)}${li('Onboarding Specialist', 'Northwind', false)}${li('Implementation Specialist', 'Lumen', true)}</main></body>`;
const board = (q: string) => `<!doctype html><title>Board</title><body>${[1, 2].map((i) => `<div class="card"><a href="/job/${encodeURIComponent(q)}-${i}">${q} role ${i}</a><span>Toronto</span><span>3 hours ago</span></div>`).join('')}</body>`;
const FORM = `<!doctype html><title>Apply to Acme</title><body><form>
<label for="em">Email</label><input id="em" type="email" required>
<label for="nm">First name</label><input id="nm" value="Josh">
<label for="cv">Resume</label><input id="cv" type="file" style="display:none"><button type="button" onclick="document.getElementById('cv').click()">Attach resume</button>
<iframe src="http://www.google.com:${PORT}/recaptcha/api2/anchor?k=x" width="300" height="80"></iframe>
<button type="submit">Submit application</button></form></body>`;

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const site = http.createServer((q, r) => {
    const host = String(q.headers.host ?? ''), url = String(q.url ?? '');
    let body = FORM;
    if (host.startsWith('www.linkedin.com')) body = LINKEDIN;
    else if (host.startsWith('www.google.com')) body = `<!doctype html><body><div>I'm not a robot</div></body>`;
    else if (url.startsWith('/search')) body = board(new URL(url, 'http://x').searchParams.get('q') ?? '');
    r.writeHead(200, { 'Content-Type': 'text/html' }).end(body);
  });
  await new Promise<void>((r) => site.listen(PORT, '127.0.0.1', () => r()));
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'drv5-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') }) as any;
  const job = (await b.drive('start', { kind: 'claude', name: 'test' })).job;

  // LinkedIn's new layout: no job links, cards read from the words
  const lp = await b.drive('open', { job, url: `http://www.linkedin.com:${PORT}/jobs/search-results/?keywords=x` });
  const lj = await b.drive('jobs', { page: lp.page });
  check("LinkedIn's new layout: cards read from its words", lj.ok && lj.jobs.length === 3 && lj.jobs[0].title === 'Customer Success Manager' && lj.jobs[0].company === 'Acme' && lj.jobs[0].easyApply === 'yes' && lj.jobs[1].easyApply === '', JSON.stringify(lj.jobs?.[0]));
  const nope = await b.drive('sweep', { page: lp.page, keywords: ['x'] });
  check('LinkedIn is never swept in bulk', nope.ok === false && /never swept/.test(nope.error), nope.error);

  // A board sweep on a site of its own (path and card given), at the 2.5 s floor
  const bp = await b.drive('open', { job, url: `http://127.0.0.1:${PORT}/` });
  const sw = await b.drive('sweep', { page: bp.page, keywords: ['customer success', 'onboarding', 'customer success'], path: '/search?q={q}', card: '.card' });
  check('a sweep starts, at no less than 2.5 s between searches', sw.ok && sw.spacing >= 2.5, JSON.stringify(sw));
  let st: any;
  for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 500)); st = await b.drive('sweep_status', { id: sw.id }); if (st.done) break; }
  check('it searches each keyword once and reports coverage', st.done && st.total === 2 && st.coverage['customer success'] === 2 && st.coverage['onboarding'] === 2, JSON.stringify(st.coverage));
  check('and returns every posting, with its link and keyword', st.cards?.length === 4 && /\/job\/onboarding-1$/.test(st.cards.find((c: any) => c.keyword === 'onboarding')?.url ?? ''), JSON.stringify(st.cards?.[2]));
  const bad1 = await b.drive('sweep', { page: bp.page, keywords: ['x'], path: 'https://evil.example/{q}', card: '.card' });
  check('a sweep may only search the same site', bad1.ok === false, bad1.error);

  // A form: every field read back; a hidden résumé field; a CAPTCHA box that does not stop the session
  const fp = await b.drive('open', { job, url: `http://127.0.0.1:${PORT}/apply` });
  await new Promise((r) => setTimeout(r, 800));
  const rd = await b.drive('read', { page: fp.page });
  check('a CAPTCHA box on a form is noted for Joshua, and the session keeps going', rd.ok && /CAPTCHA box/.test(rd.text), (/\[This page has a CAPTCHA[^\]]*\]/.exec(rd.text) ?? [''])[0]);
  const cv = rd.items?.find((i: any) => i.kind === 'file');
  check('the hidden resume field is found, and it asks first', !!cv && cv.weight === 'lever' && /Resume/.test(cv.label), JSON.stringify(cv));
  const fm = await b.drive('form', { page: fp.page });
  const email = fm.fields?.find((f: any) => f.label === 'Email');
  check('the form check reads every field back, and flags the empty required one', fm.ok && email?.required && email?.value === '' && fm.fields.some((f: any) => f.label === 'First name' && f.value === 'Josh'), JSON.stringify(fm.fields));
  const pdf = path.join(mkdtempSync(path.join(os.homedir(), 'AppData', 'Local', 'Temp', 'cv-')), 'Josh Bocas Resume.pdf');
  writeFileSync(pdf, '%PDF-1.4\n% test resume\n' + 'x'.repeat(200));
  const ask = await b.drive('upload', { page: fp.page, n: cv?.n, file: pdf });
  check('uploading asks him first', ask.ok === false && ask.needs === 'lever' && /Josh Bocas Resume\.pdf/.test(ask.what), JSON.stringify(ask));
  const up = await b.drive('upload', { page: fp.page, n: cv?.n, file: pdf, allowed: true });
  check('with his yes, the resume goes in and the field says so', up.ok && /Josh Bocas Resume\.pdf/.test((up.changed ?? []).join()), JSON.stringify(up));
  const notMine = await b.drive('upload', { page: fp.page, n: cv?.n, file: 'C:\\Windows\\win.ini', allowed: true });
  check('a file from outside his folders is refused', notMine.ok === false && /home folder|PDF/.test(notMine.error), notMine.error);

  b.closeAll(); site.close(); pages.close();
  console.log(bad ? `${bad} failed` : 'all passed');
  setTimeout(() => app.exit(bad ? 1 : 0), 500);
});
