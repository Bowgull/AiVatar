// Sheet 54 (2026-10-21): the wood rim. He picked look B on sheet 53 ("I love the B option but the frame and the corner
// studs need a huge upgrade, they're garbage now ... rework and spice up the wood rim look"). Everything inside the
// bubble stays exactly B; only the rim and the corners change.
//
// Same method as speech-shots.ts (this is its extension): every picture is the REAL bubble page off screen, driven
// through the test stub, with a constructed stylesheet over it (B's paper and padding, untouched) and Aang's own idle
// frame at 1x where the Shell puts him. The rim is new: rim-engine.js reads the balloon's own SVG outline each time
// balloon.js draws it and repaints it as pixel art at exactly 2x, with Samara's wood art and hand-pixelled ornaments
// (rim-takes.js). Injected only for the picture; no product code is touched. A picture maker, not a check.
//
// Run: npx electron test/electron/rim-shots.ts [only-prefix]     pictures -> docs/cockpit/sheet-54/
import { app, BrowserWindow, nativeImage } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { servePages } from '../../src/pageserver.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 300_000).unref();
app.on('window-all-closed', () => { /* the script decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..', '..');
const OUT = path.join(ROOT, 'docs', 'cockpit', 'sheet-54');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ONLY = process.argv.slice(2).filter((a) => !a.endsWith('.ts'));
const wanted = (file: string) => !ONLY.length || ONLY.some((o) => file.startsWith(o));

const SPRITE = 'data:image/png;base64,' + readFileSync(path.join(ROOT, 'assets', 'aang', 'frames', 'idle_0.png')).toString('base64');
const ENGINE = readFileSync(path.join(HERE, 'rim-engine.js'), 'utf8');
const TAKES = readFileSync(path.join(HERE, 'rim-takes.js'), 'utf8');
const W = 940, H = 860;

// ---------------------------------------------------------------- what Aang says (sheet 53's three moments)
const JOB = {
  id: 's-waymark', machine: 'pc', project: 'Waymark', phase: 'working', startedAt: Date.now() - 9 * 60000, prompt: 'Build the route screen',
  tasks: [
    { text: 'Read the map code', status: 'completed' }, { text: 'Add the grid layout', status: 'completed' },
    { text: 'Wire the route list', status: 'in_progress', active: 'Wiring the route list' },
    { text: 'Write the tests', status: 'pending' }, { text: 'Run the checks', status: 'pending' },
  ],
  current: '', percent: 62, etaMs: 6 * 60000, usage: { rateLimits: [{ kind: 'seven_day', percentUsed: 31 }] }, open: 'claude://claude.ai/epitaxy/s-waymark', held: 0,
};
const QUESTION = {
  id: 'w-1', session: 's-waymark', project: 'Waymark', kind: 'question', tool: 'AskUserQuestion', canAlways: false, summary: '',
  questions: [{ question: 'Which layout should the map use?', header: 'Layout', multiSelect: false, options: [
    { label: 'Full-screen map (Recommended)', description: 'The map fills the screen.' },
    { label: 'Split: map and list', description: 'Turns listed underneath.' },
    { label: 'List first', description: 'Turn by turn.' },
  ] }],
};

type Js = (s: string) => Promise<any>;
async function jobBars(js: Js, jobs: object[]) {
  await js(`window.__fire('onCockpit', { open: true, state: { maxH: 700 } })`);
  await wait(500);
  await js(`window.__deliver({ t: 'claude.jobs', jobs: ${JSON.stringify(jobs)} })`);
  await wait(400);
  await js(`(() => { window.__bars = [...document.querySelectorAll('#ckjobs .job')]; for (const b of window.__bars) b.remove(); return window.__bars.length; })()`);
  await js(`window.__fire('onCockpit', { open: false })`);
  await wait(900);
  await js(`(() => { const box = document.createElement('div'); box.className = 'ckjobs injob'; box.append(...window.__bars);
    document.getElementById('scroller').after(box); return true; })()`);
}

interface Moment { key: string; name: string; kind?: string; run: (js: Js) => Promise<void> }
const MOMENTS: Moment[] = [
  { key: 'a-line', name: 'AANG', run: async (js) => {
    await js(`window.__deliver({ t: 'bubble', text: 'Your build finished. Every test passed.', stream: false, turn: 11, proactive: true })`);
    await wait(2600);
  } },
  { key: 'c-choice', name: 'CLAUDE · WAYMARK', kind: 'claude', run: async (js) => {
    await js(`window.__deliver({ t: 'claude.wait', items: [${JSON.stringify(QUESTION)}] })`);
    await wait(1500);
  } },
  { key: 'd-job', name: 'CLAUDE · WAYMARK', kind: 'claude', run: async (js) => {
    await jobBars(js, [JOB]);
    await js(`window.__deliver({ t: 'bubble', text: 'Waymark is wiring the route list.', stream: false, turn: 12, proactive: true, kind: 'claude', project: 'Waymark' }); document.getElementById('bubble').classList.add('wide'); true`);
    await wait(2600);
  } },
];

// ---------------------------------------------------------------- B, exactly as sheet 53 (speech-shots.ts COMMON + LOOKS.B)
const COMMON = `
#bubble .ckpins{margin:0}
#bubble:not(.cockpit) .ckpins .pin,#bubble:not(.cockpit) .ckpins .pin.k-question{background:none;box-shadow:none;padding:0;margin:0}
#bubble .ckpins .ctag{display:block;background:none;padding:0;margin:0 0 8px;font:400 8px/16px Silkscreen,monospace;letter-spacing:1.5px;color:#8a3e1c;text-transform:uppercase}
#bubble .ckpins .ctag img{display:none}
#bubble .ckpins .ctag::before{content:"CLAUDE \\00b7  ";white-space:pre;display:inline-block;padding-left:22px;background:url(art/claude-icon.png) 0 50%/16px 16px no-repeat}
#bubble .ckpins .q{margin:0 0 6px;font:800 17px/1.3 Figtree,sans-serif;color:#1c1208}
#bubble .ckpins .glove{display:flex;flex-direction:column;margin:8px 0 2px}
#bubble .ckpins .opt{display:flex;align-items:flex-start;gap:9px;margin:0 0 7px 30px;padding:8px 11px;border-radius:7px;background:#e6cf9c;box-shadow:inset 0 2px 0 rgba(90,55,20,.22),0 0 0 1.5px #9a7a48;color:#21160a}
#bubble .ckpins .opt .lab{font:700 14.5px/1.3 Figtree,sans-serif;color:#21160a}
#bubble .ckpins .opt .hint{display:block;margin-top:2px;font:500 12.5px/1.4 Figtree,sans-serif;color:#5c4426}
#bubble .ckpins .opt .kc{display:none}
#bubble .ckpins .opt.on{background:#4A2C6E;box-shadow:0 0 0 2px #120A05,0 0 0 3.5px #966EC8}
#bubble .ckpins .opt.on .lab{color:#fffaf0}
#bubble .ckpins .opt.on .hint{color:#e8dcff}
#bubble .ckpins .glove .opt.on::before{left:-32px;top:9px;width:28px;height:18px;margin:0;background:var(--glove) 0 0/28px 18px;image-rendering:pixelated;filter:drop-shadow(1px 1px 0 rgba(0,0,0,.45))}
#bubble .ckpins .opt.other{background:transparent;box-shadow:inset 0 0 0 1.5px #9a7a48;padding:6px 10px}
#bubble .ckpins .opt.other .lab{color:#55307a}
#bubble .ckpins .rec{margin-left:7px;font:800 10px/1 Figtree,sans-serif;letter-spacing:1px;padding:3px 5px 2px;border-radius:4px;background:#1d6b60;color:#fff;box-shadow:0 0 0 1.5px #0b3a33;vertical-align:1px}
#bubble .ckpins .cw{margin-top:4px}
#bubble .injob{margin:10px 0 2px}
#bubble .injob .job{background:rgba(255,250,236,.6);box-shadow:inset 0 0 0 2px rgba(120,80,30,.28),0 2px 0 rgba(90,60,25,.18)}
#bubble.enter > #speaker,#bubble.enter > .who{animation-delay:160ms}
#bubble.enter > #scroller{animation-delay:215ms}
#bubble.enter > *:not(#speaker):not(.who):not(#scroller):not(#asks){animation-delay:270ms}
#bubble.enter > #asks{animation-delay:325ms}
#bubble{padding:19px 22px 19px}
#bubble.whisper{padding:13px 18px 13px}
`;
const B_PAPER = `stops[0]?.setAttribute('stop-color', '#FBF0D8'); stops[1]?.setAttribute('stop-color', '#F2E0BC'); stops[2]?.setAttribute('stop-color', '#E6CD9C');`;
const LOOKS: Record<string, { css: string; deco: string }> = {
  // today's B, unchanged: a 14 px stroke of tray wood clipped inside, a gold hairline, four gold studs
  B: { css: `#skin > path:last-of-type{stroke:#2a1a10;stroke-width:4px}`, deco: `${B_PAPER}
    const defs = svg.querySelector('defs');
    defs.insertAdjacentHTML('beforeend', '<pattern id="wdx' + uid + '" patternUnits="userSpaceOnUse" width="128" height="256"><image href="art/browser/tray.png" width="128" height="256" style="image-rendering:pixelated"/></pattern>');
    const g = mk('g', { 'clip-path': 'url(#' + clip + ')', class: 'dx' });
    g.append(mk('path', { d, fill: 'none', stroke: '#e0a93a', 'stroke-width': 17 }));
    g.append(mk('path', { d, fill: 'none', stroke: 'url(#wdx' + uid + ')', 'stroke-width': 14 }));
    g.append(mk('path', { d, fill: 'none', stroke: 'rgba(255,220,150,.18)', 'stroke-width': 14, transform: 'translate(0,1)' }));
    ink.before(g);
    const r = document.getElementById('bubble').getBoundingClientRect();
    for (const [x, y] of [[6, 6], [r.width - 20, 6], [6, r.height - 20], [r.width - 20, r.height - 20]]) svg.append(mk('image', { href: window.__gem, x, y, width: 14, height: 14, class: 'dx', style: 'image-rendering:pixelated' }));
  ` },
};
// The four takes: B's paper, B's padding; the SVG's own hard shadow and ink line give way to the pixel rim.
for (const t of ['R1', 'R2', 'R3', 'R4']) LOOKS[t] = {
  css: `#skin > path:nth-of-type(2){display:none} #skin > path:last-of-type{stroke:none}`,
  deco: `${B_PAPER} window.__rim.paint(window.__TAKES.${t}, svg, d, document.getElementById('bubble'));`,
};

// ---------------------------------------------------------------- the stage (speech-shots.ts)
function stage() {
  const fx = W - 300, fy = H - 222;
  return { fx, fy, bubbleRight: fx + 96, bubbleBottom: fy + 80, head: { x: fx + 112, y: fy + 96 } };
}
// A rim drawn round B's paper is E art pixels bigger all round, so the bubble sits that much further from Aang (up and
// left): the rim's outer edge lands where B's ink line was and the tail keeps its real length. (In the app: the Shell's
// bubble offsets grow by the rim, nothing else.)
const STAGE_CSS = (s: ReturnType<typeof stage>, g = 0) => `
html,body{background:#191b24 !important}
body{background:radial-gradient(900px 500px at 15% 5%, rgba(80,96,140,.30), transparent 60%),radial-gradient(700px 500px at 95% 100%, rgba(120,70,110,.22), transparent 60%),linear-gradient(180deg,#1c1f2b,#151720) !important}
.wrap{margin:0 ${W - s.bubbleRight + g}px ${H - s.bubbleBottom + g}px 14px !important}
.stg{position:fixed;pointer-events:none;image-rendering:pixelated}
`;
const PIX = `
const pix = (map, pal, px) => { const c = document.createElement('canvas'); c.width = map[0].length * px; c.height = map.length * px; const g = c.getContext('2d');
  map.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x * px, y * px, px, px); } })); return c; };
const G1 = ['....OOOO......', '...OWWWWOOOOO.', '.OOOWWWWWWWWWO', 'OCCKWWWLLLLLLO', 'OCCKWWWSOOOOO.', 'OCCKWWWWLO....', '.OOOLWWSO.....', '...OOLLO......', '....OOO.......'];
document.documentElement.style.setProperty('--glove', 'url(' + pix(G1, { O: '#2a1a10', W: '#fffaf0', L: '#d9d2e4', S: '#9f97b4', C: '#f3e2b8', K: '#c98c14' }, 2).toDataURL() + ')');
const GEM = ['...O...', '..OHO..', '.OHFFO.', 'OHFFFSO', '.OFFSO.', '..OSO..', '...O...'];
window.__gem = pix(GEM, { O: '#2a1a10', H: '#ffe7a6', F: '#ffc43c', S: '#a8741a' }, 2).toDataURL();
`;

interface Scene { look: string; name?: string; kind?: string; run: (js: Js) => Promise<void> }
async function open(pages: { origin: string }, o: Scene) {
  const w = new BrowserWindow({ width: W, height: H, show: false, frame: false, useContentSize: true,
    webPreferences: { preload: path.join(HERE, 'cockpit-stub.cjs'), contextIsolation: false, sandbox: false, offscreen: true } });
  w.setPosition(-6000, 100); w.showInactive();
  const errors: string[] = [];
  w.webContents.on('console-message', (e) => { const m = e as unknown as { message?: string; level?: string }; if (m.level === 'error') errors.push(String(m.message)); });
  await w.loadURL(`${pages.origin}/bubble.html`);
  await wait(700);
  const js: Js = (s) => w.webContents.executeJavaScript(s, true);
  const s = stage();
  const look = LOOKS[o.look];
  await js(ENGINE + '\n' + TAKES + '\n;true');
  await js(`Promise.all(['band.png', 'tray.png'].map((n) => window.__rim.loadTex(n))).then(() => true)`);
  await js(`new Promise((ok) => { const t = () => (window.__rim.balloonPath ? ok(true) : setTimeout(t, 20)); t(); })`);
  // his head in the balloon's own coordinates, as bubble.js paintSkin works it out
  await js(`window.__rimHead = (b) => ({ x: ${s.head.x} - b.left, y: ${s.head.y} - b.top }); true`);
  const g = o.look === 'B' ? 0 : (await js(`window.__TAKES.${o.look}.E`)) * 2;
  await js(`(() => {
    ${PIX}
    const st = new CSSStyleSheet(); st.replaceSync(${JSON.stringify(STAGE_CSS(s, g))});
    const lk = new CSSStyleSheet(); lk.replaceSync(${JSON.stringify(COMMON + look.css)});
    document.adoptedStyleSheets = [st, lk];
    const add = (src, x, y, cls) => { const i = document.createElement('img'); i.src = src; i.className = 'stg ' + (cls || ''); i.style.left = x + 'px'; i.style.top = y + 'px'; document.body.append(i); return i; };
    add(${JSON.stringify(SPRITE)}, ${s.fx}, ${s.fy}, 'aang');
    const wrap = document.getElementById('wrap');
    wrap.dataset.name = ${JSON.stringify(o.name ?? 'AANG')}; wrap.dataset.kind = ${JSON.stringify(o.kind ?? '')};
    const NS = 'http://www.w3.org/2000/svg';
    const mk = (tag, a) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); return e; };
    const svg = document.getElementById('skin');
    const deco = () => {
      if (!svg.firstElementChild || svg.querySelector('.dx, .dxa')) return;
      const paths = [...svg.children].filter((n) => n.tagName === 'path');
      const ink = paths[paths.length - 1]; if (!ink) return;
      const d = ink.getAttribute('d'), clip = svg.querySelector('clipPath').id, grad = svg.querySelector('linearGradient')?.id;
      const uid = clip.slice(2), stops = svg.querySelectorAll('linearGradient stop');
      if (!grad) return;
      svg.append(mk('g', { class: 'dxa' }));
      ${look.deco}
    };
    new MutationObserver(deco).observe(svg, { childList: true });
    window.__fire('onAim', { x: ${s.head.x}, y: ${s.head.y}, flip: false });
    return true;
  })()`);
  await wait(100);
  return { w, js, errors, g };
}

const LAYOUT = `(() => {
  const R = (e) => { if (!e) return null; const q = e.getBoundingClientRect(); return q.width > 2 && q.height > 2 ? { x: q.left, y: q.top, w: q.width, h: q.height } : null; };
  const bub = document.getElementById('bubble');
  return { bubble: bub.hidden ? null : R(bub), skin: bub.hidden ? null : R(document.getElementById('skin')), rim: R(document.querySelector('.rimimg')),
    aang: R(document.querySelector('.stg.aang')) };
})()`;
type Box = { x: number; y: number; w: number; h: number } | null;
function cropOf(L: Record<string, any>, pad = 28) {
  const rs = [L.skin, L.aang].filter(Boolean) as { x: number; y: number; w: number; h: number }[];
  const a = Math.min(...rs.map((q) => q.x)), b = Math.min(...rs.map((q) => q.y)), c = Math.max(...rs.map((q) => q.x + q.w)), d = Math.max(...rs.map((q) => q.y + q.h));
  const x = Math.max(0, Math.floor(a) - pad), y = Math.max(0, Math.floor(b) - pad);
  return { x, y, width: Math.min(W - x, Math.ceil(c - x) + pad), height: Math.min(H - y, Math.ceil(d - y) + 8) };
}
function rel(L: Record<string, any>, r: { x: number; y: number; width: number; height: number }) {
  const m = (q: Box) => (q ? { x: Math.round(q.x - r.x), y: Math.round(q.y - r.y), w: Math.round(q.w), h: Math.round(q.h) } : null);
  const o: Record<string, unknown> = { w: r.width, h: r.height };
  for (const k of Object.keys(L)) o[k] = m(L[k]);
  return o;
}
/** A close-up: a piece of the capture at exactly 4x, nearest neighbour (every pixel a 4x4 block, nothing smoothed). */
function zoom4(img: Electron.NativeImage, r: { x: number; y: number; width: number; height: number }) {
  const c = img.crop(r), sz = c.getSize(), src = c.toBitmap(), k = 4;
  const out = Buffer.alloc(sz.width * k * sz.height * k * 4);
  for (let y = 0; y < sz.height * k; y++) for (let x = 0; x < sz.width * k; x++) {
    const s = ((Math.floor(y / k) * sz.width) + Math.floor(x / k)) * 4, d = (y * sz.width * k + x) * 4;
    src.copy(out, d, s, s + 4);
  }
  return nativeImage.createFromBitmap(out, { width: sz.width * k, height: sz.height * k }).toPNG();
}

const SHOTS: Record<string, unknown> = {};
async function shot(pages: { origin: string }, file: string, o: Scene, zooms = false) {
  if (!wanted(file)) return;
  const { w, js, errors, g } = await open(pages, o);
  await o.run(js);
  const L = await js(LAYOUT);
  const full = await w.webContents.capturePage();
  const r = cropOf(L);
  writeFileSync(path.join(OUT, file + '.png'), full.crop(r).toPNG());
  SHOTS[file] = rel(L, r);
  if (zooms && L.bubble) {
    const b = L.bubble;
    // the top-left corner, and the bottom-right where the tail leaves the body
    const corner = { x: Math.round(b.x) - g - 8, y: Math.round(b.y) - g - 8, width: 64, height: 64 };
    const tail = { x: Math.round(b.x + b.w) + g - 120, y: Math.round(b.y + b.h) + g - 44, width: 150, height: 96 };
    writeFileSync(path.join(OUT, file.replace(/-a-line$/, '') + '-zoom-corner.png'), zoom4(full, corner));
    writeFileSync(path.join(OUT, file.replace(/-a-line$/, '') + '-zoom-tail.png'), zoom4(full, tail));
  }
  console.log('picture: ' + file + (errors.length ? '  (page errors: ' + errors.slice(0, 3).join(' | ') + ')' : ''));
  w.destroy();
}

app.whenReady().then(async () => {
  mkdirSync(OUT, { recursive: true });
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const prev = path.join(OUT, 'shots.js');
  if (ONLY.length && existsSync(prev)) Object.assign(SHOTS, JSON.parse(readFileSync(prev, 'utf8').replace(/^window\.SHOTS = /, '').replace(/;\s*$/, '')));
  for (const L of ['R1', 'R2', 'R3', 'R4', 'B']) for (const m of MOMENTS) {
    await shot(pages, `${L}-${m.key}`, { look: L, name: m.name, kind: m.kind, run: m.run }, m.key === 'a-line');
  }
  writeFileSync(prev, 'window.SHOTS = ' + JSON.stringify(SHOTS) + ';\n');
  pages.close();
  setTimeout(() => app.exit(0), 300);
});
