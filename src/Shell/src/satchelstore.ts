// The Satchel's clips (sheet 116, approved 2026-11-01 as v2.4): everything he copies, snips or drops, kept safely.
//
// His interview: every copy is kept, except password managers, money sites and anything an app marks private; kept on
// this PC, LOCKED (Windows' own encryption, pictures too, which Edge-Drop leaves open); pinned clips sit on top and stay;
// everything else clears after 7 days. Aang reads it only when he asks (later step), never on his own.
//
// Kept apart from Electron (the lock and the clock are handed in) so the rules are tested without a clipboard. Pictures
// live beside the list, one locked file each, named by their own hash, so the same picture copied twice is kept once.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from './atomic.ts';

export type ClipKind = 'text' | 'link' | 'code' | 'color' | 'pic' | 'snip' | 'file';
export interface Clip {
  id: string; kind: ClipKind; at: number; pinned: boolean;
  /** Words, a link, a colour, a command, a file's full path. Pictures carry none (their bytes are in pic). */
  text: string;
  /** A picture's file, by its hash (pics/<hash>.bin, locked). */
  pic?: string; w?: number; h?: number;
  /** Where it came from, in his words: "from Samara", "Snipit", "dragged in", "from the Mac". */
  from: string;
  /** Same content, same key: copying it again moves it to the top instead of keeping it twice. */
  key: string;
}
/** The lock: Windows' DPAPI through Electron's safeStorage in the Shell, a stand-in in tests. */
export interface Lock { on: boolean; seal(b: Buffer): Buffer; open(b: Buffer): Buffer }

export const KEEP_DAYS = 7;
export const MAX_CLIPS = 400;
export const MAX_TEXT = 100_000;
export const MAX_PIC_BYTES = 12 << 20;
const DAY = 86_400_000;

export const keyOf = (kind: ClipKind, body: string | Buffer): string => kind + ':' + createHash('sha1').update(body).digest('hex').slice(0, 24);

/** What a piece of copied text is: a link, a colour, a command, or words. */
export function kindOfText(t: string): ClipKind {
  const s = t.trim();
  if (/^https?:\/\/\S+$/i.test(s) && s.length < 2048) return 'link';
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return 'color';
  if (!s.includes('\n') && /^(?:git|npm|npx|node|pnpm|yarn|cd|ls|dir|python|py|pip|ssh|scp|curl|wget|winget|choco|ollama|docker|kubectl|gh|code|powershell|pwsh|cmd|tailscale|claude)\b\s/.test(s)) return 'code';
  return 'text';
}

export class SatchelStore {
  private clips: Clip[] = [];
  private readonly file: string;
  private readonly pics: string;
  private readonly lock: Lock;
  private readonly now: () => number;
  private n = 0;
  constructor(dir: string, lock: Lock, now: () => number = Date.now) {
    this.file = path.join(dir, 'satchel.bin'); this.pics = path.join(dir, 'satchel-pics'); this.lock = lock; this.now = now;
    try { mkdirSync(this.pics, { recursive: true }); } catch { /* the first save says so */ }
    this.load();
  }

  /** Newest first, pinned on top (his pick): what the Satchel shows. */
  list(): Clip[] {
    this.expire();
    return [...this.clips].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.at - a.at);
  }
  get(id: string): Clip | undefined { return this.clips.find((c) => c.id === id); }

  /** Keep words, a link, a colour, a command or a file path. The same thing again moves to the top. Null: nothing kept. */
  addText(raw: string, from: string, kind?: ClipKind): Clip | null {
    const text = String(raw ?? '').replace(/\r\n/g, '\n').slice(0, MAX_TEXT);
    if (!text.trim()) return null;
    const k = kind ?? kindOfText(text);
    return this.keep({ kind: k, text, from, key: keyOf(k, text.trim()) });
  }
  /** Keep a picture (PNG bytes). snip: one Snipit made. */
  addPic(png: Buffer, w: number, h: number, from: string, snip = false): Clip | null {
    if (!png?.length || png.length > MAX_PIC_BYTES) return null;
    const hash = createHash('sha1').update(png).digest('hex').slice(0, 24);
    const f = path.join(this.pics, hash + '.bin');
    if (!existsSync(f)) { try { writeFileAtomic(f, this.lock.seal(png)); } catch { return null; } }
    return this.keep({ kind: snip ? 'snip' : 'pic', text: '', pic: hash, w, h, from, key: (snip ? 'snip:' : 'pic:') + hash });
  }
  /** A picture's bytes, unlocked, for the page or a drag. */
  picBytes(c: Clip): Buffer | null {
    if (!c.pic || !/^[0-9a-f]{24}$/.test(c.pic)) return null;
    try { return this.lock.open(readFileSync(path.join(this.pics, c.pic + '.bin'))); } catch { return null; }
  }

  pin(id: string, on?: boolean): boolean { const c = this.get(id); if (!c) return false; c.pinned = on ?? !c.pinned; this.save(); return true; }
  /** Copying a clip back counts as using it: it moves to the top of today. */
  touch(id: string): void { const c = this.get(id); if (c) { c.at = this.now(); this.save(); } }
  bin(id: string): boolean {
    const i = this.clips.findIndex((c) => c.id === id); if (i < 0) return false;
    this.clips.splice(i, 1); this.save(); this.sweepPics(); return true;
  }

  private keep(c: Omit<Clip, 'id' | 'at' | 'pinned'>): Clip {
    const same = this.clips.find((x) => x.key === c.key);
    if (same) { same.at = this.now(); same.from = c.from; this.save(); return same; }
    const clip: Clip = { ...c, id: `c${this.now().toString(36)}${(this.n++).toString(36)}`, at: this.now(), pinned: false };
    this.clips.push(clip);
    // Too many: the oldest unpinned go first; pinned ones are his and stay.
    const loose = this.clips.filter((x) => !x.pinned).sort((a, b) => a.at - b.at);
    while (this.clips.length > MAX_CLIPS && loose.length) { const o = loose.shift()!; this.clips.splice(this.clips.indexOf(o), 1); }
    this.save(); this.sweepPics();
    return clip;
  }
  /** His rule: unpinned clips clear after 7 days. */
  private expire(): void {
    const cut = this.now() - KEEP_DAYS * DAY, before = this.clips.length;
    this.clips = this.clips.filter((c) => c.pinned || c.at >= cut);
    if (this.clips.length !== before) { this.save(); this.sweepPics(); }
  }
  /** Pictures no clip points at any more are deleted. */
  private sweepPics(): void {
    const want = new Set(this.clips.map((c) => c.pic).filter(Boolean));
    try { for (const f of readdirSync(this.pics)) if (f.endsWith('.bin') && !want.has(f.slice(0, -4))) rmSync(path.join(this.pics, f), { force: true }); } catch { /* next time */ }
  }
  private load(): void {
    try {
      const j = JSON.parse(this.lock.open(readFileSync(this.file)).toString('utf8')) as { clips?: unknown };
      if (Array.isArray(j.clips)) this.clips = j.clips.filter((c): c is Clip => !!c && typeof (c as Clip).id === 'string' && typeof (c as Clip).key === 'string');
    } catch { this.clips = []; }
  }
  private save(): void {
    try { writeFileAtomic(this.file, this.lock.seal(Buffer.from(JSON.stringify({ v: 1, clips: this.clips })))); } catch (e) { console.error('shell: satchel: could not save: ' + (e as Error).message); }
  }
}
