// 6.17: the corner card. Shows the snip; Send hands it to the typing box, Bin it throws it away.
// Never sends anything by itself: the whole point is that he decides.
const img = document.getElementById('snip');
window.aang?.onSnipCard?.((s) => { if (s && typeof s.url === 'string' && s.url.startsWith('data:image/')) img.src = s.url; });
document.getElementById('send').addEventListener('click', () => window.aang?.snipSend?.());
document.getElementById('bin').addEventListener('click', () => window.aang?.snipBin?.());
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'a' || e.key === 'Enter') window.aang?.snipSend?.();
  if (e.key.toLowerCase() === 'z' || e.key === 'Escape') window.aang?.snipBin?.();
});
