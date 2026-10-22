// Sheet 65 v3 (2026-10-22, night): his question on v2 - "did I miss something, could I have done better? what do other
// addons like this do?" So the report now answers his four questions the way WoWAnalyzer / Warcraft Logs / death
// recaps do: ?look=a a report card (grade + checklist worst-first + deaths, raid-mates, trend), ?look=b four answer
// tiles. ?fight=garr|geddon. Research: docs/COACH-RESEARCH.md.
// Sheet 65 v2: the coach report, made simple. His note on v1: "I don't fucking understand even slightly, I genuinely
// don't know what I'm reading, this needs to be simpler." And: no ask box here, he asks Aang (one place to chat).
// So: one big plain headline for the fight, two or three tips as plain sentences with ONE number at most and the
// ability's icon, one "better than last time" line. No chart, no table, no 'uptime' / 'debuff' / 'windows'.
// Inside Samara's real frame (browser.html markup, scripts not run). Example fights: no combat log exists yet.
// The ability and class icons are hand-placed pixel stand-ins (the real report would show the game's own icons).
import { rr, fills, loadTex, P, spr } from '../sheet-59/pix.js';

const Q = new URLSearchParams(location.search);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

// ---------------------------------------------------------------- pixel icons, 16 x 16, hand-placed
const O = '#1a0d06';
const ICONS = {
  // class crests
  warrior: { pal: { o: O, b: '#C69B6D', d: '#7a5530', s: '#e8e2d4', g: '#9a9488', r: '#b8402c' }, map: [
    '................', '..oooooooooooo..', '..obbbbbbbbbbo..', '..obddddddddbo..', '..obdssssssdbo..', '..obdsrrrrsdbo..',
    '..obdsrrrrsdbo..', '..obdssssssdbo..', '..obddsggsddbo..', '...obdsggsdbo...', '...obddssddbo...', '....obdssdbo....',
    '.....obddbo.....', '......obbo......', '.......oo.......', '................'] },
  priest: { pal: { o: O, w: '#fbf6ea', y: '#f0c850', s: '#b8b0a0' }, map: [
    '................', '.....oooooo.....', '....oyyyyyyo....', '...oyoooooooyo..', '...oyo....oyo...', '....oyyyyyyo....',
    '.....oooooo.....', '......owwo......', '...oooowwoooo...', '...owwwwwwwwo...', '...osssswwssso..', '...oooowwoooo...',
    '......owwo......', '......owwo......', '......owso......', '......oooo......'] },
  // abilities (framed like the game's square icons)
  smash: { pal: { o: O, a: '#7a2416', b: '#a83a1e', s: '#d8d4cc', S: '#9a948a', h: '#6a4426', y: '#ffd36a' }, map: [
    'oooooooooooooooo', 'oaaaaaaaaaaaaaao', 'oabbbbssssbbbbao', 'oabbbsSSSSsbbbao', 'oabbbsSSSSsbbbao', 'oabbbbssssbbbbao',
    'oabbbbbhhbbbbbao', 'oabbbbbhhbbbbbao', 'oabbbbbhhbbbbbao', 'oabybbbhhbbbybao', 'oabbybbhhbbybbao', 'oayybybhhbybyyao',
    'oabbbbyyyybbbbao', 'oabbbybbbbybbbao', 'oaaaaaaaaaaaaaao', 'oooooooooooooooo'] },
  mortal: { pal: { o: O, a: '#2a1a14', b: '#3e2820', w: '#e8e2d4', r: '#c8402e', g: '#c99a3a', h: '#6a4426' }, map: [
    'oooooooooooooooo', 'oaaaaaaaaaaaaaao', 'oabbbbbbbbbbbwao', 'oabbbbbbbbbbwwao', 'oabbbbbbbbbwwrao', 'oabbbbbbbbwwrbao',
    'oabbbbbbbwwrbbao', 'oabbbbbbwwrbbbao', 'oabbrbbwwrbbbbao', 'oabbbrwwrbbbbbao', 'oabbbggrbbbbbbao', 'oabbgggbbbbbbbao',
    'oabhhbggbbbbbbao', 'oahhbbbgbbbbbbao', 'oaaaaaaaaaaaaaao', 'oooooooooooooooo'] },
  overpower: { pal: { o: O, a: '#7a4a12', b: '#b8701c', w: '#fff3d8', y: '#ffd36a' }, map: [
    'oooooooooooooooo', 'oaaaaaaaaaaaaaao', 'oabbbbbbwbbbbbao', 'oabbbbbwwwbbbbao', 'oabbbbwwywwbbbao', 'oabbbwwbybwwbbao',
    'oabbwwbbybbwwbao', 'oabbbbbwwwbbbbao', 'oabbbbwwywwbbbao', 'oabbbwwbybwwbbao', 'oabbwwbbybbwwbao', 'oabbbbbbybbbbbao',
    'oabbbbbbybbbbbao', 'oabbbbbbbbbbbbao', 'oaaaaaaaaaaaaaao', 'oooooooooooooooo'] },
  vtouch: { pal: { o: O, a: '#2a1440', b: '#3e2060', p: '#b07cff', P: '#7a4fb0', w: '#e8d8ff' }, map: [
    'oooooooooooooooo', 'oaaaaaaaaaaaaaao', 'oabbbbbbbbbbbbao', 'oabbPbPbPbbbbbao', 'oabbpbpbpbPbbbao', 'oabbpbpbpbpbbbao',
    'oabbpppppppbbbao', 'oabPbpppppppbbao', 'oabppppwpppppbao', 'oabbppppppppbbao', 'oabbbpppppppbbao', 'oabbbbpppppbbbao',
    'oabbbbPpppPbbbao', 'oabbbbbbbbbbbbao', 'oaaaaaaaaaaaaaao', 'oooooooooooooooo'] },
  fiend: { pal: { o: O, a: '#140c1e', b: '#22162e', s: '#4a3a62', S: '#6a5a8a', y: '#ffe08a' }, map: [
    'oooooooooooooooo', 'oaaaaaaaaaaaaaao', 'oabbbbbbbbbbbbao', 'oabbbbssssbbbbao', 'oabbbsSSSSsbbbao', 'oabbsSSSSSSsbbao',
    'oabbsSySSySsbbao', 'oabbsSSSSSSsbbao', 'oabbsSSSSSSsbbao', 'oabbbsSSSSsbbbao', 'oabbsbsSSsbsbbao', 'oabsbbsbbsbbsbao',
    'oabbbsbbbbsbbbao', 'oabbbbbbbbbbbbao', 'oaaaaaaaaaaaaaao', 'oooooooooooooooo'] },
  blast: { pal: { o: O, a: '#3a1440', b: '#5a2060', p: '#e070c8', w: '#ffe0f4' }, map: [
    'oooooooooooooooo', 'oaaaaaaaaaaaaaao', 'oabbbbbbbbbbbbao', 'oabbbbbpbbbbbbao', 'oabpbbbpbbbpbbao', 'oabbpbbpbbpbbbao',
    'oabbbpppppbbbbao', 'oabbbppwwppbbbao', 'oappppwwwwppppao', 'oabbbppwwppbbbao', 'oabbbpppppbbbbao', 'oabbpbbpbbpbbbao',
    'oabpbbbpbbbpbbao', 'oabbbbbpbbbbbbao', 'oaaaaaaaaaaaaaao', 'oooooooooooooooo'] },
  avatar: { pal: { o: O, a: '#5a1a0a', b: '#8a2a10', f: '#ff9a3a', y: '#ffe08a' }, map: [
    'oooooooooooooooo', 'oaaaaaaaaaaaaaao', 'oabbbbbbbbbbbbao', 'oabbbbbffbbbbbao', 'oabfbbfyyfbbfbao', 'oabbfbfyyfbfbbao',
    'oabbbfffffffbbao', 'oabbbbfyyfbbbbao', 'oabbbbffffbbbbao', 'oabbbbffffbbbbao', 'oabbbffbbffbbbao', 'oabbffbbbbffbbao',
    'oabyyyyyyyyyybao', 'oabffffffffffbao', 'oaaaaaaaaaaaaaao', 'oooooooooooooooo'] },
  pause: { pal: { o: O, a: '#2a2414', b: '#4a3e22', w: '#e8dcc4', s: '#a89a7a' }, map: [
    'oooooooooooooooo', 'oaaaaaaaaaaaaaao', 'oabbbbbbbbbbbbao', 'oabbbbbbbbbbbbao', 'oabbwwsbbwwsbbao', 'oabbwwsbbwwsbbao',
    'oabbwwsbbwwsbbao', 'oabbwwsbbwwsbbao', 'oabbwwsbbwwsbbao', 'oabbwwsbbwwsbbao', 'oabbwwsbbwwsbbao', 'oabbwwsbbwwsbbao',
    'oabbbbbbbbbbbbao', 'oabbbbbbbbbbbbao', 'oaaaaaaaaaaaaaao', 'oooooooooooooooo'] },
  bomb: { pal: { o: O, a: '#3a1a08', b: '#5a2a10', k: '#3a3a44', h: '#8a8a98', f: '#ff8a2a', y: '#ffe08a' }, map: [
    'oooooooooooooooo', 'oaaaaaaaaaaaaaao', 'oabbbbbbbbbybbao', 'oabbbbbbbbyfybao', 'oabbbbbbbfbybbao', 'oabbbbbkkfbbbbao',
    'oabbbkkkkkkbbbao', 'oabbkhhkkkkkbbao', 'oabkkhkkkkkkkbao', 'oabkkkkkkkkkkbao', 'oabkkkkkkkkkkbao', 'oabkkkkkkkkkkbao',
    'oabbkkkkkkkkbbao', 'oabbbkkkkkkbbbao', 'oaaaaaaaaaaaaaao', 'oooooooooooooooo'] },
  // status marks: green tick, amber !, red x
  ok: { pal: { o: '#0e2a10', g: '#3f9a4a', w: '#fff8e8' }, map: [
    '..oooooo..', '.oggggggo.', 'oggggggwgo', 'ogggggwwgo', 'ogwggwwggo', 'ogwwwwgggo', 'oggwwggggo', 'oggggggggo', '.oggggggo.', '..oooooo..'] },
  warn: { pal: { o: '#3a2400', y: '#e0a020', w: '#fff8e8' }, map: [
    '..oooooo..', '.oyyyyyyo.', 'oyyywwyyyo', 'oyyywwyyyo', 'oyyywwyyyo', 'oyyywwyyyo', 'oyyyyyyyyo', 'oyyywwyyyo', '.oyyyyyyo.', '..oooooo..'] },
  bad: { pal: { o: '#3a0e08', r: '#c8402e', w: '#fff8e8' }, map: [
    '..oooooo..', '.orrrrrro.', 'orwrrrrwro', 'orrwrrwrro', 'orrrwwrrro', 'orrrwwrrro', 'orrwrrwrro', 'orwrrrrwro', '.orrrrrro.', '..oooooo..'] },
  skull: { pal: { o: O, w: '#efe6d2', s: '#b8ac94' }, map: [
    '...oooooo...', '..owwwwwwo..', '.owwwwwwwwo.', '.owoowwoowo.', '.owoowwoowo.', '.owwwwwwwwo.', '..owwoowwo..', '...owwwwo...',
    '...oswswo...', '....oooo....'] },
};
const icon = (k, s) => { const i = ICONS[k]; const c = spr(i.map, i.pal, { s }); c.className = 'pxi'; return c; };

// ---------------------------------------------------------------- the example night (made up: no combat log exists yet)
// Every status here is something the combat log alone can tell: what he pressed, when it was ready, how long he
// stood idle, who else in the raid played his class, how he died. Nothing needs an outside site.
const T = {
  name: 'Bujuju', cls: 'warrior', spec: 'Arms Warrior', night: 'Thursday',
  fights: [['Lucifron', '2:41', 'ok'], ['Magmadar', '3:12', 'warn'], ['Gehennas', '2:20', 'ok'], ['Garr', '4:05', 'warn'], ['Baron Geddon', 'wipe', 'bad']],
};
const OTHER = { name: 'Derek Sheppard', cls: 'priest', spec: 'Shadow Priest' };
const FIGHTS = {
  garr: {
    pick: 3, boss: 'Garr', how: 'good kill', grade: 'B', good: 3,
    // worst first: red, then amber, then green
    rules: [
      ['bad', 'avatar', 'Use <b>Avatar</b> every time it’s ready', 'once', 'You could have used it <b>3 times</b>. Press it at the pull and again whenever it’s back.'],
      ['warn', 'smash', 'Press <b>Colossus Smash</b> the moment it lights up', '9 of 13', 'You waited about 1 second the other 4 times.'],
      ['ok', 'mortal', '<b>Mortal Strike</b> before Slam', 'yes', ''],
      ['ok', 'overpower', 'Hit <b>Overpower</b> when it lights up', '14 of 14', ''],
      ['ok', 'pause', 'Keep pressing buttons, no long pauses', '2 short', ''],
    ],
    died: null,
    peers: [['Bujuju', 100, true], ['Gromnak', 112, false], ['Tessa', 91, false]],
    trend: [['Sep 24', 1], ['Oct 1', 2], ['Oct 8', 2], ['Oct 15', 2], ['Tonight', 3]],
    first: ['avatar', 'Fix first: press <b>Avatar</b> at the pull and whenever it’s back.'],
  },
  geddon: {
    pick: 4, boss: 'Baron Geddon', how: 'wipe', grade: 'C', good: 2,
    rules: [
      ['bad', 'avatar', 'Use <b>Avatar</b> every time it’s ready', 'never', 'You died before using it. Press it at the pull.'],
      ['warn', 'smash', 'Press <b>Colossus Smash</b> the moment it lights up', '3 of 5', 'You waited about 1 second the other 2 times.'],
      ['warn', 'mortal', '<b>Mortal Strike</b> before Slam', '2 slips', 'When both are ready, Mortal Strike first.'],
      ['ok', 'overpower', 'Hit <b>Overpower</b> when it lights up', '6 of 6', ''],
      ['ok', 'pause', 'Keep pressing buttons, no long pauses', 'none', ''],
    ],
    died: { at: '1:48', what: 'You were the <b>Living Bomb</b> and stayed next to 4 people.', fix: 'When the bomb is on you, run away from the group.', hits: ['Living Bomb', 'Inferno', 'Inferno'] },
    peers: null,
    trend: null,
    first: ['bomb', 'Fix first: when you’re the <b>Living Bomb</b>, run out of the group.'],
  },
};
const LOOK = Q.get('look') || 'a', F = FIGHTS[Q.get('fight') || 'garr'];

/** A panel: a pixel rim and fill drawn to the element's exact (even) size once it is laid out. */
const panels = [];
const pan = (cls) => { const p = el('div', 'pan ' + cls); panels.push(p); return p; };
function rimAll() {
  for (const p of panels) {
    const r = p.getBoundingClientRect();
    const w = Math.round(r.width / P), h = Math.round(r.height / P);
    p.style.width = w * P + 'px'; p.style.height = h * P + 'px';
    const c = rr(w, h, 8, { band: 's2', E: 4, fill: fills.paper(h) });
    c.className = 'rim'; p.prepend(c);
  }
}

function header() {
  const h = el('div', 'rhead');
  const t = el('div', 'rtitle');
  t.append(el('b', '', 'Coach'), el('span', '', `${T.night}'s raid, Molten Core`));
  const sw = el('div', 'toons');
  for (const v of [T, OTHER]) {
    const b = el('button', 'toon' + (v === T ? ' on' : ''));
    b.append(icon(v.cls, 2), el('span', '', `<b>${v.name}</b><i>${v.spec}</i>`));
    sw.append(b);
  }
  h.append(t, sw);
  return h;
}
function fightList() {
  const box = el('div', 'fights');
  T.fights.forEach(([boss, time, st], i) => {
    const f = el('button', 'fight' + (i === F.pick ? ' on' : ''));
    f.append(icon(time === 'wipe' ? 'skull' : st, 2), el('b', '', boss), el('span', '', time));
    box.append(f);
  });
  return box;
}
const pips = (n, of = 5) => { const p = el('span', 'pips'); for (let i = 0; i < of; i++) p.append(el('i', i < n ? 'on' : '')); return p; };

// ---------------------------------------------------------------- A: report card (checklist + three small answers)
function lookA() {
  const p = pan('card');
  const top = el('div', 'verdict');
  const g = el('div', 'grade g' + F.grade, F.grade);
  const words = el('div', 'vwords');
  words.append(el('h1', 'headline', `${F.boss}: ${F.how}.`),
    el('p', 'vsub', `You got <b>${F.good} of 5</b> rotation rules right. ${F.died ? 'One thing killed you.' : 'One big miss.'}`));
  top.append(g, words);
  p.append(top);
  const body = el('div', 'cbody');
  const list = el('div', 'checks');
  list.append(el('div', 'sec', 'Your rotation, worst first'));
  for (const [st, ab, rule, got, fix] of F.rules) {
    const r = el('div', 'chk ' + st);
    r.append(icon(st, 2), icon(ab, 2));
    const t = el('div', 'ct');
    t.append(el('p', 'rule', rule));
    if (fix) t.append(el('p', 'fix', fix));
    r.append(t, el('span', 'got', got));
    list.append(r);
  }
  const side = el('div', 'side');
  // deaths
  const d = el('div', 'box');
  d.append(el('div', 'sec', 'Deaths'));
  if (!F.died) { const r = el('div', 'line'); r.append(icon('ok', 2), el('p', '', 'None. You stayed alive.')); d.append(r); }
  else {
    const r = el('div', 'line'); r.append(icon('skull', 3), el('p', '', `You died at <b>${F.died.at}</b>. ${F.died.what}`)); d.append(r);
    const r2 = el('div', 'line'); r2.append(icon('bomb', 2), el('p', 'fixg', F.died.fix)); d.append(r2);
    d.append(el('p', 'hits', 'Last hits: ' + F.died.hits.join(' · ')));
  }
  side.append(d);
  if (F.peers) {
    const b = el('div', 'box');
    b.append(el('div', 'sec', 'Next to the other warriors'));
    const max = Math.max(...F.peers.map((x) => x[1]));
    for (const [n, v, me] of [...F.peers].sort((a, c) => c[1] - a[1])) {
      const r = el('div', 'peer' + (me ? ' me' : ''));
      const bar = el('span', 'bar'); bar.style.width = Math.round((v / max) * 130) + 'px';
      r.append(el('b', '', n), bar);
      b.append(r);
    }
    b.append(el('p', 'small', 'Damage on Garr: 2nd of 3. Warriors everywhere: no rankings for Forever yet.'));
    side.append(b);
  }
  if (F.trend) {
    const b = el('div', 'box');
    b.append(el('div', 'sec', 'Getting better?'));
    const row = el('div', 'trend');
    for (const [day, n] of F.trend) { const c = el('div', 'tday' + (day === 'Tonight' ? ' now' : '')); c.append(pips(n), el('span', '', day)); row.append(c); }
    b.append(row, el('p', 'up', '<i>↑</i> Yes: 3 rules right tonight, up from 2.'));
    side.append(b);
  }
  body.append(list, side);
  p.append(body);
  return p;
}

// ---------------------------------------------------------------- B: four answers (your four questions, one tile each)
function lookB() {
  const p = pan('four');
  p.append(el('h1', 'headline', `${F.boss}: ${F.how}.`));
  const grid = el('div', 'tiles');
  const tile = (q, ans, cls, lines) => {
    const t = el('div', 'tile');
    t.append(el('div', 'q', q), el('div', 'ans ' + cls, ans));
    for (const [ic, words] of lines) { const r = el('div', 'line'); if (ic) r.append(icon(ic, 2)); r.append(el('p', '', words)); t.append(r); }
    return t;
  };
  grid.append(
    tile('Did I press the right buttons?', 'Mostly', 'amber', [['bad', 'Biggest miss: <b>Avatar</b>, used once when you could have used it 3 times.'], ['warn', '<b>Colossus Smash</b>: about 1 second late, 4 times.'], ['ok', 'Mortal Strike, Overpower and no long pauses: all good.']]),
    tile('How do I compare?', '2nd of 3', 'plain', [[null, 'warriors in your raid, by damage on Garr.'], [null, '<span class="dim">Arms warriors everywhere: Warcraft Logs doesn’t rank Forever yet.</span>']]),
    tile('Why did I die?', 'You didn’t', 'green', [['ok', 'You stayed alive the whole fight.']]),
    tile('Am I getting better?', 'Yes', 'green', [[null, '3 rules right tonight, up from 2 last week. Mortal Strike is fixed since Oct 8.']]),
  );
  p.append(grid);
  const f = el('div', 'firstfix'); f.append(icon(F.first[0], 3), el('p', '', F.first[1]));
  p.append(f);
  return p;
}

window.__ready = (async () => {
  const html = await (await fetch('browser.html')).text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script').forEach((s) => s.remove());
  document.body.prepend(...doc.body.children);
  document.getElementById('url').textContent = `Aang · Coach · ${T.name}`;
  { const fi = document.createElement('img'); fi.src = 'art/aang-face.png'; fi.alt = ''; fi.style.cssText = 'width:16px;height:16px;image-rendering:pixelated;margin-right:7px;vertical-align:-3px'; document.getElementById('url').prepend(fi); }
  await loadTex('band.png', 'tray.png');
  await document.fonts.ready;
  const page = document.getElementById('page');
  page.classList.add('coach');
  const R = el('div', 'report');
  R.append(header());
  const cols = el('div', 'cols');
  cols.append(fightList(), LOOK === 'b' ? lookB() : lookA());
  R.append(cols);
  page.append(R);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  rimAll();
  await new Promise((r) => setTimeout(r, 150));
  return { ok: true };
})();
