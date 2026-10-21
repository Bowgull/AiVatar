// Sheet 53 (2026-10-21): the living speech bubble. His rejection of the wooden cockpit ("it doesn't make sense that Aang
// would have a full wooden speech bubble", "I prefer the chat box being separate from the bubble") sends us back to ONE
// speech bubble off his head that grows for whatever he is saying, with the typing box its own thing under him.
//
// Every picture is the REAL bubble page (bubble.html + bubble.css + bubble.js with the cockpit closed, the one bubble) and
// the REAL typing box (input.html), driven off screen through the test stub exactly as the main process drives them. A
// look is a constructed stylesheet over the real page (its lock forbids inline <style>) plus a small decorator that adds
// strokes to the balloon's own SVG after balloon.js draws it (the rim of B, the inner line of C). The bubble page is also
// the stage: a dark desktop behind it, Aang's own idle frame at 1x where the Shell puts him (anchor.ts), the typing box's
// own capture where the Shell opens it, and Claude's working mark drawn from the pet's own pixel map (ClaudeMarks.cs; the
// pet draws it in its own window, so it cannot be captured from a page). A picture maker, not a check.
//
// Run: npx electron test/electron/speech-shots.ts [only-prefix]     pictures -> docs/cockpit/sheet-53/
import { app, BrowserWindow, nativeImage } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { servePages } from '../../src/pageserver.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 540_000).unref();
app.on('window-all-closed', () => { /* the script decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..', '..');
const OUT = path.join(ROOT, 'docs', 'cockpit', 'sheet-53');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ONLY = process.argv.slice(2).filter((a) => !a.endsWith('.ts'));
const wanted = (file: string) => !ONLY.length || ONLY.some((o) => file.startsWith(o));

const SPRITE = 'data:image/png;base64,' + readFileSync(path.join(ROOT, 'assets', 'aang', 'frames', 'idle_0.png')).toString('base64');
const W = 940, H = 860;

// ---------------------------------------------------------------- what Aang says
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
const day = new Date();
const at = (h: number, m = 0) => { const d = new Date(day); d.setHours(h, m, 0, 0); return d.toISOString(); };
const BRIEF = {
  day: 'Tuesday, October 21', weather: { words: 'sunny', low: 4, high: 13 },
  parts: [{ part: 'morn', sky: 'sun', temp: 6 }, { part: 'aftn', sky: 'sun', temp: 13 }, { part: 'eve', sky: 'cloud', temp: 8 }],
  events: [{ start: at(14), end: at(15), title: 'Interview with Acme', where: 'Google Meet' }, { start: at(18, 30), title: 'Dinner with Dana' }],
  unread: [{ from: 'Dana Smith', subject: 'Friday demo', why: 'Asked if Friday still works', at: at(8, 12) }],
  jobsNew: 2, week: 0.31,
};

type Js = (s: string) => Promise<any>;
/** The pointer over a spot of this off-screen page only (never his real mouse). */
const hover = (w: BrowserWindow, x: number, y: number) => w.webContents.sendInputEvent({ type: 'mouseMove', x, y });
async function hoverBubble(js: Js, w: BrowserWindow) {
  const p = await js(`(() => { const r = document.getElementById('bubble').getBoundingClientRect(); return { x: Math.round(r.left + 30), y: Math.round(r.top + 20) }; })()`) as { x: number; y: number };
  hover(w, p.x, p.y);
}
/** Draw the real job bars (claudejobs.js barOf), lift them out, and put them in the one bubble. */
async function jobBars(js: Js, jobs: object[], o: { second?: boolean; unfold?: number } = {}) {
  await js(`window.__fire('onCockpit', { open: true, state: { maxH: 700 } })`);
  await wait(500);
  await js(`window.__deliver({ t: 'claude.jobs', jobs: ${JSON.stringify(jobs)} })`);
  await wait(400);
  if (o.second) { await js(`document.querySelector('#ckjobs [data-track]')?.click(); true`); await wait(300); }
  if (o.unfold !== undefined) { await js(`document.querySelectorAll('#ckjobs .job')[${o.unfold}]?.click(); true`); await wait(400); }
  await js(`(() => { window.__bars = [...document.querySelectorAll('#ckjobs .job')]; for (const b of window.__bars) b.remove(); return window.__bars.length; })()`);
  await js(`window.__fire('onCockpit', { open: false })`);
  await wait(900);
  await js(`(() => { const box = document.createElement('div'); box.className = 'ckjobs injob'; box.append(...window.__bars);
    document.getElementById('scroller').after(box); return true; })()`);
}

interface Moment { key: string; name: string; kind?: string; run: (js: Js, w: BrowserWindow) => Promise<void> }
const MOMENTS: Moment[] = [
  { key: 'a-line', name: 'AANG', run: async (js) => {
    await js(`window.__deliver({ t: 'bubble', text: 'Your build finished. Every test passed.', stream: false, turn: 11, proactive: true })`);
    await wait(2600);
  } },
  { key: 'b-ask', name: 'AANG · ASKING FIRST', run: async (js, w) => {
    await js(`window.__deliver({ t: 'permission', id: 'p-1', question: 'Can I delete the 3 old build folders?', means: 'They take 2.1 GB. Nothing else uses them.' })`);
    await wait(900);
    // The keys come up while his pointer is on the bubble (his rule, 2026-10-11), so the pointer goes there.
    await hoverBubble(js, w);
    await wait(1100);
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
  { key: 'e-brief', name: 'AANG', run: async (js) => {
    await js(`window.__deliver({ t: 'bubble', text: '', stream: false, turn: 13, proactive: true, brief: ${JSON.stringify(BRIEF)} })`);
    await wait(300);
    await js(`window.__light()`);
    await wait(1400);
  } },
  { key: 'f-video', name: 'AANG', run: async (js, w) => {
    await js(`window.__deliver({ t: 'bubble', text: 'HisWattson posted a video.', stream: false, turn: 14, proactive: true,
      about: { url: 'https://www.youtube.com/watch?v=abc123', title: 'Wattson ranked guide', thumb: window.__thumb },
      face: { img: window.__face, name: 'HisWattson' } })`);
    await wait(2200);
    // The one-line door: his first click on the line opens the video into it (sent to this off-screen page only).
    const p = await js(`(() => { const r = document.getElementById('said').getBoundingClientRect(); return { x: Math.round(r.left + 20), y: Math.round(r.top + r.height / 2) }; })()`) as { x: number; y: number };
    w.webContents.sendInputEvent({ type: 'mouseDown', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    w.webContents.sendInputEvent({ type: 'mouseUp', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await wait(1300);
    hover(w, 2, 2);
    await wait(400);
  } },
];

// ---------------------------------------------------------------- the looks
// Shared by all three: what he already picked on sheets 48-51, applied to the one bubble (so the looks differ ONLY in
// the bubble itself). Sheet 51: choices B (each answer its own box, plum pointed-at row, white text, teal BEST, no
// numbers), the slim G1 finger drawn at exactly 2x, the Styled type roles. A Claude card is no longer a card inside the
// bubble: the bubble IS the speech. The brief and a video sit on the bubble's own paper, never dark wood.
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
/* an ask: the kicker, the question, the helper line (sheet 51 Styled) */
#bubble:has(#asks:not([hidden])) .who{font:400 8px/1 Silkscreen,monospace;letter-spacing:1.5px;color:#7a4a00;margin:2px 0 8px}
#bubble:has(#asks:not([hidden])) #said{font:800 17px/1.3 Figtree,sans-serif;color:#1c1208}
#bubble #means{margin:6px 0 0;font:500 13.5px/1.45 Figtree,sans-serif;color:#5c4426}
/* a job in the bubble: the 45f bar, on the bubble's own paper */
#bubble .injob{margin:10px 0 2px}
#bubble .injob .job{background:rgba(255,250,236,.6);box-shadow:inset 0 0 0 2px rgba(120,80,30,.28),0 2px 0 rgba(90,60,25,.18)}
/* the brief on the bubble's paper */
#bubble .briefcard{margin:0}
.lt-date small{color:#8a5a10}
.lt-date b{color:#3a1e08;text-shadow:none;font-size:25px}
.lt-date span{color:#6a5236}
.lt-lamp{background:rgba(120,80,30,.10);box-shadow:inset 0 0 0 2px rgba(120,80,30,.22)}
.lt-part i{color:#8a6a3a}
.lt-part b{color:#3a2410}
.lt-part.now{background:rgba(255,236,190,.7);box-shadow:inset 0 0 0 1.5px rgba(160,110,40,.45)}
.lt-slip{background:rgba(255,250,236,.62);box-shadow:inset 0 0 0 2px rgba(120,80,30,.22),0 2px 0 rgba(90,60,25,.16)}
.lt-meter{color:#8a6a3a}
.lt-meter u{background:#e7d5ad;border-color:#a8865a}
/* motion: what comes in arrives one piece after another, 55 ms apart, after the grow has started (sheet 53's rule) */
#bubble.enter > #speaker,#bubble.enter > .who{animation-delay:160ms}
#bubble.enter > #scroller{animation-delay:215ms}
#bubble.enter > *:not(#speaker):not(.who):not(#scroller):not(#asks){animation-delay:270ms}
#bubble.enter > #asks{animation-delay:325ms}
/* a video: a 16:9 picture at the long-reply width */
#bubble.widest:has(#aboutbox:not([hidden])){width:436px}
`;

const LOOKS: Record<string, { css: string; deco: string }> = {
  // A: today's parchment comic bubble, refined. Lighter paper, the ink line in dark wood and a touch thinner, a softer drop.
  A: { css: `
#skin > path:nth-of-type(2){fill:rgba(40,20,5,.28)}
#skin > path:last-of-type{stroke:#3d2614;stroke-width:3.5px}
`, deco: `
    stops[0]?.setAttribute('stop-color', '#FFF8EA'); stops[1]?.setAttribute('stop-color', '#F8EBCF'); stops[2]?.setAttribute('stop-color', '#EEDBB2');
  ` },
  // B: the same parchment wearing a thin rim of Samara's pixel wood with a gold hairline and four gold studs (a touch of Lantern).
  B: { css: `
#bubble{padding:19px 22px 19px}
#bubble.whisper{padding:13px 18px 13px}
#skin > path:last-of-type{stroke:#2a1a10;stroke-width:4px}
`, deco: `
    stops[0]?.setAttribute('stop-color', '#FBF0D8'); stops[1]?.setAttribute('stop-color', '#F2E0BC'); stops[2]?.setAttribute('stop-color', '#E6CD9C');
    const defs = svg.querySelector('defs');
    defs.insertAdjacentHTML('beforeend', '<pattern id="wdx' + uid + '" patternUnits="userSpaceOnUse" width="128" height="256"><image href="art/browser/tray.png" width="128" height="256" style="image-rendering:pixelated"/></pattern>');
    const g = mk('g', { 'clip-path': 'url(#' + clip + ')', class: 'dx' });
    g.append(mk('path', { d, fill: 'none', stroke: '#e0a93a', 'stroke-width': 17 }));
    g.append(mk('path', { d, fill: 'none', stroke: 'url(#wdx' + uid + ')', 'stroke-width': 14 }));
    g.append(mk('path', { d, fill: 'none', stroke: 'rgba(255,220,150,.18)', 'stroke-width': 14, transform: 'translate(0,1)' }));
    ink.before(g);
    const r = document.getElementById('bubble').getBoundingClientRect(), s = svg.getBoundingClientRect();
    const bw = r.width, bh = r.height;
    for (const [x, y] of [[6, 6], [bw - 20, 6], [6, bh - 20], [bw - 20, bh - 20]]) svg.append(mk('image', { href: window.__gem, x, y, width: 14, height: 14, class: 'dx', style: 'image-rendering:pixelated' }));
  ` },
  // C: a game dialogue box that is still a speech bubble: flat cream, a chunky dark-wood outline with a second line inside,
  // and a name tab on the top edge saying who is talking (N64 / Stardew).
  C: { css: `
#bubble{padding:22px 20px 17px}
#bubble.whisper{padding:17px 16px 12px}
#skin > path:nth-of-type(2){fill:rgba(20,10,0,.5);transform:translate(0,4px)}
#skin > path:last-of-type{stroke:#2a1a10;stroke-width:6px}
#skin g:not(.dx) path{opacity:.45}
.wrap:has(#bubble:not([hidden]))::before{content:attr(data-name);position:absolute;left:18px;top:-12px;z-index:4;white-space:nowrap;
  font:400 9px/1 Silkscreen,monospace;letter-spacing:2px;color:#fff1cf;padding:7px 12px 6px;border-radius:7px;
  background:#3a2414 url(art/browser/tray.png) 0 0/128px 256px;image-rendering:pixelated;box-shadow:0 0 0 2px #2a1a10,0 3px 0 #1a0f08,inset 0 1px 0 rgba(255,220,150,.25)}
.wrap[data-kind="claude"]:has(#bubble:not([hidden]))::before{color:#ffc6a6}
#bubble .speaker.claude,#bubble .ckpins .ctag{display:none}
#bubble .ckpins .opt{background:#f1e1bd}
#bubble:has(#asks:not([hidden])) .who{display:none}
`, deco: `
    stops[0]?.setAttribute('stop-color', '#FFF9EC'); stops[1]?.setAttribute('stop-color', '#FBF0D9'); stops[2]?.setAttribute('stop-color', '#F3E2C0');
    const g = mk('g', { 'clip-path': 'url(#' + clip + ')', class: 'dx' });
    g.append(mk('path', { d, fill: 'none', stroke: '#b98d55', 'stroke-width': 21 }));
    g.append(mk('path', { d, fill: 'none', stroke: 'url(#' + grad + ')', 'stroke-width': 16 }));
    ink.before(g);
  ` },
};

// ---------------------------------------------------------------- the stage
/** Where things sit, in page pixels. f = Aang's 224 px frame's top-left (anchor.ts frameOf), at 1x. */
function stage(withBox: boolean, gap = 12) {
  const fx = W - 300, fy = H - 222;
  const boxTop = fy + 74;                                        // anchor.ts INPUT_FROM_SPRITE.top (the window's top)
  const bubbleRight = fx + 96;                                   // anchor.ts BUBBLE_FROM_SPRITE.right
  const bubbleBottom = withBox ? boxTop + 4 - gap : fy + 80;     // the box is drawn 4 px into its window
  return { fx, fy, bubbleRight, bubbleBottom, boxLeft: fx + 72 - 256 - 6 - 22, boxTop, head: { x: fx + 112, y: fy + 96 },
    mark: { cx: fx + 113, bottom: fy + 78 - 9 } };                // ClaudeMarks.AboveHead: art centre, 9 px over his head
}

const STAGE_CSS = (s: ReturnType<typeof stage>) => `
html,body{background:#191b24 !important}
body{background:radial-gradient(900px 500px at 15% 5%, rgba(80,96,140,.30), transparent 60%),radial-gradient(700px 500px at 95% 100%, rgba(120,70,110,.22), transparent 60%),linear-gradient(180deg,#1c1f2b,#151720) !important}
.wrap{margin:0 ${W - s.bubbleRight}px ${H - s.bubbleBottom}px 14px !important}
.stg{position:fixed;pointer-events:none;image-rendering:pixelated}
`;

// Sheet 51's G1 finger and gem, palette-letter maps drawn whole-pixel at 2x; Claude's working mark from ClaudeMarks.cs at 3x.
const PIX = `
const pix = (map, pal, px) => { const c = document.createElement('canvas'); c.width = map[0].length * px; c.height = map.length * px; const g = c.getContext('2d');
  map.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x * px, y * px, px, px); } })); return c; };
const G1 = ['....OOOO......', '...OWWWWOOOOO.', '.OOOWWWWWWWWWO', 'OCCKWWWLLLLLLO', 'OCCKWWWSOOOOO.', 'OCCKWWWWLO....', '.OOOLWWSO.....', '...OOLLO......', '....OOO.......'];
document.documentElement.style.setProperty('--glove', 'url(' + pix(G1, { O: '#2a1a10', W: '#fffaf0', L: '#d9d2e4', S: '#9f97b4', C: '#f3e2b8', K: '#c98c14' }, 2).toDataURL() + ')');
const GEM = ['...O...', '..OHO..', '.OHFFO.', 'OHFFFSO', '.OFFSO.', '..OSO..', '...O...'];
window.__gem = pix(GEM, { O: '#2a1a10', H: '#ffe7a6', F: '#ffc43c', S: '#a8741a' }, 2).toDataURL();
// ClaudeMarks.Draw: O dark wood, H face mixed 55% to white, F the face, S mixed 35% to (40,20,10), a 40% shadow one art pixel down-right.
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
  const png = (await w.webContents.capturePage()).toPNG();
  w.destroy();
  boxPng = 'data:image/png;base64,' + png.toString('base64');
}

/** Points of interest per picture (relative to its crop), for the sheet's arrows. */
const SHOTS: Record<string, unknown> = {};

interface Scene { look?: string; name?: string; kind?: string; box?: boolean; mark?: boolean; gap?: number; recent?: string; run: (js: Js, w: BrowserWindow) => Promise<void> }
async function open(pages: { origin: string }, o: Scene) {
  const w = new BrowserWindow({ width: W, height: H, show: false, frame: false, useContentSize: true,
    webPreferences: { preload: path.join(HERE, 'cockpit-stub.cjs'), contextIsolation: false, sandbox: false, offscreen: true } });
  w.setPosition(-6000, 100); w.showInactive();
  const errors: string[] = [];
  w.webContents.on('console-message', (e) => { const m = e as unknown as { message?: string; level?: string }; if (m.level === 'error') errors.push(String(m.message)); });
  await w.loadURL(`${pages.origin}/bubble.html`);
  await wait(700);
  const js: Js = (s) => w.webContents.executeJavaScript(s, true);
  const s = stage(Boolean(o.box), o.gap);
  const look = LOOKS[o.look ?? 'A'];
  await js(`(() => {
    ${PIX}
    const st = new CSSStyleSheet(); st.replaceSync(${JSON.stringify(STAGE_CSS(s))});
    const lk = new CSSStyleSheet(); lk.replaceSync(${JSON.stringify(COMMON + look.css + (o.recent ? RECENT_CSS : ''))});
    document.adoptedStyleSheets = [st, lk];
    const add = (src, x, y, cls) => { const i = document.createElement('img'); i.src = src; i.className = 'stg ' + (cls || ''); i.style.left = x + 'px'; i.style.top = y + 'px'; document.body.append(i); return i; };
    add(${JSON.stringify(SPRITE)}, ${s.fx}, ${s.fy}, 'aang');
    ${o.box ? `add(${JSON.stringify(boxPng)}, ${s.boxLeft}, ${s.boxTop}, 'box');` : ''}
    ${o.mark ? `add(window.__mark, ${s.mark.cx} - window.__markW / 2, ${s.mark.bottom} - window.__markH, 'mark');` : ''}
    const wrap = document.getElementById('wrap');
    wrap.dataset.name = ${JSON.stringify(o.name ?? 'AANG')}; wrap.dataset.kind = ${JSON.stringify(o.kind ?? '')};
    ${o.recent ? `wrap.dataset.ago = ${JSON.stringify(o.recent)};` : ''}
    // The look's own strokes, added each time balloon.js draws the shape (it rewrites the SVG on every size change).
    const NS = 'http://www.w3.org/2000/svg';
    const mk = (tag, a) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); return e; };
    const svg = document.getElementById('skin');
    const deco = () => {
      if (!svg.firstElementChild || svg.querySelector('.dx, .dxa')) return;
      const paths = [...svg.children].filter((n) => n.tagName === 'path');
      const ink = paths[paths.length - 1]; if (!ink) return;
      const d = ink.getAttribute('d'), clip = svg.querySelector('clipPath').id, grad = svg.querySelector('linearGradient')?.id;
      const uid = clip.slice(2), stops = svg.querySelectorAll('linearGradient stop');
      if (!grad) return;              // the wood (lantern) skin: left as it is
      svg.append(mk('g', { class: 'dxa' }));
      ${look.deco}
    };
    new MutationObserver(deco).observe(svg, { childList: true });
    // The brief on the bubble's paper: the wood skin goes (bubble.js puts it on for the brief), the shape is drawn again.
    window.__light = () => { const b = document.getElementById('bubble'); b.classList.remove('lantern'); window.__fire('onAim', { x: ${s.head.x}, y: ${s.head.y} + 0.5, flip: false }); };
    // A video's picture and a channel's face are data the brain fetched; here they are drawn on the spot.
    const c = document.createElement('canvas'); c.width = 160; c.height = 90; const g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, 90); sky.addColorStop(0, '#3b5a8a'); sky.addColorStop(1, '#e0905a'); g.fillStyle = sky; g.fillRect(0, 0, 160, 90);
    g.fillStyle = '#2a2140'; g.beginPath(); g.moveTo(0, 70); g.lineTo(40, 40); g.lineTo(70, 62); g.lineTo(110, 30); g.lineTo(160, 66); g.lineTo(160, 90); g.lineTo(0, 90); g.fill();
    g.fillStyle = '#7fe0ff'; g.fillRect(96, 46, 6, 14); g.fillStyle = '#ffe28c'; g.fillRect(20, 14, 10, 10);
    window.__thumb = c.toDataURL();
    const f = document.createElement('canvas'); f.width = 44; f.height = 44; const h = f.getContext('2d');
    h.fillStyle = '#5a3a8a'; h.fillRect(0, 0, 44, 44); h.fillStyle = '#9fe7ff'; h.fillRect(12, 10, 20, 22); h.fillStyle = '#2a1a40'; h.fillRect(16, 16, 4, 4); h.fillRect(24, 16, 4, 4);
    window.__face = f.toDataURL();
    window.__fire('onAim', { x: ${s.head.x}, y: ${s.head.y}, flip: false });
    return true;
  })()`);
  await wait(100);
  return { w, js, errors };
}

// The line he said a moment ago, shown small over the chat box: its age as a tiny stamp on the bubble's corner.
const RECENT_CSS = `
.wrap.tail::after{content:attr(data-ago);position:absolute;left:auto;bottom:auto;width:auto;height:auto;border:none;transform:none;right:14px;top:-9px;z-index:4;font:400 8px/1 Silkscreen,monospace;letter-spacing:1.5px;color:#5c4426;
  padding:4px 6px 3px;border-radius:5px;background:#fbf0d8;box-shadow:0 0 0 1.5px #9a7a48}
`;

/** Where everything is now, for the crop and the sheet's arrows. */
const LAYOUT = `(() => {
  const R = (e) => { if (!e) return null; const q = e.getBoundingClientRect(); return q.width > 2 && q.height > 2 ? { x: q.left, y: q.top, w: q.width, h: q.height } : null; };
  const bub = document.getElementById('bubble');
  return { bubble: bub.hidden ? null : R(bub), skin: bub.hidden ? null : R(document.getElementById('skin')),
    aang: R(document.querySelector('.stg.aang')), box: R(document.querySelector('.stg.box')), mark: R(document.querySelector('.stg.mark')),
    opt: R(document.querySelector('.ckpins .opt.on')), keys: R(document.getElementById('asks')), bar: R(document.querySelector('.injob .job')),
    bars: [...document.querySelectorAll('.injob .job')].map(R) };
})()`;
type Box = { x: number; y: number; w: number; h: number } | null;
function cropOf(L: Record<string, any>, pad = 24) {
  const rs = [L.skin, L.aang, L.box, L.mark].filter(Boolean) as { x: number; y: number; w: number; h: number }[];
  const a = Math.min(...rs.map((q) => q.x)), b = Math.min(...rs.map((q) => q.y)), c = Math.max(...rs.map((q) => q.x + q.w)), d = Math.max(...rs.map((q) => q.y + q.h));
  const x = Math.max(0, Math.floor(a) - pad), y = Math.max(0, Math.floor(b) - pad);
  return { x, y, width: Math.min(W - x, Math.ceil(c - x) + pad), height: Math.min(H - y, Math.ceil(d - y) + 8) };
}
function rel(L: Record<string, any>, r: { x: number; y: number; width: number; height: number }) {
  const m = (q: Box) => (q ? { x: Math.round(q.x - r.x), y: Math.round(q.y - r.y), w: Math.round(q.w), h: Math.round(q.h) } : null);
  const o: Record<string, unknown> = { w: r.width, h: r.height };
  for (const k of Object.keys(L)) o[k] = Array.isArray(L[k]) ? L[k].map(m) : m(L[k]);
  return o;
}

async function shot(pages: { origin: string }, file: string, o: Scene) {
  if (!wanted(file)) return;
  const { w, js, errors } = await open(pages, o);
  await o.run(js, w);
  const L = await js(LAYOUT);
  const r = cropOf(L);
  writeFileSync(path.join(OUT, file + '.png'), (await w.webContents.capturePage(r)).toPNG());
  SHOTS[file] = rel(L, r);
  console.log('picture: ' + file + (errors.length ? '  (page errors: ' + errors.slice(0, 3).join(' | ') + ')' : ''));
  w.destroy();
}

// ---------------------------------------------------------------- section 2: real frames of one grow and one shrink
// balloon motion runs on performance.now (bubble.js growTo); the page's clock is held still and stepped, so each frame
// is the real bubble at that exact millisecond. CSS fades are paused and stepped with it.
const CLOCK = `(() => {
  const base = performance.now(); window.__t = 0;
  performance.now = () => base + window.__t;
  window.__step = (dt) => { window.__t += dt; for (const a of document.getAnimations()) { a.pause(); const c = (a.__c ?? 0) + dt; a.currentTime = c; a.__c = c; } };
  return true;
})()`;
async function growStrip(pages: { origin: string }) {
  if (!wanted('grow')) return;
  mkdirSync(path.join(OUT, 'grow'), { recursive: true });
  const { w, js } = await open(pages, { look: 'A', run: async () => {} });
  await js(`window.__deliver({ t: 'bubble', text: 'Your build finished.', stream: false, turn: 21, proactive: true })`);
  await wait(2200);
  await hoverBubble(js, w);                         // his pointer is on it, so the question's keys show as it grows
  await wait(500);
  await js(CLOCK);
  const frames: { t: number; img: Electron.NativeImage; L: Record<string, any>; phase: string }[] = [];
  let t = 0;
  const grab = async (phase: string) => { const L = await js(LAYOUT); frames.push({ t, phase, L, img: await w.webContents.capturePage() }); };
  await grab('rest');
  await js(`window.__deliver({ t: 'permission', id: 'p-9', question: 'Can I delete the 3 old build folders?', means: 'They take 2.1 GB.' }); const b = document.getElementById('bubble'); b.classList.remove('enter'); void b.offsetWidth; b.classList.add('enter'); true`);
  await wait(60);
  for (let k = 0; k <= 13; k++) { if (k) { await js(`window.__step(40)`); t += 40; await wait(60); } await grab('grow'); }
  for (let k = 0; k < 4; k++) { await js(`window.__step(60)`); t += 60; await wait(50); }
  await grab('question');
  await js(`window.__deliver({ t: 'bubble', text: 'Done. 2.1 GB back.', stream: false, turn: 22, proactive: true })`);
  await wait(60);
  for (let k = 0; k <= 10; k++) { if (k) { await js(`window.__step(40)`); t += 40; await wait(60); } await grab('shrink'); }
  for (let k = 0; k < 6; k++) { await js(`window.__step(80)`); t += 80; await wait(50); }
  await wait(1200);                                 // the words fade in on their own clock
  await grab('rest2');
  // one crop for every frame: the union of all of them
  const all = frames.map((f) => cropOf(f.L));
  const x = Math.min(...all.map((r) => r.x)), y = Math.min(...all.map((r) => r.y));
  const r = { x, y, width: Math.max(...all.map((q) => q.x + q.width)) - x, height: Math.max(...all.map((q) => q.y + q.height)) - y };
  const list: { f: string; t: number; phase: string; w: number; h: number }[] = [];
  frames.forEach((f, i) => {
    const name = `f${String(i).padStart(2, '0')}.png`;
    writeFileSync(path.join(OUT, 'grow', name), f.img.crop(r).toPNG());
    list.push({ f: 'grow/' + name, t: f.t, phase: f.phase, w: Math.round(f.L.bubble?.w ?? 0), h: Math.round(f.L.bubble?.h ?? 0) });
  });
  SHOTS.grow = { w: r.width, h: r.height, frames: list };
  console.log('picture: grow strip, ' + frames.length + ' frames');
  w.destroy();
}

// ---------------------------------------------------------------- section 4: the working mark opens the jobs
async function jobsMark(pages: { origin: string }) {
  await shot(pages, 'j-0-mark', { look: 'A', mark: true, run: async () => { await wait(300); } });
  await shot(pages, 'j-1-one', { look: 'A', mark: true, kind: 'claude', name: 'CLAUDE', run: async (js) => {
    await jobBars(js, [JOB]);
    await js(`window.__deliver({ t: 'bubble', text: 'Claude is on one job.', stream: false, turn: 31, proactive: true, kind: 'claude', project: 'Waymark' }); document.getElementById('bubble').classList.add('wide'); true`);
    await wait(2400);
  } });
  await shot(pages, 'j-2-two', { look: 'A', mark: true, kind: 'claude', name: 'CLAUDE', run: async (js) => {
    await jobBars(js, [JOB, JOB2], { second: true, unfold: 1 });
    await js(`window.__deliver({ t: 'bubble', text: 'Claude is on two jobs.', stream: false, turn: 32, proactive: true, kind: 'claude', project: 'Waymark' }); document.getElementById('bubble').classList.add('wide'); true`);
    await wait(2400);
  } });
  // Click outside: the bubble shrinks away (the real 340 ms shrink, caught half way) and the mark stays.
  await shot(pages, 'j-3-shrink', { look: 'A', mark: true, kind: 'claude', name: 'CLAUDE', run: async (js) => {
    await jobBars(js, [JOB, JOB2], { second: true });
    await js(`window.__deliver({ t: 'bubble', text: 'Claude is on two jobs.', stream: false, turn: 33, proactive: true, kind: 'claude', project: 'Waymark', hold: 3000 }); document.getElementById('bubble').classList.add('wide'); true`);
    await wait(2200);
    await js(CLOCK);
    await wait(3400);                              // its time is up: content out (160 ms), then the shrink starts, held at 0
    await js(`window.__step(80)`);
    await wait(120);
  } });
}

// ---------------------------------------------------------------- run
app.whenReady().then(async () => {
  mkdirSync(OUT, { recursive: true });
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  await boxPicture(pages);
  const prev = path.join(OUT, 'shots.js');
  if (ONLY.length && existsSync(prev)) Object.assign(SHOTS, JSON.parse(readFileSync(prev, 'utf8').replace(/^window\.SHOTS = /, '').replace(/;\s*$/, '')));
  // 1: three looks across the same six moments
  for (const L of ['A', 'B', 'C']) for (const m of MOMENTS) await shot(pages, `look-${L}-${m.key}`, { look: L, name: m.name, kind: m.kind, run: m.run });
  // 2: grow and shrink
  await growStrip(pages);
  // 3: clicking Aang
  await shot(pages, 'click-1-nothing', { look: 'A', box: true, run: async () => { await wait(300); } });
  await shot(pages, 'click-2-recent', { look: 'A', box: true, recent: '2 MIN AGO', run: async (js) => {
    await js(`window.__deliver({ t: 'whisper', text: 'Your demo moved to Monday at 2 pm.' })`);
    await wait(1500);
  } });
  // 4: where Claude jobs live
  await jobsMark(pages);
  writeFileSync(prev, 'window.SHOTS = ' + JSON.stringify(SHOTS) + ';\n');
  pages.close();
  setTimeout(() => app.exit(0), 300);
});
