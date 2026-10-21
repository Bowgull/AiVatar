// Sheet 53 (APPROVED 2026-10-21, look B): the one living speech bubble, checked on the real page.
//
// bubble.html as the product ships it (the cockpit closed, no look stylesheet laid over it: the look is in bubble.css now),
// driven through the test preload exactly as main.ts drives it. Checks each moment he approved: a one-liner, Aang asking
// first (keys under the mouse), Claude's multiple choice (sheet 51's B rows), the jobs from Claude's working mark (folded
// bars that unfold, a click outside shrinks them away, no jobs = the chat box instead), clicking Aang with and without a
// line from the last 5 minutes, and the size holding still for 20 s of the mouse wandering over it.
//
// Every moment is also photographed on a stage like sheet 53's (dark desktop, Aang's idle frame at 1x where the Shell puts
// him, the chat box's own capture, Claude's working mark from the pet's pixel map) into test/electron/perf-out/speech/,
// to be put beside docs/cockpit/sheet-53/look-B-*.png, click-*.png and j-*.png.
//
// Off screen, never focused, no real input and no clipboard: mouse moves and clicks go to this page only.
// Run: npx electron test/electron/speech-bubble-check.ts
import { app, BrowserWindow, nativeImage } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { servePages } from '../../src/pageserver.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 230_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..', '..');
const OUT = path.join(HERE, 'perf-out', 'speech');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + String(d).slice(0, 240) : ''}`); if (!ok) bad++; };

const SPRITE = 'data:image/png;base64,' + readFileSync(path.join(ROOT, 'assets', 'aang', 'frames', 'idle_0.png')).toString('base64');
const W = 940, H = 860;

const JOB = {
  id: 's-waymark', machine: 'pc', project: 'Waymark', phase: 'working', startedAt: Date.now() - 9 * 60000, prompt: 'Build the route screen',
  tasks: [
    { text: 'Read the map code', status: 'completed' }, { text: 'Add the grid layout', status: 'completed' },
    { text: 'Wire the route list', status: 'in_progress', active: 'Wiring the route list' },
    { text: 'Write the tests', status: 'pending' }, { text: 'Run the checks', status: 'pending' },
  ],
  current: '', percent: 62, etaMs: 6 * 60000, usage: { rateLimits: [{ kind: 'seven_day', percentUsed: 31 }] }, open: 'claude://claude.ai/epitaxy/s-waymark', held: 0,
};
const JOB2 = {
  id: 's-samara', machine: 'mac', project: 'Samara', phase: 'working', startedAt: Date.now() - 30 * 60000, prompt: 'Tidy the bookmarks bar',
  tasks: [{ text: 'Find the old bar code', status: 'completed' }, { text: 'Move bookmarks to the shelf', status: 'in_progress', active: 'Moving bookmarks to the shelf' }, { text: 'Check it on the Mac', status: 'pending' }],
  current: '', percent: 41, etaMs: 12 * 60000, usage: null, open: 'claude://claude.ai/epitaxy/s-samara', held: 0,
};
const QUESTION = {
  id: 'w-1', session: 's-waymark', project: 'Waymark', kind: 'question', tool: 'AskUserQuestion', canAlways: false, summary: '',
  questions: [{ question: 'Which layout should the map use?', header: 'Layout', multiSelect: false, options: [
    { label: 'Full-screen map (Recommended)', description: 'The map fills the screen.' },
    { label: 'Split: map and list', description: 'Turns listed underneath.' },
    { label: 'List first', description: 'Turn by turn.' },
  ] }],
};

// ---------------------------------------------------------------- the stage (sheet 53's, from speech-shots.ts)
function stage(withBox: boolean) {
  const fx = W - 300, fy = H - 222, boxTop = fy + 74;
  return { fx, fy, bubbleRight: fx + 96, bubbleBottom: withBox ? boxTop + 4 - 12 : fy + 80, boxLeft: fx + 72 - 256 - 6 - 22, boxTop,
    head: { x: fx + 112, y: fy + 96 }, mark: { cx: fx + 113, bottom: fy + 78 - 9 } };
}
// `g` (2026-10-21): how much further from him the product puts the bubble for the wood rim, read from bubble.css's own
// .wrap margin (78 without the rim), so the stage moves it exactly as the real window does.
const STAGE_CSS = (s: ReturnType<typeof stage>, g = 0) => `
html,body{background:#191b24 !important}
body{background:radial-gradient(900px 500px at 15% 5%, rgba(80,96,140,.30), transparent 60%),radial-gradient(700px 500px at 95% 100%, rgba(120,70,110,.22), transparent 60%),linear-gradient(180deg,#1c1f2b,#151720) !important}
.wrap{margin:0 ${W - s.bubbleRight + g}px ${H - s.bubbleBottom + g}px 14px !important}
.stg{position:fixed;pointer-events:none;image-rendering:pixelated}
`;
// Claude's working mark, ClaudeMarks.Draw at 3x (the pet paints it in its own window, so it is drawn here for the picture).
const MARK = `
const mix = (h, t, k) => { const a = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); return 'rgb(' + a.map((v, i) => Math.round(v + (t[i] - v) * k)).join(',') + ')'; };
const WORK = ['..OOOOOOOOO..', '.OHHHHHFFFSO.', 'OHFFFFFFFFFSO', 'OHFOFFOFFOFSO', 'OHFFFFFFFFFSO', '.OFFFFFFFFSO.', '..OOOFSOOOO..', '....OSO......', '....OO.......'];
{ const px = 3, c = document.createElement('canvas'); c.width = (WORK[0].length + 1) * px; c.height = (WORK.length + 1) * px; const g = c.getContext('2d');
  const F = '#f0a64a', pal = { O: '#2a1a10', H: mix(F, [255, 255, 255], .55), F, S: mix(F, [40, 20, 10], .35) };
  WORK.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') { g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect((x + 1) * px, (y + 1) * px, px, px); } }));
  WORK.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x * px, y * px, px, px); } }));
  window.__mark = c.toDataURL(); window.__markW = WORK[0].length * px; window.__markH = WORK.length * px; }
`;

let boxPng = '';
async function boxPicture(pages: { origin: string }) {
  const w = new BrowserWindow({ width: 268, height: 112, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(HERE, 'cockpit-stub.cjs'), contextIsolation: false, sandbox: false, offscreen: true } });
  w.setPosition(-6000, 100); w.showInactive();
  await w.loadURL(`${pages.origin}/input.html`);
  await wait(700);
  await w.webContents.executeJavaScript(`window.__fire('onInputState', { opened: true, mode: 'auto', week: 0.31, history: [] }); true`, true);
  await wait(500);
  boxPng = 'data:image/png;base64,' + (await w.webContents.capturePage()).toPNG().toString('base64');
  w.destroy();
}

type Js = (s: string) => Promise<any>;
interface Page { w: BrowserWindow; js: Js; errors: string[] }
async function open(pages: { origin: string }, o: { box?: boolean; mark?: boolean } = {}): Promise<Page> {
  const w = new BrowserWindow({ width: W, height: H, show: false, frame: false, useContentSize: true,
    webPreferences: { preload: path.join(HERE, 'cockpit-stub.cjs'), contextIsolation: false, sandbox: false, offscreen: true } });
  w.setPosition(-6000, 100); w.showInactive();
  const errors: string[] = [];
  w.webContents.on('console-message', (e) => { const m = e as unknown as { message?: string; level?: string }; if (m.level === 'error') errors.push(String(m.message)); });
  await w.loadURL(`${pages.origin}/bubble.html`);
  await wait(700);
  const js: Js = (s) => w.webContents.executeJavaScript(s, true);
  const s = stage(Boolean(o.box));
  const g = Number(await js(`parseFloat(getComputedStyle(document.getElementById('wrap')).marginRight) - 78`)) || 0;
  await js(`(() => {
    ${MARK}
    const st = new CSSStyleSheet(); st.replaceSync(${JSON.stringify(STAGE_CSS(s, g))});
    document.adoptedStyleSheets = [st];
    const add = (src, x, y, cls) => { const i = document.createElement('img'); i.src = src; i.className = 'stg ' + (cls || ''); i.style.left = x + 'px'; i.style.top = y + 'px'; document.body.append(i); return i; };
    add(${JSON.stringify(SPRITE)}, ${s.fx}, ${s.fy}, 'aang');
    ${o.box ? `add(${JSON.stringify(boxPng)}, ${s.boxLeft}, ${s.boxTop}, 'box');` : ''}
    ${o.mark ? `add(window.__mark, ${s.mark.cx} - window.__markW / 2, ${s.mark.bottom} - window.__markH, 'mark');` : ''}
    window.__fire('onAim', { x: ${s.head.x}, y: ${s.head.y}, flip: false });
    return true;
  })()`);
  await wait(100);
  return { w, js, errors };
}
/** The page's own doors it called (the stub records them), taken out. */
const sent = async (js: Js, name: string) => (await js(`window.__sent.filter(s => s[0] === ${JSON.stringify(name)}).map(s => s[1][0])`)) as any[];
const clearSent = (js: Js) => js(`window.__sent.length = 0; true`);
const visible = (js: Js) => js(`!document.getElementById('bubble').hidden`) as Promise<boolean>;
const hover = (w: BrowserWindow, x: number, y: number) => w.webContents.sendInputEvent({ type: 'mouseMove', x, y });
const click = (w: BrowserWindow, x: number, y: number) => {
  w.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
  w.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
};
const centre = (js: Js, sel: string) => js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + Math.min(40, r.width / 2)), y: Math.round(r.top + Math.min(14, r.height / 2)) }; })()`) as Promise<{ x: number; y: number } | null>;

const LAYOUT = `(() => {
  const R = (e) => { if (!e) return null; const q = e.getBoundingClientRect(); return q.width > 2 && q.height > 2 ? { x: q.left, y: q.top, w: q.width, h: q.height } : null; };
  const bub = document.getElementById('bubble');
  return [bub.hidden ? null : R(document.getElementById('skin')), R(document.querySelector('.stg.aang')), R(document.querySelector('.stg.box')), R(document.querySelector('.stg.mark'))].filter(Boolean);
})()`;
async function picture(p: Page, name: string) {
  const rs = await p.js(LAYOUT) as { x: number; y: number; w: number; h: number }[];
  const a = Math.min(...rs.map((q) => q.x)), b = Math.min(...rs.map((q) => q.y)), c = Math.max(...rs.map((q) => q.x + q.w)), d = Math.max(...rs.map((q) => q.y + q.h));
  const x = Math.max(0, Math.floor(a) - 24), y = Math.max(0, Math.floor(b) - 24);
  const r = { x, y, width: Math.min(W - x, Math.ceil(c - x) + 24), height: Math.min(H - y, Math.ceil(d - y) + 8) };
  writeFileSync(path.join(OUT, name + '.png'), (await p.w.webContents.capturePage(r)).toPNG());
  console.log('picture: ' + path.join(OUT, name + '.png'));
}
/** A close-up at exactly 4x, nearest neighbour (every screen pixel a 4x4 block), for checking the rim's pixels are crisp. */
async function zoom4(p: Page, name: string, r: { x: number; y: number; width: number; height: number }) {
  const c = (await p.w.webContents.capturePage()).crop(r), sz = c.getSize(), src = c.toBitmap(), k = 4;
  const out = Buffer.alloc(sz.width * k * sz.height * k * 4);
  for (let y = 0; y < sz.height * k; y++) for (let x = 0; x < sz.width * k; x++) {
    const a = ((Math.floor(y / k) * sz.width) + Math.floor(x / k)) * 4;
    src.copy(out, (y * sz.width * k + x) * 4, a, a + 4);
  }
  writeFileSync(path.join(OUT, name + '.png'), nativeImage.createFromBitmap(out, { width: sz.width * k, height: sz.height * k }).toPNG());
  console.log('picture: ' + path.join(OUT, name + '.png'));
}

app.whenReady().then(async () => {
  mkdirSync(OUT, { recursive: true });
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  await boxPicture(pages);

  // ---- a: a one-liner, on light paper, no stamp
  {
    const p = await open(pages);
    await p.js(`window.__deliver({ t: 'bubble', text: 'Your build finished. Every test passed.', stream: false, turn: 11, proactive: true })`);
    // mid-grow (2026-10-21): the wood rim has to follow the 520 ms spring frame by frame
    await wait(140); await picture(p, 'a-0-midgrow');
    await wait(120); await picture(p, 'a-0-midgrow2');
    await wait(2340);
    check('a one-liner shows', await visible(p.js));
    // Sheet 55 S2 (2026-10-21): his wood rim replaces the placeholder ink edge. Four corners, four straight runs, the tail's
    // patch; the ink line and the hard shadow step aside; the paper and the room inside are unchanged.
    const look = await p.js(`(() => { const skin = document.getElementById('skin'), s = getComputedStyle(skin.querySelector('.p1'));
      return { paper: s.stopColor, rimmed: skin.classList.contains('rimmed'), pieces: skin.querySelectorAll('g.rim > rect, g.rim > use, g.rim > image').length,
        ink: getComputedStyle(skin.querySelector('.ink')).display, hard: getComputedStyle(skin.querySelector('.hard')).display,
        crisp: [...skin.querySelectorAll('g.rim image'), ...document.querySelectorAll('#rimdefs image')].every((i) => getComputedStyle(i).imageRendering === 'pixelated') && document.querySelectorAll('#rimdefs image').length === 8,
        pad: getComputedStyle(document.getElementById('bubble')).paddingTop, ago: document.getElementById('wrap').classList.contains('ago') }; })()`);
    check('look B paper with the S2 wood rim: 4 corners + 4 runs + the tail patch, all pixelated', look.paper === 'rgb(251, 240, 216)' && look.rimmed && look.pieces === 9 && look.crisp, JSON.stringify(look));
    check('the ink line and the hard shadow step aside for the wood', look.ink === 'none' && look.hard === 'none', JSON.stringify(look));
    check('look B room inside the rim (19 px)', look.pad === '19px', look.pad);
    check('no "N MIN AGO" stamp on a fresh line', look.ago === false);
    // The window is 8 px bigger for the rim (bubble.js sendWindow), and the bubble sits 8 px further up and left in it.
    const win = await p.js(`(() => { const b = document.getElementById('bubble').getBoundingClientRect(); const s = window.__sent.filter((x) => x[0] === 'bubbleSize').map((x) => x[1][0]).at(-1);
      return { w: Math.ceil(b.width), h: Math.ceil(b.height), sent: s }; })()`);
    check('window asked for 8 px more each way, same tail pad', win.sent && win.sent.width === win.w + 100 && win.sent.height === win.h + 88 && win.sent.pad.right === 72 && win.sent.pad.bottom === 38, JSON.stringify(win));
    // The tail still reaches his head: the rim's outer tail tip, vs where the old ink-line tail tip was before the move.
    const reach = await p.js(`import('./balloon.js').then((m) => { const b = document.getElementById('bubble').getBoundingClientRect(), G = m.RIM_G;
      const head = { x: ${stage(false).head.x} - b.left, y: ${stage(false).head.y} - b.top };
      const near = (d, hx, hy) => { const v = d.match(/-?[0-9.]+/g).map(Number); let best = 1e9; for (let i = 0; i < v.length; i += 2) best = Math.min(best, Math.hypot(v[i] - hx, v[i + 1] - hy)); return Math.round(best * 10) / 10; };
      return { now: near(m.balloonPath(b.width + 2 * G, b.height + 2 * G, { x: head.x + G, y: head.y + G }), head.x + G, head.y + G),
        before: near(m.balloonPath(b.width, b.height, { x: head.x - G, y: head.y - G }), head.x - G, head.y - G) }; })`);
    // (the rim's tip comes out a few px nearer him than the old one, as on the sheet's stage: it still reaches, never touches)
    check('the tail still reaches his head: no further than before the rim, and not touching him', reach.now <= reach.before + 1 && reach.now >= 8, JSON.stringify(reach));
    // The cost per frame while it grows: 30 sizes of a grow, cold (no tail patch remembered yet), rim vs no rim.
    const cost = await p.js(`import('./balloon.js').then((m) => { const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
      svg.style.cssText = 'position:absolute;left:-4000px;top:0'; document.getElementById('wrap').append(svg);
      const run = (rim) => { const t0 = performance.now(); for (let k = 1; k <= 30; k++) { const w = Math.round(60 + 240 * k / 30), h = Math.round(40 + 22 * k / 30);
        const head = { x: w + 112 + (rim ? 0.3 : 0), y: h + 30 + k }; const d = m.balloonPath(w, h, head);
        m.paintBalloon(svg, w + m.PAD_R, h + m.PAD_B, d, 9000 + k, false, rim ? { w, h, head } : null); svg.getBBox(); } return (performance.now() - t0) / 30; };
      const plain = run(false), rim = run(true); svg.remove(); return { plain: Math.round(plain * 100) / 100, rim: Math.round(rim * 100) / 100 }; })`);
    check('the rim costs under 2 ms a frame while growing (cold)', cost.rim - cost.plain < 2, JSON.stringify(cost));
    await picture(p, 'a-line');
    { const b = await p.js(`(() => { const r = document.getElementById('bubble').getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; })()`);
      await zoom4(p, 'a-zoom-corner', { x: b.x - 16, y: b.y - 16, width: 64, height: 64 });
      await zoom4(p, 'a-zoom-tail', { x: b.x + b.w - 112, y: b.y + b.h - 36, width: 150, height: 96 }); }
    check('no page errors (a)', !p.errors.length, p.errors.join(' | '));
    p.w.destroy();
  }

  // ---- b: Aang asking first: the kicker, the question, the helper line; keys under the mouse
  {
    const p = await open(pages);
    await p.js(`window.__deliver({ t: 'permission', id: 'p-1', question: 'Can I delete the 3 old build folders?', means: 'They take 2.1 GB. Nothing else uses them.' })`);
    await wait(900);
    const at = await centre(p.js, '#bubble'); if (at) hover(p.w, at.x, at.y);
    await wait(1200);
    const ask = await p.js(`(() => { const a = document.getElementById('asks'); return { keys: a.querySelectorAll('.key, .lever').length, shown: getComputedStyle(a).display !== 'none', q: getComputedStyle(document.getElementById('said')).fontWeight, kick: getComputedStyle(document.querySelector('.who')).fontFamily }; })()`);
    check('the question shows its keys while the mouse is on it', ask.shown && ask.keys >= 2, JSON.stringify(ask));
    check('sheet 51 Styled type: the question 800, the kicker in Silkscreen', ask.q === '800' && /Silkscreen/.test(ask.kick), JSON.stringify(ask));
    await picture(p, 'b-ask');
    check('no page errors (b)', !p.errors.length, p.errors.join(' | '));
    p.w.destroy();
  }

  // ---- c: Claude's multiple choice, sheet 51's B rows
  {
    const p = await open(pages);
    await p.js(`window.__deliver({ t: 'claude.wait', items: [${JSON.stringify(QUESTION)}] })`);
    await wait(1500);
    const c = await p.js(`(() => { const rows = [...document.querySelectorAll('#ckpins .opt')]; const on = document.querySelector('#ckpins .opt.on');
      const cs = on ? getComputedStyle(on) : null, lab = on ? getComputedStyle(on.querySelector('.lab')) : null, fin = on ? getComputedStyle(on, '::before') : null;
      return { shown: !document.getElementById('bubble').hidden && !document.getElementById('ckpins').hidden, rows: rows.length, onBg: cs?.backgroundColor, onText: lab?.color,
        finger: /data:image/.test(fin?.backgroundImage ?? ''), best: document.querySelector('#ckpins .rec')?.textContent, bestBg: getComputedStyle(document.querySelector('#ckpins .rec')).backgroundColor,
        boxed: rows.every((r) => getComputedStyle(r).borderRadius === '7px'), kicker: getComputedStyle(document.querySelector('#ckpins .ctag'), '::before').content }; })()`);
    check('Claude\'s question shows in the speech bubble', c.shown);
    check('each answer its own box, plus Something else', c.rows === 4 && c.boxed, JSON.stringify(c));
    check('the pointed-at row is plum with white text and the slim G1 finger', c.onBg === 'rgb(74, 44, 110)' && c.onText === 'rgb(255, 250, 240)' && c.finger, JSON.stringify(c));
    check('teal BEST tag', c.best === 'BEST' && c.bestBg === 'rgb(29, 107, 96)', JSON.stringify(c));
    check('the kicker says CLAUDE · (the project follows)', /CLAUDE/.test(String(c.kicker)), String(c.kicker));
    await picture(p, 'c-choice');
    check('no page errors (c)', !p.errors.length, p.errors.join(' | '));
    p.w.destroy();
  }

  // ---- e, f: the morning brief and a video, on the bubble's own light paper (never a wood window)
  {
    const p = await open(pages);
    const day = new Date(), at = (h: number, m = 0) => { const d = new Date(day); d.setHours(h, m, 0, 0); return d.toISOString(); };
    const brief = { day: 'Tuesday, October 21', weather: { words: 'sunny', low: 4, high: 13 },
      parts: [{ part: 'morn', sky: 'sun', temp: 6 }, { part: 'aftn', sky: 'sun', temp: 13 }, { part: 'eve', sky: 'cloud', temp: 8 }],
      events: [{ start: at(14), end: at(15), title: 'Interview with Acme', where: 'Google Meet' }, { start: at(18, 30), title: 'Dinner with Dana' }],
      unread: [{ from: 'Dana Smith', subject: 'Friday demo', why: 'Asked if Friday still works', at: at(8, 12) }], jobsNew: 2, week: 0.31 };
    await p.js(`window.__deliver({ t: 'bubble', text: '', stream: false, turn: 13, proactive: true, brief: ${JSON.stringify(brief)} })`);
    await wait(1700);
    check('the brief is on the light paper, not wood', (await visible(p.js)) && (await p.js(`!document.getElementById('bubble').classList.contains('lantern') && !document.querySelector('.briefcard').hidden`)) === true);
    await picture(p, 'e-brief');
    p.w.destroy();
  }
  {
    const p = await open(pages);
    await p.js(`(() => { const c = document.createElement('canvas'); c.width = 160; c.height = 90; const g = c.getContext('2d'); g.fillStyle = '#3b5a8a'; g.fillRect(0, 0, 160, 90); g.fillStyle = '#2a2140'; g.fillRect(0, 60, 160, 30);
      const f = document.createElement('canvas'); f.width = 44; f.height = 44; const h = f.getContext('2d'); h.fillStyle = '#5a3a8a'; h.fillRect(0, 0, 44, 44);
      window.__deliver({ t: 'bubble', text: 'HisWattson posted a video.', stream: false, turn: 14, proactive: true,
        about: { url: 'https://www.youtube.com/watch?v=abc123', title: 'Wattson ranked guide', thumb: c.toDataURL() }, face: { img: f.toDataURL(), name: 'HisWattson' } }); return true; })()`);
    await wait(2200);
    const s = await centre(p.js, '#said'); if (s) click(p.w, s.x - 20, s.y);
    await wait(1300); hover(p.w, 2, 2); await wait(400);
    check('a video opens into the bubble at 436 wide', (await p.js(`!document.getElementById('aboutbox').hidden && Math.round(document.getElementById('bubble').getBoundingClientRect().width)`)) === 436);
    await picture(p, 'f-video');
    check('no page errors (e, f)', !p.errors.length, p.errors.join(' | '));
    p.w.destroy();
  }

  // ---- the jobs from Claude's working mark
  {
    const p = await open(pages, { mark: true });
    await p.js(`window.__fire('onRecall', 'jobs')`); await wait(300);
    check('no Claude jobs: a mark click is just the chat box (the page says so)', (await sent(p.js, 'recalled')).at(-1) === false && !(await visible(p.js)));
    await clearSent(p.js);
    await p.js(`window.__deliver({ t: 'claude.jobs', jobs: [${JSON.stringify(JOB)}, ${JSON.stringify(JOB2)}] })`); await wait(300);
    check('jobs running but the mark not clicked: nothing in the bubble', !(await visible(p.js)) && (await p.js(`document.getElementById('ckjobs').hidden`)) === true);
    await picture(p, 'j-0-mark');
    await p.js(`window.__fire('onRecall', 'jobs')`); await wait(1600);
    const j = await p.js(`(() => ({ bars: document.querySelectorAll('#ckjobs .job').length, open: document.querySelectorAll('#ckjobs .job.open').length, said: document.getElementById('said').textContent, others: document.querySelectorAll('#ckjobs .others').length }))()`);
    check('a mark click opens the jobs in the speech bubble', (await sent(p.js, 'recalled')).at(-1) === true && (await visible(p.js)));
    check('every running job is its own folded bar', j.bars === 2 && j.open === 0 && j.others === 0, JSON.stringify(j));
    check('one line says how many', j.said === 'Claude is on two jobs.', j.said);
    const second = await centre(p.js, '#ckjobs .job:nth-child(2) .row2');
    if (second) click(p.w, second.x, second.y);
    await wait(900);
    check('a click on a bar unfolds its tasks (and docks nothing)', (await p.js(`document.querySelectorAll('#ckjobs .job.open').length`)) === 1 && !(await sent(p.js, 'dockBox')).length);
    await picture(p, 'j-2-two');

    // ---- size holds still: the mouse wanders over the bubble for 20 s while the brain keeps resending the same jobs
    await clearSent(p.js);
    const pts = await p.js(`[...document.querySelectorAll('#ckjobs .job .hd, #ckjobs .job .row2, #ckjobs .ob, #said')].map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })`) as { x: number; y: number }[];
    const t0 = Date.now();
    let i = 0;
    while (Date.now() - t0 < 20_000) {
      const q = pts[i++ % pts.length];
      hover(p.w, q.x + (i % 5) * 3, q.y);
      if (i % 8 === 0) await p.js(`window.__deliver({ t: 'claude.jobs', jobs: [${JSON.stringify(JOB)}, ${JSON.stringify(JOB2)}] })`);
      await wait(250);
    }
    const sizes = (await sent(p.js, 'bubbleSize')).map((s) => `${s.width}x${s.height}`);
    check('20 s of hovering and resent jobs: the bubble never changes size', sizes.length === 0, sizes.join(', '));
    check('still showing after 20 s of his mouse on it', await visible(p.js));

    // ---- click outside: it shrinks away, the jobs stay with the brain (and the mark)
    hover(p.w, 4, 4); await wait(200);
    await p.js(`window.__fire('onDismiss', 'outside')`);
    await wait(260);
    await picture(p, 'j-3-shrink');
    await wait(700);
    check('a click outside shrinks the jobs away', !(await visible(p.js)) && (await p.js(`document.getElementById('ckjobs').hidden`)) === true);
    await clearSent(p.js);
    await p.js(`window.__fire('onRecall', 'jobs')`); await wait(900);
    check('the mark opens them again', (await sent(p.js, 'recalled')).at(-1) === true && (await p.js(`document.querySelectorAll('#ckjobs .job').length`)) === 2);
    // A Claude question waiting outranks the job list on a mark click, even after he clicked out of it (click-out resets).
    await p.js(`window.__fire('onDismiss', 'outside')`); await wait(900);
    await p.js(`window.__deliver({ t: 'claude.wait', items: [${JSON.stringify(QUESTION)}] })`); await wait(900);
    await p.js(`window.__fire('onDismiss', 'outside')`); await wait(900);
    check('a Claude question put away with a click outside leaves the bubble', !(await visible(p.js)));
    await p.js(`window.__fire('onRecall', 'jobs')`); await wait(900);
    check('the mark brings the waiting question back with its rows', (await visible(p.js)) && (await p.js(`document.querySelectorAll('#ckpins .opt').length`)) === 4 && (await p.js(`document.getElementById('ckjobs').hidden`)) === true);
    check('no page errors (jobs)', !p.errors.length, p.errors.join(' | '));
    p.w.destroy();
  }

  // ---- sheet 52 (2026-10-21): hold a job bar to pull it out onto the desktop; it comes back when dropped on Aang
  {
    const p = await open(pages, { mark: true });
    await p.js(`window.__deliver({ t: 'claude.jobs', jobs: [${JSON.stringify(JOB)}, ${JSON.stringify(JOB2)}] })`); await wait(300);
    await p.js(`window.__fire('onRecall', 'jobs')`); await wait(1600);
    const bars = () => p.js(`[...document.querySelectorAll('#ckjobs .job')].filter((e) => !e.classList.contains('ck-leaving')).map((e) => e.dataset.id)`) as Promise<string[]>;
    const skinH = () => p.js(`Math.round(document.getElementById('skin').getBoundingClientRect().height)`) as Promise<number>;
    const before = await bars();
    const h0 = await skinH();
    check('(two bars to start)', before.length === 2, JSON.stringify(before));
    const down = (q: { x: number; y: number }) => p.w.webContents.sendInputEvent({ type: 'mouseDown', x: q.x, y: q.y, button: 'left', clickCount: 1 });
    const up = (q: { x: number; y: number }) => p.w.webContents.sendInputEvent({ type: 'mouseUp', x: q.x, y: q.y, button: 'left', clickCount: 1 });
    const barAt = async () => (await centre(p.js, '#ckjobs .job:nth-child(1) .row2'))!;

    // A short press is still a click (it unfolds), and a press that wanders more than 6 px is called off.
    await clearSent(p.js);
    let at = await barAt();
    down(at); await wait(200);
    check('the gold ring fills while held', (await p.js(`!!document.querySelector('#ckjobs .job .tearring')`)) === true);
    up(at); await wait(700);
    check('let go early: no pop-out, the ring is gone, the click unfolds it', !(await sent(p.js, 'jobPop')).length && (await p.js(`!document.querySelector('.tearring') && document.querySelectorAll('#ckjobs .job.open').length === 1`)) === true);
    at = await barAt(); click(p.w, at.x, at.y); await wait(700);   // folded again, so the sizes compare
    at = await barAt();
    down(at); await wait(150);
    p.w.webContents.sendInputEvent({ type: 'mouseMove', x: at.x + 12, y: at.y }); await wait(600);
    up({ x: at.x + 12, y: at.y }); await wait(300);
    check('moved more than 6 px while holding: called off', !(await sent(p.js, 'jobPop')).length && (await bars()).length === 2);

    // The real hold: half a second, then it comes away.
    await clearSent(p.js);
    at = await barAt();
    const first = before[0]!;
    down(at); await wait(560);
    const popped = await sent(p.js, 'jobPop');
    check("held half a second: jobPop is called with that job's id", popped.length === 1 && popped[0] === first, JSON.stringify(popped));
    await wait(60);
    await picture(p, 'jp-1-mid-collapse');
    up(at); await wait(600);
    const after = await bars();
    const lay = await p.js(`(() => { const s = document.getElementById('ckjobs'); const kids = [...s.children]; const r = s.getBoundingClientRect(), b = kids[0]?.getBoundingClientRect();
      return { kids: kids.length, gap: b ? Math.round(Math.abs(r.height - b.height)) : -1, open: document.querySelectorAll('#ckjobs .job.open').length, said: document.getElementById('said').textContent }; })()`);
    check('that bar left the list', after.length === 1 && !after.includes(first), JSON.stringify(after));
    check('no empty slot: the strip is exactly the one bar left', lay.kids === 1 && lay.gap <= 1, JSON.stringify(lay));
    check('the hold did not unfold anything on its way out', lay.open === 0, JSON.stringify(lay));
    check('the line over the bars counts again', lay.said === 'Claude is on one job.', lay.said);
    const h1 = await skinH();
    check('the bubble shrank to fit', h1 < h0 - 30, `${h0} -> ${h1}`);
    await picture(p, 'jp-2-after');
    // The brain's next list must not bring it back while it is out.
    await p.js(`window.__deliver({ t: 'claude.jobs', jobs: [${JSON.stringify({ ...JOB, percent: 70, tasks: JOB.tasks.slice(0, 4) })}, ${JSON.stringify(JOB2)}] })`); await wait(300);
    check('a fresh job list keeps the popped job out', !(await bars()).includes(first) && (await bars()).length === 1);

    // Dragged near Aang: the bubble's edge glows; moved away: it goes.
    await p.js(`window.__jobpop('near', { id: ${JSON.stringify(first)}, near: true })`); await wait(300);
    const glow = await p.js(`(() => ({ on: document.getElementById('wrap').classList.contains('jpnear'), f: getComputedStyle(document.getElementById('skin')).filter }))()`);
    check("near: a soft glow on the bubble's edge", glow.on && /drop-shadow/.test(glow.f), JSON.stringify(glow));
    await picture(p, 'jp-3-near');
    await p.js(`window.__jobpop('near', { id: ${JSON.stringify(first)}, near: false })`); await wait(100);
    check('not near any more: the glow goes', (await p.js(`!document.getElementById('wrap').classList.contains('jpnear') && getComputedStyle(document.getElementById('skin')).filter === 'none'`)) === true);

    // Dropped on Aang: back in the list, the bubble grows, no placeholder.
    await p.js(`window.__jobpop('near', { id: ${JSON.stringify(first)}, near: true })`);
    await p.js(`window.__jobpop('back', { id: ${JSON.stringify(first)} })`); await wait(600);
    const back = await bars();
    const h2 = await skinH();
    check('put back: it is in the list again', back.length === 2 && back.includes(first), JSON.stringify(back));
    check('put back: no slot or placeholder, only the bars', (await p.js(`[...document.getElementById('ckjobs').children].every((e) => e.classList.contains('job'))`)) === true);
    check('put back: the bubble grew to take it, and the glow is off', h2 > h1 + 30 && (await p.js(`!document.getElementById('wrap').classList.contains('jpnear')`)) === true, `${h1} -> ${h2}`);
    check('put back: the line counts two again', (await p.js(`document.getElementById('said').textContent`)) === 'Claude is on two jobs.');
    await picture(p, 'jp-4-back');

    // Its "needs you" chip: the bubble opens on that job's question.
    await p.js(`window.__fire('onDismiss', 'outside')`); await wait(900);
    await p.js(`window.__deliver({ t: 'claude.wait', items: [${JSON.stringify(QUESTION)}] })`); await wait(600);
    await p.js(`window.__fire('onDismiss', 'outside')`); await wait(900);
    await p.js(`window.__jobpop('ask', { t: 'jobpop.ask', session: 's-waymark', id: 'w-1' })`); await wait(900);
    check("ask: the bubble opens on that job's waiting question", (await visible(p.js)) && (await p.js(`document.querySelectorAll('#ckpins .opt').length`)) === 4);
    check('no page errors (pop-out)', !p.errors.length, p.errors.join(' | '));
    p.w.destroy();
  }

  // ---- clicking Aang: just the chat box; his line only if he said it in the last 5 minutes
  {
    const p = await open(pages, { box: true });
    await p.js(`window.__fire('onRecall', 'recent')`); await wait(300);
    check('nothing said yet: clicking Aang shows only the chat box', (await sent(p.js, 'recalled')).at(-1) === false && !(await visible(p.js)));
    await picture(p, 'click-1-nothing');
    await p.js(`window.__deliver({ t: 'bubble', text: 'Your demo moved to Monday at 2 pm.', stream: false, turn: 40, proactive: true })`); await wait(1500);
    await p.js(`window.__fire('onDismiss', 'esc')`); await wait(900);
    check('(the line went away)', !(await visible(p.js)));
    // Two minutes on: the page's clock is moved, nothing else.
    await p.js(`(() => { const real = Date.now; Date.now = () => real() + 120_000; return true; })()`);
    await clearSent(p.js);
    await p.js(`window.__fire('onRecall', 'recent')`); await wait(1400);
    const r = await p.js(`(() => ({ said: document.getElementById('said').textContent, ago: document.getElementById('wrap').dataset.ago, on: document.getElementById('wrap').classList.contains('ago'), small: document.getElementById('bubble').classList.contains('whisper'), stamp: getComputedStyle(document.getElementById('wrap'), '::after').content }))()`);
    check('said 2 minutes ago: the line comes back, small, with its stamp', (await visible(p.js)) && r.said === 'Your demo moved to Monday at 2 pm.' && r.small && r.on && r.ago === '2 MIN AGO' && /2 MIN AGO/.test(r.stamp), JSON.stringify(r));
    await picture(p, 'click-2-recent');
    await wait(11_000);
    check('it stays while the chat box is open (past the 10 s a whisper gets)', await visible(p.js));
    await p.js(`window.__fire('onDismiss', 'boxclosed')`); await wait(900);
    check('closing the chat box takes the line with it', !(await visible(p.js)) && (await p.js(`document.getElementById('wrap').classList.contains('ago')`)) === false);
    await p.js(`(() => { const real = Date.now; Date.now = () => real() + 4 * 60_000; return true; })()`);
    await clearSent(p.js);
    await p.js(`window.__fire('onRecall', 'recent')`); await wait(500);
    check('said over 5 minutes ago: only the chat box', (await sent(p.js, 'recalled')).at(-1) === false && !(await visible(p.js)));
    check('no page errors (click)', !p.errors.length, p.errors.join(' | '));
    p.w.destroy();
  }

  // ---- 2026-10-21, his report: a hover hello stacked on top of the chat box's recent line. ONE bubble, and a hello is
  // never "something he said in the last 5 minutes".
  const GREET = { t: 'pet.say', text: 'Good evening! What is up?', hold: 4000, greet: true };
  const shownCount = (js: Js) => js(`document.querySelectorAll('#bubble:not([hidden])').length`) as Promise<number>;
  {
    const p = await open(pages, { box: true });
    await p.js(`window.__deliver(${JSON.stringify(GREET)})`); await wait(1500);
    check('(the hover hello shows)', (await visible(p.js)) && (await p.js(`document.getElementById('said').textContent`)) === GREET.text);
    await clearSent(p.js);
    await p.js(`window.__fire('onRecall', 'recent')`); await wait(900);
    check('hello showing + click opens the chat box, nothing said: the hello goes, no bubble', !(await visible(p.js)) && (await shownCount(p.js)) === 0 && (await sent(p.js, 'recalled')).at(-1) === false);
    // A real line, put away; then a hello again; then the click: the real line takes the ONE bubble, the hello is gone.
    await p.js(`window.__deliver({ t: 'bubble', text: 'Your demo moved to Monday at 2 pm.', stream: false, turn: 41, proactive: true })`); await wait(1500);
    await p.js(`window.__fire('onDismiss', 'esc')`); await wait(900);
    await p.js(`window.__deliver(${JSON.stringify(GREET)})`); await wait(1500);
    await clearSent(p.js);
    await p.js(`window.__fire('onRecall', 'recent')`); await wait(1400);
    const r = await p.js(`(() => ({ said: document.getElementById('said').textContent, ago: document.getElementById('wrap').classList.contains('ago'), n: document.querySelectorAll('#bubble:not([hidden])').length }))()`);
    check('hello showing + a real line from just now: exactly one bubble, the real line with its stamp', r.n === 1 && r.said === 'Your demo moved to Monday at 2 pm.' && r.ago, JSON.stringify(r));
    await picture(p, 'click-3-hello-replaced');
    check('no page errors (hello + box)', !p.errors.length, p.errors.join(' | '));
    p.w.destroy();
  }
  {
    const p = await open(pages, { box: true });
    await p.js(`window.__deliver(${JSON.stringify(GREET)})`); await wait(1500);
    await p.js(`window.__fire('onDismiss', 'esc')`); await wait(900);
    await clearSent(p.js);
    await p.js(`window.__fire('onRecall', 'recent')`); await wait(600);
    check('the recent line ignores hellos: only the chat box', (await sent(p.js, 'recalled')).at(-1) === false && !(await visible(p.js)));
    check('no page errors (hello ignored)', !p.errors.length, p.errors.join(' | '));
    p.w.destroy();
  }

  // ---- 2026-10-21: `mark.click` from the pet (via the brain, with the older hook sessions) always shows something.
  {
    const p = await open(pages, { mark: true });
    await p.js(`window.__deliver({ t: 'claude.jobs', jobs: [${JSON.stringify(JOB)}, ${JSON.stringify(JOB2)}] })`); await wait(300);
    await clearSent(p.js);
    await p.js(`window.__deliver({ t: 'mark.click', sessions: [{ project: 'Old', phase: 'working', what: 'x' }] })`); await wait(1600);
    check('mark.click with link jobs: the job bars (the hook sessions are not needed)', (await sent(p.js, 'recalled')).at(-1) === true && (await visible(p.js))
      && (await p.js(`document.querySelectorAll('#ckjobs .job').length`)) === 2 && (await p.js(`!document.querySelector('.dropmsg.sessions')`)) === true);
    check('no page errors (mark, jobs)', !p.errors.length, p.errors.join(' | '));
    p.w.destroy();
  }
  {
    const p = await open(pages, { mark: true });
    const sessions = [{ project: 'AangApp', phase: 'working', what: 'Fix the two bubbles over the chat box' },
      { project: 'Waymark', phase: 'waiting', what: 'Claude needs your permission to use Bash', host: 'mac' }];
    await p.js(`window.__deliver({ t: 'mark.click', sessions: ${JSON.stringify(sessions)} })`); await wait(1500);
    const c = await p.js(`(() => ({ text: document.querySelector('.dropmsg.sessions')?.textContent ?? '', keys: [...document.querySelectorAll('#asks .key')].map((k) => k.firstChild.textContent), plaque: document.querySelector('.who').textContent }))()`);
    check('hook-only sessions: a card in the speech bubble', (await sent(p.js, 'recalled')).at(-1) === true && (await visible(p.js)) && /AangApp/.test(c.text) && /Waymark/.test(c.text), JSON.stringify(c));
    check('each says what it is on, or that it waits on him', /working on .Fix the two bubbles/.test(c.text) && /waiting on you: Claude needs your permission/.test(c.text), c.text);
    check('the helper line about live progress', /Live progress shows for Claude sessions started from now on\./.test(c.text), c.text);
    check('Open in Claude (PC) and Open on the MacBook keys', c.keys.join('|') === 'Open in Claude|Open on the MacBook', JSON.stringify(c.keys));
    await picture(p, 'mark-1-old-sessions');
    await clearSent(p.js);
    // The keys come up while his mouse is on the bubble (as an ask's do).
    const on = await centre(p.js, '#bubble'); if (on) hover(p.w, on.x, on.y);
    await wait(1200);
    const k = await centre(p.js, '#asks .key');
    if (k) { hover(p.w, k.x, k.y); await wait(300); click(p.w, k.x, k.y); }
    await wait(300); hover(p.w, 4, 4); await wait(900);
    const fw = await sent(p.js, 'focusWindow');
    check('Open in Claude brings Claude forward (the old path) and the card goes', JSON.stringify(fw) === '["Claude"]' && !(await visible(p.js)),
      JSON.stringify({ k, fw, shown: await visible(p.js), at: k && await p.js(`document.elementFromPoint(${k.x}, ${k.y})?.outerHTML.slice(0, 120)`) }));
    // The card's keys never hang under the next thing said.
    await p.js(`window.__deliver({ t: 'bubble', text: 'Done with that.', stream: false, turn: 42, proactive: true })`); await wait(1500);
    check('the next line ends the card: no leftover keys or card', (await p.js(`!document.querySelector('.dropmsg.sessions') && !document.querySelector('#asks [data-sessions]') && document.getElementById('said').textContent === 'Done with that.'`)) === true);
    check('no page errors (mark, old sessions)', !p.errors.length, p.errors.join(' | '));
    p.w.destroy();
  }
  {
    const p = await open(pages, { mark: true });
    await p.js(`window.__deliver({ t: 'mark.click', sessions: [] })`); await wait(1200);
    check('nothing at all: one line, never nothing', (await sent(p.js, 'recalled')).at(-1) === true && (await visible(p.js))
      && (await p.js(`document.getElementById('said').textContent`)) === 'Claude isn’t working on anything right now.');
    await picture(p, 'mark-2-nothing');
    check('no page errors (mark, nothing)', !p.errors.length, p.errors.join(' | '));
    p.w.destroy();
  }

  pages.close();
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  setTimeout(() => app.exit(bad ? 1 : 0), 200);
});
