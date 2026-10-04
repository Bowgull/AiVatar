// The pop-out's page. It shows what the main process tells it to and nothing else: it holds no
// connection, chooses no address, and cannot open a window.
import { Player, clock, el } from './player.js';
import { Skipper } from './skipper.js';

const what = el('what');
const src = el('src');
const video = el('video');
const empty = el('empty');
const frame = el('frame');
const player = new Player();
const skipper = new Skipper(player, { plaque: el('skip'), said: el('skipsaid'), undo: el('skipundo') });

// Segments for the video that is playing, worked out in the main process (it is the one that can
// reach the network) and handed over here.
window.aang.onPopoutSegments(list => skipper.reset(list));

// ---------------------------------------------------------------- what is playing
window.aang.onPopout(v => {
  // No address means this page is only the bar: the video is a separate view underneath it, because
  // paid services refuse to be shown in a frame (step 6.4). With an address, the page shows the video
  // itself, which is how YouTube and Twitch work, since their embed addresses exist to be framed.
  if (v.url) {
    // The address is built in the main process. The page never constructs one.
    video.src = v.url;
    video.hidden = false;
    player.attach(v.source === 'youtube' ? 'youtube' : v.source === 'twitch' ? 'twitch' : 'elsewhere', video, v.live);
  } else {
    video.hidden = true;
    player.attach('elsewhere', null, v.live);
  }
  empty.hidden = true;
  what.textContent = v.title;
  src.textContent = v.label;
  src.hidden = false;
  // Gold for open video, purple for a paid service (sheet 4, section 1).
  src.className = 'src' + (v.source === 'page' ? ' paid' : '');
  document.title = 'Aang: ' + v.title;
  // A new video knows nothing about the old one's openings.
  skipper.reset([]);
  paintControls();
  // Arm the fade now that something is playing. Without this the timer was only ever set by a mouse
  // move, so the wood never faded on its own: found by testing it, 2026-10-04.
  showChrome();
});

el('hide').addEventListener('click', () => window.aang.popoutHide());
el('close').addEventListener('click', () => window.aang.popoutClose());

// ---------------------------------------------------------------- the grooves
/** Where along a groove a click or drag landed, 0 to 1. */
function along(track, e) {
  const r = track.getBoundingClientRect();
  return r.width ? Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) : 0;
}

/** Make a groove draggable. `onMove` is called while dragging, `onDone` when he lets go. */
function groove(track, onMove, onDone) {
  let dragging = false;
  const move = e => { if (dragging) onMove(along(track, e)); };
  track.addEventListener('pointerdown', e => {
    if (track.classList.contains('live') || track.dataset.off === 'yes') return;
    dragging = true;
    // Capture is a nicety: it keeps the drag alive if the pointer leaves the groove. It refuses for a
    // pointer it does not know about, and letting that throw killed the whole handler, so the slider
    // did nothing at all. Found by testing it, 2026-10-04.
    try { track.setPointerCapture(e.pointerId); } catch { /* carry on without capture */ }
    onMove(along(track, e));
  });
  track.addEventListener('pointermove', move);
  track.addEventListener('pointerup', e => {
    if (!dragging) return;
    dragging = false;
    try { track.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    onDone?.(along(track, e));
  });
}

const setGroove = (fillId, knobId, fraction) => {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  el(fillId).style.width = pct + '%';
  el(knobId).style.left = pct + '%';
};

// scrub
groove(el('scrub'), f => player.seekTo(f));
// volume
groove(el('vol'), f => player.setVolume(f));
// see-through: the window's own doing, so it works for everything, paid services included
let seeThrough = 1;
groove(el('see'), f => {
  // Never fully invisible: a window he cannot find is a window he cannot close.
  seeThrough = 0.2 + Math.max(0, Math.min(1, f)) * 0.8;
  window.aang.popoutOpacity(seeThrough);
  paintSeeThrough();
});

function paintSeeThrough() {
  const shown = Math.round(((seeThrough - 0.2) / 0.8) * 100);
  setGroove('seefill', 'seeknob', (seeThrough - 0.2) / 0.8);
  el('seenum').textContent = Math.round(seeThrough * 100) + '%';
  void shown;
}

el('play').addEventListener('click', () => player.playPause());
el('mute').addEventListener('click', () => player.toggleMute());
el('full').addEventListener('click', () => window.aang.popoutFullscreen());
el('mac').addEventListener('click', () => window.aang.popoutToMac());
el('seethroughicon').addEventListener('click', () => {
  // A tap on the half-moon goes back to solid, which is the one he will want most often.
  seeThrough = 1;
  window.aang.popoutOpacity(1);
  paintSeeThrough();
});

// ---------------------------------------------------------------- painting the state
const PLAY = 'M4 3l9 5-9 5z';
const PAUSE = 'M4 2.5h3.2v11H4zM8.8 2.5H12v11H8.8z';

let wasPlaying = null;

function paintControls() {
  const s = player.state;
  // The fade depends on whether it is playing, so re-decide when that changes, and ONLY then: the
  // player reports its position several times a second, and re-deciding on every one of those would
  // reset the two-second timer forever and it would never fade at all.
  //
  // This is also what makes "stays put while paused" work. Clicking pause fires a pointer event first,
  // which arms the timer while the player still thinks it is playing; the state change undoes that.
  // Skipping rides on the player's own position reports, which arrive several times a second.
  skipper.at(s.at);

  if (wasPlaying !== s.playing) {
    wasPlaying = s.playing;
    queueMicrotask(showChrome);
  }
  el('playicon').firstElementChild.setAttribute('d', s.playing ? PAUSE : PLAY);

  // A control the player will not answer is dimmed, not hidden and not faked.
  for (const id of ['play', 'mute']) el(id).toggleAttribute('disabled', !player.canDrive);
  el('vol').dataset.off = player.canDrive ? 'no' : 'yes';
  el('scrub').classList.toggle('live', s.live || !player.canSeek);
  el('scrub').dataset.off = player.canSeek ? 'no' : 'yes';

  if (s.live) {
    el('time').textContent = 'LIVE';
    el('time').className = 'tnum live';
  } else {
    el('time').className = 'tnum';
    el('time').textContent = player.canDrive
      ? `${clock(s.at)} / ${clock(s.length)}`
      : 'its own controls';          // a paid service: its player is right there in the picture
  }

  setGroove('scrubfill', 'scrubknob', s.length ? s.at / s.length : (s.live ? 1 : 0));
  setGroove('volfill', 'volknob', s.muted ? 0 : s.volume);
}
player.onUpdate = paintControls;

// ---------------------------------------------------------------- the controls get out of the way
// Sheet 4: two seconds after the mouse stops, the wood and the controls fade out and the corners round
// off. Everything comes back the moment the mouse crosses the window, with no click. One exception on
// purpose: while the video is paused they stay put, because if he paused it he is about to press
// something.
let fadeTimer = null;
let fadingAllowed = true;

function showChrome() {
  frame.classList.remove('faded');
  if (fadeTimer) clearTimeout(fadeTimer);
  if (!fadingAllowed || !player.state.playing) return;
  fadeTimer = setTimeout(() => frame.classList.add('faded'), 2000);
}

for (const ev of ['pointermove', 'pointerdown', 'wheel', 'keydown']) {
  window.addEventListener(ev, showChrome, { passive: true });
}
window.addEventListener('pointerleave', () => { if (fadingAllowed && player.state.playing) frame.classList.add('faded'); });

window.aang.onPopoutSettings(s => {
  fadingAllowed = s.fadeControls !== false;
  if (!fadingAllowed) frame.classList.remove('faded');
  showChrome();
});

/**
 * Tell the main process how much of the window is Aang's chrome rather than picture, so it can keep
 * the PICTURE 16 by 9 rather than the window. Measured rather than assumed: it changes every time a
 * control is added, and a stale figure letterboxes the picture quietly.
 */
function reportChrome() {
  const wasFaded = frame.classList.contains('faded');
  if (wasFaded) frame.classList.remove('faded');
  const stage = document.querySelector('.stage');
  const px = window.innerHeight - stage.offsetHeight;
  if (wasFaded) frame.classList.add('faded');
  if (px > 0) window.aang.popoutChrome(px);
}

paintControls();
paintSeeThrough();
showChrome();
// After a frame, so the layout has actually happened.
requestAnimationFrame(() => requestAnimationFrame(reportChrome));
