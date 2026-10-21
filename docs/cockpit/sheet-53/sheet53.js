// Sheet 53 helpers: every <div class="shot" data-s="name"> becomes that real render (sheet-53/name.png) with its arrows.
// Where things are in each picture comes from the render itself (shots.js, written by speech-shots.ts), so an arrow
// lands on the real edge, key or bar. Section 2's player steps through the real frames at their real times.

// to(S) = the point the arrow touches; at = where the label's top-left sits (picture pixels); side: which edge the line leaves from.
const CALLS = {
  'look-A-a-line': [{ to: (S) => [S.bubble.x + 150, S.bubble.y + 1], at: [60, 2], text: 'Soft dark-wood ink line', small: 'and lighter paper' }],
  'look-B-a-line': [{ to: (S) => [S.bubble.x + 13, S.bubble.y + 13], at: [120, 0], text: 'Thin pixel-wood rim', small: 'gold studs in the corners' }],
  'look-C-a-line': [
    { to: (S) => [S.bubble.x + 30, S.bubble.y - 4], at: [90, 0], text: 'Name tab: who is talking' },
    { to: (S) => [S.bubble.x + 120, S.bubble.y + S.bubble.h - 7], at: [40, 150], text: 'A second line inside', small: 'chunky outline' },
  ],
  'look-A-b-ask': [{ to: (S) => [S.keys.x + S.keys.w - 4, S.keys.y + 18], at: [290, 92], text: 'Keys show', small: 'when your pointer is on it' }],
  'look-A-c-choice': [{ to: (S) => [S.opt.x + S.opt.w + 2, S.opt.y + 27], at: [452, 130], text: 'Plum row, slim finger', small: 'each answer its own box' }],
  'look-A-d-job': [{ to: (S) => [S.bar.x + 120, S.bar.y + S.bar.h - 14], at: [70, 200], text: 'The job, inside his speech', small: '%, notches, time left' }],
  'click-1-nothing': [{ to: (S) => [S.box.x + 120, S.box.y + 8], at: [40, 14], text: 'Just the chat box' }],
  'click-2-recent': [
    { to: (S) => [S.bubble.x + S.bubble.w - 40, S.bubble.y - 6], at: [300, 0], text: 'Said 2 min ago' },
    { to: (S) => [S.box.x + 8, S.box.y + 60], at: [4, 214], text: 'Its own box, with a gap' },
  ],
  'j-0-mark': [{ to: (S) => [S.mark.x + 6, S.mark.y + 10], at: [8, 2], text: 'Claude is working', small: 'click the mark' }],
  'j-1-one': [{ to: (S) => [S.mark.x + 20, S.mark.y + 4], at: [430, 4], text: 'The mark stays' }],
  'j-2-two': [{ to: (S) => [S.bars[1].x + S.bars[1].w + 4, S.bars[1].y + 110], at: [446, 150], text: 'Click a job', small: 'its tasks unfold' }],
  'j-3-shrink': [{ to: (S) => [S.bubble.x + 30, S.bubble.y + S.bubble.h - 6], at: [8, 170], text: 'Shrinks away' }],
};

const NS = 'http://www.w3.org/2000/svg';
function arrow(svg, x1, y1, x2, y2) {
  const ang = Math.atan2(y2 - y1, x2 - x1), back = 11;
  const ex = x2 - Math.cos(ang) * back, ey = y2 - Math.sin(ang) * back;
  const head = (col, grow) => {
    const p = document.createElementNS(NS, 'path'), a = 7 + grow, b = 13 + grow;
    const px = (dx, dy) => [x2 + dx * Math.cos(ang) - dy * Math.sin(ang), y2 + dx * Math.sin(ang) + dy * Math.cos(ang)];
    const [ax, ay] = px(-b, -a), [bx, by] = px(-b, a), [tx, ty] = px(grow ? 2 : 0, 0);
    p.setAttribute('d', `M${ax} ${ay} L${tx} ${ty} L${bx} ${by} Z`); p.setAttribute('fill', col);
    p.setAttribute('stroke', col); p.setAttribute('stroke-linejoin', 'round'); p.setAttribute('stroke-width', grow ? 3 : 1);
    return p;
  };
  for (const [col, wdt] of [['#120A05', 7], ['#fffaf0', 3]]) {
    const l = document.createElementNS(NS, 'line');
    Object.entries({ x1, y1, x2: ex, y2: ey, stroke: col, 'stroke-width': wdt, 'stroke-linecap': 'round' }).forEach(([k, v]) => l.setAttribute(k, v));
    svg.append(l, head(col, col === '#120A05' ? 2 : 0));
  }
}

function build(host) {
  const name = host.dataset.s, S = window.SHOTS?.[name];
  const img = new Image(); img.src = `sheet-53/${name}.png`; img.alt = host.dataset.alt || '';
  if (S) { img.width = S.w; img.height = S.h; }
  host.append(img);
  const calls = CALLS[name];
  if (!S || !calls || host.dataset.plain !== undefined) return;
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'arrows'); svg.setAttribute('width', S.w); svg.setAttribute('height', S.h);
  host.append(svg);
  for (const c of calls) {
    const lab = document.createElement('div'); lab.className = 'callout';
    lab.append(document.createTextNode(c.text));
    if (c.small) { const s = document.createElement('small'); s.textContent = c.small; lab.append(s); }
    lab.style.left = c.at[0] + 'px'; lab.style.top = c.at[1] + 'px';
    host.append(lab);
    requestAnimationFrame(() => {
      const [tx, ty] = c.to(S);
      const lw = lab.offsetWidth, lh = lab.offsetHeight, lx = c.at[0], ly = c.at[1];
      // leave from the label's edge nearest the target
      const fx = Math.max(lx, Math.min(lx + lw, tx)), fy = Math.max(ly, Math.min(ly + lh, ty));
      const sx = tx < lx ? lx : tx > lx + lw ? lx + lw : fx, sy = ty < ly ? ly : ty > ly + lh ? ly + lh : (fx === tx ? ly + lh : fy);
      arrow(svg, sx, sy, tx, ty);
    });
  }
}
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.shot[data-s]').forEach(build);

  // ---- section 2: the real frames, at their real times (the clock held between them was the page's own)
  const G = window.SHOTS?.grow, view = document.getElementById('loop');
  if (!G || !view) return;
  const imgs = G.frames.map((f) => { const i = new Image(); i.src = 'sheet-53/' + f.f; return i; });
  view.width = G.w; view.height = G.h;
  const ms = document.getElementById('loopms'), slowB = document.getElementById('slow'), realB = document.getElementById('real');
  let slow = 1, k = 0, timer = 0;
  const HOLD = { rest: 1100, question: 1400, rest2: 1200 };
  const next = () => {
    const f = G.frames[k];
    view.src = imgs[k].src;
    ms.textContent = f.phase === 'grow' ? `GROWING ${f.t} MS` : f.phase === 'shrink' ? `SHRINKING ${f.t - G.frames.find((x) => x.phase === 'shrink').t} MS` : f.phase === 'question' ? 'THE QUESTION' : 'AT REST';
    const nf = G.frames[(k + 1) % G.frames.length];
    const dt = HOLD[f.phase] ?? Math.max(16, (nf.t - f.t) * slow);
    k = (k + 1) % G.frames.length;
    timer = setTimeout(next, f.phase in HOLD ? dt : dt);
  };
  const set = (s) => { slow = s; slowB.classList.toggle('off', s === 1); realB.classList.toggle('off', s !== 1); };
  slowB.onclick = () => set(5); realB.onclick = () => set(1);
  set(1); next();
});
