// C6 (2026-10-22): the brain's book of Claude jobs Joshua said Go to, and the lock on them.
// Design: docs/C6-PROMPT-RESEARCH.md section 3 (the doors) and 3.5 (security).
//
// The rules, all enforced here or in the mod (claude-link/hooks/register.ts):
//   - ONLY prompts the brain built from HIS own words. A card is made by core.ts from the message he typed (or said on
//     Discord, or the right-click menu); nothing read from a page, a mail, a file or a Claude reply can make one.
//   - He sees the card and presses Go. Go carries the card's hash back; it must match the card the brain made, so what
//     he approved is byte for byte what is sent. The mod checks the same hash (SHA-256 of the text) before it submits.
//   - SINGLE USE. A card is gone once Go is pressed; a start is gone once one session claims it, and it is claimed by
//     folder within two minutes (Door 1: a new session has no id yet when it asks). A second session opening in the same
//     folder in that window gets nothing.
//   - SIGNED. What the mod is handed carries HMAC(key, nonce, folder, id, 'start', body), the same lock as every other
//     item on the link (claudelink.ts), with the nonce of that very request.
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from './atomic.ts';

export const sha256Hex = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

/** How a folder is compared, on both sides of the link (the mod's normFolder is the same). */
export const normFolder = (p: string): string => String(p ?? '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();

/** A start lives this long after Go: the time to confirm the folder in Claude's own box. */
export const START_TTL_MS = 2 * 60_000;
/** A card he has not answered lives this long. */
export const CARD_TTL_MS = 10 * 60_000;
/** A resume waiting for a closed session to open lives this long. */
export const RESUME_TTL_MS = 10 * 60_000;

export type Door = 'link' | 'door2' | 'prefill';

export interface Card {
  id: string;
  /** His words, exactly as he said them. */
  words: string;
  folder: string;
  /** The whole first message, exactly as it will be sent. */
  text: string;
  hash: string;
  model: string | null;
  effort: string | null;
  /** Resume: the session it goes to (its Claude Code id), its title and app link; null for a new session. */
  resume: { session: string; title: string; open: string | null; running: boolean } | null;
  at: number;
}

export interface Start { id: string; folder: string; text: string; hash: string; model: string | null; effort: string | null; exp: number; probe?: boolean }

/** What the mod is handed: a start, signed over the folder (Door 1) or the session (resume). */
export interface StartBody { text: string; hash: string; model?: string; effort?: string }
export const startBody = (s: Pick<Start, 'text' | 'hash' | 'model' | 'effort'>): string =>
  JSON.stringify({ text: s.text, hash: s.hash, ...(s.model ? { model: s.model } : {}), ...(s.effort ? { effort: s.effort } : {}) });

const newId = () => randomBytes(12).toString('hex');

export class StartBook {
  private cards = new Map<string, Card>();
  private starts = new Map<string, Start>();
  private resumes = new Map<string, Start & { session: string }>();
  /** Every id ever handed out or spent, so nothing is ever used twice. */
  private spent = new Set<string>();
  /** Told when a session claimed a start (Door 1 worked), and when its first turn carried it (sent). */
  onClaim: (s: Start) => void = () => {};

  /** A new card, from his words. The text is fixed from here on: the hash is taken now. */
  card(c: Omit<Card, 'id' | 'hash' | 'at'>, now = Date.now()): Card {
    this.sweep(now);
    const card: Card = { ...c, id: newId(), hash: sha256Hex(c.text), at: now };
    this.cards.set(card.id, card);
    return card;
  }

  get(id: string): Card | null { return this.cards.get(id) ?? null; }

  /** He pressed Not now (or Change): the card is gone. */
  drop(id: string): void { if (this.cards.delete(id)) this.spent.add(id); }

  /**
   * He pressed Go on card `id`, which showed text with hash `hash`. Null + reason when it is not the card the brain
   * made, already used, or too old. The card is spent either way once found.
   */
  go(id: string, hash: string, now = Date.now()): { card: Card } | { error: string } {
    this.sweep(now);
    if (this.spent.has(id)) return { error: 'That card was already used.' };
    const c = this.cards.get(id);
    if (!c) return { error: 'That card is too old. Ask me again.' };
    this.cards.delete(id); this.spent.add(id);
    if (!/^[0-9a-f]{64}$/.test(hash) || hash !== c.hash || sha256Hex(c.text) !== hash) return { error: 'What you saw is not what I would send, so nothing was sent.' };
    return { card: c };
  }

  /** Door 1: a start waits for the first new session in its folder. */
  arm(c: Pick<Card, 'folder' | 'text' | 'hash' | 'model' | 'effort'>, now = Date.now(), probe = false): Start {
    const s: Start = { id: newId(), folder: normFolder(c.folder), text: c.text, hash: c.hash, model: c.model, effort: c.effort, exp: now + START_TTL_MS, ...(probe ? { probe: true } : {}) };
    // One start per folder: a newer Go replaces an older one that nobody claimed.
    for (const [k, o] of this.starts) if (o.folder === s.folder) { this.starts.delete(k); this.spent.add(k); }
    this.starts.set(s.id, s);
    return s;
  }

  /** The mod of a brand-new session in `folder` asks: the start is handed out ONCE, first come. */
  claim(folder: string, now = Date.now()): Start | null {
    this.sweep(now);
    const f = normFolder(folder);
    for (const [k, s] of this.starts) {
      if (s.folder !== f) continue;
      this.starts.delete(k); this.spent.add(k);
      try { this.onClaim(s); } catch { /* the listener's own trouble */ }
      return s;
    }
    return null;
  }

  /** Is a start still waiting (not claimed, not expired)? */
  waiting(id: string, now = Date.now()): boolean { this.sweep(now); return this.starts.has(id); }

  /** Resume into a session that is not open yet: it waits for that session's mod to poll. */
  queueFor(session: string, c: Pick<Card, 'text' | 'hash'>, now = Date.now()): Start {
    const s = { id: newId(), folder: '', text: c.text, hash: c.hash, model: null, effort: null, exp: now + RESUME_TTL_MS, session };
    this.resumes.set(session, s);
    return s;
  }

  /** That session's mod polled: its waiting resume, once. */
  takeFor(session: string, now = Date.now()): Start | null {
    this.sweep(now);
    const s = this.resumes.get(session);
    if (!s) return null;
    this.resumes.delete(session); this.spent.add(s.id);
    return s;
  }

  private sweep(now: number): void {
    for (const [k, c] of this.cards) if (now - c.at > CARD_TTL_MS) { this.cards.delete(k); this.spent.add(k); }
    for (const [k, s] of this.starts) if (now > s.exp) { this.starts.delete(k); this.spent.add(k); }
    for (const [k, s] of this.resumes) if (now > s.exp) { this.resumes.delete(k); this.spent.add(s.id); }
    if (this.spent.size > 5000) this.spent = new Set([...this.spent].slice(-2000));
  }
}

// ------------------------------------------------------------------ which door works (the probe's verdict)

export interface DoorFile { door: Door; at: number; door2Args?: { folder: string; prompt: string } ; note?: string }
export const doorFile = (stateDir: string) => path.join(stateDir, 'c6-door.json');

/** Which door the probe proved. Until it has run: the old prefilled link, labelled honestly. */
export function readDoor(stateDir: string): DoorFile {
  try {
    const f = doorFile(stateDir);
    if (!existsSync(f)) return { door: 'prefill', at: 0 };
    const j = JSON.parse(readFileSync(f, 'utf8'));
    const door: Door = j?.door === 'link' || j?.door === 'door2' ? j.door : 'prefill';
    const a = j?.door2Args;
    const door2Args = a && typeof a.folder === 'string' && typeof a.prompt === 'string' && /^\w{1,40}$/.test(a.folder) && /^\w{1,40}$/.test(a.prompt) ? { folder: a.folder, prompt: a.prompt } : undefined;
    return { door, at: Number(j?.at) || 0, ...(door2Args ? { door2Args } : {}), ...(typeof j?.note === 'string' ? { note: j.note.slice(0, 300) } : {}) };
  } catch { return { door: 'prefill', at: 0 }; }
}

export function writeDoor(stateDir: string, d: DoorFile): void {
  writeFileAtomic(doorFile(stateDir), JSON.stringify(d, null, 2));
}

/** The probe's own message: fixed here, never taken from a request, so the probe door cannot carry anyone's words. */
export const PROBE_TEXT = 'Aang C6 probe: reply with only the word PONG. Do nothing else.';
