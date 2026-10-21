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
