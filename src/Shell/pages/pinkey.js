// The window family's pin key (cleanup 2026-10-22). One look on every pop-out: the video pop-out, the job pop-out and
// the pinned snip. A plum key with a small pixel pin; pinned, the key is pressed in and turns gold, and the pin fills in
// and lies on its side (sheet 38 for the video pop-out, sheet 52's "pinned must look clearly different").
// The brown pushpin that stood on the job pop-out and the pinned snip is gone: he called it hideous on notes (sheet 60).
// 7 x 7 art pixels, drawn at exactly 2x (14 CSS px), crisp.
const OFF = 'M2 0h3v1H2zM2 1h1v2H2zM4 1h1v2H4zM1 3h5v1H1zM3 4h1v3H3z';   // the pin's outline, standing
const ON = 'M2 0h3v3H2zM1 3h5v1H1zM3 4h1v3H3z';                         // filled in
const NS = 'http://www.w3.org/2000/svg';

/** The pin's picture, standing (off) or filled and on its side (on). */
export function pinSvg(on) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 7 7'); s.setAttribute('width', '14'); s.setAttribute('height', '14');
  s.setAttribute('shape-rendering', 'crispEdges'); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', on ? ON : OFF); p.setAttribute('fill', on ? '#2a1c00' : '#e8e0f5');
  if (on) p.setAttribute('transform', 'rotate(90 3.5 3.5)');
  s.append(p);
  return s;
}

/** Paint a button as the pin key, pinned or not: its class, its pressed state, its words and its picture. */
export function paintPinKey(b, on, words = { on: 'Pinned: stays on top (click to unpin)', off: 'Pin: stays on top' }) {
  b.classList.add('pinkey');
  b.classList.toggle('on', on);
  b.setAttribute('aria-pressed', String(on));
  b.title = on ? words.on : words.off;
  b.replaceChildren(pinSvg(on));
}
