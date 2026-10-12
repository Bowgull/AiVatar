// 6.22b bug 2: draw the items the Shell sends, say how big the menu is, and send back the one he picks.
const box = document.getElementById('pm');

window.aang?.onPageMenu?.((items) => {
  if (!Array.isArray(items)) return;
  box.replaceChildren();
  for (const it of items) {
    if (it.sep) { box.append(Object.assign(document.createElement('div'), { className: 'sep' })); continue; }
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.disabled = it.off === true;
    b.append(Object.assign(document.createElement('span'), { textContent: String(it.label ?? '') }));
    if (it.key) b.append(Object.assign(document.createElement('i'), { textContent: String(it.key) }));
    b.addEventListener('click', () => window.aang?.pageMenuPick?.(String(it.id)));
    box.append(b);
  }
  // The window is sized to the menu, then shown at the pointer.
  requestAnimationFrame(() => { const r = box.getBoundingClientRect(); window.aang?.pageMenuSize?.({ w: Math.ceil(r.width), h: Math.ceil(r.height) }); });
});

// Arrow keys move, Enter picks, Esc closes.
document.addEventListener('keydown', (e) => {
  const keys = [...box.querySelectorAll('button:not(:disabled)')];
  const at = keys.indexOf(document.activeElement);
  if (e.key === 'Escape') { window.aang?.pageMenuPick?.(''); e.preventDefault(); }
  else if (e.key === 'ArrowDown') { (keys[(at + 1) % keys.length])?.focus(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { (keys[(at - 1 + keys.length) % keys.length])?.focus(); e.preventDefault(); }
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
