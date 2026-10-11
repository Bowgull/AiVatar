// 6.17: the corner card. Shows the snip; Send hands it to the typing box, Bin it throws it away.
// Never sends anything by itself: the whole point is that he decides.
const img = document.getElementById('snip');
// The window fits the card, measured once the picture is in: a fixed height cut the keys off the bottom
// (his screen, 2026-10-11).
const fit = () => {
  // offsetWidth/Height, not the bounding box: the card is still mid-entrance (scaled to .9) when the
  // picture loads, and a transformed box would measure the window short again.
  const c = /** @type {HTMLElement} */ (document.querySelector('.card'));
  window.aang?.snipCardSize?.({ width: c.offsetWidth + 16, height: c.offsetHeight + 16 + 6 });
};
img.addEventListener('load', fit);
window.aang?.onSnipCard?.((s) => { if (s && typeof s.url === 'string' && s.url.startsWith('data:image/')) img.src = s.url; });
document.getElementById('send').addEventListener('click', () => window.aang?.snipSend?.());
document.getElementById('bin').addEventListener('click', () => window.aang?.snipBin?.());
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'a' || e.key === 'Enter') window.aang?.snipSend?.();
  if (e.key.toLowerCase() === 'z' || e.key === 'Escape') window.aang?.snipBin?.();
});
