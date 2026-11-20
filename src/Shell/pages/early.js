// Samara's first moment (his ask, 2026-11-20): he grabs the address bar while the window is still opening. The bar's
// own code (browser.js, a module) loads a beat later, so until then this keeps his letters and his click on the bar.
// browser.js takes them and switches this off (window.__early = null).
window.__early = { keys: '', click: false, enter: false };
addEventListener('keydown', (e) => {
  const w = window.__early;
  // Only the first few seconds: after that the bar's own code has it, and keys on the band are left alone.
  if (!w || performance.now() > 8000 || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key.length === 1) w.keys += e.key;
  else if (e.key === 'Backspace') w.keys = w.keys.slice(0, -1);
  else if (e.key === 'Enter' && w.keys.trim()) w.enter = true;
  else return;
  e.preventDefault();
}, true);
addEventListener('mousedown', (e) => {
  const w = window.__early;
  if (w && performance.now() <= 8000 && e.target instanceof Element && e.target.closest('#slot')) w.click = true;
}, true);
