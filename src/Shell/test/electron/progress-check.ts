// Progress engine v3 on screen (2026-10-21, docs/PROGRESS-RESEARCH.md): the real bubble page, Samara's rune layer and
// the job pop-out, off screen and never focused, fed the brain's v3 claude.jobs. Checks, on all three where it shows:
// a working bar in the sea colour with earned "about" words; a stall frozen in amber saying "No sign of life for N
// min" with the live line saying "Last: ..."; the squeeze (a rewritten list never pulls the bar back); waiting on him
// in blue; OVERALL over CURRENT from a phase plan; the command sub-bar ("usually 1 min 30 s"), a helper-agent row
// ("14 tool calls") and a CI row ("step 2 of 3"); pips and no percent with no list. Then the latency check: 250 pushes,
// p99 from the event to the page's paint must be under 150 ms.
//
// Run: npx electron test/electron/progress-check.ts
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + String(d).slice(0, 300) : ''}`); if (!ok) bad++; };

const MIN = 60_000, H = 3_600_000;
const est = (ms: number, sigma = 0.6) => ({ mu: Math.log(ms), sigma });
/** A v3 job as the brain sends it (claudelink.ts list()), with `o` laid over the defaults. */
function v3job(id: string, project: string, o: { progress?: Record<string, unknown> | null; job?: Record<string, unknown>; activity?: Record<string, unknown> } = {}) {
  const now = Date.now();
  const progress = o.progress === null ? null : { v: 3, done: 1, total: 3, cur: 1, at: now, e: 30_000, jobW: 5 * MIN, doneW: 4 * MIN, curEst: est(4 * MIN), pend: [est(2 * MIN)], r: 1, earned: true,
    sq: null, note: null, aliveAt: now, stallMs: 60_000, running: true, rev: 0, elapsedMs: 30_000, paceMs: null, rewroteAt: null, ...(o.progress ?? {}) };
  return {
    id, machine: 'pc', cwd: 'C:\\x\\' + project, project, title: project, model: 'opus', phase: 'working', startedAt: now - 10 * MIN, lastActivity: now, prompt: 'go',
    tasks: o.progress === null ? [] : [['Write the parser', 'completed'], ['Run the tests', 'in_progress'], ['Commit', 'pending']].map(([text, status]) => ({ text, status })),
    current: 'Running the tests', percent: null, etaMs: null, usage: null, open: `claude://claude.ai/epitaxy/${id}`, held: 0, finished: false, source: 'link', failed: false,
    activity: { now: 'Running the tests · npm test', since: now - 40_000, agents: [], tool: null, pips: 3, aliveAt: now, stallMs: 60_000, ...(o.activity ?? {}) },
    plan: null, ci: [], progress, ...(o.job ?? {}),
  };
}
const S = (n: number) => `${n}${n}${n}${n}${n}${n}${n}${n}-aaaa-4bbb-8ccc-00000000000${n}`;
/** Everything at once: a plan, a command with history, a helper agent, a CI run in flight. */
function richJob(id: string) {
  const now = Date.now();
  return v3job(id, 'Waymark', {
    activity: {
      tool: { since: now - 40_000, est: est(90_000, 0.4), n: 5, usual: 90_000 },
      agents: [{ id: 'g1', kind: 'Explore', what: 'Mapping the code', since: now - 30_000, calls: 14, aliveAt: now, est: est(MIN), n: 5, fg: true }],
    },
    job: {
      plan: { phases: [{ label: 'P1 engine', hours: 2, status: 'done' }, { label: 'P2 sync', hours: 4, status: 'running' }, { label: 'P3 polish', hours: 6, status: 'todo' }], runE: 2 * H, at: now, running: true, R: 1, ratios: [] },
      ci: [{ id: '42', repo: 'Bowgull/Waymark', workflow: 'iOS build', title: 'x', url: '', status: 'in_progress', conclusion: '', createdAt: now - 3 * MIN, startedAt: now - 3 * MIN, step: 'Build', stepNo: 2, steps: 3,
        progress: { v: 3, done: 1, total: 3, cur: 1, at: now, e: 20_000, jobW: 3 * MIN, doneW: MIN, curEst: est(2 * MIN), pend: [est(30_000)], r: 1, earned: true, sq: null, note: null, aliveAt: now, stallMs: H, running: true, rev: 0, elapsedMs: 20_000, paceMs: null, rewroteAt: null } }],
    },
  });
}

/** The fill colour a pill shows a few pixels in (art pixel row 4 of 9 is the palette's middle shade). */
const PIX = `(c, x = 4) => { const g = c.getContext('2d'); const d = g.getImageData(x, 4, 1, 1).data; return [d[0], d[1], d[2]]; }`;
const near = (a: number[], hex: string, tol = 22) => { const b = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); return a.length === 3 && a.every((v, i) => Math.abs(v - b[i]!) <= tol); };
const SEA4 = '#58b0a3', AMBER4 = '#d98a2b', BLUE4 = '#5aa6e0';

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const win = async (page: string, preload: string, w = 700, ht = 1000) => {
    const b = new BrowserWindow({ width: w, height: ht, show: false, frame: false, webPreferences: { preload: path.join(HERE, preload), contextIsolation: false, sandbox: false, offscreen: true, backgroundThrottling: false } });
    b.setPosition(-6000, 100);
    b.showInactive();
    const errors: string[] = [];
    b.webContents.on('console-message', (e) => { const m = (e as unknown as { message?: string; level?: string }); if (m.level === 'error') errors.push(String(m.message)); });
    await b.loadURL(`${pages.origin}/${page}`);
    await wait(600);
    return { b, errors, js: (s: string) => b.webContents.executeJavaScript(s, true) as Promise<any> };
  };

  // ------------------------------------------------------------------ the bubble's job card
  const bub = await win('bubble.html', 'cockpit-stub.cjs');
  const deliver = (m: unknown) => bub.js(`window.__deliver(${JSON.stringify(m)})`);
  await bub.js(`window.__fire('onCockpit', { open: true, state: { maxH: 900 } }); window.__fire('onInputState', { opened: true, mode: 'auto', week: 0.3 })`);
  await wait(800);
  const card = () => bub.js(`(() => { const j = document.querySelector('#ckjobs .job'); if (!j) return null; const c = j.querySelector('.row2 canvas.jpill');
    return { lt: j.querySelector('.row2 .lt')?.textContent ?? '', pct: j.querySelector('.ff')?.textContent ?? '', an: j.querySelector('.act .an')?.textContent ?? '',
      px: c ? (${PIX})(c) : [], pip: c ? (${PIX})(c, 5) : [], ovr: j.querySelector('.ovr')?.textContent ?? '', cur: j.querySelector('.row2 .tag')?.textContent ?? '',
      sub: j.querySelector('.rows .sub')?.textContent ?? '', arow: j.querySelector('.rows .arow')?.textContent ?? '', crow: j.querySelector('.rows .crow')?.textContent ?? '' }; })()`);

  await deliver({ t: 'claude.jobs', jobs: [v3job(S(1), 'Waymark')] });
  await wait(300);
  let c = await card();
  check('bubble: a working bar in the sea colour', near(c?.px ?? [], SEA4), JSON.stringify(c));
  check('bubble: earned time left in plain words', /^(about .+ left|\d+-\d+ min left|a while yet)/.test(c?.lt ?? ''), c?.lt);
  check('bubble: time-weighted percent (one of three ticked, the big one done)', parseInt(c?.pct ?? '') > 33 && parseInt(c?.pct ?? '') < 90, c?.pct);

  // A stall: nothing heard for 5 minutes with a one-minute limit.
  await deliver({ t: 'claude.jobs', jobs: [v3job(S(1), 'Waymark', { progress: { aliveAt: Date.now() - 5 * MIN }, activity: { aliveAt: Date.now() - 5 * MIN } })] });
  await wait(300);
  c = await card();
  check('stall: says "No sign of life for 5 min"', c?.lt === 'No sign of life for 5 min', c?.lt);
  check('stall: the bar is amber', near(c?.px ?? [], AMBER4), JSON.stringify(c?.px));
  check('stall: the live line says what it was last doing', (c?.an ?? '').startsWith('Last: Running the tests'), c?.an);
  const p0 = c?.pct; await wait(1200); c = await card();
  check('stall: the bar is frozen (stillness means stillness)', c?.pct === p0, `${p0} -> ${c?.pct}`);

  // The squeeze: Claude added steps; the bar holds where it was drawn (60%) and fills the rest from there.
  await deliver({ t: 'claude.jobs', jobs: [v3job(S(1), 'Waymark', { progress: { done: 1, total: 6, pend: [est(5 * MIN), est(5 * MIN), est(5 * MIN), est(5 * MIN)], sq: { a: 0.6, m0: 0.15 }, note: { text: 'Claude added 3 steps', at: Date.now() } } })] });
  await wait(300);
  c = await card();
  check('squeeze: never back below what was drawn', parseInt(c?.pct ?? '') >= 60, c?.pct);
  check('squeeze: the time left says why, once', (c?.lt ?? '').includes('Claude added 3 steps'), c?.lt);

  // Waiting on him: his blue, and the words say so.
  await deliver({ t: 'claude.jobs', jobs: [v3job(S(1), 'Waymark', { progress: { running: false }, activity: { now: 'Waiting for your OK' } })] });
  await wait(300);
  c = await card();
  check('waiting: "Waiting for your OK" in blue', c?.lt === 'Waiting for your OK' && near(c?.px ?? [], BLUE4), JSON.stringify([c?.lt, c?.px]));

  // No list: no percent, a pip per finished tool call, "Working".
  await deliver({ t: 'claude.jobs', jobs: [v3job(S(1), 'Waymark', { progress: null })] });
  await wait(300);
  c = await card();
  check('no list: no percent, "Working", lit pips', c?.pct === '' && c?.lt === 'Working' && (c?.pip ?? []).some((v: number) => v > 120), JSON.stringify([c?.pct, c?.lt, c?.pip]));

  // OVERALL over CURRENT, the command sub-bar, a helper agent row and a CI row.
  await deliver({ t: 'claude.jobs', jobs: [richJob(S(1))] });
  await wait(300);
  c = await card();
  check('overall: OVERALL row with the phase and build hours left', /^OVERALL/.test(c?.ovr ?? '') && (c?.ovr ?? '').includes('phase 2 of 3') && (c?.ovr ?? '').includes('of build left'), c?.ovr);
  check('overall: the job bar is CURRENT', c?.cur === 'CURRENT', c?.cur);
  check('command sub-bar: "usually 1 min 30 s"', (c?.an ?? '').includes('usually 1 min 30 s') && (c?.sub ?? '').includes('of usually 1 min 30 s'), JSON.stringify([c?.an, c?.sub]));
  check('agent row: type, task, 14 tool calls, a time', /^Explore · mapping the code · 14 tool calls · about /.test(c?.arow ?? ''), c?.arow);
  check('CI row: workflow, step, time', /^CI · iOS build · step 2 of 3 · about /.test(c?.crow ?? ''), c?.crow);
  check('bubble: no errors', !bub.errors.length, bub.errors.join(' | '));

  // ------------------------------------------------------------------ Samara's rune panel (its own layer)
  const rn = await win('runelayer.html', 'progress-stub.cjs', 520, 900);
  await rn.js(`window.__fire('onBrowserClaude', ${JSON.stringify({ jobs: [richJob(S(2))], waits: [] })}); window.__fire('onBrowserRune', { open: true, tip: 300, maxH: 800 })`);
  await wait(500);
  await rn.js(`document.querySelector('.rpanel .job')?.click()`);
  await wait(400);
  const r = await rn.js(`(() => { const j = document.querySelector('.rpanel .job'); return j && { ovr: j.querySelector('.ovr')?.textContent ?? '', cur: j.querySelector('.row2 .tag')?.textContent ?? '', arow: j.querySelector('.rows .arow')?.textContent ?? '', crow: j.querySelector('.rows .crow')?.textContent ?? '' }; })()`);
  check('rune: OVERALL over CURRENT, the same rows', /^OVERALL.*phase 2 of 3/.test(r?.ovr ?? '') && r?.cur === 'CURRENT' && (r?.arow ?? '').includes('14 tool calls') && (r?.crow ?? '').startsWith('CI · iOS build'), JSON.stringify(r));
  await rn.js(`window.__fire('onBrowserClaude', ${JSON.stringify({ jobs: [v3job(S(2), 'Waymark', { progress: { aliveAt: Date.now() - 4 * MIN }, activity: { aliveAt: Date.now() - 4 * MIN } })], waits: [] })})`);
  await wait(400);
  const rl = await rn.js(`[...document.querySelectorAll('.rpanel .job .row2 .lt')].map(e => e.textContent).join('|')`);
  check('rune: a stall says so on the card', rl === 'No sign of life for 4 min', rl);
  check('rune: no errors', !rn.errors.length, rn.errors.join(' | '));

  // ------------------------------------------------------------------ the job pop-out
  const jp = await win('jobpop.html', 'progress-stub.cjs', 420, 500);
  await jp.js(`window.__fire('jobpop:data', ${JSON.stringify({ job: richJob(S(3)), waits: [], pinned: false })})`);
  await wait(400);
  const q = await jp.js(`(() => { const c = document.querySelector('.pj'); return c && { ovr: c.querySelector('.ovr')?.textContent ?? '', arow: c.querySelector('.rows .arow')?.textContent ?? '', crow: c.querySelector('.rows .crow')?.textContent ?? '', lt: c.querySelector('.lt')?.textContent ?? '' }; })()`);
  check('pop-out: OVERALL and the same rows', /^OVERALL.*phase 2 of 3/.test(q?.ovr ?? '') && (q?.arow ?? '').includes('14 tool calls') && (q?.crow ?? '').startsWith('CI · iOS build'), JSON.stringify(q));
  await jp.js(`window.__fire('jobpop:data', ${JSON.stringify({ job: v3job(S(3), 'Waymark', { progress: { aliveAt: Date.now() - 3 * MIN }, activity: { aliveAt: Date.now() - 3 * MIN } }), waits: [], pinned: false })})`);
  await wait(400);
  const ql = await jp.js(`document.querySelector('.pj .lt')?.textContent ?? ''`);
  check('pop-out: a stall says so', ql === 'No sign of life for 3 min', ql);
  check('pop-out: no errors', !jp.errors.length, jp.errors.join(' | '));

  // ------------------------------------------------------------------ the latency check (research section 5)
  await bub.js(`globalThis.aangProgressLat = undefined`);
  for (let i = 0; i < 250; i++) {
    const ev = Date.now();
    await deliver({ t: 'claude.jobs', jobs: [v3job(S(1), 'Waymark', { progress: { done: i % 3 === 2 ? 2 : 1 } })], lat: { ev, rx: ev, tx: ev, sh: ev, type: 'todos' } });
    if (i % 25 === 0) await wait(16);
  }
  await wait(400);
  const lat = await bub.js(`globalThis.aangProgressLat && { n: globalThis.aangProgressLat.count, p50: globalThis.aangProgressLat.p50, p95: globalThis.aangProgressLat.p95, p99: globalThis.aangProgressLat.p99 }`);
  console.log(`  event -> paint over ${lat?.n} pushes: p50 ${lat?.p50} ms, p95 ${lat?.p95} ms, p99 ${lat?.p99} ms`);
  check('latency: p99 from the event to the page\'s paint is under 150 ms', !!lat && lat.n >= 200 && lat.p99 <= 150, JSON.stringify(lat));

  console.log(bad ? `\n${bad} FAILED` : '\nALL PASS');
  app.exit(bad ? 1 : 0);
});
