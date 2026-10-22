// Sheet 62 (2026-10-22): a snip pinned on his desktop. The window decides nothing: pinsnip.ts knows which snip this is
// and sends its picture; this page draws it, says when the mouse is on it, and asks to be dragged, pinned, faded or closed.
const api = window.pinsnip;
const MIN_OP = 0.3;
const frame = document.getElementById('frame'), bar = document.getElementById('bar');
const vs = document.getElementById('vs'), ro = document.getElementById('ro'), pinB = document.getElementById('pin');
const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16));
const mix = (x, t, k) => `rgb(${rgb(x).map((v, i) => Math.round(v + (t[i] - v) * k)).join(',')})`;

/* ---- the pin and the slider: the job pop-out's pixel art (jobpop.js, sheet 52), the same pin and the same slider ---- */
const PIN = ['..OOOOO..', '..OHFFO..', '..OHFSO..', '..OHFSO..', '.OOHFSOO.', 'OHHFFFFSO', 'OSSSSSSSO', 'OOOOOOOOO', '....O....', '....O....', '....O....', '....O....'];
function pinArt(on, px = 1) {
  const w = PIN[0].length, ht = PIN.length;
  const cv = Object.assign(document.createElement('canvas'), { width: (w + 1) * px, height: (ht + 1) * px });
  const g = cv.getContext('2d');
  const F = on ? '#c4532a' : '#f1e3c4';
  const col = on ? { O: '#2a1a10', H: mix(F, [255, 255, 255], 0.5), F, S: mix(F, [40, 20, 10], 0.35) } : { O: '#9a7c58', H: '#fffaf0', F, S: '#d6bd90' };
  if (on) { g.fillStyle = 'rgba(0,0,0,.35)'; PIN.forEach((r, y) => [...r].forEach((c, x) => { if (c !== '.') g.fillRect((x + 1) * px, (y + 1) * px, px, px); })); }
  PIN.forEach((r, y) => [...r].forEach((c, x) => { if (col[c]) { g.fillStyle = col[c]; g.fillRect(x * px, y * px, px, px); } }));
  cv.style.width = cv.width + 'px'; cv.style.height = cv.height + 'px';
  return cv;
}
function vslider(op, px = 2) {
  const W = 8, H = 42, cv = Object.assign(document.createElement('canvas'), { width: W * px, height: H * px });
  const g = cv.getContext('2d'), P = (x, y, c) => { g.fillStyle = c; g.fillRect(x * px, y * px, px, px); };
  const f = (op - MIN_OP) / (1 - MIN_OP), ky = Math.round(2 + (1 - f) * 34);
  for (let y = 1; y < H - 1; y++) { P(3, y, '#0d0703'); P(4, y, '#0d0703'); P(2, y, '#6a4628'); P(5, y, '#3a2414'); }
  for (let y = ky + 2; y < H - 2; y++) { P(3, y, '#e9d3a6'); P(4, y, '#c9ad78'); }
  const K = ['.OOOOOO.', 'OHHHFFSO', 'OHFFFFSO', 'OFFFFSSO', '.OOOOOO.'];
  K.forEach((r, y) => [...r].forEach((c, x) => { const k = { O: '#120a05', H: '#d9c2ff', F: '#8a5cc4', S: '#4A2C6E' }[c]; if (k) P(x, ky + y, k); }));
  cv.style.width = cv.width + 'px'; cv.style.height = cv.height + 'px';
  return cv;
}
const opAt = (y) => { const ky = Math.max(2, Math.min(36, Math.round((y - 6) / 2 - 2))); return Math.round((MIN_OP + (1 - MIN_OP) * (1 - (ky - 2) / 34)) * 100) / 100; };

let pinned = true, opacity = 1;
function paintPin() {
  pinB.classList.toggle('on', pinned);
  pinB.setAttribute('aria-pressed', String(pinned));
  pinB.title = pinned ? 'Pinned: stays on top (click to unpin)' : 'Pin: stays on top';
  pinB.replaceChildren(pinArt(pinned));
}
function setOpacity(op, say = true) {
  opacity = Math.max(MIN_OP, Math.min(1, op));
  frame.style.setProperty('--op', String(opacity));
  vs.replaceChildren(vslider(opacity));
  if (say) { ro.textContent = Math.round(opacity * 100) + '%'; ro.classList.add('on'); clearTimeout(roTimer); roTimer = setTimeout(() => ro.classList.remove('on'), 900); }
}

/* ---- the mouse: the window takes it only over the frame and its slider; elsewhere it goes to whatever is behind ---- */
let hot = false, dragging = false, sliding = false, hideTimer = 0, roTimer = 0;
function setHot(on) {
  if (on === hot) return;
  hot = on;
  api?.clickable(on || dragging || sliding);
  clearTimeout(hideTimer);
  if (on) vs.classList.add('on'); else hideTimer = setTimeout(() => { if (!hot && !sliding) vs.classList.remove('on'); }, 500);
}
const isHot = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && (frame.contains(e) || (vs.classList.contains('on') && vs.contains(e))); };
document.addEventListener('mousemove', (e) => setHot(isHot(e.clientX, e.clientY)));
document.addEventListener('mouseleave', () => setHot(false));

// Grab the bar to move it.
bar.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest('button')) return;
  const sx = e.screenX, sy = e.screenY;
  let moved = false;
  try { bar.setPointerCapture(e.pointerId); } catch { /* not seen go down */ }
  bar.onpointermove = (ev) => {
    const dx = ev.screenX - sx, dy = ev.screenY - sy;
    if (!moved && Math.hypot(dx, dy) > 3) { moved = true; dragging = true; api?.drag({ phase: 'start' }); }
    if (moved) api?.drag({ phase: 'move', dx, dy });
  };
  bar.onpointerup = () => { bar.onpointermove = null; bar.onpointerup = null; if (moved) { dragging = false; api?.drag({ phase: 'end' }); api?.clickable(hot); } };
});
vs.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  sliding = true;
  try { vs.setPointerCapture(e.pointerId); } catch { /* as above */ }
  const top = () => vs.getBoundingClientRect().top;
  setOpacity(opAt(e.clientY - top()));
  vs.onpointermove = (ev) => setOpacity(opAt(ev.clientY - top()));
  vs.onpointerup = () => { vs.onpointermove = null; vs.onpointerup = null; sliding = false; api?.opacity(opacity); api?.clickable(hot); if (!hot) setHot(false); };
});
vs.addEventListener('wheel', (e) => { e.preventDefault(); setOpacity(opacity + (e.deltaY > 0 ? -0.05 : 0.05)); api?.opacity(opacity); }, { passive: false });
pinB.addEventListener('click', () => api?.pin());
document.getElementById('close').addEventListener('click', () => api?.close());
document.addEventListener('contextmenu', (e) => e.preventDefault());

api?.onData((d) => {
  if (!d || typeof d !== 'object') return;
  document.getElementById('what').textContent = String(d.title ?? 'Snip').slice(0, 60);
  const img = document.getElementById('pic');
  if (typeof d.pic === 'string' && d.pic.startsWith('data:image/png;base64,') && img.src !== d.pic) img.src = d.pic;
  pinned = d.pinned === true; paintPin();
  if (Number.isFinite(d.opacity)) setOpacity(Number(d.opacity), false);
});
paintPin();
setOpacity(1, false);
