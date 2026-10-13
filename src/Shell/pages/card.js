// 9.D D3: draw one card from the JSON in the address's #fragment, then say its size in the title, which is how
// cardrender.ts knows it is ready. Everything from the data goes in as text, never as markup: a job title comes from
// a website.
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
const str = (v, n = 300) => String(v ?? '').slice(0, n);

function bars(steps, at, done) {
  const b = el('div', 'bars');
  const n = Math.max(1, Math.min(12, Number(steps) || 1));
  for (let i = 1; i <= n; i++) b.append(el('i', done || i < at ? 'done' : i === at ? 'now' : ''));
  return b;
}

// Sheet 21's little pixel icons, drawn from fixed shapes (never from data).
const ICONS = {
  cal: [['#120A05', 'M2 3h12v11H2z'], ['#F6E6C6', 'M3 6h10v7H3z'], ['#C95E28', 'M3 4h10v2H3z'], ['#120A05', 'M4 1h1v3H4zM11 1h1v3h-1zM5 8h2v2H5zM9 8h2v2H9z']],
  pin: [['#120A05', 'M5 1h6v1h1v1h1v5h-1v2h-1v2h-1v2H9v1H7v-1H6v-2H5v-2H4V8H3V3h1V2h1z'], ['#DA373C', 'M5 2h6v1h1v5h-1v2h-1v2H9v1H7v-1H6v-2H5V8H4V3h1z'], ['#F6E6C6', 'M7 4h2v1h1v2H9v1H7V7H6V5h1z']],
  video: [['#120A05', 'M1 3h14v10H1z'], ['#DA373C', 'M2 4h12v8H2z'], ['#fff', 'M6 6h1v1h1v1h1v1H8v1H7v1H6z']],
  call: [['#120A05', 'M1 4h10v8H1zM11 6h1V5h1V4h2v8h-2v-1h-1v-1h-1z'], ['#78E696', 'M2 5h8v6H2z']],
  file: [['#120A05', 'M3 1h7v1h1v1h1v1h1v11H3z'], ['#F6E6C6', 'M4 2h6v3h3v9H4z'], ['#C95E28', 'M5 8h6v1H5zM5 10h6v1H5zM5 12h4v1H5z']],
  ask: [['#120A05', 'M5 1h6v1h1v1h1v4h-1v1h-1v1h-1v2H6V8h1V7h1V6h1V5h1V3H6v1H5v1H3V3h1V2h1zM6 12h4v3H6z'], ['#FFC43C', 'M6 2h5v1h1v4h-1v1h-1v1H9v1H7V8h1V7h1V6h1V5h1V3h-1V2z']],
};
function icon(kind) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('class', 'ico');
  for (const [fill, d] of ICONS[kind] ?? ICONS.ask) { const p = document.createElementNS(ns, 'path'); p.setAttribute('fill', fill); p.setAttribute('d', d); svg.append(p); }
  return svg;
}

const DRAW = {
  // A Claude job, live (sheet 15 board 2): plaque, headline, the step it is on, a bar per step, Aang.
  job(d) {
    const card = el('div', 'parch');
    const row = el('div', 'row'), col = el('div', 'col');
    col.append(el('div', 'plaque' + (d.done ? ' done' : ''), d.done ? 'DONE' : str(d.plaque || 'CLAUDE JOB', 30)));
    col.append(el('div', 'head', str(d.headline, 120)));
    if (d.sub) col.append(el('div', 'sub', str(d.sub, 160)));
    if (d.steps) col.append(bars(d.steps, Number(d.at) || 1, !!d.done));
    const img = el('img', 'sprite'); img.src = 'art/aang-face.png'; img.alt = '';
    row.append(col, img);
    card.append(row, el('div', 'drawn', 'DRAWN BY AANG'));
    return card;
  },
  // Something waiting on him (sheet 15 board 2, the second card).
  needs(d) {
    const card = el('div', 'parch'), col = el('div', 'col');
    col.style.gap = '6px';
    col.append(el('div', 'plaque warn', 'NEEDS YOU'), el('div', 'head', str(d.title, 140)));
    if (d.text) col.append(el('div', 'text', str(d.text, 400)));
    card.append(col, el('div', 'drawn', 'DRAWN BY AANG'));
    return card;
  },
  // A video he dropped in #capture (sheet 15 board 3): what it is, what it shows, what it could be useful for.
  watched(d) {
    const card = el('div', 'parch'), col = el('div', 'col');
    const top = el('div', 'row'); top.style.alignItems = 'center'; top.style.gap = '6px';
    top.append(el('div', 'plaque', 'WATCHED IT'), el('div', 'meta', str(d.meta, 60)));
    col.append(top, el('div', 'head', str(d.title, 90)));
    if (d.kind) col.append(el('div', 'kind', 'What it is: ' + str(d.kind, 30)));
    col.append(el('div', 'text', str(d.shows, 300)), el('div', 'rule'), el('div', 'lbl', 'USEFUL FOR'));
    const list = Array.isArray(d.useful) ? d.useful.slice(0, 3) : [];
    list.forEach((u, i) => {
      const row = el('div', 'use' + (i === d.best ? ' best' : ''));
      if (i === d.best) row.append(el('span', 'tag', 'BEST GUESS'));
      row.append(el('span', null, `${str(u.who, 20)}: ${str(u.what, 60)}`));
      col.append(row);
    });
    card.append(col, el('div', 'drawn', 'DRAWN BY AANG'));
    return card;
  },
  // "Might be high quota" (sheet 21 board 4): what it is, the estimate in words, and his week as twenty cells: used,
  // this job's likely share, the rest. Asked every time before a big job; the buttons are Discord's own.
  quota(d) {
    const card = el('div', 'parch'), col = el('div', 'col');
    const pct = (n) => Math.max(1, Math.round(Number(n) * 100));
    col.append(el('div', 'plaque warn', 'MIGHT BE HIGH QUOTA'), el('div', 'head', str(d.what, 120).replace(/^./, (c) => c.toUpperCase())));
    col.append(el('div', 'text', `About ${pct(d.low)} to ${pct(d.high)}% of your week.`));
    if (typeof d.week === 'number') {
      col.append(el('div', 'sec', 'YOUR WEEK'));
      const m = el('div', 'meter');
      const used = Math.round(Math.max(0, Math.min(1, d.week)) * 20);
      const est = Math.max(1, Math.round(Math.max(0, Number(d.high) || 0) * 20));
      for (let i = 0; i < 20; i++) m.append(el('i', i < used ? 'on' : i < used + est ? 'est' : ''));
      const sc = el('div', 'scale');
      const day = d.resetsAt ? new Date(Number(d.resetsAt) * (Number(d.resetsAt) < 1e12 ? 1000 : 1)).toLocaleDateString('en-CA', { weekday: 'short' }).toUpperCase() : '';
      sc.append(el('span', null, `USED ${Math.round(d.week * 100)}%`), el('span', null, 'THIS JOB'), el('span', null, day ? `RESETS ${day}` : ''));
      col.append(m, sc);
    }
    card.append(col, el('div', 'drawn', 'DRAWN BY AANG'));
    return card;
  },
  // The morning brief (sheet 21 board 1): job hunt, waiting on you, today, other email with its subject.
  brief(d) {
    const card = el('div', 'parch'), col = el('div', 'col');
    const top = el('div', 'row'); top.style.alignItems = 'center'; top.style.gap = '8px';
    top.append(el('div', 'plaque', 'MORNING BRIEF'), el('div', 'meta', str(d.day, 40)));
    col.append(top);
    if (d.weather) { const w = el('div', 'weather'); w.append(el('i'), el('span', null, str(d.weather, 80))); col.append(w); }
    const list = (x) => (Array.isArray(x) ? x : []);
    const tagged = (title, rows, cls) => {
      if (!rows.length) return;
      col.append(el('div', 'sec', title));
      for (const r of rows.slice(0, 5)) {
        const li = el('div', 'li'), body = el('span');
        body.append(el('span', 'w', str(r.who, 90)));
        if (r.what) body.append(' ', el('span', 'm', str(r.what, 90)));
        li.append(el('span', 't' + (cls ? ' ' + cls : ''), str(r.tag, 10)), body);
        col.append(li);
      }
    };
    tagged('JOB HUNT', list(d.job), '');
    tagged('WAITING ON YOU', list(d.waiting), 'wait');
    const today = list(d.today);
    if (today.length) {
      col.append(el('div', 'sec', 'TODAY'));
      for (const e of today.slice(0, 6)) {
        const li = el('div', 'li'), body = el('span');
        body.append(el('span', 'w', str(e.title, 70)));
        if (e.where) body.append(' ', el('span', 'm', str(e.where, 50)));
        li.append(el('span', 'tm', str(e.tm, 12)), body);
        col.append(li);
      }
    }
    const other = list(d.other);
    if (other.length) {
      col.append(el('div', 'sec', 'OTHER EMAIL'));
      for (const o of other.slice(0, 4)) { const li = el('div', 'li'); li.append(el('span', 'w', str(o.who, 40)), el('span', 'm', str(o.what, 90))); col.append(li); }
      if (Number(d.more) > 0) { const li = el('div', 'li'); li.append(el('span', 'm', `+ ${Number(d.more)} more`)); col.append(li); }
    }
    if (!list(d.job).length && !list(d.waiting).length && !today.length && !other.length) col.append(el('div', 'text', 'Nothing new this morning.'));
    card.append(col, el('div', 'drawn', 'DRAWN BY AANG'));
    return card;
  },
  // His inbox (sheet 21 board 2b): who and what, JOB where his hunt knows them, unread count on the plaque line.
  inbox(d) {
    const card = el('div', 'parch'), col = el('div', 'col');
    const top = el('div', 'row'); top.style.alignItems = 'center'; top.style.gap = '8px';
    const unread = Number(d.unread) || 0;
    top.append(el('div', 'plaque', 'INBOX'), el('div', 'meta', unread ? `${unread} unread` : `${Number(d.count) || 0} shown`));
    col.append(top);
    const rows = Array.isArray(d.rows) ? d.rows : [];
    for (const r of rows.slice(0, 7)) {
      const li = el('div', 'li'), body = el('span');
      body.append(el('span', 'w', str(r.who, 40)), ' ', el('span', 'm', str(r.what, 90)));
      if (r.tag) li.append(el('span', 't', str(r.tag, 6)));
      li.append(body);
      col.append(li);
    }
    if (!rows.length) col.append(el('div', 'text', 'Nothing here.'));
    if (Number(d.more) > 0) { const li = el('div', 'li'); li.append(el('span', 'm', `+ ${Number(d.more)} more`)); col.append(li); }
    card.append(col, el('div', 'drawn', 'DRAWN BY AANG'));
    return card;
  },
  // His day or his week (sheet 21 board 2b): each day, then its times. A day with nothing says so.
  week(d) {
    const card = el('div', 'parch'), col = el('div', 'col');
    const top = el('div', 'row'); top.style.alignItems = 'center'; top.style.gap = '8px';
    top.append(el('div', 'plaque', str(d.title || 'YOUR WEEK', 16)), el('div', 'meta', str(d.range, 40)));
    col.append(top);
    const days = Array.isArray(d.days) ? d.days : [];
    for (const day of days.slice(0, 14)) {
      if (days.length > 1) col.append(el('div', 'sec', str(day.name, 24)));
      const items = Array.isArray(day.items) ? day.items : [];
      if (!items.length) { const li = el('div', 'li'); li.append(el('span', 'm', 'Nothing booked')); col.append(li); continue; }
      for (const e of items.slice(0, 6)) {
        const li = el('div', 'li'), body = el('span');
        body.append(el('span', 'w', str(e.title, 70)));
        if (e.where) body.append(' ', el('span', 'm', str(e.where, 50)));
        li.append(el('span', 'tm', str(e.tm, 12)), body);
        col.append(li);
      }
    }
    card.append(col, el('div', 'drawn', 'DRAWN BY AANG'));
    return card;
  },
  // One email, gone through (sheet 21 board 2): code's facts in the box, Aang's summary above, CHECK where code is unsure.
  email(d) {
    const card = el('div', 'parch'), col = el('div', 'col');
    const top = el('div', 'row'); top.style.alignItems = 'center'; top.style.gap = '8px';
    top.style.paddingRight = '64px';            // room for DRAWN BY AANG in the corner
    top.append(el('div', 'plaque', 'WENT THROUGH IT'), el('div', 'meta', `${str(d.from, 40)}${d.sent ? ', ' + str(d.sent, 30) : ''}`));
    col.append(top, el('div', 'head', str(d.subject, 120)));
    if (d.summary) col.append(el('div', 'text', str(d.summary, 320)));
    const rows = Array.isArray(d.rows) ? d.rows : [];
    if (rows.length) {
      const box = el('div', 'found');
      for (const r of rows.slice(0, 9)) {
        const li = el('div', 'li'), body = el('span');
        if (r.icon === 'check') li.append(el('span', 'chk', 'CHECK'));
        else li.append(icon(r.icon));
        if (r.icon !== 'check') body.append(el('span', 'w', str(r.w, 90)), ' ');
        body.append(el('span', 'm', str(r.m, 160)));
        li.append(body);
        box.append(li);
      }
      col.append(box);
    }
    card.append(col, el('div', 'drawn', 'DRAWN BY AANG'));
    return card;
  },
  // The home card (sheet 15 board 4), on the browser's pixel wood.
  home(d) {
    const card = el('div', 'wood');
    const top = el('div', 'top');
    const face = el('img'); face.src = 'art/aang-face.png'; face.alt = '';
    top.append(face, el('b', null, 'HOME'), el('small', null, 'pinned, kept current'));
    const tiles = el('div', 'tiles');
    for (const t of (Array.isArray(d.tiles) ? d.tiles : []).slice(0, 6)) {
      const tile = el('div', 'tile');
      tile.append(el('div', 'k', str(t.k, 24)), el('div', 'v' + (t.tone === 'warn' ? ' warn' : t.tone === 'good' ? ' good' : ''), str(t.v, 40)));
      if (Number.isFinite(t.fill)) {
        const b = el('div', 'bars');
        const on = Math.round(Math.max(0, Math.min(1, t.fill)) * 10);
        for (let i = 0; i < 10; i++) b.append(el('i', i < on ? 'done' : ''));
        tile.append(b);
      }
      tiles.append(tile);
    }
    card.append(top, tiles, el('div', 'drawn', 'DRAWN BY AANG'));
    return card;
  },
};

try {
  const raw = decodeURIComponent(location.hash.slice(1));
  const msg = JSON.parse(raw);
  const draw = DRAW[msg.kind];
  if (!draw) throw new Error('no such card');
  document.getElementById('card').append(draw(msg.data || {}));
  // Wait for the fonts and pictures, then report its size in CSS pixels (cardrender.ts draws it at 2x).
  Promise.all([document.fonts.ready, ...[...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; })))]).then(() => {
    requestAnimationFrame(() => {
      const r = document.getElementById('card').getBoundingClientRect();
      document.title = `ready:${Math.ceil(r.width)}x${Math.ceil(r.height)}`;
    });
  });
} catch (e) {
  document.title = 'failed:' + String(e && e.message || e).slice(0, 80);
}
