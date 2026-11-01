// The Satchel (sheet 116, 2026-11-01): the doors its two pages have, the Satchel and its peeking tab. Each names a clip
// by its id only; satchel.ts knows which window is speaking, holds the clips and does the copying, dragging and keeping.
// Plain CommonJS, like the other preloads.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = (ch) => (fn) => { const h = (_e, d) => fn(d); ipcRenderer.on(ch, h); return () => ipcRenderer.removeListener(ch, h); };
// What he dropped: real file paths (webUtils, the page never sees them otherwise), or dragged words.
const dropped = (files, text) => ({ paths: Array.from(files ?? []).map((f) => { try { return webUtils.getPathForFile(f); } catch { return ''; } }).filter(Boolean).slice(0, 20), text: String(text ?? '').slice(0, 100000) });

contextBridge.exposeInMainWorld('satchel', {
  onData: on('satchel:data'),
  onOpen: on('satchel:open'),
  onClose: on('satchel:close'),
  onPeek: on('satchel:peek'),
  copy: (id) => ipcRenderer.send('satchel:copy', String(id)),
  pin: (id) => ipcRenderer.send('satchel:pin', String(id)),
  bin: (id) => ipcRenderer.send('satchel:bin', String(id)),
  note: (id) => ipcRenderer.send('satchel:note', String(id)),
  ask: (id) => ipcRenderer.send('satchel:ask', String(id)),
  // The drag has to start while the mouse button is still down: synchronous, like Edge-Drop's.
  drag: (id) => ipcRenderer.sendSync('satchel:drag', String(id)),
  drop: (files, text) => ipcRenderer.send('satchel:drop', dropped(files, text)),
  close: () => ipcRenderer.send('satchel:close'),
  closed: () => ipcRenderer.send('satchel:closed'),
  tabClick: () => ipcRenderer.send('satchel:tabclick'),
  tabHover: (on) => ipcRenderer.send('satchel:tabhover', on === true),
  tabHidden: () => ipcRenderer.send('satchel:tabhidden'),
});
