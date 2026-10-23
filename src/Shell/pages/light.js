// Autofill's light (sheet 77, 2026-10-23). It only draws what Samara sends and says when he clicks it or rolls the wheel
// on it; it never sees the page.
const PAL = { O: '#120A05', y: '#FFC43C', Y: '#FFE9A8', w: '#F3E2B8', W: '#FFF8E8', r: '#c0392b', k: '#8a6d33' };
const ART = {
  letter: ['OOOOOOO', 'OWwwwWO', 'OOwwwOO', 'OwOrOwO', 'OwwwwwO', 'OOOOOOO'],
  card: ['OOOOOOOOO', 'OWWWWWWWO', 'OwrrwkkwO', 'OwrrwwwwO', 'OwwwwkkwO', 'OWWWWWWWO', 'OOOOOOOOO'],
  key: ['.OOO.', 'OyYyO', 'OyOyO', '.OyO.', '.OyO.', '.OyyO', '.OyO.', '.OyyO', '..O..'],
};
function art(rows, s = 2) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  let r = '';
  rows.forEach((row, y) => [...row].forEach((c, x) => { if (PAL[c]) r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${PAL[c]}"/>`; }));
  return `<svg width="${w * s}" height="${h * s}" viewBox="0 0 ${w} ${h}">${r}</svg>`;
}
const light = document.getElementById('light'), tag = document.getElementById('tag'), v = document.getElementById('v'), item = document.getElementById('item');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function label(text, count, anim) {
  const put = () => { v.innerHTML = esc(text) + (count ? `<span class="n">${esc(count)}</span>` : ''); };
  tag.hidden = !text;
  if (!anim) { put(); return; }
  v.classList.add('swap');
  setTimeout(() => { put(); v.classList.remove('swap'); }, 100);
}
window.aangLight?.on((m) => {
  if (!m) { light.classList.add('off'); light.classList.remove('on'); return; }
  if (m.give) { light.classList.add('give'); setTimeout(() => light.classList.remove('give'), 200); return; }
  if (m.flick) { label(m.text, m.count, true); return; }
  item.innerHTML = ART[m.item] ? art(ART[m.item]) : '';
  label(m.text, m.count, false);
  light.classList.remove('off');
  light.classList.remove('on'); void light.offsetWidth;
  requestAnimationFrame(() => light.classList.add('on'));
});
light.addEventListener('mousedown', (e) => { e.preventDefault(); window.aangLight?.pick(); });
document.addEventListener('wheel', (e) => { e.preventDefault(); if (Math.abs(e.deltaY) > 2) window.aangLight?.flick(e.deltaY > 0 ? 1 : -1); }, { passive: false });
