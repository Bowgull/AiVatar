// Sheet 100: the Mockups quest log's only doors (2026-10-28). Least privilege, as Settings: it can read the mockups'
// tree (titles, versions, marks, the addresses the sheets open at), say a sheet was opened (sheet 107: its NEW goes),
// mark a version, send one to Aang, and leave (sheet 107 v4: Back to Samara, Esc). Nothing else: no tabs, no pages, no files. Plain CommonJS, like the other preloads.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mocklog', {
  get: () => ipcRenderer.invoke('mocklog:get'),
  seen: (sheet) => ipcRenderer.send('mocklog:seen', sheet),
  stage: (id, to, note) => ipcRenderer.send('mocklog:stage', { id, to, note }),
  send: (id) => ipcRenderer.send('mocklog:send', id),
  leave: () => ipcRenderer.send('mocklog:leave'),
  onEsc(fn) { const h = () => fn(); ipcRenderer.on('mocklog:esc', h); return () => ipcRenderer.removeListener('mocklog:esc', h); },
  onData(fn) { const h = (_e, d) => fn(d); ipcRenderer.on('mocklog:data', h); return () => ipcRenderer.removeListener('mocklog:data', h); },
});
