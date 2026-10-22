// Sheet 52, the Claude job pop-out (2026-10-21): a JobPops with fake jobs, off screen, never focused, no real mouse,
// keys or clipboard (every click and drag is an event made inside the page; "the mouse" is a stubbed point).
// Checks: it arrives folded (Claude icon, project, %, time left, the live pill, the pin as the only chrome); the % creeps
// by itself; a click unfolds it (live line, helper agents, the to-do list, Pause, Open in Claude, the purple key) and folds
// it, and the window grows and shrinks with it; on hover the slider appears and sets the fade (never under 30%) while the
// card keeps its fade (E); the pin toggles always-on-top and looks different; needs you is a blue chip that asks Aang;
// Pause / Open / message go out as checked messages only; complete is teal with Nice, which closes it; dragged onto a fake
// Aang it goes back (onNear, onPutBack) and pulled out again it remembers where it was and its fade.
// Pictures (folded, unfolded, pinned with the slider, complete, needs you) plus the same scenes cut from sheet 52.
//
// Run: npx electron test/electron/jobpop-check.ts [folder for the pictures]
import { app, BrowserWindow, screen } from 'electron';
import { mkdtempSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { JobPops, type JobPopAction } from '../../src/jobpop.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | ')); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.on('window-all-closed', () => {});
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'jobpop-check-')));
const HERE = path.dirname(fileURLToPath(import.meta.url));
// Off his screen, never in front of his game.
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
BrowserWindow.prototype.moveTop = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d: unknown = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d !== '' ? '  -- ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 260) : ''}`); if (!ok) bad++; };
const until = async (fn: () => boolean | Promise<boolean>, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(80); } return fn(); };
const OUT = (() => { const a = process.argv.at(-1); try { return a && statSync(a).isDirectory() ? a : os.tmpdir(); } catch { return os.tmpdir(); } })();

const S1 = '0b6c2a8e-1111-4c3d-9e2f-aaaaaaaaaaaa', S2 = '7f3e9d21-2222-4b8a-8c1d-bbbbbbbbbbbb';
const W1 = ['Replay harness', 'Athlete model', 'Rules-only brain', 'AI joins in', 'Readiness meter', 'Test week'];
const W2 = ['Read the drawer code', 'Round the plaques', 'Hover sounds', 'Test it'];
const tasks = (done: number, names: string[]) => names.map((text, i) => ({ text, status: i < done ? 'completed' : i === done ? 'in_progress' : 'pending', ...(i === done ? { active: text } : {}) }));
const job = (id: string, title: string, phase: string, names: string[], done: number, extra: Record<string, unknown> = {}) => ({
  id, machine: 'pc', cwd: 'C:\\x', project: title.toLowerCase(), title, model: 'opus', phase, startedAt: Date.now() - 98 * 60_000, lastActivity: 1, prompt: 'go',
  tasks: tasks(done, names), current: '', percent: null, etaMs: null, usage: null, open: `claude://claude.ai/epitaxy/local_${id}`, held: 0,
  // A short pace so the bar visibly creeps inside the test.
  progress: { done, total: names.length, cur: done < names.length ? done : -1, elapsedMs: 0, at: Date.now(), paceMs: 6000, rev: 1, rewroteAt: null },
  activity: { now: 'Running the tests · npm test', since: Date.now() - 12_000, agents: [{ kind: 'Explore', what: 'Mapping the code', since: Date.now() - 5000 }] },
  ...extra });

app.whenReady().then(async () => {
  let pointer = { x: -20000, y: 500 };
  (screen as any).getCursorScreenPoint = () => pointer;
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const aang = { x: -3000, y: 400, width: 224, height: 224 };
  const acts: JobPopAction[] = [], backs: string[] = [], nices: string[] = [], nears: [string, boolean][] = [];
  const jp = new JobPops({
    origin: pages.origin, preloadPath: path.join(HERE, '..', '..', 'src', 'jobpoppreload.cjs'),
    iconPath: path.join(HERE, '..', '..', 'assets', 'aang.ico'),
    aangRects: () => [null, aang], clampToScreen: false,
    onAction: (a) => acts.push(a), onPutBack: (id) => backs.push(id), onNice: (id) => nices.push(id), onNear: (id, on) => nears.push([id, on]),
  });
  const pic = async (w: BrowserWindow, name: string) => {
    // A desktop-grey backdrop for the picture only (the real window is see-through).
    await w.webContents.executeJavaScript(`(() => { const d = document.createElement('div'); d.id = 'shotbg'; d.style.cssText = 'position:fixed;inset:0;z-index:-5;background:radial-gradient(80% 90% at 30% 10%,#2e333c 0%,#22262d 55%,#1a1c21 100%)'; document.body.prepend(d); return 1; })()`, true);
    await wait(150);
    const img = await w.webContents.capturePage();
    await w.webContents.executeJavaScript(`document.getElementById('shotbg')?.remove(); 1`, true);
    const f = path.join(OUT, name); writeFileSync(f, img.toPNG()); console.log('PICTURE ' + f + ' ' + JSON.stringify(img.getSize()));
  };

  check('a made-up id is refused', jp.open('..\\evil path') === null);
  jp.update([job(S1, 'Waymark', 'working', W1, 3), job(S2, 'Samara', 'working', W2, 1)], []);
  const w = jp.open(S1, { x: -6000, y: 300 })!;
  check('a window for the job', !!w && jp.has(S1));
  const ignored: boolean[] = [];
  const realIgnore = w.setIgnoreMouseEvents.bind(w);
  w.setIgnoreMouseEvents = ((on: boolean, o?: Electron.IgnoreMouseEventsOptions) => { ignored.push(on); realIgnore(on, o); }) as typeof w.setIgnoreMouseEvents;
  const js = (s: string) => w.webContents.executeJavaScript(s, true);
  check('page loads with the card', await until(async () => (await js(`!!document.querySelector('.pj .pr') && document.readyState === 'complete'`)) === true, 10000));
  await js('document.fonts.ready.then(() => 1)');
  await wait(400);

  // Safe like the others: frameless, see-through, never takes the keyboard, not on top until pinned.
  const prefs = (w.webContents as any).getLastWebPreferences?.() ?? {};
  check('safe settings (sandbox, isolation, no node)', prefs.sandbox === true && prefs.contextIsolation === true && prefs.nodeIntegration === false, prefs);
  check('never focusable, not on top until pinned', !w.isFocusable() && !w.isAlwaysOnTop());
  check('the page cannot reach the machine', await js(`typeof require === 'undefined' && typeof process === 'undefined' && typeof window.jobpop === 'object' && typeof window.aang === 'undefined'`) === true);

  // 1. Folded: Claude icon, project, %, time left, the live pill, and the pin is the only button.
  const folded = await js(`(() => { const pj = document.querySelector('.pj');
    return { open: pj.classList.contains('open'), det: pj.querySelector('.det').getBoundingClientRect().height, icon: !!pj.querySelector('.top img.ci'),
      pr: pj.querySelector('.pr').textContent, pct: pj.querySelector('.pct').textContent, lt: pj.querySelector('.lt')?.textContent,
      pill: !!pj.querySelector('.pbw canvas.jpill'), buttons: [...pj.querySelectorAll('.top button')].map((b) => b.className), h: pj.getBoundingClientRect().height,
      ag: (() => { const r = pj.querySelector('.agc .agr'); return r && r.getBoundingClientRect().height > 20 ? [r.dataset.type, r.querySelector('b').textContent, r.querySelector('.wh').textContent, !!r.querySelector('canvas.agi'), !!r.querySelector('canvas.agb'), r.querySelector('.tm').textContent].join('/') : null; })(),
      under: pj.querySelector('.agc')?.previousElementSibling?.classList.contains('top') }; })()`);
  check('arrives folded', folded.open === false && folded.det === 0, folded);
  check('icon, project, %, time left, pill', folded.icon && folded.pr === 'Waymark' && /^\d+%$/.test(folded.pct) && !!folded.lt && folded.pill, folded);
  // Sheet 58 C (his pick, 2026-10-21): its helper agent is a small row right under the folded bar, always in view.
  check('folded: the helper row under the bar (icon, Explore, what, its bar, time)', folded.under === true && /^explore\/Explore\/Mapping the code\/true\/true\/\d+ s$/.test(folded.ag ?? ''), folded);
  check('one pin is the only chrome', folded.buttons.length === 1 && folded.buttons[0] === 'pin', folded.buttons);
  check('no border: the window has no frame and a see-through page', await js(`getComputedStyle(document.body).backgroundColor === 'rgba(0, 0, 0, 0)'`) === true);
  const hFold = w.getSize()[1]!;
  await pic(w, 'jobpop-folded.png');

  // 2. The % creeps by itself (the shared progress engine).
  const p0 = parseInt(await js(`document.querySelector('.pct').textContent`));
  await wait(2600);
  const p1 = parseInt(await js(`document.querySelector('.pct').textContent`));
  check('the % creeps while it works', p1 > p0 && p0 >= 50, { p0, p1 });

  // 3. A click unfolds it: the live line, its helpers, the to-do list, Pause, Open in Claude, the purple key.
  const press = (sel: string, dx = 0, dy = 0) => js(`(() => { const t = document.querySelector(${JSON.stringify(sel)}); const o = { bubbles: true, button: 0, pointerId: 7, screenX: 100, screenY: 100 };
    t.dispatchEvent(new PointerEvent('pointerdown', o));
    ${dx || dy ? `t.dispatchEvent(new PointerEvent('pointermove', { ...o, screenX: 100 + ${dx}, screenY: 100 + ${dy} }));` : ''}
    t.dispatchEvent(new PointerEvent('pointerup', o)); return 1; })()`);
  await press('.pj .pr');
  await wait(650);
  const opened = await js(`(() => { const pj = document.querySelector('.pj');
    return { open: pj.classList.contains('open'), det: pj.querySelector('.det').getBoundingClientRect().height, line: pj.querySelector('.nowl').textContent,
      ag: !!pj.querySelector('.det .agr'), rows: pj.querySelectorAll('.list .ob').length, done: pj.querySelectorAll('.list .ob.done').length, now: pj.querySelector('.ob.now .tx')?.textContent,
      keys: [...pj.querySelectorAll('.ckeys button')].map((b) => b.textContent || b.className) }; })()`);
  check('unfolds on a click', opened.open && opened.det > 120, opened);
  check('live line with the computer; the helper is not repeated in the drop-down', /PC/.test(opened.line) && /Running the tests/.test(opened.line) && /\(\d+ s\)/.test(opened.line) && opened.ag === false, opened);
  check('the to-do list', opened.rows === 6 && opened.done === 3 && opened.now === 'AI joins in', opened);
  check('the task in hand shows how far into it the bar is, live', /^\d{1,2}%$/.test(await js(`document.querySelector('.ob.now .r').textContent`)), await js(`document.querySelector('.ob.now .r').textContent`));
  check('Pause, Open in Claude, the purple key', JSON.stringify(opened.keys) === JSON.stringify(['Pause', 'Open in Claude', 'msg']), opened.keys);
  check('the window grew to take it', w.getSize()[1]! > hFold + 120, w.getSize());
  await pic(w, 'jobpop-unfolded.png');

  // The keys: only checked messages, built from this window's own job.
  await js(`document.querySelector('.ckeys .pp').click(); document.querySelector('.ckeys .oc').click(); document.querySelector('.ckeys .msg').click(); 1`);
  await wait(200);
  check('Pause goes out as claude.pause for this job', JSON.stringify(acts[0]) === JSON.stringify({ t: 'claude.pause', session: S1 }), acts);
  check('Open in Claude hands on only the brain\'s checked link', JSON.stringify(acts[1]) === JSON.stringify({ t: 'jobpop.open', url: `claude://claude.ai/epitaxy/local_${S1}` }), acts[1]);
  check('the purple key asks for the typing box on this session', JSON.stringify(acts[2]) === JSON.stringify({ t: 'jobpop.message', session: S1, project: 'Waymark' }), acts[2]);
  check('the keys did not fold it', await js(`document.querySelector('.pj').classList.contains('open')`) === true);
  await js(`window.jobpop.act('ask'); window.jobpop.act('rm -rf'); 1`);
  await wait(150);
  check('no question waiting: ask does nothing; an unknown act does nothing', acts.length === 3, acts);

  // Fold again: ~340 ms, the window goes back down.
  await press('.pj .pr');
  await wait(500);
  check('folds on a second click', await js(`(() => { const pj = document.querySelector('.pj'); return !pj.classList.contains('open') && pj.querySelector('.det').getBoundingClientRect().height === 0; })()`) === true);
  check('the window shrank back', await until(() => w.getSize()[1] === hFold, 1500), w.getSize());

  // Sheet 58 C: five helpers: three rows (Research / Build with its own list's % / Check), "+2 more", the window grows to
  // fit, and back to the one helper after. Pictured beside sheet 58's pop-C.png.
  {
    const n0 = Date.now();
    const five = [
      { id: 'a1', kind: 'general-purpose', what: 'Map tiles docs research', since: n0 - 4 * 60_000, calls: 9, est: { mu: Math.log(6 * 60_000), sigma: 0.5 }, n: 5, fg: false },
      { id: 'a2', kind: 'general-purpose', what: 'Route list', since: n0 - 3 * 60_000, calls: 14, done: 5, total: 8, fg: false },
      { id: 'a3', kind: 'general-purpose', what: 'Running the tests', since: n0 - 60_000, calls: 2, fg: false },
      { id: 'a4', kind: 'Explore', what: 'Mapping the code', since: n0 - 30_000, fg: false },
      { id: 'a5', kind: 'Plan', what: 'Plan the sync', since: n0 - 20_000, fg: false },
    ];
    jp.update([job(S1, 'Waymark', 'working', W1, 3, { activity: { now: 'Wiring the route list', since: n0 - 40_000, agents: five } }), job(S2, 'Samara', 'working', W2, 1)], []);
    await until(async () => (await js(`document.querySelectorAll('.pj .agc .agr').length`)) === 3, 3000);
    const A = await js(`(() => { const pj = document.querySelector('.pj'); return { rows: [...pj.querySelectorAll('.agc .agr')].map(r => r.dataset.type + '/' + r.querySelector('.tm').textContent), more: pj.querySelector('.agmore')?.textContent }; })()`);
    check('pop-out: 3 helper rows, its own list as a %, "+2 more"', /^research\/4 min,build\/63%,check\/1 min$/.test(A.rows.join()) && A.more === '+2 more', A);
    check('pop-out: the window grew to fit the helpers', await until(() => w.getSize()[1]! > hFold + 50, 1500), w.getSize());
    await wait(250);
    await pic(w, 'jobpop-agents.png');
    jp.update([job(S1, 'Waymark', 'working', W1, 3), job(S2, 'Samara', 'working', W2, 1)], []);
    check('pop-out: back to one helper, and the window with it', await until(async () => (await js(`document.querySelectorAll('.pj .agc .agr').length`)) === 1 && w.getSize()[1] === hFold, 2000), w.getSize());
  }

  // 4. Hover: the slider appears (B), the window takes the mouse, and the fade stays (E).
  const card = await js(`(() => { const r = document.querySelector('.pj .pbw').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  check('no slider before hover', await js(`!document.querySelector('.vs').classList.contains('on')`) === true);
  ignored.length = 0;
  await js(`document.dispatchEvent(new MouseEvent('mousemove', { clientX: ${card.x}, clientY: ${card.y}, bubbles: true })); 1`);
  await wait(250);
  check('hover: the slider appears next to the pin', await js(`document.querySelector('.vs').classList.contains('on')`) === true);
  check('hover: the window takes the mouse', ignored.at(-1) === false, ignored);
  const vsBox = await js(`(() => { const r = document.querySelector('.vs').getBoundingClientRect(), p = document.querySelector('.pin').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, pinRight: p.right, pinTop: p.top }; })()`);
  check('the slider sits right beside the pin', vsBox.x > vsBox.pinRight && vsBox.x - vsBox.pinRight < 30 && Math.abs(vsBox.y - vsBox.pinTop) < 16, vsBox);
  const slide = (y: number) => js(`(() => { const v = document.querySelector('.vs'), r = v.getBoundingClientRect(); const o = { bubbles: true, button: 0, pointerId: 9, clientX: r.x + 13, clientY: r.y + ${y} };
    v.dispatchEvent(new PointerEvent('pointerdown', o)); v.dispatchEvent(new PointerEvent('pointerup', o));
    return { op: document.querySelector('.pj').style.getPropertyValue('--op'), ro: document.querySelector('.ro').textContent, roOn: document.querySelector('.ro').classList.contains('on') }; })()`);
  const low = await slide(400);
  check('the slider never goes under 30%', low.op === '0.3' && low.ro === '30%' && low.roOn, low);
  const mid = await slide(58);
  check('the slider sets the fade (about 55%)', Math.abs(Number(mid.op) - 0.55) < 0.05, mid);
  const top = await slide(0);
  check('to the top: solid', top.op === '1', top);
  await slide(58);
  await wait(150);
  check('E: with the mouse on it the card keeps its fade', await js(`(() => { document.dispatchEvent(new MouseEvent('mousemove', { clientX: ${card.x}, clientY: ${card.y}, bubbles: true })); return getComputedStyle(document.querySelector('.pj .pr')).opacity; })()`).then((o: string) => Math.abs(Number(o) - 0.55) < 0.05));
  check('the slider and readout do not fade with the card', await js(`getComputedStyle(document.querySelector('.vs')).opacity === '1'`) === true);
  check('the pin never fades, so he can always find it', await js(`(() => { let e = document.querySelector('.pin'), o = 1; while (e) { o *= Number(getComputedStyle(e).opacity); e = e.parentElement; } return o; })()`) === 1);

  // 5. The pin: on top, and it looks clearly different (pressed in and lit).
  const pinLook = () => js(`(() => { const b = document.querySelector('.pin'), c = b.querySelector('canvas'); return { on: b.classList.contains('on'), pressed: b.getAttribute('aria-pressed'), shadow: getComputedStyle(b).boxShadow, bg: getComputedStyle(b).backgroundImage, px: c.toDataURL().length + ':' + c.toDataURL().slice(-40) }; })()`);
  const before = await pinLook();
  await js(`document.querySelector('.pin').click(); 1`);
  check('pinned: always on top', await until(() => w.isAlwaysOnTop(), 2000));
  await until(async () => (await pinLook()).on, 2000);
  const after = await pinLook();
  check('pinned: the pin looks pressed in and lit', after.on && after.pressed === 'true' && after.shadow !== before.shadow && after.shadow.includes('inset') && after.bg !== before.bg && after.px !== before.px, { before: before.shadow, after: after.shadow });
  check('pinning did not fold it or redraw the fade', await js(`document.querySelector('.pj').style.getPropertyValue('--op')`) === '0.55');
  await js(`document.dispatchEvent(new MouseEvent('mousemove', { clientX: ${card.x}, clientY: ${card.y}, bubbles: true })); document.querySelector('.ro').classList.add('on'); 1`);
  await wait(200);
  await pic(w, 'jobpop-pinned-slider.png');
  await js(`document.querySelector('.pin').click(); 1`);
  check('unpinned: not on top, the pin flat again', await until(async () => !w.isAlwaysOnTop() && !(await pinLook()).on, 2000));
  await js(`document.dispatchEvent(new MouseEvent('mouseleave')); 1`);
  await wait(700);
  check('mouse gone: the slider goes, the mouse passes through', await js(`!document.querySelector('.vs').classList.contains('on')`) === true && ignored.at(-1) === true, ignored.slice(-3));

  // 6. Needs you: a small blue chip; a click asks Aang's bubble to show the question.
  const wait1 = { id: 'toolu_01ABC', session: S1, project: 'Waymark', kind: 'question', questions: [{ question: 'Which layout should the map use?', options: [{ label: 'Grid' }, { label: 'List' }] }] };
  jp.update([job(S1, 'Waymark', 'working', W1, 3), job(S2, 'Samara', 'working', W2, 1)], [wait1, { ...wait1, id: 'toolu_other', session: S2 }]);
  check('needs you: a blue chip on the bar', await until(async () => (await js(`(() => { const c = document.querySelector('.pj .chip.needs'); return !!c && c.textContent === 'NEEDS YOU' && !document.querySelector('.pj .lt') && getComputedStyle(c).backgroundColor === 'rgb(124, 196, 255)'; })()`)) === true, 2000));
  await js(`document.querySelector('.pj').style.setProperty('--op', '1'); 1`);
  await pic(w, 'jobpop-needs.png');
  await js(`document.querySelector('.pj').style.setProperty('--op', '0.55'); document.querySelector('.chip.needs').click(); 1`);
  await wait(150);
  check('the chip asks for this job\'s own question', JSON.stringify(acts.at(-1)) === JSON.stringify({ t: 'jobpop.ask', session: S1, id: 'toolu_01ABC' }), acts.at(-1));

  // Paused: grey chip, Play.
  jp.update([job(S1, 'Waymark', 'paused', W1, 3), job(S2, 'Samara', 'working', W2, 1)], []);
  check('paused: grey PAUSED chip', await until(async () => (await js(`!!document.querySelector('.pj.paused .chip.paused')`)) === true, 2000));
  await js(`document.querySelector('.ckeys .pp').click(); 1`);
  await wait(150);
  check('paused: the key is Play and sends claude.play', await js(`document.querySelector('.ckeys .pp').textContent`) === 'Play' && JSON.stringify(acts.at(-1)) === JSON.stringify({ t: 'claude.play', session: S1 }), acts.at(-1));

  // 7. Complete: teal, the tick, JOB COMPLETE, Nice closes it (shrink and fade).
  jp.update([job(S1, 'Waymark', 'idle', W1, 6), job(S2, 'Samara', 'working', W2, 1)], []);
  check('complete: teal with JOB COMPLETE and Nice', await until(async () => (await js(`(() => { const pj = document.querySelector('.pj.done'); return !!pj && pj.querySelector('.big b').textContent === 'JOB COMPLETE' && !!pj.querySelector('.big canvas') && pj.querySelector('.nice').textContent === 'Nice' && /all 6 tasks/.test(pj.querySelector('.big small').textContent); })()`)) === true, 2000));
  check('complete: how long it took', /1 h 38 min/.test(await js(`document.querySelector('.big small').textContent`)), await js(`document.querySelector('.big small').textContent`));
  await js(`document.querySelector('.pj').style.setProperty('--op', '1'); 1`);
  await pic(w, 'jobpop-complete.png');
  // 2026-10-21 (his ask): the finished card is a door to its session; Nice keeps its own click.
  const nDone = acts.length;
  await js(`document.querySelector('.pj.done .big').click(); 1`);
  await wait(150);
  check('complete: a click on the card opens that session in Claude', JSON.stringify(acts[nDone]) === JSON.stringify({ t: 'jobpop.open', url: `claude://claude.ai/epitaxy/local_${S1}` }) && !w.isDestroyed(), acts.slice(nDone));
  await js(`document.querySelector('.nice').click(); 1`);
  await wait(120);
  check('Nice: it shrinks and fades', Number(await js(`getComputedStyle(document.getElementById('pw')).opacity`)) < 0.95);
  check('Nice: closed, onNice told', await until(() => w.isDestroyed() && nices[0] === S1 && !jp.has(S1), 2000), nices);

  // 8. Drag it onto Aang: onNear, then onPutBack, and the window goes. Pulled out again it remembers its spot and fade.
  const w2 = jp.open(S2, { x: -6000, y: 300 })!;
  const js2 = (s: string) => w2.webContents.executeJavaScript(s, true);
  check('second job opens', await until(async () => (await js2(`!!document.querySelector('.pj .pr')`)) === true, 10000));
  await wait(200);
  await js2(`(() => { document.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 50, bubbles: true })); const v = document.querySelector('.vs'), r = v.getBoundingClientRect(); const o = { bubbles: true, button: 0, pointerId: 9, clientX: r.x + 13, clientY: r.y + 58 }; v.dispatchEvent(new PointerEvent('pointerdown', o)); v.dispatchEvent(new PointerEvent('pointerup', o)); return 1; })()`);
  await wait(150);
  const start = w2.getPosition();
  await js2(`(() => { const t = document.querySelector('.pj .pr'); const o = { bubbles: true, button: 0, pointerId: 3, screenX: 500, screenY: 500 };
    t.dispatchEvent(new PointerEvent('pointerdown', o)); t.dispatchEvent(new PointerEvent('pointermove', { ...o, screenX: 560, screenY: 530 })); return 1; })()`);
  await wait(150);
  const moved = w2.getPosition();
  check('dragging moves the window', moved[0] === start[0]! + 60 && moved[1] === start[1]! + 30, { start, moved });
  check('a drag is not a click: still folded', await js2(`!document.querySelector('.pj').classList.contains('open')`) === true);
  pointer = { x: aang.x - 30, y: aang.y + 100 };     // close to Aang, not on him yet
  await js2(`(() => { const t = document.querySelector('.pj .pr'); t.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, button: 0, pointerId: 3, screenX: 600, screenY: 540 })); return 1; })()`);
  await wait(150);
  check('near Aang: onNear(true) for the bubble to light up', JSON.stringify(nears.at(-1)) === JSON.stringify([S2, true]), nears);
  pointer = { x: aang.x + 100, y: aang.y + 100 };    // on Aang
  await js2(`(() => { const t = document.querySelector('.pj .pr'); const o = { bubbles: true, button: 0, pointerId: 3, screenX: 640, screenY: 560 }; t.dispatchEvent(new PointerEvent('pointermove', o)); t.dispatchEvent(new PointerEvent('pointerup', o)); return 1; })()`);
  check('dropped on Aang: onPutBack, the window goes', await until(() => backs[0] === S2 && w2.isDestroyed() && !jp.has(S2), 2000), { backs });
  check('dropped: the near light is let go', JSON.stringify(nears.at(-1)) === JSON.stringify([S2, false]), nears);
  pointer = { x: -20000, y: 500 };
  const w3 = jp.open(S2)!;
  const js3 = (s: string) => w3.webContents.executeJavaScript(s, true);
  check('pulled out again: where it was before the drag', JSON.stringify(w3.getPosition()) === JSON.stringify(start), { start, now: w3.getPosition() });
  check('pulled out again: it kept its fade', await until(async () => Math.abs(Number(await js3(`document.querySelector('.pj')?.style.getPropertyValue('--op')`)) - 0.55) < 0.05, 6000));
  jp.update([job(S2, 'Samara', 'working', W2, 1)], []);
  // Dropped anywhere else: it just stays there.
  await until(async () => (await js3(`!!document.querySelector('.pj .pr')`)) === true);
  const s3 = w3.getPosition();
  await js3(`(() => { const t = document.querySelector('.pj .pr'); const o = { bubbles: true, button: 0, pointerId: 4, screenX: 10, screenY: 10 }; t.dispatchEvent(new PointerEvent('pointerdown', o)); t.dispatchEvent(new PointerEvent('pointermove', { ...o, screenX: 50, screenY: 10 })); t.dispatchEvent(new PointerEvent('pointerup', { ...o, screenX: 50, screenY: 10 })); return 1; })()`);
  await wait(200);
  check('dropped elsewhere: it stays where he let go', !w3.isDestroyed() && w3.getPosition()[0] === s3[0]! + 40 && backs.length === 1, w3.isDestroyed() ? 'gone' : w3.getPosition());

  // 2026-10-21 (his reports): a terminal session (no app link, no to-do list) still has Open in Claude, which brings the
  // Claude window forward ('front'), never nothing; a MacBook job asks the Mac; and "Working" is said once.
  const S3 = '5d5d5d5d-3333-4c3d-9e2f-dddddddddddd', S4 = '6e6e6e6e-4444-4c3d-9e2f-eeeeeeeeeeee';
  jp.update([job(S2, 'Samara', 'working', W2, 1), job(S3, 'Bare', 'working', [], 0, { open: null, progress: null, activity: { now: '', since: Date.now(), agents: [] } }),
    job(S4, 'MacJob', 'working', W2, 1, { machine: 'mac' })], []);
  const w4 = jp.open(S3, { x: -6000, y: 300 })!;
  const js4 = (s: string) => w4.webContents.executeJavaScript(s, true);
  await until(async () => (await js4(`!!document.querySelector('.pj .oc')`)) === true);
  const bareText = await js4(`document.querySelector('.pj').textContent`);
  check('no list: "Working" said once in the pop-out', (String(bareText).match(/Working/g) || []).length === 1, bareText);
  const n0 = acts.length;
  await js4(`document.querySelector('.pj .oc').click(); 1`);
  await wait(200);
  check('no app link: Open in Claude still asks for the Claude window (front)', JSON.stringify(acts[n0]) === JSON.stringify({ t: 'jobpop.open', url: 'front' }), acts.slice(n0));
  const w5 = jp.open(S4, { x: -6000, y: 300 })!;
  await until(async () => (await w5.webContents.executeJavaScript(`!!document.querySelector('.pj .oc')`, true)) === true);
  await w5.webContents.executeJavaScript(`document.querySelector('.pj .oc').click(); 1`, true);
  await wait(200);
  check('a MacBook job: Open in Claude asks the Mac', JSON.stringify(acts.at(-1)) === JSON.stringify({ t: 'jobpop.open', url: 'mac' }), acts.at(-1));
  jp.dispose();

  // Sheet 52 itself, the same scenes, frozen on their telling moment, for looking at side by side.
  const ref = new BrowserWindow({ show: false, width: 1400, height: 1000, paintWhenInitiallyHidden: true, webPreferences: { offscreen: true } });
  await ref.loadURL(pathToFileURL(path.join(HERE, '..', '..', '..', '..', 'docs', 'cockpit', 'sheet-52-job-popout.html')).href + '?still=1');
  await wait(1500);
  const fullH = await ref.webContents.executeJavaScript('document.documentElement.scrollHeight');
  ref.setContentSize(1400, Number(fullH));
  await wait(3500);
  for (const s of ['st-work', 'anat-open', 'opB', 'st-done', 'st-needs']) {
    const r = await ref.webContents.executeJavaScript(`(() => { const r = document.querySelector('.scene[data-s="${s}"]').getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y + scrollY), width: Math.round(r.width), height: Math.round(r.height) }; })()`);
    const img = await ref.webContents.capturePage(r);
    const f = path.join(OUT, `sheet52-${s}.png`); writeFileSync(f, img.toPNG()); console.log('PICTURE ' + f);
  }
  ref.destroy();

  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  pages.close();
  app.exit(bad ? 1 : 0);
});
