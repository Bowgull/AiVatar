// BG5 (AangApp docs/BOTW-STATE.md "notes.json"): what the Hyrule map may ask about his notes, checked before anything
// reaches the brain. The brain checks again (notes.ts cleanPlace); this side only refuses what is plainly not a pin.
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { writeFileAtomic } from './atomic.ts';
import os from 'node:os';
import path from 'node:path';

export type NotePlaceMsg = { t: 'notes.place'; id?: string; title?: string; text?: string; x?: number; z?: number; off?: boolean; open?: boolean };
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

/** The BotW folder the brain reads (AANG_BOTW_DIR in tests). */
export function botwFolder(env: NodeJS.ProcessEnv = process.env): string {
  return env.AANG_BOTW_DIR || path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Aang', 'botw');
}

/**
 * Settings › Spoilers › Puzzle help (his approved design): 'hints' (the default, his rule) or 'straight'. Kept beside
 * state.json as guide-settings.json, which the guide tools read (Core botw.ts). Anything else is ignored.
 */
export function writeGuide(raw: unknown, env: NodeJS.ProcessEnv = process.env): boolean {
  const puzzle = (raw as { puzzle?: unknown } | null)?.puzzle;
  if (puzzle !== 'hints' && puzzle !== 'straight') return false;
  const dir = botwFolder(env), f = path.join(dir, 'guide-settings.json');
  let was: Record<string, unknown> = {};
  try { was = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {}; } catch { was = {}; }
  if (was.puzzle === puzzle) return true;
  try { mkdirSync(dir, { recursive: true }); writeFileAtomic(f, JSON.stringify({ ...was, puzzle })); return true; } catch { return false; }
}

/** botw/notes.json as text for the map (the brain writes it after every note save), or null when there is none. */
export function hyruleNotesFile(env: NodeJS.ProcessEnv = process.env): string | null {
  const f = path.join(botwFolder(env), 'notes.json');
  try { return existsSync(f) && statSync(f).size < 2_000_000 ? readFileSync(f, 'utf8') : null; } catch { return null; }
}
