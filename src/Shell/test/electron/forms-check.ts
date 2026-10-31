// An Ashby-style job form (his report, 2026-10-31): hidden radios and tick boxes drawn over their labels, a long page,
// an essay that mentions payment, and Space and Enter judged by what they would do. Nothing is ever sent: the test
// form posts to this harness, which counts every send. Made-up company and questions.
//
// Run: npx electron test/electron/forms-check.ts
import { app, BrowserWindow, screen } from 'electron';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { AangBrowser } from '../../src/browser.ts';

const PORT = 47931;
process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* not in a test */ };
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d.replace(/\s+/g, ' ').slice(0, 300) : ''}`); if (!ok) bad++; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Ashby's way: the real input is squeezed to nothing and see-through; the label is what shows.
const HID = 'position:absolute;opacity:0;width:0;height:0;margin:0';
const radio = (name: string, v: string) => `<label class="opt"><input type="radio" name="${name}" value="${v}" style="${HID}"><span>${v}</span></label>`;
const tick = (name: string, v: string) => `<label class="opt"><input type="checkbox" name="${name}" value="${v}" style="${HID}"><span>${v}</span></label>`;
const FILLER = Array.from({ length: 60 }, (_, i) => `<p>About Northwind, part ${i + 1}: we help small lenders run their back office with care and good tools.</p>`).join('');
const FORM = `<!doctype html><title>Account Manager - Northwind</title>
<style>.opt{display:inline-block;padding:6px 10px;border:1px solid #888;margin:4px;cursor:pointer}.q{font-weight:bold;margin-top:14px}</style>
<body><h1>Account Manager</h1>${FILLER}
<form id="f" method="post" action="/submitted">
  <div class="field"><label class="q" for="nm">Full name</label><input id="nm" name="name"></div>
  <div class="field"><div class="q">Country</div><div>${radio('country', 'Canada')}${radio('country', 'United States')}</div></div>
  <div class="field"><div class="q">How many accounts have you managed at once?</div><div>${radio('accts', '1-25')}${radio('accts', '26-50')}${radio('accts', '51+')}</div></div>
  <div class="field"><div class="q">Which CRMs have you used?</div><div>${tick('crm', 'Salesforce')}${tick('crm', 'HubSpot')}</div></div>
  <fieldset><legend>Client size</legend>${radio('size', 'Small')}${radio('size', 'Enterprise')}</fieldset>
  <div class="field"><label class="opt"><input type="checkbox" name="ok" required style="${HID}"><span>I understand this role is in office</span></label></div>
  <div class="field"><label class="q" for="es">Tell us about a project you are proud of</label><textarea id="es" name="essay"></textarea></div>
  <div class="field"><label class="q" for="sel">Start date</label><select id="sel" name="start"><option>Now</option><option>In a month</option></select></div>
  <div class="field"><button type="button" role="combobox" aria-expanded="false" id="cb">Pick a team</button></div>
  <div class="field"><a href="#top" id="lk">Back to top</a></div>
  <div class="field"><label class="q" for="last">Have you worked with lenders?</label><input id="last" name="last" required></div>
  <button type="submit" id="go">Submit Application</button>
</form></body>`;

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  let sends = 0;
  const site = http.createServer((q, r) => { if (q.method === 'POST') sends++; r.writeHead(200, { 'Content-Type': 'text/html' }).end(q.method === 'POST' ? '<title>Sent</title>Thanks' : FORM); });
  await new Promise<void>((r) => site.listen(PORT, '127.0.0.1', () => r()));
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'forms-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs'), testLocal: true }) as any;
  const job = (await b.drive('start', { kind: 'claude', name: 'forms' })).job;
  const p = (await b.drive('open', { job, url: `http://127.0.0.1:${PORT}/apply` })).page;
  await wait(800);
  const wc = b.driver.page(p).wc;
  const js = (s: string) => wc.executeJavaScript(s);

  // 1. Every choice has a number, its own words and its question.
  const rd = await b.drive('read', { page: p });
  const it = (w: string) => rd.items.find((i: any) => i.label === w);
  const can = it('Canada'), mid = it('26-50'), sf = it('Salesforce'), ent = it('Enterprise'), und = it('I understand this role is in office');
  check('hidden radios have numbers and their words', Boolean(can && mid && it('United States') && it('51+')), JSON.stringify(rd.items.map((i: any) => i.label)));
  check('hidden tick boxes too', Boolean(sf && it('HubSpot') && und));
  check('each choice says its question', can?.q === 'Country' && mid?.q === 'How many accounts have you managed at once?' && sf?.q === 'Which CRMs have you used?' && ent?.q === 'Client size', JSON.stringify([can?.q, mid?.q, sf?.q, ent?.q]));
  check('a choice says checked or unchecked', /unchecked/.test(can?.state ?? ''), can?.state);
  const es = rd.items.find((i: any) => /proud/.test(i.label));
  check('a field is named by its label', Boolean(es), JSON.stringify(rd.items.filter((i: any) => i.kind === 'text').map((i: any) => i.label)));

  // 2. find and check_form see them; check_form has the whole form below the long page.
  const fd = await b.drive('find', { page: p, q: 'Country' });
  check('find lists the Country choices', fd.items.some((i: any) => i.label === 'Canada'), JSON.stringify(fd.items));
  const fm = await b.drive('form', { page: p });
  const f = (w: string) => fm.fields.find((x: any) => x.label === w || new RegExp(w).test(x.label));
  check('check_form lists every radio and tick box with its question', Boolean(f('Canada')?.q === 'Country' && f('Enterprise') && f('HubSpot') && f('I understand')), JSON.stringify(fm.fields.map((x: any) => [x.label, x.q])));
  check('check_form has the required questions at the end of a long page', Boolean(f('Have you worked with lenders')?.required && f('I understand')?.required), JSON.stringify(fm.fields.slice(-4)));
  const full = await b.drive('read', { page: p, full: true });
  check('a full read reaches the end of this page', /Have you worked with lenders/.test(full.text), String(full.text.length));

  // 3. Picking: by words, and by clicking the number.
  const sl = await b.drive('select', { page: p, n: it('United States').n, option: 'Canada' });
  check('select picks a radio by its words', sl.ok && await js(`document.querySelector('input[value=Canada]').checked`), JSON.stringify(sl));
  const ck = await b.drive('click', { page: p, n: mid.n });
  check('clicking a hidden radio picks it, no question asked', ck.ok && !ck.needs && await js(`document.querySelector('input[value="26-50"]').checked`), JSON.stringify(ck));
  const ck2 = await b.drive('click', { page: p, n: und.n });
  check('clicking a hidden tick box ticks it', ck2.ok && await js(`document.querySelector('input[name=ok]').checked`), JSON.stringify(ck2));
  const sl2 = await b.drive('select', { page: p, n: sf.n, option: 'hubspot' });
  check('select ticks a box by its words', sl2.ok && await js(`document.querySelector('input[value=HubSpot]').checked`), JSON.stringify(sl2));

  // 4. The essay that says "payment" is not buying.
  const ty = await b.drive('type', { page: p, n: es.n, text: 'I moved 400 students onto PayMyTuition and cut payment errors in half.' });
  check('typing an essay that mentions payment works', ty.ok && !ty.error, JSON.stringify(ty));
  const ty2 = await b.drive('click', { page: p, n: es.n });
  check('clicking that essay box again is not "buying"', ty2.ok && !ty2.error, JSON.stringify(ty2));

  // 5. Space and Enter: moving and picking never ask; sending always does.
  const focus = (sel: string) => js(`document.querySelector(${JSON.stringify(sel)}).focus(); true`);
  const key = (k: string) => b.drive('key', { page: p, key: k });
  await focus('input[value=Enterprise]');
  let k = await key('space');
  check('Space on a radio: no question, picks it', k.ok && await js(`document.querySelector('input[value=Enterprise]').checked`), JSON.stringify(k));
  await focus('input[value=Small]');
  k = await key('enter');
  check('Enter on a radio in a form: no question, picks it, nothing sent', k.ok && !k.needs && sends === 0 && await js(`document.querySelector('input[value=Small]').checked`), JSON.stringify(k));
  await focus('input[value=Salesforce]');
  k = await key('space');
  check('Space on a tick box: no question', k.ok && await js(`document.querySelector('input[value=Salesforce]').checked`), JSON.stringify(k));
  await focus('#sel'); k = await key('enter');
  check('Enter on a dropdown: no question', k.ok && !k.needs, JSON.stringify(k));
  await focus('#cb'); k = await key('enter');
  check('Enter on a custom dropdown: no question', k.ok && !k.needs, JSON.stringify(k));
  await focus('#lk'); k = await key('enter');
  check('Enter on a plain link: no question', k.ok && !k.needs, JSON.stringify(k));
  await focus('#nm'); k = await key('space');
  check('Space in a text field: no question', k.ok && !k.needs, JSON.stringify(k));
  await js('document.activeElement.blur(); true'); k = await key('space');
  check('Space with nothing focused (scroll): no question', k.ok && !k.needs, JSON.stringify(k));
  k = await key('tab');
  check('Tab: no question', k.ok && !k.needs, JSON.stringify(k));
  await focus('#last'); k = await key('enter');
  check('Enter in the last text field asks Joshua', k.ok === false && k.needs === 'lever', JSON.stringify(k));
  await focus('#es'); k = await key('enter');
  check('Enter in the essay box asks Joshua (some boxes send on Enter)', k.ok === false && k.needs === 'lever', JSON.stringify(k));
  await focus('#go'); k = await key('space');
  check('Space on Submit Application asks Joshua', k.ok === false && k.needs === 'lever', JSON.stringify(k));
  k = await key('enter');
  check('Enter on Submit Application asks Joshua', k.ok === false && k.needs === 'lever', JSON.stringify(k));
  await wait(400);
  check('nothing was ever sent', sends === 0, `${sends} sends`);

  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  site.close(); pages.close?.();
  app.exit(bad ? 1 : 0);
});
