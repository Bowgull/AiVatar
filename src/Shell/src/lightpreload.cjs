// Autofill's light (sheet 77, 2026-10-23): its only doors are "he clicked me" and "he rolled the wheel on me", and the
// one message Samara sends it (what to show). Plain CommonJS, like preload.cjs.
const { contextBridge, ipcRenderer } = require('electron');
let wheelAt = 0;
contextBridge.exposeInMainWorld('aangLight', {
  on: (f) => ipcRenderer.on('light:show', (_e, m) => f(m)),
  pick: () => ipcRenderer.send('light:pick'),
  // One step per notch, at most one every 120 ms, so a fast trackpad roll does not race through his emails.
  flick: (d) => { const now = Date.now(); if (now - wheelAt < 120) return; wheelAt = now; ipcRenderer.send('light:flick', d > 0 ? 1 : -1); },
});
