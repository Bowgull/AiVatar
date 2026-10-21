// Sheet 57 helper. <div class="shot" data-s="A"> becomes that real render (sheet-57/A.png) at 2x; data-z="A-z-hover" a
// close-up at 4x (the 2x picture shown twice as big, whole pixels). data-call="hvx:right:words" lays an arrow + label on the
// picture, pointing at where the x sits (SHOTS, written by src/Shell/test/electron/tabclose-shots.ts). Several are split by |.
function build(host) {
  const name = host.dataset.s, z = host.dataset.z, S = window.SHOTS?.[name];
  const img = new Image(); img.alt = '';
  if (z) {
    const [take] = z.split('-z-'), Z = window.SHOTS?.[take]?.zooms.find((q) => take + '-' + q.name === z);
    img.src = `sheet-57/${z}.png`; if (Z) { img.width = Z.w * 2; img.height = Z.h * 2; }
    host.append(img); return;
  }
  img.src = `sheet-57/${name}.png`;
  if (S) { img.width = S.w; img.height = S.h; }
  host.append(img);
  if (!S || !host.dataset.call) return;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'arrows'); svg.setAttribute('width', S.w); svg.setAttribute('height', S.h);
  host.append(svg);
  for (const c of host.dataset.call.split('|')) {
    const [where, side, words, small] = c.split('~');
    const r = S[where]; if (!r) continue;
    // Picture pixels: twice the CSS ones.
    const cx = (r.x + r.w / 2) * 2, cy = (r.y + r.h / 2) * 2, half = r.w;
    const lab = document.createElement('div'); lab.className = 'callout ' + side;
    lab.innerHTML = words + (small ? `<small>${small}</small>` : '');
    host.append(lab);
    const gap = 26;
    lab.style.top = (cy - 22) + 'px';
    if (side === 'right') lab.style.left = (S.w + gap) + 'px'; else lab.style.right = (S.w + gap) + 'px';
    const x1 = side === 'right' ? S.w + gap - 4 : -gap + 4, x2 = side === 'right' ? cx + half + 8 : cx - half - 8;
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', `M${x1} ${cy} L${x2} ${cy}`);
    p.setAttribute('class', 'ar');
    const h = document.createElementNS(NS, 'path');
    const d = side === 'right' ? 1 : -1;
    h.setAttribute('d', `M${x2 + 11 * d} ${cy - 9} L${x2} ${cy} L${x2 + 11 * d} ${cy + 9}`); h.setAttribute('class', 'ar');
    svg.append(p, h);
  }
}
document.addEventListener('DOMContentLoaded', () => document.querySelectorAll('.shot[data-s],.shot[data-z]').forEach(build));
