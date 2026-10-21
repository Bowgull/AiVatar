// C7 Claude's rune in Samara's band (2026-10-21, sheet 50, his picks B + Q): no rune with no jobs (or no brain); the
// rune appears only with a running job, its ring lit to the job's %; one rune with a gold 2 for two jobs; a click drops a
// ROUNDED panel with both jobs folded; each unfolds on its own; needs you turns it blue; a finished job turns teal and
// it goes by itself after a few seconds (Nice is only the pop-out's); Pause, Play, a message (now / after) and Open in Claude go out as the checked messages only, and
// anything else from the band is refused. Clicks are made inside the page (element.click()), never real mouse or keys;
// Open in Claude is caught by the test, so the Claude app is never opened. Two pictures: the bar, and the open panel.
//
// Run: npx electron test/electron/rune-check.ts [folder for the pictures]
import { app, BrowserWindow, screen } from 'electron';
import http from 'node:http';
import { mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts'; import { AangBrowser } from '../../src/browser.ts'; import { wireBrowser } from '../../src/browseripc.ts';
process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | ')); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.on('window-all-closed', () => {});
const HERE = path.dirname(fileURLToPath(import.meta.url));
// Off his screen, never in front of his game.
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
BrowserWindow.prototype.moveTop = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + String(d).slice(0, 260) : ''}`); if (!ok) bad++; };
const until = async (fn: () => boolean | Promise<boolean>, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(80); } return fn(); };
const OUT = (() => { const a = process.argv.at(-1); try { return a && statSync(a).isDirectory() ? a : os.tmpdir(); } catch { return os.tmpdir(); } })();

const S1 = '0b6c2a8e-1111-4c3d-9e2f-aaaaaaaaaaaa', S2 = '7f3e9d21-2222-4b8a-8c1d-bbbbbbbbbbbb';
const tasks = (done: number, names: string[]) => names.map((text, i) => ({ text, status: i < done ? 'completed' : i === done ? 'in_progress' : 'pending', ...(i === done ? { active: text + '...' } : {}) }));
const W1 = ['Replay harness', 'Athlete model', 'Rules-only brain', 'AI joins in', 'Readiness meter', 'Test week'];
const W2 = ['Read the drawer code', 'Round the plaques', 'Hover sounds', 'Test it'];
const job = (id: string, project: string, phase: string, t: any[], percent: number | null, etaMs: number | null) => ({
  id, machine: 'pc', cwd: 'C:\\x', project, model: 'opus', phase, startedAt: id === S1 ? 2 : 1, lastActivity: 1, prompt: 'go', tasks: t,
  current: '', percent, etaMs, usage: null, open: `claude://claude.ai/epitaxy/${id}`, held: 0 });

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const site = http.createServer((_q, r) => r.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Page</title><body style="background:#f6f3ee;font:20px sans-serif;padding:40px">A web page</body>'));
  await new Promise<void>((r) => site.listen(0, '127.0.0.1', () => r()));
  const port = (site.address() as { port: number }).port;
  const st = mkdtempSync(path.join(os.tmpdir(), 'rune-state-'));
  mkdirSync(path.join(st, 'open-urls'));
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: st, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'), tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs'), testLocal: true } as any) as any;
  wireBrowser(() => b);
  const sent: any[] = [], opened: string[] = [];
  b.onClaude = (m: any) => sent.push(m);
  b.onClaudeOpen = (u: string) => opened.push(u);
  b.open(`http://127.0.0.1:${port}/`);
  await until(() => !!b.win);
  const w: BrowserWindow = b.win;
  w.setSize(1180, 640);
  const js = (s: string) => w.webContents.executeJavaScript(s, true);
  await until(async () => (await js(`!!document.getElementById('runeslot') && document.readyState === 'complete'`)) === true, 10000);
  await wait(400);
  const slotShown = () => js(`!document.getElementById('runeslot').hidden && !!document.querySelector('#runeslot .rune')`);
  const bandH = () => js(`document.getElementById('band').getBoundingClientRect().height`);
  const h0 = await bandH();

  // 1. No brain (Samara on its own) and no jobs: no rune at all.
  check('no brain: no rune', (await slotShown()) === false);
  b.claudeNews({ t: 'claude.jobs', jobs: [job(S1, 'Waymark', 'idle', [], null, null)] });
  await wait(250);
  check('an idle session with nothing running: still no rune', (await slotShown()) === false);

  // 2. One job running: the rune, amber, its ring lit to the job's %.
  b.claudeNews({ t: 'claude.jobs', jobs: [job(S1, 'Waymark', 'working', tasks(3, W1), 62, 38 * 60_000)] });
  check('a running job: the rune appears', await until(slotShown));
  check('it is the working state, take B', await js(`(() => { const r = document.querySelector('#runeslot .rune'); return r.classList.contains('tB') && r.dataset.state === 'working' && r.style.getPropertyValue('--c') === '#f0a64a'; })()`) === true);
  const lit = await js(`(() => { const c = document.querySelector('#runeslot .rg'), g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data; let on = 0, all = 0;
    for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) { const i = (y * c.width + x) * 4; if (!d[i + 3]) continue; all++; if (d[i] === 240 && d[i + 1] === 166 && d[i + 2] === 74) on++; } return [on, all]; })()`);
  check('the ring is lit to about 62%', lit[1] > 20 && Math.abs(lit[0] / lit[1] - 0.62) < 0.06, `${lit[0]} of ${lit[1]}`);
  check('the band keeps its height', (await bandH()) === h0, `${h0} -> ${await bandH()}`);
  check('no number with one job', await js(`!document.querySelector('#runeslot .pip')`) === true);

  // 3. Two jobs: ONE rune with a gold 2.
  const two = () => [job(S1, 'Waymark', 'working', tasks(3, W1), 62, 38 * 60_000), job(S2, 'Samara', 'working', tasks(1, W2), 15, 50 * 60_000)];
  b.claudeNews({ t: 'claude.jobs', jobs: two() });
  check('two jobs: one rune with a 2', await until(async () => (await js(`[document.querySelectorAll('#runeslot .rune').length, document.querySelector('#runeslot .pip')?.textContent]`)).join() === '1,2'));
  const pic = async (name: string, rect?: Electron.Rectangle) => { const img = await w.webContents.capturePage(rect); const f = path.join(OUT, name); writeFileSync(f, img.toPNG()); console.log('PICTURE ' + f); };
  await pic('rune-bar.png', { x: 0, y: 0, width: 1180, height: 70 });

  // 4. Click: the rounded panel with both jobs folded.
  await js(`document.querySelector('#runeslot .rune').click()`);
  check('a click opens the panel', await until(async () => (await js(`!document.getElementById('rpanel').hidden`)) === true));
  const look = await js(`(() => { const p = document.getElementById('rpanel'), s = getComputedStyle(p); return { r: parseFloat(s.borderTopLeftRadius), img: s.borderImageSource, jobs: p.querySelectorAll('.job').length, open: p.querySelectorAll('.job.open').length, gh: p.querySelector('.gh').textContent }; })()`);
  check('the panel has round, soft corners (no square pixel frame)', look.r >= 12 && look.img === 'none', JSON.stringify(look));
  check('both jobs are listed, folded', look.jobs === 2 && look.open === 0 && look.gh === 'CLAUDE · 2 JOBS', JSON.stringify(look));
  check('the rune shows it is pressed', await js(`document.querySelector('#runeslot .rune').classList.contains('on')`) === true);
  const card = (id: string) => `#rpanel .job[data-id="${id}"]`;
  await js(`document.querySelector('${card(S1)}').click()`);
  check('the first unfolds on its own', await js(`[document.querySelector('${card(S1)}').classList.contains('open'), document.querySelector('${card(S2)}').classList.contains('open')].join()`) === 'true,false');
  await js(`document.querySelector('${card(S2)}').click()`);
  check('then the second too: both open', await js(`document.querySelectorAll('#rpanel .job.open').length`) === 2);
  check('the card has the tasks, the pill, Pause and Open in Claude', await js(`(() => { const c = document.querySelector('${card(S1)}'); return c.querySelectorAll('.ob').length === 6 && !!c.querySelector('canvas.jpill') && !!c.querySelector('[data-act=pause]') && !!c.querySelector('[data-act=open]') && !!c.querySelector('.msg') && c.querySelector('.pct').textContent === '62%'; })()`) === true);
  await js(`document.querySelector('${card(S2)}').click()`);
  check('and folds again on its own', await js(`[document.querySelector('${card(S1)}').classList.contains('open'), document.querySelector('${card(S2)}').classList.contains('open')].join()`) === 'true,false');
  await wait(400);
  await pic('rune-panel.png', { x: 560, y: 0, width: 620, height: 640 });

  // 5. The actions: the same checked messages the cockpit sends.
  await js(`document.querySelector('${card(S1)} [data-act=pause]').click()`);
  check('Pause sends claude.pause for that session', await until(() => sent.some((m) => m.t === 'claude.pause' && m.session === S1)), JSON.stringify(sent));
  await js(`document.querySelector('${card(S1)} [data-act=open]').click()`);
  check('Open in Claude hands over the exact claude:// link', await until(() => opened.includes(`claude://claude.ai/epitaxy/${S1}`)), JSON.stringify(opened));
  await js(`document.querySelector('${card(S2)} .msg').click()`);
  check('the purple key opens his words for that session', await js(`!!document.querySelector('${card(S2)} .say input')`) === true);
  await js(`(() => { const i = document.querySelector('${card(S2)} .say input'); i.value = 'Use the round plaques'; i.dispatchEvent(new Event('input')); document.querySelector('${card(S2)} [data-act=send]').click(); })()`);
  check('Send: claude.send now', await until(() => sent.some((m) => m.t === 'claude.send' && m.session === S2 && m.text === 'Use the round plaques' && m.when === 'now')), JSON.stringify(sent.at(-1)));
  await js(`document.querySelector('${card(S2)} .msg').click()`);
  await js(`(() => { const i = document.querySelector('${card(S2)} .say input'); i.value = 'Then the sounds'; i.dispatchEvent(new Event('input')); document.querySelector('${card(S2)} [data-act=after]').click(); })()`);
  check('After this task: claude.send after', await until(() => sent.some((m) => m.t === 'claude.send' && m.when === 'after' && m.text === 'Then the sounds')));
  b.claudeNews({ t: 'claude.jobs', jobs: [job(S1, 'Waymark', 'paused', tasks(3, W1), 62, null), two()[1]] });
  await until(async () => (await js(`!!document.querySelector('${card(S1)} [data-act=play]')`)) === true);
  await js(`document.querySelector('${card(S1)} [data-act=play]').click()`);
  check('a paused job: Play sends claude.play', await until(() => sent.some((m) => m.t === 'claude.play' && m.session === S1)));
  // Anything else from the band is refused: an answer (the band never approves anything), a bad id, a non-Claude link.
  const before = sent.length;
  await js(`window.aang.browserClaude({ t: 'claude.answer', id: 'toolu_1', decision: 'allow' }); window.aang.browserClaude({ t: 'claude.send', session: '../x y', text: 'a', when: 'now' }); window.aang.browserClaude({ t: 'claude.pause', session: 5 }); window.aang.browserOpenClaude('https://example.com/x'); window.aang.browserOpenClaude('claude://claude.ai/epitaxy/a b');`);
  await wait(400);
  check('the band cannot answer, send to a bad id, or open other links', sent.length === before && opened.length === 1, JSON.stringify(sent.slice(before)) + ' ' + JSON.stringify(opened));

  // 6. Needs you: blue, first.
  b.claudeNews({ t: 'claude.jobs', jobs: two() });
  b.claudeNews({ t: 'claude.wait', items: [{ id: 'toolu_9', session: S2, project: 'Samara', kind: 'permission', tool: 'Bash', summary: 'x', input: 'SECRET INPUT', canAlways: true, at: 1 }] });
  check('needs you: the rune turns blue', await until(async () => (await js(`document.querySelector('#runeslot .rune').dataset.state`)) === 'needs'));
  check('the needing job comes first, and says so', await js(`(() => { const j = document.querySelectorAll('#rpanel .job'); return j[0].dataset.id === '${S2}' && j[0].classList.contains('needs') && /NEEDS YOU/.test(j[0].textContent); })()`) === true);
  check("Claude's exact input never reaches the band", await js(`!document.body.innerHTML.includes('SECRET INPUT')`) === true);

  // 7. Finished: teal, the tick, no Nice (only the pop-out has one), and it goes by itself after ~4 s.
  b.claudeNews({ t: 'claude.wait', items: [] });
  b.claudeNews({ t: 'claude.jobs', jobs: [job(S1, 'Waymark', 'idle', tasks(6, W1), 100, 0), two()[1]] });
  check('a finished job: a teal card, no Nice', await until(async () => (await js(`!!document.querySelector('${card(S1)}.done') && !document.querySelector('${card(S1)} [data-act=nice]')`)) === true));
  check('the rune still counts it (2)', await js(`document.querySelector('#runeslot .pip')?.textContent`) === '2');
  await wait(300);
  await pic('rune-panel-done.png', { x: 560, y: 0, width: 620, height: 640 });
  check('the finished one goes by itself', await until(async () => (await js(`[!!document.querySelector('${card(S1)}'), !!document.querySelector('#runeslot .pip')].join()`)) === 'false,false', 7000));
  b.claudeNews({ t: 'claude.jobs', jobs: [job(S2, 'Samara', 'idle', tasks(4, W2), 100, 0)] });
  check('the last job finishing: the rune becomes the teal tick', await until(async () => (await js(`document.querySelector('#runeslot .rune')?.dataset.state`)) === 'complete'));
  await wait(400);
  await pic('rune-bar-done.png', { x: 900, y: 0, width: 280, height: 70 });

  // 8. Esc and a click elsewhere fold it; no brain: no rune.
  await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  check('Esc folds the panel', await js(`document.getElementById('rpanel').hidden`) === true);
  await js(`document.querySelector('#runeslot .rune').click()`);
  await js(`document.querySelector('.slot').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
  check('a click elsewhere folds it', await js(`document.getElementById('rpanel').hidden`) === true);
  b.claudeNews(null);
  check('the brain goes away: no rune', await until(async () => (await slotShown()) === false));

  console.log(bad ? `${bad} FAILED` : 'ALL PASS'); app.exit(bad ? 1 : 0);
});
