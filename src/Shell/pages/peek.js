// Sheet 121 (5): the peek's shade and strip. The Shell places the box (peekBox) and names the page (peekHead).
const $ = (id) => document.getElementById(id);
window.peekBox = (b) => {
  if (!b || typeof b !== 'object') return false;
  Object.assign($('box').style, { left: b.x + 'px', top: b.y + 'px', width: b.width + 'px', height: b.height + 'px' });
  return true;
};
window.peekHead = (h) => {
  $('host').textContent = String(h?.host ?? '').slice(0, 200);
  $('rest').textContent = String(h?.rest ?? '').slice(0, 400);
  $('where').title = String(h?.title ?? '').slice(0, 300);
  return true;
};
for (const b of document.querySelectorAll('[data-act]')) b.addEventListener('click', () => window.aang?.browserPeek?.(b.dataset.act));
// A click on the shade, anywhere outside the page: closed.
$('shade').addEventListener('pointerdown', () => window.aang?.browserPeek?.('close'));
