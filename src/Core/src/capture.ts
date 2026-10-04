// A thought dropped in #capture becomes a line in a note. No model, so it costs nothing.
//
// Until 2026-10-04 anything in #capture that was not a grocery command or a recipe fell through to
// Aang, and Discord traffic routes to Smart (route.ts), so writing "remember to ask about the raid
// time" spent a Sonnet turn at 23k to 46k tokens to produce a sentence of acknowledgement. His week
// sat at 72% to 88% while that was true. Decision 47, step Q3.
//
// One file per day, appended to, in the only part of the vault Aang may write to. Deliberately dumb:
// it does not parse, summarise, tag or interpret. Anything that genuinely needs thinking about he can
// ask about, and then it is his choice to spend the turn.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { VAULT_WRITABLE } from './files.ts';

/** Where a day's notes live. One file per day, so a long day does not make one enormous note. */
export function captureFile(now = new Date(), root = VAULT_WRITABLE): string {
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return path.join(root, 'Captured', `${day}.md`);
}

const time = (d: Date) => d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();

export interface Captured {
  file: string;
  /** How many notes are in today's file now, so the reply can say "that's your third today". */
  countToday: number;
}

/**
 * Append one note to today's file. Returns null if it could not be written, so the caller can fall
 * back to Aang rather than silently swallow something he wanted kept.
 */
export function capture(text: string, now = new Date(), root = VAULT_WRITABLE): Captured | null {
  const body = text.trim();
  if (!body) return null;
  const file = captureFile(now, root);
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    const fresh = !existsSync(file);
    // A heading only on a new file, so the day reads as one note rather than a pile of fragments.
    const head = fresh ? `# Captured ${now.toDateString()}\n\n` : '';
    // Bullet per note. Multi-line notes are indented under their bullet so the markdown stays valid.
    const lines = body.split('\n').map((l, i) => (i === 0 ? `- **${time(now)}** ${l}` : `  ${l}`));
    appendFileSync(file, `${head}${lines.join('\n')}\n`, 'utf8');
    const countToday = (readFileSync(file, 'utf8').match(/^- \*\*/gm) ?? []).length;
    return { file, countToday };
  } catch (e) {
    console.error('capture: could not write the note: ' + (e as Error).message);
    return null;
  }
}
