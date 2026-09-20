// THROWAWAY measurement spike - decides the window technology, is not the product.
// Placement and size copy the Rainmeter Aang window (1417,882 470x310) so the comparison is fair.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let win;
app.whenReady().then(() => {
  win = new BrowserWindow({
    x: 1430, y: 740, width: 470, height: 310,
    transparent: true, frame: false, resizable: false, hasShadow: false,
    alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false, title: 'AangSpike',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile('index.html', { query: { fps: process.env.SPIKE_FPS || '30' } });
  win.once('ready-to-show', () => { win.showInactive(); console.log('READY'); });
});

// renderer tells us when the pointer is over something solid (sprite / bubble)
ipcMain.on('hit', (_e, over) => { if (win) win.setIgnoreMouseEvents(!over, { forward: true }); });
// test hooks so the harness can flip state without moving the real mouse
ipcMain.on('test-ignore', (_e, v) => { if (win) win.setIgnoreMouseEvents(v, { forward: true }); });
process.stdin.on('data', d => {
  const c = String(d).trim();
  if (c === 'ignore') win.setIgnoreMouseEvents(true, { forward: true });
  if (c === 'capture') win.setIgnoreMouseEvents(false);
  if (c === 'quit') app.quit();
});
app.on('window-all-closed', () => app.quit());
