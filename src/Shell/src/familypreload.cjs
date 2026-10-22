// The window family's menu + catcher (familywin.ts FamilyOverlay): this page's only doors. It hears what to show, says
// the menu's shape, his pick (see-through value, pin, pull apart, or close), and "end" (Esc or a click on the empty
// desktop while a group is pulled apart). Nothing else. Plain CommonJS, like the other preloads.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('family', {
  on(fn) { const h = (_e, m) => fn(m); ipcRenderer.on('family:overlay', h); return () => ipcRenderer.removeListener('family:overlay', h); },
  shape: rects => ipcRenderer.send('family:shape', rects),
  pick: (what, value) => ipcRenderer.send('family:pick', { what: String(what), value: typeof value === 'number' ? value : undefined }),
  end: () => ipcRenderer.send('family:end'),
});
