// Step 6.12: the bubble's behaviour.
//
// The reveal pace, the collapse thresholds and the skip-versus-expand rule all live in reveal.ts, which
// is tested. This file is the part that needs a screen: measuring real lines of real text, and the
// clicks.
import { Reveal, TICK_MS, hasMore, linesShown, scrolls } from './reveal.js';

const el = id => document.getElementById(id);
const bubble = el('bubble'), said = el('said'), scroller = el('scroller'), more = el('more');
const working = el('working'), doing = el('doing'), asks = el('asks'), tools = el('tools'), who = el('who');

const reveal = new Reveal();
let expanded = false;
let lineHeight = 23;          // measured below; BubbleView.LineH until then
let rating = 0;               // 1 good, -1 not good, 0 not rated
let turn = null;              // the stored row this reply became, for rating and reachback

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
let lastSize = '';
function reportSize() {
  const r = bubble.getBoundingClientRect();
  // Round up: a half pixel short clips the frame's bottom edge.
  const width = Math.ceil(r.width) + 12;      // the margins either side
  const height = Math.ceil(r.height) + 24;    // and room under it for the tail
  const key = width + 'x' + height;
  if (key === lastSize) return;               // resizing a window is not free
  lastSize = key;
  window.aang?.bubbleSize?.({ width, height });
}

/** Paint whatever is revealed so far. */
function paint() {
  said.textContent = reveal.text;
  // Over one line of text, the bubble widens, which is what BubbleView does at WideAfterLines = 1.
  bubble.classList.toggle('wide', lineCount() > 1);
  fit();
  reportSize();
  // Copy and rate are for a FINISHED reply only: offering to copy half a sentence is a trap.
  tools.hidden = !reveal.done || !reveal.whole;
}

// The reveal runs on its own clock and works out how much should be visible from the elapsed time, so
// this interval only has to be often enough to look smooth. It stops when there is nothing to reveal.
let ticking = null;
function startTicking() {
  if (ticking) return;
  ticking = setInterval(() => {
    reveal.tick();
    paint();
    if (reveal.done) { clearInterval(ticking); ticking = null; }
  }, TICK_MS);
}

function show() {
  bubble.hidden = false;
  // Measured from the real font at the real size, once there is something to measure. A guess here
  // would make "six lines" mean five and a half.
  const h = parseFloat(getComputedStyle(said).lineHeight);
  if (Number.isFinite(h) && h > 0) lineHeight = h;
}

// ---------------------------------------------------------------- what the brain says
window.aang?.onMessage?.(m => {
  if (!m || typeof m !== 'object') return;

  if (m.t === 'bubble' && typeof m.text === 'string') {
    // A new reply replaces whatever was there; more of the same one is appended. The brain sends the
    // whole text each time, not a delta, so this is a replace either way - the Reveal decides the pace.
    const same = m.stream && reveal.whole && m.text.startsWith(reveal.whole.slice(0, 12));
    if (same) reveal.append(m.text, m.stream === true);
    else { reveal.start(m.text, m.stream === true); expanded = false; rating = 0; setRating(); }
    turn = typeof m.turn === 'number' ? m.turn : null;
    who.textContent = typeof m.who === 'string' ? m.who : '';
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

  if (m.t === 'bubble.clear') {
    reveal.clear();
    expanded = false;
    bubble.hidden = true;
    working.hidden = true;
    asks.hidden = true;
    if (ticking) { clearInterval(ticking); ticking = null; }
    return;
  }
});

// ---------------------------------------------------------------- his clicks
// One click on the bubble means two different things, and the order matters: while text is still
// arriving it shows the rest, and only once there is nothing left to reveal does it expand. Doing both
// would expand a bubble he was only trying to finish reading. reveal.skip() returns which happened.
bubble.addEventListener('click', e => {
  if (e.target.closest('.tool, .key, .more')) return;     // those have their own jobs
  if (reveal.skip()) { paint(); return; }
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

function setRating() {
  el('up').setAttribute('aria-pressed', rating === 1 ? 'true' : 'false');
  el('down').setAttribute('aria-pressed', rating === -1 ? 'true' : 'false');
}
for (const [id, value] of [['up', 1], ['down', -1]]) {
  el(id).addEventListener('click', () => {
    // Clicking the same one again takes it back, which is what the old bubble does.
    rating = rating === value ? 0 : value;
    setRating();
    window.aang?.rate?.({ turn, rating });
  });
}

// Keyboard, for the asks: A / X / Z as today. Only while something is actually being asked, so these
// letters are never swallowed from anything else he might be doing.
window.addEventListener('keydown', e => {
  if (asks.hidden) return;
  const key = e.key.toUpperCase();
  const button = [...asks.querySelectorAll('.key')].find(b => b.dataset.key === key);
  if (button) { e.preventDefault(); button.click(); }
});
