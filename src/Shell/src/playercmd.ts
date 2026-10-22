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

/**
 * What the player remembers between runs. 2026-10-22 (his report: "the bars / scene thing is so confusing"): the old VIS
 * key (BARS -> SCENE -> OFF) is gone; two plain choices in the player's own menu instead. `picture` is what sits in the
 * picture spot (the album cover, or one of the four looping scenes); `bars` is the dancing bars on the screen, on or off.
 * Folded or not, and where he left it. An old file (vis + scene) is read into the new two.
 */
export interface PlayerPrefs { picture: string; bars: boolean; shade: boolean; x?: number; y?: number }
export const SCENES = new Set(['campfire', 'skate', 'rain', 'fishing']);
export const PICTURES = new Set(['cover', ...SCENES]);
export function readPrefs(raw: unknown): PlayerPrefs {
  const o = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const pic = typeof o.picture === 'string' && PICTURES.has(o.picture) ? o.picture
    : o.vis === 'scene' && typeof o.scene === 'string' && SCENES.has(o.scene) ? o.scene : 'cover';
  const bars = typeof o.bars === 'boolean' ? o.bars : o.vis !== 'off';
  const p: PlayerPrefs = { picture: pic, bars, shade: o.shade === true };
  if (Number.isFinite(o.x) && Number.isFinite(o.y)) { p.x = Math.round(o.x as number); p.y = Math.round(o.y as number); }
  return p;
}

/** The spring's 0..1 at t seconds (the same sum as the page's playerstate.js spring, and the sheet's). */
export function springAt(t: number, response: number, zeta: number): number {
  if (t <= 0) return 0;
  const w = 2 * Math.PI / response, wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + zeta / Math.sqrt(1 - zeta * zeta) * Math.sin(wd * t));
}


/** A Spotify device in the player's menu (Spotify Connect, 2026-10-22: the brain's media.devices, checked again here). */
export interface PlayerDevice { id: string; name: string; kind: string; active: boolean }
const KINDS = new Set(['phone', 'computer', 'speaker', 'tv', 'car', 'other']);
export const DEVICE_ID = /^[A-Za-z0-9_-]{1,128}$/;
/** The brain's device list, kept only as plain short fields; odd ids dropped. */
export function readDevices(m: unknown): { devices: PlayerDevice[]; error: string | null } {
  const o = m && typeof m === 'object' ? m as Record<string, unknown> : {};
  const list = Array.isArray(o.devices) ? o.devices : [];
  const devices = list.slice(0, 12).flatMap((d): PlayerDevice[] => {
    if (!d || typeof d !== 'object') return [];
    const x = d as Record<string, unknown>;
    if (typeof x.id !== 'string' || !DEVICE_ID.test(x.id)) return [];
    const name = typeof x.name === 'string' ? x.name.trim().slice(0, 40) : '';
    return [{ id: x.id, name: name || 'Spotify', kind: typeof x.kind === 'string' && KINDS.has(x.kind) ? x.kind : 'other', active: x.active === true }];
  });
  return { devices, error: typeof o.error === 'string' ? o.error.slice(0, 80) : null };
}
