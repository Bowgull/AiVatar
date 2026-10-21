// Test preload for bubble-menu-check.ts: a stand-in for Aang's doors that only records what the page asks for.
window.__copied = [];
window.__sent = [];
// Every listener kept, as the real preload does (the cockpit's typing area listens too, 2026-10-21).
const onMsgs = [];
window.__deliver = (m) => { for (const f of onMsgs) f(m); };
window.aang = new Proxy({
  onMessage(fn) { onMsgs.push(fn); return () => {}; },
  onConnected() { return () => {}; },
  copyText(t) { window.__copied.push(String(t)); },
  onRecall(fn) { window.__recall = fn; return () => {}; },
  recalled(ok) { window.__recalled = ok; },
}, { get(target, k) { return k in target ? target[k] : (...a) => { window.__sent.push([String(k), a]); return () => {}; }; } });
