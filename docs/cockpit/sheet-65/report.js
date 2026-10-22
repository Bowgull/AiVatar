// Sheet 65 v2: the coach report, made simple. His note on v1: "I don't fucking understand even slightly, I genuinely
// don't know what I'm reading, this needs to be simpler." And: no ask box here, he asks Aang (one place to chat).
// So: one big plain headline for the fight, two or three tips as plain sentences with ONE number at most and the
// ability's icon, one "better than last time" line. No chart, no table, no 'uptime' / 'debuff' / 'windows'.
// Inside Samara's real frame (browser.html markup, scripts not run). Example fights: no combat log exists yet.
// The ability and class icons are hand-placed pixel stand-ins (the real report would show the game's own icons).
// ?toon=bujuju|derek
import { rr, fills, loadTex, P, spr } from '../sheet-59/pix.js';

const Q = new URLSearchParams(location.search), TOON = Q.get('toon') || 'bujuju';
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
};
const icon = (k, s) => { const i = ICONS[k]; const c = spr(i.map, i.pal, { s }); c.className = 'pxi'; return c; };

// ---------------------------------------------------------------- the toons (examples)
const TOONS = {
  bujuju: {
    name: 'Bujuju', cls: 'warrior', spec: 'Arms Warrior', night: 'Thursday',
    fights: [['Lucifron', '2:41'], ['Magmadar', '3:12'], ['Gehennas', '2:20'], ['Garr', '4:05'], ['Baron Geddon', 'wipe']], pick: 3,
    head: ['Garr: good kill.', 'Two easy wins next time.'],
    tips: [
      ['smash', 'Press <b>Colossus Smash</b> as soon as it’s ready — you waited about <em>1 second</em> too often.'],
      ['mortal', 'When <b>Mortal Strike</b> and Slam are both ready, press Mortal Strike first. You pressed Slam first <em>6 times</em>.'],
    ],
    nice: ['overpower', 'Nice: you hit <b>Overpower</b> every time it lit up.'],
    better: 'Better than last Thursday',
    guide: 'Tips follow the Warcraft Tavern Arms guide',
  },
  derek: {
    name: 'Derek Sheppard', cls: 'priest', spec: 'Shadow Priest', night: 'Tuesday',
    fights: [['Lucifron', '2:44'], ['Magmadar', '3:05'], ['Gehennas', '2:18']], pick: 1,
    head: ['Magmadar: clean kill.', 'One easy win next time.'],
    tips: [
      ['vtouch', 'Put <b>Vampiric Touch</b> back on before it runs out — it dropped off <em>3 times</em>.'],
      ['fiend', 'When your mana gets low, press <b>Shadowfiend</b>. You still had it ready at the end.'],
    ],
    nice: ['blast', 'Nice: you pressed <b>Mind Blast</b> the moment it was ready.'],
    better: 'Better than last Tuesday',
    guide: 'Tips follow the Warcraft Tavern Shadow guide',
  },
};
const T = TOONS[TOON];

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
  for (const [k, v] of Object.entries(TOONS)) {
    const b = el('button', 'toon' + (k === TOON ? ' on' : ''));
    b.append(icon(v.cls, 2), el('span', '', `<b>${v.name}</b><i>${v.spec}</i>`));
    sw.append(b);
  }
  h.append(t, sw);
  return h;
}
function fightList() {
  const box = el('div', 'fights');
  T.fights.forEach(([boss, time], i) => {
    const f = el('button', 'fight' + (i === T.pick ? ' on' : '') + (time === 'wipe' ? ' none' : ''));
    f.append(el('b', '', boss), el('span', '', time === 'wipe' ? 'wipe' : time));
    box.append(f);
  });
  return box;
}
function tips() {
  const p = pan('tips');
  p.append(el('h1', 'headline', `${T.head[0]}<br><span>${T.head[1]}</span>`));
  const list = el('div', 'tiplist');
  for (const [k, words] of T.tips) {
    const r = el('div', 'tip');
    r.append(icon(k, 3), el('p', '', words));
    list.append(r);
  }
  const n = el('div', 'tip nice'); n.append(icon(T.nice[0], 2), el('p', '', T.nice[1]));
  list.append(n);
  p.append(list);
  const foot = el('div', 'foot');
  foot.append(el('span', 'better', `<i>↑</i>${T.better}`));
  const src = el('span', 'src'); src.append(el('i', 'mono', 'WT'), T.guide);
  foot.append(src);
  p.append(foot);
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
  cols.append(fightList(), tips());
  R.append(cols);
  page.append(R);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  rimAll();
  await new Promise((r) => setTimeout(r, 150));
  return { ok: true };
})();
