// Driver v2 part 2: job cards as clean data, and a whole virtualized list collected. www.linkedin.com and www.indeed.com
// are pointed at a local test server (the real sites are never touched), so the site-specific readers run.
//
// Run: npx electron test/electron/driver3-check.ts
import { app, BrowserWindow, screen } from 'electron';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { AangBrowser } from '../../src/browser.ts';

const SITE_PORT = 47913;
app.commandLine.appendSwitch('host-resolver-rules', `MAP www.linkedin.com 127.0.0.1:${SITE_PORT}, MAP www.indeed.com 127.0.0.1:${SITE_PORT}`);
process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 180_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* not in a test */ };
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d.replace(/\s+/g, ' ').slice(0, 200) : ''}`); if (!ok) bad++; };

const card = (i: number) => `<li data-occludable-job-id="900${i}"><div class="job-card-container"><a class="job-card-container__link" href="/jobs/view/product-designer-900${i}/?trk=x"><strong>Product Designer ${i}</strong></a>
<div class="artdeco-entity-lockup__subtitle">Lumen ${i}</div><ul><li class="job-card-container__metadata-item">Toronto, ON (Hybrid)</li></ul><time>${i} days ago</time><span>CA$90K/yr - CA$110K/yr</span></div></li>`;
const LINKEDIN = `<!doctype html><title>Jobs | LinkedIn</title><body><h1>Product Designer jobs</h1>
<div id="list" style="height:400px;overflow-y:auto"><ul id="ul">${Array.from({ length: 10 }, (_, i) => card(i + 1)).join('')}</ul></div>
<script>
// Like LinkedIn: only some cards exist at a time; more are drawn as the list scrolls, and early ones are dropped.
let shown = 10; const list = document.getElementById('list'), ul = document.getElementById('ul');
const make = (i) => { const t = document.createElement('template'); t.innerHTML = ${JSON.stringify(card(0))}.replace(/9000/g, '900' + i).replace(/Designer 0/, 'Designer ' + i).replace(/Lumen 0/, 'Lumen ' + i).replace(/0 days/, i + ' days'); return t.content.firstChild; };
list.addEventListener('scroll', () => { if (list.scrollTop + list.clientHeight > list.scrollHeight - 50 && shown < 30) { for (let k = 0; k < 5; k++) { shown++; ul.append(make(shown)); } while (ul.children.length > 15) ul.firstElementChild.remove(); } });
</script></body>`;
const INDEED = `<!doctype html><title>Designer Jobs - Indeed</title><body><div class="jobsearch-ResultsList">
${Array.from({ length: 4 }, (_, i) => `<div class="job_seen_beacon" data-jk="abc${i}"><h2 class="jobTitle"><span title="UX Designer ${i}">UX Designer ${i}</span></h2><span data-testid="company-name">Northwind ${i}</span><div data-testid="text-location">Toronto, ON</div><div data-testid="attribute_snippet_testid">$40 an hour</div></div>`).join('')}
</div></body>`;
const CAREERS = `<!doctype html><title>Careers</title><body><h1>Open roles</h1><ul>
<li><a href="https://boards.greenhouse.io/acme/jobs/111">Senior Product Designer</a><div>Acme</div><div>Remote, Canada</div><div>Posted 3 days ago</div></li>
<li><a href="https://jobs.lever.co/acme/222">UX Researcher</a><div>Acme</div><div>Toronto, ON</div></li>
<li><a href="/about">About us</a></li><li><a href="/jobs">See all jobs</a></li></ul></body>`;

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const site = http.createServer((q, r) => {
    const host = String(q.headers.host ?? '');
    const body = host.startsWith('www.linkedin.com') ? LINKEDIN : host.startsWith('www.indeed.com') ? INDEED : CAREERS;
    r.writeHead(200, { 'Content-Type': 'text/html' }).end(body);
  });
  await new Promise<void>((r) => site.listen(SITE_PORT, '127.0.0.1', () => r()));
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'drv3-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs'), testLocal: true }) as any;
  const job = (await b.drive('start', { kind: 'claude', name: 'test' })).job;

  const li = await b.drive('open', { job, url: `http://www.linkedin.com:${SITE_PORT}/jobs/search/?keywords=designer` });
  check('the LinkedIn page opens', li.ok === true, JSON.stringify(li));
  const one = await b.drive('jobs', { page: li.page });
  const j0 = one.jobs?.[0] ?? {};
  check('LinkedIn cards come out clean', one.ok && one.jobs.length === 10 && j0.title === 'Product Designer 1' && j0.company === 'Lumen 1' && /Toronto/.test(j0.location) && /1 days ago/.test(j0.posted), JSON.stringify(j0));
  check('the pay is read off the card', /CA\$90K\/yr - CA\$110K\/yr/.test(j0.salary), j0.salary);
  check('each link is the clean job address', j0.url === 'https://www.linkedin.com/jobs/view/9001/', j0.url);
  const all = await b.drive('collect', { page: li.page, max: 60 });
  const ids = new Set((all.jobs ?? []).map((j: any) => j.url));
  check('scrolling collects the whole list, even the cards that were dropped', all.ok && ids.size === 30 && all.end === true, `${ids.size} postings, ${all.scrolls} scrolls, end ${all.end}`);

  const ind = await b.drive('open', { job, url: `http://www.indeed.com:${SITE_PORT}/jobs?q=designer` });
  const ij = await b.drive('jobs', { page: ind.page });
  check('Indeed cards come out clean', ij.ok && ij.jobs.length === 4 && ij.jobs[0].title === 'UX Designer 0' && ij.jobs[0].company === 'Northwind 0' && /viewjob\?jk=abc0$/.test(ij.jobs[0].url), JSON.stringify(ij.jobs?.[0]));

  const car = await b.drive('open', { job, url: `http://127.0.0.1:${SITE_PORT}/careers` });
  const cj = await b.drive('jobs', { page: car.page });
  check('any careers page: links that are postings, not "about" or "see all"', cj.ok && cj.jobs.length === 2 && cj.jobs[0].title === 'Senior Product Designer' && /Remote/.test(cj.jobs[0].location), JSON.stringify(cj.jobs));

  b.closeAll(); site.close(); pages.close();
  console.log(bad ? `${bad} failed` : 'all passed');
  setTimeout(() => app.exit(bad ? 1 : 0), 500);
});
