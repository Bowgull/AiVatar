// Sheet 100: the Mockups quest log's only doors (2026-10-28). Least privilege, as Settings: it can read the mockups'
// tree (titles, versions, marks, picture addresses) and open one version. Nothing else: no tabs, no pages,
// no files. Plain CommonJS, like the other preloads.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mocklog', {
  get: () => ipcRenderer.invoke('mocklog:get'),
  show: (id) => ipcRenderer.send('mocklog:show', id),
  onData(fn) { const h = (_e, d) => fn(d); ipcRenderer.on('mocklog:data', h); return () => ipcRenderer.removeListener('mocklog:data', h); },
});
