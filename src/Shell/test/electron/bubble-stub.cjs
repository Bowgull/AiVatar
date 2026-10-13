// Test preload for bubble-menu-check.ts: a stand-in for Aang's doors that only records what the page asks for.
window.__copied = [];
window.__sent = [];
let onMsg = null;
window.__deliver = (m) => onMsg && onMsg(m);
window.aang = new Proxy({
  onMessage(fn) { onMsg = fn; return () => {}; },
  onConnected() { return () => {}; },
  copyText(t) { window.__copied.push(String(t)); },
}, { get(target, k) { return k in target ? target[k] : (...a) => { window.__sent.push([String(k), a]); return () => {}; }; } });
