// Sheet 58 helper. <div class="shot" data-s="bubble-A"> becomes that real render (sheet-58/bubble-A.png) at its own size
// (SHOTS, written by src/Shell/test/electron/agents-shots.ts). Close-ups are already blown up, whole pixels.
document.addEventListener('DOMContentLoaded', () => {
  for (const host of document.querySelectorAll('.shot[data-s]')) {
    const name = host.dataset.s, S = window.SHOTS?.[name];
    const img = new Image(); img.alt = ''; img.src = `sheet-58/${name}.png`;
    if (S) { img.width = S.w; img.height = S.h; }
    host.append(img);
  }
});
