// BG5 (docs/BOTW-GUIDE.md): notes on the Hyrule map. His decision: a note pinned on the map IS a sticky note, one note in
// two places, in one Zelda category. notes.ts keeps the note (with its `place`); this file hands the placed ones to the
// map as `notes.json` beside state.json (the contract is in docs/BOTW-STATE.md), and holds the two hooks he has not
// said yes to yet, each behind a switch that is off.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from './atomic.ts';
import { nearNotes } from './botwwatch.ts';
import type { BotwState } from './botwsave.ts';
import { plainOf, type Note } from './notes.ts';
import { readJson } from './store.ts';

export interface BotwMapNote {
  id: string; title: string; cat: string; lines: string[]; html: string;
  x: number; z: number; updated: string;
}
export interface BotwNotesFile { v: 1; writtenAt: string; own: string[]; notes: BotwMapNote[] }

/** The map's copy: every note with a BotW place, newest first. Plain data; the note itself stays in notes.json (state). */
export function botwNotesFile(notes: Note[], own: string[], now = Date.now()): BotwNotesFile {
  return {
    v: 1, writtenAt: new Date(now).toISOString(), own: [...own],
    notes: notes.filter(n => n.place?.game === 'botw').map(n => ({
      id: n.id, title: n.title, cat: n.cat ?? '', lines: plainOf(n.html), html: n.html,
      x: n.place!.x, z: n.place!.z, updated: new Date(n.updated).toISOString(),
    })),
  };
}

/**
 * Rewrite `<dir>/notes.json` (atomic). Only once there is something to show: a machine that never pinned a note (the
 * Mac) gets no botw folder; once the file exists it is kept current, so the last pin taken off empties it.
 */
export function writeBotwNotes(dir: string, notes: Note[], own: string[], now = Date.now()): boolean {
  const file = path.join(dir, 'notes.json');
  const data = botwNotesFile(notes, own, now);
  if (!data.notes.length && !existsSync(file)) return false;
  writeFileAtomic(file, JSON.stringify(data, null, 1));
  return true;
}

// ------------------------------------------------------------------ the hooks waiting on his yes

/**
 * `<dir>/note-settings.json`. Both picks are recommended but NOT confirmed (BOTW-GUIDE.md "His decisions"), so both are
 * off unless the file says `true`. A missing or broken file = off.
 *   keepOffer: a snip (or message) about BotW with "remember this" asks "Keep as a note?" and pins it where he saved.
 *   afterPlay: the after-play "today" line also names a Zelda note near where he stopped.
 */
export interface BotwNoteSettings { keepOffer: boolean; afterPlay: boolean }
export function botwNoteSettings(dir: string): BotwNoteSettings {
  const raw = readJson<Record<string, unknown>>(path.join(dir, 'note-settings.json'), {});
  return { keepOffer: raw.keepOffer === true, afterPlay: raw.afterPlay === true };
}

/** "remember this", "aang, remember this: the cave behind the waterfall". The words after it, or '' for none; null = not this. */
export function rememberThis(text: string): string | null {
  const m = /^(?:(?:hey|ok|okay|aang)[,!]?\s+)*(?:please\s+)?remember\s+this\b[\s:,.!-]*([\s\S]*)$/i.exec(String(text ?? '').trim());
  return m ? m[1]!.trim().slice(0, 2000) : null;
}

/** What "Keep as a note?" pins, on a yes: his words at the spot he saved (state.json pos). */
export function rememberPin(words: string, st: BotwState): { title: string; text: string; x: number; z: number } {
  const first = words.split('\n')[0]!.trim();
  const title = first ? first.split(/\s+/).slice(0, 5).join(' ') : `Saved spot, ${st.pos.square || 'Hyrule'}`;
  return { title, text: words || 'Remembered here.', x: st.pos.x, z: st.pos.z };
}

/** The after-play addition: a Zelda note near where he stopped, or null. Never anything about what is left. */
export function afterPlayNote(notes: Note[], st: BotwState | null): string | null {
  if (!st) return null;
  const near = nearNotes(notes, st);
  if (!near.length) return null;
  return near.length === 1 ? `Your note "${near[0]!.title}" is near where you stopped.` : `${near.length} of your Zelda notes are near where you stopped.`;
}
