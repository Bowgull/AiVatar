// Sheet 65: the coach report, inside Samara's real frame (browser.html markup, scripts not run). Example fights: no
// combat log exists yet. Every panel is a pixel rim (sheet 55 S2, pix.js) on Samara's own tray wood; numbers are
// Figtree bold, never squashed pixel digits. ?look=A (fights across the top) | B (fights down the left); ?toon=bujuju|derek
import { rr, fills, loadTex, P } from '../sheet-59/pix.js';

const Q = new URLSearchParams(location.search), LOOK = Q.get('look') || 'B', TOON = Q.get('toon') || 'bujuju';
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

const TOONS = {
  bujuju: {
    name: 'Bujuju', spec: 'Arms Warrior', said: 'Solid. Two things to tighten.',
    fights: [['Lucifron', '2:41', 'good'], ['Magmadar', '3:12', 'good'], ['Gehennas', '2:20', 'ok'], ['Garr', '4:05', 'ok'], ['Baron Geddon', '3:38', 'none']],
    pick: 3, secs: 245, when: 'Thursday, 9:42 pm', result: 'Kill',
    findings: [
      ['fix', 'Colossus Smash debuff up', '61%', 'good runs: 80%+', 'Cast it the moment it is back. Everything hits harder inside it.'],
      ['fix', 'Mortal Strike late after its cooldown', '1.4 s', 'on average, 31 times', 'Press it before Slam when both are ready.'],
      ['small', 'Recklessness windows not used', '2', 'of 3 in the fight', 'One at 1:33 and one at 3:03. Use it with Smash.'],
      ['good', 'Overpower on every proc', '14 / 14', 'none missed', ''],
    ],
    lanes: [
      { label: 'Smash debuff', kind: 'up', col: '#e9b23a', spans: [[0, 16], [22, 35], [41, 52], [66, 80], [86, 99], [108, 122], [130, 142], [157, 170], [177, 189], [203, 216], [222, 234], [238, 245]] },
      { label: 'Mortal Strike', kind: 'cast', col: '#c8402e', at: [4, 11, 19, 27, 36, 44, 52, 61, 70, 78, 87, 96, 104, 112, 121, 130, 138, 147, 155, 164, 172, 181, 189, 198, 206, 215, 223, 231, 238], late: [19, 52, 87, 130, 172, 215] },
      { label: 'Recklessness', kind: 'cd', col: '#7a4fb0', used: [[3, 15]], missed: [[93, 105], [183, 195]] },
    ],
    trend: [['Smash debuff up', [48, 52, 55, 58, 61], '%', 'up from 48% two weeks ago', true], ['Mortal Strike late', [2.1, 1.9, 1.7, 1.6, 1.4], ' s', 'down from 2.1 s', true]],
    ask: 'Why does the Smash debuff matter so much?',
  },
  derek: {
    name: 'Derek Sheppard', spec: 'Shadow Priest', said: 'Good. One thing to tighten.',
    fights: [['Lucifron', '2:44', 'good'], ['Magmadar', '3:05', 'ok'], ['Gehennas', '2:18', 'good']],
    pick: 1, secs: 185, when: 'Tuesday, 8:15 pm', result: 'Kill',
    findings: [
      ['fix', 'Vampiric Touch fell off', '3 times', 'for 4.2 s on average', 'Refresh it with 3 s left, not after it drops.'],
      ['good', 'Shadow Word: Pain up', '96%', 'good runs: 90%+', ''],
      ['small', 'Shadowfiend not used', '1', 'of 2 in the fight', 'At 2:10 you had it and were low on mana.'],
      ['good', 'Mind Blast on cooldown', '0.3 s', 'late on average', ''],
    ],
    lanes: [
      { label: 'Vampiric Touch', kind: 'up', col: '#7a4fb0', spans: [[1, 46], [50, 98], [103, 140], [145, 185]] },
      { label: 'Mind Blast', kind: 'cast', col: '#3a6fb8', at: [3, 12, 21, 30, 39, 48, 57, 66, 75, 84, 93, 102, 111, 120, 129, 138, 147, 156, 165, 174, 183], late: [] },
      { label: 'Shadowfiend', kind: 'cd', col: '#2f7a3e', used: [[20, 35]], missed: [[130, 145]] },
    ],
    trend: [['Vampiric Touch up', [88, 90, 89, 92], '%', 'about the same as last week', false], ['Fell off', [5, 4, 4, 3], ' times', 'down from 5', true]],
    ask: 'When should I refresh Vampiric Touch?',
  },
};
const T = TOONS[TOON];
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const TAG = { fix: ['TIGHTEN', 'fix'], small: ['SMALL', 'small'], good: ['GOOD', 'good'] };

/** A panel: a pixel rim and fill drawn to the element's exact (even) size once it is laid out. */
const panels = [];
const pan = (cls, kind = 'paper') => { const p = el('div', 'pan ' + cls); p.dataset.kind = kind; panels.push(p); return p; };
function rimAll() {
  for (const p of panels) {
    const r = p.getBoundingClientRect();
    const w = Math.round(r.width / P), h = Math.round(r.height / P);
    p.style.width = w * P + 'px'; p.style.height = h * P + 'px';
    const c = rr(w, h, p.dataset.kind === 'chip' ? 5 : 8, { band: p.dataset.kind === 'chip' ? 'edge' : 's2', E: 4, fill: p.dataset.kind === 'wood' ? fills.wood(1.15) : p.dataset.kind === 'chip' ? fills.paper(h) : fills.paper(h) });
    c.className = 'rim'; p.prepend(c);
  }
}

function header() {
  const h = el('div', 'rhead');
  const t = el('div', 'rtitle');
  t.append(el('small', '', 'AANG &middot; ROTATION COACH'), el('b', '', 'Molten Core'), el('span', '', `${T.when}. Found in your combat log: <b>${T.name}, ${T.spec}</b>.`));
  const sw = el('div', 'toons');
  sw.append(el('small', '', 'TOON'));
  for (const [k, v] of Object.entries(TOONS)) {
    const b = el('button', 'toon' + (k === TOON ? ' on' : ''), `<b>${v.name}</b><i>${v.spec}</i>`);
    sw.append(b);
  }
  h.append(t, sw);
  return h;
}
function fightList(vertical) {
  const box = el('div', vertical ? 'fights v' : 'fights h');
  if (vertical) box.append(el('div', 'sec', 'FIGHTS THAT NIGHT'));
  T.fights.forEach(([boss, time, how], i) => {
    const f = el('button', 'fight' + (i === T.pick ? ' on' : '') + (how === 'none' ? ' none' : ''));
    f.append(el('i', 'fmk ' + how), el('b', '', boss), el('span', '', how === 'none' ? 'wipe' : time));
    box.append(f);
  });
  return box;
}
function findings() {
  const p = pan('finds');
  const top = el('div', 'ftop');
  const f = T.fights[T.pick];
  top.append(el('div', 'fname', `<b>${f[0]}</b><span>${f[1]} &middot; ${T.result}</span>`), el('div', 'said', `&ldquo;${T.said}&rdquo;`));
  p.append(top);
  for (const [k, text, big, sub, tip] of T.findings) {
    const r = el('div', 'find ' + k);
    const [word, cls] = TAG[k];
    const mid = el('div', 'fm');
    mid.append(el('span', 'ftag ' + cls, word), el('b', '', text));
    if (tip) mid.append(el('p', '', tip));
    const num = el('div', 'fnum', `<b>${big}</b><small>${sub}</small>`);
    r.append(mid, num);
    p.append(r);
  }
  return p;
}
function timeline() {
  const p = pan('tl');
  p.append(el('div', 'sec', 'WHAT YOU PRESSED, START TO KILL'));
  const W = 520;
  const sc = W / T.secs;
  const X = (s) => Math.round(s * sc / 2) * 2;
  const grid = el('div', 'tgrid');
  for (const L of T.lanes) {
    const row = el('div', 'lane');
    row.append(el('span', 'll', L.label));
    const tr = el('div', 'track'); tr.style.width = W + 'px';
    if (L.kind === 'up') for (const [a, b] of L.spans) { const s = el('i', 'up'); s.style.left = X(a) + 'px'; s.style.width = (X(b) - X(a)) + 'px'; s.style.background = L.col; tr.append(s); }
    if (L.kind === 'cast') for (const a of L.at) { const s = el('i', 'tick' + (L.late.includes(a) ? ' late' : '')); s.style.left = X(a) + 'px'; s.style.background = L.late.includes(a) ? '#ff8040' : L.col; tr.append(s); }
    if (L.kind === 'cd') {
      for (const [a, b] of L.used) { const s = el('i', 'cd', 'USED'); s.style.left = X(a) + 'px'; s.style.width = (X(b) - X(a) + 30) + 'px'; s.style.background = L.col; tr.append(s); }
      for (const [a, b] of L.missed) { const s = el('i', 'cd miss', 'UNUSED'); s.style.left = X(a) + 'px'; s.style.width = Math.max(70, X(b) - X(a) + 30) + 'px'; tr.append(s); }
    }
    const up = L.kind === 'up' ? Math.round(L.spans.reduce((n, [a, b]) => n + b - a, 0) / T.secs * 100) + '%' : L.kind === 'cast' ? (L.late.length ? `${L.late.length} late` : 'on time') : `${L.used.length} of ${L.used.length + L.missed.length}`;
    row.append(tr, el('b', 'lv', up));
    grid.append(row);
  }
  const ax = el('div', 'axis'); ax.style.width = W + 'px';
  for (let s = 0; s <= T.secs - 25; s += 60) { const a = el('span', '', mmss(s)); a.style.left = X(s) + 'px'; ax.append(a); }
  const end = el('span', 'end', mmss(T.secs)); end.style.left = W + 'px'; ax.append(end);
  grid.append(el('div', 'lane axisrow', '<span class="ll"></span>'));
  grid.lastChild.append(ax);
  p.append(grid);
  const key = el('div', 'tkey', '<span><i class="k-late"></i>pressed late</span><span><i class="k-miss"></i>ready, not used</span>');
  p.append(key);
  return p;
}
function trend() {
  const p = pan('trend');
  p.append(el('div', 'sec', `${T.name.split(' ')[0].toUpperCase()}'S LAST RUNS`));
  for (const [label, vals, unit, words, better] of T.trend) {
    const r = el('div', 'tr');
    const max = Math.max(...vals) * 1.1;
    const bars = el('div', 'bars');
    vals.forEach((v, i) => { const b = el('i', i === vals.length - 1 ? 'now' : ''); b.style.height = Math.max(4, Math.round(v / max * 34 / 2) * 2) + 'px'; bars.append(b); });
    const t = el('div', 'tt', `<b>${label}</b><span>${words}</span>`);
    r.append(bars, t, el('div', 'tv' + (better ? ' better' : ''), `${vals[vals.length - 1]}${unit}`));
    p.append(r);
  }
  return p;
}
function followUp() {
  const p = pan('ask');
  p.append(el('div', 'sec', 'ASK A FOLLOW-UP'));
  const row = el('div', 'askrow');
  row.append(el('div', 'askbox', `<span>e.g. ${T.ask}</span><i></i>`));
  const k = el('button', 'key sm primary', 'Ask'); k.append(el('span', 'k', 'A'));
  row.append(k);
  p.append(row, el('p', 'src', 'Judged against the Warcraft Tavern Arms guide (beta, 20 Oct). Only your own toon is sent.'));
  if (TOON === 'derek') p.lastChild.textContent = 'Judged against the Warcraft Tavern Shadow guide (beta, 20 Oct). Only your own toon is sent.';
  return p;
}

window.__ready = (async () => {
  const html = await (await fetch('browser.html')).text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script').forEach((s) => s.remove());
  document.body.prepend(...doc.body.children);
  document.getElementById('url').textContent = `Aang · Coach · ${T.name} · Molten Core`;
  await loadTex('band.png', 'tray.png');
  await document.fonts.ready;
  const page = document.getElementById('page');
  page.classList.add('coach');
  const R = el('div', 'report look' + LOOK);
  R.append(header());
  if (LOOK === 'A') {
    R.append(fightList(false));
    const cols = el('div', 'cols');
    const left = el('div', 'colL'), right = el('div', 'colR');
    left.append(findings(), timeline());
    right.append(trend(), followUp());
    cols.append(left, right); R.append(cols);
  } else {
    const cols = el('div', 'cols');
    const rail = el('div', 'colF'); rail.append(fightList(true));
    const main = el('div', 'colL'), side = el('div', 'colR');
    main.append(findings(), timeline());
    side.append(trend(), followUp());
    cols.append(rail, main, side); R.append(cols);
  }
  page.append(R);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  rimAll();
  await new Promise((r) => setTimeout(r, 150));
  return { ok: true };
})();
