// Sheet 102 (his pick, 2026-10-29): the address bar's list, on its own layer over the live page (as the tab list is),
// so the page is never swapped for a still picture of itself. Its only doors: what to show, the row he points at or
// clicks, and how tall it drew. Plain CommonJS, like preload.cjs.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('aangSuggest', {
  on: (f) => ipcRenderer.on('suggest:show', (_e, m) => f(m)),
  act: (act, i) => ipcRenderer.send('suggest:act', { act, i }),
  size: (h) => ipcRenderer.send('suggest:size', h),
});
