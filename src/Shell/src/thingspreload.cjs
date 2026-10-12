// Your things (History and Downloads, 2026-10-12): this page's only doors. Least privilege: it can read his History
// and the downloads list, take entries off them, open a History page in a new tab, and open, show or drag a
// download by its number. No paths, no tabs, no settings. Plain CommonJS, like the other preloads.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('things', {
  history: (q, offset) => ipcRenderer.invoke('things:history', { q, offset }),
  downloads: () => ipcRenderer.invoke('things:downloads'),
  hist: (act, url, at) => ipcRenderer.send('things:hist', { act, url, at }),
  dl: (act, id) => ipcRenderer.send('things:dl', { act, id }),
  drag: id => ipcRenderer.send('things:dldrag', id),
  open: url => ipcRenderer.send('things:open', url),
  go: where => ipcRenderer.send('things:go', where),
  onChanged(fn) { const h = (_e, w) => fn(w); ipcRenderer.on('things:changed', h); return () => ipcRenderer.removeListener('things:changed', h); },
  onSection(fn) { const h = (_e, s) => fn(s); ipcRenderer.on('things:section', h); return () => ipcRenderer.removeListener('things:section', h); },
});
