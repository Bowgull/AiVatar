// The mini player's checks and sums with no Electron in them (sheet 59, 2026-10-22), so the unit tests can load them.

export type PlayerCmd =
  | { t: 'media.cmd'; op: 'play' | 'pause' | 'toggle' | 'next' | 'prev' }
  | { t: 'media.cmd'; op: 'seek'; position: number }
  | { t: 'media.cmd'; op: 'volume'; volume: number };

const PLAIN = new Set(['play', 'pause', 'toggle', 'next', 'prev']);
/**
 * A key on the player page, as the page says it: { op, value? }. Rebuilt into the brain's `media.cmd` or refused. Only the
 * seven ops; seek is seconds 0..24 h, volume 0..1; anything else (extra fields, strings, NaN) is refused, never fixed.
 */
export function checkPlayerCmd(m: unknown): PlayerCmd | null {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const o = m as Record<string, unknown>;
  const keys = Object.keys(o);
  if (typeof o.op !== 'string' || keys.some((k) => k !== 'op' && k !== 'value')) return null;
  if (PLAIN.has(o.op)) return keys.length === 1 ? { t: 'media.cmd', op: o.op as 'play' } : null;
  const v = o.value;
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  if (o.op === 'seek') return v >= 0 && v <= 24 * 3600 ? { t: 'media.cmd', op: 'seek', position: Math.round(v * 10) / 10 } : null;
  if (o.op === 'volume') return v >= 0 && v <= 1 ? { t: 'media.cmd', op: 'volume', volume: Math.round(v * 100) / 100 } : null;
  return null;
}

/** What the player remembers between runs (his VIS pick, the scene, folded or not, where he left it). */
export interface PlayerPrefs { vis: 'bars' | 'scene' | 'off'; scene: string; shade: boolean; x?: number; y?: number }
export const VIS = new Set(['bars', 'scene', 'off']);
export const SCENES = new Set(['campfire', 'skate', 'rain', 'fishing']);
export function readPrefs(raw: unknown): PlayerPrefs {
  const o = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const p: PlayerPrefs = { vis: VIS.has(o.vis as string) ? o.vis as PlayerPrefs['vis'] : 'bars', scene: SCENES.has(o.scene as string) ? String(o.scene) : 'campfire', shade: o.shade === true };
  if (Number.isFinite(o.x) && Number.isFinite(o.y)) { p.x = Math.round(o.x as number); p.y = Math.round(o.y as number); }
  return p;
}

/** The spring's 0..1 at t seconds (the same sum as the page's playerstate.js spring, and the sheet's). */
export function springAt(t: number, response: number, zeta: number): number {
  if (t <= 0) return 0;
  const w = 2 * Math.PI / response, wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + zeta / Math.sqrt(1 - zeta * zeta) * Math.sin(wd * t));
}

