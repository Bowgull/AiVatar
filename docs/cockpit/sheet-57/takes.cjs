// Sheet 57 (2026-10-21): the quieter close-tab "x" in Samara's drawer. Each take is CSS laid over the real browser.css
// (src/Shell/test/electron/tabclose-shots.ts adopts it as a constructed stylesheet). ".hv" stands for the pointer on a
// row, ".xh" for the pointer on the x itself, ".mid" for take D half way through its slide.

// The x: hand-placed on a 7x7 grid, one art pixel = 2 screen pixels (the drawer's own scale), so 14 px drawn.
// Its shadow is the same glyph one art pixel lower: carved, lit from the top-left like the rest of the wood.
const X7 = [
  'X.....X',
  '.X...X.',
  '..X.X..',
  '...X...',
  '..X.X..',
  '.X...X.',
  'X.....X',
];
const svg = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 7 7" shape-rendering="crispEdges">${
  X7.flatMap((r, y) => [...r].map((c, x) => (c === 'X' ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : ''))).join('')}</svg>`);

// The pixel x inside a button whose box stays 26 px (the hit target), whatever the glyph's size. --ink / --shade colour it.
const glyph = (sel, box = 26) => {
  const o = (box - 14) / 2;
  return `${sel}{width:${box}px;height:${box}px;border-radius:7px;border:none;padding:0;font-size:0;color:transparent;background:none!important;position:relative;flex:0 0 auto;margin:0 ${(22 - box) / 2}px;
  --ink:#b39b74;--shade:rgba(0,0,0,.62)}
${sel}::before,${sel}::after{content:"";position:absolute;left:${o}px;top:${o}px;width:14px;height:14px;
  -webkit-mask:url("${svg}") 0 0/14px 14px no-repeat;mask:url("${svg}") 0 0/14px 14px no-repeat}
${sel}::before{background:var(--shade);top:${o + 2}px}
${sel}::after{background:var(--ink)}`;
};

// What a pointer on a row does today, for the stand-in (.hv): the row lifts a touch and the x shows.
const base = `.drawer .tp.hv:not(.on){filter:brightness(1.1)}
.tp.hv .x{opacity:1}
.drawer .tp .x,.drawer .tp .x::before,.drawer .tp .x::after{transition:none!important}`;

const takes = {
  TODAY: ``,

  // A: no circle. The small pixel x in muted wood ink, only on the pointed-at row and the active row; gold under the pointer.
  A: `${glyph('.drawer .tp .x')}
.drawer .tp .x{opacity:0}
.drawer .tp:is(:hover,.hv) .x,.drawer .tp.on .x,.drawer .tp .x:focus-visible{opacity:1}
.drawer .tp .x:is(:hover,.xh){--ink:#FFC43C}
.drawer .tp.on .x{--ink:#6e4f2e;--shade:rgba(255,248,230,.75)}
.drawer .tp.on .x:is(:hover,.xh){--ink:#b4520c}
.drawer .tp .x:focus-visible{outline:2px solid #FFC43C;outline-offset:-2px}`,

  // B: Chrome's way. Pointing at a row swaps its icon for the x, in the icon's own sunk slot: nothing else moves.
  B: `${glyph('.drawer .tp .x', 30)}
.drawer .tp .x{display:none;opacity:1;order:-1;margin:0;border-radius:6px;background:#1c1328!important;box-shadow:inset 0 2px 0 rgba(0,0,0,.6),0 1px 0 rgba(255,220,170,.12)}
.drawer .tp:is(:hover,.hv)>.fi{display:none}
.drawer .tp:is(:hover,.hv)>.x{display:block}
.drawer .tp .x:is(:hover,.xh){--ink:#FFC43C}
.drawer .tp.on .x{background:#e9d3a6!important;box-shadow:inset 0 2px 0 rgba(120,80,30,.35);--ink:#6e4f2e;--shade:rgba(255,248,230,.75)}
.drawer .tp.on .x:is(:hover,.xh){--ink:#b4520c}
.drawer .tp .x:focus-visible{display:block;outline:2px solid #FFC43C;outline-offset:-2px}`,

  // C: a soft rounded slot pressed into the wood, only on the pointed-at row; low contrast, no bright circle.
  C: `${glyph('.drawer .tp .x')}
.drawer .tp .x{opacity:0;border-radius:7px;background:rgba(0,0,0,.2)!important;box-shadow:inset 0 2px 0 rgba(0,0,0,.42),0 1px 0 rgba(255,220,170,.10);--ink:#a48c66}
.drawer .tp:is(:hover,.hv) .x,.drawer .tp .x:focus-visible{opacity:1}
.drawer .tp .x:is(:hover,.xh){--ink:#FFC43C;background:rgba(0,0,0,.3)!important}
.drawer .tp.on .x{background:rgba(120,80,30,.16)!important;box-shadow:inset 0 2px 0 rgba(120,80,30,.32),0 1px 0 rgba(255,255,255,.4);--ink:#6e4f2e;--shade:rgba(255,248,230,.75)}
.drawer .tp.on .x:is(:hover,.xh){--ink:#b4520c}
.drawer .tp .x:focus-visible{outline:2px solid #FFC43C;outline-offset:-2px}`,

  // D: nothing until the pointer rests on a row for a moment (0.35 s), then the x slides in from the row's right edge.
  D: `${glyph('.drawer .tp .x')}
.drawer .tp .x{overflow:hidden;opacity:1}
.drawer .tp .x::before,.drawer .tp .x::after{opacity:0;transform:translateX(14px)}
.drawer .tp:is(:hover,.hv) .x::before,.drawer .tp:is(:hover,.hv) .x::after,.drawer .tp .x:focus-visible::before,.drawer .tp .x:focus-visible::after{opacity:1;transform:none}
.drawer .tp .x.mid::before,.drawer .tp .x.mid::after{opacity:.5;transform:translateX(7px)}
.drawer .tp .x:is(:hover,.xh){--ink:#FFC43C}
.drawer .tp.on .x{--ink:#6e4f2e;--shade:rgba(255,248,230,.75)}
.drawer .tp .x:focus-visible{outline:2px solid #FFC43C;outline-offset:-2px}`,
};

// The close-ups each take gets (all of the pointed-at row unless said).
const zooms = {
  TODAY: [{ name: 'z-hover', row: 'hv' }, { name: 'z-on', row: 'on' }],
  A: [{ name: 'z-hover', row: 'hv' }, { name: 'z-xhover', row: 'hv', xh: true }, { name: 'z-on', row: 'on' }],
  B: [{ name: 'z-hover', row: 'hv' }, { name: 'z-xhover', row: 'hv', xh: true }],
  C: [{ name: 'z-hover', row: 'hv' }, { name: 'z-xhover', row: 'hv', xh: true }],
  D: [{ name: 'z-mid', row: 'hv', mid: true }, { name: 'z-hover', row: 'hv' }, { name: 'z-xhover', row: 'hv', xh: true }],
};

module.exports = { base, takes, zooms, X7 };
