// Sheet 62: what "Keep as a note" and "Pin it" leave on the desktop.
import { ready, el, at, note } from '../sheet-60/notes.js';
const SCENE = new URLSearchParams(location.search).get('scene') || 'keep-note';
const tag = (p, x, y, h) => at(p, el('div', 'dtag', h), x, y);
/** The see-through slider, as the job pop-out draws it (jobpop.js vslider), at 2x. */
function vslider(op, px = 2) {
  const W = 8, H = 42, cv = Object.assign(document.createElement('canvas'), { width: W * px, height: H * px });
  const g = cv.getContext('2d'), P = (x, y, c) => { g.fillStyle = c; g.fillRect(x * px, y * px, px, px); };
  const MIN = 0.3, f = (op - MIN) / (1 - MIN), ky = Math.round(2 + (1 - f) * 34);
  for (let y = 1; y < H - 1; y++) { P(3, y, '#0d0703'); P(4, y, '#0d0703'); P(2, y, '#6a4628'); P(5, y, '#3a2414'); }
  for (let y = ky + 2; y < H - 2; y++) { P(3, y, '#e9d3a6'); P(4, y, '#c9ad78'); }
  const K = ['.OOOOOO.', 'OHHHFFSO', 'OHFFFFSO', 'OFFFFSSO', '.OOOOOO.'];
  K.forEach((r, y) => [...r].forEach((c, x) => { const k = { O: '#120a05', H: '#d9c2ff', F: '#8a5cc4', S: '#4A2C6E' }[c]; if (k) P(x, ky + y, k); }));
  return cv;
}
window.__ready = (async () => {
  await ready();
  const stage = el('div'); stage.style.cssText = 'position:absolute;left:0;top:0;width:1600px;height:1000px'; document.body.append(stage);
  let crop;
  if (SCENE === 'keep-note') {
    // "Keep as a note": a basic note, the default colour, the words and the link they came from; # category is optional
    const n = { title: '', col: 'B', html: '<div class="quote">Ragnaros knocks back everyone in melee range at the start of each submerge.</div><p><a>forever.warcraft.com/guides/molten-core</a></p>' };
    at(stage, note('B', n, 290, 270), 24, 40);
    tag(stage, 26, 16, '<b>KEEP AS A NOTE</b> &middot; A BASIC NOTE, THE LINK KEPT');
    crop = { x: 0, y: 0, w: 380, h: 330 };
  } else if (SCENE === 'pin-snip') {
    // "Pin it": the snip as a small solid window, one of the pop-out family (same pin, same see-through, snaps flush)
    const f = el('iframe'); f.src = 'pinsnip.html'; Object.assign(f.style, { position: 'absolute', left: '24px', top: '40px', width: '320px', height: '214px', border: '0', background: 'transparent' });
    stage.append(f); await new Promise((r) => { f.onload = r; setTimeout(r, 4000); });
    const vs = vslider(0.85); at(stage, vs, 352, 74);
    tag(stage, 26, 16, '<b>PIN IT</b> &middot; A SMALL WINDOW THAT STAYS ON TOP');
    tag(stage, 26, 266, 'HOVER BY IT: THE SEE-THROUGH SLIDER, LIKE THE OTHER POP-OUTS');
    tag(stage, 26, 286, 'DRAG IT TO THE PLAYER OR THE VIDEO: IT SNAPS FLUSH');
    await new Promise((r) => setTimeout(r, 600));
    crop = { x: 0, y: 0, w: 480, h: 310 };
  }
  return { crop };
})();
