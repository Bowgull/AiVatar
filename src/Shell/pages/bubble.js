// Step 6.12: the bubble's behaviour.
//
// The reveal pace, the collapse thresholds and the skip-versus-expand rule all live in reveal.ts, which
// is tested. This file is the part that needs a screen: measuring real lines of real text, and the
// clicks.
import { Reveal, TICK_MS, hasMore, linesShown, scrolls } from './reveal.js';
import { balloonPath, paintBalloon, PAD_R, PAD_B, DEFAULT_AIM, WIDEST_AFTER_LINES } from './balloon.js';
import { HOLD_MS, askFrom } from './asks.js';
import { find as findEntities } from './entities.js';
import { Scrollback, atTop } from './scrollback.js';

const el = id => document.getElementById(id);
const bubble = el('bubble'), said = el('said'), scroller = el('scroller'), more = el('more');
const skin = el('skin');
const working = el('working'), doing = el('doing'), asks = el('asks'), tools = el('tools'), who = el('who');

const reveal = new Reveal();
let expanded = false;
let lineHeight = 23;          // measured below; BubbleView.LineH until then
let turn = null;              // the stored row this reply became, for reachback
// A window this reply is ABOUT - a Claude Code session. The brain sends it as `focus` and clicking
// the reply takes him there, exactly as the C# bubble does (PetWindow: `Hands.Arrange(.., "front")`).
let focusWindow = null;
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

/** How many lines the text actually takes, measured rather than estimated. */
function lineCount() {
  if (!said.textContent) return 0;
  // scrollHeight is the full height whatever the box is clipped to, so this is right even collapsed.
  return Math.max(1, Math.round(said.scrollHeight / lineHeight));
}

/** Clip the text to the right number of lines and decide whether the arrow belongs. */
function fit() {
  const total = lineCount();
  const shown = linesShown(total, expanded);
  scroller.style.maxHeight = `${shown * lineHeight}px`;
  scroller.classList.toggle('scrolls', scrolls(total, expanded));
  more.hidden = !hasMore(total, expanded);
}

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
  const key = `${Math.round(w)}x${Math.round(h)}:${Math.round(head.x)},${Math.round(head.y)}:${aim.flip}`;
  if (key === lastShape) return;
  lastShape = key;
  const d = balloonPath(w, h, head);
  paintBalloon(skin, w + PAD_R, h + PAD_B, d, ++shapeId);
}

let lastSize = '';
function reportSize() {
  const r = bubble.getBoundingClientRect();
  paintSkin(r.width, r.height);
  // Round up: a half pixel short clips the frame's bottom edge.
  // 6 px of margin on the left, 78 on the right: the extra 72 is the room the TAIL hangs in
  // (bubble.css `.wrap`), its reach plus slack so the ink line is not on the window edge. Same
  // below: 18 above for the copy and rate keys, 56 under for the tail, of which 38 is new. Without the top room the keys sat outside the window and could never be
  // seen (first sweep, 2026-10-04); the tail would go the same way.
  const width = Math.ceil(r.width) + 6 + 78;
  const height = Math.ceil(r.height) + 18 + 56 + 6;
  const key = width + 'x' + height;
  if (key === lastSize) return;               // resizing a window is not free
  lastSize = key;
  const t = said.getBoundingClientRect();
  console.info(`bubble: box ${Math.round(r.width)}x${Math.round(r.height)} text ${Math.round(t.width)}w scroll ${said.scrollWidth} wide=${bubble.classList.contains('wide')} asking window=${innerWidth}x${innerHeight} -> ${width}x${height}`);
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
  const list = reveal.done ? findEntities(reveal.whole) : [];
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
function paint() {
  said.textContent = reveal.text;
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
  fit();
  reportSize();
  // Copy and rate are for a FINISHED reply only: offering to copy half a sentence is a trap.
  tools.hidden = !reveal.done || !reveal.whole;
  paintChips();
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
  const base = Math.min(20000, Math.max(3000, 2500 + 45 * text.length));
  return lineCount() > 6 ? Math.max(base, 60000) : base;
}
function scheduleHide() {
  clearTimeout(hideTimer);
  if (bubble.hidden || asking || !reveal.done || !reveal.whole || overNow || reading) return;
  hideTimer = setTimeout(goAway, holdFor(reveal.whole));
}
function goAway() {
  if (asking || overNow) return;
  bubble.hidden = true;
  releaseMouse();
  // The WINDOW goes too: a hidden page in a shown window is still a window on his desktop.
  window.aang?.bubbleHidden?.();
}

function show() {
  bubble.hidden = false;
  // Measured from the real font at the real size, once there is something to measure. A guess here
  // would make "six lines" mean five and a half.
  const h = parseFloat(getComputedStyle(said).lineHeight);
  if (Number.isFinite(h) && h > 0) lineHeight = h;
}

// ---------------------------------------------------------------- the asks
let asking = null;        // the message being asked about, so an answer can name it

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
/** Put one in the queue, keeping that order, oldest first within a rank. */
function queueAsk(m) {
  // The same question arriving twice is one question, not two.
  const id = String(m.id ?? '');
  if (id && waiting.some((w) => String(w.id ?? '') === id && w.t === m.t)) return;
  m.__at = Date.now();
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
  // The question goes where a reply goes, so his eye does not have to move for it.
  reveal.start(a.question, false);
  reveal.skip();                                  // a question is never revealed slowly
  who.textContent = a.plaque ?? '';
  said.textContent = a.question;
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

  asks.replaceChildren();
  for (const k of a.keys) {
    if (k.hold) { asks.append(lever(k)); continue; }
    const b = document.createElement('button');
    b.className = 'key sm' + (k.tone === 'primary' ? ' primary' : k.tone === 'warn' ? ' warn' : '');
    b.dataset.key = k.key;
    b.append(k.label);
    const tag = document.createElement('span');
    tag.className = 'k';
    tag.textContent = k.key;
    b.append(tag);
    b.addEventListener('click', () => answer(k.choice));
    asks.append(b);
  }
  asks.hidden = false;
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
  // For consent, saying yes means asking the same thing again with `once`, so what was asked has to
  // travel with the answer. The bubble is the only place that still knows it.
  window.aang?.answerAsk?.({
    t: asking.t, id: asking.id, choice,
    // A consent ask carries the words it is about, because saying yes means asking them again.
    ...(asking.t === 'consent' ? { text: asking.text, mode: asking.wanted } : {}),
  });
  // Off the queue, then show whatever is behind it. Nothing in the stack disappears on its own.
  const done = asking;
  asking = null;
  const at = waiting.indexOf(done);
  if (at >= 0) waiting.splice(at, 1);
  asks.hidden = true;
  asks.replaceChildren();
  if (waiting.length) { showTopAsk(); return; }
  paintEdges();
}

// ---------------------------------------------------------------- what the brain says
window.aang?.onMessage?.(m => {
  if (!m || typeof m !== 'object') return;

  // What he just asked, for the line above the answer. Kept until the next thing he says.
  if (m.t === 'asked' && typeof m.text === 'string') { asked = m.text; return; }

  // An ask takes priority: it is the one thing that must be answered before anything else happens.
  // It joins the queue rather than replacing what is there, and the queue decides which is on top.
  if (askFrom(m)) { queueAsk(m); showTopAsk(); return; }

  if (m.t === 'bubble' && typeof m.text === 'string') {
    // Muted means he never wants Aang starting a conversation. An ANSWER is not that, so only the
    // proactive ones are held - the brain marks them, and this is the one place it matters here.
    if (m.proactive && muted) return;
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
    }
    turn = typeof m.turn === 'number' ? m.turn : null;
    // Only on the finished reply, like the rows: a streamed delta is the same reply arriving again.
    if (!m.stream) focusWindow = typeof m.focus === 'string' && m.focus ? m.focus : null;
    // HIS QUESTION, not the model's name. The old bubble puts what he asked here, dimmed and cut at 50
    // characters (BubbleView:953), so a reply always carries its question. Showing "QUICK" instead was
    // a label nobody needed, and he spotted it at once (2026-10-04).
    // Nothing above a message Aang started himself: there was no question.
    const line = m.proactive ? '' : asked.replace(/\s+/g, ' ').trim();
    who.textContent = line.length > 50 ? line.slice(0, 49).trimEnd() + '…' : line;
    who.hidden = !who.textContent;
    working.hidden = true;
    show();
    paint();
    startTicking();
    return;
  }

  if (m.t === 'bubble.dots') {
    working.hidden = m.on === false;
    doing.textContent = typeof m.doing === 'string' ? m.doing : '';
    if (m.on !== false) show();
    return;
  }

  if (m.t === 'tool' && typeof m.label === 'string') { doing.textContent = m.label; return; }

  // A page of older turns. Keeping his place is the point: if the list grew above him and the view
  // stayed where it was, he would be thrown back to where he started every time.
  if (m.t === 'history.reply' && Array.isArray(m.items)) {
    const wasHeight = scroller.scrollHeight, wasTop = scroller.scrollTop;
    const added = back.older(m.items);
    if (added) {
      paintBack();
      scroller.scrollTop = wasTop + (scroller.scrollHeight - wasHeight);
    } else if (!back.turns.length) {
      // Asked for, answered with nothing, and nothing held: the empty line is the answer, not silence.
      reading = true;
      paintBack();
    }
    reportSize();
    return;
  }

  // Quiet and mute change nothing about a reply, only about Aang speaking up by himself.
  if (m.t === 'quiet') { quiet = m.on === true; return; }
  if (m.t === 'mute') { muted = m.on === true; return; }

  if (m.t === 'bubble.clear') {
    reveal.clear();
    back.clear();
    reading = false;
    paintBack();
    expanded = false;
    bubble.hidden = true;
    releaseMouse();
    working.hidden = true;
    asks.hidden = true;
    // The queue goes with it, or its edges would hang under a bubble that is no longer there.
    waiting.length = 0;
    paintEdges();
    if (ticking) { clearInterval(ticking); ticking = null; }
    return;
  }
});

// ---------------------------------------------------------------- reaching back into a message
// The same actions the old bubble offers on a right-click (4.3b). All four now: Copy and Forget work
// within the bubble, and "Reply to this" and "Add as context" put something into the typing box, which
// is ours as of 6.12b - so they stopped being impossible and arrived here (2026-10-04).
function closeMenu() { document.getElementById('turnmenu')?.remove(); }

bubble.addEventListener('contextmenu', e => {
  if (!reveal.whole || !reveal.done) return;
  e.preventDefault();
  closeMenu();
  const menu = document.createElement('div');
  menu.id = 'turnmenu';
  menu.className = 'wood turnmenu';
  for (const [label, go] of [
    ['Copy text', () => window.aang?.copyText?.(reveal.whole)],
    // Both open the typing box if it is shut, because the chip is only useful next to the words he is
    // about to write. `turn` is the row the brain gave this message: a real binding, never a guess.
    ['Reply to this', () => { if (turn !== null) window.aang?.replyToTurn?.(turn, reveal.whole); }],
    ['Add as context', () => { if (turn !== null) window.aang?.pinTurn?.(turn, reveal.whole); }],
    // Forget is last and set apart, as it is in the old menu: it is the one that removes something.
    ['Forget this', () => { if (turn !== null) window.aang?.forgetTurn?.(turn); reveal.clear(); paint(); bubble.hidden = true; }],
  ]) {
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
  setTimeout(() => document.addEventListener('pointerdown', closeMenu, { once: true }), 0);
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
  if (e.target.closest('.tool, .key, .more')) return;     // those have their own jobs
  // "Need input in Claude": take him straight to that session's window, and let the reply go. This
  // sits ABOVE skip-reveal for the same reason the C# puts it there - it is a decision, not
  // impatience with the typing.
  if (focusWindow) {
    window.aang?.focusWindow?.(focusWindow);
    focusWindow = null;
    reveal.clear(); paint(); bubble.hidden = true;
    window.aang?.bubbleHidden?.();
    return;
  }
  if (reveal.skip()) { paint(); return; }
});

/** Draw the scroll-back: his turns and Aang's, oldest first, above whatever is being said now. */
function paintBack() {
  let box = document.getElementById('back');
  if (!box) {
    box = document.createElement('div');
    box.id = 'back';
    box.className = 'back';
    scroller.before(box);
  }
  box.hidden = !reading;
  if (!reading) return;
  box.replaceChildren();
  // 6.14b: an empty list says what will appear there and how, instead of an empty box (sheet 5 section 9).
  // Only when he has actually reached the top with nothing above, never over a history that has turns.
  if (!back.turns.length) {
    const e = document.createElement('p');
    e.className = 'empty-line';
    e.textContent = 'No history yet. Everything we say to each other will be here to scroll back through.';
    box.append(e);
    return;
  }
  for (const t of back.turns) {
    const p = document.createElement('p');
    p.className = 'turn ' + (t.who === 'you' ? 'mine' : 'his');
    p.textContent = t.text;
    box.append(p);
  }
}

/**
 * He is at the top: pull more of his own history.
 *
 * The whole point is that it has no bottom. Every time he reaches the top it asks again, so he can keep
 * going back for days or weeks until the database runs out. `wants` holds all the guards.
 */
function pullOlder() {
  const ask = back.wants(atTop(scroller.scrollTop));
  if (!ask) return;
  reading = true;
  scroller.classList.add('scrolls');
  window.aang?.olderTurns?.(ask);
}
scroller.addEventListener('scroll', pullOlder, { passive: true });

/**
 * PageUp / PageDown, pressed in the typing box.
 *
 * The C#'s rule, one line, ported as it stands (PetWindow:355):
 *   `if (d > 0 && bubble.More) ExpandBubble(); else if (bubble.Scroll(d * 6)) ...; FillStackFromMemory();`
 * So PageDown on a collapsed reply OPENS it rather than scrolling past it, which is the first thing he
 * would want; otherwise both directions move six lines, and reaching the top pulls older history in.
 */
window.aang?.onPage?.((d) => {
  if (bubble.hidden) return;
  if (d > 0 && !more.hidden && !expanded) { expanded = true; fit(); return; }
  scroller.classList.add('scrolls');
  scroller.scrollTop += d * 6 * lineHeight;
  pullOlder();
});

more.addEventListener('click', () => {
  expanded = !expanded;
  fit();
});

el('copy').addEventListener('click', () => {
  // The WHOLE message, never the part on screen.
  window.aang?.copyText?.(reveal.whole);
  const b = el('copy');
  b.textContent = 'Copied';
  setTimeout(() => { b.textContent = 'Copy'; }, 1200);
});

