// BG5 (AangApp docs/BOTW-STATE.md "notes.json"): what the Hyrule map may ask about his notes, checked before anything
// reaches the brain. The brain checks again (notes.ts cleanPlace); this side only refuses what is plainly not a pin.
import { existsSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type NotePlaceMsg = { t: 'notes.place'; id?: string; title?: string; text?: string; x?: number; z?: number; off?: boolean };
const ID = /^n[a-z0-9]{1,20}$/;
const coord = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 6000;

/** A new pin (x, z, words), a pin moved (id, x, z) or taken off (id, off). Anything else is null. */
export function notePlaceMsg(raw: unknown): NotePlaceMsg | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' && ID.test(r.id) ? r.id : undefined;
  if (r.id !== undefined && !id) return null;
  if (r.off === true) return id ? { t: 'notes.place', id, off: true } : null;
  if (!coord(r.x) || !coord(r.z)) return null;
  const words = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
  if (id) return { t: 'notes.place', id, x: r.x as number, z: r.z as number };
  return { t: 'notes.place', x: r.x as number, z: r.z as number, title: words(r.title, 60), text: words(r.text, 8000) };
}

/** botw/notes.json as text for the map (the brain writes it after every note save), or null when there is none. */
export function hyruleNotesFile(env: NodeJS.ProcessEnv = process.env): string | null {
  const dir = env.AANG_BOTW_DIR || path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Aang', 'botw');
  const f = path.join(dir, 'notes.json');
  try { return existsSync(f) && statSync(f).size < 2_000_000 ? readFileSync(f, 'utf8') : null; } catch { return null; }
}
