// Sheet 67: live timers on the sheet, built on the proposed engine (sand.js). Every hourglass here is the real engine
// running, at real speed unless a "x20" key is on. Mockup code only.
import { SandGlass, secondly, fmt } from './sand.js';

class Clock {
  constructor() { this.rate = 1; this.base = Date.now(); this.real = this.base; }
  now() { return this.base + (Date.now() - this.real) * this.rate; }
  setRate(r) { this.base = this.now(); this.real = Date.now(); this.rate = r; }
}

// ---- sounds: one choice for the whole sheet, picked in the sound row; the live timers only ring after "Play the end"
const SND = {};
for (const n of ['times-up-wood', 'times-up-wood-again', 'times-up-bowl', 'flip', 'notch']) SND[n] = new Audio(`sheet-67/${n}.mp3`);
let pickedEnd = 'times-up-wood';
let soundsOk = false;   // the page has been clicked at least once; browsers block sound before that
document.addEventListener('pointerdown', () => { soundsOk = true; }, { once: true });
function play(n) { if (!soundsOk) return; const a = SND[n]; if (!a) return; try { a.currentTime = 0; void a.play().catch(() => {}); } catch { /* fine */ } }

/**
 * One live timer.
 * @param {HTMLElement} host
 * @param {{ shape?: 'plate'|'column'|'strip', label: string, total: number, left: number, ramp?: string, scale?: number,
 *   pause?: 'tip'|'stay', calm?: boolean, ring?: boolean, loop?: boolean, cls?: string }} o
 */
export function timer(host, o) {
  const clock = new Clock();
  const shape = o.shape ?? 'plate';
  const el = document.createElement('div');
  el.className = `tw ${shape} ${o.pause === 'stay' ? 'stay' : 'tip'} ${o.cls ?? ''}`;
  el.innerHTML = `<div class="gbox"><canvas></canvas></div><div class="twr"><span class="twl"></span><span class="tmv">0:00</span><span class="pz">PAUSED</span></div><div class="chip"></div>` +
    (shape === 'plate' ? `<div class="trow"></div>` : '');
  host.append(el);
  const scale = o.scale ?? (shape === 'column' ? 3 : shape === 'strip' ? 1 : 2);
  const box = /** @type {HTMLElement} */ (el.querySelector('.gbox'));
  // a square box, so laying the glass on its side never moves the words
  const side = 25 * scale; box.style.width = side + 'px'; box.style.height = side + 'px';
  if (shape === 'strip') { box.style.width = '25px'; box.style.height = '25px'; }
  const lab = /** @type {HTMLElement} */ (el.querySelector('.twl')), tm = /** @type {HTMLElement} */ (el.querySelector('.tmv'));
  const chip = /** @type {HTMLElement} */ (el.querySelector('.chip')), row = el.querySelector('.trow');
  lab.textContent = o.label;
  let t = { total: o.total, end: clock.now() + o.left, paused: 0 };
  let done = false, ringing = false, again = 0;
  const g = new SandGlass(/** @type {HTMLCanvasElement} */ (el.querySelector('canvas')), {
    scale, ramp: o.ramp ?? 'gold', seed: o.label.length * 97 + o.total % 1000, clock,
    onEnd: () => {
      done = true; el.classList.add('done'); lab.textContent = `${o.label} · time's up`; keys();
      el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop');
      if (o.ring || ringing) { play(pickedEnd); again = window.setTimeout(() => { if (done) { play(pickedEnd === 'times-up-wood' ? 'times-up-wood-again' : pickedEnd); el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop'); } }, 60_000); }
      if (o.loop) window.setTimeout(() => { if (done) restart(o.total); }, 4000);
    },
  });
  if (o.calm) g.calm(true);
  g.set(t);
  secondly(() => { tm.textContent = fmt(g.left()); }, clock, () => (t.paused ? 0 : t.end));
  const push = () => { g.set(t); tm.textContent = fmt(g.left()); el.classList.toggle('paused', !!t.paused); };

  function restart(total) {
    clearTimeout(again); done = false; el.classList.remove('done'); lab.textContent = o.label;
    box.classList.remove('flip'); void box.offsetWidth; box.classList.add('flip'); play('flip');
    g.flip(() => { t = { total, end: clock.now() + total, paused: 0 }; push(); keys(); });
  }
  function pause() {
    if (done) return;
    if (t.paused) { t = { ...t, end: clock.now() + t.paused, paused: 0 }; if (o.pause !== 'stay') g.tip(false); }
    else { t = { ...t, paused: Math.max(1, t.end - clock.now()) }; if (o.pause !== 'stay') g.tip(true); }
    push(); keys();
  }
  function add(ms) {
    if (done) { restart(Math.max(60_000, ms)); return; }
    const left = t.paused || t.end - clock.now();
    if (left + ms < 10_000) ms = 10_000 - left;
    t = t.paused ? { ...t, total: Math.max(10_000, t.total + ms), paused: t.paused + ms } : { ...t, total: Math.max(10_000, t.total + ms), end: t.end + ms };
    push();
  }
  let chipSum = 0, chipT = 0;
  function showChip(ms) {
    chipSum += ms; const m = Math.round(chipSum / 60000);
    chip.textContent = (m >= 0 ? '+' : '−') + Math.abs(m) + ':00'; chip.classList.add('on');
    clearTimeout(chipT); chipT = window.setTimeout(() => { chip.classList.remove('on'); chipSum = 0; }, 900);
  }
  function stop() {
    clearTimeout(again); el.style.transition = 'opacity .25s'; el.style.opacity = '0';
    // on the sheet it comes back, so the sheet stays alive
    window.setTimeout(() => { t = { total: o.total, end: clock.now() + o.left, paused: 0 }; done = false; el.classList.remove('done', 'paused'); lab.textContent = o.label; g.tip(false); g.set(null); g.set(t); keys(); el.style.opacity = '1'; }, 1600);
  }
  function key(label, cls, title, fn, hold = false) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tb ' + cls; b.title = title; b.innerHTML = label + (hold ? '<span class="fill"></span>' : '');
    if (hold) {
      let h = 0;
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); b.classList.add('holding'); h = window.setTimeout(() => { b.classList.remove('holding'); fn(); }, 600); });
      for (const ev of ['pointerup', 'pointerleave']) b.addEventListener(ev, () => { clearTimeout(h); b.classList.remove('holding'); });
    } else b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    return b;
  }
  function keys() {
    if (!row) return;
    row.replaceChildren(...(done
      ? [key('Again', 'go', 'Turn it over: the same time again', () => restart(t.total)), key('+5', '', 'Five more minutes', () => restart(5 * 60_000)), key('✕', 'stop', 'Hold to close', stop, true)]
      : [key('+1', '', 'One more minute (or scroll)', () => { add(60_000); showChip(60_000); }), key(t.paused ? '▶' : 'II', '', t.paused ? 'Go on' : 'Pause (or click the hourglass)', pause), key('✕', 'stop', 'Hold to stop', stop, true)]));
  }
  keys();
  box.addEventListener('click', (e) => { e.stopPropagation(); if (done) restart(t.total); else pause(); });
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    const step = (e.shiftKey ? 5 : 1) * 60_000 * (e.deltaY < 0 ? 1 : -1);
    add(step); showChip(step); play('notch');
  }, { passive: false });
  return {
    el, g, clock, pause, add, restart,
    speed(r) { clock.setRate(r); g.wake(); push(); },
    ring(on) { ringing = on; },
    reset(left) { clearTimeout(again); done = false; el.classList.remove('done', 'paused'); lab.textContent = o.label; t = { total: o.total, end: clock.now() + left, paused: 0 }; g.tip(false); g.set(null); g.set(t); keys(); },
  };
}

// ---------------------------------------------------------------- the sheet
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const all = [];
// 1. the three shapes
all.push(timer($('s-plate'), { label: 'Pizza', total: 3 * 60_000, left: 2 * 60_000 + 20_000, loop: true }));
all.push(timer($('s-col'), { shape: 'column', scale: 2, label: 'Pizza', total: 3 * 60_000, left: 2 * 60_000 + 20_000, loop: true }));
all.push(timer($('s-col'), { shape: 'column', scale: 2, label: 'Raid pull', total: 10 * 60_000, left: 6 * 60_000 + 5_000, ramp: 'sea', loop: true }));
all.push(timer($('s-strip'), { shape: 'strip', label: 'Pizza', total: 3 * 60_000, left: 2 * 60_000 + 20_000, loop: true, cls: 'flush-t' }));
$('s-col').querySelectorAll('.tw').forEach((e) => e.classList.add('flush-l'));
document.querySelectorAll('#s-strip .tw').forEach((e) => { /** @type {HTMLElement} */ (e).style.width = '424px'; });
$('fast1').addEventListener('click', (e) => { const on = !/** @type {HTMLElement} */ (e.currentTarget).classList.toggle('on') ? 1 : 20; for (const x of all.slice(0, 4)) x.speed(on); });

// 2. the end moment
const end = timer($('e-plate'), { label: 'Pizza', total: 60_000, left: 12_000 });
$('e-play').addEventListener('click', () => { soundsOk = true; end.ring(true); end.reset(11_000); });

// 3. pause: A laid on its side, B stays standing
const pa = timer($('p-a'), { label: 'Pizza', total: 3 * 60_000, left: 100_000, pause: 'tip', loop: true });
const pb = timer($('p-b'), { label: 'Pizza', total: 3 * 60_000, left: 100_000, pause: 'stay', loop: true });
let auto = window.setInterval(() => { pa.pause(); pb.pause(); }, 2600);
for (const x of [pa, pb]) x.el.addEventListener('pointerdown', () => { clearInterval(auto); auto = 0; }, { once: true });

// 4. in a game: calm
all.push(timer($('g-normal'), { label: 'Raid pull', total: 2 * 60_000, left: 90_000, ramp: 'sea', loop: true }));
all.push(timer($('g-calm'), { label: 'Raid pull', total: 2 * 60_000, left: 90_000, ramp: 'sea', loop: true, calm: true }));

// 5. sounds
for (const b of document.querySelectorAll('[data-snd]')) {
  b.addEventListener('click', () => {
    soundsOk = true;
    const n = /** @type {HTMLElement} */ (b).dataset.snd ?? '';
    if (n.startsWith('times-up-wood') && n !== 'times-up-wood-again') pickedEnd = 'times-up-wood';
    if (n === 'times-up-bowl') pickedEnd = 'times-up-bowl';
    for (const a of Object.values(SND)) a.pause();
    document.querySelectorAll('[data-snd]').forEach((x) => x.classList.remove('playing'));
    b.classList.add('playing'); play(n);
    SND[n]?.addEventListener('ended', () => b.classList.remove('playing'), { once: true });
  });
}
// for the measuring harness
window.__sheet = { all, end, pa, pb };
window.__ready = true;
