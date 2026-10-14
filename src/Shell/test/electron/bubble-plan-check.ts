// Sheet 37 in the real bubble: a Claude session's plan on the Lantern's wood, sites as turquoise ticks, Change opening a
// line to type (Go becomes Send changes), the answer carrying the kept sites and the note, the live checklist moving
// on, and the brief that stepped aside coming back when it is done. Off screen, with the test stand-in for Aang's doors.
//
// Run: npx electron test/electron/bubble-plan-check.ts
import { app, BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d.slice(0, 260) : ''}`); if (!ok) bad++; };

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const w = new BrowserWindow({ width: 700, height: 820, show: false, frame: false, transparent: true, webPreferences: { preload: path.join(HERE, 'bubble-stub.cjs'), contextIsolation: false, sandbox: false, offscreen: true } });
  w.setPosition(-6000, 100);
  w.showInactive();
  await w.loadURL(`${pages.origin}/bubble.html`);
  await wait(800);
  const js = (s: string) => w.webContents.executeJavaScript(s, true);
  const card = { id: 'samara:1', task: 'Job scan', sites: [{ site: 'linkedin.com', login: true, favicon: '' }, { site: 'boards.greenhouse.io', login: true, favicon: '' }, { site: 'jobbank.gc.ca', login: false, favicon: '' }], steps: ['Search your 13 job types', 'Read the new posts', 'Save the list'], wont: 'apply, send anything, or sign in anywhere new' };

  // the brief is showing; then the plan arrives and takes its turn
  await js(`window.__deliver({ t: 'bubble', text: '', brief: { day: 'Wednesday', date: 'October 14', events: [], parts: [], mail: [], jobs: [], waiting: [] } })`);
  await wait(600);
  const briefUp = await js(`!document.querySelector('.briefcard').hidden`);
  await js(`window.__deliver(${JSON.stringify({ t: 'plan', id: card.id, steps: card.steps.map((text) => ({ text })), samara: card })})`);
  await wait(600);
  const shown = await js(`({ box: !document.querySelector('.samaraplan').hidden, lantern: document.getElementById('bubble').classList.contains('lantern'), task: document.querySelector('.samaraplan .pc-top b')?.textContent,
    ticks: document.querySelectorAll('.samaraplan .tq').length, login: [...document.querySelectorAll('.samaraplan .lt-txt span')].map((x) => x.textContent), steps: document.querySelectorAll('.samaraplan .num').length,
    keys: [...document.querySelectorAll('#asks button')].map((b) => b.firstChild.textContent + ':' + b.className), brief: !document.querySelector('.briefcard').hidden,
    tq: getComputedStyle(document.querySelector('.samaraplan .tq')).backgroundColor })`);
  check('the brief was up first', briefUp === true);
  check("the plan takes the bubble on the Lantern's wood: task, three turquoise ticks, steps", shown.box && shown.lantern && shown.task === 'Job scan' && shown.ticks === 3 && shown.steps === 3 && shown.tq === 'rgb(63, 191, 174)', JSON.stringify(shown));
  check('"with your login" only on the job sites', shown.login.join('|') === 'with your login|with your login', JSON.stringify(shown.login));
  check('Go (gold), Change, Not now (burnt orange)', /^Go:.*primary/.test(shown.keys[0]) && /^Change:/.test(shown.keys[1]) && /^Not now:.*burnt/.test(shown.keys[2]), JSON.stringify(shown.keys));
  check('the brief stepped aside (not under it)', shown.brief === false);
  writeFileSync(path.join(os.tmpdir(), 'bubble-plan.png'), (await w.webContents.capturePage()).toPNG());

  // untick a site, Change, type, Send changes
  await js(`document.querySelectorAll('.samaraplan .tq')[2].click()`);
  await js(`[...document.querySelectorAll('#asks button')][1].click()`); await wait(200);
  const noteOpen = await js(`({ note: !document.getElementById('plannote').hidden, go: document.getElementById('plango').firstChild.textContent })`);
  check('Change opens a line to type; Go becomes Send changes', noteOpen.note && noteOpen.go === 'Send changes', JSON.stringify(noteOpen));
  await js(`document.getElementById('plannote').value = 'Only remote jobs this time'`);
  await wait(650);   // the 600 ms guard on new keys
  await js(`document.getElementById('plango').click()`); await wait(300);
  const sent = await js(`window.__sent.filter(([k]) => k === 'answerAsk').map(([, a]) => a[0])`);
  const a = sent.at(-1);
  check('the answer is a change, with his note and the sites he kept', a?.t === 'plan' && a.id === 'samara:1' && a.choice === 'change' && a.note === 'Only remote jobs this time' && a.keep.join(',') === 'linkedin.com,boards.greenhouse.io', JSON.stringify(a));

  // the next plan, Go, then the live checklist and the brief coming back
  await js(`window.__deliver(${JSON.stringify({ t: 'plan', id: 'samara:2', steps: card.steps.map((text) => ({ text })), samara: { ...card, id: 'samara:2' } })})`);
  await wait(800);
  await js(`document.getElementById('plango').click()`); await wait(400);
  const live = await js(`({ who: document.getElementById('who').textContent, steps: [...document.querySelectorAll('.plan .step')].map((s) => s.className), box: document.querySelector('.samaraplan').hidden })`);
  check('after Go: the live checklist, step 1 now', /CLAUDE . JOB SCAN/.test(live.who) && /now/.test(live.steps[0]) && live.box === true, JSON.stringify(live));
  await js(`window.__deliver({ t: 'plan.step', id: 'samara:2', at: 1 })`); await wait(200);
  const step2 = await js(`[...document.querySelectorAll('.plan .step')].map((s) => s.className)`);
  check('Samara moves it on to step 2', /done/.test(step2[0]) && /now/.test(step2[1]), JSON.stringify(step2));
  await js(`window.__deliver({ t: 'plan.step', id: 'samara:2', at: null })`); await wait(400);
  const back = await js(`!document.querySelector('.briefcard').hidden`);
  check('done: the brief that stepped aside comes back', back === true);

  console.log(bad ? `${bad} FAILED` : 'ALL PASS'); app.exit(bad ? 1 : 0);
});
