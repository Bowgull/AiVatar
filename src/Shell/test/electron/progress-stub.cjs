// Test preload for progress-check.ts (2026-10-21): stand-ins for the doors Samara's rune layer and the job pop-out
// use, so the check can hand them the brain's claude.jobs and open the rune panel without the real browser or main
// process. Records what the pages ask for in window.__sent; nothing here reaches the brain, the clipboard or input.
window.__sent = [];
const subs = {};
const on = (name) => (fn) => { (subs[name] ??= []).push(fn); return () => {}; };
window.__fire = (name, v) => { for (const f of subs[name] ?? []) f(v); };
window.aang = new Proxy({
  onBrowserClaude: on('onBrowserClaude'), onBrowserRune: on('onBrowserRune'),
}, { get(target, k) { return k in target ? target[k] : (...a) => { window.__sent.push([String(k), a]); return () => {}; }; } });
window.jobpop = new Proxy({ onData: on('jobpop:data'), onLeave: on('jobpop:leave') },
  { get(target, k) { return k in target ? target[k] : (...a) => { window.__sent.push(['jobpop.' + String(k), a]); }; } });
