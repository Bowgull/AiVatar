// Step 6.12: the bubble's behaviour.
//
// The reveal pace, the collapse thresholds and the skip-versus-expand rule all live in reveal.ts, which
// is tested. This file is the part that needs a screen: measuring real lines of real text, and the
// clicks.
import { Reveal, WORD_MS, hasMore, linesShown, scrolls, summaryOf, streamSummaryOf } from './reveal.js';
import { balloonPath, paintBalloon, PAD_R, PAD_B, DEFAULT_AIM, WIDEST_AFTER_LINES, RIM_G, rimReady, MOUTH_FROM_HEAD } from './balloon.js';
import { HOLD_MS, askFrom } from './asks.js';
import { blocks, shownWords } from './rich.js';
import { find as findEntities } from './entities.js';
import { Scrollback, atTop } from './scrollback.js';
import { buildPaper, openMenu, previewLines, tickCount, paintNote, cleanHtml as cleanNoteHtml } from './notepaper.js';
import { setOwnCats, ownCats, allCats, catColour, ribbon } from './notecats.js';
import { pixIcon, SKIES } from './pixicons.js';
import { paintLookback, linkifyWords, videoShot, linkEl, kindOf, restKinds } from './lookback.js';
import { startTyping } from './cocktype.js';
import { startClaude } from './claudejobs.js';
import { addonsSlip, addonsLine } from './addonslip.js';
import { kindOf as askKind, tagRow, exactBlock, tintRim, KEYS_AFTER_MS } from './askkind.js';

const el = id => document.getElementById(id);
const bubble = el('bubble'), said = el('said'), scroller = el('scroller'), more = el('more');

// Sheet 51's slim G1 finger (his pick), drawn whole-pixel at exactly 2x from its palette map, the same as sheet 53's
// render script draws it; the pointed-at row of a Claude question wears it (bubble.css --glove).
{
  const G1 = ['....OOOO......', '...OWWWWOOOOO.', '.OOOWWWWWWWWWO', 'OCCKWWWLLLLLLO', 'OCCKWWWSOOOOO.', 'OCCKWWWWLO....', '.OOOLWWSO.....', '...OOLLO......', '....OOO.......'];
  const pal = { O: '#2a1a10', W: '#fffaf0', L: '#d9d2e4', S: '#9f97b4', C: '#f3e2b8', K: '#c98c14' };
  const c = document.createElement('canvas'); c.width = G1[0].length * 2; c.height = G1.length * 2;
  const g = c.getContext('2d');
  if (g) G1.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x * 2, y * 2, 2, 2); } }));
  document.documentElement.style.setProperty('--glove', 'url(' + c.toDataURL() + ')');
}
/** Sheet 53 (2026-10-21): the jobs he opened from Claude's working mark are in the bubble (claudejobs.js draws them). */
let jobsOpen = false;
/** Sheet 53: the "N MIN AGO" line that came back with the chat box is showing; it goes when the box does. */
let recentOpen = false;
const wrapEl = el('wrap');
const skin = el('skin');
const working = el('working'), doing = el('doing'), asks = el('asks'), tools = el('tools'), who = el('who');

// Whole words fading in at a fixed pace (sheet 13, Smoother). The full reply is laid out from the first
// frame with the unshown words invisible, so the balloon is sized ONCE for the whole thing and grows
// once, rather than jumping a line at a time as letters tick in.
const reveal = new Reveal(Date.now, { wordMs: WORD_MS });
let expanded = false;
let lineHeight = 23;          // measured below; BubbleView.LineH until then
let turn = null;              // the stored row this reply became, for reachback
// A window this reply is ABOUT - a Claude Code session. The brain sends it as `focus` and clicking
// the reply takes him there, exactly as the C# bubble does (PetWindow: `Hands.Arrange(.., "front")`).
let focusWindow = null;
/** The message is about a Claude session on his MacBook: a click brings Claude forward there. */
let macSession = false;
/** A line the pet says carries its own time on screen (notes 1.8 s, errors 12 s), as the old bubble did. */
let holdOverride = 0;
let asked = '';               // what he last said, shown above the answer
const back = new Scrollback();
let reading = false;          // he has scrolled up into his history; the bubble is a scroll-back now
/**
 * Quiet means he is busy, mute means he never wants Aang speaking up on his own.
 *
 * Neither silences an ANSWER to something he asked: the C# has always drawn those. What they stop is
 * Aang appearing by himself. So a reply still shows while muted, and only a proactive one is held.
 */
let quiet = false, muted = false;
/** Sheet 17: asks that arrived while he was in a game. They come out when he leaves it. */
const heldAsks = [];
/** Leaving the game: anything held comes out now, newest last so the oldest is answered first. */
function releaseHeldAsks() {
  if (!heldAsks.length) return;
  for (const a of heldAsks.splice(0)) queueAsk(a);
  showTopAsk();
}
/** He hid Aang (the Clippy rule): nothing unprompted until he brings him back. The pet says so. */
let petHidden = false;
/** The proactive message the pet is holding for him while he is in a game, kept whole (a brief stays a card). */
let heldMsg = null;
const heldRank = (m) => (m.blocking ? 3 : m.done ? 2 : 1);
/** C4: the jobs strip and the pinned Claude card (claudejobs.js), started with the cockpit below. */
let claude = null;
/** A Claude card is up in the closed bubble: it waits for his answer like any question (never in a game or hidden). */
const claudeHolds = () => Boolean(claude?.waiting() && !quiet && !petHidden);

/** How many lines the text actually takes, measured rather than estimated. */
function lineCount() {
  if (!said.textContent) return 0;
  // 2026-10-22: the comic look sets 22 px lines on short centred bubbles, so the real line height is read each time.
  const lh = parseFloat(getComputedStyle(said).lineHeight);
  if (Number.isFinite(lh) && lh > 0) lineHeight = lh;
  // scrollHeight is the full height whatever the box is clipped to, so this is right even collapsed.
  return Math.max(1, Math.round(said.scrollHeight / lineHeight));
}

/** Clip the text to the right number of lines and decide whether the arrow belongs. */
function fit() {
  // Comic lettering belongs to the message it was worked out for: anything else shown here (a question, a card, the
  // brief) starts plain.
  if (letterGen !== reveal.gen) clearLettering();
  if (kindReady) syncKind();
  const total = lineCount();
  // A summarised answer shows all of whatever is laid out (the short version, or everything), and its
  // key is always there: Show more, then Show less.
  const summarised = shortOf() !== null && !asking;
  const shown = summarised ? total : linesShown(total, expanded);
  // An ask's explaining line and its exact command sit inside the scroller, under the question, so a cap
  // sized to the question's own lines clipped them away entirely. An ask is never capped.
  scroller.style.maxHeight = asking || livePlan ? 'none' : `${shown * lineHeight}px`;
  scroller.classList.toggle('scrolls', scrolls(total, expanded));
  more.hidden = summarised ? false : !hasMore(total, expanded);
  more.classList.toggle('labelled', summarised);
  more.classList.toggle('open', summarised && expanded);
  moreLabel.textContent = summarised ? (expanded ? 'SHOW LESS' : 'SHOW MORE') : '';
}
const moreLabel = document.createElement('span');
moreLabel.className = 'label';
more.prepend(moreLabel);

/**
 * Tell the Shell how big this actually is, so the window fits the drawn shape.
 *
 * The window cannot know: the text is wrapped by the browser using the real font at the real size.
 * Same approach as the pop-out's chrome measurement, which was the fix for letterboxing there - the
 * page measures, the window follows.
 */
/**
 * Draw the balloon's shape behind the text.
 *
 * Regenerated rather than scaled: stretching one fixed outline to fit a longer reply would distort
 * the corner radii and the tail with it, so a one-line and a twenty-line balloon would not look like
 * the same object. Cheap enough to do on every size change - it is one string and one innerHTML.
 */
let lastShape = '', shapeId = 0;
/** Where his head is, relative to this page's top-left. The Shell works it out and sends it. */
let aim = { ...DEFAULT_AIM };
window.aang?.onAim?.((a) => {
  if (!a || typeof a.x !== 'number' || typeof a.y !== 'number') return;
  const next = { x: a.x, y: a.y, flip: a.flip === true, s: Number(a.s) > 0 ? Number(a.s) : 1 };
  if (next.x === aim.x && next.y === aim.y && next.flip === aim.flip && next.s === aim.s) return;
  aim = next;
  lastShape = '';                                   // he moved, so the shape has to be redrawn
  const r = bubble.getBoundingClientRect();
  if (r.width) paintSkin(r.width, r.height);
});

function paintSkin(w, h) {
  // A hidden bubble measures 0x0, and the tail has a minimum length, so painting then left a lone
  // tail and its shadow floating near him with no balloon attached (seen on his desktop, 2026-10-05).
  // Nothing to say, nothing drawn.
  if (bubble.hidden || w < 20 || h < 20) { skin.innerHTML = ''; lastShape = ''; return; }
  // His head in the balloon's own coordinates. `aim` is in page coordinates, so the balloon's own
  // top-left is subtracted. balloonPath does the rest: which edge, where on it, and how long.
  // 2026-10-22: aimed at his mouth (balloon.js MOUTH_FROM_HEAD), the comic rule; the Shell sends his head and its scale.
  const box = bubble.getBoundingClientRect(), s = aim.s || 1;
  const head = { x: aim.x + MOUTH_FROM_HEAD.x * s - box.left, y: aim.y + MOUTH_FROM_HEAD.y * s - box.top };
  const wood = bubble.classList.contains('lantern');
  const key = `${Math.round(w)}x${Math.round(h)}:${Math.round(head.x)},${Math.round(head.y)}:${aim.flip}:${wood}`;
  if (key === lastShape) return;
  lastShape = key;
  const d = balloonPath(w, h, head);
  paintBalloon(skin, w + PAD_R, h + PAD_B, d, ++shapeId, wood, rimOn() ? { w, h, head } : null);
  // Sheet 64: the rim and its tail take the ask's kind colour (askkind.js); a redrawn skin is tinted again.
  tintRim(skin, /** @type {any} */ (bubble.dataset.kind ?? null));
}
// 2026-10-21, sheet 55 S2: his wood rim goes round look B's paper (never the Lantern's wood). It sits outside the paper,
// so the window is RIM_G bigger and the bubble RIM_G further up and left from him (bubble.css .wrap.rimB margins): the
// rim's outer edge lands where the old ink line was and the tail still reaches his head.
function rimOn() { return wrapEl.classList.contains('rimB') && !bubble.classList.contains('lantern'); }
// The rim's pieces are cut once band.png has loaded; whatever is showing then is redrawn with it.
rimReady.then((ok) => { if (!ok) return; lastShape = ''; const r = bubble.getBoundingClientRect(); if (r.width) paintSkin(r.width, r.height); });

// ---------------------------------------------------------------- growing, never popping (sheet 13)
// One balloon, regenerated every frame at the size it has reached, never scaled. It grows on a 520 ms
// spring with a slight overshoot and shrinks in 340 ms, both lifted verbatim from the approved sheet.
// The WINDOW changes first when growing and last when shrinking: it is placed by its bottom-right
// corner, so a window bigger than the shape costs nothing, and one smaller than it clips it.
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = {
  open: (t) => { const c1 = 1.70158 * 1.1, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  close: (t) => 1 - Math.pow(1 - t, 3),
};
/** The open ease peaks 11.8% past its target, so the window holds that much spare while growing. */
const OVERSHOOT = 1.12;
let cur = { w: 0, h: 0 }, goal = { w: 0, h: 0 }, anim = 0;
// A timer, not requestAnimationFrame: rAF stalls in a window the system thinks is not being looked at
// (it froze the sheet's own marquee at 0), and a balloon frozen half-grown is worse than any frame rate.
const frame = (f) => setTimeout(() => f(performance.now()), 16);

/**
 * The size the content wants, measured with the animation's own sizes taken off for a moment.
 *
 * `probe` runs inside that same moment, so anything else measured with it (the conversation's own height) is measured
 * at rest too. Anything already on its way out (a finished job collapsing) is left out, so the balloon shrinks in
 * the same breath as the thing leaving instead of after it (2026-10-21).
 */
function natural(probe) {
  const sw = bubble.style.width, sh = bubble.style.height;
  bubble.style.width = ''; bubble.style.height = '';
  bubble.classList.remove('sizing');
  bubble.classList.add('measuring');
  const r = bubble.getBoundingClientRect();
  const extra = probe ? probe() : undefined;
  bubble.classList.remove('measuring');
  bubble.style.width = sw; bubble.style.height = sh;
  if (sw) bubble.classList.add('sizing');
  return { w: Math.ceil(r.width), h: Math.ceil(r.height), extra };
}
/**
 * The tallest the window may be: main.ts clamps every bubble window to 900 px (bubble:size), and the window is the
 * shape plus 80 px of margins (sendWindow). Asking for more only got the top of the frame cut off on his desktop
 * (2026-10-21: a 924 px cockpit in a 900 px window), so the shape never asks past this.
 */
const WINDOW_MAX_H = 900, WINDOW_EDGE_H = 18 + 56 + 6, SHAPE_MAX_H = WINDOW_MAX_H - WINDOW_EDGE_H;
/** Samara's ease, cubic-bezier(.32,.72,0,1), for the small changes (his motion rules, 2026-10-21). */
function samaraEase(t) {
  // Solve x(s) = t for the curve's parameter s, then return y(s). Newton steps, then a bisection fallback.
  const x1 = 0.32, y1 = 0.72, x2 = 0, y2 = 1;
  const bx = (s) => 3 * x1 * s * (1 - s) ** 2 + 3 * x2 * s * s * (1 - s) + s ** 3;
  const by = (s) => 3 * y1 * s * (1 - s) ** 2 + 3 * y2 * s * s * (1 - s) + s ** 3;
  let s = t;
  for (let i = 0; i < 6; i++) { const d = (bx(s + 1e-4) - bx(s - 1e-4)) / 2e-4; if (Math.abs(d) < 1e-6) break; s -= (bx(s) - t) / d; s = Math.min(1, Math.max(0, s)); }
  if (Math.abs(bx(s) - t) > 1e-3) { let lo = 0, hi = 1; for (let i = 0; i < 30; i++) { s = (lo + hi) / 2; if (bx(s) < t) lo = s; else hi = s; } }
  return by(s);
}

/** Draw the shape at w x h. The content inside keeps its final width, so text never rewraps mid-grow. */
function place(w, h) {
  bubble.style.width = w + 'px';
  bubble.style.height = h + 'px';
  bubble.classList.add('sizing');
  paintSkin(w, h);
}

function growTo(w, h, done) {
  clearTimeout(anim);
  const from = { ...cur }, bigger = w * h >= from.w * from.h;
  // His motion rules (2026-10-21): a big grow springs (520 ms, slight overshoot), a shrink settles (340 ms), and a
  // small change (a few dozen pixels, the bubble already up) glides 300 ms on Samara's ease with no overshoot.
  // 2026-10-21: and a change of WIDTH while the bubble is up (a new exchange at another width) glides the same way, so
  // it never reads as a snap; the window keeps the wider of the two until it lands.
  // 2026-10-22 (comic lettering, the research's motion rule): a reply growing by whole lines as its words arrive grows
  // on the 520 ms spring, height only, the width already fixed; it no longer glides like the small changes do.
  const lineStep = !cockpit && w === from.w && h > from.h && from.h > 0 && (reveal.streaming || reveal.revealing);
  const small = !lineStep && from.w > 0 && from.h > 0 && w > 0 && ((Math.abs(w - from.w) <= 48 && Math.abs(h - from.h) <= 48) || w !== from.w);
  const ms = reduceMotion ? 0 : small ? 300 : (bigger ? 520 : 340), fn = small ? samaraEase : bigger ? ease.open : ease.close;
  const cs = getComputedStyle(bubble);
  if (w > 0) bubble.style.setProperty('--cw', Math.max(0, w - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) + 'px');
  // The spring's overshoot never asks past the tallest window main.ts allows (it would cut the frame's top off).
  const tallest = Math.max(h, SHAPE_MAX_H - (rimOn() ? RIM_G : 0));
  // 2026-10-21: only the HEIGHT springs past its target; the width stops at its own. The width overshooting 12% made
  // the window go 287 -> 466 -> 416 wide as the bubble opened (his shell.log); now it is given its final width once.
  if (bigger || w > from.w) sendWindow(Math.max(from.w, w),
                         Math.min(tallest, Math.max(from.h, Math.ceil(from.h + (h - from.h) * (small ? 1 : OVERSHOOT)))));
  const t0 = performance.now();
  const f = (now) => {
    const k = ms ? Math.min(1, (now - t0) / ms) : 1, e = fn(k);
    const ww = from.w + (w - from.w) * e;
    cur = { w: Math.max(0, w >= from.w ? Math.min(w, ww) : Math.max(w, ww)), h: Math.max(0, Math.min(tallest, from.h + (h - from.h) * e)) };
    place(Math.round(cur.w), Math.round(cur.h));
    if (k < 1) { anim = frame(f); return; }
    cur = { w, h };
    place(w, h);
    // 2026-10-21: settles to the exact size at rest; while an answer is still arriving it keeps its spare room
    // (sendWindow), so the window is not resized line by line.
    anim = 0;
    if (w > 0) sendWindow(w, h, true);
    done?.();
  };
  f(t0);
}

/** Gone at once, no shrink: for the times the bubble is cleared rather than finished with. */
function snapShut() {
  clearTimeout(anim);
  cur = { w: 0, h: 0 }; goal = { w: 0, h: 0 };
  bubble.style.width = ''; bubble.style.height = '';
  bubble.classList.remove('sizing', 'leaving');
  skin.innerHTML = ''; lastShape = ''; lastSize = ''; granted = { w: 0, h: 0 };
}

let lastSize = '';
/** The content changed: grow or shrink the balloon to what it now wants. */
function reportSize() {
  // Going away: a late re-measure (a job list arriving, a card put away) must not cancel the shrink and leave the
  // bubble stuck on screen (2026-10-21). Anything new to show takes `leaving` off first (show()).
  if (bubble.hidden || bubble.classList.contains('leaving')) return;
  if (cockpit) fitCockpit();
  const n = natural();
  if (n.w === goal.w && n.h === goal.h) return;
  goal = n;
  growTo(n.w, n.h);
}

/**
 * The shape size the window was last given room for. 2026-10-21 (his "a bit jumpy"): while a reply is still arriving
 * the window only ever grows, and in steps of ROOM_STEP (four lines) rather than a line at a time, so a long answer
 * resizes the window every few lines instead of on every one. `exact` (the end of a shrink, or nothing arriving) lets
 * it come down to the shape again.
 */
let granted = { w: 0, h: 0 };
const ROOM_STEP = 96;
function sendWindow(sw, sh, exact = false) {
  const arriving = !cockpit && (reveal.streaming || reveal.revealing);
  if (!exact || arriving) {
    if (sw <= granted.w && sh <= granted.h) return;
    const cap = SHAPE_MAX_H - (rimOn() ? RIM_G : 0);
    if (arriving && sh > granted.h) sh = Math.max(sh, Math.min(cap, sh + ROOM_STEP));
    sw = Math.max(sw, granted.w); sh = Math.max(sh, granted.h);
  }
  granted = { w: sw, h: sh };
  const r = { width: sw, height: sh };
  // Round up: a half pixel short clips the frame's bottom edge.
  // 6 px of margin on the left, 78 on the right: the extra 72 is the room the TAIL hangs in
  // (bubble.css `.wrap`), its reach plus slack so the ink line is not on the window edge. Same
  // below: 18 above for the copy and rate keys, 56 under for the tail, of which 38 is new. Without the top room the keys sat outside the window and could never be
  // seen (first sweep, 2026-10-04); the tail would go the same way.
  // 14 on the left, not 6: the Smoother look's soft shadow spreads past the ink line.
  // + RIM_G with the wood rim on (2026-10-21): it is 8 px of wood outside the paper, and bubble.css's .wrap.rimB
  // margins move the bubble that much further from him inside the window.
  const g = rimOn() ? RIM_G : 0;
  const width = Math.ceil(r.width) + 14 + 78 + g;
  const height = Math.ceil(r.height) + 18 + 56 + 6 + g;
  const key = width + 'x' + height;
  if (key === lastSize) return;               // resizing a window is not free
  lastSize = key;
  console.info(`bubble: shape ${Math.round(r.width)}x${Math.round(r.height)} wide=${bubble.classList.contains('wide')} window=${innerWidth}x${innerHeight} -> ${width}x${height}`);
  // `pad` is how much of that size is tail room beyond the shape the window used to be. The Shell
  // places the window by the OLD shape and then grows it right and down, so adding a tail does not
  // move the panel one pixel from where it has always sat beside him.
  window.aang?.bubbleSize?.({ width, height, pad: { right: 72, bottom: 38 } });
}

/**
 * Files and links in the reply, as pressable chips (parity row, from 4.5).
 *
 * Only once the reply has finished arriving: a chip for half a path is useless, and a row of them
 * appearing and rearranging while he is reading is worse than waiting a second.
 */
function paintChips() {
  let row = document.getElementById('chips');
  if (!row) {
    row = document.createElement('div');
    row.id = 'chips';
    row.className = 'chips';
    scroller.after(row);
  }
  // Links are in the words themselves now (sheet 41), so only files get a chip.
  const list = reveal.done ? findEntities(reveal.whole).filter((c) => c.kind !== 'link') : [];
  row.replaceChildren();
  row.hidden = list.length === 0;
  for (const c of list) {
    const b = document.createElement('button');
    b.className = 'chip act';
    b.title = c.value;                       // the whole path or address, on hover
    b.textContent = c.label;
    b.addEventListener('click', () => window.aang?.openThing?.({ kind: c.kind, value: c.value }));
    row.append(b);
  }
}

/** Paint whatever is revealed so far. */
/** The words of the current reply, laid out in full, each hidden until its turn. */
let laidOut = '', words = [];
/**
 * 2026-10-21 (his "a bit jumpy"): a streamed reply arrives every ~40 ms, and every arrival used to throw away and
 * rebuild every word, so the few still fading in popped to full ink each time. Now only the blocks that changed are
 * rebuilt (`laid`), and each word remembers when it was revealed (`wordAt`), so a rebuilt one carries on its fade from
 * where it was (a negative animation delay) instead of starting over or popping.
 */
let laid = [], wordAt = [], wordsGen = -1, lit = 0;
/** Word indexes a line he has read ends on, kept as hard breaks for this reply (widenAtThird). */
const hardBreaks = new Set();
const FADE_MS = 280;
function fadeFrom(s, age) {
  if (age >= FADE_MS) return;
  s.classList.add('in');
  if (age > 0) s.style.animationDelay = `-${Math.round(age)}ms`;
}
const sigOf = (b) => b.kind + '|' + JSON.stringify(b.runs) + JSON.stringify(b.cells ?? null);
function layOut(visible) {
  // Kept blocks must still be the ones on the page: anything that wrote into `said` directly starts it over.
  if (laid.length && laid[0].el.parentNode !== said) laid = [];
  if (!laid.length) said.replaceChildren();
  const bl = blocks(visible);
  let keep = 0;
  while (keep < bl.length && keep < laid.length && laid[keep].sig === sigOf(bl[keep])) keep++;
  for (const b of laid.splice(keep)) b.el.remove();
  words = laid.flatMap((b) => b.words);
  const now = performance.now();
  // 2026-10-22: a line he has already read keeps its words when the bubble widens at the third line (widenAtThird):
  // its end becomes a hard break, and the space after it goes.
  let broke = false;
  // 6.11: the reply's own light formatting, as blocks (rich.js). Every element is built here with
  // textContent; the reply's text never becomes markup.
  for (let k = keep; k < bl.length; k++) {
    const b = bl[k], ws = [];
    const wordsInto = (host, text) => {
      for (const part of text.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { if (broke) broke = false; else host.append(' '); continue; }
        broke = false;
        const sp = document.createElement('span');
        const idx = words.length + ws.length, at = wordAt[idx];
        sp.className = at === undefined ? 'w o' : 'w';
        if (at !== undefined) fadeFrom(sp, now - at);
        sp.textContent = part;
        host.append(sp);
        ws.push(sp);
        if (hardBreaks.has(idx)) { host.append(document.createElement('br')); broke = true; }
      }
    };
    const runsInto = (host, rs) => {
      for (const r of rs) {
        const into = r.bold ? document.createElement('b') : r.code ? document.createElement('code') : host;
        wordsInto(into, r.text);
        if (into !== host) host.append(into);
      }
    };
    const el = document.createElement('div');
    el.className = 'r-' + b.kind;
    if (b.kind === 'row') for (const c of b.cells ?? []) { const cell = document.createElement('span'); cell.className = 'cell'; runsInto(cell, c); el.append(cell); }
    else runsInto(el, b.runs);
    said.append(el);
    laid.push({ sig: sigOf(b), el, words: ws });
    words.push(...ws);
  }
  lit = Math.min(words.length, wordAt.length);
}
/** Lays out what is to be shown (only if it changed) and reveals the words that are due. True if the layout changed. */
function paintWords() {
  // Folded to its short version until he asks for the rest (shortOf). The short version is the start of
  // the whole text, so the words already revealed stay revealed when it opens.
  const short = expanded ? null : shortOf();
  const visible = short ?? reveal.whole;
  // A new message (or the same one started over) is laid out from scratch: nothing of the last one stays lit.
  if (wordsGen !== reveal.gen) { wordsGen = reveal.gen; wordAt = []; laid = []; laidOut = null; hardBreaks.clear(); }
  let relaid = false;
  if (laidOut !== visible) { laidOut = visible; layOut(visible); relaid = true; }
  // 2026-10-22: a narrow streamed reply widens only when its THIRD line arrives, before a word of that line lights, and
  // the two lines above keep exactly the words they had.
  if (relaid && reveal.streaming && lockGen === reveal.gen && !expanded && !cockpit && !bubble.classList.contains('wide')
      && !bubble.classList.contains('whisper') && lineCount() > 2) widenAtThird(visible);
  const n = reveal.done ? words.length : Math.min(words.length, shownWords(reveal.text));
  const now = performance.now();
  for (; lit < n; lit++) {
    if (wordAt[lit] === undefined) wordAt[lit] = now;
    const sp = words[lit];
    if (sp.classList.contains('o')) { sp.classList.remove('o'); fadeFrom(sp, now - wordAt[lit]); }
  }
  // Sheet 41: any web address in his words is a link once the words are all in, and it opens in Samara.
  if (reveal.done) linkifyWords(said);
  return relaid;
}

/**
 * Which short version the reply shows folded (2026-10-21). While it streams: its first paragraph, as soon as that has
 * arrived (streamSummaryOf), so a fold never hides words he was already reading. Finished: summaryOf, except that a
 * streamed reply that never folded never folds afterwards, for the same reason.
 */
let foldGen = -1, foldLive = false, foldSeen = false;
function shortOf() {
  if (foldGen !== reveal.gen) { foldGen = reveal.gen; foldLive = reveal.streaming; foldSeen = false; }
  if (reveal.streaming) { const s = streamSummaryOf(reveal.whole); if (s) foldSeen = true; return s; }
  if (foldLive && !foldSeen) return null;
  return summaryOf(reveal.whole);
}

/**
 * The rows Aang attached with present_list (6.11): a carved plaque only when something is urgent, then one
 * row per thing with a coloured chip. Shown once the reply has finished, like the file chips.
 */
let replyList = null;
function paintList() {
  let box = document.getElementById('rlist');
  if (!box) { box = document.createElement('div'); box.id = 'rlist'; box.className = 'rlist'; scroller.after(box); }
  box.replaceChildren();
  box.hidden = !(replyList && reveal.done);
  if (box.hidden) return;
  const T = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  if (replyList.header?.text) box.append(T('span', 'plaque tone-' + (replyList.header.tone ?? 'normal'), replyList.header.text));
  for (const [i, it] of (replyList.items ?? []).entries()) {
    const row = T('div', 'lrow');
    // Sheet 102 (2026-10-28): a row of "while you were busy" opens that one, as it would have come; a row of "welcome
    // back" opens Look back, where what went to the phone is kept. Nothing is sent again.
    const held = Array.isArray(replyList.held) ? replyList.held[i] : null;
    if (held && typeof held === 'object') { row.classList.add('tap'); row.onclick = () => onBrain(held); }
    else if (it.look) { row.classList.add('tap'); row.onclick = () => { try { recall('back'); } catch { /* nothing to show */ } }; }
    const mid = T('div', 'lmid');
    mid.append(T('div', 'lt', it.title ?? ''));
    if (it.subtitle) mid.append(T('div', 'ls', it.subtitle));
    row.append(mid);
    if (it.chipText) row.append(T('span', 'chip ' + ({ good: 'good', careful: 'careful', stop: 'stop', inactive: 'off' }[it.chipTone] ?? 'normal'), it.chipText));
    box.append(row);
  }
  if (replyList.moreCount) box.append(T('div', 'lmore', `${replyList.moreCount} more`));
}

/**
 * How many lines the text would take at a width, measured with the grow's fixed size taken off for a moment (the same
 * trick as natural()). Nothing is drawn in between, so trying a width costs a layout and never shows.
 */
function atWidth(wide, widest, measure) {
  const cl = bubble.classList, had = [cl.contains('wide'), cl.contains('widest'), cl.contains('sizing')];
  const sw = bubble.style.width, sh = bubble.style.height;
  bubble.style.width = ''; bubble.style.height = '';
  cl.toggle('wide', wide); cl.toggle('widest', widest); cl.remove('sizing');
  const n = measure();
  cl.toggle('wide', had[0]); cl.toggle('widest', had[1]); if (had[2]) cl.add('sizing');
  bubble.style.width = sw; bubble.style.height = sh;
  return n;
}
const linesIf = (wide, widest) => atWidth(wide, widest, lineCount);

/**
 * 2026-10-21 (his report: the thinking bubble opened wide with his question, then a short answer, "Clear, cool, calm.",
 * snapped it narrow in one jump; and opening alone resized it three times, 287 -> 466 -> 416): the bubble's width is
 * decided ONCE per exchange, when the thinking bubble opens on Enter, and the answer keeps it. It is the wider of what
 * his question line needs and what the answer is expected to need. The answer is expected to run past a line unless
 * what he typed is plain small talk: the brain's own rule (Core/src/route.ts SMALL_TALK, copied here) sends only that
 * to Quick, and everything else to Smart, which answers in sentences. The brain's dots, 15 ms later, name the lane;
 * by then the width is decided and stays, because changing it then was the second of the three resizes.
 */
const SMALL_TALK = /^\s*(?:(?:hey|hi|hiya|hello|yo|sup|morning|evening|afternoon|good (?:morning|night|evening|afternoon)|gm|gn|night|nite|thanks?(?: (?:you|so much|a lot))?|thx|ty|tysm|cheers|lol|lmao|haha+|hehe+|nice|cool|sweet|awesome|bye|later|cya|see ya|how are (?:you|ya|u)|how'?s it going|how you doing|what'?s up|wassup|whats good|checking in|love you|gg)(?:,? (?:bud|buddy|man|aang|dude|bro|pal|my guy|my man|homie))?[\s!.?~]*)+$/i;
function exchangeWide(question, lane) {
  const answerWide = typeof lane === 'string' && lane !== '' ? lane !== 'Quick' : !(question.length <= 80 && SMALL_TALK.test(question));
  if (answerWide) return true;
  // His question line is cut with "…" when it does not fit: at the narrow width a long one would be cut short.
  return !who.hidden && atWidth(false, false, () => who.scrollWidth > who.clientWidth + 1);
}
/** The reply that answers a thinking bubble: it keeps the exchange's width (see exchangeWide). */
let holdGen = -1;
/**
 * 2026-10-21 (his "a bit jumpy"): a STREAMED reply picks its width at its first words and keeps it while it arrives.
 * Measured line by line as before, it went 256 -> 416 at its second line and 416 -> 556 past its eighteenth, and the
 * text he was reading rewrapped each time. Smart and Deep answers run past a line, so they start wide; Quick's small
 * talk starts narrow unless its first sentence already wraps. `lockGen` is the reply the width was decided for.
 */
let lockGen = -1, liveWho = '', liveId = null;
function lockWidth() {
  if (lockGen === reveal.gen) return true;
  // 2026-10-21: the answer to a thinking bubble keeps the width the exchange opened at. Two exceptions, both decided
  // here, at the answer's first paint, before a single word of it is lit (so nothing he is reading can rewrap):
  // a narrow exchange whose answer runs past one line widens, and a whole (not streamed) answer too long for 416
  // takes the widest width. It never narrows: a short answer sits in the bubble it was asked in.
  if (holdGen === reveal.gen) {
    lockGen = reveal.gen;
    const cl = bubble.classList;
    // 2026-10-22 (comic lettering): two lines stay narrow and balanced; only a third line widens it.
    if (!cl.contains('wide') && linesIf(false, false) > 2) cl.add('wide');
    if (!reveal.streaming && cl.contains('wide') && !cl.contains('widest') && linesIf(true, false) > WIDEST_AFTER_LINES) cl.add('widest');
    // A whole answer (every word known before the first lights) is balanced inside the width it was asked in.
    if (!reveal.streaming) { letterGen = reveal.gen; clearLettering(); said.classList.add(linesIf(cl.contains('wide'), cl.contains('widest')) <= 6 ? 'bal' : 'pretty'); }
    return true;
  }
  if (!reveal.streaming) return false;
  lockGen = reveal.gen;
  const wide = liveWho !== 'Quick' || linesIf(false, false) > 2;
  bubble.classList.toggle('wide', wide);
  bubble.classList.toggle('widest', wide && linesIf(true, false) > WIDEST_AFTER_LINES);
  return true;
}
/** The streamed reply is all in: a short one that fits one narrow line narrows (one line cannot rewrap). */
function settleWidth() {
  // Not an answer to a thinking bubble (2026-10-21): narrowing at the end was the snap he saw.
  if (lockGen !== reveal.gen || holdGen === reveal.gen || expanded) return;
  const cl = bubble.classList;
  if (cl.contains('wide') && !cl.contains('widest') && linesIf(false, false) <= 1) cl.remove('wide');
}

function paint() {
  paintWords();
  if (!lockWidth()) letterWhole();
  // No Copy key on the bubble any more: it came up on every reply and was too big (his call, 2026-10-12).
  // Copying is the right-click menu's Copy text, or Ctrl+C with the mouse on the bubble.
  tools.hidden = true;
  paintChips();
  paintList();
  markLink();
  // Measured LAST, once the chips and the list rows are in: measuring first left the balloon sized for
  // the words alone, with the rows hidden below its edge (found 2026-10-11).
  fit();
  reportSize();
}
function widen() {
  // Over one line of text, the bubble widens, which is what BubbleView does at WideAfterLines = 1.
  // Wide is decided ONCE per reply, measured at the narrow width, and never undone - BubbleView.Show:
  // `if (!Wide) Wide = Wrap(t).Count > WideAfterLines; // measured at the narrow width`. Toggling it
  // both ways made it flip: two lines narrow -> go wide -> one line wide -> go narrow -> ... and it
  // settled sized for the wrong number of lines, cutting the second line off (sweep, 2026-10-04).
  if (!bubble.classList.contains('wide') && lineCount() > 1) bubble.classList.add('wide');
  // And a third width for a reply long enough that even 416 would be a tall narrow column. Measured
  // at the wide width and never undone, for the same reason `wide` is not: toggling it both ways
  // makes it flip between two sizes and settle on the wrong one.
  if (bubble.classList.contains('wide') && !bubble.classList.contains('widest')
      && lineCount() > WIDEST_AFTER_LINES) bubble.classList.add('widest');
}

// ---------------------------------------------------------------- comic lettering (2026-10-22)
// docs/POPOUTS-NOTES-RESEARCH.md section 1, "Rules to adopt". The words come first and the balloon is drawn round them:
//   - a WHOLE message (every word known before the first lights) picks its width by length before anything shows
//     (up to 90 characters 256, up to 300 416, past that 556), breaks its lines balanced (6 lines or fewer; past that
//     `pretty`, no lone last word), and the balloon then hugs its longest real line, never under 96;
//   - a short plain one (3 lines or fewer, no list, rows or cards) is centred, on 22 px lines, the comic look;
//   - a STREAMED reply keeps plain greedy wrapping (new words only ever change the last line) and its width from the
//     lane, widening only when its third line arrives (widenAtThird), so a line he has read never rewraps.
let letterGen = -1;
function clearLettering() {
  bubble.classList.remove('comic', 'tight');
  bubble.style.removeProperty('--tightw');
  said.classList.remove('bal', 'pretty');
}
/** The text's real lines as laid out now: which words each holds and how wide it is. */
function lineBoxes() {
  const out = [];
  words.forEach((sp, i) => {
    const q = sp.getClientRects()[0];
    if (!q) return;
    const l = out.at(-1);
    if (l && Math.abs(q.top - l.top) < 3) { l.left = Math.min(l.left, q.left); l.right = Math.max(l.right, q.right); l.last = i; }
    else out.push({ top: q.top, left: q.left, right: q.right, first: i, last: i });
  });
  return out;
}
/** How wide the bubble has to be for everything in it except the words (his question, Claude's name, a face). */
function othersWidth() {
  const hide = [scroller, more, el('chips'), el('rlist'), tools].filter(Boolean);
  const keep = hide.map((e) => e.style.display);
  hide.forEach((e) => { e.style.display = 'none'; });
  const w = atWidth(bubble.classList.contains('wide'), bubble.classList.contains('widest'), () => {
    const sw = bubble.style.width; bubble.style.width = 'max-content';
    const r = bubble.getBoundingClientRect().width; bubble.style.width = sw; return r;
  });
  hide.forEach((e, i) => { e.style.display = keep[i]; });
  return w;
}
function letterWhole() {
  if (letterGen === reveal.gen) return;
  letterGen = reveal.gen;
  clearLettering();
  const cl = bubble.classList;
  // Not a spoken line: the whisper keeps its own size, and the jobs, a plan or a question keep theirs.
  if (cockpit || cl.contains('whisper') || jobsOpen || livePlan || asking || !said.textContent.trim()) { widen(); return; }
  const chars = said.textContent.replace(/\s+/g, ' ').trim().length;
  cl.remove('wide', 'widest');
  if (chars > 300) cl.add('wide', 'widest'); else if (chars > 90) cl.add('wide');
  if (cl.contains('wide') && !cl.contains('widest') && linesIf(true, false) > WIDEST_AFTER_LINES) cl.add('widest');
  const W = cl.contains('wide'), WW = cl.contains('widest');
  const lines = linesIf(W, WW);
  said.classList.add(lines <= 6 ? 'bal' : 'pretty');
  const plain = [...said.children].every((c) => c.classList.contains('r-p'));
  const rich = !plain || replyList || shortOf() !== null || findEntities(reveal.whole).some((c) => c.kind !== 'link');
  if (rich || lines > 6) return;
  if (lines <= 3) cl.add('comic');
  // The balloon hugs the balanced lines: balance makes them shorter, the box does not follow by itself.
  const longest = atWidth(W, WW, () => Math.max(0, ...lineBoxes().map((l) => l.right - l.left)));
  const cs = getComputedStyle(bubble);
  const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
  const band = atWidth(W, WW, () => bubble.getBoundingClientRect().width);
  const want = Math.ceil(Math.max(96, longest + pad + 2, othersWidth()));
  if (want >= band - 1) return;
  bubble.style.setProperty('--tightw', want + 'px');
  cl.add('tight');
  // Rounding must never cost a line: if it would, the band's width stays.
  if (linesIf(W, WW) !== lines) { cl.remove('tight'); bubble.style.removeProperty('--tightw'); }
}
/** A narrow streamed reply reached its third line: the lines above it keep their words, and the bubble widens. */
function widenAtThird(visible) {
  const ls = lineBoxes();
  const blockOf = (sp) => sp?.closest('#said > *');
  for (const l of ls.slice(0, 2)) {
    const end = words[l.last], next = words[l.last + 1];
    if (next && blockOf(end) === blockOf(next)) hardBreaks.add(l.last);
  }
  laid = []; layOut(visible);
  bubble.classList.add('wide');
}

/**
 * The old bubble drew the word it could act on ("Claude") bold, terracotta and underlined, so he could see the
 * message was clickable (BubbleView:962). Done once the words are all in, on the first match only.
 */
let linkWord = '';
function markLink() {
  if (!linkWord || !reveal.done || said.querySelector('.link')) return;
  const walk = document.createTreeWalker(said, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const i = n.data.indexOf(linkWord);
    if (i < 0) continue;
    const after = n.splitText(i); after.splitText(linkWord.length);
    const s = document.createElement('span'); s.className = 'link'; s.textContent = linkWord;
    after.replaceWith(s);
    return;
  }
  // Sheet 60 B: a note's name is often several words, and the reveal lights each word as its own element.
  const want = linkWord.split(/\s+/).filter(Boolean);
  if (want.length < 2) return;
  const words = [...said.querySelectorAll('*')].filter((e) => !e.children.length && (e.textContent ?? '').trim());
  const bare = (t) => t.trim().replace(/^["'(]+|["'.,?!:;)]+$/g, '').toLowerCase();
  for (let i = 0; i + want.length <= words.length; i++) {
    if (want.every((w, k) => bare(words[i + k].textContent ?? '') === bare(w))) { words.slice(i, i + want.length).forEach((e) => e.classList.add('link')); return; }
  }
}

// The reveal runs on its own clock and works out how much should be visible from the elapsed time, so
// this interval only has to be often enough to look smooth. It stops when there is nothing to reveal.
// 2026-10-21: every 32 ms (was 50), so words start on an even beat, and a tick only lights words: the layout, the
// chips and the balloon's size change only when new text arrives (onBrain paints then) or when it is all in. Before,
// every tick rebuilt the chips row and measured the balloon twice, twenty times a second, for nothing.
const REVEAL_TICK_MS = 32;
let ticking = null;
/** The answer's first chunk was only half a word: the dots stay until a word is lit (see onBrain). */
let dotsTillWords = false;
function startTicking() {
  if (ticking) return;
  clearTimeout(hideTimer);
  ticking = setInterval(() => {
    reveal.tick();
    let relaid = paintWords();
    if (dotsTillWords && (lit > 0 || reveal.done)) { dotsTillWords = false; working.hidden = true; relaid = true; }
    if (relaid && !reveal.done) { fit(); reportSize(); }
    if (reveal.done) {
      clearInterval(ticking); ticking = null; settleWidth(); paint(); scheduleHide();
      // All in: the window comes down to the shape once (unless a grow is still running; its end does it).
      if (!anim && cur.w > 0) sendWindow(cur.w, cur.h, true);
    }
  }, REVEAL_TICK_MS);
}

// ---------------------------------------------------------------- going away
// The first real sweep (2026-10-04) showed a reply still on screen 43 seconds later, and the reply before
// it still there at the start of the next run: this bubble had no way to leave. Ported from the old one:
//   PetWindow.ShowBubble   hold = clamp(2500 + 45 x characters, 3000, 20000) ms
//   BubbleView.SetHold     a reply long enough to collapse waits at least 60 s - "nothing turns the page
//                          for the reader"
// and, as in the old one, never while the mouse is on it, and never while it is asking him something.
let hideTimer = 0;
function holdFor(text) {
  // Sheet 53: the jobs from the mark stay until he clicks away (or they finish); the recent line stays while the box is up.
  if (jobsOpen || recentOpen) return 300000;
  if (bubble.classList.contains('whisper')) return 10000;
  if (!card.hidden) return 120000;                  // the brief is read, not glanced at
  if (livePlan) return 600000;                      // a job is running: the checklist stays until the reply
  if (holdOverride) return holdOverride;           // a line the pet says carries its own time, as before
  if (expanded) return 300000;                     // opened up to read: five minutes, as the old bubble did
  // 2026-10-21 (his report: a one-word answer was gone in 2-3 s): a short reply stays at least 4 s. The old 3 s floor
  // came off the pet's own one-liners; an answer is read after the eyes find the bubble. The mouse on it still pauses
  // the clock, and leaving starts this whole hold again (releaseMouse -> scheduleHide).
  const base = Math.min(20000, Math.max(4000, 2500 + 45 * text.length));
  return lineCount() > 6 || shortOf() ? Math.max(base, 60000) : base;
}
function scheduleHide() {
  clearTimeout(hideTimer);
  if (closeIfEmpty()) return;
  if (bubble.hidden || asking || overNow || docked || cockpit || claudeHolds()) return;
  // Scrolled back into his history and walked away: it closes after five quiet minutes, as before.
  if (reading) { hideTimer = setTimeout(goAway, 300000); return; }
  if (card.hidden && (!reveal.done || !reveal.whole)) return;
  hideTimer = setTimeout(goAway, holdFor(reveal.whole));
}
function goAway(empty = false) {
  // An empty frame (closeIfEmpty) goes even under the mouse: there is nothing on it to read or to click.
  if (asking || cockpit || (empty !== true && (overNow || docked || claudeHolds()))) return;
  closeBoard();
  // Content out over 160 ms, then the balloon shrinks away in 340 ms. Anything new arriving meanwhile
  // takes `leaving` off (show), and growTo cancels the shrink, so a reply is never hidden under him.
  bubble.classList.add('leaving');
  setTimeout(() => {
    if (!bubble.classList.contains('leaving')) return;
    growTo(0, 0, () => {
      bubble.hidden = true;
      snapShut();
      releaseMouse();
      // Sheet 53: the jobs view and the recent line end with the bubble; the mark stays until the jobs are done.
      recentOpen = false; wrapEl?.classList.remove('ago');
      if (jobsOpen) { jobsOpen = false; claude?.refresh(); }
      // A question that stepped aside for a reply comes back now.
      if (askParked && waiting.length) { askParked = false; showTopAsk(); return; }
      askParked = false;
      // A whisper that arrived while he was reading waits its turn, then shows.
      if (whisperNext) { const w = whisperNext; whisperNext = null; showWhisper(w); return; }
      // The WINDOW goes too: a hidden page in a shown window is still a window on his desktop.
      window.aang?.bubbleHidden?.();
    });
  }, reduceMotion ? 0 : 160);
}

/**
 * The closed bubble with nothing left in it (his report, 2026-10-22: "once I hit Allow I saw this", a long empty
 * parchment frame with only its tail). Answering the Claude card in the closed bubble took the card away and left the
 * frame cardOnly() had emptied for it: the hover kept goAway out, and scheduleHide waited on words that never come.
 * A shown bubble with no words, keys or pictures in it is never left on screen: it shrinks away at once.
 */
function closeIfEmpty() {
  if (bubble.hidden || cockpit || reading || asking || bubble.classList.contains('leaving')) return false;
  if (bubble.innerText.trim()) return false;
  if ([...bubble.querySelectorAll('img, canvas, video')].some((e) => e.getClientRects().length > 0)) return false;
  clearTimeout(hideTimer);
  goAway(true);
  return true;
}

function show() {
  bubble.hidden = false;
  bubble.classList.remove('leaving');
  // Anything shown is not the "N MIN AGO" line any more (showRecent puts the stamp back after this).
  recentOpen = false; wrapEl?.classList.remove('ago');
  // Measured from the real font at the real size, once there is something to measure. A guess here
  // would make "six lines" mean five and a half.
  const h = parseFloat(getComputedStyle(said).lineHeight);
  if (Number.isFinite(h) && h > 0) lineHeight = h;
}

// ---------------------------------------------------------------- the asks
let asking = null;        // the message being asked about, so an answer can name it
let askParked = false;    // a question stepped aside for a reply, and comes back after it

/**
 * Everything waiting on him, newest shown, the rest kept (6.13, sheet 5 section 4).
 *
 * A new ask used to REPLACE the last, so three things needing him meant he saw one and the other two
 * were gone for good. Now they stack. Sheet 5 sets the order, and it is deliberate:
 *   "anything waiting on a decision comes before anything that is just information, and serious asks
 *    come before routine ones. Within that, oldest first, so nothing gets buried."
 * Nothing in the stack ever disappears on its own; it stays until answered or dismissed.
 */
const waiting = [];
/** Lower sorts first. A thing that cannot be undone outranks a permission, which outranks the rest. */
function rank(m) {
  if (m.t === 'permission') return m.hold ? 0 : 1;
  if (m.t === 'consent') return 2;
  if (m.t === 'fact.ask' || m.t === 'backup.ask') return 3;
  return 4;
}
/**
 * The last question timed out and nothing else is waiting: the whole thing goes - the question, its rows,
 * its plan - not just its keys (parity re-audit, 2026-10-13: the words stayed up for seconds with no way to
 * answer them).
 */
function askGone() {
  asking = null; if (kindReady) syncKind();
  asks.hidden = true; asks.replaceChildren();
  choiceList(null); paintPlan(null, -1);
  // The open cockpit never goes away on its own: the timed-out question just leaves its live area (2026-10-21).
  if (cockpit) { clearLive(); return; }
  goAway();
}
/** Put one in the queue, keeping that order, oldest first within a rank. */
function queueAsk(m) {
  // The same question arriving twice is one question, not two.
  const id = String(m.id ?? '');
  if (id && waiting.some((w) => String(w.id ?? '') === id && w.t === m.t)) return;
  m.__at = Date.now();
  // Parity with the old pet: these questions went away on their own (consent 60 s, a fact or a backup offer
  // 180 s), with nothing answered for him. Permissions and plans are timed by the brain (ask.expired).
  const ttl = m.t === 'consent' ? 60000 : (m.t === 'fact.ask' || m.t === 'backup.ask') ? 180000 : 0;
  if (ttl) setTimeout(() => {
    const i = waiting.indexOf(m);
    if (i < 0) return;
    waiting.splice(i, 1);
    if (asking === m) { if (!showTopAsk()) askGone(); }
    else paintEdges();
  }, ttl);
  waiting.push(m);
  waiting.sort((x, y) => rank(x) - rank(y) || x.__at - y.__at);
}
/** One line saying what a waiting item is, for its edge in the stack. */
function edgeLabel(m) {
  const a = askFrom(m);
  const q = a?.question ?? '';
  return q.replace(/\s+/g, ' ').trim().slice(0, 46);
}

/**
 * Show whichever waiting item is on top, and draw the rest as edges under it.
 *
 * Answer the top one and the next slides up, which is the whole point of the stack.
 */
function showTopAsk() {
  paintEdges();
  // Nothing waiting: the asks row goes, and whatever the bubble was saying stays as it was.
  if (!waiting.length) { asking = null; asks.hidden = true; asks.replaceChildren(); return false; }
  return showAsk(waiting[0]);
}

/** The parchment edges under the open one, one line each, newest-but-one first. Sheet 5 section 4. */
function paintEdges() {
  let row = document.getElementById('under');
  if (!row) {
    row = document.createElement('div');
    row.id = 'under';
    row.className = 'under';
    bubble.after(row);
  }
  const rest = waiting.slice(1, 3);            // two edges at most: a third is unreadable at this width
  row.hidden = rest.length === 0;
  row.textContent = '';
  rest.forEach((m, i) => {
    const e = document.createElement('button');
    e.type = 'button';
    e.className = 'edge u' + (i + 1);
    const b = document.createElement('b');
    b.textContent = i === 0 ? 'NEXT' : 'THEN';
    const t = document.createElement('span');
    t.textContent = edgeLabel(m);
    e.append(b, t);
    // "Click any edge to jump straight to it."
    e.addEventListener('click', () => {
      const pick = waiting.indexOf(m);
      if (pick > 0) { waiting.unshift(...waiting.splice(pick, 1)); showTopAsk(); }
    });
    row.append(e);
  });
  // "1 OF 3" beside the keys, so he knows how many are behind this one.
  let count = document.getElementById('count');
  if (!count) {
    count = document.createElement('span');
    count.id = 'count';
    count.className = 'count';
    asks.after(count);
  }
  count.hidden = waiting.length < 2;
  count.textContent = waiting.length < 2 ? '' : `1 OF ${waiting.length}`;
}

/** Draw an ask. The shape comes from asks.js; this only puts it on screen and listens. */
function showAsk(m) {
  const a = askFrom(m);
  if (!a) return false;
  // In the open cockpit (2026-10-21) whatever was live under the conversation (a reply, the brief, a video) joins the
  // conversation as a row first, so the question takes the live area without wiping anything he had not read.
  if (cockpit && asking !== m) { cockCommit(); card.hidden = true; paintAbout(false); }
  // Sheet 53: a new question grows in like anything else, its pieces fading in one after another.
  const fresh = asking !== m;
  asking = m;
  if (fresh && !cockpit) { endJobs(); bubble.classList.remove('enter'); void bubble.offsetWidth; bubble.classList.add('enter'); }
  bubble.classList.remove('whisper');
  mediaRow.hidden = true;
  // The question goes where a reply goes, so his eye does not have to move for it.
  reveal.start(a.question, false);
  reveal.skip();                                  // a question is never revealed slowly
  who.textContent = a.plaque ?? '';
  setSpeaker('aang');
  // Sheet 64: the kind's tag and who is asking, over the question (the plaque steps aside, asks.css). Samara's plan
  // card names Claude and the project itself, so its tag stands alone.
  const kind = askKind(m);
  kindTag.replaceChildren(...(kind ? [tagRow(kind, m.samara ? null : { name: 'Aang' })] : []));
  if (fresh) { bubble.classList.remove('kshow', 'kin'); clearTimeout(keyWait); keyWait = 0; }
  said.textContent = a.question;
  choiceList(m);
  // The explaining line, quieter, under the question. Joshua, 2026-10-03: "im just seeing gibberish".
  let means = document.getElementById('means');
  if (!means) {
    means = document.createElement('p');
    means.id = 'means';
    means.className = 't-means';
    said.after(means);
  }
  means.textContent = a.means ?? '';
  means.hidden = !a.means;
  // An email: the letter itself under the subject (6.14). Built with textContent: it is his words to send.
  let mail = document.getElementById('mailcard');
  if (!mail) { mail = document.createElement('div'); mail.id = 'mailcard'; mail.className = 'mailcard'; (document.getElementById('exact') ?? means).after(mail); }
  mail.replaceChildren();
  mail.hidden = !a.mail;
  if (a.mail) {
    const hdr = document.createElement('div'); hdr.className = 'hdr';
    const lab = (t) => { const s = document.createElement('span'); s.textContent = t; return s; };
    const val = (t) => { const d = document.createElement('div'); d.textContent = t; return d; };
    const to = val(a.mail.to);
    if (a.mail.fresh) { const c = document.createElement('span'); c.className = 'chip careful newto'; c.textContent = 'NEVER WRITTEN TO BEFORE'; to.append(' ', c); }
    hdr.append(lab('TO'), to);
    // E6: everyone it goes to, and every file, before the hold sends it.
    if (a.mail.cc) hdr.append(lab('CC'), val(a.mail.cc));
    if (a.mail.files) hdr.append(lab('FILES'), val(a.mail.files));
    const letter = document.createElement('div'); letter.className = 'letter'; letter.textContent = a.mail.body;
    mail.append(hdr, letter);
    bubble.classList.add('wide', 'widest');
  }
  // A plan's steps, under the question (6.13). The same list becomes the live checklist on Go.
  paintPlan(m.t === 'plan' && !m.samara ? m : null, -1);
  if (m.t === 'plan') bubble.classList.add('wide');
  // Sheet 37: a Claude session's plan, on the Lantern's wood. Whatever was showing (the brief) waits its turn.
  if (!card.hidden && lastBrief) { parkedBrief = lastBrief; card.hidden = true; }
  samaraPlan(m.samara ? m : null);
  // Sheet 64: on an OK, "Exactly this" (the command, the files, the site, word for word), shown from the start so he
  // reads it before the keys come. It replaced the "See the exact command" fold. Questions and plans never have it.
  let exact = document.getElementById('exact');
  if (!exact) {
    exact = document.createElement('div');
    exact.id = 'exact';
    exact.className = 'exact';
    means.after(exact);
  }
  // C6 (2026-10-22): a Claude job's request folds under its own label ("What I'll send"); sheet 64: an OK always shows
  // "Exactly this"; anything else shows neither.
  if (a.exact && a.exactLabel) {
    exact.hidden = false;
    exact.replaceChildren();
    const key = Object.assign(document.createElement('button'), { type: 'button', className: 'exact-key', textContent: a.exactLabel });
    const text = Object.assign(document.createElement('pre'), { className: 'exact-text', hidden: true, textContent: a.exact });
    key.addEventListener('click', () => { text.hidden = !text.hidden; key.textContent = text.hidden ? a.exactLabel : 'Fold it away'; fit(); reportSize(); });
    exact.append(key, text);
  } else {
    exact.hidden = !(a.exact && kind === 'ok');
    if (exact.hidden) exact.replaceChildren(); else exactBlock(a.exact, exact);
  }

  asks.replaceChildren();
  for (const k of a.keys) {
    if (k.hold) { asks.append(lever(k)); continue; }
    const b = document.createElement('button');
    b.className = 'key sm' + (k.tone === 'primary' ? ' primary' : k.tone === 'warn' ? ' warn' : k.tone === 'burnt' ? ' burnt' : '');
    b.dataset.key = k.key;
    b.append(k.label);
    const tag = document.createElement('span');
    tag.className = 'k';
    tag.textContent = k.key;
    b.append(tag);
    b.addEventListener('click', () => {
      // Sheet 37: Change opens a line to type under the plan; Go then sends the change instead.
      if (m.samara && k.choice === 'change') { openPlanNote(); return; }
      answer(k.choice);
    });
    if (m.samara && k.choice === 'go') b.id = 'plango';
    asks.append(b);
  }
  asks.hidden = a.keys.length === 0;
  // A 600 ms guard on every new set of keys, so a mouse already moving in his game cannot land on Allow
  // the instant it appears (sheet 13).
  asks.classList.add('guard');
  setTimeout(() => asks.classList.remove('guard'), 600);
  working.hidden = true;
  show();
  fit();
  reportSize();
  return true;
}

/**
 * The lever: press AND HOLD while the bar fills (sheet 5, section 2).
 *
 * The bar is driven from how long he has actually held it, frame by frame, rather than being a CSS
 * animation. That way letting go stops it dead - an animation would keep running for a moment after,
 * which on the one control that cannot be undone is exactly the wrong behaviour.
 */
function lever(k) {
  const el = document.createElement('div');
  el.className = 'lever';
  el.tabIndex = 0;
  el.dataset.key = k.key;
  el.innerHTML = '<i class="fillbar"></i><i class="knob"></i><span class="txt"></span><span class="hold">HOLD</span>';
  el.querySelector('.txt').textContent = k.label;

  let from = 0, raf = 0;
  const paint = () => {
    const done = Math.min(1, (performance.now() - from) / HOLD_MS);
    el.style.setProperty('--fill', (done * 100).toFixed(1) + '%');
    if (done >= 1) { stop(); answer(k.choice); return; }
    raf = requestAnimationFrame(paint);
  };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; from = 0; el.style.setProperty('--fill', '0%'); };
  const start = () => { if (raf) return; from = performance.now(); raf = requestAnimationFrame(paint); };

  el.addEventListener('pointerdown', e => { el.setPointerCapture?.(e.pointerId); start(); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave', 'blur']) el.addEventListener(ev, stop);
  // The keyboard has to be able to do it too, and it has to be a HOLD there as well: a held key
  // repeats, so only the first keydown starts it and the keyup stops it.
  el.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); start(); } });
  el.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') stop(); });
  return el;
}

/** His answer. Sent once, then the keys go away so nothing can be answered twice. */
function answer(choice) {
  if (!asking) return;
  // The brain is the thing that is down: these are answered here, never sent.
  if (asking.t === 'brain.down') {
    if (choice === 'retry') window.aang?.retryBrain?.();
    else if (choice === 'log') window.aang?.showBrainLog?.();
    return;
  }
  // For consent, saying yes means asking the same thing again with `once`, so what was asked has to
  // travel with the answer. The bubble is the only place that still knows it.
  // Sheet 37: a plan with a typed change sends the change; the sites he kept travel with any answer.
  const planAns = asking.samara ? planAnswer(choice) : null;
  if (planAns) choice = planAns.choice;
  window.aang?.answerAsk?.({
    t: asking.t, id: asking.id, choice,
    ...(planAns ? { keep: planAns.keep, note: planAns.note } : {}),
    // A consent ask carries the words it is about, because saying yes means asking them again.
    ...(asking.t === 'consent' ? { text: asking.text, mode: asking.wanted } : {}),
    ...(typeof asking.reminder === 'string' ? { reminder: asking.reminder } : {}),
    ...(asking.t === 'timer.done' ? { label: String(asking.label ?? '') } : {}),
    // C6: Go carries the hash of the request he is looking at; the brain sends only if it is the card it made.
    ...(asking.t === 'claude.start' ? { hash: String(asking.hash ?? ''), words: String(asking.words ?? '') } : {}),
  });
  // On Go the plan card stays and becomes the live checklist; the tools that run tick it off.
  if (asking.t === 'plan') { livePlan = choice === 'go' ? { steps: asking.steps, at: 0, ...(asking.samara ? { samara: String(asking.id), task: String(asking.samara.task ?? '') } : {}) } : null; }
  if (asking.samara) samaraPlan(null);
  // Off the queue, then show whatever is behind it. Nothing in the stack disappears on its own.
  const done = asking;
  asking = null; if (kindReady) syncKind();
  const at = waiting.indexOf(done);
  if (at >= 0) waiting.splice(at, 1);
  asks.hidden = true;
  asks.replaceChildren();
  if (waiting.length) { showTopAsk(); return; }
  paintEdges();
  // In the open cockpit the answered question leaves the live area at once: the conversation stays, the answer
  // arrives under it (2026-10-21). A plan he said Go to stays as its live checklist, below.
  if (cockpit && !livePlan) { clearLive(); return; }
  if (!livePlan && briefBack()) return;
  if (livePlan) {
    who.textContent = livePlan.samara ? `CLAUDE \u00b7 ${livePlan.task.toUpperCase()}` : 'THE PLAN'; said.textContent = 'On it.';
    who.hidden = false;
    paintPlan(livePlan, 0); fit(); reportSize();
  }
}

// ---------------------------------------------------------------- the plan and its live checklist (6.13)
let livePlan = null;
const planList = document.createElement('div');
planList.className = 'plan';
planList.hidden = true;
scroller.append(planList);
/** Draw the steps. `at` is the step running now; -1 means not started (the plan card itself). */
function paintPlan(p, at) {
  planList.replaceChildren();
  planList.hidden = !p;
  if (!p) return;
  p.steps.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'step' + (at < 0 ? '' : i < at ? ' done' : i === at ? ' now' : '');
    const n = document.createElement('span'); n.className = 'n'; n.textContent = String(i + 1);
    const t = document.createElement('span'); t.className = 'st'; t.textContent = s.text;
    row.append(n, t);
    const tag = at < 0 ? (s.gate === 'lever' ? 'LEVER' : s.gate === 'ask' ? 'ASK FIRST' : '') : (i < at ? 'DONE' : i === at ? 'NOW' : '');
    if (tag) { const g = document.createElement('span'); g.className = 'gate ' + (tag === 'LEVER' ? 'held' : tag === 'ASK FIRST' ? 'ask' : tag.toLowerCase()); g.textContent = tag; row.append(g); }
    planList.append(row);
  });
}
/** A tool started: move the checklist on to the step that uses it, or simply to the next one. */
function planTool(name) {
  if (!livePlan) return;
  const short = String(name ?? '').replace(/^mcp__aang__/, '');
  const next = livePlan.steps.findIndex((s, i) => i >= livePlan.at && s.tool && s.tool.replace(/^mcp__aang__/, '') === short);
  if (next >= 0) livePlan.at = next;
  paintPlan(livePlan, livePlan.at);
  fit(); reportSize();
}

// ---------------------------------------------------------------- the whisper (sheet 13)
// One quiet line beside his head, the smallest of the balloon's three sizes: now playing, and the like.
// Never over something he is reading: it waits until that has gone.
let whisperNext = null;
const mediaRow = document.createElement('div');
mediaRow.className = 'media';
mediaRow.hidden = true;
for (const [key, label, path] of [
  ['previous', 'Back', 'M7 6v12M18 6l-8 6 8 6z'],
  ['playpause', 'Play or pause', 'M8 6v12M15 6v12'],
  ['next', 'Skip', 'M17 6v12M6 6l8 6-8 6z'],
]) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'mkey';
  b.setAttribute('aria-label', label);
  b.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  b.addEventListener('click', (e) => { e.stopPropagation(); window.aang?.media?.(key); });
  mediaRow.append(b);
}
scroller.after(mediaRow);

function showWhisper(w) {
  endJobs();
  reveal.start(w.text, false);
  reveal.skip();
  expanded = false;
  bubble.classList.remove('wide', 'widest');
  bubble.classList.add('whisper');
  who.hidden = true;
  working.hidden = true;
  asks.hidden = true;
  for (const id of ['means', 'exact', 'mailcard']) { const e = document.getElementById(id); if (e) e.hidden = true; }
  mediaRow.hidden = w.controls !== 'media';
  bubble.classList.remove('enter'); void bubble.offsetWidth; bubble.classList.add('enter');
  show();
  paint();
  scheduleHide();
}

// ---------------------------------------------------------------- the morning brief (6.15, sheet 13)
// Today at a glance in the open size: Today, Needs a reply, Overnight, Your Claude week. Built with
// textContent only: subjects and sender names are other people's words. A logo is a data URL the Core
// already checked and kept (logos.ts), drawn by <img>.
const card = document.createElement('div');
card.className = 'briefcard';
card.hidden = true;
scroller.after(card);
const T = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const timeOf = (iso) => new Date(iso).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }).replace(/\s?[ap]\.?m\.?/i, '');
function medal(u) {
  const m = T('span', 'med');
  if (u.logo && /^data:image\//.test(u.logo)) { const i = document.createElement('img'); i.src = u.logo; i.alt = ''; m.classList.add('logo'); m.append(i); }
  else m.textContent = (u.from.trim()[0] ?? '?').toUpperCase();
  return m;
}
// Sheet 24, the Lantern (his pick, 2026-10-14): the brief on dark wood, the day as morning / afternoon / evening under a
// lamp glow, then parchment slips in his order: job hunt, waiting on you, today. Only mail where a person is waiting on
// him reaches here (briefmail.ts). A row opens in place on a click; its buttons ask Aang to dig in, and only then is
// any quota spent. The buttons send which row and which button, never words: the brain writes the request itself.
const PART = { morn: 'MORN', aftn: 'AFTN', eve: 'EVE' };
const JOBBY = /\b(interview|recruit|screen(ing)?|hiring|offer|onboarding|panel)\b/i;
let lastBrief = null, parkedBrief = null;
/** After the questions are answered and nothing is running, the brief that stepped aside comes back (his rule: turns). */
function briefBack() {
  if (!parkedBrief || waiting.length || livePlan) return false;
  const b = parkedBrief; parkedBrief = null;
  onBrain({ t: 'bubble', text: '', brief: b });
  return true;
}
function showBrief(b) {
  lastBrief = b;
  card.replaceChildren();
  const unread = Array.isArray(b.unread) ? b.unread : [], events = Array.isArray(b.events) ? b.events : [];
  const now = new Date(), hour = now.getHours();

  // the top: the day, and the lamp with the three parts of it
  const top = T('div', 'lt-top');
  const date = T('div', 'lt-date');
  date.append(T('small', '', hour < 12 ? 'GOOD MORNING' : hour < 17 ? 'GOOD AFTERNOON' : 'GOOD EVENING'),
    T('b', '', String(b.day ?? '').split(',')[0] || now.toLocaleDateString('en-CA', { weekday: 'long' })));
  // A long day name ("Wednesday") ran past the card's edge on the Mac (2026-10-28): a size down rather than cut off.
  const dayEl = date.querySelector('b'); if (dayEl && (dayEl.textContent ?? '').length >= 8) dayEl.classList.add('long');
  const rest = String(b.day ?? '').split(',').slice(1).join(',').trim();
  const wet = b.rainFrom ? `${b.rainIsSnow ? 'Snow' : 'Rain'} from ${b.rainFrom}, ${b.rainIsSnow ? 'dress warm' : 'bring a jacket'}.` : '';
  const sky = !wet && b.weather ? `${b.weather.words.charAt(0).toUpperCase() + b.weather.words.slice(1)}, ${b.weather.low} to ${b.weather.high}.` : '';
  date.append(T('span', '', [rest ? rest + '.' : '', wet || sky].filter(Boolean).join(' ')));
  top.append(date);
  if (Array.isArray(b.parts) && b.parts.length) {
    const lamp = T('div', 'lt-lamp');
    const nowPart = hour < 12 ? 'morn' : hour < 18 ? 'aftn' : 'eve';
    for (const p of b.parts) {
      const c = T('div', 'lt-part' + (p.part === nowPart ? ' now' : ''));
      c.append(T('i', '', PART[p.part] ?? ''));
      const icon = pixIcon(SKIES.includes(p.sky) ? p.sky : 'cloud'); if (icon) c.append(icon);
      c.append(T('b', '', `${Math.round(Number(p.temp))}\u00b0`));
      lamp.append(c);
    }
    top.append(lamp);
  }
  card.append(top);

  // the rows, each knowing its place in the brief the brain sent (mail first, then events, then the matches)
  const body = T('div', 'lt-body');
  const slip = (title) => { const s = T('div', 'lt-slip'); s.append(T('h3', '', title)); return s; };
  const job = slip('JOB HUNT'), wait = slip('WAITING ON YOU'), today = slip('TODAY');
  const tile = (iconName, logo, art) => {
    const t = T('div', 'lt-tile' + (logo ? ' round' : ''));
    if (art) { const i = document.createElement('img'); i.src = art; i.alt = ''; i.className = 'lt-art'; t.append(i); }
    else if (logo && /^data:image\//.test(logo)) { const i = document.createElement('img'); i.src = logo; i.alt = ''; t.append(i); }
    else { const icon = pixIcon(iconName); if (icon) t.append(icon); }
    return t;
  };
  const row = (into, { icon, logo, art, title, sub, when, whenSmall, item, more, acts }) => {
    const r = T('div', 'lt-item' + (acts?.length ? ' can' : ''));
    const head = T('div', 'lt-head');
    const txt = T('div', 'lt-txt'); txt.append(T('b', '', title)); if (sub) txt.append(T('span', '', sub));
    head.append(tile(icon, logo, art), txt);
    if (when) { const w = T('div', 'lt-when', when); if (whenSmall) w.append(T('small', '', whenSmall)); head.append(w); }
    r.append(head);
    if (acts?.length) {
      const open = T('div', 'lt-open'); open.hidden = true;
      for (const line of more ?? []) if (line) open.append(T('p', '', line));
      const keys = T('div', 'lt-keys');
      acts.forEach(([label, act], n) => {
        const k = T('button', 'key sm' + (n === 0 ? ' primary' : n === 1 ? ' plum' : ' burnt'), label);
        k.type = 'button';
        k.addEventListener('click', (e) => { e.stopPropagation(); keys.querySelectorAll('button').forEach((x) => { x.disabled = true; }); window.aang?.briefAct?.({ item, act }); });
        keys.append(k);
      });
      open.append(keys);
      r.append(open);
      head.addEventListener('click', () => { const was = !open.hidden; card.querySelectorAll('.lt-open').forEach((o) => { o.hidden = true; o.parentElement.classList.remove('open'); }); open.hidden = was; r.classList.toggle('open', !was); fit(); reportSize(); });
    }
    into.append(r);
  };
  const clock = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  // Events first in each slip (a time is the most urgent thing), then the people waiting.
  events.forEach((e, j) => {
    const start = e.start ? clock(e.start) : '', end = e.end ? clock(e.end) : '';
    row(JOBBY.test(e.title) ? job : today, {
      icon: 'cal', item: unread.length + j, title: e.title, sub: e.where || (e.allDay ? 'All day' : ''),
      when: e.allDay ? 'ALL DAY' : start, whenSmall: JOBBY.test(e.title) ? 'TODAY' : '',
      more: [e.allDay ? 'All day' : `${start}${end ? ' to ' + end : ''}`, e.where ? `At ${e.where}` : ''],
      acts: e.where ? [['Prep me', 'prep'], ['Drive time', 'drive']] : [['Prep me', 'prep']],
    });
  });
  unread.forEach((u, i) => {
    const sent = u.at ? new Date(u.at) : null;
    const whenSent = sent ? (sent.toDateString() === now.toDateString() ? clock(sent.toISOString()) : 'yesterday') : '';
    row(u.job ? job : wait, {
      icon: 'letter', logo: u.logo, item: i,
      title: `${u.from} is waiting on you`, sub: u.why || u.subject, when: 'REPLY',
      more: [`"${u.subject}"${whenSent ? `, sent ${whenSent}` : ''}`],
      acts: [['Go through it', 'through'], ['Reply', 'reply']],
    });
  });
  if (b.jobsNew > 0) row(job, { icon: 'star', item: unread.length + events.length, title: `${b.jobsNew} new job match${b.jobsNew === 1 ? '' : 'es'}`, sub: '', acts: [['See them', 'matches']] });
  for (const w of Array.isArray(b.waiting) ? b.waiting : []) row(wait, { icon: 'claude', title: String(w), sub: '' });
  // Samara has an update ready (his ask, 2026-10-14): the lantern on its own, and an Update button.
  if (b.engine && typeof b.engine.title === 'string') row(today, { art: 'art/samara/samara-lantern-32.png', item: 0, title: 'Samara has an update', sub: b.engine.title, when: 'UPDATE',
    more: ["Chrome's newest security fixes. Samara restarts in a few seconds and your tabs come back."], acts: [['Update', 'engine']] });
  for (const s of [job, wait, today]) if (s.children.length > 1) body.append(s);
  // Sheet 65: the Addons slip under Today (addonslip.js). Update ticked sends the ids still ticked; Not now folds it away.
  const addons = addonsSlip(b.addons, { update: (ids) => window.aang?.addonsUpdate?.(ids), later: () => { fit(); reportSize(); } });
  if (addons) body.append(addons);
  if (!body.children.length) { const s = slip('ALL CLEAR'); s.append(T('p', 'lt-clear', 'Nothing needs you this morning.')); body.append(s); }
  card.append(body);

  // the keys: Got it, and the most useful next thing; the week's meter on the right
  const keys = T('div', 'keys lt-foot');
  const k = (label, letter, cls, fn) => { const x = T('button', 'key sm' + (cls ? ' ' + cls : ''), label); x.type = 'button'; x.append(T('span', 'k', letter)); x.addEventListener('click', fn); keys.append(x); };
  k('Got it', 'A', 'primary', () => cardDone());
  const first = unread[0];
  if (first) k(`Reply to ${String(first.from).split(/\s+/)[0]}`, 'X', 'plum', () => { keys.querySelectorAll('button').forEach((x) => { x.disabled = true; }); window.aang?.briefAct?.({ item: 0, act: 'reply' }); });
  if (typeof b.week === 'number') {
    const m = T('span', 'lt-meter', 'WEEK ');
    const bar = T('i', '');
    const lit = Math.round(Math.min(1, Math.max(0, b.week)) * 10);
    for (let n = 0; n < 10; n++) bar.append(T('u', n < lit ? 'on' + (b.week >= 0.8 ? ' hot' : '') : ''));
    m.append(bar, document.createTextNode(` ${Math.round(b.week * 100)}%`));
    keys.append(m);
  }
  card.append(keys);
  card.hidden = false;
}

// ---------------------------------------------------------------- when the brain is down (6.14b)
// Restarts are normal (the Core restarts several times a day), so nothing shows for the first 8 s: a
// quick restart is never announced. Past that, ONE MOMENT; past a minute, STILL DOWN with Try again.
// Never while he is in a game. When it comes back, one quiet line, and only if he was told it was down.
let downTimers = [], toldDown = false;
function dropBrainAsks() {
  for (let i = waiting.length - 1; i >= 0; i--) if (waiting[i].t === 'brain.wait' || waiting[i].t === 'brain.down') waiting.splice(i, 1);
}
window.aang?.onConnected?.((up) => {
  downTimers.forEach(clearTimeout); downTimers = [];
  if (up) {
    const was = asking && (asking.t === 'brain.wait' || asking.t === 'brain.down');
    dropBrainAsks();
    if (was) { asking = null; asks.hidden = true; asks.replaceChildren(); if (!showTopAsk()) { bubble.hidden = true; snapShut(); window.aang?.bubbleHidden?.(); } }
    if (toldDown) { toldDown = false; showWhisper({ text: 'I\u2019m back. Nothing was lost.' }); }
    return;
  }
  const tell = (t) => { if (quiet || petHidden) return; dropBrainAsks(); toldDown = true; queueAsk({ t, id: t }); showTopAsk(); };
  downTimers.push(setTimeout(() => tell('brain.wait'), 8000), setTimeout(() => tell('brain.down'), 60000));
});

// ---------------------------------------------------------------- research cards (6.15b, sheet 6 section 8)
// The weekly sweep as a card: what keeps coming up, then the top finds from each source with the source's
// own score (never compared across sources), and the honest line. No verdicts: the sweep does not judge,
// and a Borrow or Avoid it did not earn would be made up.
const SRC = { github: ['GITHUB', 'gh'], hn: ['HN', 'hn'], arxiv: ['ARXIV', 'ax'], reddit: ['REDDIT', 'rd'] };
function showResearch(r, turnRow) {
  card.replaceChildren();
  const T = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const wrap = T('div', 'research');
  wrap.append(T('p', 'eyebrow', `RESEARCH \u00b7 WEEK OF ${String(r.week).toUpperCase()}`), T('div', 'lead', `Swept ${r.swept} things.`));
  if (r.repeats?.length) {
    wrap.append(T('div', 'sub', 'KEEPS COMING UP'));
    for (const x of r.repeats) { const row = T('div', 'repeat'); row.append(T('b', '', x.name), T('span', '', `${x.times} times over ${x.weeks} week${x.weeks === 1 ? '' : 's'} (${x.sources})`)); wrap.append(row); }
  }
  for (const f of r.finds ?? []) {
    const [label, cls] = SRC[f.source] ?? ['WEB', 'gh'];
    const row = T('div', 'find');
    const mid = T('div', 'fmid');
    const title = T('button', 'ttl', f.title);
    title.type = 'button';
    title.title = f.url;
    // A link opens in his own browser, through the same checked door as a reply's link chips.
    title.addEventListener('click', () => { if (/^https:\/\//.test(f.url)) window.aang?.openThing?.({ kind: 'link', value: f.url }); });
    mid.append(title);
    if (f.blurb) mid.append(T('div', 'bl', f.blurb));
    const score = f.source === 'github' ? `${f.score >= 1000 ? (f.score / 1000).toFixed(1) + 'k' : f.score} stars` : f.source === 'hn' ? `${f.score} points` : f.source === 'reddit' ? `${f.score} up` : 'new';
    row.append(T('span', 'src ' + cls, label), mid, T('span', 'score', score));
    wrap.append(row);
  }
  wrap.append(T('p', 'honest', 'Aang wrote this; nothing here is checked.'));
  card.append(wrap);
  const keys = T('div', 'keys');
  const k = (label, letter, cls, fn) => { const x = T('button', 'key sm' + (cls ? ' ' + cls : ''), label); x.type = 'button'; x.append(T('span', 'k', letter)); x.addEventListener('click', fn); keys.append(x); };
  k('Tell me about one', 'A', 'primary', () => { if (turnRow !== null) window.aang?.replyToTurn?.(turnRow, 'This week\u2019s research'); });
  if (r.file) k('Open the full notes', 'X', '', () => window.aang?.openThing?.({ kind: 'file', value: r.file }));
  k('Done', 'Z', '', () => cardDone());
  card.append(keys);
  card.hidden = false;
}

// ---------------------------------------------------------------- the drop (6.17 pass 3, sheet 13)
// coucou's drop choreography (MIT, github.com/Louis-CFM/coucou, windows/src/upload/sequence.ts): same
// phases and timings, redrawn in Aang's world, lifted from the approved sheet. An air ball chases the file
// and locks on, airbends it in with a squash and two chews, then rides the reading bar while Qwen reads it
// (held at 92% until Qwen has actually finished), pops a gold check, and the balloon asks what to do.
// A refused file is spat back out with a red flash and a plain refusal. Nothing happens on the drop alone.
const ZW = 380, REST_Y = 74, BY = 78, BX0 = 18, BX1 = ZW - 30;
const eOut = (t) => 1 - Math.pow(1 - t, 3), eIn = (t) => t * t * t, eInOut = (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const eBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const seg = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a))), lerp = (a, b, t) => a + (b - a) * t;
const curve = (u) => u < .4 ? .6 * eOut(u / .4) : u < .85 ? .6 + .32 * eInOut((u - .4) / .45) : .92 + .08 * eIn((u - .85) / .15);
let D = null, dropLoop = 0;
const $d = (id) => document.getElementById(id);
function zoneEls() {
  card.replaceChildren();
  const z = document.createElement('div'); z.className = 'zone'; z.id = 'zone';
  const zl = document.createElement('div'); zl.className = 'zl'; zl.id = 'zl';
  const b = document.createElement('b'); b.textContent = 'DROP IT ON ME';
  const zc = document.createElement('div'); zc.className = 'zc';
  for (const k of ['PDF', 'PICTURE', 'NOTES', 'FOLDER', 'LINK']) { const s = document.createElement('span'); s.textContent = k; zc.append(s); }
  zl.append(b, zc);
  const bar = document.createElement('div'); bar.className = 'bar'; bar.id = 'bar';
  const bl = document.createElement('div'); bl.className = 'bl'; bl.id = 'bl';
  const bt = document.createElement('div'); bt.className = 'bt'; const bf = document.createElement('i'); bf.id = 'bf'; bt.append(bf);
  const bp = document.createElement('span'); bp.className = 'bp'; bp.id = 'bp'; bp.textContent = '0%';
  bar.append(bl, bt, bp);
  const orb = document.createElement('div'); orb.className = 'orb'; orb.id = 'orb'; orb.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
  const gf = document.createElement('div'); gf.className = 'gf'; gf.id = 'gf';
  const ck = document.createElement('div'); ck.className = 'ck'; ck.id = 'dropck'; ck.textContent = '\u2713';
  z.append(zl, bar, orb, gf, ck);
  card.append(z);
  card.hidden = false;
}
function startDrop() {
  if (D) return;
  if (cockpit) { cockCommit(); live = { skip: true }; }
  asking = null; asks.hidden = true;
  who.textContent = ''; who.hidden = true; who.classList.remove('plaque');
  scroller.hidden = true; working.hidden = true; tools.hidden = true;
  bubble.classList.add('wide');
  zoneEls();
  // The file is over the pet, just right of the balloon: the ball rests on that side.
  D = { drop: null, cx: ZW - 36, cy: REST_Y, bx: ZW - 40, vx: 0, tilt: 0, locked: false, lockAt: -9, over: true, dx: ZW - 36, dy: REST_Y, verdict: null, result: null, heldAt: 0 };
  bubble.classList.remove('enter'); void bubble.offsetWidth; bubble.classList.add('enter');
  show(); fit(); reportSize();
  clearTimeout(hideTimer);
  dropLoop = setInterval(dropTick, 16);
}
function endDrop() { clearInterval(dropLoop); dropLoop = 0; D = null; }
function setOrb(x, y, d, sx, sy, rot) {
  const o = $d('orb'); if (!o) return;
  Object.assign(o.style, { width: d + 'px', height: d + 'px', left: (x - d / 2) + 'px', top: (y - d / 2) + 'px', transform: `rotate(${rot}deg) scale(${sx},${sy})` });
  o.classList.toggle('small', d < 24);
}
function doDrop(verdict) {
  if (!D) startDrop();
  if (!D || D.drop !== null) return;
  D.verdict = verdict;
  D.drop = performance.now() / 1000;
  const g = $d('gf');
  if (g) {
    const ext = (verdict.name.split('.').pop() || 'FILE').slice(0, 4).toUpperCase();
    g.textContent = verdict.folder ? 'DIR' : ext;
    g.style.background = verdict.refused ? '#B9B3C9' : verdict.folder ? '#FFC43C' : '#F2C1A6';
    g.style.display = 'grid';
  }
}
function dropTick() {
  if (!D) return;
  const z = $d('zone'); if (!z) { endDrop(); return; }
  const now = performance.now() / 1000, dt = 1 / 60, gf = $d('gf');
  if (D.drop === null) {
    const tx = Math.max(30, Math.min(ZW - 30, D.cx)), dist = Math.hypot(D.cx - D.bx, D.cy - REST_Y);
    if (!D.locked && dist < 60) { D.locked = true; D.lockAt = now; }
    if (D.locked && dist > 90) D.locked = false;
    const resp = D.locked ? .18 : .35, damp = D.locked ? .75 : .7, k = Math.pow(2 * Math.PI / resp, 2), c = 2 * damp * Math.sqrt(k);
    for (let i = 0; i < 4; i++) { const ac = k * (tx - D.bx) - c * D.vx; D.vx += ac * dt / 4; D.bx += D.vx * dt / 4; }
    D.tilt = lerp(D.tilt, Math.max(-.18, Math.min(.18, D.vx * .0015)), .2);
    const hop = D.locked ? -6 * Math.sin(Math.PI * seg(now, D.lockAt, D.lockAt + .15)) : 0;
    z.classList.toggle('over', D.over);
    z.style.background = D.over ? 'rgba(200,232,255,.22)' : 'transparent';
    setOrb(D.bx, REST_Y + hop, D.locked ? 48 : 42, 1, 1, D.tilt * 57);
    return;
  }
  // Reading waits for Qwen: the clock is held at 92% until the result is in, then carries on from there.
  const PS = 1.30, PE = PS + 2.4, HOLD = PS + 2.4 * .85;
  let s = now - D.drop;
  const reject = !!D.verdict.refused;
  if (!reject && !D.verdict.folder && !D.result && s >= HOLD) { if (!D.heldAt) D.heldAt = now; s = HOLD; }
  else if (D.heldAt && D.result) { D.drop += now - D.heldAt; D.heldAt = 0; s = now - D.drop; }
  let x = D.bx, y = REST_Y, d = 44, sx = 1, sy = 1;
  if (s < .08) { const q = eOut(seg(s, 0, .08)); sy = lerp(1, .92, q); sx = lerp(1, 1.06, q); }
  else if (s < .38) { const q = eInOut(seg(s, .08, .38)); sy = lerp(.92, 1.06, q); sx = lerp(1.06, .97, q); }
  else if (s < .65) { const q = seg(s, .38, .65); sy = q < .26 ? lerp(1.06, .82, eOut(q / .26)) : q < .74 ? lerp(.82, 1.1, eOut((q - .26) / .48)) : lerp(1.1, 1, eInOut((q - .74) / .26)); sx = 2 - sy; }
  const sk = seg(s, .08, .38);
  if (gf && (!reject || s < .45)) {
    const e = eIn(sk), ang = e * Math.PI * 3, r = (1 - e) * 16;
    gf.style.display = sk < 1 ? 'grid' : 'none';
    gf.style.left = (lerp(D.dx, x, e) + Math.cos(ang) * r - 15) + 'px';
    gf.style.top = (lerp(D.dy, y, e) + Math.sin(ang) * r - 19) + 'px';
    gf.style.transform = `rotate(${ang * 57}deg) scale(${1 - e * .92})`;
  }
  if (reject) {
    if (s >= .45 && gf) { const q = seg(s, .45, .95); gf.style.display = q < 1 ? 'grid' : 'none'; gf.style.left = (lerp(x, ZW + 30, eOut(q)) - 15) + 'px'; gf.style.top = (y - 19 - Math.sin(Math.PI * q) * 55) + 'px'; gf.style.transform = `rotate(${-q * 540}deg) scale(${.4 + q * .6})`; }
    z.style.background = `rgba(255,90,74,${.28 * Math.sin(Math.PI * seg(s, .35, 1.05))})`;
    z.style.borderColor = '#c0392b';
    setOrb(x, y, d, sx, sy, 0);
    if (s > 1.15) { const v = D.verdict; endDrop(); dropRefused(v); }
    return;
  }
  if (s >= .65 && s < .93) { const q = ((s - .65) % .14) / .14; sy = 1 - .09 * Math.sin(Math.PI * q); sx = 1 + .06 * Math.sin(Math.PI * q); }
  if (D.verdict.folder && s >= 1.0) { const v = D.verdict; endDrop(); dropFolder(v); return; }
  if (s >= .93 && s < PS) { const q = eInOut(seg(s, .93, 1.28)); x = lerp(D.bx, BX0, q); y = lerp(REST_Y, BY, q); d = lerp(44, 14, q); if (s < 1.28) { const q2 = seg(s, .93, 1.28); sy = 1 + .12 * Math.sin(Math.PI * q2); sx = 1 - .06 * Math.sin(Math.PI * q2); } }
  const bl = $d('bl'), bf = $d('bf'), bp = $d('bp'), ck = $d('dropck');
  if (bl && !bl.textContent) bl.textContent = 'QWEN IS READING ' + D.verdict.name.toUpperCase();
  if (s >= PS) {
    const p = curve(seg(s, PS, PE));
    x = lerp(BX0, BX1, p); y = BY; d = 14;
    bf.style.width = (p * 100) + '%'; bp.textContent = Math.round(p * 100) + '%';
    const v = (curve(seg(s + .01, PS, PE)) - p) / .01, st = Math.max(0, Math.min(1, v * .18));
    sx = 1 + .25 * st; sy = 1 - .15 * st;
    z.style.background = `rgba(200,232,255,${p * .5})`;
  }
  if (s >= PE) {
    x = BX1; y = BY - 8 * Math.sin(Math.PI * seg(s, PE, PE + .2));
    ck.style.transform = `scale(${eBack(seg(s, PE, PE + .25))})`;
    z.style.borderColor = '#7fb6e6'; bp.textContent = '';
    z.style.background = `rgba(200,232,255,${.5 + .2 * Math.sin(Math.PI * seg(s, PE, PE + .4))})`;
  }
  if (s >= PE + .25) { const q = eInOut(seg(s, PE + .25, PE + .7)); x = lerp(BX1, ZW / 2, q); y = lerp(BY, REST_Y - 14, q); d = lerp(14, 44, eBack(seg(s, PE + .25, PE + .7))); }
  $d('zl').style.opacity = String(1 - seg(s, .93, 1.13));
  $d('bar').style.opacity = String(seg(s, 1.05, 1.30) * (1 - seg(s, PE + .25, PE + .45)));
  setOrb(x, y, d, sx, sy, 0);
  if (s >= PE + .85) { const r = D.result; endDrop(); dropReady(r); }
}
function dropMessage(plaqueText, plaqueClass, lines, keys) {
  // Its own block, like the brief: the reply area caps its height to the reply's lines and clipped this.
  card.replaceChildren();
  scroller.hidden = true;
  who.textContent = plaqueText; who.hidden = false; who.classList.add('plaque');
  who.classList.toggle('red', plaqueClass === 'red');
  const body = document.createElement('div'); body.className = 'dropmsg';
  for (const [b, rest] of lines) { const p = document.createElement('p'); if (b) { const x = document.createElement('b'); x.textContent = b; p.append(x, ' '); } p.append(rest); body.append(p); }
  card.append(body);
  card.hidden = false;
  asks.replaceChildren();
  for (const k of keys) {
    const btn = document.createElement('button');
    btn.className = 'key sm' + (k.primary ? ' primary' : '');
    btn.type = 'button'; btn.textContent = k.label;
    const tag = document.createElement('span'); tag.className = 'k'; tag.textContent = k.key; btn.append(tag);
    btn.addEventListener('click', k.go);
    asks.append(btn);
  }
  asks.hidden = !keys.length;
  if (keys.length) { asks.classList.add('guard'); setTimeout(() => asks.classList.remove('guard'), 600); }
  reveal.start('', false); reveal.skip();
  fit(); reportSize();
  // A plain message goes by itself after a while; one with choices stays until he picks.
  clearTimeout(hideTimer);
  if (!keys.length) hideTimer = setTimeout(() => (cockpit ? cardDone() : goAway()), 12000);
}
function dropRefused(v) {
  dropMessage('I WON\u2019T OPEN THAT', 'red', [['', v.refused]], []);
}
function dropFolder(v) {
  dropMessage('A WHOLE FOLDER', '', [[v.name, 'is a folder. Reading whole folders comes next, with the plan first; for now drop the files you want me to look at.']], []);
}
function dropReady(r) {
  if (!r) return;
  const plaque = `${r.name} \u00b7 ${r.kb} KB \u00b7 FROM ${r.from}`.toUpperCase();
  const lines = [[`${r.name} is ready.`, (r.summary ? r.summary + ' ' : '') + 'What should I do with it?']];
  if (r.more > 0) lines.push(['', `You dropped ${r.more + 1}; I read the first. Drop the others one at a time.`]);
  dropMessage(plaque, '', lines, [
    { label: 'Ask Aang about it', key: 'A', primary: true, go: () => { window.aang?.dropAsk?.(r.path); cardDone(); } },
    { label: 'Remember it', key: 'X', go: () => { window.aang?.dropKeep?.(r.path); cardDone(); } },
    { label: 'Not now', key: 'Z', go: () => cardDone() },
  ]);
}

// ---------------------------------------------------------------- what the brain says
/** The last thing shown here, whatever it was (a reply, the brief, a card, a whisper), and when (sheet 53's 5-min rule). */
let lastShown = null, lastShownAt = 0;
/** The hello he said on sliding out, while it may still be showing (2026-10-21). Never counts as something he said. */
let greetText = '';
/** Sheet 53 section 3: how long ago still counts as "he just said it". */
const RECENT_MS = 5 * 60_000;
/**
 * He clicked Aang (sheet 53, his rules, 2026-10-21). The chat box is already opening beside him (main.ts); this only
 * decides what, if anything, shows above it:
 *   'recent'  a question of Aang's that is still waiting comes back first (he must be able to answer it); otherwise the
 *             line Aang said in the last 5 minutes, small, with its "N MIN AGO" stamp. Older talk: the wheel over Aang,
 *             or ask him. Something already showing stays as it is.
 *   'jobs'    the click was on Claude's working mark: what a session waits on (the question card with its keys), else
 *             every running job as a folded bar. False with no Claude jobs at all, so main.ts opens the chat box instead.
 */
function recall(what) {
  // Sheet 56 (2026-10-21): "Look back" in his right-click menu opens the scroll-back, the same as the wheel up over it.
  if (what === 'back') { enterReading(); return reading; }
  if (what === 'jobs') {
    if (cockpit || !claude) return false;
    if (claude.anyWaiting()) { endSessions(); if (reading) leaveReading(false); claude.unpark(); claudeWaiting(true, true, true); return true; }
    // 2026-10-22: finished jobs he has not seen count too (the teal tick): their done cards show.
    if (claude.running() > 0 || claude.unread() > 0) { endSessions(); showJobs(); return true; }
    return false;
  }
  if (bubble.hidden) endSessions();
  // 2026-10-21 (his report: the jobs card stayed above the chat box): clicking Aang is the chat box, so a jobs card (or
  // the old-sessions card) from Claude's mark goes. A question still waiting, or the line from the last 5 minutes, takes
  // the bubble instead; otherwise it simply leaves.
  if (!bubble.hidden && (jobsOpen || sessionsOpen)) {
    endSessions(); endJobs();
    if (waiting.length) { showTopAsk(); return true; }
    if (lastShown && Date.now() - lastShownAt < RECENT_MS) return showRecent(lastShown);
    clearTimeout(hideTimer); claude?.park();
    if (overNow) { overNow = false; document.getElementById('wrap')?.classList.remove('over'); window.aang?.bubbleClickable?.(false); }
    goAway();
    return false;
  }
  // His rule (2026-10-21): clicking Aang is the chat box plus ONE bubble at most. A hello from sliding out is not
  // something he said, so it gives way: the line from the last 5 minutes takes the same bubble, or it simply goes.
  if (!bubble.hidden && greetText && reveal.whole === greetText) {
    greetText = '';
    if (!waiting.length && !(lastShown && Date.now() - lastShownAt < RECENT_MS)) { clearTimeout(hideTimer); goAway(); return false; }
  } else if (!bubble.hidden) return true;
  if (waiting.length) { showTopAsk(); return true; }
  if (lastShown && Date.now() - lastShownAt < RECENT_MS) return showRecent(lastShown);
  return false;
}
window.aang?.onRecall?.((what) => { let ok = false; try { ok = recall(what); } catch { ok = false; } window.aang?.recalled?.(ok); });
/** The line he said a moment ago, small over the chat box, with its age on the bubble's corner (sheet 53, click-2-recent). */
function showRecent(m) {
  const text = String(m.text || (m.brief ? 'Your morning brief' : m.research ? 'This week\u2019s research' : '')).replace(/\s+/g, ' ').trim();
  if (!text) return false;
  showWhisper({ text });
  const mins = Math.floor((Date.now() - lastShownAt) / 60_000);
  if (wrapEl) { wrapEl.dataset.ago = mins < 1 ? 'JUST NOW' : `${mins} MIN AGO`; wrapEl.classList.add('ago'); }
  recentOpen = true;
  scheduleHide();
  return true;
}
/**
 * Claude's jobs from the working mark (sheet 53 section 4): one line ("Claude is on two jobs."), then every running job as
 * its own folded 45f bar on the bubble's paper. A bar unfolds its tasks on a click; a click anywhere else shrinks it away.
 */
const COUNT = ['no', 'one', 'two', 'three', 'four', 'five', 'six'];
// 2026-10-22: with nothing running and only done cards left, the line says what finished instead.
const jobsLine = (n, done = 0) => n > 0 || !done ? `Claude is on ${COUNT[n] ?? n} job${n === 1 ? '' : 's'}.` : `Claude finished ${COUNT[done] ?? done} job${done === 1 ? '' : 's'}.`;
const jobsLineNow = () => jobsLine(claude?.running() ?? 0, claude?.unread() ?? 0);
function showJobs() {
  if (reading) leaveReading(false);
  onBrain({ t: 'bubble', text: jobsLineNow(), stream: false, recalled: true, fromPet: true, jobsView: true });
  bubble.classList.add('wide');
  fit(); reportSize();
}
/** Anything else taking the bubble ends the jobs view (the mark stays until the jobs are done). */
function endJobs() { if (!jobsOpen) return; jobsOpen = false; claude?.refresh(); }
/**
 * 2026-10-21 (his report: Aang's "•••" showed inside the Claude jobs card, above the bars): he sent Aang something, so
 * the jobs card gives way to Aang's answer. One bubble, never mixed: the bars and the "Claude is on N jobs" line go, his
 * question goes on the line above, and the dots (then the reply) come under it. The old-sessions card goes the same way.
 */
function jobsGiveWay() {
  if (!jobsOpen && !sessionsOpen) return;
  endSessions(); endJobs();
  if (bubble.hidden) return;
  reveal.start('', false); reveal.skip();
  bubble.classList.remove('wide', 'widest', 'whisper');
  setSpeaker(null);
  const line = asked.replace(/\s+/g, ' ').trim();
  who.textContent = line.length > 50 ? line.slice(0, 49).trimEnd() + '…' : line;
  who.hidden = !who.textContent;
  paint(); fit(); reportSize();
}

// ---------------------------------------------------------------- Claude's mark, clicked (2026-10-21)
// The pet tells us the mark was clicked (`mark.click`, worked out from its own drawing) and the brain adds the sessions
// its older hook tracker knows. Claude sessions started before the link mod have no live job here, only that tracker,
// and they light the same honey mark: so a click on it must still say what they are. Never nothing.
let sessionsOpen = false;
/** Messages that take the bubble over, and so end the old-sessions card first. Not claude.jobs/claude.wait: those are
 *  state updates that arrive all the time, and ending the card on them would blank it while he reads. */
const SESSION_ENDERS = new Set(['bubble', 'whisper', 'pet.say', 'permission', 'consent', 'fact.ask', 'backup.ask', 'plan', 'claude.start', 'timer.done', 'drop.hover', 'drop.go', 'queued']);
function markClick(sessions) {
  if (cockpit) return false;
  // The link jobs first: what one waits on, else every running job (the existing jobs view).
  if (claude && (claude.anyWaiting() || claude.running() > 0 || claude.unread() > 0)) return recall('jobs');
  endSessions();
  if (reading) leaveReading(false);
  // 2026-10-21: else exactly the sessions the brain lit the mark for (every source, one list), so a lit mark never
  // answers "not working". Only an empty list says so, and then the mark is off too.
  const list = (Array.isArray(sessions) ? sessions : []).filter((s) => s && typeof s.project === 'string' && s.project).slice(0, 4);
  if (!list.length) { greetText = ''; showWhisper({ text: 'Claude isn’t working on anything right now.' }); return true; }
  showSessions(list);
  return true;
}
/** The older sessions as a small card: the project, what it is on (its prompt) or that it waits on him, and Open in Claude. */
function showSessions(list) {
  endJobs();
  greetText = '';
  // Aang's own question steps aside, still waiting, and comes back after (the same as a reply arriving).
  if (asking) { asking = null; asks.hidden = true; asks.replaceChildren(); askParked = true; }
  bubble.classList.remove('whisper', 'lantern', 'widest');
  bubble.classList.add('wide');
  working.hidden = true; tools.hidden = true; mediaRow.hidden = true; closeBoard();
  for (const id of ['means', 'exact', 'mailcard']) { const e = document.getElementById(id); if (e) e.hidden = true; }
  setSpeaker(null);
  const cut = (t) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > 90 ? s.slice(0, 89).trimEnd() + '…' : s; };
  // 2026-10-21: the brain's one list (claudemark.ts claudeBusy), so a job can be here too (paused, failed, or popped out).
  const lines = list.map((s) => [s.project, s.phase === 'waiting'
    ? (s.what ? `is waiting on you: ${cut(s.what)}` : 'is waiting on you.')
    : s.phase === 'paused' ? 'is paused.' : s.phase === 'failed' ? 'stopped with an error.' : s.phase === 'done' ? 'is done.'
    : (s.what ? `is working on “${cut(s.what)}”` : 'is working.')]);
  if (list.some((s) => s.source === 'hook' || s.source === 'launched' || !s.source)) lines.push(['', 'Live progress shows for Claude sessions started from now on.']);
  // One key per machine rather than a row of identical ones. With exactly one session here that the app knows, its own
  // link (that session to the front, main.ts openInClaude); otherwise the Claude window comes forward. Either way the
  // bubble goes at once (his rule, 2026-10-21).
  const keys = [];
  const pc = list.filter((s) => s.host !== 'mac');
  const one = pc.length === 1 && typeof pc[0].open === 'string' && /^claude:\/\/claude\.ai\/epitaxy\//.test(pc[0].open) ? pc[0].open : 'front';
  if (pc.length) keys.push({ label: 'Open in Claude', key: 'C', primary: true, go: () => { window.aang?.openClaude?.(one); closeForClaude(); } });
  if (list.some((s) => s.host === 'mac')) keys.push({ label: 'Open on the MacBook', key: 'M', primary: !keys.length, go: () => { window.aang?.macFront?.(); closeForClaude(); } });
  bubble.classList.remove('enter'); void bubble.offsetWidth; bubble.classList.add('enter');
  show();
  dropMessage(list.length === 1 ? 'CLAUDE IS WORKING' : `CLAUDE · ${COUNT[list.length] ?? list.length} SESSIONS`.toUpperCase(), '', lines, keys);
  card.querySelector('.dropmsg')?.classList.add('sessions');
  for (const b of asks.children) b.dataset.sessions = '1';
  who.dataset.sessions = '1';
  sessionsOpen = true;
}
/** Takes the old-sessions card down (only what it put up), before something else uses the bubble. */
function endSessions() {
  if (!sessionsOpen) return;
  sessionsOpen = false;
  if (card.querySelector('.dropmsg.sessions')) { card.hidden = true; card.replaceChildren(); scroller.hidden = false; }
  for (const b of [...asks.children]) if (b.dataset.sessions) b.remove();
  if (!asks.children.length) asks.hidden = true;
  if (who.dataset.sessions) { delete who.dataset.sessions; who.textContent = ''; who.hidden = true; who.classList.remove('plaque', 'red'); }
}

// ---------------------------------------------------------------- thinking (2026-10-21)
/**
 * One calm thinking state, his ask: "the way he thinks, how long he thinks smoother and faster". The moment he presses
 * Enter (the Shell's `asked`, before the brain has even answered) the bubble becomes his question with the dots under
 * it, growing out on its spring; the brain's own dots, a tool's label and a retried turn only change the label; and
 * the answer's first words take the dots' place in the SAME bubble, with no fade-out-and-in and no hide between.
 * `thinkGen` is the empty reveal the thinking state was drawn for, so "still thinking" is one comparison.
 */
let thinkGen = -1;
/** Dots shown on Enter before the brain said a word: if it never does (6 s), they go rather than spin for ever. */
let provisional = 0;
const TURN_NEWS = new Set(['bubble.dots', 'bubble', 'whisper', 'queued', 'error', 'pet.say', 'timer.setup', 'bubble.clear', 'notes.board']);
const isThinking = () => thinkGen === reveal.gen && !reveal.whole && !working.hidden && !bubble.hidden && !bubble.classList.contains('leaving');
function thinking(label, lane, retry = false) {
  if (typeof label === 'string') doing.textContent = label;
  if (cockpit) { working.hidden = false; show(); return; }
  // 2026-10-21: already thinking: the brain's dots (and the lane they name) only change the label. The width was
  // decided when the bubble opened (exchangeWide) and stays for the whole exchange; widening here was the second of
  // the three resizes he saw on opening.
  if (isThinking()) return;
  // A retried turn goes back to the dots in the bubble he is already looking at, at the width it already has.
  const keep = retry && !bubble.hidden && !bubble.classList.contains('leaving');
  const had = [bubble.classList.contains('wide'), bubble.classList.contains('widest')];
  working.hidden = false;
  // A question waiting on him, a card, the notes or his history stay where they are: the dots join them, as before.
  if (asking || !card.hidden || reading || boardOpen) { show(); fit(); reportSize(); return; }
  clearTimeout(hideTimer);
  if (ticking) { clearInterval(ticking); ticking = null; }
  reveal.start('', false); reveal.skip();
  thinkGen = reveal.gen;
  expanded = false; replyList = null; claudeDone = null; noticeNote = null; holdOverride = 0; linkWord = ''; focusWindow = null; macSession = false;
  bubble.classList.remove('wide', 'widest', 'whisper', 'lantern', 'cdone');
  mediaRow.hidden = true; scroller.hidden = false;
  for (const id of ['means', 'exact', 'mailcard']) { const e = document.getElementById(id); if (e) e.hidden = true; }
  curAbout = null; paintAbout(false);
  setSpeaker(null);
  const line = asked.replace(/\s+/g, ' ').trim();
  who.textContent = line.length > 50 ? line.slice(0, 49).trimEnd() + '…' : line;
  who.hidden = !who.textContent; who.classList.remove('plaque', 'red');
  // New content fades in while the balloon grows (sheet 13); from here on, nothing restarts that until the answer is in.
  if (!keep) { bubble.classList.remove('enter'); void bubble.offsetWidth; bubble.classList.add('enter'); }
  show();
  // The exchange's one width (2026-10-21), measured with his question in place, before anything is drawn.
  if (keep) { bubble.classList.toggle('wide', had[0]); bubble.classList.toggle('widest', had[1]); }
  else bubble.classList.toggle('wide', exchangeWide(line, lane));
  paint();
}

function onBrain(m) {
  if (!m || typeof m !== 'object') return;
  // Sheet 60 B: the pointer is on the note Aang holds up (its own little window): the same as being on the bubble.
  if (m.t === 'held.hover') { heldOver = m.on === true; return; }
  if (provisional && (TURN_NEWS.has(m.t) || askFrom(m))) { clearTimeout(provisional); provisional = 0; }
  // A hello is not "something he said" (2026-10-21): only real messages come back over the chat box.
  if (!m.recalled && !m.greet && (m.t === 'bubble' || m.t === 'whisper' || m.t === 'pet.say') && (m.text || m.brief || m.research || m.card)) { lastShown = m; lastShownAt = Date.now(); }
  // Claude's mark was clicked (2026-10-21): always something in the bubble, never nothing.
  if (m.t === 'mark.click') { let ok = true; try { ok = markClick(m.sessions); } catch { ok = false; } window.aang?.recalled?.(ok); return; }
  // Anything else coming to the bubble ends the old-sessions card (its buttons live in the shared keys row).
  if (sessionsOpen && SESSION_ENDERS.has(m.t)) endSessions();

  // What he just asked, for the line above the answer. Kept until the next thing he says.
  if (m.t === 'asked' && typeof m.text === 'string') {
    asked = m.text;
    if (cockpit) { cockSaid(m.text); return; }
    jobsGiveWay();
    // 2026-10-21: thinking shows on Enter, not a brain round trip later (see thinking()).
    thinking('');
    clearTimeout(provisional);
    provisional = setTimeout(() => { provisional = 0; if (isThinking()) { working.hidden = true; goAway(); } }, 6000);
    return;
  }

  // An ask takes priority: it is the one thing that must be answered before anything else happens.
  // It joins the queue rather than replacing what is there, and the queue decides which is on top.
  if (askFrom(m)) {
    // He hid Aang: he cannot see it, so the pet answers no for him (PetWindow, the Clippy rule). A fact or
    // a backup offer is also skipped while muted, exactly as the old pet did.
    if (petHidden && m.t !== 'plan' && m.t !== 'timer.done') return;
    if (muted && (m.t === 'fact.ask' || m.t === 'backup.ask')) return;
    // Sheet 17: in a game a timer going off is the pet's sound, glow and quest mark; the card waits here and
    // comes out when he leaves the game. A permission is NOT held: Aang is stuck until it is answered.
    if (quiet && m.t === 'timer.done') { heldAsks.push(m); while (heldAsks.length > 3) heldAsks.shift(); return; }
    queueAsk(m); showTopAsk(); return;
  }

  // 6.17: a file over the pet, dropped, judged, and read.
  if (m.t === 'drop.hover') { if (m.on) startDrop(); else if (D && D.drop === null) { endDrop(); card.hidden = true; scroller.hidden = false; if (cockpit) cardDone(); else goAway(); } return; }
  if (m.t === 'drop.go' && typeof m.name === 'string') { doDrop({ name: m.name, refused: m.refused ?? '', folder: m.folder === true }); return; }
  if (m.t === 'drop.done' && typeof m.path === 'string') { if (D) D.result = m; else dropReady(m); return; }

  if (m.t === 'whisper' && typeof m.text === 'string') {
    if (cockpit) { cockWhisper(m); return; }
    if (!bubble.hidden && !bubble.classList.contains('whisper')) { whisperNext = m; return; }
    showWhisper(m);
    return;
  }

  // Parity with the old pet (2026-10-11): the pet's gate, applied to what Aang starts himself, the same rule
  // the pet uses (PetWindow, case "bubble"). Muted and hidden drop it unless it is truly blocking; in a game
  // it is HELD by the pet as an icon, glow and sound, and comes back here as a `pet.say` when he comes out.
  if (m.t === 'bubble' && typeof m.text === 'string' && m.proactive && !m.stream) {
    if ((muted || petHidden) && !m.blocking) return;
    if (quiet) { if (!heldMsg || heldRank(m) >= heldRank(heldMsg)) heldMsg = m; return; }
  }
  // A line the pet says itself, or the held message coming out. Shown like a reply, with no question above it.
  if (m.t === 'pet.say' && typeof m.text === 'string' && m.text) {
    const whole = heldMsg && heldMsg.text === m.text ? heldMsg : null;
    if (whole) heldMsg = null;
    const say = whole ? { ...whole, proactive: false, fromPet: true } : { t: 'bubble', text: m.text, stream: false, fromPet: true, hold: m.hold, focus: m.focus, host: m.host, link: m.link, greet: m.greet === true };
    // 2026-10-21: his hello on sliding out. Remembered so a click that opens the chat box can tell it is showing.
    greetText = m.greet === true ? m.text : '';
    window.dispatchEvent(new CustomEvent('aang:say', { detail: say }));
    return;
  }
  if (m.t === 'bubble.focus.failed') { window.dispatchEvent(new CustomEvent('aang:say', { detail: { t: 'bubble', text: 'That Claude window is closed now.', stream: false, fromPet: true, hold: 4000 } })); return; }
  // Sheet 37: a planned Claude session moved on to another step (at), or finished (null).
  if (m.t === 'plan.step' && livePlan?.samara && livePlan.samara === String(m.id ?? '')) {
    if (m.at === null) { livePlan = null; paintPlan(null, -1); said.textContent = 'Claude is done.'; fit(); reportSize(); scheduleHide(); briefBack(); return; }
    livePlan.at = Number(m.at) || 0; paintPlan(livePlan, livePlan.at); fit(); reportSize(); return;
  }
  if (m.t === 'ask.expired' && m.id != null) {
    const i = waiting.findIndex((w) => String(w.id ?? '') === String(m.id));
    if (i >= 0) { waiting.splice(i, 1); if (!showTopAsk()) askGone(); }
    return;
  }
  if (m.t === 'bubble.state') {
    const wasQuiet = quiet;
    quiet = m.quiet === true; muted = m.muted === true; petHidden = m.hidden === true;
    if (wasQuiet && !quiet) { releaseHeldAsks(); claudeWaiting(claude?.waiting() ?? false, true); }
    if (!quiet) heldMsg = null;          // the pet says the held one itself, through pet.say
    return;
  }

  if (m.t === 'bubble' && typeof m.text === 'string') {
    // Something new to say ends looking back: the scroll-back steps aside for it.
    if (reading && !m.stream) leaveReading(false);
    // Sheet 53: the jobs view is this one line plus the bars; anything else said ends it.
    // 2026-10-21: a streamed reply ends it too (it used to wait for the finished one, so his answer began over the bars).
    if (!cockpit) { const want = m.jobsView === true && !m.stream; if (want !== jobsOpen) { jobsOpen = want; claude?.refresh(); } }
    // The open cockpit (2026-10-21): a question pinned in the live area stays pinned, so anything said meanwhile goes
    // straight into the conversation as a row (a brief or a video row opens there). Otherwise the thing that was live
    // joins the conversation first, and this one takes the live area under it.
    if (cockpit) {
      // The same reply still arriving (the brain resends the whole text, then the finished one) is not a new thing.
      const sameReply = cockStreaming && reveal.whole && m.text.startsWith(reveal.whole.slice(0, 12));
      cockStreaming = m.stream === true;
      if (asking) { if (!m.stream) { live = liveOf(m); cockCommit(); fit(); reportSize(); } return; }
      if (!sameReply) cockCommit();
      live = liveOf(m);
      livePaper(live);
    }
    // Sheet 41: the one-line door. A message about a video (or a page) opens into it on a click.
    if (!m.stream) { curAbout = m.about && typeof m.about.url === 'string' && /^https?:\/\//.test(m.about.url) ? m.about : null; paintAbout(false); }
    // A reply arriving while a question is open: the question steps aside, still waiting, and comes back
    // when the reply has been read. Before, its keys stayed live under the reply's words.
    if (asking && !m.stream) { asking = null; asks.hidden = true; asks.replaceChildren(); askParked = true; }
    // A real reply takes the balloon back from a whisper.
    bubble.classList.remove('whisper');
    mediaRow.hidden = true;
    card.hidden = true; closeBoard();
    bubble.classList.remove('lantern');
    scroller.hidden = false;
    // The reply is the end of the job: the checklist has done its work.
    if (!m.stream) { livePlan = null; paintPlan(null, -1); }
    // The weekly research arrives as a card at the desk (6.15b), the same way the brief does.
    if (m.research && typeof m.research === 'object' && Array.isArray(m.research.finds)) {
      reveal.start('', false);
      who.textContent = 'THIS WEEK\u2019S RESEARCH';
      who.hidden = false;
      who.classList.add('plaque');
      scroller.hidden = true; working.hidden = true; tools.hidden = true;
      bubble.classList.add('wide', 'widest');
      showResearch(m.research, typeof m.turn === 'number' ? m.turn : null);
      bubble.classList.remove('enter'); void bubble.offsetWidth; bubble.classList.add('enter');
      show(); fit(); reportSize(); scheduleHide();
      return;
    }
    // The morning brief arrives as a card at the desk; the text stays for Discord and the old bubble.
    if (m.brief && typeof m.brief === 'object' && Array.isArray(m.brief.events)) {
      reveal.start('', false);
      who.textContent = ''; who.hidden = true; who.classList.remove('plaque');
      // Sheet 53: the brief sits on the bubble's own light paper; only the cockpit is wood.
      bubble.classList.toggle('lantern', cockpit);
      setSpeaker(null);
      scroller.hidden = true;
      working.hidden = true;
      bubble.classList.add('wide', 'widest');
      showBrief(m.brief);
      tools.hidden = true;
      bubble.classList.remove('enter'); void bubble.offsetWidth; bubble.classList.add('enter');
      show();
      fit();
      reportSize();
      scheduleHide();
      return;
    }
    who.classList.remove('plaque', 'red');
    // Muted means he never wants Aang starting a conversation. An ANSWER is not that, so only the
    // proactive ones are held - the brain marks them, and this is the one place it matters here.
    // (Muted, hidden and in-a-game are handled at the top, by the pet's own rule.)
    // A new reply replaces whatever was there; more of the same one is appended. The brain sends the
    // whole text each time, not a delta, so this is a replace either way - the Reveal decides the pace.
    // 2026-10-21: the FINISHED reply (stream: false, the same id) is the streamed one arriving whole, not a new
    // message. Treated as new, it restarted the reveal and the bubble's fade-in at the very end of every answer: the
    // whole bubble blinked, and the width was decided again. And text that starts over within the same turn (after
    // a tool call, or the finished text cleaned up differently) starts over in place: same width, no fade-in.
    const sameTurn = typeof m.id === 'string' && m.id !== '' && m.id === liveId && !bubble.hidden && !bubble.classList.contains('leaving');
    const same = (m.stream || (sameTurn && !cockpit)) && reveal.whole && m.text.startsWith(reveal.whole.slice(0, 12));
    const fromThinking = isThinking();
    liveId = typeof m.id === 'string' ? m.id : null;
    liveWho = typeof m.who === 'string' ? m.who : '';
    if (same) reveal.append(m.text, m.stream === true);
    else if (sameTurn && !cockpit) {
      const locked = lockGen === reveal.gen, held = holdGen === reveal.gen;
      reveal.start(m.text, m.stream === true);
      if (locked) lockGen = reveal.gen;
      if (held) holdGen = reveal.gen;
    }
    // A NEW reply starts revealing here. This line was deleted on 2026-10-05 by a regex that removed
    // every line mentioning setRating(), and this one happened to mention it - so a new reply never
    // started and the bubble showed only his question line. The widths reset with it: `wide` and
    // `widest` are decided once per reply (see paint), so a short answer after a long one must not
    // inherit the long one's width.
    else {
      reveal.start(m.text, m.stream === true);
      expanded = false;
      // 2026-10-21: the answer to the thinking bubble keeps the exchange's width (lockWidth); anything else starts over.
      if (fromThinking && !cockpit) holdGen = reveal.gen;
      else bubble.classList.remove('wide', 'widest');
      // An ask's explaining line and command belong to the ask, never to the reply that follows it.
      for (const id of ['means', 'exact', 'mailcard']) { const e = document.getElementById(id); if (e) e.hidden = true; }
      // New content fades in 160 ms into the grow, over 300 ms (sheet 13). Restarted, not stacked. Not out of the
      // thinking state (2026-10-21): his question stays put and the answer's words fade in on their own.
      if (!fromThinking) { bubble.classList.remove('enter'); void bubble.offsetWidth; bubble.classList.add('enter'); }
    }
    turn = typeof m.turn === 'number' ? m.turn : null;
    // The list rides on the finished reply only; a new reply starts without the last one's.
    if (!m.stream) replyList = m.list && Array.isArray(m.list.items) ? m.list : null;
    else if (!same) replyList = null;
    // Only on the finished reply, like the rows: a streamed delta is the same reply arriving again.
    if (!m.stream) focusWindow = typeof m.focus === 'string' && m.focus ? m.focus : null;
    if (!m.stream) macSession = m.host === 'mac';
    // 2026-10-21 (his ask): Claude's "finished" news is a door to that session: a click takes him there (goDone).
    if (!m.stream) {
      claudeDone = m.kind === 'claude' && m.done === true ? { session: m.session, open: m.open, project: m.project, host: m.host } : null;
      bubble.classList.toggle('cdone', Boolean(claudeDone));
      // 2026-10-22: a line Aang noticed in a note: a click opens that note (sheet 60 gives it its own look later).
      noticeNote = m.kind === 'note.notice' && m.notice && typeof m.notice.noteId === 'string' ? m.notice.noteId : null;
      noticeLine = noticeNote && typeof m.notice.line === 'string' ? m.notice.line : '';
    }
    if (!m.stream) linkWord = (focusWindow || macSession) ? (typeof m.link === 'string' && m.link ? m.link : 'Claude') : '';
    // Sheet 60 B: the note's name in his line is the link that opens it.
    if (!m.stream && noticeNote && typeof m.link === 'string' && m.link) linkWord = m.link;
    if (!m.stream) holdOverride = Number.isFinite(m.hold) && m.hold > 0 ? m.hold : 0;
    // HIS QUESTION, not the model's name. The old bubble puts what he asked here, dimmed and cut at 50
    // characters (BubbleView:953), so a reply always carries its question. Showing "QUICK" instead was
    // a label nobody needed, and he spotted it at once (2026-10-04).
    // Nothing above a message Aang started himself: there was no question.
    const line = m.proactive || m.jobsView ? '' : asked.replace(/\s+/g, ' ').trim();
    who.textContent = line.length > 50 ? line.slice(0, 49).trimEnd() + '…' : line;
    who.hidden = !who.textContent || cockpit;
    if (cockpit) bubble.classList.add('lantern');
    paintChange(!m.stream);
    if (!m.stream) setSpeaker(focusWindow || macSession ? 'claude' : m.proactive || m.fromPet ? 'aang' : null, macSession ? 'MAC' : 'PC', m.face);
    // 2026-10-21: the dots stay until a word of the answer is actually on the paper (a first chunk can be half a word),
    // so between thinking and answering there is never a moment of empty bubble.
    reveal.tick();
    dotsTillWords = !cockpit && reveal.streaming && shownWords(reveal.text) === 0;
    if (!dotsTillWords) working.hidden = true;
    show();
    paint();
    startTicking();
    // Sheet 65: Aang updating addons: the progress row and the names' icons (addonslip.js); any other line clears them.
    if (!m.stream) addonsLine(m, { scroller, said, fit: () => { fit(); reportSize(); } });
    // The cockpit is already the open state, so a message about a video opens straight into it (and widens).
    if (cockpit && curAbout && !m.stream) paintAbout(true);
    return;
  }

  // Sent while another turn is running: say where his message is in line (parity re-audit, 2026-10-13).
  if (m.t === 'queued' && Number.isFinite(m.position)) {
    doing.textContent = m.position > 1 ? `waiting, number ${m.position} in line` : 'waiting, next in line';
    working.hidden = false; show(); fit(); reportSize();
    return;
  }
  // An error the brain sent only to this window: said like any line of his, held a little longer.
  if (m.t === 'error' && typeof m.message === 'string') {
    onBrain({ t: 'bubble', text: (m.message + (typeof m.next === 'string' && m.next ? ' ' + m.next : '')).trim(), stream: false, fromPet: true, hold: 12000 });
    return;
  }
  if (m.t === 'bubble.dots') {
    if (m.on === false) { working.hidden = true; doing.textContent = typeof m.doing === 'string' ? m.doing : ''; return; }
    if (!cockpit) jobsGiveWay();
    thinking(typeof m.doing === 'string' ? m.doing : '', typeof m.who === 'string' ? m.who : undefined);
    return;
  }

  if (m.t === 'tool' && typeof m.label === 'string') {
    doing.textContent = m.label; planTool(m.name);
    // 2026-10-21: a tool call in the middle of an answer puts the dots back under what he is reading, with what it is
    // doing, instead of the text sitting there frozen; the answer's next words take their place again.
    if (!cockpit && !asking && !bubble.hidden && reveal.whole && reveal.streaming && working.hidden) { working.hidden = false; fit(); reportSize(); }
    return;
  }

  // A page of older turns. Keeping his place is the point: if the list grew above him and the view
  // stayed where it was, he would be thrown back to where he started every time.
  if (m.t === 'history.reply' && Array.isArray(m.items)) {
    // A page of older turns: they go in above, and he stays where he was reading (paintBack keeps his place).
    const added = back.older(m.items);
    if (cockpit) ckPage(added);
    if (reading) { paintBack('bottom'); fit(); reportSize(); }
    return;
  }
  // Undo / Take it back on a row (sheet 41): the brain answers with the row as it is now, and what happened.
  if (m.t === 'turn.updated' && Number.isFinite(m.id)) {
    const t = back.turns.find((x) => x.id === m.id);
    if (t) { if (m.extra && typeof m.extra === 'object') t.extra = m.extra; if (typeof m.kind === 'string') t.kind = m.kind; t.said = typeof m.said === 'string' ? m.said : ''; }
    if (reading) { paintBack('top'); fit(); reportSize(); }
    return;
  }

  // Quiet and mute change nothing about a reply, only about Aang speaking up by himself.
  if (m.t === 'quiet') { const was = quiet; quiet = m.on === true; if (was && !quiet) releaseHeldAsks(); return; }
  if (m.t === 'mute') { muted = m.on === true; return; }

  if (m.t === 'choice.used' && typeof m.key === 'string') { chgKey = m.key; return; }
  // Sheet 17: the notes. The list keeps the board current; "show my notes" opens it.
  if (m.t === 'notes.state' && Array.isArray(m.notes)) {
    if (m.cats && typeof m.cats === 'object') setOwnCats(m.cats.own);
    notesAll = m.notes;
    if (boardOpen && !editingNote && !card.hidden) showBoard();
    if (editingNote && !notesAll.some((n) => n.id === editingNote)) showBoard();
    return;
  }
  if (m.t === 'notes.board') {
    // Sheet 60: the held paper clicked opens the note Aang is holding up; Samara's rail opens one by its id.
    const want = m.openNotice === true ? heldId : typeof m.open === 'string' ? m.open : null;
    if (m.openNotice === true && !want) return;
    if (want) noticeNote = null;
    openBoard(); if (m.fresh === true) newNote(); else if (want) openNote(want);
    return;
  }
  // Sheet 17: "set a timer" with no time, or the wheel's Timer: the dial.
  if (m.t === 'timer.setup') {
    if (cockpit) { cockCommit(); live = { skip: true }; }
    closeBoard();
    reveal.start('', false);
    who.textContent = ''; who.hidden = true; who.classList.remove('plaque');
    scroller.hidden = true; working.hidden = true; tools.hidden = true;
    bubble.classList.remove('whisper');
    bubble.classList.add('wide');
    showTimerSet();
    bubble.classList.remove('enter'); void bubble.offsetWidth; bubble.classList.add('enter');
    show(); fit(); reportSize(); scheduleHide();
    return;
  }

  if (m.t === 'bubble.clear') {
    // The brain is asking again (Quick handed it to Smart, or it is told to look first): back to the dots in the same
    // bubble, never a vanish and a pop (2026-10-21).
    if (m.retry === true && !cockpit && !bubble.hidden && !asking) { thinking('', undefined, true); return; }
    // He stopped Aang from the cockpit (Esc while working), or the brain is retrying the turn: only the live answer
    // goes. The cockpit, the conversation and any question pinned in it stay (2026-10-21; before, the whole bubble
    // shut under his hands, typing area and all).
    if (cockpit) {
      if (ticking) { clearInterval(ticking); ticking = null; }
      working.hidden = true; live = null; cockStreaming = false;
      if (!asking) clearLive(); else { fit(); reportSize(); }
      return;
    }
    setSpeaker(null);
    chg.hidden = true; chgKey = null;
    choiceList(null);
    reveal.clear();
    back.clear();
    reading = false;
    lbOpen = null; lbReplying = null;
    paintBack();
    expanded = false;
    bubble.hidden = true;
    snapShut();
    releaseMouse();
    working.hidden = true;
    asks.hidden = true;
    // The queue goes with it, or its edges would hang under a bubble that is no longer there.
    waiting.length = 0;
    paintEdges();
    if (ticking) { clearInterval(ticking); ticking = null; }
    return;
  }
}
window.aang?.onMessage?.(onBrain);
/** A line the pet says (or a held message coming out): drawn exactly like a reply, through the same path. */
function onSay(m) { if (m && typeof m.text === 'string') onBrain(m); }

// ---------------------------------------------------------------- reaching back into a message
// The same actions the old bubble offers on a right-click (4.3b). All four now: Copy and Forget work
// within the bubble, and "Reply to this" and "Add as context" put something into the typing box, which
// is ours as of 6.12b - so they stopped being impossible and arrived here (2026-10-04).
// His report (2026-10-13): nothing in this menu did anything. A mouse-down ANYWHERE closed it, its own rows included,
// so the row was gone before its click landed (copy "never copied"). Now only a mouse-down outside the menu closes it.
let menuAway = null;
function closeMenu() {
  document.getElementById('turnmenu')?.remove();
  if (menuAway) { document.removeEventListener('pointerdown', menuAway, true); menuAway = null; }
}

bubble.addEventListener('contextmenu', e => {
  // His report (2026-10-13): right-click did nothing in his scroll-back. Any message now, the one showing or one from
  // his history (each row knows its own turn), and whatever he has highlighted.
  const sel = String(window.getSelection?.() ?? '').trim();
  const row = e.target?.closest?.('#back [data-id]');
  const past = row ? back.turns.find((t) => String(t.id) === row.dataset.id) : null;
  const text = past ? past.text : (reveal.whole || '');
  const id = past ? past.id : turn;
  if (!sel && !text) return;
  e.preventDefault();
  closeMenu();
  const menu = document.createElement('div');
  menu.id = 'turnmenu';
  menu.className = 'wood turnmenu';
  const items = [];
  if (sel) items.push(['Copy selection', () => window.aang?.copyText?.(sel)]);
  if (text) items.push(['Copy text', () => window.aang?.copyText?.(text)]);
  // Both open the typing box if it is shut, because the chip is only useful next to the words he is
  // about to write. The id is the row the brain gave this message: a real binding, never a guess.
  if (text && id !== null && id !== undefined) items.push(
    ['Reply to this', () => window.aang?.replyToTurn?.(id, text)],
    ['Add as context', () => window.aang?.pinTurn?.(id, text)],
    // Forget is last and set apart, as it is in the old menu: it is the one that removes something.
    ['Forget this', () => {
      window.aang?.forgetTurn?.(id);
      if (past) { const i = back.turns.indexOf(past); if (i >= 0) back.turns.splice(i, 1); row.remove(); }
      else { reveal.clear(); paint(); bubble.hidden = true; snapShut(); }
    }],
  );
  for (const [label, go] of items) {
    const b = document.createElement('button');
    b.className = 'mrow';
    b.textContent = label;
    b.addEventListener('click', () => { closeMenu(); go(); });
    menu.append(b);
  }
  // Placed where he clicked, then nudged back on screen if that would hang it off the edge.
  menu.style.left = Math.max(4, Math.min(e.clientX, window.innerWidth - 150)) + 'px';
  menu.style.top = Math.max(4, Math.min(e.clientY, window.innerHeight - 80)) + 'px';
  document.body.append(menu);
  setTimeout(() => {
    menuAway = (ev) => { if (!menu.contains(ev.target)) closeMenu(); };
    document.addEventListener('pointerdown', menuAway, true);
  }, 0);
});
window.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

// ---------------------------------------------------------------- letting the mouse through
// The window is transparent and covers more than the bubble does. Everything outside the drawn shape
// has to pass clicks through to whatever is behind, or Aang puts an invisible pane over his desktop.
//
// The main process keeps the window click-through and forwards move events here; this says when the
// pointer is actually over something of ours. `elementFromPoint` rather than a rectangle, so the
// rounded corners and the gap under the tail are honest.
let overNow = false;
/**
 * Is the pointer over something of ours?
 *
 * A cheap rectangle test first, because this runs on EVERY mouse move the window is forwarded - which
 * is every move his mouse makes across that part of the screen - and `elementFromPoint` forces the
 * browser to work out the layout each time. The rectangle rules out almost all of them for nothing.
 * Only inside it does the exact test run, which is what makes the rounded corners and the gap under
 * the tail honest rather than a box.
 */
function overBubble(x, y) {
  if (bubble.hidden) return false;
  const r = bubble.getBoundingClientRect();
  // The keys sit on the top edge, so "near" reaches up far enough to include them.
  const near = x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 18 && y <= r.bottom + 2;
  const menu = document.getElementById('turnmenu');
  if (!near && !menu) return false;
  const el = document.elementFromPoint(x, y);
  return Boolean(el && el.closest('#bubble, #tools, #turnmenu'));
}
function pointerAt(clientX, clientY) {
  const over = overBubble(clientX, clientY);
  if (over === overNow) return;
  overNow = over;
  document.getElementById('wrap')?.classList.toggle('over', over);
  keyHover(over);
  // Keys only while he is pointing at the bubble (2026-10-11: "these buttons should only surface when i hover").
  // The bubble grows to show them, so it is measured again; the 600 ms guard starts when they appear, so a
  // mouse arriving fast cannot land on Allow.
  // Not in the open cockpit (2026-10-21): there the keys always show (bubble.css), so the mouse arriving or leaving
  // changes nothing's size. Re-measuring on every crossing was one of the things that made it jump on his desktop.
  // The old-sessions card's Open keys come up the same way (2026-10-21), so it is re-measured too.
  if ((asking || sessionsOpen) && !cockpit) {
    if (over) { asks.classList.add('guard'); setTimeout(() => asks.classList.remove('guard'), 600); }
    fit(); reportSize();
  }
  console.info('bubble: pointer ' + (over ? 'over' : 'off'));
  // What the keys are actually doing a moment later, after their fade: the only way to tell "not shown"
  // from "shown but clipped" from "never told to show" without guessing.
  if (over) setTimeout(() => {
    const cs = getComputedStyle(tools), r = tools.getBoundingClientRect();
    console.info(`bubble: keys hidden=${tools.hidden} opacity=${cs.opacity} display=${cs.display} at ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} hover=${document.querySelector('.wrap')?.matches(':hover')} over=${document.getElementById('wrap')?.classList.contains('over')} window=${innerWidth}x${innerHeight}`);
  }, 400);
  window.aang?.bubbleClickable?.(over);
  if (over) clearTimeout(hideTimer); else scheduleHide();
}
window.addEventListener('mousemove', (e) => pointerAt(e.clientX, e.clientY), { passive: true });
// The Shell's own look at the cursor (bubble.ts watchPointer, 2026-10-22): a reloaded page stopped hearing forwarded
// moves, so the pointer on the board was never "over", the window kept letting clicks through, and "+ New note" closed it.
window.aang?.onPointer?.((p) => { if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) pointerAt(p.x, p.y); });
// Whenever the bubble goes away, let go of the mouse at once rather than waiting for a move that may
// never come: a window that is hidden must never still be holding clicks.
function releaseMouse() {
  if (pullingNote) return;                 // a note is being dragged out: keep the mouse until it lands
  if (!overNow) return;
  overNow = false;
  keyHover(false);
  document.getElementById('wrap')?.classList.remove('over');
  window.aang?.bubbleClickable?.(false);
  // Hovering paused the clock; leaving has to start it again. The first version only released the
  // mouse, so a reply he had once moused over stayed up until Aang happened to tuck himself away
  // (sweep, 2026-10-04: still showing 27 s after it finished).
  scheduleHide();
}
// Leaving the window entirely must also let go, or it keeps the mouse after he moves off it.
window.addEventListener('mouseleave', releaseMouse);
window.addEventListener('blur', releaseMouse);

// ---------------------------------------------------------------- his clicks
// One click on the bubble means two different things, and the order matters: while text is still
// arriving it shows the rest, and only once there is nothing left to reveal does it expand. Doing both
// would expand a bubble he was only trying to finish reading. reveal.skip() returns which happened.
bubble.addEventListener('click', e => {
  // A link in his words: Samara opens it (sheet 41). Checked first: it is a link wherever it sits.
  const lnk = e.target.closest('.lnk');
  if (lnk && lnk.dataset.url) { e.stopPropagation(); window.aang?.openThing?.({ kind: 'link', value: lnk.dataset.url }); return; }
  // Looking back has its own clicks (rows open, Reply, Undo): none of them open the cockpit.
  if (reading) return;
  if (e.target.closest('.tool, .key, .more, .opt, .chg, .vshot')) return;     // those have their own jobs
  // Sheet 53: the job bars (they unfold) and Claude's card (Claude's words, N MORE) have their own clicks too.
  if (e.target.closest('#ckjobs, #ckpins')) return;
  // Sheet 17: the notes board, a note being edited, its menu and the timer dial are things he works IN.
  // A click there was docking the typing box over them and taking the keyboard away (his test, 2026-10-12).
  if (e.target.closest('.boardwrap, .nmini, .bignote, .inline, .ctitle, .tset, .newk, .bcap, .bchips, .nkeys')) return;
  // 2026-10-21 (his ask): a finished Claude job's news takes him to that session, not to the cockpit (sheet 16's rule
  // stays for every other Claude message).
  if (claudeDone && !cockpit && !asking) { goDone(claudeDone); return; }
  if (noticeNote && !cockpit && !asking) { const id = noticeNote; noticeNote = null; openBoard(); openNote(id); return; }
  // "Need input in Claude": take him straight to that session's window, and let the reply go. This
  // sits ABOVE skip-reveal for the same reason the C# puts it there - it is a decision, not
  // impatience with the typing.
  // Sheet 16: a Claude message no longer jumps to Claude on a click. The click opens the cockpit like any
  // other message; bringing Claude forward is the "Open Claude" key that shows on hover (openClaude).
  if (reveal.skip()) { paint(); return; }
  // The old bubble's order (PetWindow:1316): a question waits for its answer; Aang still working means
  // stop; otherwise the click lets the message go.
  if (asking) return;
  // A click NEVER stops him (his rule, 2026-10-12: a click on the bubble while he worked killed a finished answer).
  // Stopping is Esc in the typing box, or the Stop key; a click while he works does nothing.
  if (!working.hidden) return;
  // The one-line door (sheet 41): the first click on a message about a video opens the video; the next one is the
  // cockpit, as for any message.
  if (curAbout && !aboutShown) { paintAbout(true); return; }
  openCockpit();
});

// ---------------------------------------------------------------- the cockpit (sheet 16)
// A click on a message opens the cockpit: his typing box docks right under the bubble, and what he types
// answers this message. No Reply key. While it is open the bubble never fades; Esc or a click elsewhere
// closes the box, and the bubble goes with it.
let docked = false;
function openCockpit(bind = true) {
  docked = true;
  clearTimeout(hideTimer);
  const r = bubble.getBoundingClientRect();
  window.aang?.dockBox?.({ right: r.right, bottom: r.bottom, turn: bind ? turn : null });
}

/**
 * Sheet 16's choices: the FFX glove points at the row under the mouse, plum number keys show on hover, and
 * "Something else" is always last (it docks his box so he can say what). His rule: Aang asks once and
 * remembers; the reply after a remembered pick gets a gold "change" link (paintChange).
 */
function choiceList(m) {
  let list = document.getElementById('opts');
  if (!list) { list = document.createElement('div'); list.id = 'opts'; list.className = 'opts glove'; scroller.after(list); }
  list.replaceChildren();
  list.hidden = m?.t !== 'choice';
  if (list.hidden) return;
  const rows = m.options.slice(0, 4).map((o, i) => ({ label: String(o.label ?? ''), hint: o.hint ? String(o.hint) : '', pick: String(i), kc: String(i + 1) }));
  rows.push({ label: 'Something else\u2026', hint: '', pick: 'other', kc: 'T', other: true });
  const all = [];
  for (const r of rows) {
    const d = T('div', 'opt' + (r.other ? ' other' : ''));
    const s = T('span', 'lab', r.label);
    if (r.hint) s.append(T('small', 'hint', r.hint));
    d.append(s, T('span', 'kc', r.kc));
    d.addEventListener('mouseenter', () => all.forEach((x) => x.classList.toggle('on', x === d)));
    d.addEventListener('click', (e) => {
      e.stopPropagation();
      if (list.classList.contains('guard')) return;
      list.hidden = true;
      answer(r.pick);
      // In the open cockpit the typing area is already there: the caret goes to it (2026-10-21).
      if (r.other) { if (cockpit) el('ckBox')?.focus(); else openCockpit(false); }
    });
    all.push(d);
    list.append(d);
  }
  all[0].classList.add('on');
  // The same 600 ms guard as the keys: a mouse already moving in his game cannot land on a pick.
  list.classList.add('guard');
  setTimeout(() => list.classList.remove('guard'), 600);
}

/**
 * Sheet 17's notes board (approved 2026-10-12): six notes a page on wood, all the same size, gold arrows when
 * there are more. Click one to open it and type; right-click it for colour, text and more; drag one out of the
 * bubble and it sticks on the screen. The brain keeps them; this only draws them and says what changed.
 */
/** @type {any[]} */
let notesAll = [];
let boardOpen = false, boardPage = 0, pullingNote = false;
/** @type {string|null} */
let editingNote = null;
const PER_PAGE = 6;
function openBoard() {
  if (cockpit) { cockCommit(); live = { skip: true }; }
  reveal.start('', false);
  who.textContent = ''; who.hidden = true; who.classList.remove('plaque');
  scroller.hidden = true; working.hidden = true; tools.hidden = true;
  bubble.classList.remove('whisper');
  bubble.classList.add('wide', 'widest');
  boardOpen = true; editingNote = null; boardPage = 0;
  showBoard();
  bubble.classList.remove('enter'); void bubble.offsetWidth; bubble.classList.add('enter');
  show(); fit(); reportSize(); scheduleHide();
}
function closeBoard() { boardOpen = false; editingNote = null; typing(false); }
/**
 * The bubble never takes the keyboard on its own (so WoW keeps it). A note or the timer's name is the one place he
 * types in it: a press there asks for the keyboard, puts the caret where he pressed, and it is handed back to the
 * window he was in when he leaves the note, goes back to the board, or the bubble goes.
 */
let typingOn = false;
function typing(on) {
  if (on === typingOn) return;
  typingOn = on;
  window.aang?.bubbleTyping?.(on);
}
function typeHere(e) {
  const t = /** @type {HTMLElement} */ (e.target);
  const field = t.closest?.('[contenteditable="true"]');
  if (!field || typingOn) return;
  typing(true);
  const x = e.clientX, y = e.clientY;
  // The window takes the keyboard a moment after asking; then the caret goes where he pressed.
  setTimeout(() => {
    /** @type {HTMLElement} */ (field).focus();
    const r = document.caretRangeFromPoint?.(x, y);
    if (r && field.contains(r.startContainer)) { const s = getSelection(); s?.removeAllRanges(); s?.addRange(r); }
  }, 60);
}
card.addEventListener('pointerdown', typeHere);
/**
 * Blank, with "Title" and "Write here" hints. Nothing is kept until he writes something: an empty note that he walks
 * away from simply is not there (his test: a "New note" appearing straight away made no sense). The board's + NEW, and
 * since sheet 61 v2 (2026-10-22) his Quick note key, Ctrl + number pad *.
 */
function newNote() {
  // Sheet 60: a new note is a plain note; with the board filtered to a category, it starts in that one.
  const n = { id: newNoteId(), title: '', html: '', font: 'figtree', size: 'm', updated: Date.now(), fresh: true, ...(boardCat ? { cat: boardCat } : {}) };
  notesAll = [n, ...notesAll];
  openNote(n.id, true);
}
function newNoteId() { return 'n' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); }
function showBoard() {
  editingNote = null;
  typing(false);
  notesAll = notesAll.filter((n) => !n.fresh);          // a new note he never wrote in is dropped
  card.replaceChildren();
  // Sheet 60 B-board: the chips filter by category ("Just notes" = the plain ones); each carries its category's paper.
  const known = new Set(allCats().map((c) => c.cat.toLowerCase()));
  if (boardCat !== null && boardCat !== '' && !known.has(boardCat.toLowerCase())) boardCat = null;
  const inCat = (n) => boardCat === null ? true : boardCat === '' ? !n.cat : String(n.cat ?? '').toLowerCase() === boardCat.toLowerCase();
  const list = notesAll.filter(inCat);
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  boardPage = Math.min(boardPage, pages - 1);
  const shown = list.slice(boardPage * PER_PAGE, boardPage * PER_PAGE + PER_PAGE);
  const head = T('div', 'ctitle nb60', 'Notes');
  if (pages > 1) { const d = T('span', 'bdots'); for (let i = 0; i < pages; i++) d.append(T('i', i === boardPage ? 'on' : '')); head.append(d); }
  const add = T('button', 'newk', '+ New note'); add.type = 'button';
  add.addEventListener('click', newNote);
  head.append(add);
  const chips = T('div', 'bchips');
  const chip = (label, cat, count, colours) => {
    const b = T('button', 'bchip' + (boardCat === cat ? ' on' : '')); b.type = 'button';
    if (colours) { const sw = T('i'); sw.style.setProperty('--paper', colours.paper); sw.style.setProperty('--deep', colours.deep); b.append(sw); }
    b.append(T('span', '', count === null ? label : `${label} · ${count}`));
    b.addEventListener('click', () => { boardCat = cat; boardPage = 0; showBoard(); });
    chips.append(b);
  };
  chip('All', null, notesAll.length, null);
  for (const c of allCats()) chip(c.cat ? c.cat : 'Just notes', c.cat, c.cat ? null : notesAll.filter((n) => !n.cat).length, c);
  const plus = T('button', 'bchip add', '+ Category'); plus.type = 'button';
  plus.addEventListener('click', () => {
    const box = T('input', 'bcatin'); box.type = 'text'; box.maxLength = 24; box.placeholder = 'Name it, then Enter'; box.spellcheck = false;
    plus.replaceWith(box); typing(true);
    setTimeout(() => box.focus(), 60);
    box.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); showBoard(); }
      if (e.key === 'Enter') { e.preventDefault(); const v = box.value.replace(/[<>#]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24); if (v) { window.aang?.notesCat?.(v); setOwnCats([...ownCats(), v]); boardCat = v; } showBoard(); }
    });
  });
  chips.append(plus);
  const wrap = T('div', 'boardwrap');
  if (pages > 1) {
    const l = T('button', 'bcap l' + (boardPage === 0 ? ' off' : ''), '◀'); l.type = 'button';
    const r = T('button', 'bcap r' + (boardPage >= pages - 1 ? ' off' : ''), '▶'); r.type = 'button';
    l.addEventListener('click', () => { if (boardPage > 0) { boardPage--; showBoard(); } });
    r.addEventListener('click', () => { if (boardPage < pages - 1) { boardPage++; showBoard(); } });
    wrap.append(l, r);
  }
  const grid = T('div', 'board');
  if (!notesAll.length) grid.append(T('div', 'bempty', 'No notes yet. Say "make a note for raid: flasks, food" or press + New note.'));
  else if (!list.length) grid.append(T('div', 'bempty', boardCat === '' ? 'No plain notes.' : `Nothing in ${boardCat} yet. + New note starts one there.`));
  for (const n of shown) grid.append(miniNote(n));
  wrap.append(grid);
  card.append(head, chips, wrap);
  card.hidden = false;
  fit(); reportSize();
}
/** Sheet 60 B: a small note on the board, on its category's paper, held by its ribbon. No pin, no tilt, no ghost slots. */
function miniNote(n) {
  const el = T('div', 'nmini npaper' + (n.out ? ' gone' : ''));
  paintNote(el, n);
  const inner = T('div', 'np-in nmi');
  if (n.title && n.title !== 'Note') inner.append(T('b', 'mt', n.title));
  if (n.cat) { const c = T('span', 'np-chip'); c.append(T('i', '', '#'), document.createTextNode(n.cat)); inner.append(c); }
  for (const l of previewLines(n.html).slice(0, 3)) inner.append(T('span', 'ml' + (l.done ? ' done' : ''), l.t));
  el.append(T('div', 'np-edge'), T('div', 'np-fill'), ribbon(catColour(n.cat).deep), inner);
  const tc = tickCount(n.html);
  if (tc.all > 1) el.append(T('span', 'tickc', `${tc.done}/${tc.all}`));
  if (n.out) el.append(T('span', 'onscreen', 'On screen'));
  pullable(el, n);
  return el;
}
/** Sheet 60: the board's filter: null = All, '' = Just notes (plain), else a category's name. */
let boardCat = null;
/** Drag a note off the board: inside the bubble it lifts and follows; out of the bubble it becomes a note on the screen. */
function pullable(el, n) {
  let down = null, out = false;
  el.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; e.preventDefault(); down = { x: e.clientX, y: e.clientY }; out = false; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (!el.classList.contains('lifting') && Math.hypot(dx, dy) > 6) { el.classList.add('lifting'); pullingNote = true; }
    if (!el.classList.contains('lifting')) return;
    const outside = e.clientX < 0 || e.clientY < 0 || e.clientX > innerWidth || e.clientY > innerHeight;
    if (outside && !out) { out = true; el.style.visibility = 'hidden'; window.aang?.notesPull?.({ phase: 'start', id: n.id, x: e.screenX, y: e.screenY }); }
    if (out) window.aang?.notesPull?.({ phase: 'move', id: n.id, x: e.screenX, y: e.screenY });
    else el.style.transform = `translate(${dx}px,${dy}px) rotate(${Math.max(-12, Math.min(12, dx * 0.08))}deg) scale(1.06)`;
  });
  el.addEventListener('pointerup', (e) => {
    const lifted = el.classList.contains('lifting');
    el.classList.remove('lifting'); el.style.transform = ''; pullingNote = false;
    if (out) { window.aang?.notesPull?.({ phase: 'end', id: n.id, x: e.screenX, y: e.screenY }); el.style.visibility = ''; el.classList.add('gone'); down = null; return; }
    down = null;
    if (!lifted) openNote(n.id);
  });
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); openNote(n.id); const p = card.querySelector('.bignote'); if (p) p.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: e.clientX, clientY: e.clientY })); });
}
function openNote(id, focusTitle = false) {
  const n = notesAll.find((x) => x.id === id);
  if (!n) { showBoard(); return; }
  editingNote = id;
  card.replaceChildren();
  const head = T('div', 'ctitle');
  const back = T('button', 'back', '◀ BOARD'); back.type = 'button';
  back.addEventListener('click', () => { paper.flush(); showBoard(); });
  head.append(back, T('span', 'hint2', 'Type anywhere. Right-click for text, size and font.'));
  const sheet = T('div', 'bignote');
  const menuHost = T('div', 'inline');
  card.append(head, sheet, menuHost);
  const paper = buildPaper(sheet, n, (changed) => {
    const empty = !(changed.title ?? '').trim() && !(sheet.querySelector('.nbody')?.textContent ?? '').trim();
    if (changed.fresh && empty) return;                  // still blank: not a note yet
    delete changed.fresh;
    if (!changed.title) changed.title = 'Note';
    window.aang?.notesSave?.(changed); fit(); reportSize();
  }, { pickHost: menuHost, onPicker: () => { setTimeout(() => { fit(); reportSize(); }, 0); } });
  sheet.addEventListener('input', () => { fit(); reportSize(); });
  sheet.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const part = /** @type {HTMLElement} */ (e.target).closest?.('.ntitle') ? 'title' : 'body';
    const m = openMenu(menuHost, { x: 0, y: 0 }, paper, n, 'board', (what) => {
      if (what === 'delete') { window.aang?.notesDelete?.(n.id); notesAll = notesAll.filter((x) => x.id !== n.id); showBoard(); }
      else if (what === 'out') {
        paper.flush(); const r = bubble.getBoundingClientRect();
        // Left of the bubble, but never past the left edge of the bubble's own screen (2026-10-28: with a second screen to
        // the left, "Stick on screen" put the note on the other screen): then it goes right of the bubble instead.
        const left = window.screenX + r.left - 240, sx = Math.max(left, (window.screen.availLeft ?? 0) + 8) === left ? left : window.screenX + r.right + 12;
        const at = { id: n.id, x: sx, y: window.screenY + r.top + 20 };
        window.aang?.notesPull?.({ phase: 'start', ...at }); window.aang?.notesPull?.({ phase: 'end', ...at }); showBoard();
      }
    }, part);
    fit(); reportSize();
    const watch = new MutationObserver(() => { if (!menuHost.contains(m)) { watch.disconnect(); fit(); reportSize(); } });
    watch.observe(menuHost, { childList: true });
  });
  card.hidden = false;
  fit(); reportSize();
  if (focusTitle) { typing(true); setTimeout(() => { const t = paper.title; t.focus(); const r = document.createRange(); r.selectNodeContents(t); const s = getSelection(); s?.removeAllRanges(); s?.addRange(r); }, 60); }
}

/**
 * Sheet 17's timer dial (approved 2026-10-12): his kitchen dial, presets, a wood "SET A TIMER" plaque, and
 * backdrop B, a soft wood panel behind the dial only. Drag the knob or roll the mouse wheel on it.
 */
let dialMin = 10;
function showTimerSet() {
  card.replaceChildren();
  const NS = 'http://www.w3.org/2000/svg';
  const wrap = T('div', 'tset');
  const plaque = T('div', 'tplaque');
  plaque.append(T('span', '', 'SET A TIMER'));
  const panel = T('div', 'dialwrap');
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 200 200'); svg.setAttribute('class', 'dial');
  panel.append(svg);
  const presets = T('div', 'presets');
  const pre = [5, 10, 15, 30, 60].map((p) => { const b = T('span', 'pre', p === 60 ? '1H' : p + 'M'); b.dataset.p = String(p); presets.append(b); return b; });
  const name = T('div', 'tname');
  const nameIn = T('span', 'tin', '');
  nameIn.contentEditable = 'true'; nameIn.spellcheck = false; nameIn.dataset.ph = 'What for? (optional)';
  name.append(T('span', '', 'FOR'), nameIn);
  const keys = T('div', 'keys');
  const go = T('button', 'key sm primary', 'Start'); go.type = 'button'; go.append(T('span', 'k', 'A'));
  keys.append(go);
  wrap.append(plaque, panel, presets, name, keys);
  card.append(wrap);
  card.hidden = false;
  const paint = () => {
    const m = dialMin, a = m / 60 * Math.PI * 2 - Math.PI / 2, r = 62, x = 100 + r * Math.cos(a), y = 100 + r * Math.sin(a);
    let s = '<circle cx="100" cy="100" r="86" fill="#2b1b10" stroke="#120A05" stroke-width="6"/>';
    for (let i = 0; i < 60; i++) { const t = i / 60 * Math.PI * 2 - Math.PI / 2, r1 = i % 5 ? 76 : 70; s += `<line x1="${100 + r1 * Math.cos(t)}" y1="${100 + r1 * Math.sin(t)}" x2="${100 + 82 * Math.cos(t)}" y2="${100 + 82 * Math.sin(t)}" stroke="${i % 5 ? '#6b4a2a' : '#e0c48c'}" stroke-width="${i % 5 ? 1.5 : 3}"/>`; }
    for (const q of [0, 15, 30, 45]) { const t = q / 60 * Math.PI * 2 - Math.PI / 2; s += `<text x="${100 + 55 * Math.cos(t)}" y="${104 + 55 * Math.sin(t)}" text-anchor="middle" class="dn">${q || 60}</text>`; }
    s += `<path d="${m >= 60 ? 'M100 38 A62 62 0 1 1 99.9 38' : `M100 38 A62 62 0 ${m > 30 ? 1 : 0} 1 ${x} ${y}`}" fill="none" stroke="#966EC8" stroke-width="10" stroke-linecap="round"/>`;
    s += `<circle cx="${x}" cy="${y}" r="11" fill="#FFC43C" stroke="#120A05" stroke-width="4"/>`;
    s += `<text x="100" y="98" text-anchor="middle" class="dt">${m >= 60 ? '1:00:00' : m + ':00'}</text><text x="100" y="120" text-anchor="middle" class="dsub">MINUTES</text>`;
    svg.innerHTML = s;
    pre.forEach((b) => b.classList.toggle('on', Number(b.dataset.p) === m));
  };
  paint();
  let drag = false;
  const at = (e) => {
    const r = svg.getBoundingClientRect(), x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
    let a = Math.atan2(y, x) + Math.PI / 2; if (a < 0) a += Math.PI * 2;
    let m = Math.round(a / (Math.PI * 2) * 60); if (m === 0 && dialMin > 45) m = 60;
    dialMin = Math.max(1, m); paint();
  };
  svg.addEventListener('pointerdown', (e) => { drag = true; svg.setPointerCapture(e.pointerId); at(e); });
  svg.addEventListener('pointermove', (e) => { if (drag) at(e); });
  svg.addEventListener('pointerup', () => { drag = false; });
  svg.addEventListener('wheel', (e) => { e.preventDefault(); dialMin = Math.max(1, Math.min(60, dialMin + (e.deltaY < 0 ? 1 : -1))); paint(); }, { passive: false });
  pre.forEach((b) => b.addEventListener('click', () => { dialMin = Number(b.dataset.p); paint(); }));
  go.addEventListener('click', () => {
    window.aang?.timerStart?.({ ms: dialMin * 60_000, label: (nameIn.textContent ?? '').trim().slice(0, 40) });
    typing(false);
    cardDone();
  });
}

/** A remembered choice was used for this reply: a gold "change" link under it forgets the pick. */
let chgKey = null;
const chg = document.createElement('button');
chg.type = 'button';
chg.className = 'chg';
chg.textContent = 'change';
chg.hidden = true;
scroller.after(chg);
chg.addEventListener('click', (e) => {
  e.stopPropagation();
  if (chg.dataset.key) window.aang?.forgetChoice?.(chg.dataset.key);
  chg.hidden = true;
});
function paintChange(final) {
  if (!final) { if (!chgKey) chg.hidden = true; return; }
  chg.hidden = !chgKey;
  if (chgKey) { chg.dataset.key = chgKey; chgKey = null; }
}
window.aang?.onUndock?.((why) => {
  docked = false;
  if (why === 'sent') return;                     // he answered: the bubble stays for the reply
  if (!asking && working.hidden) dismiss();
});

/**
 * Who is talking, on asks and on what Aang or Claude start (sheet 16): a small face and the name, straight
 * on the parchment, no plate. Replies to him carry his own question instead (the .who line), not this.
 * A Claude message also gets a PC or MAC chip and, on hover, the "Open Claude" key.
 */
const CLAUDE_MARK = 'M4 0h1v3H4zM4 6h1v3H4zM0 4h3v1H0zM6 4h3v1H6zM1 1h1v1H1zM2 2h1v1H2zM7 1h1v1H7zM6 2h1v1H6zM1 7h1v1H1zM2 6h1v1H2zM7 7h1v1H7zM6 6h1v1H6zM3 3h3v3H3z';
const speaker = document.createElement('div');
speaker.id = 'speaker';
speaker.hidden = true;
who.parentElement.before(speaker);
function setSpeaker(kind, machine, face) {
  // His call (2026-10-12): Aang's own face and name on every message was noise. Only Claude is named.
  if (kind !== 'claude') kind = null;
  speaker.replaceChildren();
  // His ask (2026-10-14): what a message is ABOUT gets its picture here, where Claude's mark goes: a channel's
  // own picture on its new video, a site's icon, an email sender's. Only a picture the brain fetched itself.
  if (!kind && face && typeof face.img === 'string' && /^data:image\/[\w.+-]+;base64,[\w+/=]+$/.test(face.img)) {
    speaker.hidden = false;
    speaker.className = 'speaker about';
    const img = document.createElement('img'); img.src = face.img; img.alt = ''; img.className = 'face';
    speaker.append(img, T('span', 'nm', String(face.name ?? '').slice(0, 40).toUpperCase()));
    return;
  }
  speaker.hidden = !kind;
  speaker.className = 'speaker' + (kind === 'claude' ? ' claude' : '');
  if (!kind) return;
  if (kind === 'claude') {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 9 9'); svg.setAttribute('shape-rendering', 'crispEdges'); svg.setAttribute('class', 'clk');
    const path = document.createElementNS(NS, 'path'); path.setAttribute('d', CLAUDE_MARK); path.setAttribute('fill', '#E07A4F');
    svg.append(path);
    speaker.append(svg, T('span', 'nm', 'CLAUDE'), T('span', 'mc' + (machine === 'MAC' ? ' mac' : ''), machine));
    const k = T('button', 'key sm okey', 'Open Claude');
    k.type = 'button';
    k.addEventListener('click', (e) => { e.stopPropagation(); openClaude(); });
    speaker.append(k);
    return;
  }
  const img = document.createElement('img'); img.src = 'art/aang-face.png'; img.alt = '';
  speaker.append(img, T('span', 'nm', 'AANG'));
}
// ---------------------------------------------------------------- sheet 64: the kind of ask (APPROVED 2026-10-22)
// An ask (Aang's own, or the Claude card in the closed bubble) wears its kind: the tag over the question, the rim, the
// tail and a faint glow in the mark's colour (askkind.js, asks.css). Its answer keys wait until the mouse has rested on
// the bubble for 1.5 s, then slide in and stay; a new ask starts at rest again. Not in the open cockpit: there the keys
// always show and the frame is the cockpit's.
const kindTag = document.createElement('div');
kindTag.id = 'kindtag';
kindTag.hidden = true;
bubble.prepend(kindTag);
let keyWait = 0, kindKey = '';
// `var`: fit() may run before this line during the module's first pass, and must then simply skip.
var kindReady = false;
function syncKind() {
  let kind = null, key = '';
  if (!cockpit && !bubble.hidden && !reading) {
    if (asking) { kind = askKind(asking); key = kind ? `a:${asking.t}:${String(asking.id ?? '')}` : ''; }
    else {
      const pin = document.querySelector('#ckpins:not([hidden]) .pin[data-kind]');
      if (pin) { kind = pin.dataset.kind; key = 'c:' + pin.dataset.id; }
    }
  }
  kindTag.hidden = !(kind && key.startsWith('a:'));
  if (kind) bubble.dataset.kind = kind; else delete bubble.dataset.kind;
  if (key === kindKey) return;
  kindKey = key;
  bubble.classList.remove('kshow', 'kin', 'kguard');
  clearTimeout(keyWait); keyWait = 0;
  if (kind && overNow) keyWait = setTimeout(showKeys, KEYS_AFTER_MS);
  tintRim(skin, /** @type {any} */ (kind));
}
/** The mouse came onto the bubble (or left it): the 1.5 s wait starts over each time. */
function keyHover(over) {
  clearTimeout(keyWait); keyWait = 0;
  if (!over || !bubble.dataset.kind || bubble.classList.contains('kshow')) return;
  keyWait = setTimeout(showKeys, KEYS_AFTER_MS);
}
/** The keys come: the bubble grows to make room (its own spring), then each row rises in, 40 ms after the last. */
function showKeys() {
  keyWait = 0;
  if (!bubble.dataset.kind || bubble.classList.contains('kshow')) return;
  bubble.classList.add('kshow', 'kin', 'kguard');
  // The mouse is already resting where a key lands: a short guard, so the arrival itself is never a click.
  setTimeout(() => bubble.classList.remove('kguard'), 400);
  setTimeout(() => bubble.classList.remove('kin'), 700);
  fit(); reportSize();
}

/** The hover key on a Claude message: that session's window comes forward, on the PC or on the Mac. */
function openClaude() {
  if (focusWindow) {
    window.aang?.focusWindow?.(focusWindow);
    focusWindow = null;
    reveal.clear(); paint(); bubble.hidden = true; snapShut();
    window.aang?.bubbleHidden?.();
    return;
  }
  if (macSession) { macSession = false; window.aang?.macFront?.(); dismiss(); }
}

/**
 * Let the message go now: a click on it, Esc, or a click away from everything of ours.
 *
 * `why` is 'esc' or 'outside' when he put it away himself (main.ts). Then even a question goes (his decision,
 * 2026-10-21: he can always click out): it is parked, not answered, and comes back when he opens Aang. Anything
 * else (an undock, the wheel) never takes a question away, as before.
 */
function dismiss(why) {
  // 2026-10-21: Open in Claude was pressed somewhere (main.ts openInClaude): the bubble goes at once, no fade.
  if (why === 'openclaude') { closeForClaude(); return; }
  if (bubble.hidden) return;
  // Sheet 53: the chat box closed. Only the "N MIN AGO" line that came back with it goes too.
  if (why === 'boxclosed') { if (recentOpen) { clearTimeout(hideTimer); goAway(); } return; }
  const his = why === 'esc' || why === 'outside';
  if (asking && !his) return;
  if (cockpit) return;                   // the open cockpit closes through the main process (input.close), right behind this
  if (his) { parkAsks(); claude?.park(); }
  // 2026-10-21 (his report: a click in Samara left the jobs card up): he clicked somewhere else, so the mouse is not on
  // the bubble, whatever the hover flag still says. A window that lets the mouse through can miss the pointer leaving
  // (it went straight onto another window), and a stale "over" made goAway refuse.
  if (his && overNow) { overNow = false; document.getElementById('wrap')?.classList.remove('over'); window.aang?.bubbleClickable?.(false); }
  clearTimeout(hideTimer);
  goAway();
}
window.aang?.onDismiss?.((why) => dismiss(why));
// Ctrl+C with the mouse on the bubble: the whole finished reply. Half a sentence is never copied.
window.aang?.onBubbleCopy?.(() => { if (reveal.done && reveal.whole) window.aang?.copyText?.(reveal.whole); });
window.addEventListener('aang:say', (e) => onSay(e.detail));

// ---------------------------------------------------------------- looking back (sheet 41)
// Scroll up on any message, even a one-line one, or press Page Up in the typing box, and the bubble becomes the
// Lantern's scroll-back: everything Aang showed him, newest at the bottom, as far back as he wants to go. Each rich
// row opens as it first looked; Reply on any row; Undo on a yes he gave. lookback.js draws it.
let lbOpen = null, lbReplying = null, lbOwnsLantern = false;
const lbCtx = () => ({
  open: lbOpen, replying: lbReplying,
  older: cockpit && ckHidden > 0 ? 'more' : back.reachedTheStart ? 'start' : back.waiting ? 'loading' : 'more',
  // The cockpit starts on the last exchange alone (2026-10-21): an empty start says nothing rather than "No history yet".
  quietEmpty: cockpit,
  setOpen: (id) => { lbOpen = id; paintBack('top'); fit(); reportSize(); },
  onLink: (url) => window.aang?.openThing?.({ kind: 'link', value: url }),
  onReply: (t) => { lbReplying = t.id; window.aang?.replyToTurn?.(t.id, t.text); paintBack('top'); },
  onUndo: (t) => window.aang?.undoTurn?.(t.id),
  // 2026-10-21: a finished Claude job's row in the scroll-back takes him to that session.
  onClaudeDone: (t) => { const x = t.extra ?? {}; goDone({ session: x.session, open: x.open, project: x.project, host: x.host }); },
  onForgetPlan: (t) => window.aang?.forgetPlan?.({ id: t.id, task: String(t.extra?.plan?.title ?? ''), extra: t.extra }),
  // Open the whole thing, as it first looked: the brief or the research comes back into the bubble.
  onFull: (t) => {
    const x = t.extra ?? {};
    leaveReading(false);
    laidOut = null;
    onBrain({ t: 'bubble', text: t.text, stream: false, recalled: true, turn: t.id,
      ...(x.brief ? { brief: x.brief } : {}), ...(x.research ? { research: x.research } : {}), ...(x.face ? { face: x.face } : {}), ...(x.about ? { about: x.about } : {}) });
  },
});

/** Draw the scroll-back. `keep`: 'bottom' holds his place when older rows arrive above; 'top' when a row opens. */
function paintBack(keep = 'bottom') {
  let box = document.getElementById('back');
  if (!box) {
    box = document.createElement('div');
    box.id = 'back';
    box.className = 'back lookback';
    scroller.before(box);
  }
  box.hidden = !reading;
  if (!reading) { box.replaceChildren(); return; }
  const was = document.getElementById('lblist');
  const fromBottom = was ? was.scrollHeight - was.scrollTop : 0, top = was ? was.scrollTop : 0;
  // In the cockpit only the rows he has reached are drawn: the last exchange, plus whatever he scrolled up to.
  const shown = cockpit ? back.turns.slice(Math.min(ckHidden, back.turns.length)) : back.turns;
  const list = paintLookback(box, shown, lbCtx());
  // The redrawn list keeps the height the cockpit last gave it, so a redraw between two measures never resizes it.
  if (cockpit && was?.style.maxHeight) list.style.maxHeight = was.style.maxHeight;
  if (!was) list.scrollTop = list.scrollHeight;                     // first look: newest, where he left off
  else list.scrollTop = keep === 'top' ? top : Math.max(0, list.scrollHeight - fromBottom);
  if (ckReveal) {
    // The rows he just scrolled up to fade in, top to bottom, 55 ms apart (his motion rules, 2026-10-21).
    const rows = [...list.querySelectorAll('.lt-item, .lb-mine')].slice(0, ckReveal);
    rows.forEach((r, i) => { r.classList.add('ckin'); r.style.animationDelay = (reduceMotion ? 0 : i * 55) + 'ms'; });
    ckReveal = 0;
  }
  // At the top of the history: the next page, for as far back as he wants to go. NOT in the cockpit (2026-10-21):
  // there a scroll event fires for all sorts of reasons that are not him (the list being re-measured, a row's label
  // opening under the mouse), and each one at the top fetched another page, so the cockpit filled the screen by
  // itself. There older turns come only when he asks: the wheel or PageUp at the top (olderStep).
  if (!cockpit) list.addEventListener('scroll', () => { if (list.scrollTop < 8) askOlder(); }, { passive: true });
}

function askOlder() {
  const ask = back.wants(true);
  if (!ask) return;
  window.aang?.olderTurns?.(ask);
  const o = document.querySelector('#lblist .lb-older'); if (o) o.classList.add('loading');
}

/** Into the scroll-back. Always from the newest: anything said since the last look is in it. */
function enterReading() {
  if (reading || (asking && !cockpit)) return;
  reading = true;
  lbOpen = null; lbReplying = null;
  clearTimeout(hideTimer);
  closeBoard();
  back.clear();
  askOlder();
  for (const id of ['chips', 'rlist', 'aboutbox', 'means', 'exact', 'mailcard']) { const e = document.getElementById(id); if (e) e.hidden = true; }
  // In the cockpit a waiting question stays where it is, pinned under the conversation, and the working dots stay.
  const keepAsk = cockpit && asking;
  if (!keepAsk) { scroller.hidden = true; who.hidden = true; speaker.hidden = true; }
  if (!cockpit) working.hidden = true;
  tools.hidden = true; more.hidden = true;
  mediaRow.hidden = true; card.hidden = true;
  if (!bubble.classList.contains('lantern')) { bubble.classList.add('lantern'); lbOwnsLantern = true; }
  bubble.classList.remove('whisper');
  bubble.classList.add('wide', 'widest');
  show();
  paintBack('bottom');
  fit(); reportSize(); scheduleHide();
}

/** Out of the scroll-back. `restore`: show the last thing he was shown again. */
function leaveReading(restore = true, force = false) {
  if (!reading) return;
  // The cockpit IS the conversation: something new arriving shows under it rather than replacing it.
  if (cockpit && !force) { scroller.hidden = false; return; }
  reading = false;
  lbOpen = null; lbReplying = null;
  paintBack();
  if (lbOwnsLantern) { bubble.classList.remove('lantern'); lbOwnsLantern = false; }
  scroller.hidden = false;
  if (restore && lastShown) { laidOut = null; onBrain({ ...lastShown, stream: false, recalled: true }); }
}

// A mouse wheel up over the bubble opens the scroll-back, from any message, short or long. A long reply scrolls its
// own words first; only at the top of them does looking back begin.
bubble.addEventListener('wheel', (e) => {
  if (reading || e.deltaY >= 0 || bubble.hidden) return;
  if (e.target.closest('.boardwrap, .nmini, .bignote, .bchips, .inline, .tset, .research, .opts, .asks')) return;
  if (!scroller.hidden && scroller.scrollTop > 4) return;
  enterReading();
}, { passive: true });

/**
 * PageUp / PageDown, pressed in the typing box.
 *
 * The C#'s rule, one line, ported as it stands (PetWindow:355):
 *   `if (d > 0 && bubble.More) ExpandBubble(); else if (bubble.Scroll(d * 6)) ...; FillStackFromMemory();`
 * So PageDown on a collapsed reply OPENS it rather than scrolling past it, which is the first thing he
 * would want; otherwise both directions move six lines, and reaching the top opens the scroll-back.
 */
window.aang?.onPage?.((d) => {
  if (bubble.hidden && d > 0) return;
  if (d > 0 && !more.hidden && !expanded && !reading) { expanded = true; fit(); return; }
  const list = document.getElementById('lblist');
  if (reading && list && cockpit) { window.dispatchEvent(new CustomEvent('cockpit:page', { detail: d })); return; }
  if (reading && list) { list.scrollTop += d * 6 * lineHeight; if (list.scrollTop < 8) askOlder(); return; }
  if (d < 0 && (bubble.hidden || scroller.scrollTop <= 4)) { enterReading(); return; }
  scroller.classList.add('scrolls');
  scroller.scrollTop += d * 6 * lineHeight;
});

// ---------------------------------------------------------------- the one cockpit (2026-10-21, sheet 46)
// His ask "for ages": ONE bubble. Opened (Ctrl+Plus, a click on Aang, a click on a message), it grows into the Lantern
// cockpit: the conversation (the scroll-back, newest at the bottom), the thing waiting on him pinned under it, the jobs
// strip, and the typing area as its bottom edge. Closed (Esc, a click elsewhere, Ctrl+Plus again), it goes back to Aang
// speaking in one line. The main process gives the window the keyboard and takes it back (cockpit.ts).
let cockpit = false, cockMaxH = 600;
const typingArea = startTyping({ onSize: () => { if (cockpit) reportSize(); } });

// ---- the last exchange (his decision, 2026-10-21)
// Opening Aang shows only the last exchange (his last message and Aang's answer, or Aang's current line) and the typing
// area, never the whole scroll-back. Older rows come only when he scrolls up for them (the wheel or PageUp at the top),
// a few at a time, so the conversation grows only as messages arrive or as he asks for more.
/** How many of the oldest rows the brain has sent are not drawn yet. Pages of older rows arrive at the front. */
let ckHidden = 0;
/** Opened, and the first page has not come back yet: the last exchange is worked out from it. */
let ckFresh = false;
/** He scrolled up past everything loaded: the next page that arrives is shown, not just kept. */
let ckMore = false;
/** How many rows the last step up revealed, so they can fade in (paintBack). */
let ckReveal = 0;
let ckStepAt = 0;
const OLDER_STEP = 6;
/** Where the last exchange starts: his last message if Aang's answer (or nothing yet) follows it, else Aang's last line. */
function lastExchangeAt(turns) {
  const n = turns.length;
  if (!n) return 0;
  if (turns[n - 1].who === 'you') return n - 1;
  return n >= 2 && turns[n - 2].who === 'you' ? n - 2 : n - 1;
}
/** A page of older rows came back (`added` of them, at the front). */
function ckPage(added) {
  if (ckFresh) { ckFresh = false; ckHidden = lastExchangeAt(back.turns); return; }
  ckHidden += added;
  if (ckMore) { ckMore = false; const before = ckHidden; ckHidden = Math.max(0, ckHidden - OLDER_STEP); ckReveal = before - ckHidden; }
}
/** He scrolled up at the top of the conversation: a few more rows, from what is loaded or from the brain. */
function olderStep() {
  if (!cockpit || !reading) return;
  const now = Date.now();
  if (now - ckStepAt < 250) return;              // one wheel flick is many events; one step each quarter second
  ckStepAt = now;
  if (ckHidden > 0) {
    const before = ckHidden;
    ckHidden = Math.max(0, ckHidden - OLDER_STEP);
    ckReveal = before - ckHidden;
    paintBack('bottom'); fit(); reportSize();
    return;
  }
  if (back.reachedTheStart || back.waiting) return;
  ckMore = true;
  askOlder();
}
// No OLDER key and no wheel-for-older inside the cockpit (his call, 2026-10-21: "older isn't needed and it's taking up
// space"). The history is a step away where it always was: the wheel over Aang himself (onPage -> cockpit:page ->
// olderStep) or his right-click menu.

// ---------------------------------------------------------------- C4: Claude in the cockpit (2026-10-21)
// The jobs strip and the pinned Claude card (claudejobs.js). What he sends a session joins the conversation as his own
// plum row with Claude's icon and the project tag. "No, and..." and "Something else" need the typing area: a closed
// cockpit opens first (the same way a click on a message does), then the area is pointed at the session.
let afterOpen = null;
claude = startClaude({
  typing: typingArea,
  isOpen: () => cockpit,
  withTyping: (f) => { if (cockpit) { f(); return; } afterOpen = f; openCockpit(false); },
  onMine: (text, project, when) => {
    back.add({ id: localId--, ts: tsNow(), who: 'you', text: String(text), extra: { to: String(project), ...(when ? { when } : {}) } });
    if (reading) { paintBack('bottom'); const list = el('lblist'); if (list) list.scrollTop = list.scrollHeight; }
  },
  onChange: () => {
    // Sheet 53: nothing left in the strip with the jobs open from the mark: the bubble goes. 2026-10-22: a job finishing
    // no longer empties it (its done card stays, his ask), so this is the last done card X'd or opened, or a job stopped.
    if (jobsOpen && el('ckjobs').hidden && !bubble.hidden && !bubble.classList.contains('leaving')) { goAway(); return; }
    // Sheet 52 (2026-10-21): a job pulled out or put back changes how many there are; the line over the bars says so.
    if (jobsOpen && !bubble.hidden) { const line = jobsLineNow(); if (said.textContent !== line) { reveal.start(line, false); reveal.skip(); paint(); } }
    // The card he just answered was all the closed bubble held: it goes now, not as an empty frame (2026-10-22).
    if (closeIfEmpty()) return;
    if (!bubble.hidden) { fit(); reportSize(); }
  },
  onWaiting: (has, fresh) => claudeWaiting(has, fresh),
  stripOn: () => cockpit || jobsOpen,
  onOpened: () => closeForClaude(),
});
/** The finished Claude news on show now ({ session, open, project, host }), or null. */
let claudeDone = null;
/** The note a noticed line came from (kind 'note.notice'), while that line is on show: a click opens it. */
let noticeNote = null;
/** The note line Qwen noticed (for "Tick it"). */
let noticeLine = '';

// ---------------------------------------------------------------- sheet 60 B (his pick, 2026-10-22): Aang holds it up
// While a noticed line is on show, Aang holds a little paper in the note's category colour (its own small window over his
// hands, noteheld.ts) and the note's name in his line is the link. Its keys, Tick it / Open / Later, wait for intent: they
// come only after the pointer has rested on the bubble (or the paper) for about 1.5 s (his hover-keys rule). The paper
// goes down the moment the line does. Never in a game and held while Claude is in front: the brain already sees to that.
let heldOver = false, heldId = null, overSince = 0;
/** @type {HTMLElement|null} */ let nkeys = null;
const HOVER_KEYS_MS = 1500;
function noticeTick() {
  const showing = !!noticeNote && !bubble.hidden && !bubble.classList.contains('leaving') && !cockpit && !boardOpen && !reading;
  const id = showing ? noticeNote : null;
  if (id !== heldId) {
    heldId = id;
    if (id) { const n = notesAll.find((x) => x.id === id); const c = catColour(n?.cat); window.aang?.noticeHeld?.({ on: true, paper: c.paper, deep: c.deep }); }
    else { window.aang?.noticeHeld?.({ on: false }); heldOver = false; overSince = 0; if (nkeys) { nkeys.remove(); nkeys = null; } }
  }
  if (!id) return;
  const pointing = overNow || heldOver;
  if (!pointing) { overSince = 0; if (nkeys && !nkeys.hidden) { nkeys.hidden = true; fit(); reportSize(); } return; }
  if (!overSince) overSince = Date.now();
  if (Date.now() - overSince >= HOVER_KEYS_MS && (!nkeys || nkeys.hidden)) noticeKeys(id);
}
setInterval(noticeTick, 120);
/** The noticed line's own unticked tick box in the note, if it has one. */
function noticeTickLine(n) {
  if (!n || !noticeLine) return null;
  const box = document.createElement('div'); box.innerHTML = cleanNoteHtml(n.html);
  const want = noticeLine.replace(/\s+/g, ' ').trim().toLowerCase();
  return [...box.querySelectorAll('div.cl:not(.done)')].find((d) => (d.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase() === want) ? box : null;
}
function noticeKeys(id) {
  const n = notesAll.find((x) => x.id === id);
  if (!nkeys || nkeys.dataset.for !== id) {
    nkeys?.remove();
    nkeys = T('div', 'keys nkeys'); nkeys.dataset.for = id;
    const k = (label, cls, fn) => { const b = T('button', 'key sm' + (cls ? ' ' + cls : ''), label); b.type = 'button'; b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); nkeys.append(b); };
    if (noticeTickLine(n)) k('Tick it', 'primary', () => {
      const cur = notesAll.find((x) => x.id === id), box = noticeTickLine(cur);
      if (cur && box) {
        const want = noticeLine.replace(/\s+/g, ' ').trim().toLowerCase();
        const line = [...box.querySelectorAll('div.cl:not(.done)')].find((d) => (d.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase() === want);
        line?.classList.add('done');
        const next = { ...cur, html: box.innerHTML };
        notesAll = notesAll.map((x) => (x.id === id ? next : x));
        window.aang?.notesSave?.(next);
      }
      noticeDone();
    });
    k('Open', n && !noticeTickLine(n) ? 'primary' : '', () => { noticeNote = null; openBoard(); openNote(id); });
    k('Later', '', () => noticeDone());
    scroller.after(nkeys);
  }
  nkeys.hidden = false;
  // Three keys sit on one row: the balloon takes its wider size while they show.
  bubble.classList.add('wide');
  // The same 600 ms guard as the asks: keys that just appeared under the pointer cannot be hit by accident.
  nkeys.classList.add('guard'); setTimeout(() => nkeys?.classList.remove('guard'), 600);
  fit(); reportSize();
}
/** Tick it or Later: he lowers the paper and the line goes. */
function noticeDone() {
  noticeNote = null;
  noticeTick();
  overNow = false; document.getElementById('wrap')?.classList.remove('over'); window.aang?.bubbleClickable?.(false);
  clearTimeout(hideTimer);
  goAway();
}
/**
 * 2026-10-21 (his ask: "click into a done Claude task ... and be taken to that job"): THAT session to the front in the
 * Claude app: its own link from the brain, else the job with that id or project the bubble knows, else the Claude app
 * forward; on the MacBook, the Mac's Claude. The bubble goes at once (closeForClaude).
 */
function goDone(d) {
  const link = typeof d?.open === 'string' && /^claude:\/\/claude\.ai\/epitaxy\//.test(d.open) ? d.open : null;
  const target = d?.host === 'mac' ? 'mac' : link ?? claude?.openFor?.({ session: d?.session, project: d?.project }) ?? 'front';
  window.aang?.openClaude?.(target);
  if (reading) leaveReading(false);
  claudeDone = null; bubble.classList.remove('cdone');
  closeForClaude();
}
/**
 * 2026-10-21 (his rule): Open in Claude closes Aang's bubble at once, no fade, so it never sits over the session coming to
 * the front. A Claude question it showed stays waiting in the brain (parked, as a click away does). The open cockpit
 * closes through the main process like any other click away.
 */
function closeForClaude() {
  if (cockpit) { window.aang?.inputClose?.(); return; }
  if (bubble.hidden) return;
  clearTimeout(hideTimer);
  parkAsks(); claude?.park();
  endSessions(); endJobs();
  recentOpen = false; wrapEl?.classList.remove('ago');
  closeBoard();
  bubble.hidden = true;
  snapShut();
  if (overNow) { overNow = false; document.getElementById('wrap')?.classList.remove('over'); }
  window.aang?.bubbleClickable?.(false);
  window.aang?.bubbleHidden?.();
}
/**
 * Sheet 52 (2026-10-21): what the torn-off job windows tell the bubble.
 *   back  dropped on Aang or his bubble: the bar slides back into the list (opening the jobs if the bubble was closed);
 *   near  dragged close: a soft warm glow round the bubble's edge while it is near, gone when it moves off;
 *   ask   its "needs you" chip: the bubble opens on that job's waiting question. Message: the typing box is pointed
 *         at that session (as the bar's own purple key does).
 */
window.aang?.onJobPop?.((kind, m) => {
  if (!claude || !m || typeof m !== 'object') return;
  if (kind === 'near') { wrapEl?.classList.toggle('jpnear', m.near === true); return; }
  if (kind === 'back') {
    wrapEl?.classList.remove('jpnear');
    if (typeof m.id !== 'string') return;
    claude.putBack(m.id);
    // His bubble was closed (or showing something else): it opens on the jobs so he sees it land.
    if (!cockpit && !jobsOpen && claude.running() > 0) showJobs();
    return;
  }
  if (kind === 'ask') {
    if (m.t === 'jobpop.ask' && typeof m.id === 'string') {
      if (reading) leaveReading(false);
      claude.showWait(m.id);
      claudeWaiting(true, true, true);
    } else if (m.t === 'jobpop.message' && typeof m.session === 'string') {
      claude.messageJob(m.session);
    }
  }
});
/**
 * Something a Claude session waits on, with the cockpit closed: the bubble speaks the same card (Aang saying it), so he
 * can answer without opening anything. Not in a game (the pet's marks hold it, as for every Claude ask) and not when he
 * has hidden Aang. When the last one is answered, a bubble that only held the card goes.
 */
function claudeWaiting(has, fresh, asked = false) {
  if (cockpit) return;
  if (!has) {
    if (closeIfEmpty()) return;
    if (!bubble.hidden && scroller.hidden && !asking && card.hidden && working.hidden) goAway();
    return;
  }
  // He clicked the mark (`asked`): shown even in a game, and over whatever was there (sheet 53).
  if (!fresh || ((quiet || petHidden || reading) && !asked)) return;
  endJobs();
  if (bubble.hidden || asked) cardOnly();
  clearTimeout(hideTimer);
  show(); fit(); reportSize();
}
/** The bubble holds only the Claude card: Aang's last words, the plaque and the keys go. */
function cardOnly() {
  reveal.clear(); laidOut = null; paintWords();
  scroller.hidden = true; who.textContent = ''; who.hidden = true; setSpeaker(null);
  tools.hidden = true; more.hidden = true; card.hidden = true; mediaRow.hidden = true;
  bubble.classList.remove('whisper', 'lantern', 'widest');
  bubble.classList.add('wide');                  // sheet 45g draws these cards about 420 wide
  bubble.classList.remove('enter'); void bubble.offsetWidth; bubble.classList.add('enter');
}
window.aang?.onCockpit?.((c) => { if (c?.open) openCock(c.state ?? {}); else closeCock(); });

// `docked` is NOT touched here (2026-10-21). It means one thing, as it always has: he clicked a message and what he
// types answers it (openCockpit sets it, the main process's undock clears it, and a "sent" undock keeps the bubble for
// the answer). The open cockpit's own "never fade while open" is the `cockpit` flag, which scheduleHide and goAway check.
// Opening it with the hotkey therefore never pretends a message was clicked, and closing it after a click lets the
// main process's undock (sent right behind cockpit:close) dismiss the message exactly as the old docked box did.
function openCock(st) {
  // Never more room than the window can have (WINDOW_MAX_H): the frame's top was cut off on his desktop (2026-10-21).
  cockMaxH = Math.min(SHAPE_MAX_H, Number(st.maxH) > 240 ? Number(st.maxH) : 600);
  if (cockpit) { typingArea.setLive(true); return; }
  cockpit = true;
  live = null; cockStreaming = false;              // what is showing now is in the conversation the brain sends back
  clearTimeout(hideTimer);
  closeBoard();
  el('ck').hidden = false;
  bubble.classList.remove('whisper');
  bubble.classList.add('cockpit', 'lantern');
  // The last exchange only (2026-10-21). Already looking back: what is loaded decides it now; otherwise the first page does.
  ckMore = false; ckReveal = 0;
  claude?.unpark();
  if (reading) { ckFresh = false; ckHidden = lastExchangeAt(back.turns); paintBack('bottom'); }
  else { ckFresh = true; ckHidden = 0; enterReading(); }
  // Anything of Aang's own that he put away with a click outside (or Esc) is still waiting: it comes back pinned here.
  if (!asking && waiting.length) showTopAsk();
  // Who is talking (the Claude tag, a channel's face) and a card's plaque belong to the live thing, so in the cockpit
  // they sit with it under the conversation, not above it.
  scroller.before(speaker, who.parentElement);
  claude?.setOpen(true);
  show(); fit(); reportSize();
  typingArea.setLive(true);
  if (afterOpen) { const f = afterOpen; afterOpen = null; f(); }
}

function closeCock() {
  if (!cockpit) return;
  cockpit = false;
  live = null; cockStreaming = false;
  typingArea.setLive(false);
  el('ck').hidden = true;
  claude?.setOpen(false);
  bubble.classList.remove('cockpit', 'ckwide', 'ckask');
  scroller.classList.remove('k-claude', 'k-action');
  leaveReading(false, true);
  // Back where the one bubble has them: above the words.
  (el('back') ?? scroller).before(speaker, who.parentElement);
  // Back to the one bubble: the cards that only made sense inside the cockpit go with it, and the wood goes unless a
  // Claude plan is what stays waiting.
  card.hidden = true; paintAbout(false); mediaRow.hidden = true;
  bubble.classList.remove('lantern');
  // His decision (2026-10-21): closing (a click outside, Esc, Ctrl+Plus) always goes back to rest, even with a question
  // or a choice showing and nothing picked. Before, the question was drawn again the one-bubble way and a Claude card
  // came back as the closed bubble, so he could never click out of it. Nothing is answered or lost: Aang's own asks stay
  // in his queue and a Claude question stays waiting in the brain, and both are pinned again when he next opens Aang.
  parkAsks();
  claude?.park();
  // Aang still answering keeps his line (it arrives as a normal bubble).
  if (!working.hidden) { fit(); reportSize(); return; }
  // He closed it by clicking somewhere else (or Esc): the mouse is not on the bubble, but the window went click-through
  // before it could hear the mouse leave, so "pointer over" stayed true and goAway refused, leaving an empty wood
  // frame on his desktop (seen on his screen, 2026-10-21). If the mouse really is over it, the next move says so again.
  overNow = false;
  document.getElementById('wrap')?.classList.remove('over');
  window.aang?.bubbleClickable?.(false);
  goAway();
}
/** Aang's own question leaves the screen but stays in the queue (`waiting`), unanswered, for the next open. */
function parkAsks() {
  if (!asking) return;
  asking = null; if (kindReady) syncKind();
  asks.hidden = true; asks.replaceChildren();
  choiceList(null); paintPlan(null, -1); samaraPlan(null);
  for (const id of ['under', 'count', 'means', 'exact']) { const e = document.getElementById(id); if (e) e.hidden = true; }
}

/** What is live under the conversation now, so it can join the conversation when something new takes its place. */
let live = null, cockStreaming = false;
/** The row a message becomes in the conversation: its words, and the rich part a row knows how to open. */
function liveOf(m) {
  const extra = {};
  if (m.brief && typeof m.brief === 'object') extra.brief = m.brief;
  if (m.research && typeof m.research === 'object') extra.research = m.research;
  if (m.about && typeof m.about.url === 'string') extra.about = m.about;
  if (m.face && typeof m.face === 'object') extra.face = m.face;
  // Sheet 48: the kind the brain marked (Claude's news with its project, or something done for him), as the stored row has it.
  if (m.kind === 'claude' || m.kind === 'action') extra.kind = m.kind;
  if (m.kind === 'claude' && typeof m.project === 'string') extra.project = m.project;
  const text = String(m.text || (extra.brief ? 'Your brief' : extra.research ? 'This week’s research' : ''));
  return { id: typeof m.turn === 'number' ? m.turn : null, text, extra: Object.keys(extra).length ? extra : null };
}
/**
 * Sheet 48 (2026-10-21): the live answer under the conversation wears its kind's paper, as its row will. Only the
 * kinds that show as words here (Claude's news, something done for him); the brief and a video have their own cards.
 */
function livePaper(l) {
  const k = cockpit && l && !l.skip ? kindOf({ who: 'Aang', text: l.text, extra: l.extra })?.k : '';
  scroller.classList.toggle('k-claude', k === 'claude');
  scroller.classList.toggle('k-action', k === 'action');
}
/** The live thing joins the conversation as its newest row (a brief or a video row opens again in place there). */
function cockCommit() {
  livePaper(null);
  const l = live; live = null;
  if (!cockpit || !l || l.skip || !(l.text || l.extra)) return;
  back.add({ id: l.id ?? localId--, ts: tsNow(), who: 'Aang', text: l.text, extra: l.extra });
  paintBack('bottom');
  const list = el('lblist'); if (list) list.scrollTop = list.scrollHeight;
}
/** Empty the live area (not the conversation, not the typing area): a question answered or timed out, a stop. */
function clearLive() {
  livePaper(null);
  reveal.clear(); laidOut = null; paintWords();
  scroller.hidden = true;
  who.textContent = ''; who.hidden = true; who.classList.remove('plaque', 'red');
  setSpeaker(null);
  for (const id of ['means', 'exact', 'mailcard', 'chips', 'rlist']) { const e = document.getElementById(id); if (e) e.hidden = true; }
  choiceList(null); paintPlan(null, -1); samaraPlan(null);
  card.hidden = true; paintAbout(false); mediaRow.hidden = true;
  fit(); reportSize();
}
/**
 * A card he is finished with (Got it, Done, Start, a drop's keys). In the one bubble it goes away as before. In the
 * cockpit it joins the conversation as a row (the brief, the research) and the cockpit stays open (2026-10-21).
 */
function cardDone() {
  if (!cockpit) { releaseMouse(); goAway(); return; }
  cockCommit();
  typing(false);
  card.hidden = true; card.replaceChildren();
  who.textContent = ''; who.hidden = true; who.classList.remove('plaque', 'red');
  if (!asking) { asks.hidden = true; asks.replaceChildren(); scroller.hidden = !reveal.whole; }
  fit(); reportSize();
}
/** "Now playing" and the like, in the cockpit: one quiet line in the live area, never kept in the conversation. */
function cockWhisper(w) {
  if (asking) { whisperNext = w; return; }    // a pinned question keeps the live area; the line waits
  cockCommit();
  live = { skip: true }; cockStreaming = false;
  reveal.start(w.text, false); reveal.skip();
  expanded = false;
  who.hidden = true; setSpeaker(null);
  for (const id of ['means', 'exact', 'mailcard']) { const e = document.getElementById(id); if (e) e.hidden = true; }
  card.hidden = true; paintAbout(false);
  scroller.hidden = false; working.hidden = true;
  mediaRow.hidden = w.controls !== 'media';
  bubble.classList.remove('enter'); void bubble.offsetWidth; bubble.classList.add('enter');
  paint();
}

/** The row's stored time format ("2026-10-21 13:14:02", UTC), for rows the cockpit adds before the brain stores them. */
const tsNow = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
let localId = -1;
/**
 * He sent something from the cockpit: the answer before it (if one is showing) and his own words join the
 * conversation, and the live area under it waits for the new answer. Stored rows come back on the next look.
 */
function cockSaid(text) {
  cockCommit();
  if (!asking) { card.hidden = true; paintAbout(false); mediaRow.hidden = true; }
  back.add({ id: localId--, ts: tsNow(), who: 'you', text: String(text) });
  // A question pinned in the live area stays there, words and keys: he said something else, he did not answer it.
  if (!asking) { reveal.clear(); laidOut = null; paintWords(); scroller.hidden = true; who.hidden = true; setSpeaker(null); }
  paintBack('bottom');
  const list = el('lblist'); if (list) list.scrollTop = list.scrollHeight;
  fit(); reportSize();
}

/**
 * The conversation takes whatever room the cockpit has left (about two thirds of the screen in all), and never pushes
 * the typing area off it. The bubble is measured with the list at full length first, then the list is capped.
 */
function fitCockpit() {
  const list = el('lblist');
  bubble.classList.add('lantern');            // the cockpit is always the Lantern (his pick)
  bubble.classList.toggle('ckask', Boolean(asking));
  // Wider for a video or a card (the brief, research, the notes board), opened in the conversation or live under it.
  bubble.classList.toggle('ckwide', Boolean(document.querySelector('#lblist .lt-item.open .vshot, #aboutbox:not([hidden]) .vshot')) || !card.hidden);
  if (!list) { squeezeClaude(); return; }
  // A row's label open under the mouse is not part of the conversation's size: measured at rest, opened again after
  // (2026-10-21, lookback.js restKinds), so a label never makes the cockpit taller.
  const reopen = restKinds(list);
  // His place, from the bottom (the conversation is anchored to its newest row): measuring takes the cap off for a
  // moment, which throws the scroll position to 0, so it is put back exactly afterwards.
  const fromBottom = list.scrollHeight - list.scrollTop;
  const atBottom = fromBottom - list.clientHeight < 8;
  capConversation(list);
  list.scrollTop = atBottom ? list.scrollHeight : list.scrollHeight - fromBottom;
  squeezeClaude();
  reopen();
}
/**
 * Give the conversation its height: all of its rows if they fit in the cockpit's room, else what is left after
 * everything else. Measured from scratch every time (the cap off, everything at rest), so measuring twice gives the
 * same answer (2026-10-21; before, it measured from what the last measure left behind, and the size crept). The cap
 * is always a number, never "none": a row opening under the mouse then scrolls inside the conversation and can never
 * grow the window.
 */
function capConversation(list) {
  list.style.maxHeight = 'none';
  const n = natural(() => {
    const cs = getComputedStyle(list);
    const edge = cs.boxSizing === 'border-box' ? 0 : parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    return list.getBoundingClientRect().height - edge;
  });
  // A few pixels kept back: the frame's own edge and rounding must fit inside the room too.
  const over = n.h - (cockMaxH - 8);
  const full = n.extra;
  list.style.maxHeight = (over > 0 ? Math.max(Math.min(140, full), full - over) : full).toFixed(2) + 'px';
}
// For the checks (cockpit-steady-check.ts): measure the open cockpit once, as reportSize does, and say what it found.
window.__cockMeasure = () => { if (!cockpit) return null; fitCockpit(); const n = natural(); return { w: n.w, h: n.h, list: el('lblist')?.style.maxHeight ?? '' }; };

/**
 * C4 (2026-10-21): the jobs strip and the pinned card are never pushed off either. When the conversation is down to its
 * few lines and there is still too little room, sheet 45g's order: the list of other jobs folds first, then the pinned
 * card scrolls inside itself, with the soft fade and SCROLL FOR MORE.
 */
function squeezeClaude() {
  const pin = document.querySelector('#ckpins .pin');
  if (pin) { pin.style.maxHeight = ''; pin.classList.remove('capped'); pin.querySelector('.morehint')?.remove(); }
  let over = natural().h - (cockMaxH - 8), folded = false;
  while (over > 0 && claude?.fold()) { folded = true; over = natural().h - (cockMaxH - 8); }
  // Folding gave room back: the conversation is measured afresh and takes it again.
  const list = el('lblist');
  if (folded && list && over < 0) { const fb = list.scrollHeight - list.scrollTop; capConversation(list); list.scrollTop = list.scrollHeight - fb; over = natural().h - (cockMaxH - 8); }
  if (over > 0 && pin) {
    pin.style.maxHeight = Math.max(90, pin.offsetHeight - over) + 'px';
    pin.classList.add('capped');
    const m = T('div', 'morehint', 'SCROLL FOR MORE');
    pin.append(m);
    pin.addEventListener('scroll', () => { if (pin.scrollTop > 10) m.remove(); }, { once: true });
    over = natural().h - (cockMaxH - 8);
  }
  // Last, the task list of the bar he has open scrolls inside itself the same way.
  const tasks = document.querySelector('#ckjobs .job.open .list');
  if (tasks) { tasks.style.maxHeight = ''; tasks.classList.remove('capped'); }
  if (over > 0 && tasks) { tasks.style.maxHeight = Math.max(60, tasks.offsetHeight - over) + 'px'; tasks.classList.add('capped'); over = natural().h - (cockMaxH - 8); }
  // Still too tall (a small screen): even the bar he opened folds back. The cockpit never goes past its room.
  if (over > 0 && claude?.fold(true)) squeezeClaude();
}

// PageUp / PageDown in the typing area move the conversation.
window.addEventListener('cockpit:page', (e) => {
  const list = el('lblist');
  if (!list) return;
  const d = Number(e.detail);
  // PageUp already at the top: older rows, the same as the wheel (2026-10-21).
  if (d < 0 && list.scrollTop <= 4) { olderStep(); return; }
  list.scrollTop += d * 6 * lineHeight;
});
// A click away from an opened row closes it, like any list he has used (his ask, 2026-10-21). Rows and menus keep theirs.
document.addEventListener('click', (e) => {
  if (!reading || lbOpen === null) return;
  if (e.target.closest?.('.lt-item, .turnmenu')) return;
  lbOpen = null; paintBack('top'); fit(); reportSize();
}, true);
// A click in the window but outside the drawn cockpit (the see-through margin round it, where the tail hangs) is a click
// outside too (his decision, 2026-10-21: he can always click out). The window itself still has the keyboard there, so
// it never blurs and cockpit.ts never heard it; the pet's outside-click watch counts the whole window as ours.
document.addEventListener('mousedown', (e) => {
  if (!cockpit) return;
  const t = /** @type {HTMLElement} */ (e.target);
  if (t?.closest?.('#bubble, #tools, #turnmenu, #under, .boardwrap')) return;
  window.aang?.inputClose?.();
}, true);
// Esc anywhere in the open cockpit, not only in the typing area (the parity list: Esc closes things, 2026-10-21). He may
// have clicked a brief's key or a row, so the caret is not in the field: an opened row closes first, then the cockpit.
// Captured, so it sees a right-click menu before the menu's own Esc removes it (the menu goes first, alone). The field
// keeps its own Esc (stop Aang, or close), and a note or a plan's change box keeps Esc for its own text.
window.addEventListener('keydown', (e) => {
  if (!cockpit || e.key !== 'Escape') return;
  const t = /** @type {HTMLElement} */ (e.target);
  if (t?.id === 'ckBox' || t?.closest?.('[contenteditable="true"], .plannote') || document.getElementById('turnmenu')) return;
  e.preventDefault();
  if (lbOpen !== null) { lbOpen = null; paintBack('top'); fit(); reportSize(); return; }
  window.aang?.inputClose?.();
}, true);

// ---------------------------------------------------------------- the one-line door (sheet 41)
// "HisWattson posted a video" arrives as one line with the channel's face. A click opens the video under it: its
// picture and one big play key. A click on that opens it in Samara.
let curAbout = null, aboutShown = false;
function paintAbout(open) {
  let box = document.getElementById('aboutbox');
  if (!box) { box = document.createElement('div'); box.id = 'aboutbox'; box.className = 'aboutbox'; scroller.after(box); }
  aboutShown = !!(open && curAbout);
  box.replaceChildren();
  box.hidden = !aboutShown;
  if (!aboutShown) return;
  const video = /^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/watch|youtu\.be\/|twitch\.tv\/)/i.test(curAbout.url);
  box.append(video ? videoShot(curAbout, (url) => window.aang?.openThing?.({ kind: 'link', value: url })) : linkEl(curAbout.url, curAbout.title || undefined));
  if (video) bubble.classList.add('wide', 'widest');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(goAway, 120000);
  fit(); reportSize();
}

more.addEventListener('click', () => {
  expanded = !expanded;
  // Opening a summarised answer goes to the open size, 556, as the sheet does; closing it goes back.
  if (shortOf()) {
    bubble.classList.toggle('widest', expanded);
    if (expanded) bubble.classList.add('wide');
    paint();
    return;
  }
  // 2026-10-21: the balloon follows the opened lines on its spring. fit() alone lifted the text's cap, but the balloon
  // keeps an explicit height once it has grown (place), so the extra lines sat clipped under its edge.
  fit(); reportSize();
});

el('copy').addEventListener('click', () => {
  // The WHOLE message, never the part on screen.
  window.aang?.copyText?.(reveal.whole);
  const b = el('copy');
  b.textContent = 'Copied';
  setTimeout(() => { b.textContent = 'Copy'; }, 1200);
});


// ---------------------------------------------------------------- Sheet 37: a Claude session's plan
// 2026-10-22 (his screenshot: "the icon isn't Samara?", "the tick mark is also off", "'sites' do I need this?"): the card
// is the speech bubble now, sheet 53 look B's parchment inside the S2 wood rim, never the Lantern's dark wood. Samara's
// own icon (the L1 plum lantern), the Styled type roles (kicker CLAUDE · <SESSION> in the pixel label, the task as the
// bold question), the bubble's own keys. SITES lists real websites only: a page on this computer (local) is left out,
// and with nothing left the section goes. Each tick is a pixel check drawn centred in its box (bubble.css .tq).
// The pieces are still the slips (lt-slip, lt-item, lt-tile), on the paper. Built with textContent: Claude's words.
const planBox = document.createElement('div');
planBox.className = 'samaraplan';
planBox.hidden = true;
scroller.after(planBox);
const planKept = new Set();
function samaraPlan(m) {
  planBox.replaceChildren();
  planBox.hidden = !m;
  if (!m) return;
  const c = m.samara;
  planKept.clear(); for (const x of c.sites ?? []) planKept.add(String(x.site));
  bubble.classList.add('wide');
  who.hidden = true; said.textContent = '';
  const top = T('div', 'pc-top');
  const lamp = document.createElement('img'); lamp.src = 'art/samara/samara-32.png'; lamp.srcset = 'art/samara/samara-32.png 1x, art/samara/samara-64.png 2x'; lamp.alt = ''; lamp.width = 32; lamp.height = 32;
  const from = String(c.from ?? '').trim();
  const head = T('div'); head.append(T('small', 'pc-kick', from ? `CLAUDE · ${from.toUpperCase()}` : 'CLAUDE'), T('b', 'pc-task', String(c.task ?? '')));
  top.append(lamp, head);
  planBox.append(top);
  const web = (c.sites ?? []).filter((x) => !x.local);
  const sites = T('div', 'lt-slip');
  if (web.length) { sites.append(T('h3', '', 'SITES')); planBox.append(sites); }
  for (const x of web) {
    const item = T('div', 'lt-item'), row = T('div', 'lt-head'), tile = T('span', 'lt-tile');
    const globe = () => pixIcon('globe', 2) ?? T('span');
    if (x.favicon) { const i = document.createElement('img'); i.alt = ''; i.onerror = () => i.replaceWith(globe()); i.src = x.favicon; tile.append(i); } else tile.append(globe());
    const txt = T('span', 'lt-txt'); txt.append(T('b', '', String(x.site)));
    if (x.login) txt.append(T('span', '', 'with your login'));
    const tick = T('button', 'tq'); tick.type = 'button'; tick.setAttribute('aria-pressed', 'true'); tick.title = 'Untick to keep Claude off ' + x.site;
    tick.addEventListener('click', () => { const on = !planKept.has(x.site); if (on) planKept.add(x.site); else planKept.delete(x.site); tick.classList.toggle('off', !on); item.classList.toggle('off', !on); tick.setAttribute('aria-pressed', String(on)); });
    row.append(tile, txt, tick); item.append(row); sites.append(item);
  }
  const steps = T('div', 'lt-slip'); steps.append(T('h3', '', 'STEPS'));
  (c.steps ?? []).forEach((t, i) => { const row = T('div', 'lt-head'), tile = T('span', 'lt-tile'); tile.append(T('span', 'num', String(i + 1))); const txt = T('span', 'lt-txt'); txt.append(T('b', '', String(t))); row.append(tile, txt); const item = T('div', 'lt-item'); item.append(row); steps.append(item); });
  planBox.append(steps);
  if (c.wont) { const w = T('div', 'wont'); const ic = pixIcon('wont', 2); if (ic) w.append(ic); w.append("Won't " + String(c.wont).replace(/^won.?t\s+/i, '')); planBox.append(w); }
  const note = document.createElement('textarea'); note.className = 'plannote'; note.id = 'plannote'; note.rows = 2; note.maxLength = 500; note.placeholder = 'What should Claude change?'; note.hidden = true;
  planBox.append(note);
}
function openPlanNote() {
  const n = document.getElementById('plannote');
  if (!n) return;
  n.hidden = false; n.focus();
  const go = document.getElementById('plango'); if (go) go.firstChild.textContent = 'Send changes';
  fit(); reportSize();
}
/** What goes back: the sites he kept, his typed change (which turns Go into Change). */
function planAnswer(choice) {
  const n = document.getElementById('plannote');
  const note = n && !n.hidden ? n.value.trim().slice(0, 500) : '';
  return { choice: choice === 'go' && note ? 'change' : choice, keep: [...planKept], note };
}

// Sheet 64: everything syncKind reads exists now.
kindReady = true;
