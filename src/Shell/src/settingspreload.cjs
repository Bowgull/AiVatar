// The Settings tab's only doors (2026-10-12). Least privilege: this page can read the browser's settings, change the
// few switches Settings shows, take entries off his own lists, and ask for three actions. Nothing else: no tabs, no
// pages, no files. Plain CommonJS, like the other preloads.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settings', {
  get: () => ipcRenderer.invoke('settings:get'),
  set: (key, value) => ipcRenderer.send('settings:set', { key, value }),
  remove: (list, value) => ipcRenderer.send('settings:remove', { list, value }),
  act: (act) => ipcRenderer.send('settings:act', act),
  onData(fn) { const h = (_e, d) => fn(d); ipcRenderer.on('settings:data', h); return () => ipcRenderer.removeListener('settings:data', h); },
  onSection(fn) { const h = (_e, s) => fn(s); ipcRenderer.on('settings:section', h); return () => ipcRenderer.removeListener('settings:section', h); },
});
