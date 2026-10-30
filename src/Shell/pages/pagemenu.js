// 6.22b bug 2: draw the items the Shell sends, say how big the menu is, and send back the one he picks.
// Sheet 109 (2026-10-30): Ask Claude opens its own small list beside it (his last chat, three recent ones, New chat).
// The window is see-through, so the list can hang beside the menu; it is sized to whatever is shown.
const box = document.getElementById('pm');
const sub = document.getElementById('pmsub');

// Claude's mark: the white gem with its orange spark (sheet 106), 11 x 11 at 2x. The arrow and the plus, the same way.
const GEM = '<svg class="gem" viewBox="0 0 11 11" width="22" height="22" shape-rendering="crispEdges" aria-hidden="true"><path d="M3 0h5v1H3zM1 1h2v1H1zM8 1h2v1H8zM0 3h1v5H0zM10 3h1v5H10zM1 2h1v1H1zM9 2h1v1H9zM1 8h1v1H1zM9 8h1v1H9zM1 9h2v1H1zM8 9h2v1H8zM3 10h5v1H3z" fill="#120A05"/><path d="M3 1h5v1H3zM2 2h7v1H2zM1 3h9v5H1zM2 8h7v1H2zM3 9h5v1H3z" fill="#F6F2EA"/><path d="M3 1h3v1H3zM2 2h2v1H2zM1 3h1v2H1z" fill="#ffffff"/><path d="M8 8h1v1H8zM6 9h2v1H6zM9 6h1v2H9z" fill="#cfc6b6"/><path d="M5 2h1v2H5zM5 7h1v2H5zM2 5h2v1H2zM7 5h2v1H7zM3 3h1v1H3zM7 3h1v1H7zM3 7h1v1H3zM7 7h1v1H7zM4 4h3v3H4z" fill="#D97757"/></svg>';
const ARR = '<svg class="arr" viewBox="0 0 4 6" width="8" height="12" shape-rendering="crispEdges" aria-hidden="true"><path d="M0 0h1v6H0zM1 1h1v4H1zM2 2h1v2H2z" fill="#c4b294"/></svg>';
const PLUS = '<svg class="plus" viewBox="0 0 9 9" width="18" height="18" shape-rendering="crispEdges" aria-hidden="true"><path d="M3 0h3v3h3v3H6v3H3V6H0V3h3z" fill="#120A05"/><path d="M4 1h1v3h3v1H5v3H4V5H1V4h3z" fill="#FFC43C"/></svg>';

let askRow = null, chats = null, flip = false;

function row(it) {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('role', 'menuitem');
  b.disabled = it.off === true;
  // Send to Aang carries Aang's face (his rule, 2026-10-22: a name carries its icon); Ask Claude carries Claude's gem.
  if (it.id === 'toaang') { b.classList.add('ic'); b.append(Object.assign(document.createElement('img'), { src: 'art/aang-face.png', alt: '', className: 'aface' })); }
  if (it.gem) { b.classList.add('ic'); b.insertAdjacentHTML('beforeend', GEM); }
  if (it.plus) { b.classList.add('ic'); b.insertAdjacentHTML('beforeend', PLUS); }
  b.append(Object.assign(document.createElement('span'), { textContent: String(it.label ?? '') }));
  if (it.key) b.append(Object.assign(document.createElement('i'), { textContent: String(it.key) }));
  if (it.sub) { b.setAttribute('aria-haspopup', 'menu'); b.insertAdjacentHTML('beforeend', ARR); }
  return b;
}
const sepEl = () => Object.assign(document.createElement('div'), { className: 'sep' });

function size() {
  requestAnimationFrame(() => {
    const m = box.getBoundingClientRect(), s = sub.hidden ? null : sub.getBoundingClientRect();
    const w = s ? Math.ceil(Math.max(m.right, s.right) - Math.min(m.left, s.left)) : Math.ceil(m.width);
    const h = s ? Math.ceil(Math.max(m.bottom, s.bottom)) : Math.ceil(m.height);
    window.aang?.pageMenuSize?.({ w, h, ...(s ? { sub: Math.ceil(s.width) + 2 } : {}) });
  });
}

window.aang?.onPageMenu?.((items) => {
  if (!Array.isArray(items)) return;
  box.replaceChildren();
  closeSub(false);
  askRow = null; chats = null; flip = false;
  document.body.classList.remove('flip');
  for (const it of items) {
    if (it.sep) { box.append(sepEl()); continue; }
    const b = row(it.id === 'askclaude' ? { ...it, gem: true } : it);
    if (it.id === 'askclaude') {
      askRow = b;
      b.addEventListener('mouseenter', () => openSub(false));
      b.addEventListener('click', () => openSub(true));
    } else {
      b.addEventListener('mouseenter', () => closeSub(true));
      b.addEventListener('click', () => window.aang?.pageMenuPick?.(String(it.id)));
    }
    box.append(b);
  }
  // The window is sized to the menu, then shown at the pointer.
  size();
});
// The chats for Ask Claude, sent a moment after the menu (the brain is asked for them as the menu opens).
window.aang?.onPageMenuChats?.((list) => {
  chats = Array.isArray(list) ? list.slice(0, 4) : [];
  if (!sub.hidden) drawSub();
});
// The list did not fit on the right: it hangs on the left of the menu instead.
window.aang?.onPageMenuFlip?.((on) => { flip = on === true; document.body.classList.toggle('flip', flip); placeSub(); });

function drawSub() {
  sub.replaceChildren();
  const list = chats ?? [];
  const add = (label, id, o = {}) => { const b = row({ label, ...o }); b.addEventListener('click', () => window.aang?.pageMenuPick?.(id)); sub.append(b); };
  if (list[0]) { add(list[0].name, 'ask0', { gem: true }); sub.append(sepEl()); }
  if (list.length > 1) { list.slice(1).forEach((c, i) => add(c.name, 'ask' + (i + 1))); sub.append(sepEl()); }
  add('New chat', 'asknew', { plus: true });
  placeSub();
}
function placeSub() {
  if (sub.hidden || !askRow) return;
  if (flip) {
    const w = sub.getBoundingClientRect().width;
    box.style.marginLeft = Math.ceil(w + 2) + 'px';
    sub.style.left = '0px';
  } else { box.style.marginLeft = ''; sub.style.left = Math.round(box.getBoundingClientRect().right + 2) + 'px'; }
  sub.style.top = Math.max(0, Math.round(askRow.getBoundingClientRect().top - 6)) + 'px';
  size();
}
function openSub(focus) {
  if (!askRow) return;
  askRow.classList.add('open');
  if (sub.hidden) { sub.hidden = false; drawSub(); }
  if (focus) sub.querySelector('button')?.focus();
}
function closeSub(resize) {
  if (sub.hidden) return;
  sub.hidden = true; sub.replaceChildren();
  askRow?.classList.remove('open');
  box.style.marginLeft = '';
  if (resize) { flip = false; document.body.classList.remove('flip'); size(); }
}

// Arrow keys move, Enter picks, Esc closes; Right opens Claude's list, Left closes it.
document.addEventListener('keydown', (e) => {
  const inSub = sub.contains(document.activeElement);
  const keys = [...(inSub ? sub : box).querySelectorAll('button:not(:disabled)')];
  const at = keys.indexOf(document.activeElement);
  if (e.key === 'Escape') { if (inSub) { closeSub(true); askRow?.focus(); } else window.aang?.pageMenuPick?.(''); e.preventDefault(); }
  else if (e.key === 'ArrowDown') { (keys[(at + 1) % keys.length])?.focus(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { (keys[(at - 1 + keys.length) % keys.length])?.focus(); e.preventDefault(); }
  else if (e.key === 'ArrowRight' && document.activeElement === askRow) { openSub(true); e.preventDefault(); }
  else if (e.key === 'ArrowLeft' && inSub) { closeSub(true); askRow?.focus(); e.preventDefault(); }
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
