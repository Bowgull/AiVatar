// Sheet 62, a pinned snip (2026-10-22): this page's only doors. It hears its own picture and can ask to be clickable,
// dragged, pinned, faded or closed. It never names a file or a window: pinsnip.ts knows which window this is.
// Plain CommonJS, like the other preloads.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pinsnip', {
  onData(fn) { const h = (_e, d) => fn(d); ipcRenderer.on('pinsnip:data', h); return () => ipcRenderer.removeListener('pinsnip:data', h); },
  clickable: on => ipcRenderer.send('pinsnip:clickable', on === true),
  drag: a => ipcRenderer.send('pinsnip:drag', a),
  pin: () => ipcRenderer.send('pinsnip:pin'),
  opacity: n => ipcRenderer.send('pinsnip:opacity', Number(n)),
  close: () => ipcRenderer.send('pinsnip:close'),
});
