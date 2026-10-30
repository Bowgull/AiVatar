// Sheet 106 v7 (his yes, 2026-10-30): Samara's notices, on their own see-through layer over the live page (as the
// address bar's list is), so a video never stops for one. Its only doors: what to show, the button he pressed (with the
// TV code or the device he picked), his mouse on it or off, how big it drew, and a download row dragged out or clicked.
// Plain CommonJS, like preload.cjs.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('aangNotice', {
  on: (f) => ipcRenderer.on('notice:show', (_e, m) => f(m)),
  act: (id, act, value) => ipcRenderer.send('notice:act', { id, act, value }),
  hover: (on) => ipcRenderer.send('notice:hover', on === true),
  size: (w, h) => ipcRenderer.send('notice:size', { w, h }),
  drag: (file) => ipcRenderer.send('notice:dldrag', file),
  open: (file) => ipcRenderer.send('notice:dlopen', file),
});
