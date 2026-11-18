// Phase 1: the sign-in box's only doors: what to show, his name and password, or cancel. Plain CommonJS, like preload.cjs.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('aangSignin', {
  on: (f) => ipcRenderer.on('signin:show', (_e, m) => f(m)),
  answer: (user, pass) => ipcRenderer.send('signin:answer', String(user ?? '').slice(0, 500), String(pass ?? '').slice(0, 2000)),
  cancel: () => ipcRenderer.send('signin:answer', null, null),
});
