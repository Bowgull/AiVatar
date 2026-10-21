// Sheet 55 helper: every <div class="shot" data-s="name"> becomes that real render (sheet-55/name.png) at its own size
// (shots.js, written by quiet-shots.ts). No arrows, no callouts: this sheet is meant to be quiet.
function build(host) {
  const name = host.dataset.s, S = window.SHOTS?.[name];
  const img = new Image(); img.src = `sheet-55/${name}.png`; img.alt = '';
  if (S) { img.width = S.w; img.height = S.h; }
  host.append(img);
}
document.addEventListener('DOMContentLoaded', () => document.querySelectorAll('.shot[data-s]').forEach(build));
