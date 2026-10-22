// Sheet 66 stage: one scene per picture (?scene=a-hover | a-jump | b-hover | b-jump). Sets window.__ready to
// { crop } for sheet-63/shots.mjs. Windows 11's own pieces are drawn here; the windows inside the hover row are the
// product's real renders (p-*.png, samara-win.png).
(() => {
  const scene = new URLSearchParams(location.search).get('scene') || 'a-hover';
  const ART = '../../../src/Shell/pages/art/';
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const body = document.body;

  // 16 px glyphs on a 24 grid, pixelarticons style (the product's own icon set), white, for the thumbnail buttons and the list
  const P = {
    prev: 'M5 5h2v14H5zm12 0h2v14h-2zm-2 2h2v10h-2zm-2 2h2v6h-2zm-2 2h2v2h-2z',
    next: 'M17 5h2v14h-2zM5 5h2v14H5zm2 2h2v10H7zm2 2h2v6H9zm2 2h2v2h-2z',
    play: 'M7 4h2v16H7zm2 2h2v12H9zm2 2h2v8h-2zm2 2h2v4h-2z',
    pause: 'M6 5h4v14H6zm8 0h4v14h-4z',
    stop: 'M6 6h12v12H6z',
    plus: 'M11 5h2v14h-2zM5 11h14v2H5z',
    pin: 'M8 3h8v2h-1v6h2v2h-4v8h-2v-8H7v-2h2V5H8z',
    open: 'M4 4h8v2H6v12h12v-6h2v8H4zm10 0h6v6h-2V7.5h-1v1h-1v1h-1v1h-1v1h-1v1h-1v-2h1v-1h1v-1h1v-1h1V6h-2z',
    show: 'M3 7h12v2H3zm0 2h2v10H3zm10 0h2v10h-2zM3 17h12v2H3zm4-14h14v2H7zm12 2h2v10h-2zm-2 8h2v2h-2zM7 5h2v2H7z',
    hide: 'M3 7h12v2H3zm0 2h2v10H3zm10 0h2v10h-2zM3 17h12v2H3zm4-14h14v2H7zm12 2h2v10h-2zm-2 8h2v2h-2zM7 5h2v2H7zM2 3h2v2H2zm2 2h2v2H4zm2 2h2v2H6zm2 2h2v2H8zm2 2h2v2h-2zm2 2h2v2h-2zm2 2h2v2h-2zm2 2h2v2h-2zm2 2h2v2h-2z',
    tab: 'M3 6h8v2H3zm0 2h2v12H3zm16 2h2v10h-2zM3 18h18v2H3zm8-10h10v2H11zM11 6h2v2h-2z',
    window: 'M3 4h18v2H3zm0 2h2v14H3zm16 0h2v14h-2zM3 18h18v2H3zM5 8h14v2H5z',
    undo: 'M9 4h2v2H9zM7 6h2v2H7zM5 8h2v2H5zm2 2h2v2H7zm2 2h2v2H9zm0-4h8v2H9zm8 2h2v6h-2zm-6 6h6v2h-6z',
    grid: 'M3 3h8v8H3zm2 2v4h4V5zm8-2h8v8h-8zm2 2v4h4V5zM3 13h8v8H3zm2 2v4h4v-4zm8-2h8v8h-8zm2 2v4h4v-4z',
    gear: 'M10 2h4v3h-4zm0 17h4v3h-4zM2 10h3v4H2zm17 0h3v4h-3zM7 5h10v2H7zm0 12h10v2H7zM5 7h2v10H5zm12 0h2v10h-2zm-7 3h4v4h-4z',
    close: 'M5 5h2v2H5zm2 2h2v2H7zm2 2h2v2H9zm2 2h2v2h-2zm2 2h2v2h-2zm2 2h2v2h-2zm2 2h2v2h-2zM17 5h2v2h-2zm-2 2h2v2h-2zm-2 2h2v2h-2zm-4 4h2v2H9zm-2 2h2v2H7zm-2 2h2v2H5z',
    unpin: 'M8 3h8v2h-1v6h2v2h-4v8h-2v-8H7v-2h2V5H8zM3 3h2v2H3zm2 2h2v2H5zm12 12h2v2h-2zm2 2h2v2h-2z',
  };
  const svg = (k) => `<svg viewBox="0 0 24 24"><path d="${P[k]}"/></svg>`;
  const pxi = (name) => `<svg viewBox="0 0 24 24" data-src="${ART}pixelarticons/${name}.svg"></svg>`;
  const img = (src, cls = '') => `<img src="${src}" class="${cls}" alt="">`;

  // ---------------------------------------------------------------- desk + taskbar
  body.append(h('<div class="desk"></div>'), h('<div class="behind"></div>'));
  const tb = h('<div class="tb"><div class="mid"></div><div class="tray"><span class="glyph">&#xE70E;</span><span class="glyph">&#xE701;</span><span class="glyph">&#xE767;</span><div class="time">9:41 PM<br>10/22/2026</div></div></div>');
  body.append(tb);
  const mid = tb.querySelector('.mid');
  const a = scene.startsWith('a');
  const BUT = [
    { k: 'start', html: '<div class="win-logo"><i></i><i></i><i></i><i></i></div>' },
    { k: 'search', html: '<span class="glyph">&#xE721;</span>' },
    { k: 'tasks', html: '<span class="glyph">&#xE7C4;</span>' },
    { k: 'files', html: '<div class="folder"></div>', run: true },
    { k: 'aang', html: img(ART + 'aang-face.png'), run: true },
    { k: 'samara', html: img('samara-48.png'), run: true, on: true },
    { k: 'term', html: '<span class="glyph">&#xE756;</span>', run: true },
  ];
  const btn = {};
  for (const b of BUT) {
    const el = h(`<div class="btn ${b.on ? 'on' : ''}">${b.html}${b.run ? '<div class="run"></div>' : ''}</div>`);
    mid.append(el); btn[b.k] = el;
  }
  const sam = btn.samara;
  sam.classList.add(scene.endsWith('jump') ? 'press' : 'hov');
  // The Claude job's progress: Windows draws it in place of the little running line. A: the job's own window sets it
  // (it is in Samara's group); B: Samara's window sets it for him.
  sam.querySelector('.run').remove();
  sam.append(h('<div class="prog"><i style="width:50%"></i></div>'));
  // B only: the "needs you" mark on Samara's button (Windows' overlay icon, 16 px): Claude's icon.
  if (scene === 'b-hover') sam.append(h(`<img class="ov" src="${ART}claude-icon.png" alt="">`));

  const centerOf = (el) => { const r = el.getBoundingClientRect(); return r.left + r.width / 2; };

  // ---------------------------------------------------------------- the hover row
  const card = (o) => {
    const c = h(`<div class="card ${o.hov ? 'hov' : ''}">
      <div class="tt">${img(o.icon)}<span>${o.title}</span>${o.hov ? '<b class="x">&#xE8BB;</b>' : ''}</div>
      <div class="pv">${o.pv}</div>
      ${o.bar ? `<div class="bar">${o.bar.map(([k, cls]) => `<b class="${cls || ''}" data-k="${k}">${svg(k)}</b>`).join('')}</div>` : ''}
    </div>`);
    return c;
  };
  const SAMARA = { icon: 'samara-16.png', title: '59 · Spotify mini player - Samara', pv: img('samara-win.png') };
  const VIDEO = { icon: 'samara-16.png', title: 'Lofi beats to raid to', pv: `<div class="vid">${img('scene-skate.png')}</div>`, bar: [['play'], ['pin']] };
  const MUSIC = { icon: 'samara-16.png', title: 'Maria También · Khruangbin', pv: img('p-player.png'), bar: [['prev'], ['pause'], ['next']] };
  const JOB = { icon: 'samara-16.png', title: 'Waymark · 50%', pv: img('p-job.png'), bar: [['pause'], ['open']] };
  const NOTE = { icon: 'samara-16.png', title: 'Raid night', pv: img('p-note.png') };
  const TIMER = { icon: 'samara-16.png', title: 'Flask · 6:52', pv: img('p-timer.png', 'px'), bar: [['pause'], ['plus'], ['stop']] };

  let crop = { x: 0, y: 0, w: 1200, h: 660 };
  let pointer = null;
  if (scene === 'a-hover' || scene === 'b-hover') {
    const fly = h('<div class="fly"></div>');
    const list = scene === 'a-hover'
      ? [SAMARA, VIDEO, { ...MUSIC, hov: true }, JOB, NOTE, TIMER]
      // B: only Samara's own window; the music keys ride on its picture
      : [{ ...SAMARA, hov: true, bar: [['prev'], ['pause'], ['next']] }];
    for (const o of list) fly.append(card(o));
    body.append(fly);
    const w = fly.getBoundingClientRect().width;
    fly.style.left = Math.max(8, Math.min(1200 - 8 - w, centerOf(sam) - w / 2)) + 'px';
    // the hovered key and its tooltip
    const hovCard = fly.querySelector('.card.hov');
    const key = hovCard.querySelector('.bar b[data-k="pause"]');
    key.classList.add('hov');
    const kr = key.getBoundingClientRect();
    const tip = h('<div class="tip">Pause</div>'); body.append(tip);
    tip.style.left = (kr.left + 12) + 'px'; tip.style.top = (kr.bottom + 6) + 'px';
    pointer = { x: kr.left + 15, y: kr.top + 12 };
    if (scene === 'b-hover') {
      const fr = fly.getBoundingClientRect();
      crop = { x: Math.round(fr.left - 330), y: Math.round(fr.top - 60), w: 900, h: Math.round(660 - fr.top + 60) };
    }
  }

  // ---------------------------------------------------------------- the right-click list
  const row = (icon, text, extra = '', hov = false) => `<div class="it ${hov ? 'hov' : ''}"><div class="i">${icon}</div><span>${text}</span>${extra}</div>`;
  const TASKS = `<h4>Tasks</h4>
    ${row(svg('tab'), 'New tab')}${row(svg('window'), 'New window')}${row(svg('undo'), 'Reopen closed tab')}
    ${row(svg('grid'), 'Mockups')}${row(svg('gear'), 'Settings')}`;
  const FOOT = `<div class="foot">${row(img('samara-16.png'), 'Samara')}${row(svg('unpin'), 'Unpin from taskbar')}${row(svg('close'), a ? 'Close all windows' : 'Close window')}</div>`;
  if (scene === 'a-jump' || scene === 'b-jump') {
    body.classList.add('plain');
    const PEOPLE = a
      ? `<h4>Pop-outs</h4>
         ${row(svg('show'), 'Show all pop-outs')}
         ${row(svg('hide'), 'Hide all pop-outs')}
         ${row(img(ART + 'aang-face.png'), 'Gather them by Aang', '', true)}
         ${row(pxi('sticky-note'), 'New note')}
         ${row(pxi('hourglass'), 'Timer')}
         ${row(pxi('music'), 'Music player')}`
      : `<h4>Pop-outs</h4>
         ${row(img('samara-16.png'), 'Lofi beats to raid to')}
         ${row(pxi('music'), 'Maria También · Khruangbin', '', true)}
         ${row(img(ART + 'claude-icon.png'), 'Waymark', '<em>50%</em>')}
         ${row(pxi('sticky-note'), 'Raid night')}
         ${row(pxi('hourglass'), 'Flask')}
         ${row(svg('show'), 'Show all')}${row(svg('hide'), 'Hide all')}${row(img(ART + 'aang-face.png'), 'Gather them by Aang')}
         <h4>New</h4>
         ${row(pxi('sticky-note'), 'Note')}${row(pxi('hourglass'), 'Timer')}${row(pxi('music'), 'Music player')}`;
    const jl = h(`<div class="jl">${PEOPLE}${TASKS}${FOOT}</div>`);
    body.append(jl);
    jl.style.left = Math.round(centerOf(sam) - 40) + 'px';
    const hv = jl.querySelector('.it.hov').getBoundingClientRect();
    pointer = { x: hv.left + 120, y: hv.top + 18 };
    const jr = jl.getBoundingClientRect();
    // a taller body for the longer list
    if (jr.top < 10) { const need = 10 - jr.top; document.body.style.height = (660 + need) + 'px'; }
    const r2 = jl.getBoundingClientRect();
    crop = { x: Math.round(r2.left - 300), y: Math.max(0, Math.round(r2.top - 24)), w: 860, h: Math.round(document.body.getBoundingClientRect().height - Math.max(0, r2.top - 24)) };
  }

  // ---------------------------------------------------------------- the pointer (Windows' arrow)
  if (pointer) {
    const c = document.createElement('canvas'); c.width = 11; c.height = 16; c.className = 'ptr';
    c.style.left = pointer.x + 'px'; c.style.top = pointer.y + 'px'; body.append(c);
    const g = c.getContext('2d');
    ['O..........', 'OO.........', 'OWO........', 'OWWO.......', 'OWWWO......', 'OWWWWO.....', 'OWWWWWO....', 'OWWWWWWO...', 'OWWWWWWWO..', 'OWWWWWOOOO.', 'OWWOWWO....', 'OWO.OWWO...', 'OO..OWWO...', 'O....OWWO..', '.....OWWO..', '......OO...']
      .forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') { g.fillStyle = ch === 'O' ? '#000' : '#fff'; g.fillRect(x, y, 1, 1); } }));
  }

  // pixelarticons, inlined (white)
  const inl = Promise.all([...document.querySelectorAll('svg[data-src]')].map(async (s) => {
    const t = await (await fetch(s.dataset.src)).text();
    const d = [...t.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
    s.innerHTML = d.map((x) => `<path d="${x}"/>`).join('');
  }));
  window.__ready = (async () => {
    await inl;
    await Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))));
    await document.fonts.ready;
    // a body grown for the list is cropped from the bottom up
    return { crop };
  })();
})();
