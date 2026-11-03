// BG5: the Hyrule map's only doors (2026-11-03). Least privilege, like the Mockups log: it may read his pinned Zelda notes
// (botw/notes.json), pin a new one at a spot, move or unpin one of them, and open one on his notes board. Nothing else:
// no tabs, no pages, no files. Every message is checked again in the Shell (hyrulenotes.ts) and in the brain (notes.ts).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hyrule', {
  notes: () => ipcRenderer.invoke('hyrule:notes'),
  notePlace: (x, z, title, text) => ipcRenderer.send('hyrule:noteplace', { x, z, title, text }),
  noteMove: (id, x, z) => ipcRenderer.send('hyrule:noteplace', { id, x, z }),
  noteOff: (id) => ipcRenderer.send('hyrule:noteplace', { id, off: true }),
  noteOpen: (id) => ipcRenderer.send('hyrule:noteopen', id),
});
