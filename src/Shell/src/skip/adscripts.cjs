// Ad page tricks (uBlock's scriptlets) at the very start of every page, before the page's own scripts (2026-11-13).
//
// The tricks fool a site's "ad blocker detected" check and strip ads out of YouTube's player data, so they only work
// if they run first. Ghostery's preload asks for them over an async message and runs them whenever the answer lands,
// often after the page has already looked. This asks synchronously (a few milliseconds) and runs them at once.
// Registered on the session by ads.ts, next to Ghostery's preload, which still hides the empty boxes.
'use strict';
const { ipcRenderer, webFrame } = require('electron');

try {
  const url = window.location.href;
  if (/^https?:/.test(url)) {
    const scripts = ipcRenderer.sendSync('samara:adblock:scripts', url);
    // Each in its own block: several tricks declare the same helper (`class JSONPath`), and in one shared scope the
    // second one fails to run at all (adtricks-check, 2026-11-13).
    if (Array.isArray(scripts)) for (const s of scripts) webFrame.executeJavaScript('{\n' + String(s) + '\n}').catch(() => { /* a trick that throws breaks nothing */ });
  }
} catch { /* no blocker for this session */ }
