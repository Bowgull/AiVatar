// Driven by the Shell (browser.ts): show a picture (or the wood), dim it a little on a slow site, fade it away.
const shot = document.getElementById('shot'), dim = document.getElementById('dim');
window.curtainShow = async (src) => {
  document.body.style.transition = 'none'; document.body.style.opacity = '1';
  dim.style.transition = 'none'; dim.style.opacity = '0';
  if (typeof src === 'string' && src.startsWith('data:image/')) {
    shot.src = src; shot.hidden = false;
    try { await shot.decode(); } catch { /* shows when it can */ }
  } else { shot.hidden = true; shot.removeAttribute('src'); }
  // No waiting for a screen refresh here: a hidden view gets none, so that wait never ended.
  return true;
};
window.curtainDim = () => { dim.style.transition = 'opacity 400ms ease'; dim.style.opacity = '0.18'; return true; };
window.curtainFade = (ms) => { document.body.style.transition = `opacity ${Number(ms) || 0}ms cubic-bezier(.2,0,0,1)`; document.body.style.opacity = '0'; return true; };
