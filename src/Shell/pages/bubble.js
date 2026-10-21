// Step 6.12: the bubble's behaviour.
//
// The reveal pace, the collapse thresholds and the skip-versus-expand rule all live in reveal.ts, which
// is tested. This file is the part that needs a screen: measuring real lines of real text, and the
// clicks.
import { Reveal, TICK_MS, WORD_MS, hasMore, linesShown, scrolls, summaryOf } from './reveal.js';
import { balloonPath, paintBalloon, PAD_R, PAD_B, DEFAULT_AIM, WIDEST_AFTER_LINES } from './balloon.js';
import { HOLD_MS, askFrom } from './asks.js';
import { blocks, shownWords } from './rich.js';
import { find as findEntities } from './entities.js';
import { Scrollback, atTop } from './scrollback.js';
import { buildPaper, openMenu, previewLines, tickCount, paintNote } from './notepaper.js';
import { pixIcon, SKIES } from './pixicons.js';
import { paintLookback, linkifyWords, videoShot, linkEl } from './lookback.js';
import { startTyping } from './cocktype.js';

const el = id => document.getElementById(id);
const bubble = el('bubble'), said = el('said'), scroller = el('scroller'), more = el('more');
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

/** How many lines the text actually takes, measured rather than estimated. */
function lineCount() {
  if (!said.textContent) return 0;
  // scrollHeight is the full height whatever the box is clipped to, so this is right even collapsed.
  return Math.max(1, Math.round(said.scrollHeight / lineHeight));
}

/** Clip the text to the right number of lines and decide whether the arrow belongs. */
function fit() {
  const total = lineCount();
  // A summarised answer shows all of whatever is laid out (the short version, or everything), and its
  // key is always there: Show more, then Show less.
  const summarised = summaryOf(reveal.whole) !== null && !asking;
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
  const next = { x: a.x, y: a.y, flip: a.flip === true };
  if (next.x === aim.x && next.y === aim.y && next.flip === aim.flip) return;
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
  const box = bubble.getBoundingClientRect();
  const head = { x: aim.x - box.left, y: aim.y - box.top };
  const wood = bubble.classList.contains('lantern');
  const key = `${Math.round(w)}x${Math.round(h)}:${Math.round(head.x)},${Math.round(head.y)}:${aim.flip}:${wood}`;
  if (key === lastShape) return;
  lastShape = key;
  const d = balloonPath(w, h, head);
  paintBalloon(skin, w + PAD_R, h + PAD_B, d, ++shapeId, wood);
}

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

/** The size the content wants, measured with the animation's own sizes taken off for a moment. */
function natural() {
  const sw = bubble.style.width, sh = bubble.style.height;
  bubble.style.width = ''; bubble.style.height = '';
  bubble.classList.remove('sizing');
  const r = bubble.getBoundingClientRect();
  bubble.style.width = sw; bubble.style.height = sh;
  if (sw) bubble.classList.add('sizing');
  return { w: Math.ceil(r.width), h: Math.ceil(r.height) };
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
  const ms = reduceMotion ? 0 : (bigger ? 520 : 340), fn = bigger ? ease.open : ease.close;
  const cs = getComputedStyle(bubble);
  if (w > 0) bubble.style.setProperty('--cw', Math.max(0, w - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) + 'px');
  if (bigger) sendWindow(Math.max(from.w, Math.ceil(from.w + (w - from.w) * OVERSHOOT)),
                         Math.max(from.h, Math.ceil(from.h + (h - from.h) * OVERSHOOT)));
  const t0 = performance.now();
  const f = (now) => {
    const k = ms ? Math.min(1, (now - t0) / ms) : 1, e = fn(k);
    cur = { w: Math.max(0, from.w + (w - from.w) * e), h: Math.max(0, from.h + (h - from.h) * e) };
    place(Math.round(cur.w), Math.round(cur.h));
    if (k < 1) { anim = frame(f); return; }
    cur = { w, h };
    place(w, h);
    if (w > 0) sendWindow(w, h);
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
  skin.innerHTML = ''; lastShape = ''; lastSize = '';
}

let lastSize = '';
/** The content changed: grow or shrink the balloon to what it now wants. */
function reportSize() {
  if (bubble.hidden) return;
  if (cockpit) fitCockpit();
  const n = natural();
  if (n.w === goal.w && n.h === goal.h) return;
  goal = n;
  growTo(n.w, n.h);
}

/** Tell the Shell how big the window must be for a shape of sw x sh. */
function sendWindow(sw, sh) {
  const r = { width: sw, height: sh };
  // Round up: a half pixel short clips the frame's bottom edge.
  // 6 px of margin on the left, 78 on the right: the extra 72 is the room the TAIL hangs in
  // (bubble.css `.wrap`), its reach plus slack so the ink line is not on the window edge. Same
  // below: 18 above for the copy and rate keys, 56 under for the tail, of which 38 is new. Without the top room the keys sat outside the window and could never be
  // seen (first sweep, 2026-10-04); the tail would go the same way.
  // 14 on the left, not 6: the Smoother look's soft shadow spreads past the ink line.
  const width = Math.ceil(r.width) + 14 + 78;
  const height = Math.ceil(r.height) + 18 + 56 + 6;
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
function paintWords() {
  // Folded to its short version until he asks for the rest (summaryOf). The short version is the start of
  // the whole text, so the words already revealed stay revealed when it opens.
  const short = expanded ? null : summaryOf(reveal.whole);
  const visible = short ?? reveal.whole;
  if (laidOut !== visible) {
    laidOut = visible;
    said.replaceChildren();
    words = [];
    // 6.11: the reply's own light formatting, as blocks (rich.js). Every element is built here with
    // textContent; the reply's text never becomes markup.
    const wordsInto = (host, text) => {
      for (const part of text.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { host.append(' '); continue; }
        const s = document.createElement('span');
        s.className = 'w o';
        s.textContent = part;
        host.append(s);
        words.push(s);
      }
    };
    const runsInto = (host, rs) => {
      for (const r of rs) {
        const into = r.bold ? document.createElement('b') : r.code ? document.createElement('code') : host;
        wordsInto(into, r.text);
        if (into !== host) host.append(into);
      }
    };
    for (const b of blocks(visible)) {
      const el = document.createElement('div');
      el.className = 'r-' + b.kind;
      if (b.kind === 'row') for (const c of b.cells ?? []) { const cell = document.createElement('span'); cell.className = 'cell'; runsInto(cell, c); el.append(cell); }
      else runsInto(el, b.runs);
      said.append(el);
    }
  }
  const n = shownWords(reveal.text);
  words.forEach((s, i) => { if (i < n || reveal.done) s.classList.remove('o'); });
  // Sheet 41: any web address in his words is a link once the words are all in, and it opens in Samara.
  if (reveal.done) linkifyWords(said);
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
  for (const it of replyList.items ?? []) {
    const row = T('div', 'lrow');
    const mid = T('div', 'lmid');
    mid.append(T('div', 'lt', it.title ?? ''));
    if (it.subtitle) mid.append(T('div', 'ls', it.subtitle));
    row.append(mid);
    if (it.chipText) row.append(T('span', 'chip ' + ({ good: 'good', careful: 'careful', stop: 'stop', inactive: 'off' }[it.chipTone] ?? 'normal'), it.chipText));
    box.append(row);
  }
  if (replyList.moreCount) box.append(T('div', 'lmore', `${replyList.moreCount} more`));
}

function paint() {
  paintWords();
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
}

// The reveal runs on its own clock and works out how much should be visible from the elapsed time, so
// this interval only has to be often enough to look smooth. It stops when there is nothing to reveal.
let ticking = null;
function startTicking() {
  if (ticking) return;
  clearTimeout(hideTimer);
  ticking = setInterval(() => {
    reveal.tick();
    paint();
    if (reveal.done) { clearInterval(ticking); ticking = null; scheduleHide(); }
  }, TICK_MS);
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
  if (bubble.classList.contains('whisper')) return 10000;
  if (!card.hidden) return 120000;                  // the brief is read, not glanced at
  if (livePlan) return 600000;                      // a job is running: the checklist stays until the reply
  if (holdOverride) return holdOverride;           // a line the pet says carries its own time, as before
  if (expanded) return 300000;                     // opened up to read: five minutes, as the old bubble did
  const base = Math.min(20000, Math.max(3000, 2500 + 45 * text.length));
  return lineCount() > 6 || summaryOf(text) ? Math.max(base, 60000) : base;
}
function scheduleHide() {
  clearTimeout(hideTimer);
  if (bubble.hidden || asking || overNow || docked || cockpit) return;
  // Scrolled back into his history and walked away: it closes after five quiet minutes, as before.
  if (reading) { hideTimer = setTimeout(goAway, 300000); return; }
  if (card.hidden && (!reveal.done || !reveal.whole)) return;
  hideTimer = setTimeout(goAway, holdFor(reveal.whole));
}
function goAway() {
  if (asking || overNow || docked || cockpit) return;
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

function show() {
  bubble.hidden = false;
  bubble.classList.remove('leaving');
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
  asking = null;
  asks.hidden = true; asks.replaceChildren();
  choiceList(null); paintPlan(null, -1);
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
  asking = m;
  bubble.classList.remove('whisper');
  mediaRow.hidden = true;
  // The question goes where a reply goes, so his eye does not have to move for it.
  reveal.start(a.question, false);
  reveal.skip();                                  // a question is never revealed slowly
  who.textContent = a.plaque ?? '';
  setSpeaker('aang');
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
  // The exact command, one tap away: never code in the balloon unless he asks to see it.
  let exact = document.getElementById('exact');
  if (!exact) {
    exact = document.createElement('div');
    exact.id = 'exact';
    exact.className = 'exact';
    exact.innerHTML = '<button type="button" class="exact-key"></button><pre class="exact-text" hidden></pre>';
    means.after(exact);
    const key = exact.querySelector('.exact-key'), text = exact.querySelector('.exact-text');
    key.addEventListener('click', () => {
      text.hidden = !text.hidden;
      key.textContent = text.hidden ? 'See the exact command' : 'Hide the command';
      fit(); reportSize();
    });
  }
  exact.hidden = !a.exact;
  exact.querySelector('.exact-text').textContent = a.exact ?? '';
  exact.querySelector('.exact-text').hidden = true;
  exact.querySelector('.exact-key').textContent = 'See the exact command';

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
  });
  // On Go the plan card stays and becomes the live checklist; the tools that run tick it off.
  if (asking.t === 'plan') { livePlan = choice === 'go' ? { steps: asking.steps, at: 0, ...(asking.samara ? { samara: String(asking.id), task: String(asking.samara.task ?? '') } : {}) } : null; }
  if (asking.samara) samaraPlan(null);
  // Off the queue, then show whatever is behind it. Nothing in the stack disappears on its own.
  const done = asking;
  asking = null;
  const at = waiting.indexOf(done);
  if (at >= 0) waiting.splice(at, 1);
  asks.hidden = true;
  asks.replaceChildren();
  if (waiting.length) { showTopAsk(); return; }
  paintEdges();
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
  if (!body.children.length) { const s = slip('ALL CLEAR'); s.append(T('p', 'lt-clear', 'Nothing needs you this morning.')); body.append(s); }
  card.append(body);

  // the keys: Got it, and the most useful next thing; the week's meter on the right
  const keys = T('div', 'keys lt-foot');
  const k = (label, letter, cls, fn) => { const x = T('button', 'key sm' + (cls ? ' ' + cls : ''), label); x.type = 'button'; x.append(T('span', 'k', letter)); x.addEventListener('click', fn); keys.append(x); };
  k('Got it', 'A', 'primary', () => { releaseMouse(); goAway(); });
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
  k('Done', 'Z', '', () => { releaseMouse(); goAway(); });
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
  const ck = document.createElement('div'); ck.className = 'ck'; ck.id = 'ck'; ck.textContent = '\u2713';
  z.append(zl, bar, orb, gf, ck);
  card.append(z);
  card.hidden = false;
}
function startDrop() {
  if (D) return;
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
  const bl = $d('bl'), bf = $d('bf'), bp = $d('bp'), ck = $d('ck');
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
  if (!keys.length) hideTimer = setTimeout(() => goAway(), 12000);
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
    { label: 'Ask Aang about it', key: 'A', primary: true, go: () => { window.aang?.dropAsk?.(r.path); releaseMouse(); goAway(); } },
    { label: 'Remember it', key: 'X', go: () => { window.aang?.dropKeep?.(r.path); releaseMouse(); goAway(); } },
    { label: 'Not now', key: 'Z', go: () => { releaseMouse(); goAway(); } },
  ]);
}

// ---------------------------------------------------------------- what the brain says
/** The last thing shown here, whatever it was (a reply, the brief, a card, a whisper), for a click on Aang (2026-10-20). */
let lastShown = null;
/**
 * He clicked Aang with nothing showing (his rule, 2026-10-20): what he last saw comes back. A question still waiting
 * first; then a live plan, at its step now; then the last reply, brief or card. Clicking it opens the chat box, as
 * clicking any message does. False when there was nothing, so the click opens the chat box instead.
 */
function recall() {
  if (reading) leaveReading(false);
  if (waiting.length) { showTopAsk(); return true; }
  if (livePlan) { bubble.hidden = false; paintPlan(livePlan, livePlan.at ?? 0); fit(); reportSize(); return true; }
  if (lastShown) { const m = { ...lastShown, stream: false, recalled: true }; delete m.proactive; laidOut = null; onBrain(m); return true; }
  return false;
}
window.aang?.onRecall?.(() => { let ok = false; try { ok = recall(); } catch { ok = false; } window.aang?.recalled?.(ok); });

function onBrain(m) {
  if (!m || typeof m !== 'object') return;
  if (!m.recalled && (m.t === 'bubble' || m.t === 'whisper' || m.t === 'pet.say') && (m.text || m.brief || m.research || m.card)) lastShown = m;

  // What he just asked, for the line above the answer. Kept until the next thing he says.
  if (m.t === 'asked' && typeof m.text === 'string') { asked = m.text; if (cockpit) cockSaid(m.text); return; }

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
  if (m.t === 'drop.hover') { if (m.on) startDrop(); else if (D && D.drop === null) { endDrop(); card.hidden = true; scroller.hidden = false; goAway(); } return; }
  if (m.t === 'drop.go' && typeof m.name === 'string') { doDrop({ name: m.name, refused: m.refused ?? '', folder: m.folder === true }); return; }
  if (m.t === 'drop.done' && typeof m.path === 'string') { if (D) D.result = m; else dropReady(m); return; }

  if (m.t === 'whisper' && typeof m.text === 'string') {
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
    const say = whole ? { ...whole, proactive: false, fromPet: true } : { t: 'bubble', text: m.text, stream: false, fromPet: true, hold: m.hold, focus: m.focus, host: m.host, link: m.link };
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
    if (wasQuiet && !quiet) releaseHeldAsks();
    if (!quiet) heldMsg = null;          // the pet says the held one itself, through pet.say
    return;
  }

  if (m.t === 'bubble' && typeof m.text === 'string') {
    // Something new to say ends looking back: the scroll-back steps aside for it.
    if (reading && !m.stream) leaveReading(false);
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
      bubble.classList.add('lantern');
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
    const same = m.stream && reveal.whole && m.text.startsWith(reveal.whole.slice(0, 12));
    if (same) reveal.append(m.text, m.stream === true);
    // A NEW reply starts revealing here. This line was deleted on 2026-10-05 by a regex that removed
    // every line mentioning setRating(), and this one happened to mention it - so a new reply never
    // started and the bubble showed only his question line. The widths reset with it: `wide` and
    // `widest` are decided once per reply (see paint), so a short answer after a long one must not
    // inherit the long one's width.
    else {
      reveal.start(m.text, m.stream === true);
      expanded = false;
      bubble.classList.remove('wide', 'widest');
      // An ask's explaining line and command belong to the ask, never to the reply that follows it.
      for (const id of ['means', 'exact', 'mailcard']) { const e = document.getElementById(id); if (e) e.hidden = true; }
      // New content fades in 160 ms into the grow, over 300 ms (sheet 13). Restarted, not stacked.
      bubble.classList.remove('enter'); void bubble.offsetWidth; bubble.classList.add('enter');
    }
    turn = typeof m.turn === 'number' ? m.turn : null;
    // The list rides on the finished reply only; a new reply starts without the last one's.
    if (!m.stream) replyList = m.list && Array.isArray(m.list.items) ? m.list : null;
    else if (!same) replyList = null;
    // Only on the finished reply, like the rows: a streamed delta is the same reply arriving again.
    if (!m.stream) focusWindow = typeof m.focus === 'string' && m.focus ? m.focus : null;
    if (!m.stream) macSession = m.host === 'mac';
    if (!m.stream) linkWord = (focusWindow || macSession) ? (typeof m.link === 'string' && m.link ? m.link : 'Claude') : '';
    if (!m.stream) holdOverride = Number.isFinite(m.hold) && m.hold > 0 ? m.hold : 0;
    // HIS QUESTION, not the model's name. The old bubble puts what he asked here, dimmed and cut at 50
    // characters (BubbleView:953), so a reply always carries its question. Showing "QUICK" instead was
    // a label nobody needed, and he spotted it at once (2026-10-04).
    // Nothing above a message Aang started himself: there was no question.
    const line = m.proactive ? '' : asked.replace(/\s+/g, ' ').trim();
    who.textContent = line.length > 50 ? line.slice(0, 49).trimEnd() + '…' : line;
    who.hidden = !who.textContent || cockpit;
    if (cockpit) bubble.classList.add('lantern');
    paintChange(!m.stream);
    if (!m.stream) setSpeaker(focusWindow || macSession ? 'claude' : m.proactive || m.fromPet ? 'aang' : null, macSession ? 'MAC' : 'PC', m.face);
    working.hidden = true;
    show();
    paint();
    startTicking();
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
    working.hidden = m.on === false;
    doing.textContent = typeof m.doing === 'string' ? m.doing : '';
    if (m.on !== false) show();
    return;
  }

  if (m.t === 'tool' && typeof m.label === 'string') { doing.textContent = m.label; planTool(m.name); return; }

  // A page of older turns. Keeping his place is the point: if the list grew above him and the view
  // stayed where it was, he would be thrown back to where he started every time.
  if (m.t === 'history.reply' && Array.isArray(m.items)) {
    // A page of older turns: they go in above, and he stays where he was reading (paintBack keeps his place).
    back.older(m.items);
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
    notesAll = m.notes;
    if (boardOpen && !editingNote && !card.hidden) showBoard();
    if (editingNote && !notesAll.some((n) => n.id === editingNote)) showBoard();
    return;
  }
  if (m.t === 'notes.board') { openBoard(); return; }
  // Sheet 17: "set a timer" with no time, or the wheel's Timer: the dial.
  if (m.t === 'timer.setup') {
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
window.addEventListener('mousemove', e => {
  const over = overBubble(e.clientX, e.clientY);
  if (over === overNow) return;
  overNow = over;
  document.getElementById('wrap')?.classList.toggle('over', over);
  // Keys only while he is pointing at the bubble (2026-10-11: "these buttons should only surface when i hover").
  // The bubble grows to show them, so it is measured again; the 600 ms guard starts when they appear, so a
  // mouse arriving fast cannot land on Allow.
  if (asking) {
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
}, { passive: true });
// Whenever the bubble goes away, let go of the mouse at once rather than waiting for a move that may
// never come: a window that is hidden must never still be holding clicks.
function releaseMouse() {
  if (pullingNote) return;                 // a note is being dragged out: keep the mouse until it lands
  if (!overNow) return;
  overNow = false;
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
  // Sheet 17: the notes board, a note being edited, its menu and the timer dial are things he works IN.
  // A click there was docking the typing box over them and taking the keyboard away (his test, 2026-10-12).
  if (e.target.closest('.boardwrap, .nmini, .bignote, .inline, .ctitle, .tset, .newk, .bcap')) return;
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
      if (r.other) openCockpit(false);
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
function newNoteId() { return 'n' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); }
function showBoard() {
  editingNote = null;
  typing(false);
  notesAll = notesAll.filter((n) => !n.fresh);          // a new note he never wrote in is dropped
  card.replaceChildren();
  const pages = Math.max(1, Math.ceil(notesAll.length / PER_PAGE));
  boardPage = Math.min(boardPage, pages - 1);
  const shown = notesAll.slice(boardPage * PER_PAGE, boardPage * PER_PAGE + PER_PAGE);
  const head = T('div', 'ctitle', 'NOTES');
  if (pages > 1) { const d = T('span', 'bdots'); for (let i = 0; i < pages; i++) d.append(T('i', i === boardPage ? 'on' : '')); head.append(d); }
  const add = T('button', 'newk', '+ NEW'); add.type = 'button';
  add.addEventListener('click', () => {
    // Blank, with "Title" and "Write here" hints. Nothing is kept until he writes something: an empty note that
    // he walks away from simply is not there (his test: a "New note" appearing straight away made no sense).
    const n = { id: newNoteId(), title: '', html: '', col: 'parchment', font: 'figtree', size: 'm', updated: Date.now(), fresh: true };
    notesAll = [n, ...notesAll];
    openNote(n.id, true);
  });
  head.append(add);
  const wrap = T('div', 'boardwrap');
  if (pages > 1) {
    const l = T('button', 'bcap l' + (boardPage === 0 ? ' off' : ''), '◀'); l.type = 'button';
    const r = T('button', 'bcap r' + (boardPage >= pages - 1 ? ' off' : ''), '▶'); r.type = 'button';
    l.addEventListener('click', () => { if (boardPage > 0) { boardPage--; showBoard(); } });
    r.addEventListener('click', () => { if (boardPage < pages - 1) { boardPage++; showBoard(); } });
    wrap.append(l, r);
  }
  const grid = T('div', 'board');
  if (!notesAll.length) grid.append(T('div', 'bempty', 'No notes yet. Say "make a note for raid: flasks, food" or press + NEW.'));
  for (const n of shown) grid.append(miniNote(n));
  if (notesAll.length) for (let i = shown.length; i < PER_PAGE; i++) grid.append(T('div', 'nmini slot'));
  wrap.append(grid);
  card.append(head, wrap);
  card.hidden = false;
  fit(); reportSize();
}
function miniNote(n) {
  const el = T('div', 'nmini' + (n.out ? ' gone' : ''));
  paintNote(el, n);
  el.style.setProperty('--r', [-3, 2, -1.5, 3, -2.5, 1][n.id.charCodeAt(n.id.length - 1) % 6] + 'deg');
  el.append(T('span', 'pin'));
  const inner = T('div', 'nmi');
  inner.append(T('b', '', n.title));
  for (const l of previewLines(n.html).slice(0, 3)) inner.append(T('span', 'ml' + (l.done ? ' done' : ''), l.t));
  el.append(inner);
  const tc = tickCount(n.html);
  if (tc.all > 1) el.append(T('span', 'tickc', `${tc.done}/${tc.all}`));
  if (n.out) el.append(T('span', 'onscreen', 'ON SCREEN'));
  pullable(el, n);
  return el;
}
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
  head.append(back, T('span', 'hint2', 'Type anywhere. Right-click for colour, text and more.'));
  const sheet = T('div', 'bignote paper');
  const menuHost = T('div', 'inline');
  card.append(head, sheet, menuHost);
  const paper = buildPaper(sheet, n, (changed) => {
    const empty = !(changed.title ?? '').trim() && !(sheet.querySelector('.nbody')?.textContent ?? '').trim();
    if (changed.fresh && empty) return;                  // still blank: not a note yet
    delete changed.fresh;
    if (!changed.title) changed.title = 'Note';
    window.aang?.notesSave?.(changed); fit(); reportSize();
  });
  sheet.addEventListener('input', () => { fit(); reportSize(); });
  sheet.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const part = /** @type {HTMLElement} */ (e.target).closest?.('.ntitle') ? 'title' : 'body';
    const m = openMenu(menuHost, { x: 0, y: 0 }, paper, n, 'board', (what) => {
      if (what === 'delete') { window.aang?.notesDelete?.(n.id); notesAll = notesAll.filter((x) => x.id !== n.id); showBoard(); }
      else if (what === 'out') { paper.flush(); const r = bubble.getBoundingClientRect(); window.aang?.notesPull?.({ phase: 'start', id: n.id, x: window.screenX + r.left - 240, y: window.screenY + r.top + 20 }); window.aang?.notesPull?.({ phase: 'end', id: n.id, x: window.screenX + r.left - 240, y: window.screenY + r.top + 20 }); showBoard(); }
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
    card.hidden = true; card.replaceChildren(); releaseMouse(); goAway();
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

/** Let the message go now: a click on it, Esc, or a click away from everything of ours. Never a question. */
function dismiss() {
  if (asking || bubble.hidden) return;
  clearTimeout(hideTimer);
  goAway();
}
window.aang?.onDismiss?.(() => dismiss());
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
  older: back.reachedTheStart ? 'start' : back.waiting ? 'loading' : 'more',
  setOpen: (id) => { lbOpen = id; paintBack('top'); fit(); reportSize(); },
  onLink: (url) => window.aang?.openThing?.({ kind: 'link', value: url }),
  onReply: (t) => { lbReplying = t.id; window.aang?.replyToTurn?.(t.id, t.text); paintBack('top'); },
  onUndo: (t) => window.aang?.undoTurn?.(t.id),
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
  const list = paintLookback(box, back.turns, lbCtx());
  if (!was) list.scrollTop = list.scrollHeight;                     // first look: newest, where he left off
  else list.scrollTop = keep === 'top' ? top : Math.max(0, list.scrollHeight - fromBottom);
  // At the top of the history: the next page, for as far back as he wants to go.
  list.addEventListener('scroll', () => { if (list.scrollTop < 8) askOlder(); }, { passive: true });
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
  if (e.target.closest('.boardwrap, .nmini, .bignote, .tset, .research, .opts, .asks')) return;
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
window.aang?.onCockpit?.((c) => { if (c?.open) openCock(c.state ?? {}); else closeCock(); });

function openCock(st) {
  cockMaxH = Number(st.maxH) > 240 ? Math.min(1200, Number(st.maxH)) : 600;
  if (cockpit) { typingArea.setLive(true); return; }
  cockpit = true;
  docked = true;
  clearTimeout(hideTimer);
  closeBoard();
  el('ck').hidden = false;
  bubble.classList.remove('whisper');
  bubble.classList.add('cockpit', 'lantern');
  if (reading) paintBack('bottom'); else enterReading();
  show(); fit(); reportSize();
  typingArea.setLive(true);
}

function closeCock() {
  if (!cockpit) return;
  cockpit = false;
  docked = false;
  typingArea.setLive(false);
  el('ck').hidden = true;
  bubble.classList.remove('cockpit', 'ckwide', 'ckask');
  leaveReading(false, true);
  // A question waiting on him stays, as one; Aang still answering keeps his line; otherwise it goes.
  if (asking || !working.hidden) { fit(); reportSize(); return; }
  goAway();
}

/** The row's stored time format ("2026-10-21 13:14:02", UTC), for rows the cockpit adds before the brain stores them. */
const tsNow = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
let localId = -1;
/**
 * He sent something from the cockpit: the answer before it (if one is showing) and his own words join the
 * conversation, and the live area under it waits for the new answer. Stored rows come back on the next look.
 */
function cockSaid(text) {
  if (reveal.done && reveal.whole && !scroller.hidden) back.add({ id: turn ?? localId--, ts: tsNow(), who: 'Aang', text: reveal.whole });
  back.add({ id: localId--, ts: tsNow(), who: 'you', text: String(text) });
  reveal.clear(); laidOut = null; paintWords();
  scroller.hidden = true; who.hidden = true; setSpeaker(null);
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
  bubble.classList.toggle('ckwide', Boolean(document.querySelector('#lblist .lt-item.open .vshot')) || !card.hidden);
  if (!list) return;
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 8;
  list.style.maxHeight = 'none';
  const n = natural();
  // A few pixels kept back: the frame's own edge and rounding must fit inside the room too.
  const over = n.h - (cockMaxH - 8);
  list.style.maxHeight = over > 0 ? Math.max(140, list.scrollHeight - over) + 'px' : 'none';
  if (atBottom) list.scrollTop = list.scrollHeight;
}

// PageUp / PageDown in the typing area move the conversation.
window.addEventListener('cockpit:page', (e) => {
  const list = el('lblist');
  if (!list) return;
  list.scrollTop += Number(e.detail) * 6 * lineHeight;
  if (list.scrollTop < 8) askOlder();
});
// A click away from an opened row closes it, like any list he has used (his ask, 2026-10-21). Rows and menus keep theirs.
document.addEventListener('click', (e) => {
  if (!reading || lbOpen === null) return;
  if (e.target.closest?.('.lt-item, .turnmenu')) return;
  lbOpen = null; paintBack('top'); fit(); reportSize();
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
  if (summaryOf(reveal.whole)) {
    bubble.classList.toggle('widest', expanded);
    if (expanded) bubble.classList.add('wide');
    paint();
    return;
  }
  fit();
});

el('copy').addEventListener('click', () => {
  // The WHOLE message, never the part on screen.
  window.aang?.copyText?.(reveal.whole);
  const b = el('copy');
  b.textContent = 'Copied';
  setTimeout(() => { b.textContent = 'Copy'; }, 1200);
});


// ---------------------------------------------------------------- Sheet 37: a Claude session's plan
// Drawn with the Lantern's pieces (lt-slip, lt-item, lt-tile), on the wood; sites are turquoise ticks he can untick; the
// steps; what it won't do; Change opens a line to type. Built with textContent: the task, sites and steps are Claude's words.
const planBox = document.createElement('div');
planBox.className = 'samaraplan';
planBox.hidden = true;
scroller.after(planBox);
const planKept = new Set();
function samaraPlan(m) {
  planBox.replaceChildren();
  planBox.hidden = !m;
  if (!m) { if (!cockpit) bubble.classList.remove('lantern'); return; }
  const c = m.samara;
  planKept.clear(); for (const x of c.sites ?? []) planKept.add(String(x.site));
  bubble.classList.add('lantern', 'wide');
  who.hidden = true; said.textContent = '';
  const top = T('div', 'pc-top');
  const lamp = document.createElement('img'); lamp.src = 'art/samara/samara-lantern-32.png'; lamp.alt = '';
  const head = T('div'); head.append(T('small', '', 'CLAUDE WANTS TO'), T('b', '', String(c.task ?? '')));
  top.append(lamp, head);
  const sites = T('div', 'lt-slip'); sites.append(T('h3', '', 'SITES'));
  for (const x of c.sites ?? []) {
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
  planBox.append(top, sites, steps);
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
