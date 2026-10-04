// The only bridge between a page Aang draws and the app around it.
//
// PLAIN COMMONJS JAVASCRIPT ON PURPOSE, and this was settled by test on 2026-10-04, not assumed
// (step 6.2). Electron 44 runs the MAIN process straight from TypeScript, the same as the brain does.
// A sandboxed preload cannot: it is loaded by Chromium rather than Node, it does not strip types, and
// it must be CommonJS. The first run failed with "Cannot use import statement outside a module".
// So this one file stays hand-written JavaScript rather than adding a build step to the whole project.
// Its shape is declared for TypeScript in bridge.ts, which pages and tests use.
//
// Deliberately tiny. Everything here is reachable by anything that gets to run inside a window, so the
// rule is: no general "call the brain with this" door. Each thing a window may do is named, and the
// main process checks it. A page cannot invent a new one.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aang', {
  /** Hear messages from the brain. Returns a function that stops listening. */
  onMessage(fn) {
    const h = (_e, m) => fn(m);
    ipcRenderer.on('brain:message', h);
    return () => { ipcRenderer.off('brain:message', h); };
  },
  /** Hear whether the brain is reachable. */
  onConnected(fn) {
    const h = (_e, up) => fn(up);
    ipcRenderer.on('brain:connected', h);
    return () => { ipcRenderer.off('brain:connected', h); };
  },
  /** Which window this is, so one page can be used in more than one place. */
  windowKind: () => ipcRenderer.invoke('shell:windowKind'),

  // --- the pop-out. Each one is named; there is no general "do this" door.
  /** Hear what to play. The address is built in the main process; the page never makes one. */
  onPopout(fn) {
    const h = (_e, v) => fn(v);
    ipcRenderer.on('popout:show', h);
    return () => { ipcRenderer.off('popout:show', h); };
  },
  /** Out of the way, still playing. */
  popoutHide: () => ipcRenderer.send('popout:hide'),
  popoutClose: () => ipcRenderer.send('popout:close'),
});
