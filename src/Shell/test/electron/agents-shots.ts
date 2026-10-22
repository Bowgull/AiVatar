// Sheet 58 (2026-10-21): how Claude's BACKGROUND helper agents show in Aang, at a glance. His words: "Does my progress
// bar include background agents? ... shouldn't surface as a job but as a background agent right? ... nothing too
// overcomplicated either. This is also important information to see at a glance."
//
// Every picture is a REAL render: the speech bubble's job list (bubble.html, the jobs from Claude's working mark, as
// speech-bubble-check.ts drives it), Samara's rune and its panel (an AangBrowser off screen, as rune-check.ts sets it up)
// and the job pop-out (JobPops, as jobpop-check.ts sets it up). Each option is laid on as a constructed stylesheet plus a
// small DOM injection under each job bar (the six helper icons are hand-placed palette pixels, drawn whole at 2x).
// A picture maker, not a check. Off screen, never focused, no real mouse or keys.
//
// Run (from src/Shell): npx electron test/electron/agents-shots.ts      pictures -> docs/cockpit/sheet-58/
import { app, BrowserWindow, nativeImage, screen } from 'electron';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { servePages } from '../../src/pageserver.ts';
import { AangBrowser } from '../../src/browser.ts';
import { wireBrowser } from '../../src/browseripc.ts';
import { JobPops } from '../../src/jobpop.ts';

// Samara's own background fetches (the ad blocker's lists) can throw off-thread; noted, as rune-check.ts does.
process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | ')); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 240_000).unref();
app.on('window-all-closed', () => { /* the script decides */ });
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'agents-shots-')));
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..', '..');
const OUT = path.join(ROOT, 'docs', 'cockpit', 'sheet-58');
// Off his screen, never in front of his game.
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
BrowserWindow.prototype.moveTop = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => boolean | Promise<boolean>, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(80); } return fn(); };
const ONLY = process.argv.slice(2).filter((a) => !a.endsWith('.ts'));
const wanted = (k: string) => !ONLY.length || ONLY.some((o) => k.startsWith(o));
const SHOTS: Record<string, { w: number; h: number }> = {};
function save(name: string, img: Electron.NativeImage) {
  writeFileSync(path.join(OUT, name + '.png'), img.toPNG());
  const s = img.getSize(); SHOTS[name] = { w: s.width, h: s.height };
  console.log('picture: ' + name + ' ' + s.width + 'x' + s.height);
}

// ---------------------------------------------------------------- the job and its three helpers
const MIN = 60_000;
const JOB = {
  id: 's-waymark', machine: 'pc', project: 'Waymark', phase: 'working', startedAt: Date.now() - 9 * MIN, prompt: 'Build the route screen',
  tasks: [
    { text: 'Read the map code', status: 'completed' }, { text: 'Add the grid layout', status: 'completed' },
    { text: 'Wire the route list', status: 'in_progress', active: 'Wiring the route list' },
    { text: 'Write the tests', status: 'pending' }, { text: 'Run the checks', status: 'pending' },
  ],
  current: '', percent: 48, etaMs: 7 * MIN, usage: null, open: 'claude://claude.ai/epitaxy/s-waymark', held: 0,
  activity: { now: 'Wiring the route list', since: Date.now() - 40_000, agents: [
    { id: 'a1', kind: 'general-purpose', what: 'Look up the map tiles docs', since: Date.now() - 4 * MIN, calls: 9, fg: false },
    { id: 'a2', kind: 'general-purpose', what: 'Write the route list', since: Date.now() - 3 * MIN, calls: 14, fg: false },
    { id: 'a3', kind: 'general-purpose', what: 'Run the tests', since: Date.now() - 1 * MIN, calls: 2, fg: false },
  ] },
};
/** What each helper shows, as the classifier (subagent type + description) would name it. */
const AG = [
  { type: 'research', label: 'Research', what: 'Map tiles docs', time: '4 min', usual: 6, mins: 4 },
  { type: 'build', label: 'Build', what: 'Route list', pct: 62 },
  { type: 'check', label: 'Check', what: 'Running the tests', time: '1 min', usual: 3, mins: 1 },
];
const AG5 = [...AG, { type: 'explore', label: 'Explore', what: 'Mapping the code', time: '2 min', usual: 3, mins: 2 }, { type: 'design', label: 'Design', what: 'Route screen picture', time: '30 s', usual: 4, mins: 0.5 }];

// ---------------------------------------------------------------- the kit, injected into every page
// pix(): palette-letter maps drawn whole-pixel (sheet 51's way). The six helper icons are 10 x 10 art pixels in the
// working mark's style (ClaudeMarks.cs): O dark wood outline, H the colour mixed 55% to white, F the colour, S mixed 35%
// to dark, plus a few fixed colours (W handle wood, P parchment, K ink, R rust). Drawn at 2x: 20 screen px.
const KIT = `
const pix = (map, pal, px) => { const c = document.createElement('canvas'); c.width = map[0].length * px; c.height = map.length * px; const g = c.getContext('2d');
  map.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x * px, y * px, px, px); } })); return c; };
const mix = (h, t, k) => { const a = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); return 'rgb(' + a.map((v, i) => Math.round(v + (t[i] - v) * k)).join(',') + ')'; };
const TINT = { research: '#966EC8', explore: '#58b0a3', build: '#f0a64a', check: '#8fbf4a', design: '#d9774f', plan: '#c9a46a' };
const MAPS = {
  research: ['..OOOO....', '.OFFFFO...', 'OFHGHHFO..', 'OFGHHHFO..', 'OFHHHHFO..', 'OFHHHHSO..', '.OSSSSOO..', '..OOOOOWO.', '......OWWO', '.......OO.'],
  explore:  ['..OOOOOO..', '.OFFFFFFO.', 'OFPPPPPRFO', 'OFPPPPRRFO', 'OFPPPRRPFO', 'OFPPKKPPFO', 'OFPKKPPPFO', 'OFPKPPPPSO', '.OSFFFFSO.', '..OOOOOO..'],
  build:    ['.OOOOOOO..', 'OLLLLLLLO.', 'OMMMMMMMOO', 'ONNNNNNNO.', '.OOOFFOOO.', '....OFSO..', '....OFSO..', '....OFSO..', '....OFSO..', '.....OO...'],
  check:    ['........OO', '.......OHO', '......OHFO', 'OO...OHFO.', 'OHO.OHFO..', 'OFHOHFO...', '.OFFFSO...', '..OFSO....', '...OO.....', '..........'],
  design:   ['.......OO.', '......ORRO', '.....OOROO', '....OHFO..', '...OHFSO..', '..OHFSO...', '.OPPSO....', '.OKPO.....', 'OOOO......', '..........'],
  plan:     ['...OOOO...', '.OOFHHFOO.', 'OPPOFFOPPO', 'OPPPPPPPPO', 'OPKKKKKPPO', 'OPPPPPPPPO', 'OPKKKKKKPO', 'OPPPPPPPPO', 'OPKKKPPPPO', '.OOOOOOOO.'],
};
window.__TINT = TINT;
window.__ic = (type, px = 2) => { const F = TINT[type];
  return pix(MAPS[type], { O: '#2a1a10', H: mix(F, [255, 255, 255], .55), F, S: mix(F, [40, 20, 10], .35), W: '#8a5a28', P: '#f6e7c4', K: '#5c4426', R: '#c4453a', G: '#ffffff', L: '#e6e8ee', M: '#a7adba', N: '#6c7282' }, px); };
// A helper's own small bar: the 45f pill's shape (rounded ends, whole art pixels at 2x) in the helper's colour; a bar
// that is only time (no to-do list of its own) is drawn the same but paler, so a real % reads stronger.
window.__bar = (w, ht, frac, col, soft) => { const s = 2, c = document.createElement('canvas'); c.width = w; c.height = ht; c.style.width = w * s + 'px'; c.style.height = ht * s + 'px';
  c.style.imageRendering = 'pixelated'; const g = c.getContext('2d'), r = (ht - 1) / 2;
  const inside = (x, y) => { const cx = x < r ? r : x > w - 1 - r ? w - 1 - r : x; return Math.hypot(x - cx, y - r) <= r + .3; };
  const lit = Math.round(frac * w);
  for (let y = 0; y < ht; y++) for (let x = 0; x < w; x++) { if (!inside(x, y)) continue;
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    g.fillStyle = edge ? 'rgba(90,60,25,.55)' : x < lit ? (y <= 1 ? mix(col, [255, 255, 255], soft ? .62 : .35) : soft ? mix(col, [255, 255, 255], .4) : col) : '#ead8b0';
    g.fillRect(x, y, 1, 1); }
  return c; };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const fracOf = (a) => a.pct != null ? a.pct / 100 : Math.min(.95, a.mins / a.usual);
const say = (a) => a.pct != null ? a.pct + '%' : a.time;
// A: one slim row of chips under the job bar, three at most, then +N.
window.__optA = (list) => { const row = el('div', 'ag58 A');
  for (const a of list.slice(0, 3)) { const ch = el('span', 'ch t-' + a.type); ch.append(window.__ic(a.type), el('b', '', a.label), el('small', '', say(a))); row.append(ch); }
  if (list.length > 3) row.append(el('span', 'mo58', '+' + (list.length - 3)));
  return row; };
// B: one "Helpers" line: the icons, the count and kinds, one tiny combined bar, a chevron; open: a row each.
window.__optB = (list, open) => { const box = el('div', 'ag58 B' + (open ? ' open' : '')), line = el('div', 'hl');
  const ics = el('span', 'ics'); for (const a of list.slice(0, 3)) ics.append(window.__ic(a.type));
  const kinds = [...new Set(list.map((a) => a.label.toLowerCase()))];
  const words = el('span', 'w'); words.append(el('b', '', list.length + ' helpers'), document.createTextNode(' · ' + kinds.join(', ')));
  const avg = list.reduce((s, a) => s + fracOf(a), 0) / list.length;
  line.append(ics, words, window.__bar(26, 5, avg, '#966EC8', false), el('i', 'chev'));
  box.append(line);
  if (open) { const rows = el('div', 'rws'); for (const a of list) { const r = el('div', 'r'); r.append(window.__ic(a.type), el('b', '', a.label), el('span', 'wh', a.what), el('span', 'tm', a.pct != null ? a.pct + '%' : a.time + ' of ~' + a.usual)); rows.append(r); } box.append(rows); }
  return box; };
// C: each helper an indented child row of the job: icon, label, its own thin bar, % or time.
window.__optC = (list) => { const box = el('div', 'ag58 C');
  for (const a of list) { const r = el('div', 'r t-' + a.type); r.append(window.__ic(a.type), el('b', '', a.label), el('span', 'wh', a.what), window.__bar(30, 5, fracOf(a), window.__TINT[a.type], a.pct == null), el('span', 'tm', a.pct != null ? a.pct + '%' : a.time)); box.append(r); }
  return box; };
// The count dot: how many helpers are running, a small plum tile with a white number (the rune's gold pip is jobs).
window.__dot = (n) => { const d = el('i', 'adot58', String(n)); return d; };
`;

// One stylesheet for the three options, scoped to .ag58 (all three surfaces put the job on the same parchment).
const OPT_CSS = `
.ag58 canvas{image-rendering:pixelated;display:block;flex:none}
.ag58.A{display:flex;align-items:center;gap:4px;margin-top:8px;flex-wrap:nowrap}
.ag58.A .ch{display:inline-flex;align-items:center;gap:4px;height:26px;box-sizing:border-box;padding:0 7px 0 3px;border-radius:8px;white-space:nowrap;
  background:rgba(255,250,236,.75);box-shadow:inset 0 0 0 1.5px rgba(120,80,30,.32),0 1.5px 0 rgba(90,60,25,.18)}
.ag58.A .ch b{font:700 12px Figtree,sans-serif;color:#2a1a10}
.ag58.A .ch small{font:600 11.5px Figtree,sans-serif;color:#7a5c3a}
.ag58.A .ch.t-build small{font:400 9.5px Silkscreen,monospace;color:#8a5a10}
.ag58.A .mo58{flex:none;display:grid;place-items:center;height:26px;box-sizing:border-box;padding:1px 6px 0;font:400 10px Silkscreen,monospace;color:#6b5236;border-radius:8px;box-shadow:inset 0 0 0 1.5px rgba(120,80,30,.32)}
.ag58.B{margin-top:8px;padding-top:7px;border-top:1.5px dashed rgba(120,80,30,.25)}
.ag58.B .hl{display:flex;align-items:center;gap:8px;min-width:0}
.ag58.B .ics{display:flex;flex:none}
.ag58.B .ics canvas+canvas{margin-left:-5px}
.ag58.B .w{min-width:0;flex:1;font:600 12.5px Figtree,sans-serif;color:#5c4426;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ag58.B .w b{font-weight:800;color:#2a1a10}
.ag58.B .chev{flex:none;width:0;height:0;border:5px solid transparent;border-top:6px solid #8f7458;border-bottom:0}
.ag58.B.open .chev{transform:rotate(180deg)}
.ag58.B .rws{margin-top:6px}
.ag58 .r{display:flex;align-items:center;gap:7px;height:26px;white-space:nowrap;min-width:0}
.ag58 .r b{flex:none;font:700 12.5px Figtree,sans-serif;color:#2a1a10;width:60px}
.ag58 .r .wh{flex:1;min-width:0;font:500 12px Figtree,sans-serif;color:#6b5236;overflow:hidden;text-overflow:ellipsis}
.ag58 .r .tm{flex:none;font:600 12px Figtree,sans-serif;color:#7a5c3a;text-align:right}
.ag58.C{margin:7px 0 0 9px;padding:1px 0 0 10px;border-left:2px solid rgba(120,80,30,.28);border-bottom-left-radius:6px}
.ag58.C .r .tm{width:40px}
.ag58.C .r.t-build .tm{font:400 9.5px Silkscreen,monospace;color:#8a5a10}
.adot58{position:absolute;min-width:17px;height:17px;box-sizing:border-box;padding:1px 4px 0;border-radius:6px;display:grid;place-items:center;font-style:normal;
  font:400 10px Silkscreen,monospace;line-height:1;color:#fffaf0;background:#6a46a0;box-shadow:0 0 0 2px #120A05,inset 1px 1px 0 rgba(220,200,255,.55)}
`;

type Js = (s: string) => Promise<any>;
const W = 940, H = 860;
const SPRITE = 'data:image/png;base64,' + readFileSync(path.join(ROOT, 'assets', 'aang', 'frames', 'idle_0.png')).toString('base64');

// ---------------------------------------------------------------- 1. the speech bubble (speech-bubble-check.ts's stage)
function stage() {
  const fx = W - 300, fy = H - 222;
  return { fx, fy, bubbleRight: fx + 96, bubbleBottom: fy + 80, head: { x: fx + 112, y: fy + 96 }, mark: { cx: fx + 113, bottom: fy + 78 - 9 } };
}
const STAGE_CSS = (s: ReturnType<typeof stage>, g = 0) => `
html,body{background:#191b24 !important}
body{background:radial-gradient(900px 500px at 15% 5%, rgba(80,96,140,.30), transparent 60%),radial-gradient(700px 500px at 95% 100%, rgba(120,70,110,.22), transparent 60%),linear-gradient(180deg,#1c1f2b,#151720) !important}
.wrap{margin:0 ${W - s.bubbleRight + g}px ${H - s.bubbleBottom + g}px 14px !important}
.stg{position:fixed;pointer-events:none;image-rendering:pixelated}
.adot58.stg{position:fixed}
`;
// Claude's working mark, ClaudeMarks.Draw at 3x (the pet paints it in its own window, so it is drawn here for the picture).
const MARK = `
const WORK = ['..OOOOOOOOO..', '.OHHHHHFFFSO.', 'OHFFFFFFFFFSO', 'OHFOFFOFFOFSO', 'OHFFFFFFFFFSO', '.OFFFFFFFFSO.', '..OOOFSOOOO..', '....OSO......', '....OO.......'];
{ const px = 3, c = document.createElement('canvas'); c.width = (WORK[0].length + 1) * px; c.height = (WORK.length + 1) * px; const g = c.getContext('2d');
  const F = '#f0a64a', pal = { O: '#2a1a10', H: mix(F, [255, 255, 255], .55), F, S: mix(F, [40, 20, 10], .35) };
  WORK.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') { g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect((x + 1) * px, (y + 1) * px, px, px); } }));
  WORK.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x * px, y * px, px, px); } }));
  window.__mark = c.toDataURL(); window.__markW = WORK[0].length * px; window.__markH = WORK.length * px; }
`;

async function bubbleOpen(pages: { origin: string }, dots = 3) {
  const w = new BrowserWindow({ width: W, height: H, show: false, frame: false, useContentSize: true,
    webPreferences: { preload: path.join(HERE, 'cockpit-stub.cjs'), contextIsolation: false, sandbox: false, offscreen: true } });
  w.setPosition(-6000, 100); w.showInactive();
  const errors: string[] = [];
  w.webContents.on('console-message', (e) => { const m = e as unknown as { message?: string; level?: string }; if (m.level === 'error') errors.push(String(m.message)); });
  await w.loadURL(`${pages.origin}/bubble.html`);
  await wait(700);
  const js: Js = (s) => w.webContents.executeJavaScript(`(async () => { try { return await (${s}); } catch (e) { return 'PAGE ERR ' + e.stack; } })()`, true)
    .then((r) => { if (typeof r === 'string' && r.startsWith('PAGE ERR')) throw new Error(r); return r; });
  const s = stage();
  const g = Number(await js(`parseFloat(getComputedStyle(document.getElementById('wrap')).marginRight) - 78`)) || 0;
  await js(`(() => {
    ${KIT}
    ${MARK}
    const st = new CSSStyleSheet(); st.replaceSync(${JSON.stringify(STAGE_CSS(s, g))});
    const op = new CSSStyleSheet(); op.replaceSync(${JSON.stringify(OPT_CSS)});
    document.adoptedStyleSheets = [st, op];
    const add = (src, x, y, cls) => { const i = document.createElement('img'); i.src = src; i.className = 'stg ' + (cls || ''); i.style.left = x + 'px'; i.style.top = y + 'px'; document.body.append(i); return i; };
    add(${JSON.stringify(SPRITE)}, ${s.fx}, ${s.fy}, 'aang');
    add(window.__mark, ${s.mark.cx} - window.__markW / 2, ${s.mark.bottom} - window.__markH, 'mark');
    // the count dot on the mark's top-right corner
    const d = window.__dot(${dots}); d.classList.add('stg'); d.style.left = (${s.mark.cx} + window.__markW / 2 - 9) + 'px'; d.style.top = (${s.mark.bottom} - window.__markH - 7) + 'px'; if (${dots}) document.body.append(d);
    window.__fire('onAim', { x: ${s.head.x}, y: ${s.head.y}, flip: false });
    return true;
  })()`);
  await wait(100);
  return { w, js, errors };
}
async function bubblePicture(w: BrowserWindow, js: Js, name: string) {
  const rs = await js(`(() => { const R = (e) => { if (!e) return null; const q = e.getBoundingClientRect(); return q.width > 2 && q.height > 2 ? { x: q.left, y: q.top, w: q.width, h: q.height } : null; };
    return [R(document.getElementById('skin')), R(document.querySelector('.stg.aang')), R(document.querySelector('.stg.mark')), R(document.querySelector('.adot58.stg:not([hidden])'))].filter(Boolean); })()`) as { x: number; y: number; w: number; h: number }[];
  const a = Math.min(...rs.map((q) => q.x)), b = Math.min(...rs.map((q) => q.y)), c = Math.max(...rs.map((q) => q.x + q.w)), d = Math.max(...rs.map((q) => q.y + q.h));
  const x = Math.max(0, Math.floor(a) - 24), y = Math.max(0, Math.floor(b) - 24);
  save(name, await w.webContents.capturePage({ x, y, width: Math.min(W - x, Math.ceil(c - x) + 24), height: Math.min(H - y, Math.ceil(d - y) + 8) }));
}
/** The helpers' DOM for an option (an expression evaluated in the page). */
const optExpr = (opt: string, list = AG, open = false) => opt === 'A' ? `window.__optA(${JSON.stringify(list)})` : opt === 'B' ? `window.__optB(${JSON.stringify(list)}, ${open})` : `window.__optC(${JSON.stringify(list)})`;

async function bubbleShot(pages: { origin: string }, name: string, opt: string, list = AG, open = false) {
  if (!wanted(name)) return;
  const { w, js, errors } = await bubbleOpen(pages, opt ? list.length : 0);
  await js(`window.__deliver({ t: 'claude.jobs', jobs: [${JSON.stringify(JOB)}] })`); await wait(300);
  if (!opt) {
    // TODAY: no dot, nothing under the bar; the helpers are only inside the unfolded drop-down.
    await js(`window.__fire('onRecall', 'jobs')`); await wait(1500);
    await js(`(() => { document.querySelector('#ckjobs .job .row2').click(); return true; })()`); await wait(1200);
    await bubblePicture(w, js, name);
    w.destroy(); return;
  }
  if (name === 'bubble-A') {
    // the mark with its count, close up (2x, whole pixels)
    const m = await js(`(() => { const r = document.querySelector('.stg.mark').getBoundingClientRect(); return { x: Math.round(r.left) - 14, y: Math.round(r.top) - 16, width: Math.round(r.width) + 34, height: Math.round(r.height) + 26 }; })()`);
    save('glance-mark', zoom(await w.webContents.capturePage(m), 3));
  }
  // Under each job bar as the bars are drawn (before the bubble measures them), so the bubble grows to fit.
  await js(`(() => { const strip = document.getElementById('ckjobs');
    const put = () => { for (const j of strip.querySelectorAll('.job')) if (!j.querySelector('.ag58')) j.querySelector('.row2').after(${optExpr(opt, list, open)}); };
    new MutationObserver(put).observe(strip, { childList: true, subtree: false }); return true; })()`);
  await js(`window.__fire('onRecall', 'jobs')`); await wait(1800);
  const info = await js(`(() => { const a = document.querySelector('#ckjobs .ag58'); return { n: document.querySelectorAll('#ckjobs .ag58').length, over: a ? a.scrollWidth - a.clientWidth : -1, w: a ? a.clientWidth : 0, kids: a ? [...a.children].map((k) => k.className + ':' + Math.round(k.getBoundingClientRect().width)) : [] }; })()`);
  console.log('  ' + name + ' ' + JSON.stringify(info));
  await bubblePicture(w, js, name);
  if (errors.length || info.n !== 1) console.log('  note: ' + JSON.stringify(info) + ' ' + errors.slice(0, 3).join(' | '));
  w.destroy();
}

// The six icons on the bubble's paper, 4x, nearest neighbour, for the sheet's key.
async function iconsShot(pages: { origin: string }) {
  if (!wanted('icons')) return;
  const { w, js } = await bubbleOpen(pages);
  await js(`(() => { const box = document.createElement('div'); box.id = 'ic58'; box.style.cssText = 'position:fixed;left:0;top:0;z-index:99;display:flex;gap:14px;padding:12px 16px;background:radial-gradient(120% 90% at 30% 0%,#fbf0d8,#e6cd9c);border-radius:0';
    for (const t of ['research', 'explore', 'build', 'check', 'design', 'plan']) { const c = window.__ic(t, 2); box.append(c); } document.body.append(box); return true; })()`);
  await wait(200);
  const r = await js(`(() => { const q = document.getElementById('ic58').getBoundingClientRect(); return { x: 0, y: 0, width: Math.ceil(q.width), height: Math.ceil(q.height) }; })()`);
  const img = (await w.webContents.capturePage(r));
  save('icons', zoom(img, 3));
  w.destroy();
}
/** Nearest-neighbour blow-up (every screen pixel a k x k block). */
function zoom(img: Electron.NativeImage, k: number) {
  const sz = img.getSize(), src = img.toBitmap(), out = Buffer.alloc(sz.width * k * sz.height * k * 4);
  for (let y = 0; y < sz.height * k; y++) for (let x = 0; x < sz.width * k; x++) {
    const a = ((Math.floor(y / k) * sz.width) + Math.floor(x / k)) * 4;
    src.copy(out, (y * sz.width * k + x) * 4, a, a + 4);
  }
  return nativeImage.createFromBitmap(out, { width: sz.width * k, height: sz.height * k });
}

// ---------------------------------------------------------------- 2. Samara's rune and its panel (rune-check.ts's setup)
async function runeShots(pages: { origin: string }) {
  if (!wanted('rune')) return;
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const st = mkdtempSync(path.join(os.tmpdir(), 'rune58-'));
  mkdirSync(path.join(st, 'open-urls'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: st, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'), tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs'), testLocal: true } as any) as any;
  wireBrowser(() => b);
  b.onClaude = () => {}; b.onClaudeOpen = () => {};
  const site = http.createServer((q, r) => r.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Page</title><body style="background:#eef0f3;font:20px sans-serif;padding:40px"></body>'));
  await new Promise<void>((r) => site.listen(0, '127.0.0.1', () => r()));
  b.open('http://127.0.0.1:' + (site.address() as { port: number }).port + '/');
  await until(() => !!b.win);
  const w: BrowserWindow = b.win;
  w.setSize(1180, 560);
  const js: Js = (s) => w.webContents.executeJavaScript(s, true);
  const layerOf = () => { const p = b.panes.find((x: any) => x.win === w); return p?.runeV && !p.runeV.webContents.isDestroyed() ? p.runeV : null; };
  const rjs: Js = async (s) => { await until(() => !!layerOf() && !layerOf().webContents.isLoading(), 6000); return layerOf().webContents.executeJavaScript(s, true); };
  await until(async () => (await js(`!!document.getElementById('runeslot') && document.readyState === 'complete'`)) === true, 10000);
  await wait(400);
  const RJOB = { ...JOB, id: '0b6c2a8e-1111-4c3d-9e2f-aaaaaaaaaaaa', open: 'claude://claude.ai/epitaxy/0b6c2a8e-1111-4c3d-9e2f-aaaaaaaaaaaa', cwd: 'C:\\x', model: 'opus', lastActivity: 1 };
  b.claudeNews({ t: 'claude.jobs', jobs: [RJOB] });
  await until(async () => (await js(`!document.getElementById('runeslot').hidden && !!document.querySelector('#runeslot .rune')`)) === true);
  await wait(700);
  // The count dot on the rune (top-right of the stone; the gold pip for jobs stays bottom-right).
  await js(`(() => { ${KIT}; const op = new CSSStyleSheet(); op.replaceSync(${JSON.stringify(OPT_CSS + '#runeslot .stone .adot58{right:-7px;top:-6px}')}); document.adoptedStyleSheets = [...document.adoptedStyleSheets, op];
    document.querySelector('#runeslot .stone').append(window.__dot(3)); return true; })()`);
  await wait(300);
  const rx = await js(`(() => { const r = document.querySelector('#runeslot .stone').getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; })()`);
  const band = await w.webContents.capturePage({ x: Math.max(0, rx.x - 150), y: 0, width: 300, height: 64 });
  save('glance-rune', zoom(band, 2));
  // Open the panel once, then per option lay the helpers under the card and picture the layer over the band.
  await js(`document.querySelector('#runeslot .rune').click()`);
  await until(async () => (await rjs(`!document.getElementById('rpanel').hidden`)) === true);
  await rjs(`(() => { ${KIT}; window.__op = new CSSStyleSheet(); window.__op.replaceSync(${JSON.stringify(OPT_CSS)}); document.adoptedStyleSheets = [...document.adoptedStyleSheets, window.__op]; return true; })()`);
  for (const [name, opt, open] of [['rune-A', 'A', false], ['rune-B', 'B', false], ['rune-B-open', 'B', true], ['rune-C', 'C', false]] as [string, string, boolean][]) {
    if (!wanted(name) && !wanted('rune')) continue;
    await rjs(`(() => { document.querySelectorAll('#rpanel .ag58').forEach((e) => e.remove()); const j = document.querySelector('#rpanel .job'); j.querySelector('.row2').after(${optExpr(opt, AG, open)}); return true; })()`);
    await wait(350);
    const lay = layerOf();
    const lb = lay.getBounds();
    const pr = await rjs(`(() => { const r = document.getElementById('rpanel').getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; })()`);
    const full = await w.webContents.capturePage();
    const top = await lay.webContents.capturePage();
    // Lay the see-through panel layer over the band at its own offset (straight alpha), then cut round the rune + panel.
    const fs = full.getSize(), base = Buffer.from(full.toBitmap()), ts = top.getSize(), tb = top.toBitmap();
    const k = fs.width / (w.getContentSize()[0]);
    for (let y = 0; y < ts.height; y++) for (let x = 0; x < ts.width; x++) {
      const X = x + Math.round(lb.x * k), Y = y + Math.round(lb.y * k); if (X < 0 || Y < 0 || X >= fs.width || Y >= fs.height) continue;
      const i = (y * ts.width + x) * 4, o = (Y * fs.width + X) * 4, a = tb[i + 3] / 255; if (!a) continue;
      for (let c = 0; c < 3; c++) base[o + c] = Math.round(tb[i + c] * a + base[o + c] * (1 - a));
      base[o + 3] = 255;
    }
    // Below the band the window shows the page's colour (the tab's page is its own view, not in this picture).
    const bandH = Number(await js(`Math.round(document.getElementById('band').getBoundingClientRect().bottom)`));
    const composed = nativeImage.createFromBitmap(base, { width: fs.width, height: fs.height });
    const x0 = Math.max(0, Math.min(pr.x + lb.x, rx.x) - 24), x1 = Math.min(fs.width, Math.max(pr.x + lb.x + pr.w, rx.x + rx.w) + 24);
    const cut = composed.crop({ x: x0, y: 0, width: x1 - x0, height: Math.min(fs.height, pr.y + lb.y + pr.h + 26) });
    // paint the area under the band a calm page grey where nothing was drawn (transparent in the chrome's own picture)
    const cb = Buffer.from(cut.toBitmap()), cs = cut.getSize();
    for (let y = bandH; y < cs.height; y++) for (let x = 0; x < cs.width; x++) { const o = (y * cs.width + x) * 4; if (cb[o + 3] < 255) { const a = cb[o + 3] / 255; cb[o] = Math.round(cb[o] * a + 0xee * (1 - a)); cb[o + 1] = Math.round(cb[o + 1] * a + 0xf0 * (1 - a)); cb[o + 2] = Math.round(cb[o + 2] * a + 0xf3 * (1 - a)); cb[o + 3] = 255; } }
    save(name, nativeImage.createFromBitmap(cb, { width: cs.width, height: cs.height }));
  }
  b.claudeNews(null);
  for (const x of BrowserWindow.getAllWindows()) if (x !== w) { try { x.destroy(); } catch { /* gone */ } }
  try { w.destroy(); } catch { /* gone */ }
}

// ---------------------------------------------------------------- 3. the job pop-out (jobpop-check.ts's setup)
async function popShots(pages: { origin: string }) {
  if (!wanted('pop')) return;
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const aang = { x: -3000, y: 400, width: 224, height: 224 };
  const jp = new JobPops({ origin: pages.origin, preloadPath: path.join(HERE, '..', '..', 'src', 'jobpoppreload.cjs'), iconPath: path.join(HERE, '..', '..', 'assets', 'aang.ico'),
    aangRects: () => [null, aang], clampToScreen: false, onAction: () => {}, onPutBack: () => {}, onNice: () => {}, onNear: () => {} } as any);
  const PJOB = { ...JOB, id: '0b6c2a8e-1111-4c3d-9e2f-aaaaaaaaaaaa', title: 'Waymark', cwd: 'C:\\x', model: 'opus', lastActivity: 1, open: 'claude://claude.ai/epitaxy/local_0b6c2a8e-1111-4c3d-9e2f-aaaaaaaaaaaa' };
  jp.update([PJOB] as any, []);
  for (const [name, opt, open] of [['pop-A', 'A', false], ['pop-B', 'B', false], ['pop-C', 'C', false]] as [string, string, boolean][]) {
    if (!wanted(name) && !wanted('pop')) continue;
    const w = jp.open(PJOB.id, { x: -6000, y: 300 })!;
    const js: Js = (s) => w.webContents.executeJavaScript(s, true);
    await until(async () => (await js(`!!document.querySelector('.pj .pr') && document.readyState === 'complete'`)) === true, 10000);
    await js('document.fonts.ready.then(() => 1)');
    await wait(400);
    await js(`(() => { ${KIT}; const op = new CSSStyleSheet(); op.replaceSync(${JSON.stringify(OPT_CSS)}); document.adoptedStyleSheets = [...document.adoptedStyleSheets, op];
      const put = () => { const pj = document.querySelector('.pj'); if (pj && !pj.querySelector('.ag58')) pj.querySelector('.top').after(${optExpr(opt, AG, open)}); };
      put(); new MutationObserver(put).observe(document.getElementById('pw'), { childList: true, subtree: true }); return true; })()`);
    await wait(600);
    // Room for the taller card (the real window grows with its card; here it is made tall enough to see it all).
    const r = await js(`(() => { const q = document.querySelector('.pj').getBoundingClientRect(); return { x: Math.round(q.left), y: Math.round(q.top), w: Math.round(q.width), h: Math.round(q.height) }; })()`);
    const b0 = w.getBounds(); w.setBounds({ ...b0, height: Math.max(b0.height, r.y + r.h + 40) }); await wait(300);
    await js(`(() => { const d = document.createElement('div'); d.id = 'shotbg'; d.style.cssText = 'position:fixed;inset:0;z-index:-5;background:radial-gradient(80% 90% at 30% 10%,#2e333c 0%,#22262d 55%,#1a1c21 100%)'; document.body.prepend(d); return 1; })()`);
    await wait(200);
    const img = await w.webContents.capturePage({ x: Math.max(0, r.x - 18), y: Math.max(0, r.y - 16), width: r.w + 36, height: r.h + 38 });
    save(name, img);
    w.destroy();
    await wait(300);
  }
}

// ---------------------------------------------------------------- run
app.whenReady().then(async () => {
  mkdirSync(OUT, { recursive: true });
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const prev = path.join(OUT, 'shots.js');
  if (ONLY.length) { try { Object.assign(SHOTS, JSON.parse(readFileSync(prev, 'utf8').replace(/^window\.SHOTS = /, '').replace(/;\s*$/, ''))); } catch { /* first run */ } }
  await iconsShot(pages);
  await bubbleShot(pages, 'bubble-today', '');
  await bubbleShot(pages, 'bubble-A', 'A');
  await bubbleShot(pages, 'bubble-A-five', 'A', AG5);
  await bubbleShot(pages, 'bubble-B', 'B');
  await bubbleShot(pages, 'bubble-B-open', 'B', AG, true);
  await bubbleShot(pages, 'bubble-C', 'C');
  await popShots(pages);
  await runeShots(pages);
  writeFileSync(prev, 'window.SHOTS = ' + JSON.stringify(SHOTS) + ';\n');
  pages.close();
  setTimeout(() => app.exit(0), 300);
});
