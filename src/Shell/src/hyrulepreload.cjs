// BG5: the Hyrule map's only doors (2026-11-03). Least privilege, like the Mockups log: it may read his pinned Zelda notes
// (botw/notes.json), pin a new one at a spot, move or unpin one of them, and open one on his notes board; and (sheet 25)
// say how its route came out after Aang added to it. Nothing else: no tabs, no pages, no files. Every message is checked
// again in the Shell (hyrulenotes.ts, hyruleroute.ts) and in the brain.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hyrule', {
  notes: () => ipcRenderer.invoke('hyrule:notes'),
  notePlace: (x, z, title, text) => ipcRenderer.send('hyrule:noteplace', { x, z, title, text }),
  noteMove: (id, x, z) => ipcRenderer.send('hyrule:noteplace', { id, x, z }),
  noteOff: (id) => ipcRenderer.send('hyrule:noteplace', { id, off: true }),
  noteOpen: (id) => ipcRenderer.send('hyrule:noteopen', id),
  routeReport: (r) => ipcRenderer.send('hyrule:routereport', { title: String(r?.title ?? ''), stops: Number(r?.stops) }),
  // the page's own nudge when Aang queued something (app/aang.js raises the storage event in the page's world)
  onRoute: (fn) => { if (typeof fn === 'function') nudges.push(fn); },
});
const nudges = [];

// The map's two settings-and-menu doors, under the name its pages call (app/spoilers.js, app/addroute.js):
// Settings › Spoilers › Puzzle help, the right-click "Note here" (a Zelda sticky note pinned there, opened to type), and
// (sheet 26c) the "Ask Aang" bar: his words go to Aang as if typed in his box; the answer comes in Aang's bubble.
contextBridge.exposeInMainWorld('aangHyrule', {
  setGuide: (g) => ipcRenderer.send('hyrule:guide', { puzzle: g && g.puzzle }),
  ask: (text) => { ipcRenderer.send('hyrule:ask', String(text ?? '')); },
  newNote: (n) => ipcRenderer.send('hyrule:newnote', { at: n && Array.isArray(n.at) ? [Number(n.at[0]), Number(n.at[1])] : null }),
});

// Sheet 25: "Ask Aang: add the general store to my route". What Aang adds (or takes off) goes in the map's own queue,
// hy.routeAdds ([{ goal, at }] or [{ remove, at }]), the same one the Journal uses; app/route.js takes it when the map is
// seen, or at once when it hears the queue change (the storage event, raised here since this page wrote it itself).
const ADDS = 'hy.routeAdds';
ipcRenderer.on('hyrule:route', (_e, m) => {
  let q = [];
  try { q = JSON.parse(localStorage.getItem(ADDS) || '[]'); } catch {}
  if (!Array.isArray(q)) q = [];
  q.push(m && m.goal ? { goal: m.goal, at: Date.now() } : { remove: String(m && m.remove || ''), at: Date.now() });
  const v = JSON.stringify(q);
  try { localStorage.setItem(ADDS, v); } catch { return; }
  ipcRenderer.send('hyrule:routetook', { id: m && m.id, hidden: document.hidden });
  if (document.hidden) return;
  window.dispatchEvent(new StorageEvent('storage', { key: ADDS, newValue: v }));
  for (const f of nudges) { try { f(v); } catch {} }
});

// The map's save (2026-11-04, his ask: "remember what I did last"). Everything the map and Journal remember lives in hy.*
// localStorage keys, but the page server takes a new port each launch, and a new port is a new origin with empty storage.
// So: put the saved keys back before the page's own scripts run (the file wins: it is the newest copy), then mirror any
// change to the file every few seconds and when the page goes away. Checked again in the Shell (hyruleSaveClean).
const KEEP = /^hy\./;
const snap = () => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && KEEP.test(k)) o[k] = localStorage.getItem(k); } return JSON.stringify(o); };
try {
  const saved = ipcRenderer.sendSync('hyrule:saveload');
  if (saved && typeof saved === 'object') for (const [k, v] of Object.entries(saved)) if (KEEP.test(k) && typeof v === 'string') localStorage.setItem(k, v);
} catch {}
let kept = ''; try { kept = snap(); } catch {}
const keep = () => { let now; try { now = snap(); } catch { return; } if (now !== kept) { kept = now; ipcRenderer.send('hyrule:save', now); } };
setInterval(keep, 3000);
addEventListener('pagehide', keep);
