// Catching up on what happened last time.
//
// The plan called for this to run nightly. It cannot: this is a Shadow cloud PC with a four-hour session
// limit that shut down four times on 2026-09-20, so there is no night to run in. It runs at the start of
// the next session instead, which is strictly better here - it cannot be cut off half way, and it costs
// nothing while Joshua is gaming.
//
// It is the only part of memory that spends anything: roughly 3k tokens in and 300 out on the cheapest
// model, once per session. It is skipped entirely when the week is already over 40%, which is the rule
// Joshua set. Measured technique: reprocessing context offline is worth about +18% accuracy at ~2.5x
// lower cost per query (arXiv 2504.13171).

import type { Memory } from './memory.ts';

/** Turns to look back over. Enough for a session, small enough to stay a rounding error. */
export const MAX_TURNS = 60;
export const MAX_CHARS = 12_000;
/** Joshua's rule: nothing optional runs once the week is this far gone. */
export const QUOTA_CEILING = 0.40;

export const PROMPT = [
  'Read this conversation between Joshua and Aang and write down what is worth knowing next week.',
  '',
  'Keep only durable things about Joshua: his projects, the people around him, his preferences, decisions',
  'he made, how he likes things done, what he is working towards. One short plain sentence each, written',
  'about him in the third person, understandable on its own a month from now.',
  '',
  'Leave out: anything about Aang or about how Joshua uses him, observations about his habits with the',
  'assistant, his file paths and machine setup, questions he asked, the weather, the time, and anything',
  'that will not still be true next week. If in doubt, leave it out: a wrong or pointless thing kept is',
  'worse than a right one missed, because he will be told it later as if it mattered.',
  '',
  'Answer with a JSON array of strings and nothing else. If there is nothing worth keeping, answer [].',
].join('\n');

export interface ConsolidateResult {
  /** Why it did not run, or null if it did. */
  skipped: string | null;
  considered: number;
  kept: string[];
  replaced: string[];
}

/** Pull the JSON array out of a model reply, tolerating a stray sentence around it. */
export function parseFacts(reply: string): string[] {
  const text = (reply ?? '').trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  try {
    const raw = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(x => typeof x === 'string')
      .map(x => x.trim().replace(/\s+/g, ' '))
      .filter(x => x.length > 8 && x.length <= 300)
      .slice(0, 20);
  } catch { return []; }
}

/**
 * Read what has happened since the last catch-up and keep what matters.
 * `ask` is the model call; it is passed in so this can be tested without one.
 */
export async function consolidate(
  memory: Memory,
  ask: (prompt: string) => Promise<string>,
  opts: { weekUsed?: number; now?: Date } = {},
): Promise<ConsolidateResult> {
  const out: ConsolidateResult = { skipped: null, considered: 0, kept: [], replaced: [] };
  if (!memory.available) return { ...out, skipped: 'no memory database' };
  if ((opts.weekUsed ?? 0) >= QUOTA_CEILING) return { ...out, skipped: `week already at ${Math.round((opts.weekUsed ?? 0) * 100)}%` };

  const since = Number(memory.getMeta('last_consolidated_turn') ?? 0);
  const turns = memory.turnsAfter(since, MAX_TURNS);
  if (!turns.length) return { ...out, skipped: 'nothing new since last time' };
  out.considered = turns.length;

  let transcript = '';
  for (const t of turns) {
    const line = `${t.role === 'user' ? 'Joshua' : 'Aang'}: ${t.text}\n`;
    if (transcript.length + line.length > MAX_CHARS) break;
    transcript += line;
  }

  const reply = await ask(`${PROMPT}\n\n<conversation>\n${transcript}</conversation>`);
  for (const fact of parseFacts(reply)) {
    const { fact: saved, replaced } = memory.remember(fact, 'consolidate', opts.now);
    if (saved) out.kept.push(saved.text);
    if (replaced) out.replaced.push(replaced.text);
  }
  // Move the marker even when nothing was kept, so a quiet session is not re-read every time.
  memory.setMeta('last_consolidated_turn', String(turns[turns.length - 1]!.id));
  return out;
}
