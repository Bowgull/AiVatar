// Sheet 61 v2 (2026-10-22, later): his note "just a click might happen by accident, have it on hold click": a row is
// changed by pressing and HOLDING it (~600 ms, a fill sweeps the row and a ring fills), then it listens. Scenes: rest,
// hold, listen, taken.
// v1: Sheet 61 (2026-10-22): Aang's right-click menu (the real page, aangmenu.js) with a new "Hotkeys" row whose submenu
// lists every shortcut Aang holds. Scenes: open (pointing at Snip), change (Show/hide pop-out waiting for new keys),
// taken (Quick note: the keys he pressed belong to another program).
//
// The shortcuts, as the code holds them today (src/Shell/src/main.ts takeAangKeys + the Esc / Ctrl+C / Ctrl+Alt+P holds,
// src/Shell/src/hotkey.ts for the pop-out, src/Body/PetWindow.cs RegisterHotkey hands Ctrl+Plus to the Shell):
//   Ctrl+Plus (and keypad +) talk;  Ctrl+Shift+Plus snip;  Ctrl+Shift+V pop-out;  Ctrl+Alt+P pin what is under the mouse
//   (while a pop-out, timer or note is up);  Ctrl+C copy his line (mouse over the bubble);  Esc close the bubble (while it
//   is open).  New from the interview: Ctrl+* (keypad *) quick note.
import { art } from '../sheet-59/pix.js';
const SCENE = new URLSearchParams(location.search).get('scene') || 'rest';
/** The hold ring: 11 x 11 art pixels, gold filling clockwise from the top up to `k`. */
function ring(k) {
  return art(11, 11, (put) => { for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) { const dx = x + 0.5 - 5.5, dy = y + 0.5 - 5.5, d = Math.hypot(dx, dy); if (d > 5.4) continue;
    if (d > 4.4) { put(x, y, '#120a05'); continue; } if (d < 2.4) { put(x, y, d > 1.4 ? '#120a05' : '#3a2516'); continue; }
    const a = (Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2); put(x, y, a <= k ? (y < 5 ? '#ffe096' : '#ffc43c') : '#4a3420'); } });
}
const P = 2;
const KEYBOARD = ['...........', 'OOOOOOOOOOO', 'O.........O', 'O.O.O.O.O.O', 'O.........O', 'O.OO.O.O.OO', 'O.........O', 'O..OOOOO..O', 'O.........O', 'OOOOOOOOOOO', '...........'];
const WARN = ['....OO....', '...OOOO...', '...O..O...', '..OO..OO..', '..O....O..', '.OO.OO.OO.', '.O..OO..O.', 'OO......OO', 'O...OO...O', 'OOOOOOOOOO'];
/** The menu's own icon recipe (aangmenu.js icon()): hand-placed pixels at 2x with a one-pixel drop. */
function icon(map, col) {
  const dpr = window.devicePixelRatio || 1, px = Math.max(1, Math.round(P * dpr)), sh = Math.max(1, Math.round(dpr));
  const w = map[0].length, h = map.length;
  const c = document.createElement('canvas'); c.width = w * px + sh; c.height = h * px + sh;
  const g = c.getContext('2d');
  const put = (fill, o) => map.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === 'O') { g.fillStyle = fill; g.fillRect(x * px + o, y * px + o, px, px); } }));
  put('rgba(0,0,0,.65)', sh); put(col, 0);
  c.className = 'ic'; c.style.width = c.width / dpr + 'px'; c.style.height = c.height / dpr + 'px';
  return c;
}
const h = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; };
function chips(keys) {
  const i = h('i', 'kk');
  keys.forEach((k, n) => { if (n) i.append(h('span', 'kp', '+')); i.append(h('span', 'kc', k)); });
  return i;
}
function keyRow(label, keys, { fresh = false, fixed = false, id = '' } = {}) {
  const b = h('button'); b.type = 'button'; if (id) b.dataset.k = id; if (fixed) b.classList.add('fixed');
  const lab = h('span', 'lab', label); if (fresh) lab.append(h('small', '', 'NEW'));
  b.append(lab);
  const right = h('span'); right.style.cssText = 'display:inline-flex;align-items:center;margin-left:auto';
  if (!fixed) right.append(h('span', 'hint', 'HOLD TO CHANGE'));
  right.append(chips(keys)); b.append(right);
  return b;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
window.__ready = (async () => {
  await document.fonts.ready;
  for (let k = 0; k < 50 && !window.__menu; k++) await wait(40);
  const sprite = new Image(); sprite.src = '../../../assets/aang/frames/idle_0.png'; sprite.className = 'stg';
  const AX = 24, AY = 560; Object.assign(sprite.style, { left: AX + 'px', top: AY + 'px', width: '224px', height: '224px' });
  await sprite.decode();
  const avoid = { x: AX + 86, y: AY + 76, width: 56, height: 130 };
  const hushEnd = new Date(); hushEnd.setHours(19, 40, 0, 0); if (hushEnd < Date.now()) hushEnd.setDate(hushEnd.getDate() + 1);
  window.__menu({ kind: 'show', x: AX + 134, y: AY + 150, avoid,
    state: { muted: false, quiet: 'auto', docked: false, model: 'auto', saving: true, hushedUntil: 0, jobsRunning: 2 } });
  await wait(100);
  document.body.prepend(sprite);   // after the menu's show, which clears the page
  const main = document.getElementById('main');

  // the new row: Hotkeys, in the settings group (after Save quota), open
  const row = h('button'); row.type = 'button'; row.dataset.sub = 'hotkeys'; row.classList.add('on');
  const lab = h('span', 'lab'); lab.append(icon(KEYBOARD, '#d8c8a8'), 'Hotkeys'); row.append(lab);
  const ri = h('i', 'st'); ri.append('7 KEYS', Object.assign(h('b', 'ar'), { textContent: '▸' })); row.append(ri);
  const seps = main.querySelectorAll('.sep'); seps[seps.length - 1].before(row);

  // the submenu, in the real menu's markup
  const sub = h('div', 'tabmenu submenu keys'); sub.id = 'sub';
  sub.append(h('div', 'mhead', 'ANY TIME'));
  sub.append(keyRow('Talk to Aang', ['CTRL', '+'], { id: 'talk' }));
  sub.append(keyRow('Snip', ['CTRL', 'SHIFT', '+'], { id: 'snip' }));
  sub.append(keyRow('Show / hide the pop-out', ['CTRL', 'SHIFT', 'V'], { id: 'popout' }));
  sub.append(keyRow('Quick note', ['CTRL', '*'], { id: 'note', fresh: true }));
  sub.append(h('div', 'sep'));
  sub.append(h('div', 'mhead', 'ONLY WHILE SOMETHING IS UP'));
  sub.append(keyRow('Pin what is under the mouse', ['CTRL', 'ALT', 'P'], { id: 'pin' }));
  sub.append(keyRow('Copy his line (mouse on the bubble)', ['CTRL', 'C'], { fixed: true }));
  sub.append(keyRow('Close the bubble', ['ESC'], { fixed: true }));
  sub.append(h('div', 'sep'));
  const reset = h('button'); reset.type = 'button'; reset.append(h('span', 'lab', 'Put them all back to the defaults')); sub.append(reset);
  sub.append(h('div', 'note', 'Press and hold a row to change it, so a stray click never does. The + keys work on the number pad too. Ctrl+C and Esc only listen while his bubble is up, so they are fixed.'));

  if (SCENE === 'hold') {
    const b = sub.querySelector('[data-k="popout"]'); b.classList.add('holding'); b.style.setProperty('--k', '62%');
    const r = b.lastChild; r.querySelector('.hint').remove();
    const rg = ring(0.62); rg.style.marginRight = '14px'; r.prepend(rg);
    b.after(Object.assign(h('div', 'note', 'Keep holding: the gold fills the row in 0.6 s, then it listens. Let go early and nothing changes.'), { style: 'color:#ffe28c;padding-top:0' }));
  }
  if (SCENE === 'listen') {
    const b = sub.querySelector('[data-k="popout"]'); b.classList.add('listen');
    const r = b.lastChild; r.replaceChildren(); const w = h('span', 'wait', 'PRESS THE NEW KEYS'); w.append(h('b')); r.append(w);
    b.after(Object.assign(h('div', 'note', 'Now press the new keys together, then let go. Esc keeps Ctrl + Shift + V.'), { style: 'color:#ffe28c;padding-top:0' }));
  }
  if (SCENE === 'taken') {
    const b = sub.querySelector('[data-k="note"]'); b.classList.add('taken');
    const r = b.lastChild; r.replaceChildren(chips(['CTRL', 'SHIFT', 'S']));
    const wn = h('div', 'warn'); wn.append(icon(WARN, '#ff9a8a'));
    const tx = h('span'); tx.innerHTML = 'Another program already has <b>Ctrl + Shift + S</b>, so it would never reach Aang. <u>Try other keys</u> or <u>keep Ctrl + *</u>.';
    wn.append(tx); b.after(wn);
  }
  document.body.append(sub);

  // beside its row, overlapping the main menu's rim by 4 px, as the real submenus sit; kept on the page
  const even = (el) => { el.style.width = ''; const w = el.getBoundingClientRect().width; el.style.width = Math.ceil(w / P) * P + 'px'; };
  sub.style.width = '520px'; even(main);
  const mr = main.getBoundingClientRect(), rr = row.getBoundingClientRect(), sr = sub.getBoundingClientRect();
  // he stands at the bottom of the screen, so the tall submenu is held up on the screen: level with the menu's top
  const top = Math.max(8, Math.min(Math.round((rr.top - 10) / P) * P, mr.bottom + 40 - sr.height, mr.top));
  Object.assign(sub.style, { left: mr.right - 4 + 'px', top: Math.round(top / P) * P + 'px' });
  await wait(60);
  const s2 = sub.getBoundingClientRect(), m2 = main.getBoundingClientRect();
  const x0 = AX, y0 = Math.min(m2.top, s2.top) - 24, x1 = s2.right + 30, y1 = Math.max(AY + 214, m2.bottom, s2.bottom) + 20;
      return { crop: { x: Math.floor(x0 / 2) * 2, y: Math.floor(y0 / 2) * 2, w: Math.ceil((x1 - x0) / 2) * 2, h: Math.ceil((y1 - y0) / 2) * 2 },
    forceHover: SCENE === 'rest' ? '#sub [data-k="snip"]' : SCENE === 'taken' ? '#sub [data-k="note"]' : '#sub [data-k="popout"]' };
})();
