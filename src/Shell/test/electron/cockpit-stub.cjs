// Test preload for cockpit-check.ts: a stand-in for Aang's doors that records what the page asks for and lets the test
// play the main process (every listener kept, as the real preload does: the cockpit's typing area listens too).
window.__copied = [];
window.__sent = [];
const subs = {};
const on = (name) => (fn) => { (subs[name] ??= []).push(fn); return () => {}; };
window.__fire = (name, v) => { for (const f of subs[name] ?? []) f(v); };
window.__deliver = (m) => window.__fire('onMessage', m);
window.aang = new Proxy({
  onMessage: on('onMessage'), onConnected: on('onConnected'), onCockpit: on('onCockpit'), onInputState: on('onInputState'),
  onChips: on('onChips'), onAsk: on('onAsk'), onFailed: on('onFailed'), onRecall: on('onRecall'), onAim: on('onAim'),
  onUndock: on('onUndock'), onDismiss: on('onDismiss'), onPage: on('onPage'), onBubbleCopy: on('onBubbleCopy'),
  copyText(t) { window.__copied.push(String(t)); },
  // C4 (2026-10-21): the Claude doors, kept apart so a check can read exactly what would reach the brain or the shell.
  claude(m) { window.__sent.push(['claude', [JSON.parse(JSON.stringify(m))]]); },
  openClaude(url) { window.__sent.push(['openClaude', [String(url)]]); },
}, { get(target, k) { return k in target ? target[k] : (...a) => { window.__sent.push([String(k), a]); return () => {}; }; } });
