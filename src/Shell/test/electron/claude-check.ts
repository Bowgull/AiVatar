// C4, Claude in the cockpit (2026-10-21): the real bubble page, off screen and never focused on his desktop, fed the brain's
// claude.jobs / claude.wait the way main.ts forwards them. Checks the jobs strip (one tracked bar, the notches, track,
// swap, the next job taking an ended one's place, the % flip, unfolding, Pause, Open in Claude), the pinned card
// (permission keys, two picks, three questions with Back, "No, and..."), the purple key (chip, send now, after this
// task), his words tagged in the conversation, the card with the cockpit closed, and the size cap.
//
// Run: npx electron test/electron/claude-check.ts
// CLAUDE_SHOT=<file.png>: a picture of the open cockpit with a tracked bar and a pinned permission, and next to it
// <file>-sheet45g.png, the sheet's own still (stage.html?show=open+detail) to compare against.
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { writeFileSync } from 'node:fs';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d : ''}`); if (!ok) bad++; };

const S1 = '11111111-aaaa-4bbb-8ccc-000000000001', S2 = '22222222-aaaa-4bbb-8ccc-000000000002', S3 = '33333333-aaaa-4bbb-8ccc-000000000003';
const T0 = Date.now();
const job = (id: string, project: string, startedAt: number, tasks: [string, string][], extra: Record<string, unknown> = {}) => ({
  id, machine: 'pc', cwd: 'C:\\x\\' + project, project, model: 'opus', phase: 'working', startedAt, lastActivity: T0, prompt: 'do it',
  tasks: tasks.map(([text, status]) => ({ text, status })), current: null,
  percent: Math.round(tasks.filter(([, s]) => s === 'completed').length / tasks.length * 100), etaMs: 22 * 60_000,
  usage: { rateLimits: [{ kind: 'five_hour', percentUsed: 40 }, { kind: 'seven_day', percentUsed: 12 }] }, open: `claude://claude.ai/epitaxy/${id}`, held: 0, ...extra,
});
const WM = job(S1, 'Waymark', T0 - 3_600_000, [['Replay harness', 'completed'], ['Athlete model', 'completed'], ['Rules-only brain', 'in_progress'], ['AI joins in', 'pending'], ['Readiness meter', 'pending'], ['Test week', 'pending']]);
const SND = job(S2, 'Aang sounds', T0 - 60_000, [['Make the set', 'completed'], ['Volume slider', 'completed'], ['Swap the files', 'completed'], ['Test them', 'in_progress']]);
const SAM = job(S3, 'Samara', T0 - 1_800_000, [['Read the drawer code', 'completed'], ['Round the plaques', 'in_progress'], ['Hover sounds', 'pending'], ['Test it', 'pending']]);
const PERM = { id: 'toolu_01perm', session: S2, project: 'Aang sounds', kind: 'permission', tool: 'Bash', summary: 'Aang sounds wants to run the sound tests on this PC.', input: '{"command":"npm test -- sounds"}', canAlways: true, at: T0 };
const MULTI = { id: 'toolu_02multi', session: S1, project: 'Waymark', kind: 'question', tool: 'AskUserQuestion', summary: '', input: '', canAlways: false, at: T0,
  questions: [{ question: 'Which things should the readiness meter look at?', multiSelect: true, options: [{ label: 'Sleep (Recommended)', description: 'From your watch, last 3 nights.' }, { label: 'Resting heart rate', description: 'Higher than usual means take it easy.' }, { label: 'Soreness', description: 'A quick 1 to 5 in the morning.' }] }] };
const THREE = { id: 'toolu_03three', session: S1, project: 'Waymark', kind: 'question', tool: 'AskUserQuestion', summary: '', input: '', canAlways: false, at: T0,
  questions: [
    { question: 'How should rest days work?', options: [{ label: 'Sundays only (Recommended)', description: 'Every Sunday is a rest day.' }, { label: 'You pick each week' }] },
    { question: 'What should happen on a day you miss a run?', options: [{ label: 'Move it to tomorrow' }, { label: 'Skip it' }] },
    { question: 'Units for distance?', options: [{ label: 'Kilometres' }, { label: 'Miles' }] },
  ] };

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const w = new BrowserWindow({ width: 700, height: 1000, show: false, frame: false, webPreferences: { preload: path.join(HERE, 'cockpit-stub.cjs'), contextIsolation: false, sandbox: false, offscreen: true } });
  w.setPosition(-6000, 100);
  w.showInactive();
  const errors: string[] = [];
  w.webContents.on('console-message', (e) => { const m = (e as unknown as { message?: string; level?: string }); if (m.level === 'error') errors.push(String(m.message)); });
  await w.loadURL(`${pages.origin}/bubble.html`);
  await wait(800);
  const js = (s: string) => w.webContents.executeJavaScript(s, true);
  const deliver = (m: unknown) => js(`window.__deliver(${JSON.stringify(m)})`);
  const sent = (k: string) => js(`window.__sent.filter(s => s[0] === '${k}').map(s => s[1][0])`) as Promise<any[]>;
  const lastClaude = async () => (await sent('claude')).at(-1);
  const bars = () => js(`[...document.querySelectorAll('#ckjobs .job')].map(j => j.querySelector('.hd b').textContent)`) as Promise<string[]>;
  const typeIn = (text: string, opts = '') => js(`(() => { const b = document.getElementById('ckBox'); b.value = ${JSON.stringify(text)}; b.dispatchEvent(new Event('input')); b.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true${opts} })); })()`);
  const click = (sel: string) => js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`) as Promise<boolean>;
  const clickText = (sel: string, text: string) => js(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find(x => x.textContent.trim().startsWith(${JSON.stringify(text)})); if (!e) return false; e.click(); return true; })()`) as Promise<boolean>;
  const pinText = () => js(`document.querySelector('#ckpins .pin')?.textContent ?? ''`) as Promise<string>;

  // Closed, nothing waiting: the jobs list alone puts nothing on screen
  await deliver({ t: 'claude.jobs', jobs: [WM, SND, SAM] });
  await wait(200);
  check('closed: jobs alone show nothing', (await js(`document.getElementById('bubble').hidden && document.getElementById('ckjobs').hidden`)) === true);

  await js(`window.__fire('onCockpit', { open: true, state: { maxH: 640 } }); window.__fire('onInputState', { opened: true, mode: 'auto', week: 0.3 })`);
  await wait(900);
  await deliver({ t: 'history.reply', items: [{ id: 2, ts: '2026-10-21 12:59:00', who: 'you', text: 'how are the jobs going' }, { id: 3, ts: '2026-10-21 13:00:00', who: 'Aang', text: 'Three are running.' }] });
  await wait(400);

  // ---- the strip
  check('strip: shows in the open cockpit with a job', (await js(`!document.getElementById('ckjobs').hidden`)) === true);
  check('strip: ONE tracked bar, the job started last', JSON.stringify(await bars()) === '["Aang sounds"]', JSON.stringify(await bars()));
  check('strip: "2 OTHER JOBS RUNNING"', ((await js(`document.querySelector('#ckjobs .oline')?.textContent`)) as string)?.includes('2 OTHER JOBS RUNNING'));
  check('bar: percent, task, time left, PC chip', (await js(`(() => { const j = document.querySelector('#ckjobs .job'); return j.querySelector('.ff').textContent === '75%' && j.querySelector('.t').textContent.includes('task 4 of 4') && j.querySelector('.lt').textContent === 'about 22 min left' && j.querySelector('.mc').textContent === 'PC'; })()`)) === true);
  const notch = await js(`(() => { const c = document.querySelector('#ckjobs .job canvas.jpill'); const g = c.getContext('2d'); const px = (x) => [...g.getImageData(x, 4, 1, 1).data].join(','); const n = [1, 2, 3].map(k => 1 + Math.round(82 * k / 4)); return { w: c.width, h: c.height, cssW: c.style.width, notches: n.map(x => px(x) !== px(x - 2) && px(x) !== px(x + 2)) }; })()`) as { w: number; h: number; cssW: string; notches: boolean[] };
  check('bar: the 45g pill, 84x9 art pixels at 2x, a notch per task', notch.w === 84 && notch.h === 9 && notch.cssW === '168px' && notch.notches.every(Boolean), JSON.stringify(notch));

  // ---- track, swap
  await click('#ckjobs .oline');
  await clickText('#ckjobs .orow [data-track]', 'Track this');      // the first other: Waymark (newest after sounds is Samara... order by start)
  await wait(100);
  const two = await bars();
  check('track: a second bar is tracked', two.length === 2 && two[0] === 'Aang sounds', JSON.stringify(two));
  await click('#ckjobs .oline');
  await click('#ckjobs .orow [data-track]');
  await wait(100);
  const swapped = await bars();
  check('track a third: the older one is swapped out', swapped.length === 2 && !swapped.includes('Aang sounds'), JSON.stringify(swapped));

  // ---- % flip
  await click('#ckjobs .job .flip');
  await wait(500);
  check('% flip: turns over to "N% WEEK" in lavender', (await js(`(() => { const f = document.querySelector('#ckjobs .job .flip'); return f.classList.contains('back') && f.querySelector('.fb').textContent === '12% WEEK' && getComputedStyle(f.querySelector('.fb')).color === 'rgb(91, 47, 143)'; })()`)) === true);
  await click('#ckjobs .job .flip');

  // ---- unfold, pause, open in Claude
  await click('#ckjobs .job[data-id="' + S1 + '"] .row2');
  await wait(400);
  check('unfold: the tasks show ticked / current / pending', (await js(`(() => { const j = document.querySelector('#ckjobs .job[data-id="${S1}"]'); return j.classList.contains('open') && j.querySelectorAll('.ob').length === 6 && j.querySelectorAll('.ob.done').length === 2 && j.querySelectorAll('.ob.now').length === 1 && j.querySelector('.det').getBoundingClientRect().height > 60; })()`)) === true);
  await clickText(`#ckjobs .job[data-id="${S1}"] .key`, 'Pause');
  check('Pause sends claude.pause for that session', JSON.stringify(await lastClaude()) === JSON.stringify({ t: 'claude.pause', session: S1 }), JSON.stringify(await lastClaude()));
  await clickText(`#ckjobs .job[data-id="${S1}"] .key`, 'Open in Claude');
  check('Open in Claude passes the session link', (await sent('openClaude')).at(-1) === `claude://claude.ai/epitaxy/${S1}`);
  await deliver({ t: 'claude.jobs', jobs: [{ ...WM, phase: 'paused' }, SND, SAM] });
  await wait(100);
  check('paused: the bar turns slate and offers Play', (await js(`(() => { const j = document.querySelector('#ckjobs .job[data-id="${S1}"]'); return j.classList.contains('paused') && j.querySelector('.lt').textContent === 'Paused' && [...j.querySelectorAll('.key')].some(k => k.textContent === 'Play'); })()`)) === true);
  await click(`#ckjobs .job[data-id="${S1}"] .row2`);

  // ---- a tracked job ends: the next running one takes its place
  const before = await bars();
  await deliver({ t: 'claude.jobs', jobs: [WM, SND, { ...SAM, phase: 'ended' }] });
  await wait(100);
  const after = await bars();
  check('a tracked job ends: the next running one takes its place', before.includes('Samara') && !after.includes('Samara') && after.length === 2 && after.includes('Aang sounds'), `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);

  // ---- queued count
  await deliver({ t: 'claude.jobs', jobs: [{ ...WM, held: 2 }, SND] });
  await wait(100);
  check('queued messages show on the bar in lavender', ((await js(`document.querySelector('#ckjobs .job[data-id="${S1}"] .queued')?.textContent`)) as string)?.includes('2 messages'));

  // ---- pinned: a permission on top, 2 MORE
  await deliver({ t: 'claude.wait', items: [PERM, MULTI, THREE] });
  await wait(300);
  check('pinned: the permission, its plain line and "2 MORE"', (await pinText()).includes('run the sound tests') && (await pinText()).includes('2 MORE'));
  check('pinned: Allow / Always / No / No, and...', JSON.stringify(await js(`[...document.querySelectorAll('#ckpins .pin .ckeys .key')].map(k => k.textContent)`)) === '["Allow","Always","No","No, and..."]');
  check('pinned: under the conversation, above the strip and the typing area', (await js(`(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); return r('#lblist').bottom <= r('#ckpins').top + 2 && r('#ckpins').bottom <= r('#ckjobs').top + 2 && r('#ckjobs').bottom <= r('#ck').top + 2; })()`)) === true);
  await click('#ckpins .cw');
  check("Claude's exact words one click away", ((await js(`document.querySelector('#ckpins .cwbox:not([hidden])')?.textContent`)) as string)?.includes('npm test -- sounds'));
  if (process.env.CLAUDE_SHOT) {
    await click('#ckpins .cw');
    await js(`document.body.style.background = '#2a2238'; document.getElementById('lblist').scrollTop = 1e6`);
    await wait(700);
    writeFileSync(process.env.CLAUDE_SHOT, (await w.webContents.capturePage()).toPNG());
    console.log('picture: ' + process.env.CLAUDE_SHOT);
  }
  await clickText('#ckpins .pin .ckeys .key', 'Always');
  check('Always sends claude.answer always', JSON.stringify(await lastClaude()) === JSON.stringify({ t: 'claude.answer', id: PERM.id, decision: 'always' }), JSON.stringify(await lastClaude()));
  await wait(200);

  // ---- several picks
  check('next: the multi-select question, with boxes and BEST', (await js(`document.querySelectorAll('#ckpins .opt .mk').length === 3 && Boolean(document.querySelector('#ckpins .rec'))`)) === true);
  await wait(650);                                                        // the 600 ms guard
  await js(`[...document.querySelectorAll('#ckpins .opt:not(.other)')].slice(0, 2).forEach(o => o.click())`);
  const shot = async (tag: string) => { if (!process.env.CLAUDE_SHOT) return; await wait(400); const f = process.env.CLAUDE_SHOT.replace(/\.png$/i, '') + '-' + tag + '.png'; writeFileSync(f, (await w.webContents.capturePage()).toPNG()); console.log('picture: ' + f); };
  await shot('picks');
  check('two picks: the key counts them', (await js(`document.querySelector('#ckpins .sendrow .key').textContent`)) === 'Send 2 picks');
  await click('#ckpins .sendrow .key');
  check('Send 2 picks sends both exact labels, joined', JSON.stringify(await lastClaude()) === JSON.stringify({ t: 'claude.answer', id: MULTI.id, answers: { [MULTI.questions[0].question]: 'Sleep (Recommended), Resting heart rate' } }), JSON.stringify(await lastClaude()));
  await wait(200);

  // ---- three questions with Back
  await wait(650);
  check('three questions: QUESTION 1 OF 3', (await pinText()).includes('QUESTION 1 OF 3'));
  await js(`document.querySelectorAll('#ckpins .opt')[0].click()`);
  check('a pick moves to QUESTION 2 OF 3', (await pinText()).includes('QUESTION 2 OF 3'));
  await click('#ckpins .sback');
  check('Back goes to QUESTION 1 OF 3', (await pinText()).includes('QUESTION 1 OF 3'));
  await wait(650);
  await js(`document.querySelectorAll('#ckpins .opt')[1].click()`);
  await wait(650);
  await js(`document.querySelectorAll('#ckpins .opt')[0].click()`);
  await wait(650);
  const nBefore = (await sent('claude')).length;
  await js(`document.querySelectorAll('#ckpins .opt')[1].click()`);
  const three = await lastClaude();
  check('the three answers go together at the end', (await sent('claude')).length === nBefore + 1 && JSON.stringify(three) === JSON.stringify({ t: 'claude.answer', id: THREE.id, answers: { 'How should rest days work?': 'You pick each week', 'What should happen on a day you miss a run?': 'Move it to tomorrow', 'Units for distance?': 'Miles' } }), JSON.stringify(three));
  await wait(200);
  check('all answered: the pinned zone empties', (await js(`document.getElementById('ckpins').hidden`)) === true);

  // ---- the purple key
  await click(`#ckjobs .job[data-id="${S1}"] .msg`);
  await wait(200);
  check('purple key: the TO CLAUDE chip names the session', (await js(`(() => { const t = document.getElementById('ckTo'); return !t.hidden && t.textContent.includes('TO CLAUDE') && t.textContent.includes('Waymark') && t.textContent.includes('SEND NOW') && t.textContent.includes('AFTER THIS TASK'); })()`)) === true);
  check('purple key: the bar is marked and the caret is in the field', (await js(`document.querySelector('#ckjobs .job[data-id="${S1}"]').classList.contains('sel') && document.activeElement?.id === 'ckBox'`)) === true);
  const subs = (await sent('submit')).length;
  await typeIn('add rest days on sundays');
  check('Enter = Send now, to that session (not to Aang)', JSON.stringify(await lastClaude()) === JSON.stringify({ t: 'claude.send', session: S1, text: 'add rest days on sundays', when: 'now' }) && (await sent('submit')).length === subs, JSON.stringify(await lastClaude()));
  check('after sending, the area is Aang\'s again', (await js(`document.getElementById('ckTo').hidden`)) === true);
  await wait(200);
  check('his words in the conversation, tagged with Claude and the project', (await js(`[...document.querySelectorAll('#lblist .lb-mine.toclaude')].some(m => m.textContent.includes('TO WAYMARK') && m.textContent.includes('add rest days') && m.querySelector('.to img'))`)) === true);
  await click(`#ckjobs .job[data-id="${S1}"] .msg`);
  await typeIn('then do the readiness meter', ', ctrlKey: true');
  check('Ctrl+Enter = After this task', (await lastClaude())?.when === 'after' && (await lastClaude())?.text === 'then do the readiness meter');
  await click(`#ckjobs .job[data-id="${S2}"] .msg`);
  await clickText('#ckTo .when button', 'AFTER THIS TASK');
  await typeIn('use the quieter chime');
  check('the AFTER THIS TASK key, then Enter = after', JSON.stringify(await lastClaude()) === JSON.stringify({ t: 'claude.send', session: S2, text: 'use the quieter chime', when: 'after' }));
  await click(`#ckjobs .job[data-id="${S2}"] .msg`);
  await click('#ckTo s');
  check('the × goes back to Aang', (await js(`document.getElementById('ckTo').hidden && !document.querySelector('#ckjobs .job.sel')`)) === true);

  // ---- No, and...
  const PERM2 = { ...PERM, id: 'toolu_04perm', canAlways: false, plain: 'Aang sounds wants to delete the old sound files.' };
  await deliver({ t: 'claude.wait', items: [PERM2] });
  await wait(200);
  check('plain words win over the summary; no Always when not offered', (await pinText()).includes('delete the old sound files') && !(await js(`[...document.querySelectorAll('#ckpins .ckeys .key')].some(k => k.textContent === 'Always')`)));
  await clickText('#ckpins .ckeys .key', 'No, and...');
  await wait(100);
  check('No, and... points the typing area at the session', (await js(`!document.getElementById('ckTo').hidden && document.getElementById('ckTo').textContent.includes('Aang sounds') && !document.querySelector('#ckTo .when')`)) === true);
  await typeIn('keep them in a backup folder');
  check('his reason goes back as deny-message', JSON.stringify(await lastClaude()) === JSON.stringify({ t: 'claude.answer', id: PERM2.id, decision: 'deny-message', message: 'keep them in a backup folder' }), JSON.stringify(await lastClaude()));

  // ---- a refusal says why
  await deliver({ t: 'claude.said', of: 'claude.answer', ok: false, why: 'That is no longer waiting.' });
  await wait(100);
  check('a refused answer says why', ((await js(`document.querySelector('#ckpins .ctoast')?.textContent`)) as string)?.includes('no longer waiting'));

  // ---- size cap: lots of history, both bars unfolded, the list open, a tall card: never past the room
  const many = Array.from({ length: 30 }, (_, i) => ({ id: 100 + i, ts: '2026-10-20 10:00:00', who: i % 2 ? 'you' : 'Aang', text: 'Message number ' + i + ' in a long day of talking about the cockpit and its many parts.' }));
  await deliver({ t: 'history.reply', items: many });
  await deliver({ t: 'claude.jobs', jobs: [WM, SND, SAM, job('44444444-aaaa-4bbb-8ccc-000000000004', 'Waystone', T0 - 7_200_000, [['One', 'pending']])] });
  await deliver({ t: 'claude.wait', items: [THREE, { ...MULTI, id: 'toolu_05' }] });
  await wait(300);
  await js(`document.querySelectorAll('#ckjobs .job .row2').forEach(r => r.click()); document.querySelector('#ckjobs .oline')?.click()`);
  await wait(1500);
  const sz = (await sent('bubbleSize')).at(-1);
  check('size: the cockpit never grows past its room', Boolean(sz && sz.height <= 640 + 18 + 56 + 6 + 2), JSON.stringify(sz));
  check('size: the strip, the card and the typing area all keep their room', (await js(`(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); const b = r('#bubble'); return r('#ck').bottom <= b.bottom + 1 && r('#ckpins').height > 60 && r('#ckjobs').height > 60 && r('#lblist').height >= 139; })()`)) === true,
    JSON.stringify(await js(`(() => { const r = (s) => { const x = document.querySelector(s).getBoundingClientRect(); return [Math.round(x.top), Math.round(x.height)]; }; return { bubble: r('#bubble'), list: r('#lblist'), pins: r('#ckpins'), jobs: r('#ckjobs'), ck: r('#ck') }; })()`)));

  // ---- the cockpit closed with something waiting: the bubble speaks the card
  await js(`window.__fire('onCockpit', { open: false })`);
  await wait(900);
  await shot('closed');
  check('closed: the bubble shows the waiting card, the strip goes', (await js(`!document.getElementById('bubble').hidden && !document.getElementById('ckpins').hidden && document.getElementById('ckjobs').hidden && !document.getElementById('bubble').classList.contains('cockpit')`)) === true);
  await wait(650);
  await js(`document.querySelectorAll('#ckpins .opt')[0].click()`);
  check('closed: answerable right there', (await pinText()).includes('QUESTION 2 OF 3'));
  await deliver({ t: 'claude.wait', items: [] });
  await wait(1200);
  check('closed: nothing waiting, the card goes and so does the bubble', (await js(`document.getElementById('bubble').hidden`)) === true);

  check('no errors in the page', errors.length === 0, errors.join(' | '));

  // The sheet's own still, for looking at side by side (not a check).
  if (process.env.CLAUDE_SHOT) {
    const root = await servePages(path.join(HERE, '..', '..', '..', '..'));
    const s = new BrowserWindow({ width: 1180, height: 700, show: false, frame: false, webPreferences: { offscreen: true } });
    s.setPosition(-6000, 100);
    for (const [q, tag] of [['open+detail', '45g'], ['open+mc2', '45g-mc2']]) {
      await s.loadURL(`${root.origin}/docs/cockpit/sheet-45g/stage.html?show=${q}`);
      await wait(1500);
      const f = process.env.CLAUDE_SHOT.replace(/\.png$/i, '') + `-sheet${tag}.png`;
      writeFileSync(f, (await s.webContents.capturePage()).toPNG());
      console.log('sheet picture: ' + f);
    }
    root.close();
  }
  pages.close();
  console.log(bad ? `${bad} failed` : 'all passed');
  setTimeout(() => app.exit(bad ? 1 : 0), 300);
});
