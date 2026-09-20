const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('spike', { hit: over => ipcRenderer.send('hit', over) });
