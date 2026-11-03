// Sheet 25: "Ask Aang: add the general store to my route". The brain resolves his words to one goal (Core botwroute.ts)
// and sends it here; this keeps it until the Hyrule page can take it (Samara open, the map loaded), so nothing he asked
// for is lost to a closed map or a restart. The page's preload puts it in the map's own queue (hy.routeAdds, which
// app/route.js takes when the map is seen) and the map says how the route came out (hyrule:routereport).
import { existsSync, readFileSync } from 'node:fs';
import { writeFileAtomic } from './atomic.ts';

export interface RouteAsk { id: string; name: string; goal?: Record<string, unknown>; remove?: string; told?: boolean }
const KINDS = new Set(['place', 'item', 'dish', 'armor', 'quest']);

/** One ask as the brain sent it, checked: an id, a name, and a goal of the map's kinds (small) or a name to take off. */
export function routeAsk(raw: unknown): RouteAsk | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' && /^route\d{1,9}$/.test(r.id) ? r.id : null;
  const name = typeof r.name === 'string' ? r.name.slice(0, 80) : '';
  if (!id || !name) return null;
  if (typeof r.remove === 'string' && r.remove.trim()) return { id, name, remove: r.remove.slice(0, 80) };
  const g = r.goal as Record<string, unknown> | undefined;
  if (!g || typeof g !== 'object' || !KINDS.has(String(g.kind)) || JSON.stringify(g).length > 1000) return null;
  return { id, name, goal: g };
}

/** The asks still waiting for the map, kept on disk. */
export class RouteQueue {
  private q: RouteAsk[] = [];
  private readonly file: string;
  constructor(file: string) {
    this.file = file;
    try { const raw = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : []; this.q = (Array.isArray(raw) ? raw : []).map(routeAsk).filter((x): x is RouteAsk => !!x).slice(-50); } catch { this.q = []; }
  }
  get size(): number { return this.q.length; }
  add(a: RouteAsk): void { this.q.push(a); this.q = this.q.slice(-50); this.save(); }
  /** The asks not yet told "queued" to the brain (each is told once), now marked told. */
  untold(): RouteAsk[] { const out = this.q.filter((a) => !a.told); out.forEach((a) => { a.told = true; }); if (out.length) this.save(); return out; }
  /** Everything waiting, handed to the map: the queue empties. */
  take(): RouteAsk[] { const out = this.q; this.q = []; this.save(); return out; }
  private save(): void { try { writeFileAtomic(this.file, JSON.stringify(this.q.map(({ told, ...a }) => a))); } catch { /* best effort */ } }
}

/** What the map said about the route, in the brain's words: its title and the stops still to do. */
export function routeReport(raw: unknown): { title: string; stops: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const stops = Number(r.stops);
  return Number.isInteger(stops) && stops >= 0 && stops < 1000 ? { title: typeof r.title === 'string' ? r.title.slice(0, 80) : '', stops } : null;
}
