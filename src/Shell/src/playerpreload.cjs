// Sheet 59, the Spotify mini player (2026-10-22): this page's only doors. It hears what is playing and its own settings;
// it can press the seven keys (checked again in miniplayer.ts and in the brain),
// change its VIS mode or scene, fold, pin, fade, be dragged, or close. It never names an app, a song or a link. Plain
// CommonJS, like the other preloads.
const { contextBridge, ipcRenderer } = require('electron');

const on = (ch) => (fn) => { const h = (_e, v) => fn(v); ipcRenderer.on(ch, h); return () => ipcRenderer.removeListener(ch, h); };
contextBridge.exposeInMainWorld('player', {
  onMedia: on('player:media'),
  onUi: on('player:ui'),
  onAwake: on('player:awake'),
  ready: () => ipcRenderer.send('player:ready'),
  cmd: (op, value) => ipcRenderer.send('player:cmd', typeof value === 'number' ? { op: String(op), value } : { op: String(op) }),
  vis: (v) => ipcRenderer.send('player:vis', String(v)),
  scene: (s) => ipcRenderer.send('player:scene', String(s)),
  shade: () => ipcRenderer.send('player:shade'),
  pin: () => ipcRenderer.send('player:pin'),
  opacity: (n) => ipcRenderer.send('player:opacity', Number(n)),
  drag: (a) => ipcRenderer.send('player:drag', a && typeof a === 'object' ? { phase: String(a.phase), dx: Number(a.dx) || 0, dy: Number(a.dy) || 0 } : null),
  close: () => ipcRenderer.send('player:close'),
});

// ---------------------------------------------------------------- the window family (familywin.ts, 2026-10-22)
// The SAME block as at the end of preload.cjs (a sandboxed preload cannot require a shared file). Only ever switched on
// by the main process for a pop-out that is a member of the family; in every other window it does nothing. It measures
// the member's visible panel (so snapping lines up the panels, not the see-through room round them), squares the panel's
// joined sides, draws the gold rim while the group is pulled apart, and, while the window is joined or wiggling, turns a
// right-click into the ONE family menu (his rule).
(() => {
  let st = { on: false, joined: false, wiggle: false, held: false, sides: [], square: [], through: false, pad: null, card: null };
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
    h.dataset.famSq = (st.square || []).join(' ');
    h.classList.toggle('fam-through', !!st.through);
    // A window cut by a region (the video joined) grew by its resize borders: padded back to what shows.
    const pd = st.pad;
    h.style.padding = pd ? `${pd.t}px ${pd.r}px ${pd.b}px ${pd.l}px` : '';
    h.classList.toggle('fam-joined', !!st.joined);
    h.classList.toggle('fam-wiggle', !!st.wiggle);
    h.classList.toggle('fam-held', !!st.held);
    measure();
  };
  ipcRenderer.on('family:state', (_e, s) => {
    if (!s || typeof s !== 'object') return;
    st = { on: true, joined: s.joined === true, wiggle: s.wiggle === true, held: s.held === true, sides: Array.isArray(s.sides) ? s.sides.filter((x) => ['left', 'right', 'above', 'below'].includes(x)) : [], square: Array.isArray(s.square) ? s.square.filter((x) => ['tl', 'tr', 'br', 'bl'].includes(x)) : [], through: s.through === true, pad: s.pad && typeof s.pad === 'object' && ['t', 'r', 'b', 'l'].every((k) => Number.isFinite(s.pad[k]) && s.pad[k] >= 0 && s.pad[k] <= 40) ? { t: s.pad.t, r: s.pad.r, b: s.pad.b, l: s.pad.l } : null, card: typeof s.card === 'string' ? s.card : null };
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
