// Sheet 37 in the real bubble: a Claude session's plan (2026-10-22: on the speech bubble's own parchment, Samara's icon, the
// kicker CLAUDE · <SESSION>, ticks drawn dead centre, no SITES for pages on this computer), sites as turquoise ticks, Change opening a
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
  const card = { id: 'samara:1', task: 'Job scan', from: 'Waymark', sites: [{ site: 'linkedin.com', login: true, favicon: '' }, { site: 'boards.greenhouse.io', login: true, favicon: '' }, { site: 'jobbank.gc.ca', login: false, favicon: '' }], steps: ['Search your 13 job types', 'Read the new posts', 'Save the list'], wont: 'apply, send anything, or sign in anywhere new' };

  // the brief is showing; then the plan arrives and takes its turn
  await js(`window.__deliver({ t: 'bubble', text: '', brief: { day: 'Wednesday', date: 'October 14', events: [], parts: [], mail: [], jobs: [], waiting: [] } })`);
  await wait(600);
  const briefUp = await js(`!document.querySelector('.briefcard').hidden`);
  await js(`window.__deliver(${JSON.stringify({ t: 'plan', id: card.id, steps: card.steps.map((text) => ({ text })), samara: card })})`);
  await wait(600);
  const shown = await js(`({ box: !document.querySelector('.samaraplan').hidden, lantern: document.getElementById('bubble').classList.contains('lantern'), task: document.querySelector('.samaraplan .pc-task')?.textContent,
    kick: document.querySelector('.samaraplan .pc-kick')?.textContent, icon: document.querySelector('.samaraplan .pc-top img')?.getAttribute('src'), taskFont: getComputedStyle(document.querySelector('.samaraplan .pc-task')).fontFamily + ' ' + getComputedStyle(document.querySelector('.samaraplan .pc-task')).fontWeight + ' ' + getComputedStyle(document.querySelector('.samaraplan .pc-task')).fontSize,
    heads: [...document.querySelectorAll('.samaraplan h3')].map((x) => x.textContent),
    ticks: document.querySelectorAll('.samaraplan .tq').length, login: [...document.querySelectorAll('.samaraplan .lt-txt span')].map((x) => x.textContent), steps: document.querySelectorAll('.samaraplan .num').length,
    keys: [...document.querySelectorAll('#asks button')].map((b) => b.firstChild.textContent + ':' + b.className), brief: !document.querySelector('.briefcard').hidden,
    tq: getComputedStyle(document.querySelector('.samaraplan .tq'), '::before').backgroundColor })`);
  check('the brief was up first', briefUp === true);
  check('the plan takes the bubble on its own parchment (not the Lantern): task, three turquoise ticks, steps', shown.box && !shown.lantern && shown.task === 'Job scan' && shown.ticks === 3 && shown.steps === 3 && shown.tq === 'rgb(63, 191, 174)', JSON.stringify(shown));
  check("Samara's own icon, the kicker CLAUDE · WAYMARK, the task in the bold Figtree question style", shown.icon === 'art/samara/samara-32.png' && shown.kick === 'CLAUDE · WAYMARK' && /Figtree/.test(shown.taskFont) && / 800 17px$/.test(shown.taskFont), JSON.stringify([shown.icon, shown.kick, shown.taskFont]));
  // The tick, measured: its white pixels' middle against its box's middle, in a picture of the box itself.
  // As painted: the box's dark edge and the white tick are found in a picture of the button, and their middles compared.
  const tqr = await js(`(() => { const r = document.querySelector('.samaraplan .tq').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  const tqImg = await w.webContents.capturePage({ x: Math.floor(tqr.x), y: Math.floor(tqr.y), width: Math.ceil(tqr.w) + 1, height: Math.ceil(tqr.h) + 1 });
  const tb = tqImg.toBitmap(), ts = tqImg.getSize();
  const bbox = (hit: (r: number, g: number, b: number) => boolean) => { let x0 = 99, x1 = -1, y0 = 99, y1 = -1; for (let y = 0; y < ts.height; y++) for (let x = 0; x < ts.width; x++) { const i = (y * ts.width + x) * 4; if (hit(tb[i + 2]!, tb[i + 1]!, tb[i]!)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } } return { x0, x1, y0, y1, cx: (x0 + x1 + 1) / 2, cy: (y0 + y1 + 1) / 2 }; };
  const edge = bbox((r, g, b) => r < 45 && g < 35 && b < 30), tick = bbox((r, g, b) => r > 235 && g > 235 && b > 235);
  const dx = tick.cx - edge.cx, dy = tick.cy - edge.cy;
  check('the tick sits dead centre in its 18 px box (as painted, within half a pixel)', tick.x1 > tick.x0 && edge.x1 - edge.x0 + 1 === 18 && edge.y1 - edge.y0 + 1 === 18 && Math.abs(dx) <= 0.5 && Math.abs(dy) <= 0.5 && tqr.w === 24, JSON.stringify({ btn: tqr, edge, tick, dx, dy }));
  if (process.env.AANG_SHOTS) writeFileSync(path.join(process.env.AANG_SHOTS, 'tick-8x.png'), tqImg.resize({ width: ts.width * 8, quality: 'good' }).toPNG());
  check('SITES shows for real websites', shown.heads.join() === 'SITES,STEPS', JSON.stringify(shown.heads));
  check('"with your login" only on the job sites', shown.login.join('|') === 'with your login|with your login', JSON.stringify(shown.login));
  check('Go (gold), Change, Not now (burnt orange)', /^Go:.*primary/.test(shown.keys[0]) && /^Change:/.test(shown.keys[1]) && /^Not now:.*burnt/.test(shown.keys[2]), JSON.stringify(shown.keys));
  check('the brief stepped aside (not under it)', shown.brief === false);
  if (process.env.AANG_SHOTS) { // (The keys show while the mouse is over the bubble, .over; the picture shows them so.)
    await js(`(() => { const r = document.getElementById('bubble').getBoundingClientRect(); window.dispatchEvent(new MouseEvent('mousemove', { clientX: r.left + 40, clientY: r.top + 40 })); return true; })()`); await wait(900); writeFileSync(path.join(process.env.AANG_SHOTS, 'plan-card.png'), (await w.webContents.capturePage()).toPNG()); await js(`window.dispatchEvent(new MouseEvent('mousemove', { clientX: 1, clientY: 1 })); true`); await wait(300); }

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

  // 2026-10-22: a plan whose only site is this computer lists no SITES at all (it would not be asked at all from the door;
  // a mixed plan still marks its local sites, and those are left out the same way).
  const local = { ...card, id: 'samara:L', task: 'Look at it', sites: [{ site: '127.0.0.1', login: false, favicon: '', local: true }, { site: 'example.com', login: false, favicon: '' }] };
  await js(`window.__deliver(${JSON.stringify({ t: 'plan', id: local.id, steps: local.steps.map((text) => ({ text })), samara: local })})`);
  await wait(700);
  const loc = await js(`({ heads: [...document.querySelectorAll('.samaraplan h3')].map((x) => x.textContent), sites: [...document.querySelectorAll('.samaraplan .lt-txt b')].map((x) => x.textContent) })`);
  check('a page on this computer is never listed under SITES', loc.heads.join() === 'SITES,STEPS' && !loc.sites.includes('127.0.0.1') && loc.sites.includes('example.com'), JSON.stringify(loc));
  const onlyLocal = { ...local, id: 'samara:L2', sites: [local.sites[0]] };
  await js(`[...document.querySelectorAll('#asks button')][2].click()`); await wait(300);
  await js(`window.__deliver(${JSON.stringify({ t: 'plan', id: onlyLocal.id, steps: onlyLocal.steps.map((text) => ({ text })), samara: onlyLocal })})`);
  await wait(700);
  const loc2 = await js(`({ heads: [...document.querySelectorAll('.samaraplan h3')].map((x) => x.textContent), ticks: document.querySelectorAll('.samaraplan .tq').length })`);
  check('with nothing but this computer, the SITES section goes', loc2.heads.join() === 'STEPS' && loc2.ticks === 0, JSON.stringify(loc2));
  await wait(650);
  await js(`[...document.querySelectorAll('#asks button')][2].click()`); await wait(300);

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
