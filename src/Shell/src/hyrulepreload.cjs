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
