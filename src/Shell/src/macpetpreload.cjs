// Sheet 101 (2026-10-28): the pet page's only bridge, on the Mac. Plain CommonJS for the same reason as preload.cjs (a
// sandboxed preload is loaded by Chromium, not Node). Named doors only, each checked again by macaang.ts.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('pet', {
  onFrames: (fn) => ipcRenderer.on('pet:frames', (_e, all) => fn(all)),
  onState: (fn) => ipcRenderer.on('pet:state', (_e, s) => fn(s)),
  solid: (on) => ipcRenderer.send('pet:solid', on === true),
  click: (where) => ipcRenderer.send('pet:click', where === 'mark' ? 'mark' : 'aang'),
  context: (x, y) => ipcRenderer.send('pet:context', Number(x) || 0, Number(y) || 0),
  drag: (phase, x, y) => ipcRenderer.send('pet:drag', String(phase), Number(x) || 0, Number(y) || 0),
  hold: (phase, x, y) => ipcRenderer.send('pet:hold', String(phase), Number(x) || 0, Number(y) || 0),
  // Files dropped on him: their real paths (only the main process and the brain decide what may be read).
  drop: (phase, files) => ipcRenderer.send('pet:drop', String(phase), Array.isArray(files) ? files.map((f) => { try { return webUtils.getPathForFile(f); } catch { return ''; } }).filter(Boolean) : []),
});
