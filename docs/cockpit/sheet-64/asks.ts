// Sheet 64 (2026-10-22): "I can't really tell when it's a question or a permission ... just looks like plain text."
// Every kind of ask that lands in Aang's speech bubble, drawn by the REAL bubble page (bubble.html + bubble.css +
// bubble.js, look B, S2 wood rim, cockpit closed), fed exactly as the main process feeds it (window.__deliver through the
// test stub). TODAY is the page untouched. The options A / B / C are a constructed stylesheet over the real page (its
// lock forbids inline <style>) plus a small decorator that adds the kind tag and the quoted line to the real markup, so
// the only thing that differs between rows is the kind's mark. Aang's own idle frame at 1x beside it. Never on his
// screen. A picture maker, not a check.
//
// Run (from src/Shell): npx electron ../../docs/cockpit/sheet-64/asks.ts [only-prefix]
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { servePages } from '../../../src/Shell/src/pageserver.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 480_000).unref();
app.on('window-all-closed', () => { /* the script decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..');
const SHELL = path.join(ROOT, 'src', 'Shell');
const STUB = path.join(SHELL, 'test', 'electron', 'cockpit-stub.cjs');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ONLY = process.argv.slice(2).filter((a) => !a.endsWith('.ts'));
const wanted = (f: string) => !ONLY.length || ONLY.some((o) => f.startsWith(o));
const SPRITE = 'data:image/png;base64,' + readFileSync(path.join(ROOT, 'assets', 'aang', 'frames', 'idle_0.png')).toString('base64');
const W = 940, H = 900;
const fx = W - 300, fy = H - 240, head = { x: fx + 112, y: fy + 96 };

// ---------------------------------------------------------------- what lands
type Kind = 'question' | 'ok' | 'plan' | null;
interface Moment { key: string; kind: Kind; who: string; quote?: string; keys?: [string, string, string?][]; msg: object; claude?: boolean; hover?: boolean; drop?: string[]; samara?: boolean }
const CPERM = { id: 'toolu_01perm', session: 's-sounds', project: 'Waymark', kind: 'permission', tool: 'Bash', summary: 'Waymark wants to run the route tests on this PC.', input: '{"command":"npm test -- routes"}', canAlways: true };
const CQ = { id: 'w-1', session: 's-waymark', project: 'Waymark', kind: 'question', tool: 'AskUserQuestion', canAlways: false, summary: '',
  questions: [{ question: 'Which layout should the map use?', header: 'Layout', multiSelect: false, options: [
    { label: 'Full-screen map (Recommended)', description: 'The map fills the screen.' },
    { label: 'Split: map and list', description: 'Turns listed underneath.' },
  ] }] };
const CPLAN = { id: 'toolu_09plan', session: 's-waymark', project: 'Waymark', kind: 'plan', tool: 'ExitPlanMode', summary: '', plain: 'Waymark has a plan for the route screen.',
  plan: '1. Add a grid for the map\n2. Wire the route list under it\n3. Write the tests\n4. Run the checks', canAlways: false };
const SAMARA = { t: 'plan', id: 'sp-1', steps: [{ text: 'x' }], samara: { from: 'Waymark', task: 'Check the Forever patch notes', sites: [{ site: 'forever.warcraft.com' }, { site: 'wowhead.com', login: true }], steps: ['Open the patch notes', 'Read the class changes', 'Write you a short list'], wont: "won't post or buy anything" } };

const M: Moment[] = [
  { key: 'a-plain', kind: null, who: '', msg: { t: 'bubble', text: 'Your build finished. Every test passed.', stream: false, turn: 11, proactive: true } },
  { key: 'b-aangq', kind: 'question', who: 'Aang', msg: { t: 'choice', id: 'c-1', question: 'What should I play while you raid?', options: [{ label: 'Lo-fi, no words' }, { label: 'Your Ragnaros playlist' }] } },
  { key: 'c-claudeq', kind: 'question', who: 'Claude · Waymark', claude: true, msg: { t: 'claude.wait', items: [CQ] } },
  { key: 'd-aangok', kind: 'ok', who: 'Aang', hover: true, quote: 'AangApp\\build: old-1, old-2, old-3', keys: [['Allow', 'A', 'p'], ['Not this time', 'Z']],
    msg: { t: 'permission', id: 'p-1', question: 'Can I delete the 3 old build folders?', means: 'They take 2.1 GB. Nothing else uses them.' } },
  { key: 'e-claudeok', kind: 'ok', who: 'Claude · Waymark', claude: true, quote: 'npm test -- routes', keys: [['Allow', 'A', 'p'], ['Always', 'X'], ['Not this time', 'Z'], ['No, and...', 'S']], msg: { t: 'claude.wait', items: [CPERM] } },
  { key: 'f-plan', kind: 'plan', who: 'Claude · Waymark', claude: true, msg: { t: 'claude.wait', items: [CPLAN] } },
  // Today only: the rest of the inventory, as it lands now.
  { key: 'g-aangplan', kind: 'plan', who: 'Aang', hover: true, msg: { t: 'plan', id: 'pl-1', steps: [{ text: 'Open Samara on the patch notes' }, { text: 'Read the class changes' }, { text: 'Email you the list', gate: 'ask' }] } },
  { key: 'h-fact', kind: 'question', who: 'Aang', hover: true, msg: { t: 'fact.ask', id: 'f-1', text: 'You main a Shadow Priest in Forever.', fromDoc: 'your notes', left: 0 } },
  { key: 'i-consent', kind: 'ok', who: 'Aang', hover: true, msg: { t: 'consent', id: 'k-1', wanted: 'Opus', text: 'plan my week' } },
  { key: 'j-backup', kind: 'ok', who: 'Aang', hover: true, msg: { t: 'backup.ask', id: 'b-1', days: 4, changed: 12 } },
  { key: 'k-send', kind: 'question', who: 'Aang', hover: true, keys: [['Ask about it', 'A', 'p'], ['Keep as a note', 'S']], msg: { t: 'permission', id: 'send-1', question: 'Got it. Ask about it, or keep it as a note?', remembers: 'x' } },
  { key: 'l-samara', kind: 'plan', who: 'Claude · Waymark', samara: true, hover: true, msg: SAMARA },
  { key: 'm-timer', kind: null, who: 'Aang', hover: true, msg: { t: 'timer.done', id: 't-1', total: 600000, label: 'Tea' } },
];
const OPTION_KEYS = ['a-plain', 'b-aangq', 'c-claudeq', 'd-aangok', 'e-claudeok', 'f-plan'];

// ---------------------------------------------------------------- the options
// Mark colours, decided 2026-10-21: question lavender, needs-you blue, plan cream scroll. On parchment each gets a dark
// ink of itself for words (lavender and cream are too pale to read on paper) and the light colour for fills and glow.
const C = {
  question: { mark: '#b07cff', ink: '#5a2d9c', soft: 'rgba(176,124,255,.20)', word: 'QUESTION' },
  ok: { mark: '#7cc4ff', ink: '#1d5a8c', soft: 'rgba(124,196,255,.24)', word: 'NEEDS YOUR OK' },
  plan: { mark: '#f3e2b8', ink: '#7a5418', soft: 'rgba(214,170,80,.22)', word: 'PLAN TO OK' },
};
// The pixel icons, 7 x 7 art pixels drawn at 2x: '#' the kind's colour, 'o' the outline.
const ICON: Record<string, string[]> = {
  question: ['.ooooo.', 'o##o##o', '.oo.##o', '...##o.', '...oo..', '...##..', '...oo..'],
  ok: ['.ooo...', 'o###o..', 'o#o#ooo', 'o###o##', '.ooo.o#', '.....o.', '.......'],
  plan: ['ooooooo', 'o#####o', '.o###o.', '.o#o#o.', '.o###o.', 'o#####o', 'ooooooo'],
};
function iconSvg(kind: string, fill: string, ink: string) {
  const rows = ICON[kind]; let d1 = '', d2 = '';
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') d1 += `M${x} ${y}h1v1h-1z`; if (c === 'o') d2 += `M${x} ${y}h1v1h-1z`; }));
  return `<svg class="kic" viewBox="0 0 7 7" width="14" height="14" shape-rendering="crispEdges"><path d="${d2}" fill="${ink}"/><path d="${d1}" fill="${fill}"/></svg>`;
}
const ICONS = Object.fromEntries((['question', 'ok', 'plan'] as const).map((k) => [k, iconSvg(k, k === 'plan' ? '#c98c14' : '#fffaf0', '#2a1606')]));

/** Shared by A, B and C: the quoted line, the who, the keys per kind. Only the kind's mark itself differs. */
const SHARED = `
.kq{margin:8px 0 2px;padding:7px 10px 7px 12px;border-radius:6px;background:rgba(255,250,236,.7);box-shadow:inset 3px 0 0 var(--kmark),inset 0 0 0 1.5px rgba(120,80,30,.25);
  font:600 12.5px/1.4 Consolas,ui-monospace,monospace;color:#2a1a0c;word-break:break-word}
.kq small{display:block;font:400 7.5px/1 Silkscreen,monospace;letter-spacing:1.4px;color:#7a5a30;margin-bottom:5px}
#bubble .kwho{font:400 8px/1 Silkscreen,monospace;letter-spacing:1.5px;color:#7a5a30}
#bubble .kwho img{width:14px;height:14px;vertical-align:-3px;margin-right:5px;image-rendering:auto;border-radius:3px}
#bubble[data-kind=ok] #asks .key.primary,#bubble[data-kind=ok] .ckpins .key.primary{background:linear-gradient(180deg,#9ad2ff,#5aa6e0)!important;color:#0b2238!important}
#bubble[data-kind] .exact,#bubble[data-kind] .ckpins .cw{opacity:.8}
/* Aang's own question gets the same answer boxes as a Claude question (sheet 51 B, already in bubble.css for .ckpins) */
#bubble[data-kind] #opts{display:flex;flex-direction:column;margin:10px 0 2px}
#bubble[data-kind] #opts .opt{display:flex;align-items:flex-start;gap:9px;margin:0 0 7px 30px;padding:8px 11px;border-radius:7px;background:#e6cf9c;box-shadow:inset 0 2px 0 rgba(90,55,20,.22),0 0 0 1.5px #9a7a48;color:#21160a}
#bubble[data-kind] #opts .opt .lab{font:700 14.5px/1.3 Figtree,sans-serif;color:#21160a}
#bubble[data-kind] #opts .opt .kc{display:none}
#bubble[data-kind] #opts .opt.on{background:#4A2C6E;box-shadow:0 0 0 2px #120A05,0 0 0 3.5px #966EC8}
#bubble[data-kind] #opts .opt.on .lab{color:#fffaf0}
#bubble[data-kind] #opts .opt.on::before{left:-32px;top:9px;width:28px;height:18px;margin:0;background:var(--glove) 0 0/28px 18px;image-rendering:pixelated;filter:drop-shadow(1px 1px 0 rgba(0,0,0,.45))}
#bubble[data-kind] #opts .opt.other{background:transparent;box-shadow:inset 0 0 0 1.5px #9a7a48;padding:6px 10px}
#bubble[data-kind] #opts .opt.other .lab{color:#55307a}
#bubble[data-kind] #said{font:800 17px/1.3 Figtree,sans-serif;color:#1c1208}
`;
/** A: a small tag at the top-left of the paper, in the kind's colour with its pixel icon; the paper's edge tinted faintly. */
const OPT_A = SHARED + `
.ktag{display:flex;align-items:center;gap:8px;margin:-4px 0 9px}
.ktag .kt{display:inline-flex;align-items:center;gap:6px;padding:5px 10px 5px 6px;border-radius:5px;background:var(--kmark);box-shadow:0 0 0 1.5px #2a1606,0 2px 0 rgba(42,22,6,.35);
  font:400 10px/1 Silkscreen,monospace;letter-spacing:1.5px;color:#1a0f05}
#bubble[data-kind] > .who,#bubble[data-kind] .ckpins .ctag{display:none!important}
#bubble[data-kind]{box-shadow:inset 0 3px 0 var(--kline),inset 3px 0 0 var(--kline),inset 0 0 16px var(--ksoft)}
`;
/** B: the same tag, and the wood rim and its tail carry the colour instead of the paper's edge (tintSkin). */
const OPT_B = OPT_A + `
#bubble[data-kind]{box-shadow:none}
`;
/** C: a slim strip across the top of the paper in the kind's colour: icon, the kind, and who is asking. */
const OPT_C = SHARED + `
#bubble[data-kind] > .who,#bubble[data-kind] .ckpins .ctag{display:none!important}
.kstrip{display:flex;align-items:center;gap:7px;margin:-19px -22px 12px;padding:7px 14px 6px 12px;background:var(--kmark);box-shadow:inset 0 -1.5px 0 rgba(42,22,6,.55);
  font:400 9px/1 Silkscreen,monospace;letter-spacing:1.5px;color:#1a0f05;border-radius:10px 10px 0 0}
.kstrip .kwho{color:#2a1606;opacity:.75}
.kstrip .kwho{margin-left:auto}
`;

// ---------------------------------------------------------------- v2 (his notes on v1: "I like the tag carrying the
// colour but it needs a bit of refinement, the tag above is hard to read"; and "questions that require buttons should
// have the buttons surface after a second or two of a hover over the comic bubble"). A is kept; the tag is rebuilt to
// be read: Figtree 800 at 13.5 px in sentence case (no letter-spaced pixel caps), a 9 x 9 icon at 2x, and two ways to
// colour it. The who and the "Exactly this" label leave Silkscreen for Figtree too.
const DEEP = { question: '#6b3fb8', ok: '#1f6fb0', plan: '#8a5c0e' }; // white on these: 6.9, 5.3 and 5.8 to 1
const WORD2 = { question: 'Question', ok: 'Needs your OK', plan: 'Plan to OK' };
const ICON9: Record<string, string[]> = {
  question: ['..#####..', '.##...##.', '.##...##.', '.....##..', '....##...', '....##...', '.........', '....##...', '....##...'],
  ok: ['.........', '.........', '.###.....', '##.##....', '#...#####', '##.##.#.#', '.###..#.#', '.........', '.........'],
  plan: ['#########', '#.......#', '#.#.###.#', '#.......#', '#.#.###.#', '#.......#', '#.#.###.#', '#.......#', '#########'],
};
const icon9 = (kind: string, fill: string) => {
  let d = ''; ICON9[kind].forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') d += `M${x} ${y}h1v1h-1z`; }));
  return `<svg class="kic" viewBox="0 0 9 9" width="18" height="18" shape-rendering="crispEdges"><path d="${d}" fill="${fill}"/></svg>`;
};
const READABLE = `
.kq small{font:700 11.5px/1 Figtree,sans-serif;letter-spacing:0;color:#7a5a30;margin-bottom:4px}
#bubble .kwho{font:700 12.5px/1 Figtree,sans-serif;letter-spacing:0;color:#6a4a22}
#bubble .kwho img{width:16px;height:16px;vertical-align:-3px}
.ktag{gap:10px;margin:-4px 0 10px}
.ktag .kt{gap:7px;padding:5px 12px 5px 7px;border-radius:7px;font:800 13.5px/18px Figtree,sans-serif;letter-spacing:.1px}
.ktag .kic{width:18px;height:18px;flex:none}
#bubble .ckpins .cw{font:700 12px/1 Figtree,sans-serif;letter-spacing:0;color:#7a5a30}
`;
/** Tag 1: the kind's colour, deepened, with white words and a white icon. */
const TAG_1 = OPT_A + READABLE + `.ktag .kt{background:var(--kdeep);color:#fff;box-shadow:0 0 0 1.5px #2a1606,0 2px 0 rgba(42,22,6,.35),inset 0 1.5px 0 rgba(255,255,255,.22)}`;
/** Tag 2: the kind's own light colour, dark ink words and icon, a firmer outline. */
const TAG_2 = OPT_A + READABLE + `.ktag .kt{background:var(--kmark);color:#1a0f05;box-shadow:0 0 0 2px #2a1606,0 2px 0 rgba(42,22,6,.35),inset 0 1.5px 0 rgba(255,255,255,.45)}`;
/** The hover rule, drawn with tag 1. rest: the answers are not in the page yet (the bubble is fitted without them).
 * mid: 90 ms into the spring, each row or key a little lower and fainter than the one before it (40 ms stagger). */
const HOVER = TAG_1 + `
#bubble.krest #opts,#bubble.krest #asks,#bubble.krest .ckpins .ckeys,#bubble.krest .ckpins .glove{display:none!important}
#bubble.kmid :is(#opts .opt,#asks .key,.ckpins .ckeys .key){transition:none}
#bubble.kmid :is(#opts .opt,#asks .key,.ckpins .ckeys .key):nth-child(1){transform:translateY(2px);opacity:.92}
#bubble.kmid :is(#opts .opt,#asks .key,.ckpins .ckeys .key):nth-child(2){transform:translateY(4px);opacity:.62}
#bubble.kmid :is(#opts .opt,#asks .key,.ckpins .ckeys .key):nth-child(3){transform:translateY(6px);opacity:.34}
#bubble.kmid :is(#opts .opt,#asks .key,.ckpins .ckeys .key):nth-child(n+4){transform:translateY(8px);opacity:.16}
#bubble.kmid #opts .opt.on::before{opacity:0}
.kcur{position:fixed;z-index:50;pointer-events:none;image-rendering:pixelated}
`;
/** The Windows arrow, at its real size: 'o' outline, '#' white. */
const CURSOR = ['o', 'oo', 'o#o', 'o##o', 'o###o', 'o####o', 'o#####o', 'o######o', 'o#######o', 'o########o', 'o#####ooooo', 'o##o##o', 'o#o.o##o', 'oo..o##o', 'o....o##o', '.....o##o', '......oo'];
const cursorSvg = (() => { let a = '', b = ''; CURSOR.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'o') a += `M${x} ${y}h1v1h-1z`; if (c === '#') b += `M${x} ${y}h1v1h-1z`; }));
  return `<svg viewBox="0 0 11 17" width="11" height="17" shape-rendering="crispEdges"><path d="${a}" fill="#000"/><path d="${b}" fill="#fff"/></svg>`; })();

// ---------------------------------------------------------------- v3 (his notes on v2, 2026-10-22: "64 is great" for
// tag 1, but "what happened to the frames? I liked how it was before with each bubble frame holding the same colour";
// "do these colours match the icons we created?"; "Claude's words and Exactly this - is this overkill?"; and a way to
// get TO Claude per ask, then: the who-is-asking label itself is the door, no separate link). V3 = tag 1 + the B rim
// tint, every colour lifted from src/Body/ClaudeMarks.cs ColorOf: the rim, the paper wash and the tag's icon are the
// mark's own face colour exactly; the tag's ground is that same hue, deepened so white words read (the plan's cream
// can't carry white, so it is the cream's own hue taken dark: #76602a, white 6.0 : 1). "Claude's words" is gone;
// "Exactly this" stays on OKs only. On a Claude ask the who (icon + "Claude · Waymark") is a link to that session.
const DEEP3 = { question: '#6b3fb8', ok: '#1f6fb0', plan: '#76602a' };
const V3 = TAG_1 + `
#bubble[data-kind]{box-shadow:inset 0 0 14px var(--ksoft)}
#bubble[data-kind] .ckpins .cw,#bubble[data-kind] .ckpins .cwbox{display:none!important}
#bubble .kwho.door{cursor:pointer;border-radius:5px;padding:3px 5px;margin:-3px -5px;transition:transform .12s,background .12s}
#bubble .kwho.door:hover,#bubble .kwho.door.khov{color:#3a2410;background:rgba(120,80,30,.10);transform:translateY(-1px);text-decoration:underline;text-decoration-thickness:1.5px;text-underline-offset:3px}
`;
/** The Windows link hand, at its real size: 'o' outline, '#' white. The hot spot is the fingertip (top of column 4). */
const HAND = ['....oo..........', '...o##o.........', '...o##o.........', '...o##o.........', '...o##o.........', '...o##ooo.......', '...o##o##ooo....',
  '...o##o##o##oo..', 'oo.o##o##o##o#o.', 'o#oo##########o.', 'o##o##########o.', '.o############o.', '..o###########o.', '..o###########o.',
  '...o#########o..', '...o#########o..', '....o#######o...', '....o#######o...', '....ooooooooo...'];
const handSvg = (() => { let a = '', b = ''; HAND.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'o') a += `M${x} ${y}h1v1h-1z`; if (c === '#') b += `M${x} ${y}h1v1h-1z`; }));
  return `<svg viewBox="0 0 16 19" width="16" height="19" style="margin-left:-4px" shape-rendering="crispEdges"><path d="${a}" fill="#000"/><path d="${b}" fill="#fff"/></svg>`; })();
type Phase = 'rest' | 'hover' | 'mid' | 'in' | 'door';
type Variant = { name: string; css: string; style: 'A' | 'B' | 'C' | 'T1' | 'T2' | 'V3' | null; phase?: Phase; keys?: string[] };
const V2_KEYS = ['b-aangq', 'e-claudeok', 'f-plan'];
const V3_KEYS = ['b-aangq', 'c-claudeq', 'd-aangok', 'e-claudeok', 'f-plan'];
const VARIANTS: Variant[] = [
  { name: 'today', css: '', style: null },
  { name: 'A', css: OPT_A, style: 'A' },
  { name: 'B', css: OPT_B, style: 'B' },
  { name: 'C', css: OPT_C, style: 'C' },
  { name: 'T1', css: TAG_1, style: 'T1', keys: V2_KEYS },
  { name: 'V3', css: V3, style: 'V3', keys: V3_KEYS },
  { name: 'Door', css: V3 + HOVER.slice(TAG_1.length), style: 'V3', phase: 'door', keys: ['e-claudeok'] },
  ...(['rest', 'hover', 'mid', 'in'] as Phase[]).map((p) => ({ name: 'H' + p, css: V3 + HOVER.slice(TAG_1.length), style: 'V3' as const, phase: p, keys: V2_KEYS })),
];

/** The decorator: the kind on #bubble, its tag or strip, the quoted line, the new key words. Run again after a re-fit. */
function decorate(m: Moment, v: Variant) {
  if (!v.style || !m.kind) return 'true';
  const c = C[m.kind];
  const v3 = v.style === 'V3', rd = v.style === 'T1' || v.style === 'T2' || v3;
  return `(() => {
    const b = document.getElementById('bubble'), wrap = document.getElementById('wrap');
    b.dataset.kind = ${JSON.stringify(m.kind)};
    for (const [k, val] of [['--kline', ${JSON.stringify(m.kind === 'plan' ? 'rgba(201,140,20,.55)' : c.mark + 'aa')}], ['--kmark', ${JSON.stringify(c.mark)}], ['--kink', ${JSON.stringify(c.ink)}], ['--ksoft', ${JSON.stringify(c.soft)}], ['--kdeep', ${JSON.stringify((v3 ? DEEP3 : DEEP)[m.kind])}]]) wrap.style.setProperty(k, val);
    if (${JSON.stringify(v3)}) wrap.style.setProperty('--ksoft', ${JSON.stringify(c.mark + '2e')});
    const who = ${JSON.stringify(m.who)}, claude = who.startsWith('Claude');
    const whoEl = () => { const s = document.createElement(claude && ${JSON.stringify(v3)} ? 'a' : 'span'); s.className = 'kwho' + (claude && ${JSON.stringify(v3)} ? ' door' : ''); if (claude) { s.title = 'Open this session in Claude'; const i = document.createElement('img'); i.src = 'art/claude-icon.png'; s.append(i); } s.append(${JSON.stringify(rd)} ? who : who.toUpperCase()); return s; };
    if (!b.querySelector('.ktag, .kstrip')) {
      const style = ${JSON.stringify(v.style)};
      const t = document.createElement('div');
      if (style === 'C') { t.className = 'kstrip'; const cs = getComputedStyle(b); t.style.margin = '-' + cs.paddingTop + ' 0 12px -' + cs.paddingLeft; t.style.width = 'calc(100% + ' + (parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)) + 'px)'; t.style.boxSizing = 'border-box'; t.innerHTML = ${JSON.stringify(ICONS[m.kind])}; t.append(${JSON.stringify(c.word)}, whoEl()); }
      else { t.className = 'ktag'; const k = document.createElement('span'); k.className = 'kt';
        k.innerHTML = ${JSON.stringify(v3 ? icon9(m.kind, c.mark) : v.style === 'T1' ? icon9(m.kind, '#fff') : v.style === 'T2' ? icon9(m.kind, '#1a0f05') : ICONS[m.kind])};
        k.append(${JSON.stringify(rd ? WORD2[m.kind] : c.word)}); t.append(k, whoEl()); }
      b.prepend(t);
      const q = ${JSON.stringify(m.quote ?? '')};
      if (q) { const d = document.createElement('div'); d.className = 'kq'; const sm = document.createElement('small'); sm.textContent = ${JSON.stringify(rd ? 'Exactly this:' : 'EXACTLY THIS')};
        d.append(sm, '\\u201c' + q + '\\u201d');
        const after = b.querySelector('#means:not([hidden])') ?? b.querySelector('.ckpins .q') ?? document.getElementById('scroller'); after.after(d); }
      const keys = ${JSON.stringify(m.keys ?? null)};
      if (keys) {
        const row = b.querySelector('#asks:not([hidden])') ?? b.querySelector('.ckpins .ckeys');
        const bs = [...row.querySelectorAll('button.key')];
        keys.forEach(([label, key, p], i) => { const x = bs[i]; if (!x) return; x.className = 'key sm' + (p ? ' primary' : '');
          if (x.querySelector('.k')) { x.firstChild.textContent = label; x.querySelector('.k').textContent = key; } else x.textContent = label; });
        bs.slice(keys.length).forEach((x) => x.remove());
      }
      document.querySelector('#exact')?.setAttribute('hidden', '');
      if (${JSON.stringify(v.style === 'T1' || v.style === 'T2')}) b.querySelectorAll('.ckpins .cw').forEach((x) => { x.lastChild.textContent = "Claude's words"; });
    }
    return true; })()`;
}
/** B only: the wood rim (and so the tail's wood) washed in the kind's colour. The skin is redrawn on every re-fit, so
 * this goes in last, right before the picture. A filter on balloon.js's own g.rim: the wood's grain stays, tinted. */
function tintSkin(m: Moment, v: Variant) {
  if ((v.style !== 'B' && v.style !== 'V3') || !m.kind) return 'true';
  return `(() => { const sk = document.getElementById('skin'), rim = sk.querySelector('g.rim'); if (!rim) return false;
    const ns = 'http://www.w3.org/2000/svg';
    sk.querySelector('#ktf')?.remove();
    const f = document.createElementNS(ns, 'filter'); f.id = 'ktf'; f.setAttribute('color-interpolation-filters', 'sRGB');
    f.innerHTML = '<feFlood flood-color="${C[m.kind].mark}" flood-opacity="${m.kind === 'plan' ? '.7' : '.5'}" result="c"/><feComposite in="c" in2="SourceGraphic" operator="in" result="t"/>'
      + '<feBlend in="t" in2="SourceGraphic" mode="normal"/>';
    sk.prepend(f); rim.setAttribute('filter', 'url(#ktf)'); rim.classList.add('ktint');
    return true; })()`;
}
app.whenReady().then(async () => {
  const pages = await servePages(path.join(SHELL, 'pages'));
  for (const v of VARIANTS) for (const m of M) {
    if (v.keys ? !v.keys.includes(m.key) : v.style && !OPTION_KEYS.includes(m.key)) continue;
    const file = `${v.name}-${m.key}`;
    if (!wanted(file)) continue;
    const w = new BrowserWindow({ width: W, height: H, show: false, frame: false, useContentSize: true,
      webPreferences: { preload: STUB, contextIsolation: false, sandbox: false, offscreen: true } });
    const errors: string[] = [];
    w.webContents.on('console-message', (e) => { const x = e as unknown as { message?: string; level?: string }; if (x.level === 'error') errors.push(String(x.message)); });
    await w.loadURL(`${pages.origin}/bubble.html`);
    await wait(700);
    const js = (s: string) => w.webContents.executeJavaScript(s, true);
    const css = `html,body{background:#191b24 !important}
body{background:radial-gradient(900px 500px at 15% 5%, rgba(80,96,140,.30), transparent 60%),radial-gradient(700px 500px at 95% 100%, rgba(120,70,110,.22), transparent 60%),linear-gradient(180deg,#1c1f2b,#151720) !important}
.wrap{margin:0 ${W - (fx + 140)}px ${H - (fy + 46)}px 14px !important}
.stg{position:fixed;pointer-events:none;image-rendering:pixelated}` + v.css;
    await js(`(() => { const st = new CSSStyleSheet(); st.replaceSync(${JSON.stringify(css)}); document.adoptedStyleSheets = [st];
      const i = document.createElement('img'); i.src = ${JSON.stringify(SPRITE)}; i.className = 'stg aang'; i.style.left = '${fx}px'; i.style.top = '${fy}px'; document.body.append(i);
      window.__fire('onAim', { x: ${head.x}, y: ${head.y}, flip: false }); return true; })()`);
    await wait(150);
    await js(`window.__deliver(${JSON.stringify(m.msg)}); true`);
    await wait(1200);
    if (m.hover) {
      const p = await js(`(() => { const r = document.getElementById('bubble').getBoundingClientRect(); return { x: Math.round(r.left + 30), y: Math.round(r.top + 20) }; })()`) as { x: number; y: number };
      w.webContents.sendInputEvent({ type: 'mouseMove', x: p.x, y: p.y });
      await wait(1200);
    }
    await js(decorate(m, v));
    if (v.phase === 'rest' || v.phase === 'hover') await js(`(() => { const b = document.getElementById('bubble'); b.classList.add('krest');
      for (const e of [b, ...b.querySelectorAll('*')]) { if (e.style.height) e.style.height = ''; } b.style.maxHeight = ''; return true; })()`);
    // the page re-measures itself only on its own events: a double toggle of a fold it already has (Claude's words, or
    // the exact command) runs its fit() and reportSize(), so the bubble grows to the added tag exactly as it would
    await js(`(() => { const k = document.querySelector('#ckpins .cw') ?? document.querySelector('#exact .exact-key'); if (k) { k.click(); k.click(); } return !!k; })()`);
    await js(`window.dispatchEvent(new Event('resize')); window.__fire('onAim', { x: ${head.x}, y: ${head.y} + 0.5, flip: false }); true`);
    await wait(1400);
    await js(tintSkin(m, v));
    if (v.phase === 'mid') await js(`document.getElementById('bubble').classList.add('kmid'); true`);
    if (v.phase === 'hover') await js(`(() => { const r = document.getElementById('bubble').getBoundingClientRect(); const c = document.createElement('div'); c.className = 'kcur';
      c.innerHTML = ${JSON.stringify(cursorSvg)}; c.style.left = Math.round(r.left + r.width * 0.80) + 'px'; c.style.top = Math.round(r.top + r.height * 0.70) + 'px'; document.body.append(c); return true; })()`);
    if (v.phase === 'door') await js(`(() => { const d = document.querySelector('#bubble .kwho.door'); d.classList.add('khov'); const r = d.getBoundingClientRect(); const c = document.createElement('div'); c.className = 'kcur';
      c.innerHTML = ${JSON.stringify(handSvg)}; c.style.left = Math.round(r.left + r.width * 0.55) + 'px'; c.style.top = Math.round(r.top + r.height * 0.45) + 'px'; document.body.append(c); return true; })()`);
    await wait(200);
    const tinted = await js(`document.querySelectorAll('#skin .ktint').length`);
    if (v.style === 'B' && m.kind && !tinted) console.log('  no tint on ' + file);
    const r = await js(`(() => { const sk = document.getElementById('skin'), a = document.querySelector('.stg.aang');
      const rs = [a.getBoundingClientRect(), sk.getBoundingClientRect()];
      const x0 = Math.min(...rs.map((q) => q.left)) - 16, y0 = Math.min(...rs.map((q) => q.top)) - 16, x1 = Math.max(...rs.map((q) => q.right)) - 40, y1 = Math.max(...rs.map((q) => q.bottom)) - 10;
      return { x: Math.max(0, Math.floor(x0)), y: Math.max(0, Math.floor(y0)), width: Math.ceil(x1 - Math.max(0, x0)), height: Math.ceil(y1 - Math.max(0, y0)) }; })()`);
    const img = await w.webContents.capturePage({ x: r.x, y: r.y, width: Math.min(W - r.x, r.width), height: Math.min(H - r.y, r.height) });
    writeFileSync(path.join(HERE, file + '.png'), img.toPNG());
    console.log(`${file}.png ${JSON.stringify(img.getSize())}${errors.length ? '  page errors: ' + errors.slice(0, 3).join(' | ') : ''}`);
    w.destroy();
  }
  pages.close();
  setTimeout(() => app.exit(0), 200);
});
