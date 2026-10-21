// Sheet 52 helpers (a mockup, not product code): the borderless job pop-out, its states, how it tears off Aang's
// bubble and goes back, and four ways to make it see-through. Uses sheet 50's marks.js (S50: the pet's marks, the job
// data, the task list). Every scene is a little looping play; ?still=1 freezes each on its most telling moment.
(() => {
  const ICON = '../../src/Shell/pages/art/claude-icon.png';
  const AANG = '../../assets/aang/frames/';
  const STILL = new URLSearchParams(location.search).has('still');
  const J = S50.JOB, J2 = S50.JOB2;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16));
  const mix = (x, t, k) => `rgb(${rgb(x).map((v, i) => Math.round(v + (t[i] - v) * k)).join(',')})`;

  // ------------------------------------------------------------ pixel art: pin, mouse wheel, vertical slider
  const PIN = ['..OOOOO..', '..OHFFO..', '..OHFSO..', '..OHFSO..', '.OOHFSOO.', 'OHHFFFFSO', 'OSSSSSSSO', 'OOOOOOOOO', '....O....', '....O....', '....O....', '....O....'];
  function pin(on, px = 2) {
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
  const MOUSE = ['..OOOOO..', '.OHHOHHO.', 'OHFFWFFSO', 'OHFFWFFSO', 'OHFFOFFSO', 'OOOOOOOOO', 'OHFFFFFSO', 'OHFFFFFSO', 'OFFFFFFSO', 'OFFFFFFSO', 'OFFFFFFSO', '.OFFFFSO.', '..OOOOO..'];
  const DOWN = ['..A..', '..A..', '..A..', 'AAAAA', '.AAA.', '..A..'];
  function wheelIcon(dir, px = 3) {
    const cv = Object.assign(document.createElement('canvas'), { width: 17 * px, height: 13 * px });
    const g = cv.getContext('2d'), P = (x, y, c) => { g.fillStyle = c; g.fillRect(x * px, y * px, px, px); };
    MOUSE.forEach((r, y) => [...r].forEach((c, x) => { const k = { O: '#0d0e10', H: '#ffffff', F: '#d9dae0', S: '#9fa1aa', W: '#b07cff' }[c]; if (k) P(x, y, k); }));
    const A = dir === 'up' ? [...DOWN].reverse() : DOWN;
    A.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'A') P(x + 11, y + 3, '#ffffff'); }));
    return cv;
  }
  // a vertical groove with a plum gem knob; top = solid, bottom = 30%
  function vslider(op, px = 2) {
    const W = 8, H = 42, cv = Object.assign(document.createElement('canvas'), { width: W * px, height: H * px });
    const g = cv.getContext('2d'), P = (x, y, c) => { g.fillStyle = c; g.fillRect(x * px, y * px, px, px); };
    const f = (op - 0.3) / 0.7, ky = Math.round(2 + (1 - f) * 34);
    for (let y = 1; y < H - 1; y++) { P(3, y, '#0d0703'); P(4, y, '#0d0703'); P(2, y, '#6a4628'); P(5, y, '#3a2414'); }
    for (let y = ky + 2; y < H - 2; y++) { P(3, y, '#e9d3a6'); P(4, y, '#c9ad78'); }
    const K = ['.OOOOOO.', 'OHHHFFSO', 'OHFFFFSO', 'OFFFFSSO', '.OOOOOO.'];
    K.forEach((r, y) => [...r].forEach((c, x) => { const k = { O: '#120a05', H: '#d9c2ff', F: '#8a5cc4', S: '#4A2C6E' }[c]; if (k) P(x, ky + y, k); }));
    cv.style.width = cv.width + 'px'; cv.style.height = cv.height + 'px';
    return { cv, knobY: (ky + 2) * px };
  }

  // ------------------------------------------------------------ 45f's soft pill (from sheet 50), plus grey + no-glow
  const SEA = ['#d9f3ee', '#b2e6dd', '#8ad5c9', '#6cc3b6', '#58b0a3', '#479a8e', '#3a857a', '#2f6f66'];
  const SEA_NOW = ['#f4fcfa', '#e2f6f1', '#cdeee6', '#b8e5db', '#a4dbcf', '#90cfc2', '#7fc2b5', '#6fb3a6'];
  const GREY = ['#e4e6ea', '#cfd2d8', '#b8bcc4', '#a2a7b1', '#8d939e', '#79808b', '#6f7787', '#5d6471'];
  const anims = []; let tk = 0;
  if (!S50.reduce) setInterval(() => { tk++; for (const a of anims) a(tk); }, 90);
  function pill(w, ph, s, job, { pal = SEA, glow = true } = {}) {
    const bounds = S50.boundsOf(job), p = job.p, cur = job.cur;
    const c = document.createElement('canvas'); c.className = 'jpill'; c.width = w; c.height = ph; c.style.width = w * s + 'px'; c.style.height = ph * s + 'px';
    const g = c.getContext('2d'), r = Math.floor(ph / 2);
    const P = (x, y, col, a = 1) => { g.globalAlpha = a; g.fillStyle = col; g.fillRect(x, y, 1, 1); g.globalAlpha = 1; };
    const inside = (x, y) => { const cx = x < r ? r - 0.5 : x > w - 1 - r ? w - 1 - r + 0.5 : x, cy = y < r ? r - 0.5 : y > ph - 1 - r ? ph - 1 - r + 0.5 : y; return Math.hypot(x - cx, y - cy) <= r + 0.15; };
    const draw = (t) => {
      g.clearRect(0, 0, w, ph);
      for (let y = 0; y < ph; y++) for (let x = 0; x < w; x++) { if (!inside(x, y)) continue; const rim = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1); P(x, y, rim ? (y < ph / 2 ? '#6a4628' : '#3a2414') : y === 1 ? '#1a100a' : '#2a1a10'); }
      const inner = w - 2, fw = Math.round(inner * p), a = cur > 0 ? bounds[cur - 1] : 0, b = bounds[cur] ?? 1;
      const paint = (x0, x1, pl, al) => { for (let x = x0; x < x1; x++) for (let y = 1; y < ph - 1; y++) { if (!inside(x, y) || !(inside(x - 1, y) && inside(x + 1, y) && inside(x, y - 1) && inside(x, y + 1))) continue; P(x, y, pl[Math.min(7, Math.round((y - 1) / (ph - 3) * 7))], al); } };
      if (glow) paint(1 + Math.round(inner * a), 1 + Math.round(inner * b), SEA_NOW, 0.7 + 0.2 * Math.sin(t / 7));
      paint(1, 1 + fw, pal, 1);
      for (let x = 2; x < fw; x++) if (inside(x, 2)) P(x, 2, '#fff', 0.45);
      for (const q of bounds.slice(0, -1)) { const x = 1 + Math.round(inner * q); for (let y = 2; y < ph - 2; y++) P(x, y, '#2a1a10', 0.45); }
      if (glow) for (let y = 1; y < ph - 1; y++) { P(fw, y, '#fffaf0'); P(fw + 1, y, '#fff3d8', 0.5); }
    };
    if (glow) anims.push(draw); draw(0); return c;
  }

  // ------------------------------------------------------------ the pop-out card
  // pw = the floating thing (no frame); .pj = the job bubble itself; overlays (.ro readout etc.) never fade with it.
  function card(o = {}) {
    const st = o.state || 'work', job = o.job || J;
    const pw = h('div', 'pw'), pj = h('div', 'pj' + (st !== 'work' ? ' ' + st : '') + (o.open ? ' open' : ''));
    if (o.w) pj.style.setProperty('--w', o.w + 'px');
    const pinB = `<button class="pin" type="button" title="Pin: stays on top"></button>`;
    if (st === 'done') {
      pj.innerHTML = `<div class="top"><div class="big"><span class="tk"></span><span><b>JOB COMPLETE</b><small>${job.sess} &middot; ${job.name} &middot; all ${job.tasks.length} tasks &middot; 1 h 38 min</small></span></div>${pinB}</div>
        <div class="ckeys"><button class="key primary sm nice" type="button">Nice</button></div>`;
      pj.querySelector('.tk').append(S50.mark('complete', S50.COL.complete, 3));
    } else {
      const chip = st === 'needs' ? '<span class="chip needs">NEEDS YOU</span>' : st === 'paused' ? '<span class="chip paused">PAUSED</span>' : `<span class="lt">${job.left.replace(/^about /, '').replace(/ left$/, '')}</span>`;
      pj.innerHTML = `<div class="top"><img class="ci" src="${ICON}" alt=""><b class="pr">${job.sess}</b><span class="pbw"></span><span class="pct">${Math.round(job.p * 100)}%</span>${chip}${pinB}</div>
        <div class="det"><div class="inner"><div class="nowl"><span class="mc">PC</span><span>Task ${job.cur + 1} of ${job.tasks.length} &middot; ${job.tasks[job.cur][0]}</span></div>
        <div class="list">${S50.tasksHTML(job)}</div>
        <div class="ckeys"><button class="key sm" type="button">${st === 'paused' ? 'Resume' : 'Pause'}</button><button class="key primary sm" type="button">Open in Claude</button><button class="msg" type="button" title="Message this session">${S50.MSG}</button></div></div></div>`;
      const pw2 = st === 'work' ? 60 : st === 'needs' ? 40 : 46;
      pj.querySelector('.pbw').append(pill(pw2, 9, 2, job, st === 'paused' ? { pal: GREY, glow: false } : {}));
    }
    pj.querySelector('.pin').append(pin(!!o.pinned));
    if (o.op != null) pj.style.opacity = o.op;
    pw.append(pj, h('span', 'ro', '100%'));
    if (o.x != null) { pw.style.left = o.x + 'px'; pw.style.top = o.y + 'px'; }
    if (o.scale) { pw.style.transform = `scale(${o.scale})`; pw.style.transformOrigin = '0 0'; }
    return pw;
  }
  // unfold: ~520 ms with a soft spring (a 4% overshoot that settles); fold: ~340 ms, no bounce
  function setOpen(pw, on) {
    const pj = pw.querySelector('.pj'), det = pj.querySelector('.det'), inner = det.firstElementChild;
    const ht = inner.offsetHeight;
    pj.classList.toggle('open', on);
    if (on) {
      det.style.height = ht + 'px';
      det.animate([{ height: '0px' }, { height: ht * 1.045 + 'px', offset: 0.6 }, { height: ht * 0.992 + 'px', offset: 0.84 }, { height: ht + 'px' }], { duration: 520, easing: 'cubic-bezier(.3,.7,.35,1)' });
      inner.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'ease-out' });
    } else {
      det.style.height = '0px';
      det.animate([{ height: ht + 'px' }, { height: '0px' }], { duration: 340, easing: 'cubic-bezier(.32,.72,0,1)' });
    }
  }
  const setOp = (pw, op, show = true) => {
    pw.querySelector('.pj').style.opacity = op;
    const ro = pw.querySelector('.ro'); ro.textContent = Math.round(op * 100) + '%'; ro.classList.toggle('on', show);
  };

  // ------------------------------------------------------------ backdrops
  function desk(scene) { scene.classList.add('desk'); scene.insertAdjacentHTML('beforeend', `<div class="taskbar">${'<i></i>'.repeat(7)}</div>`); }
  function game(scene, W, H) {
    scene.classList.add('game');
    const X = (f) => Math.round(W * f), Y = (f) => Math.round(H * f);
    scene.insertAdjacentHTML('beforeend', `<svg class="land" viewBox="0 0 1000 600" preserveAspectRatio="none"><circle cx="720" cy="110" r="38" fill="#f0e6d0" opacity=".35"/>
      <path d="M0 330 L110 260 L230 310 L360 220 L500 300 L640 230 L790 310 L920 250 L1000 290 L1000 600 L0 600Z" fill="#3a2c4a"/>
      <path d="M0 410 L150 350 L290 395 L450 330 L620 400 L780 345 L940 395 L1000 370 L1000 600 L0 600Z" fill="#2a3a2c"/>
      <path d="M0 500 L190 465 L410 492 L620 458 L860 500 L1000 475 L1000 600 L0 600Z" fill="#1c2a1c"/>
      <path d="M120 470 l10 -60 l10 60z M160 480 l12 -80 l12 80z M820 470 l10 -70 l10 70z M860 490 l12 -60 l12 60z" fill="#163018"/></svg>
      <div class="g-fx" style="left:${X(.46)}px;top:${Y(.5)}px;width:${X(.2)}px;height:${X(.2)}px;background:radial-gradient(circle,rgba(255,170,60,.85),rgba(255,90,20,.35) 45%,transparent 70%)"></div>
      <div class="g-fx" style="left:${X(.2)}px;top:${Y(.42)}px;width:${X(.16)}px;height:${X(.16)}px;background:radial-gradient(circle,rgba(110,255,140,.7),rgba(40,180,80,.25) 50%,transparent 72%)"></div>
      <div class="g-fx" style="left:${X(.68)}px;top:${Y(.3)}px;width:${X(.14)}px;height:${X(.14)}px;background:radial-gradient(circle,rgba(140,200,255,.75),rgba(60,120,255,.25) 50%,transparent 72%)"></div>
      <div class="g-hero" style="left:${X(.52)}px;top:${Y(.55)}px"></div>
      <div class="g-mob" style="left:${X(.74)}px;top:${Y(.46)}px"></div><div class="g-mob" style="left:${X(.3)}px;top:${Y(.5)}px"></div>
      <div class="g-num" style="left:${X(.73)}px;top:${Y(.3)}px;color:#ffe14a">-1,284</div>
      <div class="g-num" style="left:${X(.25)}px;top:${Y(.36)}px;color:#6dff7a">+862</div>
      <div class="g-num" style="left:${X(.58)}px;top:${Y(.42)}px;color:#ff9a3a;font-size:22px">CRIT 3,912</div>
      <div class="g-uf"><span class="por"></span><span class="bars"><i class="hp"></i><i class="mp"></i></span></div>
      <div class="g-mm"><i style="left:30px;top:40px"></i><i style="left:62px;top:28px;background:#ff5a4a"></i><i style="left:50px;top:66px;background:#6ac4ff"></i></div>
      <div class="g-chat"><div style="color:#7dff7d">[Guild] Brakka: raid at 8, bring flasks</div><div style="color:#ff8adf">[Whisper] Lunei: ty for the heal!</div><div style="color:#ffb35a">You receive loot: Runecloth x4</div><div style="color:#e8e8e8">[General] Shirro: LF healer for dungeon</div></div>
      <div class="g-ab">${['#b04a2a', '#2a5ab0', '#7a3a9a', '#3a8a3a', '#a08a2a', '#2a8a8a', '#8a2a2a', '#4a4a9a', '#8a6a3a', '#3a6a2a'].map((c) => `<i style="background:radial-gradient(circle at 35% 30%,${c},${c}66)"></i>`).join('')}</div>`);
  }

  // ------------------------------------------------------------ pointer, rings, arrows
  const CURSOR = '<svg class="cur" viewBox="0 0 11 13" width="22" height="26" shape-rendering="crispEdges"><path d="M0 0h1v12H0zM1 1h1v1H1zM2 2h1v1H2zM3 3h1v1H3zM4 4h1v1H4zM5 5h1v1H5zM6 6h1v1H6zM7 7h1v1H7zM8 8h1v1H8zM9 9h2v1H9zM6 10h1v1H6zM7 11h1v1H7zM1 11h1v1H1zM2 10h1v1H2zM3 9h1v1H3zM4 9h2v1H4zM5 10h1v1H5zM6 11h1v1H6zM7 12h1v1H7z" fill="#120A05"/><path d="M1 2h1v9H1zM2 3h1v7H2zM3 4h1v5H3zM4 5h1v4H4zM5 6h1v3H5zM6 7h1v3H6zM7 8h1v4H7zM8 9h1v1H8z" fill="#fff"/></svg>';
  function pointer(stage, x, y) { stage.insertAdjacentHTML('beforeend', CURSOR); const c = stage.lastElementChild; c.classList.add('snap'); mv(c, x, y); c.getBoundingClientRect(); c.classList.remove('snap'); return c; }
  const mv = (el, x, y) => { el.style.left = x + 'px'; el.style.top = y + 'px'; };
  function rel(scene, el) { const s = scene.getBoundingClientRect(), r = el.getBoundingClientRect(); return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height, cx: r.left - s.left + r.width / 2, cy: r.top - s.top + r.height / 2 }; }
  function click(stage, x, y) { const c = h('i', 'clk'); mv(c, x, y); stage.append(c); requestAnimationFrame(() => c.classList.add('go')); setTimeout(() => c.remove(), 600); }

  // one arrow + one label; the label centres at the target + (dx, dy); the arrow runs from the label's facing edge
  function arrow(scene, target, text, sub, dx, dy) {
    let svg = scene.querySelector(':scope > svg.arrows');
    if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'arrows'); scene.append(svg); }
    const t = target.x != null && target.getBoundingClientRect == null ? { x: target.x, y: target.y, w: 0, h: 0, cx: target.x, cy: target.y } : rel(scene, target);
    const lab = h('div', 'lab', text + (sub ? `<small>${sub}</small>` : '')); scene.append(lab);
    const lw = lab.offsetWidth, lh = lab.offsetHeight, W = scene.clientWidth, H = scene.clientHeight;
    let L = Math.max(6, Math.min(W - lw - 6, t.cx + dx - lw / 2)), T = Math.max(6, Math.min(H - lh - 6, t.cy + dy - lh / 2));
    mv(lab, L, T);
    let sx, sy, ex, ey;
    if (Math.abs(dy) >= Math.abs(dx)) { sx = Math.max(L + 12, Math.min(L + lw - 12, t.cx)); sy = dy > 0 ? T : T + lh; ex = t.cx; ey = dy > 0 ? t.y + t.h + 4 : t.y - 4; }
    else { sy = T + lh / 2; sx = dx > 0 ? L : L + lw; ey = t.cy; ex = dx > 0 ? t.x + t.w + 4 : t.x - 4; }
    const a = Math.atan2(ey - sy, ex - sx), hl = 11, hw = 6.5;
    const bx = ex - Math.cos(a) * hl, by = ey - Math.sin(a) * hl;
    const head = `${ex},${ey} ${bx + Math.sin(a) * hw},${by - Math.cos(a) * hw} ${bx - Math.sin(a) * hw},${by + Math.cos(a) * hw}`;
    svg.insertAdjacentHTML('beforeend', `<line x1="${sx}" y1="${sy}" x2="${bx}" y2="${by}" stroke="#08080a" stroke-width="6" stroke-linecap="round"/><polygon points="${head}" fill="#08080a" stroke="#08080a" stroke-width="4" stroke-linejoin="round"/>
      <line x1="${sx}" y1="${sy}" x2="${bx}" y2="${by}" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><polygon points="${head}" fill="#fff"/>`);
  }
  function tag(scene, text, x, y) { const t = h('div', 'tag', text); mv(t, x, y); scene.append(t); return t; }

  // ------------------------------------------------------------ Aang + his bubble, small
  function stripJob(job) {
    const e = h('div', 'sj', `<div class="hd"><img src="${ICON}" alt=""><b>${job.sess}</b><span class="t">${job.name} &middot; task ${job.cur + 1} of ${job.tasks.length}</span><span class="pct">${Math.round(job.p * 100)}%</span></div><div class="row2"><span class="pb"></span><span class="lt">${job.left}</span></div>`);
    e.querySelector('.pb').append(pill(104, 9, 2, job));
    return e;
  }
  function cockpit(stage, { right, bottom, jobs }) {
    const ck = h('div', 'ck', `<div class="slip"><small>TODAY &middot; AFTERNOON</small>Waymark asked about the map. You picked Grid.</div><div class="strip"></div><div class="typ"><div class="field">Ask Aang anything</div></div><i class="tail"></i>`);
    ck.style.right = right + 'px'; ck.style.bottom = bottom + 'px';
    const strip = ck.querySelector('.strip');
    for (const j of jobs) { const w = h('div', 'sw'); w.append(stripJob(j)); strip.append(w); }
    const aang = h('img', 'aang'); aang.src = AANG + 'idle_0.png'; aang.alt = ''; aang.style.right = (right - 150) + 'px'; aang.style.bottom = (bottom - 160) + 'px';
    stage.append(ck, aang);
    return { ck, strip, aang };
  }
  let fr = 0; setInterval(() => { fr = (fr + 1) % 16; document.querySelectorAll('img.aang').forEach((a) => { a.src = AANG + 'idle_' + fr + '.png'; }); }, 140);

  // ------------------------------------------------------------ the scenes
  const S = {};

  S['anat-fold'] = { bg: 'desk', w: 1330, h: 250, build(stage, scene) {
    const pw = card({ x: 300, y: 92, scale: 1.5 }); stage.append(pw);
    const box = h('div', '', ''); Object.assign(box.style, { position: 'absolute', right: '26px', top: '40px', width: '250px', padding: '14px 16px', borderRadius: '12px', background: '#16181c', boxShadow: 'inset 0 0 0 1px #3a3d45', display: 'flex', gap: '30px', justifyContent: 'center' });
    for (const on of [false, true]) { const d = h('div', '', ''); d.style.textAlign = 'center'; const c = pin(on, 5); c.style.display = 'block'; c.style.margin = '0 auto 8px'; d.append(c, h('div', '', `<span style="font:400 10px Silkscreen,monospace;letter-spacing:1px;color:#fff">${on ? 'PINNED' : 'NOT PINNED'}</span><br><span style="font-size:12.5px;color:#b9bac0">${on ? 'stays on top' : 'acts like a window'}</span>`)); box.append(d); }
    stage.append(box);
    return { arrows() {
      const q = (s) => pw.querySelector(s);
      arrow(scene, q('.ci'), 'Claude', '', -60, -70);
      arrow(scene, q('.pr'), 'Project', '', -40, -72);
      arrow(scene, q('.pbw canvas'), 'Progress bar', 'a notch per task, current piece glows', 20, -72);
      arrow(scene, q('.pct'), 'Done so far', '', -40, 78);
      arrow(scene, q('.lt'), 'Time left', '', 50, 78);
      arrow(scene, q('.pin'), 'The only button: pin', '', 120, 0);
    } };
  } };

  S['anat-open'] = { bg: 'desk', w: 880, h: 500, build(stage, scene) {
    const pw = card({ x: 40, y: 30, scale: 1.2, open: true }); stage.append(pw);
    return { arrows() {
      const q = (s) => pw.querySelector(s);
      arrow(scene, q('.nowl'), 'What it is doing now', 'and which computer (PC)', 300, -6);
      arrow(scene, q('.ob.done'), 'Ticked = done', '', 330, 0);
      arrow(scene, q('.ob.now'), 'This one is going', '', 320, 0);
      arrow(scene, q('.ckeys .key'), 'Pause', '', -10, 60);
      arrow(scene, q('.ckeys .key.primary'), 'Open in Claude', '', 60, 64);
      arrow(scene, q('.msg'), 'Message the session', '', 150, 30);
    } };
  } };

  S['unfold-loop'] = { bg: 'desk', w: 432, h: 500, still: 2, build(stage, scene) {
    const pw = card({ x: 30, y: 60 }); stage.append(pw);
    tag(stage, 'LIVE: CLICK TO OPEN', 30, 16);
    const cur = pointer(stage, 300, 400);
    const at = () => { const r = rel(scene, pw.querySelector('.pr')); return [r.cx + 30, r.cy]; };
    return { steps: [
      [() => {}, 700],
      [() => mv(cur, ...at()), 700],
      [() => { click(stage, ...at()); setOpen(pw, true); }, 2600],
      [() => click(stage, ...at()), 0],
      [() => setOpen(pw, false), 1500],
    ] };
  } };

  // tear-off: hold ~500 ms, a gold ring fills, the bar comes away, the strip closes the gap with a tiny bounce
  S['tear'] = { bg: 'desk', w: 1330, h: 480, still: 6, build(stage, scene) {
    const { strip } = cockpit(stage, { right: 150, bottom: 170, jobs: [J, J2] });
    const cur = pointer(stage, 560, 430), ring = h('div', 'ringw'); stage.append(ring);
    const sw = strip.firstElementChild, sj = sw.firstElementChild;
    const grab = () => { const r = rel(scene, sj); return [r.x + 150, r.y + 22]; };
    const tx = 110, ty = 170;
    let flying;
    return {
      arrows() {
        arrow(scene, { x: tx + 186, y: ty + 50 }, 'It lands here, folded', 'drag it anywhere, over your game too', 40, 110);
        arrow(scene, strip.lastElementChild, 'Hold half a second on a job', 'a gold ring fills, then it comes away', -330, 110);
      },
      steps: [
      [() => {}, 700],
      [() => mv(cur, ...grab()), 700],
      [() => { const [x, y] = grab(); mv(ring, x, y); ring.style.removeProperty('--p'); ring.classList.add('fill'); }, 260],
      [() => sj.classList.add('lift'), 300],
      [() => {
        ring.classList.remove('fill'); ring.style.opacity = 0;
        const r = rel(scene, sj), hgt = sw.offsetHeight;
        flying = sj; Object.assign(sj.style, { position: 'absolute', left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', zIndex: 6, margin: 0 });
        stage.append(sj); sw.style.height = hgt + 'px'; sw.style.overflow = 'hidden';
        sw.animate([{ height: hgt + 'px', marginBottom: '0px' }, { height: '0px', marginBottom: '-7px' }], { duration: 300, easing: 'cubic-bezier(.32,.72,0,1)', fill: 'forwards' });
        const next = strip.children[1]?.firstElementChild;
        if (next) setTimeout(() => next.animate([{ transform: 'none' }, { transform: 'translateY(-4px)' }, { transform: 'none' }], { duration: 220, easing: 'ease-out' }), 290);
        sj.style.transition = 'left .7s cubic-bezier(.32,.72,0,1),top .7s cubic-bezier(.32,.72,0,1),transform .7s';
        requestAnimationFrame(() => { mv(sj, tx, ty); sj.style.transform = 'rotate(-2deg)'; mv(cur, tx + 150, ty + 22); });
      }, 760],
      [() => {
        const pw = card({ x: tx, y: ty }); pw.style.opacity = 0; pw.style.transition = 'opacity .25s'; stage.append(pw);
        requestAnimationFrame(() => { pw.style.opacity = 1; flying.style.transition = 'opacity .25s'; flying.style.opacity = 0; });
      }, 300],
      [() => { mv(cur, 520, 410); }, 2300],
    ] };
  } };

  // back: drag it onto Aang; his bubble and the strip light up, a slot opens, it slides in
  S['back'] = { bg: 'desk', w: 1330, h: 480, still: 3, build(stage, scene) {
    const { ck, strip, aang } = cockpit(stage, { right: 150, bottom: 170, jobs: [J2] });
    const slot = h('div', 'slot', 'LET GO TO PUT IT BACK'); strip.prepend(slot);
    const pw = card({ x: 110, y: 170 }); stage.append(pw);
    const cur = pointer(stage, 420, 420);
    const grabOff = [150, 16];
    let target;
    return {
      arrows() {
        const sr = rel(scene, strip.querySelector('.sj')); arrow(scene, { x: sr.x - 6, y: sr.y - 34 }, 'His bubble lights up, a space opens', 'let go and it slides in', -250, -110);
        const ar = rel(scene, aang); arrow(scene, { x: ar.cx, y: ar.y + 78 }, 'Aang lights up too', '', 30, -150);
      },
      steps: [
      [() => {}, 700],
      [() => mv(cur, 110 + grabOff[0], 170 + grabOff[1]), 700],
      [() => {
        const sh = strip.querySelector('.sj').offsetHeight;
        pw.style.transition = 'left 1.1s cubic-bezier(.45,.1,.25,1),top 1.1s cubic-bezier(.45,.1,.25,1),transform .3s';
        pw.style.transform = 'rotate(-2deg) scale(.98)';
        cur.classList.add('slow'); cur.style.transitionDuration = '1.1s'; cur.style.transitionTimingFunction = 'cubic-bezier(.45,.1,.25,1)';
        // where the slot will be once open
        const sr = rel(scene, strip);
        target = [sr.x + 10, sr.y - 2];
        mv(pw, target[0] - 400, target[1] + 40); mv(cur, target[0] - 400 + grabOff[0], target[1] + 40 + grabOff[1]);
        setTimeout(() => { ck.classList.add('lit'); aang.classList.add('lit'); slot.classList.add('on'); slot.style.height = sh + 'px'; }, 550);
      }, 1500],
      [() => {}, 700],
      [() => {
        const r = rel(scene, slot);
        pw.style.transition = 'left .28s cubic-bezier(.32,.72,0,1),top .28s cubic-bezier(.32,.72,0,1),opacity .28s,transform .28s';
        mv(pw, r.x, r.y); pw.style.opacity = 0; pw.style.transform = 'none';
        cur.style.transitionDuration = '.6s'; mv(cur, 560, 420);
        const sw = h('div', 'sw'); const sj = stripJob(J); sw.append(sj);
        setTimeout(() => { slot.replaceWith(sw); sj.animate([{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'translateY(2px)', offset: 0.75 }, { opacity: 1, transform: 'none' }], { duration: 340, easing: 'cubic-bezier(.32,.72,0,1)' }); ck.classList.remove('lit'); aang.classList.remove('lit'); }, 200);
      }, 2400],
    ] };
  } };

  // states
  S['st-work'] = { bg: 'desk', w: 430, h: 250, build(stage, scene) {
    const pw = card({ x: 28, y: 110, pinned: true }); stage.append(pw);
    return { arrows() { arrow(scene, pw.querySelector('.pbw canvas'), 'The current piece glows softly', '', -30, -76); arrow(scene, pw.querySelector('.pin'), 'Pinned', '', -10, 64); } };
  } };
  S['st-paused'] = { bg: 'desk', w: 430, h: 250, build(stage, scene) {
    const pw = card({ x: 28, y: 110, state: 'paused' }); stage.append(pw);
    return { arrows() { arrow(scene, pw.querySelector('.chip'), 'Grey chip, the bar stops glowing', '', -150, -70); } };
  } };
  S['st-done'] = { bg: 'desk', w: 430, h: 250, still: 0, build(stage, scene) {
    const pw = card({ x: 28, y: 40, state: 'done' }); stage.append(pw);
    const cur = pointer(stage, 330, 200);
    const nice = () => { const r = rel(scene, pw.querySelector('.nice')); return [r.cx, r.cy]; };
    return {
      arrows() { arrow(scene, pw.querySelector('.nice'), '"Nice" closes it', 'it shrinks and fades away', 120, 82); },
      steps: [
        [() => {}, 1400],
        [() => mv(cur, ...nice()), 800],
        [() => { click(stage, ...nice()); pw.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.86)' }], { duration: 340, easing: 'cubic-bezier(.32,.72,0,1)', fill: 'forwards' }); pw.style.transformOrigin = '50% 50%'; }, 600],
        [() => mv(cur, 330, 200), 1200],
      ] };
  } };
  S['st-needs'] = { bg: 'desk', w: 1330, h: 380, still: 3, build(stage, scene) {
    const pw = card({ x: 70, y: 150, state: 'needs' }); stage.append(pw);
    const aang = h('img', 'aang'); aang.src = AANG + 'idle_0.png'; aang.alt = ''; Object.assign(aang.style, { right: '10px', bottom: '10px' }); stage.append(aang);
    const ab = h('div', 'ab2 hide', `<div class="kick"><img src="${ICON}" alt="">CLAUDE &middot; WAYMARK NEEDS YOU</div><div class="q">Which layout should the map use?</div><div class="opt">Full-screen map</div><div class="opt">Split: map and list</div><div class="opt">List first</div>`);
    Object.assign(ab.style, { right: '190px', top: '30px' }); stage.append(ab);
    const cur = pointer(stage, 560, 330);
    const chip = () => { const r = rel(scene, pw.querySelector('.chip')); return [r.cx, r.cy]; };
    return {
      arrows() { arrow(scene, pw.querySelector('.chip'), 'A small blue chip', 'click it', 10, 90); arrow(scene, { x: 1330 - 190 - 330 - 4, y: 120 }, 'Aang\'s bubble opens with the question', 'you answer there, like always', -330, 0); },
      steps: [
        [() => {}, 900],
        [() => mv(cur, ...chip()), 800],
        [() => click(stage, ...chip()), 250],
        [() => { ab.classList.remove('hide'); }, 2800],
      ] };
  } };

  // see-through at 100% and 55% over a busy game
  for (const [id, op] of [['see-100', 1], ['see-55', 0.55]]) {
    S[id] = { bg: 'game', w: 656, h: 380, build(stage, scene) {
      const pw = card({ x: 142, y: 46, open: true, op }); stage.append(pw);
      tag(scene, op === 1 ? '100% · SOLID' : '55% · SEE-THROUGH', 14, 330);
    } };
  }

  // the four ways
  const OX = 110, OY = 128;
  S['opA'] = { bg: 'game', w: 660, h: 300, still: 4, build(stage, scene) {
    const pw = card({ x: OX, y: OY }); stage.append(pw);
    const cur = pointer(stage, 600, 260), wh = h('div', 'wheel'); stage.append(wh);
    const over = () => { const r = rel(scene, pw.querySelector('.pbw')); return [r.cx, r.cy + 4]; };
    const wheel = (dir) => { wh.innerHTML = ''; wh.append(wheelIcon(dir)); const [x, y] = over(); mv(wh, x + 30, y + 16); wh.classList.add('on'); };
    return {
      arrows() { arrow(scene, { x: OX + 372 - 30, y: OY - 30 }, 'Scroll the wheel over it', 'a little number shows for a moment', -190, -62); },
      steps: [
        [() => {}, 700],
        [() => mv(cur, ...over()), 700],
        [() => { wheel('down'); setOp(pw, 0.85); }, 380],
        [() => setOp(pw, 0.7), 380],
        [() => setOp(pw, 0.55), 900],
        [() => { wh.classList.remove('on'); setOp(pw, 0.55, false); }, 1500],
        [() => { wheel('up'); setOp(pw, 0.7); }, 380],
        [() => setOp(pw, 0.85), 380],
        [() => setOp(pw, 1), 900],
        [() => { wh.classList.remove('on'); setOp(pw, 1, false); mv(cur, 600, 260); }, 900],
      ] };
  } };
  S['opB'] = { bg: 'game', w: 660, h: 300, still: 4, build(stage, scene) {
    const pw = card({ x: OX, y: OY }); stage.append(pw);
    const vs = h('div', 'vs'); pw.append(vs);
    const draw = (op) => { vs.innerHTML = ''; const s = vslider(op); vs.append(s.cv); return s.knobY; };
    draw(1);
    const cur = pointer(stage, 580, 270);
    const knob = (op) => { const ky = draw(op); const r = rel(scene, vs); return [r.x + 13, r.y + 6 + ky - 4]; };
    return {
      arrows() { const r = rel(scene, vs); arrow(scene, { x: r.x + r.w, y: r.y + 60 }, 'A tiny slider, only while', 'your mouse is on it', 40, 120); },
      steps: [
        [() => {}, 700],
        [() => { const r = rel(scene, pw.querySelector('.pbw')); mv(cur, r.cx, r.cy); }, 600],
        [() => vs.classList.add('on'), 500],
        [() => mv(cur, ...knob(1)), 600],
        [async () => {
          cur.classList.add('snap');
          for (let i = 1; i <= 12; i++) { const op = 1 - 0.45 * (i / 12); setOp(pw, op); mv(cur, ...knob(op)); await sleep(45); }
          cur.classList.remove('snap');
        }, 1000],
        [() => { setOp(pw, 0.55, false); mv(cur, 580, 270); }, 500],
        [() => vs.classList.remove('on'), 1600],
      ] };
  } };
  S['opC'] = { bg: 'game', w: 660, h: 300, still: 3, build(stage, scene) {
    const pw = card({ x: OX, y: OY - 40 }); stage.append(pw);
    const menu = h('div', 'menu', `<div class="mt">SEE-THROUGH</div>${[['100%', 'solid'], ['80%', ''], ['60%', ''], ['40%', '']].map(([v, s], i) => `<div class="mi${i === 0 ? ' sel' : ''}" data-v="${v}"><i></i>${v}${s ? ` <span style="color:#a9a39a;font-weight:500">${s}</span>` : ''}</div>`).join('')}`);
    stage.append(menu);
    const cur = pointer(stage, 580, 270);
    let mx, my;
    return {
      arrows() { arrow(scene, { x: OX + 200 + 150, y: OY - 40 + 60 + 40 }, 'Right-click: a small menu', 'pick how see-through', 150, 0); },
      steps: [
        [() => {}, 700],
        [() => { const r = rel(scene, pw.querySelector('.pbw')); mx = r.cx - 10; my = r.cy; mv(cur, mx, my); }, 600],
        [() => { click(stage, mx, my); mv(menu, mx + 4, my + 6); menu.classList.add('on'); }, 600],
        [() => { const it = menu.querySelector('[data-v="60%"]'); it.classList.add('hov'); const r = rel(scene, it); mv(cur, r.x + 60, r.cy); }, 900],
        [() => { const it = menu.querySelector('[data-v="60%"]'); click(stage, ...[rel(scene, it).x + 60, rel(scene, it).cy]); menu.classList.remove('on'); setOp(pw, 0.6); }, 1000],
        [() => { setOp(pw, 0.6, false); mv(cur, 580, 270); }, 1500],
      ] };
  } };
  S['opD'] = { bg: 'game', w: 660, h: 300, still: 2, build(stage, scene) {
    const pw = card({ x: OX, y: OY }); stage.append(pw);
    const rp = h('i', 'ripple'); stage.append(rp);
    const cur = pointer(stage, 580, 270);
    const pinAt = () => { const r = rel(scene, pw.querySelector('.pin')); return [r.cx, r.cy]; };
    const dbl = async (op) => { const [x, y] = pinAt(); mv(rp, x, y); for (let i = 0; i < 2; i++) { rp.classList.remove('go'); void rp.offsetWidth; rp.classList.add('go'); await sleep(170); } setOp(pw, op); };
    return {
      arrows() { const [x, y] = pinAt(); arrow(scene, { x: x + 14, y: y + 4 }, 'Double-click the pin', '100 → 75 → 50 → back', 130, 60); },
      steps: [
        [() => {}, 700],
        [() => { const [x, y] = pinAt(); mv(cur, x - 2, y + 2); }, 700],
        [() => dbl(0.75), 1300],
        [() => dbl(0.5), 1300],
        [() => dbl(1), 1100],
        [() => { setOp(pw, 1, false); mv(cur, 580, 270); }, 900],
      ] };
  } };

  // mouse over it: keep the fade (E) or go solid (F)
  for (const [id, op, word] of [['hovE', 0.55, 'Stays 55% under your mouse'], ['hovF', 1, 'Jumps to solid under your mouse']]) {
    S[id] = { bg: 'game', w: 655, h: 230, build(stage, scene) {
      const pw = card({ x: 90, y: 100, op }); stage.append(pw);
      const r = rel(scene, pw.querySelector('.pbw')); pointer(stage, r.cx, r.cy + 4);
      return { arrows() { arrow(scene, pw.querySelector('.pj'), word, '', 60, -76); } };
    } };
  }

  // ------------------------------------------------------------ close-ups (3x, the one thing that differs)
  const Z = {
    opA(zin) { const pw = card({ x: 10, y: 60 }); setOp(pw, 0.7); zin.append(pw); const w = h('div', 'wheel on'); w.append(wheelIcon('down', 2)); mv(w, 255, 74); zin.append(w); return [pw.querySelector('.ro'), 2.6, 10, 18]; },
    opB(zin) { const pw = card({ x: 10, y: 40, op: 0.55 }); const vs = h('div', 'vs on'); vs.append(vslider(0.55).cv); pw.append(vs); zin.append(pw); return [vs, 2.4, -14, 0]; },
    opC(zin) { const m = h('div', 'menu on', `<div class="mt">SEE-THROUGH</div><div class="mi sel"><i></i>100% <span style="color:#a9a39a;font-weight:500">solid</span></div><div class="mi"><i></i>80%</div><div class="mi hov"><i></i>60%</div><div class="mi"><i></i>40%</div>`); mv(m, 10, 10); zin.append(m); return [m, 1.6, 0, 6]; },
    opD(zin) { const pw = card({ x: 10, y: 60 }); setOp(pw, 0.75); zin.append(pw); const r = h('i', 'ripple'); Object.assign(r.style, { opacity: 0.9, transform: 'scale(.8)' }); zin.append(r); requestAnimationFrame(() => { const p = pw.querySelector('.pin'); mv(r, p.offsetLeft + 10 + 13, p.offsetTop + 60 + 14); }); return [pw.querySelector('.pin'), 2.8, -4, -6]; },
  };
  async function zoom(el) {
    const id = el.dataset.z, zin = h('div', 'zin'); Object.assign(zin.style, { width: '500px', height: '260px' });
    el.append(h('span', 'zl', 'CLOSE-UP'), zin);
    const [focus, sc, ox, oy] = Z[id](zin);
    await frame(); await frame();
    const zr = zin.getBoundingClientRect(), fr2 = focus.getBoundingClientRect();
    const fx = fr2.left - zr.left + fr2.width / 2 + ox, fy = fr2.top - zr.top + fr2.height / 2 + oy;
    zin.style.transform = `translate(${140 - fx * sc}px,${150 - fy * sc}px) scale(${sc})`;
  }

  // ------------------------------------------------------------ run
  async function mount(scene) {
    const def = S[scene.dataset.s]; if (!def) return;
    scene.style.width = def.w + 'px'; scene.style.height = def.h + 'px';
    if (def.bg === 'game') game(scene, def.w, def.h); else desk(scene);
    const stage = h('div', ''); Object.assign(stage.style, { position: 'absolute', inset: 0 }); scene.append(stage);
    let api = def.build(stage, scene) || {};
    await frame(); await frame();
    if (document.fonts) await document.fonts.ready;
    api.arrows?.();
    if (!api.steps) return;
    if (STILL) { for (let i = 0; i <= def.still; i++) { await api.steps[i][0](); await sleep(i === def.still ? 0 : 60); } return; }
    for (;;) {
      for (const [fn, ms] of api.steps) { await fn(); await sleep(ms); }
      stage.innerHTML = ''; api = def.build(stage, scene) || {}; await frame();
    }
  }
  window.addEventListener('load', () => {
    document.querySelectorAll('.scene[data-s]').forEach((s) => mount(s).catch((e) => console.error('scene', s.dataset.s, e)));
    document.querySelectorAll('.zoom[data-z]').forEach((z) => zoom(z).catch((e) => console.error('zoom', z.dataset.z, e)));
  });
})();
