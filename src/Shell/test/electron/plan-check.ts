// Sheet 37, the plan card in Samara's band (the Mac's way, and the PC's when no bubble shows it): the plan as he sees
// it, unticking a site, Go, the fence that comes out of it, the same plan going without asking, Change with a note,
// Not now, and an answer from Claude's own form that was never asked for.
//
// Run: npx electron test/electron/plan-check.ts
import { app, BrowserWindow, screen } from 'electron';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { AangBrowser } from '../../src/browser.ts';
import { wireBrowser } from '../../src/browseripc.ts';
import { PlanMemory, cleanPlan, runPlan } from '../../src/claudeplan.ts';

const PORT = 47919;
app.commandLine.appendSwitch('host-resolver-rules', `MAP www.linkedin.com 127.0.0.1:${PORT}, MAP boards.greenhouse.io 127.0.0.1:${PORT}, MAP www.jobbank.gc.ca 127.0.0.1:${PORT}`);
process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* not in a test */ };
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d.slice(0, 240) : ''}`); if (!ok) bad++; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const site = http.createServer((_q, r) => { r.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Jobs</title><p>Jobs</p>'); });
  await new Promise<void>((r) => site.listen(PORT, '127.0.0.1', () => r()));
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const dir = mkdtempSync(path.join(os.tmpdir(), 'plan-'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: dir, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs'), testLocal: true }) as any;
  wireBrowser(() => b);
  b.open('about:blank'); await wait(2000);
  const w = b.win as BrowserWindow;
  const js = (s: string) => w.webContents.executeJavaScript(s);
  const mem = new PlanMemory(dir), pending = new Map<string, number>();
  const plan = cleanPlan({ task: 'Job scan', sites: ['https://www.linkedin.com/jobs', 'boards.greenhouse.io', 'www.jobbank.gc.ca'], steps: ['Search your 13 job types', 'Read the new posts', 'Save the list'], wont: "apply, send anything, or sign in anywhere new" })!;
  check('a plan is cleaned to sites and plain steps', plan.sites.join(',') === 'linkedin.com,boards.greenhouse.io,jobbank.gc.ca' && plan.steps.length === 3, JSON.stringify(plan.sites));

  // shown in the band, a site unticked, Go
  const first = runPlan(b, mem, plan, { elicit: false, pending });
  await wait(700);
  const tray = await js(`({ open: !document.getElementById('plantray').hidden, task: document.getElementById('plantask').textContent, sites: [...document.querySelectorAll('#plansites .prow')].map((r) => r.textContent),
    ticks: document.querySelectorAll('#plansites .tq').length, steps: document.querySelectorAll('#plansteps .prow').length, wont: document.getElementById('planwonttext').textContent, lantern: !!document.querySelector('#plantray .uphd img') })`);
  check('the plan drops from the band: lantern, task, sites with ticks, steps, what it won\'t do', tray.open && tray.task === 'Job scan' && tray.ticks === 3 && tray.steps === 3 && tray.lantern && /^Won't apply/.test(tray.wont), JSON.stringify(tray));
  check('LinkedIn says "with your login" (a job site in a job scan)', /linkedin\.comwith your login/.test(tray.sites[0]), JSON.stringify(tray.sites));
  await js(`document.querySelectorAll('#plansites .tq')[2].click()`);
  await js(`document.getElementById('plango').click()`);
  const r1: any = await first;
  check('Go starts the session with the sites he kept (job sites keep his login in a job scan)', r1.ok === true && r1.sites.join(',') === 'linkedin.com,boards.greenhouse.io' && r1.login.join(',') === 'linkedin.com,boards.greenhouse.io', JSON.stringify(r1));
  const j = b.driver.job(r1.job);
  check('the fence: his login on the kept job sites, the unticked site denied', j.planned && [...j.sites].join(',') === 'linkedin.com,greenhouse.io' && j.denied.has('jobbank.gc.ca'), JSON.stringify({ sites: [...j.sites], denied: [...j.denied] }));
  const den = await b.drive('open', { job: r1.job, url: `http://www.jobbank.gc.ca:${PORT}/` }).catch((e: Error) => ({ ok: false, error: e.message }));
  check('an unticked site is never opened', den.ok === false && /unticked/.test(den.error), JSON.stringify(den));
  const gh = await b.drive('open', { job: r1.job, url: `http://boards.greenhouse.io:${PORT}/acme` });
  check('a kept job board opens signed in, and Greenhouse is not wrongly blocked', gh.ok && !gh.guest, JSON.stringify(gh));
  const ps = await b.drive('planstep', { job: r1.job, at: 1 });
  check('the live checklist moves to step 2', ps.ok && ps.step === 'Read the new posts', JSON.stringify(ps));
  check('the tray is gone after Go', await js(`document.getElementById('plantray').hidden`));

  // the same plan again: no card, it just goes
  const again: any = await runPlan(b, mem, cleanPlan({ task: 'job scan', sites: ['linkedin.com'], steps: ['Search'] })!, { elicit: false, pending });
  check('the same plan (no new sites) goes without asking', again.ok === true && again.same === true && await js(`document.getElementById('plantray').hidden`), JSON.stringify(again));

  // a new plan: Change with a note
  const other = runPlan(b, mem, cleanPlan({ task: 'Research Acme', sites: ['acme.example'], steps: ['Read the about page'] })!, { elicit: false, pending });
  await wait(600);
  await js(`document.getElementById('planchange').click()`);
  const noteShown = await js(`!document.getElementById('plannote').hidden && document.getElementById('plango').textContent`);
  await js(`document.getElementById('plannote').value = 'Only their careers page'; document.getElementById('plango').click()`);
  const r2: any = await other;
  check('Change opens a line to type; Go becomes Send changes', noteShown === 'Send changes', String(noteShown));
  check('his note goes back to Claude, nothing starts', r2.ok === false && r2.change === true && r2.note === 'Only their careers page', JSON.stringify(r2));

  // Not now
  const third = runPlan(b, mem, cleanPlan({ task: 'Research Acme', sites: ['acme.example'], steps: ['Read the careers page'] })!, { elicit: false, pending });
  await wait(600);
  await js(`document.getElementById('planno').click()`);
  const r3: any = await third;
  check('Not now: nothing starts', r3.ok === false && /not now/i.test(r3.error), JSON.stringify(r3));

  // an answer "from Claude's form" for a plan that was never shown there
  const r4: any = await runPlan(b, mem, cleanPlan({ task: 'Sneaky', sites: ['evil.example'], steps: ['x'] })!, { elicit: true, pending, decided: { keep: ['evil.example'], note: '', go: true } });
  check('a form answer nobody was asked for is refused', r4.ok === false && /not for a plan/.test(r4.error), JSON.stringify(r4));

  console.log(bad ? `${bad} FAILED` : 'ALL PASS'); app.exit(bad ? 1 : 0);
});
