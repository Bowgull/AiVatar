// Sheet 52, the Claude job pop-out (2026-10-21): this page's only doors. Least privilege: it hears its own job, and can
// ask to be clickable, to be a given height, to be dragged, pinned or faded, for Pause / Play / Open in Claude / the
// question / the purple message key, and "Nice". It never names a session, a link or a message: the main process
// (jobpop.ts) knows which job this window is for and builds every request itself. Plain CommonJS, like the other preloads.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jobpop', {
  onData(fn) { const h = (_e, d) => fn(d); ipcRenderer.on('jobpop:data', h); return () => ipcRenderer.removeListener('jobpop:data', h); },
  onLeave(fn) { const h = (_e, why) => fn(why); ipcRenderer.on('jobpop:leave', h); return () => ipcRenderer.removeListener('jobpop:leave', h); },
  ready: () => ipcRenderer.send('jobpop:ready'),
  clickable: on => ipcRenderer.send('jobpop:clickable', on === true),
  size: h => ipcRenderer.send('jobpop:size', Number(h)),
  drag: a => ipcRenderer.send('jobpop:drag', a),
  pin: () => ipcRenderer.send('jobpop:pin'),
  opacity: n => ipcRenderer.send('jobpop:opacity', Number(n)),
  act: what => ipcRenderer.send('jobpop:act', String(what)),
  nice: () => ipcRenderer.send('jobpop:nice'),
});

// ---------------------------------------------------------------- the window family (familywin.ts, 2026-10-22)
// The SAME block as at the end of preload.cjs (a sandboxed preload cannot require a shared file). Only ever switched on
// by the main process for a pop-out that is a member of the family; in every other window it does nothing. It measures
// the member's visible panel (so snapping lines up the panels, not the see-through room round them), squares the panel's
// joined sides, draws the gold rim while the group is pulled apart, and, while the window is joined or wiggling, turns a
// right-click into the ONE family menu (his rule).
(() => {
  let st = { on: false, joined: false, wiggle: false, held: false, sides: [], card: null };
  let cardEl = null, ro = null, mo = null, sent = '';
  // Its look (square joined sides, the gold rim) is put in by the main process (insertCSS: the pages' own rules forbid
  // a <style> from here).
  const measure = () => {
    if (!st.on || !document.documentElement) return;
    if (st.card && (!cardEl || !cardEl.isConnected)) {
      cardEl = document.querySelector(st.card);
      if (cardEl) {
        if (getComputedStyle(cardEl).position === 'static') cardEl.style.position = 'relative';
        try { ro?.disconnect(); ro = new ResizeObserver(measure); ro.observe(cardEl); } catch { /* old page */ }
      }
    }
    // The page may redraw its panel's insides: the rim is put back whenever it went.
    if (cardEl && !cardEl.querySelector(':scope > .fam-rim')) { const rim = document.createElement('div'); rim.className = 'fam-rim'; cardEl.append(rim); }
    if (st.card && !cardEl) {
      // The page has not drawn its panel yet: look again as soon as it does.
      if (!mo) { mo = new MutationObserver(() => { if (document.querySelector(st.card)) { mo.disconnect(); mo = null; measure(); } }); mo.observe(document.documentElement, { childList: true, subtree: true }); }
      return;
    }
    const r = cardEl ? cardEl.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
    const k = [r.left, r.top, r.width, r.height].map(Math.round).join(',');
    if (k === sent) return;
    sent = k;
    ipcRenderer.send('family:card', { x: r.left, y: r.top, width: r.width, height: r.height });
  };
  const paint = () => {
    const h = document.documentElement;
    if (!h) return;
    h.dataset.famJoin = (st.sides || []).join(' ');
    h.classList.toggle('fam-joined', !!st.joined);
    h.classList.toggle('fam-wiggle', !!st.wiggle);
    h.classList.toggle('fam-held', !!st.held);
    measure();
  };
  ipcRenderer.on('family:state', (_e, s) => {
    if (!s || typeof s !== 'object') return;
    st = { on: true, joined: s.joined === true, wiggle: s.wiggle === true, held: s.held === true, sides: Array.isArray(s.sides) ? s.sides.filter((x) => ['left', 'right', 'above', 'below'].includes(x)) : [], card: typeof s.card === 'string' ? s.card : null };
    if (s.remeasure) sent = '';
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint, { once: true }); else paint();
  });
  window.addEventListener('resize', () => measure());
  window.addEventListener('contextmenu', (e) => {
    if (!st.joined && !st.wiggle) return;
    e.preventDefault(); e.stopImmediatePropagation();
    ipcRenderer.send('family:context', { x: e.screenX, y: e.screenY });
  }, true);
})();
