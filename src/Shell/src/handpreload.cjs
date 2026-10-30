// Sheet 109: the hand card's layer (pages/handcard.html). Its only doors: what to show, Hand back with his note, and how
// tall it drew. Plain CommonJS, like preload.cjs.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('aangHand', {
  on: (f) => ipcRenderer.on('hand:show', (_e, m) => f(m)),
  back: (note) => ipcRenderer.send('hand:back', String(note ?? '').slice(0, 300)),
  size: (h) => ipcRenderer.send('hand:size', Number(h) || 0),
});
