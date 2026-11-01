// The Satchel's tab (sheet 116 v2, look A): it peeks out of the middle of the right edge while his mouse is there, and a
// click opens the Satchel. Dropping something on it keeps it and opens the Satchel. satchel.ts shows this little window
// only while it peeks, so it never sits over anything.
import { spr, loadTex } from './satchelpix.js';

function spring({ response, damping }) {
  const w = (2 * Math.PI) / response, dt = 1 / 600; let x = 0, v = 0, t = 0; const pts = [[0, 0]];
  while (t < 3) { v += (-(w * w) * (x - 1) - 2 * damping * w * v) * dt; x += v * dt; t += dt; if (Math.abs(1 - x) < 0.0015 && Math.abs(v) < 0.02) { pts.push([t, 1]); break; } if (Math.round(t * 600) % 12 === 0) pts.push([t, x]); }
  const T = pts[pts.length - 1][0];
  return { css: 'linear(' + pts.map(([tt, xx]) => `${xx.toFixed(3)} ${(100 * tt / T).toFixed(1)}%`).join(', ') + ')', ms: Math.round(T * 1000) };
}
const peek = spring({ response: 0.34, damping: 0.62 }), back = spring({ response: 0.24, damping: 1 });
const root = document.documentElement.style;
root.setProperty('--peek-ease', peek.css); root.setProperty('--peek-ms', peek.ms + 'ms');
root.setProperty('--close-ease', back.css); root.setProperty('--close-ms', back.ms + 'ms');
await loadTex('band.png', 'tray.png');

const tab = document.getElementById('tab');
tab.append(spr(['....OOOOOOO....', '...OBBBBBBBO...', '..OBO.....OBO..', '..OB.......BO..', 'OOOOOOOOOOOOOOO', 'OLLLLLLLLLLLLLO', 'OLLLLLGGGLLLLLO', 'OHHHHHGYGHHHHHO', 'OLLLLLGGGLLLLLO', 'OLLLLLLLLLLLLLO', 'OLLLLLLLLLLLLLO', 'OSSSSSSSSSSSSSO', '.OOOOOOOOOOOOO.'],
  { O: '#2c1c10', B: '#7a5532', L: '#a8743c', H: '#8a5a2a', S: '#6a4422', G: '#c98c14', Y: '#ffe096' }, { drop: 'rgba(0,0,0,.4)' }));
let hideT = null;
window.satchel?.onPeek((on) => {
  clearTimeout(hideT);
  if (on) { tab.classList.add('peek'); return; }
  tab.classList.remove('peek');
  hideT = setTimeout(() => window.satchel?.tabHidden(), back.ms + 40);
});
tab.addEventListener('mouseenter', () => window.satchel?.tabHover(true));
tab.addEventListener('mouseleave', () => window.satchel?.tabHover(false));
tab.addEventListener('click', () => window.satchel?.tabClick());
document.addEventListener('dragover', (e) => { e.preventDefault(); tab.classList.add('hot', 'peek'); window.satchel?.tabHover(true); });
document.addEventListener('dragleave', () => tab.classList.remove('hot'));
document.addEventListener('drop', (e) => { e.preventDefault(); tab.classList.remove('hot'); window.satchel?.drop(e.dataTransfer?.files, e.dataTransfer?.getData('text/plain')); window.satchel?.tabClick(); });
