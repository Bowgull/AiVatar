// Sheet 121 (3): the hover picture beside the tab list. The Shell calls show() with the page's picture and words.
const $ = (id) => document.getElementById(id);
window.show = (d) => {
  if (!d || typeof d !== 'object') { $('prev').hidden = true; return; }
  const shot = typeof d.shot === 'string' && d.shot.startsWith('data:image/') ? d.shot : '';
  $('shotbox').hidden = !shot;
  if (shot) $('shot').src = shot; else $('shot').removeAttribute('src');
  $('title').textContent = String(d.title ?? '').slice(0, 300);
  $('host').textContent = String(d.host ?? '').slice(0, 200);
  $('rest').textContent = String(d.rest ?? '').slice(0, 400);
  $('snd').hidden = d.playing !== true;
  $('prev').hidden = false;
  return true;
};
